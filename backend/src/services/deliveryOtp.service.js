import Shipment from '../models/Shipment.model.js';
import Order from '../models/Order.model.js';
import ApiError from '../utils/ApiError.js';
import { sendEmail } from './email.service.js';
import { createNotification } from './notification.service.js';
import { notifyOrderUpdate } from './socket.service.js';
import { hashOtp, verifyOtpHash, generateDeliveryOtpValue } from './otp.service.js';

const IS_PRODUCTION = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
export const DELIVERY_OTP_TTL_MS = IS_PRODUCTION ? 10 * 60 * 1000 : 24 * 60 * 60 * 1000;
export const DELIVERY_OTP_MAX_ATTEMPTS = 5;
export const DELIVERY_OTP_RESEND_COOLDOWN_MS = 60 * 1000;

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
            html: `<p>Your delivery verification OTP is <strong>${otp}</strong>.</p><p>Share it with the delivery partner only after receiving your order.</p><p>This OTP expires in 10 minutes.</p>`,
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
            generatedOtp: !IS_PRODUCTION ? shipment.deliveryOtpDebug : undefined,
        };
    }

    // Generate new OTP using the centralized generator
    const generatedOtp = generateDeliveryOtpValue();
    const otpHash = hashOtp(generatedOtp);
    const otpExpiry = new Date(Date.now() + DELIVERY_OTP_TTL_MS);

    const updateFields = {
        deliveryOtpHash:     otpHash,
        deliveryOtpExpiry:   otpExpiry,
        deliveryOtpSentAt:   now,
        deliveryOtpAttempts: 0,
        deliveryOtpVerifiedAt: undefined,
        deliveryOtpDebug:    !IS_PRODUCTION ? generatedOtp : undefined,
    };

    if (options.setOutForDelivery) {
        updateFields.status = 'out_for_delivery';
    }

    const updatedShipment = await Shipment.findByIdAndUpdate(
        shipment._id,
        { $set: updateFields },
        { new: true }
    ).select('+deliveryOtpHash +deliveryOtpExpiry +deliveryOtpSentAt +deliveryOtpAttempts +deliveryOtpDebug');

    // Notify customer asynchronously
    sendDeliveryOtpEmail(order, generatedOtp).catch((err) => {
        console.warn(`[Delivery OTP] Async email error: ${err.message}`);
    });

    if (order.userId) {
        createNotification({
            recipientId: order.userId,
            recipientType: 'user',
            title: 'Delivery Verification OTP',
            message: `Your package (${shipment.shipmentNumber || 'Shipment'}) is shipped. Share OTP ${generatedOtp} with delivery partner upon delivery.`,
            type: 'order',
            data: {
                orderId: String(order._id),
                shipmentId: String(shipment._id),
            },
        }).catch((err) => {
            console.warn(`[Delivery OTP] Async notification error: ${err.message}`);
        });
    }

    return {
        shipment: updatedShipment,
        isNew: true,
        generatedOtp: !IS_PRODUCTION ? generatedOtp : undefined,
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
 * @param {Object} shipment - Shipment document with selected OTP fields
 * @param {string} inputOtp - Plain OTP entered by delivery partner
 * @returns {Promise<{ verified: boolean }>}
 */
export const verifyDeliveryOtpForShipment = async (shipment, inputOtp) => {
    const normalizedOtp = String(inputOtp || '').trim();
    if (!/^\d{4,6}$/.test(normalizedOtp)) {
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
    await Shipment.findByIdAndUpdate(shipment._id, {
        $set: {
            deliveryOtpVerifiedAt: verifiedAt,
            status: 'delivered',
            deliveredAt: verifiedAt,
        },
        $unset: {
            deliveryOtpHash: '',
            deliveryOtpExpiry: '',
            deliveryOtpSentAt: '',
            deliveryOtpAttempts: 0,
            deliveryOtpDebug: '',
        },
    });

    return { verified: true };
};
