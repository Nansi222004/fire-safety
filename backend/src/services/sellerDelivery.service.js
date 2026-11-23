import mongoose from 'mongoose';
import Order from '../models/Order.model.js';
import Shipment from '../models/Shipment.model.js';
import ApiError from '../utils/ApiError.js';
import LogisticsEventBus from '../events/logisticsEventBus.js';
import LOGISTICS_EVENTS from '../events/logisticsEvents.js';
import { createNotification } from './notification.service.js';
import { notifyOrderUpdate } from './socket.service.js';
import {
    ensureDeliveryOtpForShipment,
    verifyDeliveryOtpForShipment,
    DELIVERY_OTP_RESEND_COOLDOWN_MS,
    DELIVERABLE_SHIPMENT_STATUSES,
} from './deliveryOtp.service.js';
import { isCodPaymentMethod, DELIVERY_METHODS, SELLER_DELIVERY_PROVIDER } from './deliveryRouting.service.js';
import { deriveTopLevelOrderStatus } from '../utils/orderStatus.js';

/**
 * Seller Delivery — the seller ships through a courier it arranges itself.
 *
 *   ready_for_pickup ──ship (courier + tracking)──▶ shipped ──send OTP──▶ out_for_delivery ──customer OTP──▶ delivered
 *
 * Never touches rider assignment, rider payout, rider COD cash, Shiprocket or courier COD remittance.
 * Delivery reuses SHIPMENT_DELIVERED, so seller earnings enter the normal escrow/return-window hold.
 */

/** Seller Delivery OTP lifetime: generated close to the doorstep, so a short window. */
export const SELLER_DELIVERY_OTP_TTL_MS = 10 * 60 * 1000;

const SELLER_SHIPMENT_FILTER = { deliveryMethod: DELIVERY_METHODS.SELLER_DELIVERY, providerId: SELLER_DELIVERY_PROVIDER };
const TRACKING_FIELDS = ['courierName', 'trackingNumber', 'trackingUrl', 'deliveryPersonName', 'deliveryPersonPhone'];
const CUSTOMER_VISIBLE_TRACKING_FIELDS = ['courierName', 'trackingNumber', 'trackingUrl'];
const OTP_SELECT = '+deliveryOtpHash +deliveryOtpExpiry +deliveryOtpSentAt +deliveryOtpAttempts';

const orderLookup = (orderRef) => {
    const ref = String(orderRef || '').trim();
    const or = [{ orderId: ref }];
    if (mongoose.Types.ObjectId.isValid(ref)) or.push({ _id: ref });
    return { $or: or };
};

const COD_BLOCKED_MESSAGE = 'Seller Delivery is not available for Cash on Delivery orders.';

/**
 * Loads the order + shipment for a vendor. 404 for anything the vendor does not own (never reveals that the
 * shipment exists); 409 when the vendor's shipment is not a Seller Delivery shipment or is a COD order.
 */
export const findOwnedSellerShipment = async ({ orderRef, shipmentId, vendorId, select = '' }) => {
    if (!mongoose.Types.ObjectId.isValid(shipmentId)) throw new ApiError(404, 'Shipment not found.');
    const order = await Order.findOne({ ...orderLookup(orderRef), 'vendorItems.vendorId': vendorId, isDeleted: { $ne: true } });
    if (!order) throw new ApiError(404, 'Order not found.');
    let query = Shipment.findOne({ _id: shipmentId, orderId: order._id, vendorId });
    if (select) query = query.select(select);
    const shipment = await query;
    if (!shipment) throw new ApiError(404, 'Shipment not found.');
    if (shipment.deliveryMethod !== DELIVERY_METHODS.SELLER_DELIVERY || shipment.providerId !== SELLER_DELIVERY_PROVIDER) {
        throw new ApiError(409, 'This shipment does not use Seller Delivery.');
    }
    if (isCodPaymentMethod(order.paymentMethod)) throw new ApiError(409, COD_BLOCKED_MESSAGE);
    return { order, shipment };
};

const cleanTrackingInput = (input = {}) => {
    const out = {};
    for (const field of TRACKING_FIELDS) {
        if (input[field] === undefined) continue;
        out[field] = typeof input[field] === 'string' ? input[field].trim() : input[field];
    }
    return out;
};

