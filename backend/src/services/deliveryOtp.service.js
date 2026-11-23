import Shipment from '../models/Shipment.model.js';
import Order from '../models/Order.model.js';
import ApiError from '../utils/ApiError.js';
import { sendEmail } from './email.service.js';
import { createNotification } from './notification.service.js';
import { notifyOrderUpdate } from './socket.service.js';
import { emailCodeBox } from './emailLayout.js';
import { hashOtp, verifyOtpHash, generateDeliveryOtpValue } from './otp.service.js';
import { isOtpDebugEnabled } from '../config/otpConfig.js';

const IS_PRODUCTION = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
export const DELIVERY_OTP_TTL_MS = IS_PRODUCTION ? 10 * 60 * 1000 : 24 * 60 * 60 * 1000;
export const DELIVERY_OTP_MAX_ATTEMPTS = 5;
export const DELIVERY_OTP_RESEND_COOLDOWN_MS = 60 * 1000;

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Extracts customer email from Order
 * @param {Object} order
 * @returns {string}
 */
export const getCustomerEmail = (order) => {
    return (
        String(order?.shippingAddress?.email || '').trim().toLowerCase() ||
        String(order?.guestInfo?.email || '').trim().toLowerCase()
    );
};

/**
 * Sends Delivery OTP email to the customer
 * @param {Object} order
 * @param {string} otp
 * @returns {Promise<boolean>}
 */
export const sendDeliveryOtpEmail = async (order, otp) => {
    const to = getCustomerEmail(order);
    if (!to) return false;

    try {
        await sendEmail({
            to,
            subject: `Delivery OTP for order ${order.orderId || order._id}`,
            text: `Your delivery verification OTP is ${otp}. Share it with the delivery partner only after receiving your order. It expires in 10 minutes.`,
            html: `<h1 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#1F2937;">Your order is out for delivery</h1><p style="margin:0;color:#64748B;">Order <strong style="color:#1F2937;">${order.orderId || order._id}</strong></p>${emailCodeBox(otp, 'Delivery verification OTP')}<p style="margin:0;">Share this OTP with the delivery partner <strong>only after you have received your order</strong>. It expires in 10 minutes.</p>`,
        });
        return true;
    } catch (err) {
        console.warn(`[Delivery OTP] Failed to send OTP email for order ${order.orderId || order._id}: ${err.message}`);
        return false;
    }
};

/**
 * Idempotently ensures a customer delivery OTP is generated, hashed, and persisted
 * for the specified Shipment.
 *
 * Multi-Vendor Isolation:
 *   Only updates the passed Shipment document. Never modifies other shipments in the order.
 *
 * Idempotency:
 *   If a valid (unexpired) deliveryOtpHash already exists on the shipment, it is preserved
 *   unless options.forceRegenerate is true.
 *
 * @param {Object|string} shipmentOrId - Shipment document or ObjectId
 * @param {Object|string} orderOrId    - Order document or ObjectId
 * @param {Object}        [options]
 * @param {boolean}       [options.forceRegenerate=false]
 * @param {boolean}       [options.setOutForDelivery=false]
 * @returns {Promise<{ shipment: Object, isNew: boolean, generatedOtp?: string }>}
 */
