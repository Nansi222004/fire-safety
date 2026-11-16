/**
 * Listener: SHIPMENT_DELIVERED
 *
 * Most critical listener in the system. Fires when a shipment is confirmed delivered.
 *
 * ─── Phase 3 (Current) ───────────────────────────────────────────────────────
 * STUB: Logs event receipt. Full logic is wired in Phase 5.
 *
 * ─── Phase 5 Business Logic (to implement) ───────────────────────────────────
 *   1. OWN FLEET PAYOUT:
 *      if (payload.providerId === 'own_fleet') {
 *        → payoutCalculator.calculatePayout(distance, vehicleType, deliveredAt)
 *        → Credit DeliveryWalletTransaction (delivery earning)
 *        → Set Shipment.actualDeliveryCost = payoutAmount
 *        → Set Shipment.shippingProfit = customerShippingCharge - actualDeliveryCost
 *        → Emit DRIVER_PAYOUT_PROCESSED
 *      }
 *
 *   2. ESCROW UNLOCK:
 *      → Find Commission for orderId
 *      → Set Commission.escrowStatus = 'release_pending'
 *      → Set Shipment.escrowReleaseDate = deliveredAt + configured return window
 *      (Cron handles actual wallet credit; this listener makes it eligible)
 *
 *   3. NOTIFICATIONS:
 *      → Notify customer: "Your order has been delivered!"
 *      → Notify vendor with the payout eligibility date
 *
 * ─── Expected Payload ────────────────────────────────────────────────────────
 * {
 *   shipmentId:    ObjectId (string)
 *   orderId:       ObjectId (string)
 *   vendorId:      ObjectId (string)
 *   deliveredAt:   ISO date string
 *   providerId:    string
 *   paymentMethod: string ('cod' | 'online' | 'wallet')
 * }
 */

import mongoose from 'mongoose';
import Shipment from '../../models/Shipment.model.js';
import LOGISTICS_EVENTS from '../logisticsEvents.js';
import LogisticsEventBus from '../logisticsEventBus.js';
import { processShipmentPayout } from '../../services/deliveryPayout.service.js';
import logger from '../../utils/logger.js';

const shipmentDeliveredListener = async (payload) => {
    try {
        console.log(
            `[${LOGISTICS_EVENTS.SHIPMENT_DELIVERED}] Received:`,
            `orderId=${payload.orderId}`,
            `providerId=${payload.providerId}`,
            `deliveredAt=${payload.deliveredAt}`,
            `paymentMethod=${payload.paymentMethod}`
        );

        // Phase 5.4: Own Fleet — compute payout via payoutCalculator, credit wallet
        if (payload.providerId === 'own_fleet') {
            const session = await mongoose.startSession();
            try {
                await session.withTransaction(async () => {
                    await processShipmentPayout(payload.shipmentId, session);
                });
                console.log(`[SHIPMENT_DELIVERED] Payout processed successfully for shipment ${payload.shipmentId}`);
                
                // Emit DRIVER_PAYOUT_PROCESSED for future hooks
                LogisticsEventBus.emitEvent(LOGISTICS_EVENTS.DRIVER_PAYOUT_PROCESSED, {
                    shipmentId: payload.shipmentId,
                    orderId: payload.orderId,
                    vendorId: payload.vendorId,
                    providerId: payload.providerId,
                    deliveredAt: payload.deliveredAt
                });
            } catch (payoutErr) {
                console.error(`[SHIPMENT_DELIVERED] Payout failed for shipment ${payload.shipmentId}:`, payoutErr.message);
                
                // Persist the failure to the Shipment document for retry later
                await Shipment.updateOne(
                    { _id: payload.shipmentId },
                    { 
                        $set: { 
                            payoutStatus: 'failed', 
                            payoutError: payoutErr.message 
                        } 
                    }
                ).catch(dbErr => {
                    console.error(`[SHIPMENT_DELIVERED] Failed to persist payout error to DB:`, dbErr.message);
                });
            } finally {
                await session.endSession();
            }
        }

        // 2. ESCROW START for the delivered package (rider OTP, Shiprocket and Delhivery all arrive here).
        // Marks this vendor's package delivered in the Order, sets the commission's release date and credits
        // on-hold exactly once. The old block wrote escrowStatus 'release_pending' (rejected by the Commission
        // schema, which threw and also skipped the notifications below) on an arbitrary vendor's commission, and
        // nothing marked the package delivered, so the escrow cron never paid these vendors.
        const deliveredShipment = payload.shipmentId
            ? await Shipment.findById(payload.shipmentId).select('orderId vendorId type deliveredAt').lean()
            : null;
        let escrowReleaseDate = null;
        if (deliveredShipment && (!deliveredShipment.type || deliveredShipment.type === 'forward')) {
            const { markVendorPackageDelivered } = await import('../../services/orderFinancialHelper.js');
            // Release date = delivery + Admin-configured return window (approved rule 3), same value as the commission.
            ({ escrowReleaseDate } = await markVendorPackageDelivered(deliveredShipment.orderId, deliveredShipment.vendorId, {
                deliveredAt: deliveredShipment.deliveredAt || payload.deliveredAt || new Date(),
            }));
            if (escrowReleaseDate) {
                await Shipment.updateOne({ _id: deliveredShipment._id }, { $set: { escrowReleaseDate } });
            }
        }

        // 3. NOTIFICATIONS
        const Order = (await import('../../models/Order.model.js')).default;
        const { createNotification } = await import('../../services/notification.service.js');
        const order = await Order.findById(payload.orderId);
        if (!order) return;

        const orderHumanId = String(order.orderId || order._id);
        const orderMongoId = String(order._id);

        if (order.userId) {
            await createNotification({
                recipientId: order.userId,
                recipientType: 'user',
                type: 'order',
                title: 'Order Delivered',
                message: `Your order #${orderHumanId} has been delivered!`,
                eventKey: `order:${orderHumanId}:status:delivered:user`,
                data: {
                    orderId: orderHumanId,
                    orderMongoId: orderMongoId,
                    status: 'delivered',
                    deepLink: `/orders/${orderHumanId}`,
                }
            });
        }
        if (payload.vendorId) {
            await createNotification({
                recipientId: payload.vendorId,
                recipientType: 'vendor',
                type: 'order',
                title: 'Order Delivered',
                message: escrowReleaseDate
                    ? `Order #${orderHumanId} delivered. Earnings become eligible for release on ${escrowReleaseDate.toISOString().slice(0, 10)}, after the return window.`
                    : `Order #${orderHumanId} delivered. Earnings will be released after the return window.`,
                eventKey: `order:${orderHumanId}:status:delivered:vendor:${payload.vendorId}`,
                data: {
                    orderId: orderHumanId,
                    orderMongoId: orderMongoId,
                    status: 'delivered',
                    deepLink: `/vendor/orders/${orderHumanId}`,
                }
            });
        }

    } catch (err) {
        // CRITICAL: Never propagate — delivery confirmation must succeed even if this listener fails.
        logger.error(`[${LOGISTICS_EVENTS.SHIPMENT_DELIVERED}] Listener error:`, { message: err.message });
    }
};

export default shipmentDeliveredListener;
export { shipmentDeliveredListener };