const setVendorPackageStatus = async (orderId, vendorId, fromStatuses, toStatus) => {
    const order = await Order.findById(orderId);
    if (!order) return null;
    let changed = false;
    order.vendorItems = order.vendorItems.map((vi) => {
        if (String(vi.vendorId) === String(vendorId) && fromStatuses.includes(vi.status)) {
            changed = true;
            return { ...vi.toObject(), status: toStatus };
        }
        return vi;
    });
    if (changed) {
        order.status = deriveTopLevelOrderStatus(order.vendorItems, order.status);
        await order.save();
    }
    return order;
};

const notifyCustomer = (order, { title, message, eventKey, status, shipmentId }) => {
    if (!order?.userId) return Promise.resolve();
    const orderHumanId = String(order.orderId || order._id);
    return createNotification({
        recipientId: order.userId,
        recipientType: 'user',
        title,
        message,
        type: 'order',
        eventKey,
        data: { orderId: orderHumanId, orderMongoId: String(order._id), shipmentId: String(shipmentId), status, deepLink: `/orders/${orderHumanId}` },
    }).catch((err) => console.warn(`[Seller Delivery] customer notification failed: ${err.message}`));
};

// ─── Ship ────────────────────────────────────────────────────────────────────

export const shipSellerDelivery = async ({ orderRef, shipmentId, vendorId, input }) => {
    const { order, shipment } = await findOwnedSellerShipment({ orderRef, shipmentId, vendorId });
    const details = cleanTrackingInput(input);
    if (!details.courierName || !details.trackingNumber) {
        throw new ApiError(400, 'Courier name and tracking number are required.');
    }
    const now = new Date();
    const sellerDelivery = {
        courierName: details.courierName,
        trackingNumber: details.trackingNumber,
        ...(details.trackingUrl ? { trackingUrl: details.trackingUrl } : {}),
        ...(details.deliveryPersonName ? { deliveryPersonName: details.deliveryPersonName } : {}),
        ...(details.deliveryPersonPhone ? { deliveryPersonPhone: details.deliveryPersonPhone } : {}),
        shippedAt: now,
        shippedBy: vendorId,
        lastUpdatedAt: now,
        trackingUpdates: [],
    };

    // Atomic: only the first request moves ready_for_pickup → shipped.
    const updated = await Shipment.findOneAndUpdate(
        { _id: shipment._id, vendorId, ...SELLER_SHIPMENT_FILTER, status: 'ready_for_pickup' },
        {
            $set: { status: 'shipped', sellerDelivery },
            $push: {
                statusHistory: {
                    status: 'shipped', updatedAt: now, updatedBy: 'vendor',
                    notes: `Shipped by seller via ${details.courierName} (tracking ${details.trackingNumber}).`,
                },
            },
        },
        { new: true, runValidators: true }
    );
    if (!updated) {
        const current = await Shipment.findById(shipment._id).select('status').lean();
        if (['shipped', 'out_for_delivery', 'delivered'].includes(current?.status)) {
            throw new ApiError(409, 'This package has already been shipped. Use "Update tracking" to change courier details.');
        }
        throw new ApiError(409, 'Mark the order "Ready for pickup" before entering courier details and shipping it.');
    }

    const savedOrder = await setVendorPackageStatus(order._id, vendorId, ['ready_for_pickup', 'processing'], 'shipped') || order;
    notifyOrderUpdate(savedOrder);
    const orderHumanId = String(order.orderId || order._id);
    await notifyCustomer(savedOrder, {
        title: 'Your package has been shipped',
        message: `Your package from order ${orderHumanId} was shipped by the seller via ${details.courierName}. Tracking number: ${details.trackingNumber}.`,
        eventKey: `order:${orderHumanId}:shipment:${shipment._id}:seller_shipped:user`,
        status: 'shipped',
        shipmentId: shipment._id,
    });
    return updated;
};

// ─── Update tracking ─────────────────────────────────────────────────────────

