import Order from '../models/Order.model.js';
import PaymentAttempt from '../models/PaymentAttempt.model.js';
import { processCancellationRefund } from '../services/cancellationRefundService.js';
import { processCapturedPayment } from '../services/paymentProcessor.js';
import { fetchRazorpayOrderPayments } from '../services/payment.service.js';
import { createNotification } from '../services/notification.service.js';
import { notifyOrderUpdate } from '../services/socket.service.js';

// How long an online (Razorpay) product order may wait for payment before it is cancelled.
export const getOrderPaymentTimeoutMinutes = () => {
    const configured = Number(process.env.ORDER_PAYMENT_TIMEOUT_MINUTES);
    return Number.isFinite(configured) && configured > 0 ? configured : 60;
};

// Module-level guard: prevents overlapping runs on single instance
let _cronRunning = false;

/**
 * Asks Razorpay what happened to this order's payment attempts.
 * Returns { captured: {attempt, payment} | null, authorized: boolean }.
 * Throws when Razorpay cannot be reached, so the caller leaves the order alone for this run.
 */
const checkGatewayPayments = async (attempts, fetchPayments) => {
    let authorized = false;
    for (const attempt of attempts) {
        if (!attempt.razorpayOrderId) continue;
        const payments = await fetchPayments(attempt.razorpayOrderId);
        const captured = payments.find((p) => p?.status === 'captured');
        if (captured) return { captured: { attempt, payment: captured }, authorized };
        if (payments.some((p) => p?.status === 'authorized')) authorized = true;
    }
    return { captured: null, authorized };
};

/**
 * Cancels online product orders whose payment was never completed within the timeout.
 *
 * Covers orders still 'payment_pending' (customer closed the payment window) and 'payment_failed' orders
 * whose payment never went through (paymentStatus still 'pending'). Orders that failed because stock ran out
 * after capture have paymentStatus 'failed' and were already refunded by paymentProcessor, so they are skipped.
 *
 * Cancellation goes through processCancellationRefund, the same path as a customer cancelling: it returns any
 * wallet share debited at checkout, cancels the shipments, and does not touch stock or coupon usage (an unpaid
 * order never took them).
 *
 * Before cancelling, Razorpay is asked about each attempt: a captured payment whose webhook never arrived is
 * completed instead of cancelled; an authorized (not yet captured) payment is left for a later run. A capture
 * arriving after cancellation is refunded automatically by paymentProcessor (the order is no longer pending).
 */
// `fetchPayments` is the Razorpay lookup; tests pass a stub to simulate gateway answers.
export const expireUnpaidOrders = async ({ now = new Date(), fetchPayments = fetchRazorpayOrderPayments } = {}) => {
    if (_cronRunning) return { expired: 0, recovered: 0, skipped: true };
    _cronRunning = true;
    let expired = 0;
    let recovered = 0;
    try {
        const timeoutMinutes = getOrderPaymentTimeoutMinutes();
        const cutoff = new Date(now.getTime() - timeoutMinutes * 60 * 1000);

        const candidates = await Order.find({
            status: { $in: ['payment_pending', 'payment_failed'] },
            paymentStatus: 'pending',
            paymentMethod: { $nin: ['cod', 'cash', 'wallet'] },
            createdAt: { $lt: cutoff },
        }).select('_id orderId').lean();

        for (const { _id, orderId } of candidates) {
            try {
                // A capture is being processed right now; let it finish rather than racing it.
                if (await PaymentAttempt.exists({ orderId: _id, status: 'processing' })) continue;

                const attempts = await PaymentAttempt.find({ orderId: _id, purpose: { $ne: 'EXCHANGE_UPGRADE' } })
                    .select('razorpayOrderId status')
                    .lean();

                let gateway;
                try {
                    gateway = await checkGatewayPayments(attempts, fetchPayments);
                } catch (err) {
                    console.error(`[Order Payment Expiry] Razorpay check failed for ${orderId}; will retry next run:`, err.message);
                    continue;
                }

                if (gateway.captured) {
                    // The customer paid but the webhook/verify never reached us: complete the order.
                    await processCapturedPayment({
                        razorpayOrderId: gateway.captured.attempt.razorpayOrderId,
                        razorpayPaymentId: gateway.captured.payment.id,
                        method: gateway.captured.payment.method,
                        payload: { source: 'order_expiry_recovery' },
                    });
                    recovered += 1;
                    console.warn(`[Order Payment Expiry] Recovered captured payment for order ${orderId} (webhook was missed).`);
                    continue;
                }
                if (gateway.authorized) {
                    console.warn(`[Order Payment Expiry] Order ${orderId} has an authorized, uncaptured payment; not cancelling.`);
                    continue;
                }

                // Re-check right before cancelling: the order may have been paid or cancelled meanwhile.
                const stillUnpaid = await Order.exists({
                    _id,
                    status: { $in: ['payment_pending', 'payment_failed'] },
                    paymentStatus: 'pending',
                });
                if (!stillUnpaid) continue;

                const reason = `Payment not completed within ${timeoutMinutes} minutes`;
                const result = await processCancellationRefund({
                    orderId: _id,
                    cancelledBy: 'system',
                    reason,
                });

                // Same as a customer cancel: no open attempt stays 'created'. Attempts remain claimable, so a
                // capture that still arrives later is refunded by paymentProcessor rather than ignored.
                await PaymentAttempt.updateMany(
                    { orderId: _id, status: 'created' },
                    { $set: { status: 'failed' } }
                );
                expired += 1;

                const order = result?.order;
                if (order) notifyOrderUpdate(order);
                if (order?.userId) {
                    const walletReturned = Number(result?.refundAmount || 0);
                    createNotification({
                        recipientId: order.userId,
                        recipientType: 'user',
                        title: 'Order Cancelled',
                        message: `Order #${order.orderId} was cancelled because payment was not completed. You have not been charged${walletReturned > 0 ? `; ₹${walletReturned} has been returned to your SafeFire wallet` : ''}. Please place the order again.`,
                        type: 'order',
                        data: { orderId: String(order.orderId), orderMongoId: String(order._id), status: 'cancelled' },
                    }).catch((err) => console.error('[Order Payment Expiry] Notification failed:', err.message));
                }
            } catch (err) {
                console.error(`[Order Payment Expiry] Failed for order ${orderId}:`, err.message);
            }
        }

        if (expired > 0 || recovered > 0) {
            console.log(`[Order Payment Expiry] Cancelled ${expired} unpaid order(s), recovered ${recovered} missed capture(s).`);
        }
        return { expired, recovered };
    } finally {
        _cronRunning = false;
    }
};
