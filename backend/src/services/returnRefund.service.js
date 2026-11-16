import Refund from '../models/Refund.model.js';
import ReturnRequest from '../models/ReturnRequest.model.js';
import PaymentAttempt from '../models/PaymentAttempt.model.js';
import logger from '../utils/logger.js';
import { creditWallet } from './wallet.service.js';
import { processRazorpayRefund } from './payment.service.js';
import { splitMixedRefund } from './cancellationRefundService.js';

/**
 * Where a return refund goes (business rule, Nov 2026):
 *  - paid online (card / UPI / netbanking via Razorpay) → back to the same card/UPI (Razorpay refund)
 *  - Cash on Delivery or SafeFire Wallet               → SafeFire Wallet
 * A wallet + Razorpay order refunds through Razorpay up to what it captured; the rest goes to the wallet.
 */
const OFFLINE_METHODS = ['cod', 'cash', 'wallet'];

export const isOnlinePaidOrder = (order) => {
    const method = String(order?.paymentMethod || '').toLowerCase();
    return Boolean(method) && !OFFLINE_METHODS.includes(method);
};

/**
 * Records the refund for a completed return inside the caller's transaction. Wallet credits happen
 * immediately; a Razorpay refund is only recorded here (status 'processing') and returned as
 * `pendingGatewayRefund`, which the caller must pass to executePendingGatewayRefund AFTER commit,
 * so a rolled-back transaction can never have sent money through the gateway.
 *
 * @returns {Promise<{ refundId?: any, refundStatus?: 'pending'|'processed', pendingGatewayRefund?: object|null }>}
 */
export const recordReturnRefund = async ({ order, request, refundAmount, session }) => {
    const refundRef = `RETURN_REFUND_${request._id}`;
    const orderId = order._id;
    const userId = request.userId?._id || request.userId;

    // Idempotency: verify if refund was already created
    const existingRefund = await Refund.findOne({ referenceId: refundRef }).session(session);
    if (existingRefund) {
        return {
            refundId: existingRefund._id,
            refundStatus: existingRefund.status === 'completed' ? 'processed' : 'pending',
            pendingGatewayRefund: null,
        };
    }
    if (!(refundAmount > 0)) return { pendingGatewayRefund: null };

    let gatewayAmount = 0;
    let walletAmount = refundAmount;
    if (isOnlinePaidOrder(order)) {
        const previousRefunds = await Refund.find({ orderId, status: { $in: ['completed', 'processing'] } }).session(session);
        ({ gatewayAmount, walletAmount } = splitMixedRefund(order, refundAmount, previousRefunds));
    }

    let primaryRefund = null;
    let pendingGatewayRefund = null;

    if (walletAmount > 0) {
        const walletRef = gatewayAmount > 0 ? `${refundRef}_WALLET_SHARE` : refundRef;
        await creditWallet(
            userId,
            walletAmount,
            'return_refund',
            {
                returnRequestId: request._id,
                orderId,
                description: `Refunded ₹${walletAmount} to wallet for Return #${request._id}`,
                reference: walletRef,
            },
            session
        );
        [primaryRefund] = await Refund.create([{
            orderId,
            returnRequestId: request._id,
            userId,
            amount: walletAmount,
            referenceId: walletRef,
            method: 'wallet_credit',
            destination: 'wallet',
            status: 'completed',
            paymentMethod: order.paymentMethod,
            refundInitiatedAt: new Date(),
            refundCompletedAt: new Date(),
            notes: 'Return refund credited to customer wallet',
        }], { session });
    }

    if (gatewayAmount > 0) {
        const paidAttempt = await PaymentAttempt.findOne({ orderId, status: 'paid' })
            .sort({ updatedAt: -1 })
            .session(session);
        const base = {
            orderId,
            returnRequestId: request._id,
            userId,
            amount: gatewayAmount,
            referenceId: refundRef,
            method: 'razorpay',
            destination: 'original_source',
            paymentMethod: order.paymentMethod,
            refundInitiatedAt: new Date(),
            notes: `Return refund to original payment method (${order.paymentMethod})`,
        };
        if (paidAttempt?.razorpayPaymentId) {
            [primaryRefund] = await Refund.create([{
                ...base,
                status: 'processing',
                paymentAttemptId: paidAttempt._id,
                razorpayPaymentId: paidAttempt.razorpayPaymentId,
            }], { session });
            pendingGatewayRefund = {
                refundRecordId: primaryRefund._id,
                returnRequestId: request._id,
                paymentId: paidAttempt.razorpayPaymentId,
                amount: gatewayAmount,
                reference: refundRef,
                orderId: String(orderId),
            };
        } else {
            // Never silently switch to the wallet: finance must refund this one manually.
            [primaryRefund] = await Refund.create([{
                ...base,
                status: 'failed',
                failureReason: 'Original captured Razorpay payment ID could not be resolved; refund manually.',
            }], { session });
        }
    }

    return {
        refundId: primaryRefund?._id,
        refundStatus: gatewayAmount > 0 ? 'pending' : 'processed',
        pendingGatewayRefund,
    };
};

/** Sends a Razorpay refund recorded by recordReturnRefund. Call only after the transaction commits. */
export const executePendingGatewayRefund = async (pending) => {
    if (!pending) return;
    try {
        const result = await processRazorpayRefund({
            paymentId: pending.paymentId,
            amountInRupees: pending.amount,
            reference: pending.reference,
            notes: { orderId: pending.orderId, returnRequestId: String(pending.returnRequestId), reason: 'return_refund' },
        });
        const isCompleted = result.status === 'completed';
        await Refund.findByIdAndUpdate(pending.refundRecordId, {
            $set: {
                status: isCompleted ? 'completed' : 'processing',
                razorpayRefundId: result.refundId,
                ...(isCompleted ? { refundCompletedAt: new Date() } : {}),
            },
        });
        if (isCompleted) {
            await ReturnRequest.findByIdAndUpdate(pending.returnRequestId, { $set: { refundStatus: 'processed' } });
        }
    } catch (err) {
        logger.error(`[Return Refund] Razorpay refund failed for return ${pending.returnRequestId}:`, err.message);
        await Refund.findByIdAndUpdate(pending.refundRecordId, {
            $set: err.isTimeout
                ? { isAmbiguousTimeout: true, failureReason: 'Gateway request timed out — marked processing for webhook/reconciliation' }
                : { status: 'failed', failureReason: err.message || 'Razorpay refund failed' },
        });
        if (!err.isTimeout) {
            await ReturnRequest.findByIdAndUpdate(pending.returnRequestId, { $set: { refundStatus: 'failed' } });
        }
    }
};