export const ensureDeliveryOtpForShipment = async (shipmentOrId, orderOrId, options = {}) => {
    const shipmentId = shipmentOrId?._id || shipmentOrId;
    const shipment = await Shipment.findById(shipmentId).select(
        '+deliveryOtpHash +deliveryOtpExpiry +deliveryOtpSentAt +deliveryOtpAttempts +deliveryOtpDebug'
    );
    if (!shipment) throw new ApiError(404, 'Shipment not found.');

    let order = orderOrId;
    if (!order || !order.orderId) {
        order = await Order.findById(shipment.orderId);
    }
    if (!order) throw new ApiError(404, 'Order not found for shipment.');

    const now = new Date();
    const hasValidOtp =
        shipment.deliveryOtpHash &&
        shipment.deliveryOtpExpiry &&
        new Date(shipment.deliveryOtpExpiry) > now;

    if (hasValidOtp && !options.forceRegenerate) {
        // Idempotent return: valid OTP already exists
        return {
            shipment,
            isNew: false,
            generatedOtp: isOtpDebugEnabled() ? shipment.deliveryOtpDebug : undefined,
        };
    }

    // Generate new OTP using the centralized generator
    const generatedOtp = generateDeliveryOtpValue();
    const otpHash = hashOtp(generatedOtp);
    const otpExpiry = new Date(Date.now() + (Number(options.ttlMs) > 0 ? Number(options.ttlMs) : DELIVERY_OTP_TTL_MS));

    const updateFields = {
        deliveryOtpHash:     otpHash,
        deliveryOtpExpiry:   otpExpiry,
        deliveryOtpSentAt:   now,
        deliveryOtpAttempts: 0,
        deliveryOtpVerifiedAt: undefined,
        // The customer's own code (also emailed). Shipment.deliveryOtpDebug is select:false and only the customer's
        // order endpoint selects it — rider responses never include it.
        deliveryOtpDebug:    generatedOtp,
    };

    if (options.setOutForDelivery) {
        updateFields.status = 'out_for_delivery';
    }

    const updatedShipment = await Shipment.findByIdAndUpdate(
        shipment._id,
        { $set: updateFields },
        { new: true }
    ).select('+deliveryOtpHash +deliveryOtpExpiry +deliveryOtpSentAt +deliveryOtpAttempts +deliveryOtpDebug');

    // Seller Delivery: the code is shown only on the customer's order tracking page — never in notifications
    // or email — and every regeneration gets its own notification.
    if (options.codeOnTrackingPageOnly) {
        const orderHumanId = String(order.orderId || order._id);
        const courier = shipment.sellerDelivery?.courierName;
        const to = getCustomerEmail(order);
        if (to) {
            const safeCourier = courier ? escapeHtml(courier) : '';
            sendEmail({
                to,
                subject: `Your order ${orderHumanId} is out for delivery`,
                text: `Your package${courier ? ` (via ${courier})` : ''} is out for delivery. Your delivery OTP is available on the order tracking page. Share it only after you have received your package.`,
                html: `<h1 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#1F2937;">Your order is out for delivery</h1><p style="margin:0;">Order <strong>${escapeHtml(orderHumanId)}</strong>${safeCourier ? ` is on its way via <strong>${safeCourier}</strong>` : ''}. Your delivery OTP is available on the order tracking page. Share it with the delivery person <strong>only after you have received your package</strong>.</p>`,
            }).catch((err) => console.warn(`[Delivery OTP] Async email error: ${err.message}`));
        }
        if (order.userId) {
            createNotification({
                recipientId: order.userId,
                recipientType: 'user',
                title: 'Out for delivery — delivery OTP ready',
                message: `Your package (${shipment.shipmentNumber || 'Shipment'}) is out for delivery${courier ? ` via ${courier}` : ''}. Open your order tracking page to see your delivery OTP. Share it only after you receive the package.`,
                type: 'order',
                eventKey: `order:${orderHumanId}:shipment:${shipment._id}:seller_delivery_otp:${now.getTime()}:user`,
                data: {
                    orderId: orderHumanId,
                    orderMongoId: String(order._id),
                    shipmentId: String(shipment._id),
                    status: 'out_for_delivery',
                    deepLink: `/orders/${orderHumanId}`,
                },
            }).catch((err) => console.warn(`[Delivery OTP] Async notification error: ${err.message}`));
        }
        return { shipment: updatedShipment, isNew: true };
    }

    // Notify customer asynchronously
    sendDeliveryOtpEmail(order, generatedOtp).catch((err) => {
        console.warn(`[Delivery OTP] Async email error: ${err.message}`);
    });

    if (order.userId) {
        const orderHumanId = String(order.orderId || order._id);
        createNotification({
            recipientId: order.userId,
            recipientType: 'user',
            title: 'Delivery Verification OTP',
            message: `Your package (${shipment.shipmentNumber || 'Shipment'}) is shipped. Share OTP ${generatedOtp} with delivery partner upon delivery.`,
            type: 'order',
            eventKey: `order:${orderHumanId}:delivery_otp:user`,
            data: {
                orderId: orderHumanId,
                orderMongoId: String(order._id),
                shipmentId: String(shipment._id),
                status: 'shipped',
                deepLink: `/orders/${orderHumanId}`,
            },
        }).catch((err) => {
            console.warn(`[Delivery OTP] Async notification error: ${err.message}`);
        });
    }

    return {
        shipment: updatedShipment,
        isNew: true,
        generatedOtp: isOtpDebugEnabled() ? generatedOtp : undefined,
    };
};

/**
 * Resends Delivery OTP for a shipment.
 * Validates shipment status and rate limiting cooldown.
 *
 * @param {Object} shipment
 * @param {Object} order
 * @returns {Promise<{ success: boolean, generatedOtp?: string }>}
 */