export const updateSellerDeliveryTracking = async ({ orderRef, shipmentId, vendorId, input }) => {
    const { order, shipment } = await findOwnedSellerShipment({ orderRef, shipmentId, vendorId });
    if (!DELIVERABLE_SHIPMENT_STATUSES.includes(shipment.status)) {
        throw new ApiError(409, `Tracking details can only be changed while the package is in transit (current status: ${shipment.status.replace(/_/g, ' ')}).`);
    }
    const details = cleanTrackingInput(input);
    const current = shipment.sellerDelivery || {};
    const now = new Date();
    const $set = {};
    const $unset = {};
    const updates = [];
    for (const [field, value] of Object.entries(details)) {
        const oldValue = current[field] || '';
        const newValue = value || '';
        if (oldValue === newValue) continue;
        if ((field === 'courierName' || field === 'trackingNumber') && !newValue) {
            throw new ApiError(400, `${field === 'courierName' ? 'Courier name' : 'Tracking number'} cannot be removed.`);
        }
        if (newValue) $set[`sellerDelivery.${field}`] = newValue;
        else $unset[`sellerDelivery.${field}`] = '';
        updates.push({ field, oldValue, newValue, at: now, byRole: 'vendor', byId: vendorId });
    }
    if (!updates.length) return { shipment, changed: false };

    $set['sellerDelivery.lastUpdatedAt'] = now;
    const updated = await Shipment.findOneAndUpdate(
        { _id: shipment._id, vendorId, ...SELLER_SHIPMENT_FILTER, status: { $in: DELIVERABLE_SHIPMENT_STATUSES } },
        {
            $set,
            ...(Object.keys($unset).length ? { $unset } : {}),
            $push: {
                'sellerDelivery.trackingUpdates': { $each: updates },
                statusHistory: {
                    status: shipment.status, updatedAt: now, updatedBy: 'vendor',
                    notes: `Seller updated ${updates.map((u) => u.field).join(', ')}.`,
                },
            },
        },
        { new: true, runValidators: true }
    );
    if (!updated) throw new ApiError(409, 'This package is no longer in transit. Tracking details can no longer be changed.');

    if (updates.some((u) => CUSTOMER_VISIBLE_TRACKING_FIELDS.includes(u.field))) {
        const orderHumanId = String(order.orderId || order._id);
        const sd = updated.sellerDelivery || {};
        await notifyCustomer(order, {
            title: 'Tracking details updated',
            message: `Tracking for your package from order ${orderHumanId} was updated: ${sd.courierName}, tracking number ${sd.trackingNumber}.`,
            eventKey: `order:${orderHumanId}:shipment:${shipment._id}:tracking_updated:${now.getTime()}:user`,
            status: updated.status,
            shipmentId: shipment._id,
        });
    }
    notifyOrderUpdate(order);
    return { shipment: updated, changed: true };
};

// ─── Send / regenerate the customer's delivery OTP ───────────────────────────

export const sendSellerDeliveryOtp = async ({ orderRef, shipmentId, vendorId }) => {
    const { order, shipment } = await findOwnedSellerShipment({ orderRef, shipmentId, vendorId, select: OTP_SELECT });
    if (!DELIVERABLE_SHIPMENT_STATUSES.includes(shipment.status)) {
        throw new ApiError(409, 'A delivery OTP can only be sent while the package is shipped or out for delivery.');
    }
    if (!order.userId) {
        throw new ApiError(409, 'This order has no customer account, so the customer cannot view a delivery OTP. Contact Admin to confirm delivery.');
    }
    const now = new Date();
    const cooldownStart = new Date(now.getTime() - DELIVERY_OTP_RESEND_COOLDOWN_MS);
    // Atomic cooldown claim: concurrent clicks cannot generate two codes inside the cooldown window.
    const claimed = await Shipment.findOneAndUpdate(
        {
            _id: shipment._id, vendorId, ...SELLER_SHIPMENT_FILTER,
            status: { $in: DELIVERABLE_SHIPMENT_STATUSES },
            $or: [{ deliveryOtpSentAt: { $exists: false } }, { deliveryOtpSentAt: null }, { deliveryOtpSentAt: { $lte: cooldownStart } }],
        },
        { $set: { deliveryOtpSentAt: now } },
        { new: true }
    );
    if (!claimed) {
        const fresh = await Shipment.findById(shipment._id).select('status deliveryOtpSentAt').lean();
        if (!DELIVERABLE_SHIPMENT_STATUSES.includes(fresh?.status)) {
            throw new ApiError(409, 'A delivery OTP can only be sent while the package is shipped or out for delivery.');
        }
        const waitSeconds = Math.max(1, Math.ceil((new Date(fresh.deliveryOtpSentAt).getTime() + DELIVERY_OTP_RESEND_COOLDOWN_MS - now.getTime()) / 1000));
        throw new ApiError(429, `Please wait ${waitSeconds} seconds before sending another delivery OTP.`);
    }

    const movingOut = shipment.status === 'shipped';
    await ensureDeliveryOtpForShipment(claimed, order, {
        forceRegenerate: true,
        setOutForDelivery: true,
        ttlMs: SELLER_DELIVERY_OTP_TTL_MS,
        codeOnTrackingPageOnly: true,
    });
    if (movingOut) {
        await Shipment.updateOne({ _id: shipment._id }, {
            $push: { statusHistory: { status: 'out_for_delivery', updatedAt: now, updatedBy: 'vendor', notes: 'Seller marked the package out for delivery and sent the customer delivery OTP.' } },
        });
    }
    notifyOrderUpdate(order);
    const result = await Shipment.findById(shipment._id);
    // The OTP itself is never returned to the seller — only the customer can see it.
    return { shipment: result, otpSentAt: now, expiresInSeconds: SELLER_DELIVERY_OTP_TTL_MS / 1000 };
};

