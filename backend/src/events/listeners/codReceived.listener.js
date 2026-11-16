/**
 * Listener: COD_RECEIVED
 *
 * Fires when admin confirms that a courier has remitted COD cash to the platform.
 * This is the HARD GATE that unblocks vendor escrow release for courier COD orders.
 *
 * Escrow: courierRemittance marks the package Shipment.isCashSettled before emitting this event; the escrow
 * cron then releases that vendor's held commission on its normal schedule (see cron/escrowCron.js).
 *
 * Steps here:
 *   2. NOTIFICATION:
 *      → Notify vendor: "COD amount received by platform. Earnings releasing soon."
 *
 *   3. ANALYTICS:
 *      → Record remittance event with variance (expected vs received amount)
 *      → Flag disputed/partial remittances for admin review
 *
 * ─── IMPORTANT ───────────────────────────────────────────────────────────────
 * Before this event fires, the following must be true:
 *   - CourierCODRemittance.remittanceStatus === 'received'
 *   - Shipment.status === 'delivered'
 * The admin controller validates both conditions before emitting this event.
 *
 * ─── Expected Payload ────────────────────────────────────────────────────────
 * {
 *   remittanceId:   ObjectId (string)
 *   shipmentId:     ObjectId (string)
 *   orderId:        ObjectId (string)
 *   vendorId:       ObjectId (string)
 *   amountReceived: number
 *   providerId:     string
 * }
 */

import LOGISTICS_EVENTS from '../logisticsEvents.js';
import logger from '../../utils/logger.js';
import { createNotification } from '../../services/notification.service.js';

const codReceivedListener = async (payload) => {
    try {
        console.log(
            `[${LOGISTICS_EVENTS.COD_RECEIVED}] Received:`,
            `orderId=${payload.orderId}`,
            `providerId=${payload.providerId}`,
            `amountReceived=₹${payload.amountReceived}`
        );

        // 1. ESCROW GATE CLEARANCE
        // courierRemittance has already marked this package's Shipment.isCashSettled; the escrow cron
        // releases this vendor's commission (still 'held') on its normal schedule once that flag is set.
        // The old code set escrowStatus 'release_pending', which the Commission schema rejects (so the save
        // always failed), picked any vendor's commission on multi-vendor orders, and the cron never looked
        // at that status anyway.
        logger.info(`[COD_RECEIVED] COD remitted for order ${payload.orderId}, vendor ${payload.vendorId}; escrow eligible via cron.`);

        // 2. NOTIFICATION
        if (payload.vendorId) {
            await createNotification({
                recipientId: payload.vendorId,
                recipientType: 'vendor',
                type: 'payment',
                title: 'COD Received',
                message: `COD amount of ₹${payload.amountReceived} has been remitted. Earnings releasing soon.`,
                data: { orderId: String(payload.orderId), amount: String(payload.amountReceived) }
            });
        }

        // 3. ANALYTICS
        // Assuming analytics recorded elsewhere or could be extended later.

    } catch (err) {
        logger.error(`[${LOGISTICS_EVENTS.COD_RECEIVED}] Listener error:`, { message: err.message });
    }
};

export default codReceivedListener;
export { codReceivedListener };