export const resendDeliveryOtpForShipment = async (shipment, order) => {
    if (!['shipped', 'out_for_delivery'].includes(shipment.status)) {
        throw new ApiError(409, 'Cannot resend OTP. Order is not in transit or out for delivery.');
    }

    const otpSentAt = shipment.deliveryOtpSentAt;
    if (
        otpSentAt &&
        new Date(otpSentAt).getTime() + DELIVERY_OTP_RESEND_COOLDOWN_MS > Date.now()
    ) {
        throw new ApiError(429, 'Please wait before requesting another OTP.');
    }

    const result = await ensureDeliveryOtpForShipment(shipment, order, { forceRegenerate: true });

    notifyOrderUpdate(order);

    return {
        success: true,
        generatedOtp: result.generatedOtp,
    };
};

/**
 * Verifies Delivery OTP submitted by Delivery Partner.
 * Strict hash verification against stored deliveryOtpHash.
 *
 * The delivered transition is one conditional update: it only matches while the shipment is still in transit
 * and still holds the OTP hash that was verified (the hash is removed on success). Two concurrent
 * confirmations, or a confirmation after cancellation, can therefore never both succeed — the loser gets 409
 * and the caller must not emit SHIPMENT_DELIVERED.
 *
 * @param {Object} shipment - Shipment document with selected OTP fields
 * @param {string} inputOtp - Plain OTP entered by delivery partner
 * @param {{ method?: string, confirmedByRole?: string, confirmedById?: any, updatedBy?: string }} [confirmation]
 * @returns {Promise<{ verified: boolean, shipment: Object }>}
 */
export const DELIVERABLE_SHIPMENT_STATUSES = ['shipped', 'out_for_delivery'];

export const verifyDeliveryOtpForShipment = async (shipment, inputOtp, confirmation = {}) => {
    const normalizedOtp = String(inputOtp || '').trim();
    if (!/^\d{4}$/.test(normalizedOtp)) {
        throw new ApiError(400, 'Delivery OTP is required to complete delivery.');
    }

    if (!shipment.deliveryOtpHash || !shipment.deliveryOtpExpiry) {
        throw new ApiError(400, 'Delivery OTP was not generated. Please use Resend OTP to send OTP to the customer.');
    }

    if (new Date(shipment.deliveryOtpExpiry) < new Date()) {
        throw new ApiError(400, 'Delivery OTP has expired. Please resend OTP.');
    }

    const attempts = Number(shipment.deliveryOtpAttempts || 0);
    if (attempts >= DELIVERY_OTP_MAX_ATTEMPTS) {
        throw new ApiError(429, 'Maximum OTP attempts reached. Please resend OTP.');
    }

    const isMatch = verifyOtpHash(normalizedOtp, shipment.deliveryOtpHash);
    if (!isMatch) {
        await Shipment.findByIdAndUpdate(shipment._id, { $inc: { deliveryOtpAttempts: 1 } });
        throw new ApiError(400, 'Invalid delivery OTP.');
    }

    const verifiedAt = new Date();
    const set = {
        deliveryOtpVerifiedAt: verifiedAt,
        status: 'delivered',
        deliveredAt: verifiedAt,
    };
    if (confirmation.method) {
        set.deliveryConfirmation = {
            method: confirmation.method,
            confirmedAt: verifiedAt,
            confirmedByRole: confirmation.confirmedByRole,
            confirmedById: confirmation.confirmedById,
        };
    }
    const updated = await Shipment.findOneAndUpdate(
        {
            _id: shipment._id,
            status: { $in: DELIVERABLE_SHIPMENT_STATUSES },
            deliveryOtpHash: shipment.deliveryOtpHash,
        },
        {
            $set: set,
            $unset: {
                deliveryOtpHash: '',
                deliveryOtpExpiry: '',
                deliveryOtpSentAt: '',
                deliveryOtpAttempts: 0,
                deliveryOtpDebug: '',
            },
            $push: {
                statusHistory: {
                    status: 'delivered',
                    updatedAt: verifiedAt,
                    updatedBy: confirmation.updatedBy || 'driver',
                    notes: 'Delivery confirmed with the customer delivery OTP.',
                },
            },
        },
        { new: true }
    );
    if (!updated) {
        throw new ApiError(409, 'This shipment has already been delivered or is no longer awaiting delivery.');
    }

    return { verified: true, shipment: updated };
};