// ─── Confirm delivery ────────────────────────────────────────────────────────

const emitDelivered = (shipment, order) => {
    LogisticsEventBus.emit(LOGISTICS_EVENTS.SHIPMENT_DELIVERED, {
        shipmentId: shipment._id,
        orderId: order._id,
        vendorId: shipment.vendorId,
        deliveredAt: shipment.deliveredAt || new Date(),
        providerId: SELLER_DELIVERY_PROVIDER,
        paymentMethod: order.paymentMethod,
    });
};

export const confirmSellerDelivery = async ({ orderRef, shipmentId, vendorId, otp }) => {
    const { order, shipment } = await findOwnedSellerShipment({ orderRef, shipmentId, vendorId, select: OTP_SELECT });
    if (shipment.status === 'delivered') throw new ApiError(409, 'This package has already been delivered.');
    if (!DELIVERABLE_SHIPMENT_STATUSES.includes(shipment.status)) {
        throw new ApiError(409, `Delivery can only be confirmed while the package is in transit (current status: ${shipment.status.replace(/_/g, ' ')}).`);
    }
    // Atomic verify + delivered transition (409 for a concurrent / repeated confirmation).
    const { shipment: delivered } = await verifyDeliveryOtpForShipment(shipment, otp, {
        method: 'CUSTOMER_OTP', confirmedByRole: 'vendor', confirmedById: vendorId, updatedBy: 'vendor',
    });
    // Exactly one request reaches here per shipment: starts escrow (listener) and notifies customer + vendor.
    emitDelivered(delivered, order);
    notifyOrderUpdate(order);
    return delivered;
};

// ─── Admin override ──────────────────────────────────────────────────────────

/**
 * Admin marks a Seller Delivery shipment delivered when the customer's OTP cannot be used. Mandatory reason
 * and proof reference; recorded on the shipment and (by the route) in the audit log.
 */
export const adminConfirmSellerDelivery = async ({ orderRef, shipmentId, adminId, reason, proofReference }) => {
    if (!mongoose.Types.ObjectId.isValid(shipmentId)) throw new ApiError(404, 'Shipment not found.');
    const order = await Order.findOne({ ...orderLookup(orderRef), isDeleted: { $ne: true } });
    if (!order) throw new ApiError(404, 'Order not found.');
    const shipment = await Shipment.findOne({ _id: shipmentId, orderId: order._id });
    if (!shipment) throw new ApiError(404, 'Shipment not found.');
    if (shipment.deliveryMethod !== DELIVERY_METHODS.SELLER_DELIVERY || shipment.providerId !== SELLER_DELIVERY_PROVIDER) {
        throw new ApiError(409, 'Delivery override is only available for Seller Delivery shipments.');
    }
    if (isCodPaymentMethod(order.paymentMethod)) throw new ApiError(409, COD_BLOCKED_MESSAGE);
    if (shipment.status === 'delivered') throw new ApiError(409, 'This package has already been delivered.');

    const now = new Date();
    const updated = await Shipment.findOneAndUpdate(
        { _id: shipment._id, ...SELLER_SHIPMENT_FILTER, status: { $in: DELIVERABLE_SHIPMENT_STATUSES } },
        {
            $set: {
                status: 'delivered',
                deliveredAt: now,
                deliveryConfirmation: { method: 'ADMIN_OVERRIDE', confirmedAt: now, confirmedByRole: 'admin', confirmedById: adminId, reason, proofReference },
            },
            $unset: { deliveryOtpHash: '', deliveryOtpExpiry: '', deliveryOtpSentAt: '', deliveryOtpAttempts: 0, deliveryOtpDebug: '' },
            $push: { statusHistory: { status: 'delivered', updatedAt: now, updatedBy: 'admin', notes: `Admin delivery override. Reason: ${reason}. Proof: ${proofReference}.` } },
        },
        { new: true }
    );
    if (!updated) {
        throw new ApiError(409, `Delivery can only be confirmed while the package is in transit (current status: ${shipment.status.replace(/_/g, ' ')}).`);
    }
    emitDelivered(updated, order);
    notifyOrderUpdate(order);
    return updated;
};
