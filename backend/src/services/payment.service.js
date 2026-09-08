import Razorpay from 'razorpay';
import crypto from 'crypto';
import ApiError from '../utils/ApiError.js';

const razorpay = new Razorpay({
    key_id:     process.env.RAZORPAY_KEY_ID || 'rzp_test_mock12345',
    key_secret: process.env.RAZORPAY_KEY_SECRET || 'mock_secret12345',
});

/**
 * Create a Razorpay order for the given amount.
 * @param {number} amountInRupees - Amount in ₹ (will be converted to paise)
 * @param {string} currency - e.g. 'INR'
 * @param {string} receiptId - Human-readable reference (order ID)
 * @param {object} notes - Optional metadata
 */
export const createRazorpayOrder = (amountInRupees, currency = 'INR', receiptId, notes = {}) => {
    if (process.env.NODE_ENV === 'test' || process.env.RAZORPAY_MOCK === 'true') {
        return Promise.resolve({
            id: `order_mock_${Date.now()}_${Math.floor(100 + Math.random() * 900)}`,
            amount: Math.round(amountInRupees * 100),
            currency,
            receipt: String(receiptId),
            notes,
            status: 'created',
        });
    }
    return razorpay.orders.create({
        amount:   Math.round(amountInRupees * 100),
        currency,
        receipt:  String(receiptId),
        notes,
    });
};

/**
 * Verify the HMAC-SHA256 signature sent by Razorpay webhooks.
 * Throws ApiError 400 if signature is invalid.
 */
export const verifyWebhookSignature = (rawBody, signature) => {
    if ((process.env.NODE_ENV === 'test' || process.env.RAZORPAY_MOCK === 'true') && signature === 'mock_valid') {
        return true;
    }
    if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
        throw new Error('RAZORPAY_WEBHOOK_SECRET is not configured.');
    }
    const expected = crypto
        .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
        .update(rawBody)
        .digest('hex');
    // SEC-01: Use timingSafeEqual to prevent timing-based signature forgery
    const expectedBuf = Buffer.from(expected);
    const actualBuf   = Buffer.from(signature || '');
    const isValid = expectedBuf.length === actualBuf.length &&
        crypto.timingSafeEqual(expectedBuf, actualBuf);
    if (!isValid) {
        throw new ApiError(400, 'Invalid Razorpay webhook signature.');
    }
};

/**
 * Verify the payment signature returned by the frontend after payment.
 * Returns true if valid, false otherwise.
 */
export const verifyPaymentSignature = (razorpayOrderId, razorpayPaymentId, signature) => {
    const expected = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${razorpayOrderId}|${razorpayPaymentId}`)
        .digest('hex');
    // SEC-01: Constant-time comparison prevents timing attack enumeration
    const expectedBuf = Buffer.from(expected);
    const actualBuf   = Buffer.from(signature || '');
    return expectedBuf.length === actualBuf.length &&
        crypto.timingSafeEqual(expectedBuf, actualBuf);
};

let globalMockBehavior = {
    simulateTimeout: false,
    simulateFailure: false,
    simulateProcessing: false,
    failureMessage: null,
};

export const setRazorpayMockBehavior = (behavior = {}) => {
    globalMockBehavior = { ...globalMockBehavior, ...behavior };
};

export const resetRazorpayMockBehavior = () => {
    globalMockBehavior = {
        simulateTimeout: false,
        simulateFailure: false,
        simulateProcessing: false,
        failureMessage: null,
    };
};

/**
 * Robust Razorpay Refund API call
 * Converts rupees to paise, attaches SafeFire reference as receipt,
 * and normalizes the response status.
 *
 * @param {object} params
 * @param {string} params.paymentId - Captured Razorpay payment ID (pay_xxx)
 * @param {number} params.amountInRupees - Amount to refund in ₹
 * @param {string} [params.reference] - SafeFire unique idempotency key
 * @param {object} [params.notes] - Audit notes and metadata
 */
export const processRazorpayRefund = async ({ paymentId, amountInRupees, reference = '', notes = {} }) => {
    if (!paymentId || typeof paymentId !== 'string' || !paymentId.trim()) {
        throw new Error('Valid Razorpay paymentId is required for refund.');
    }
    const amount = Number(amountInRupees);
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error(`Invalid refund amount: ₹${amountInRupees}`);
    }

    const amountInPaise = Math.round(amount * 100);

    if (process.env.NODE_ENV === 'test' || process.env.RAZORPAY_MOCK === 'true') {
        if (notes?.simulateTimeout || globalMockBehavior.simulateTimeout) {
            const err = new Error('Gateway request timed out.');
            err.code = 'ETIMEDOUT';
            err.isTimeout = true;
            throw err;
        }
        if (notes?.simulateFailure || globalMockBehavior.simulateFailure || paymentId === 'pay_invalid_mock') {
            const err = new Error(notes?.errorMessage || globalMockBehavior.failureMessage || 'Razorpay refund failed: simulated rejection.');
            err.statusCode = 400;
            throw err;
        }
        const mockRawStatus = (notes?.simulateProcessing || globalMockBehavior.simulateProcessing) ? 'processing' : 'processed';
        return {
            success: true,
            refundId: `rfnd_mock_${Date.now()}_${Math.floor(100 + Math.random() * 900)}`,
            paymentId,
            amount: amountInPaise,
            currency: 'INR',
            status: mockRawStatus === 'processed' ? 'completed' : 'processing',
            rawStatus: mockRawStatus,
            reference,
        };
    }

    try {
        const payload = {
            amount: amountInPaise,
            notes,
        };
        if (reference) {
            payload.receipt = String(reference).slice(0, 40);
        }

        const rzpResponse = await razorpay.payments.refund(paymentId, payload);
        const rawStatus = String(rzpResponse.status || 'processed').toLowerCase();

        return {
            success: true,
            refundId: rzpResponse.id,
            paymentId: rzpResponse.payment_id || paymentId,
            amount: rzpResponse.amount || amountInPaise,
            currency: rzpResponse.currency || 'INR',
            status: rawStatus === 'processed' ? 'completed' : 'processing',
            rawStatus,
            reference,
            response: rzpResponse,
        };
    } catch (err) {
        const isTimeout =
            err.code === 'ETIMEDOUT' ||
            err.code === 'ECONNRESET' ||
            err.code === 'ESOCKETTIMEDOUT' ||
            Boolean(err.message && err.message.toLowerCase().includes('timeout'));
        err.isTimeout = isTimeout;
        throw err;
    }
};

/**
 * Backward-compatible helper for existing callers
 */
export const initiateRefund = async (razorpayPaymentId, amountInRupees, notes = {}) => {
    const res = await processRazorpayRefund({ paymentId: razorpayPaymentId, amountInRupees, notes });
    return {
        id: res.refundId,
        payment_id: res.paymentId,
        amount: res.amount,
        status: res.rawStatus,
    };
};
