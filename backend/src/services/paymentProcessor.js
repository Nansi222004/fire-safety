import mongoose from 'mongoose';
import ApiError from '../utils/ApiError.js';
import PaymentAttempt from '../models/PaymentAttempt.model.js';
import Payment from '../models/Payment.model.js';
import Order from '../models/Order.model.js';
import Product from '../models/Product.model.js';
import Commission from '../models/Commission.model.js';
import Coupon from '../models/Coupon.model.js';
import Refund from '../models/Refund.model.js';
import Vendor from '../models/Vendor.model.js';
import Admin from '../models/Admin.model.js';
import ReturnRequest from '../models/ReturnRequest.model.js';
import ServiceBooking from '../models/ServiceBooking.model.js';
import ServiceCapacity from '../models/ServiceCapacity.model.js';
import logger from '../utils/logger.js';
import { initiateRefund } from './payment.service.js';
import { creditWallet } from './wallet.service.js';
import { createNotification } from './notification.service.js';
import { sendOrderConfirmationEmail } from './email.service.js';
import { notifyOrderUpdate } from './socket.service.js';
import { findMatchingVariantKey, encodeVariantKey } from '../utils/variantKeyHelper.js';
import { buildCommissionDocsFromOrder } from './orderFinancialHelper.js';

/**
 * Refunds a gateway capture that no longer has anything to pay for (the order/booking was cancelled
 * or already paid by another attempt). Recorded as a Refund so finance can reconcile it.
 */
async function refundUnexpectedCapture({ attempt, razorpayPaymentId, amount, userId, orderId, serviceBookingId, reason }) {
    const referenceId = `UNEXPECTED_CAPTURE_REFUND_${razorpayPaymentId}`;
    await PaymentAttempt.findByIdAndUpdate(attempt._id, { $set: { status: 'captured_refunded' } });
    if (await Refund.findOne({ referenceId })) return;

    const base = {
        ...(orderId ? { orderId } : {}),
        ...(serviceBookingId ? { serviceBookingId } : {}),
        userId,
        amount,
        referenceId,
        method: 'razorpay_auto',
        destination: 'original_source',
        paymentAttemptId: attempt._id,
        razorpayPaymentId,
        notes: `Auto-refund: ${reason}`,
    };
    logger.warn('[PAYMENT_PROCESSOR] Refunding unexpected capture', { razorpayPaymentId, amount, reason });
    if (!(amount > 0)) {
        await Refund.create({ ...base, status: 'failed', failureReason: 'Capture amount could not be determined; refund manually.' });
        return;
    }
    try {
        const rzpRefund = await initiateRefund(razorpayPaymentId, amount, { reason: 'capture_after_cancel' });
        await Refund.create({ ...base, status: 'processing', razorpayRefundId: rzpRefund.id });
    } catch (err) {
        logger.error('[REFUND_ERROR] Unexpected-capture refund failed:', { message: err.message });
        await Refund.create({ ...base, status: 'failed', failureReason: err.message || 'Razorpay refund failed' });
    }
}

/**
 * Reusable core payment processor.
 * Guarantees atomic transition from 'created' -> 'processing' -> 'paid'.
 * Safely handles race conditions if both Webhook and Direct Client Verification hit simultaneously.
 */
export async function processCapturedPayment({ razorpayOrderId, razorpayPaymentId, method, payload }) {
    if (!razorpayOrderId || !razorpayPaymentId) {
        throw new Error('Missing razorpayOrderId or razorpayPaymentId.');
    }

    // Atomic idempotency lock. A 'failed' attempt is claimable too: Razorpay lets the customer retry inside
    // the same checkout (same order_id), so a payment.failed for the first try can be followed by a capture.
    // Ignoring that capture left the customer charged with no order/booking and no refund.
    const attempt = await PaymentAttempt.findOneAndUpdate(
        { razorpayOrderId, status: { $in: ['created', 'failed'] } },
        { $set: { status: 'processing', razorpayPaymentId, webhookPayload: payload } },
        { new: false }
    );
    if (!attempt) {
        // Already processing or paid — exit safely to avoid double stock deduction
        console.warn(`[PAYMENT_PROCESSOR] Attempt ${razorpayOrderId} already processed or processing.`);
        return;
    }
    const attemptHadFailed = attempt.status === 'failed';
    attempt.status = 'processing';

    // ─── Handle SERVICE_BOOKING payment ───────────────────────────────────────
    if (attempt.purpose === 'SERVICE_BOOKING') {
        const booking = await ServiceBooking.findById(attempt.serviceBookingId);
        if (!booking) throw new Error(`Service booking not found for attempt ${attempt._id}`);

        // Only an unpaid, still-open booking can be confirmed by this payment.
        const confirmed = await ServiceBooking.findOneAndUpdate(
            { _id: booking._id, status: 'pending', paymentStatus: { $ne: 'paid' } },
            {
                $set: {
                    paymentStatus: 'paid',
                    status: 'confirmed',
                },
                $push: {
                    statusHistory: {
                        previousStatus: booking.status,
                        newStatus: 'confirmed',
                        changedByRole: 'system',
                        note: `Online payment captured via Razorpay (${method || 'online'})`,
                        changedAt: new Date(),
                    },
                },
            },
            { new: true }
        );

        if (!confirmed) {
            // Booking was cancelled (or already paid) before this capture arrived: return the money.
            await refundUnexpectedCapture({
                attempt,
                razorpayPaymentId,
                amount: Number(booking.pricing?.total || 0),
                userId: booking.userId,
                serviceBookingId: booking._id,
                reason: `Payment captured for service booking #${booking.bookingId} in '${booking.status}' state`,
            });
            return;
        }

        if (attemptHadFailed) {
            // The payment.failed webhook released the capacity slot; the booking is now live again.
            const dateStr = new Date(booking.bookingDate).toISOString().slice(0, 10);
            await ServiceCapacity.updateOne(
                { vendorServiceId: booking.vendorServiceId, dateStr },
                { $inc: { bookedCount: 1 } }
            );
        }

        await PaymentAttempt.findByIdAndUpdate(attempt._id, { $set: { status: 'paid' } });

        // Post-payment notifications (User + Vendor)
        try {
            await createNotification({
                recipientId: booking.userId,
                recipientType: 'user',
                title: 'Payment Successful!',
                message: `Payment of ₹${booking.pricing.total} for booking #${booking.bookingId} (${booking.serviceName}) was successful.`,
                type: 'payment',
                data: { bookingId: String(booking._id), bookingNumber: booking.bookingId },
            });
            await createNotification({
                recipientId: booking.vendorId,
                recipientType: 'vendor',
                title: 'Paid Booking Confirmed',
                message: `Booking #${booking.bookingId} for "${booking.serviceName}" is paid and confirmed!`,
                type: 'service',
                data: { bookingId: String(booking._id), bookingNumber: booking.bookingId },
            });
        } catch (e) {
            logger.error('[SERVICE_PAYMENT_NOTIF_ERROR]', e.message);
        }
        return;
    }

    const order = await Order.findById(attempt.orderId);
    if (!order) throw new Error(`Order not found for attempt ${attempt._id}`);

    // ─── Handle EXCHANGE_UPGRADE payment ─────────────────────────────────────
    if (attempt.purpose === 'EXCHANGE_UPGRADE') {
        // T4.2: Both writes must be atomic — if server crashes between them,
        // the PaymentAttempt would show 'paid' but priceDeltaStatus stays 'pending'.
        // Collect at most once and only the exact saved difference (approved rule 1). A failed first try can be
        // followed by a retry on a new gateway order, and the late capture of the old one would otherwise mark
        // the difference collected twice (customer charged twice) — any capture that cannot be applied is refunded.
        const request = await ReturnRequest.findById(attempt.relatedReturnId).select('status exchangeDetails userId').lean();
        const expected = Number(request?.exchangeDetails?.priceDelta);
        const attemptAmount = attempt.amount !== undefined && attempt.amount !== null ? Number(attempt.amount) : expected;
        const amountMatches = Number.isFinite(expected) && expected > 0 && Math.abs(attemptAmount - expected) < 0.005;
        const requestOpen = request && !['rejected', 'completed'].includes(request.status);

        let collected = false;
        if (amountMatches && requestOpen) {
            const xSess = await mongoose.startSession();
            try {
                await xSess.withTransaction(async () => {
                    collected = false;
                    const claimed = await ReturnRequest.findOneAndUpdate(
                        { _id: attempt.relatedReturnId, 'exchangeDetails.priceDeltaStatus': 'pending' },
                        { $set: { 'exchangeDetails.priceDeltaStatus': 'collected', 'exchangeDetails.exchangePaymentId': attempt._id } },
                        { new: true, session: xSess }
                    );
                    if (!claimed) return;
                    await PaymentAttempt.findByIdAndUpdate(attempt._id, { status: 'paid' }, { session: xSess });
                    collected = true;
                });
            } finally {
                await xSess.endSession();
            }
        }

        if (!collected) {
            const reason = !request
                ? 'exchange request not found'
                : !requestOpen
                    ? `exchange request is ${request.status}`
                    : !amountMatches
                        ? `captured ₹${attemptAmount} does not match the exchange difference ₹${expected}`
                        : 'exchange difference already collected by another payment';
            await refundUnexpectedCapture({
                attempt,
                razorpayPaymentId,
                amount: attemptAmount,
                userId: request?.userId || order.userId,
                orderId: order._id,
                reason: `Exchange upgrade capture: ${reason}`,
            });
        }
        return;
    }

    // ─── Handle ORDER_PAYMENT ─────────────────────────────────────────────────
    // Only an unpaid order can be completed by a capture. A cancelled order, or one already paid through
    // another attempt, must not be revived (stock and coupon would be taken twice): refund instead.
    if (!['payment_pending', 'payment_failed'].includes(order.status) || order.paymentStatus === 'paid') {
        await refundUnexpectedCapture({
            attempt,
            razorpayPaymentId,
            amount: Number((Number(order.total || 0) - Number(order.walletAmountUsed || 0)).toFixed(2)),
            userId: order.userId,
            orderId: order._id,
            reason: `Payment captured for order #${order.orderId} in '${order.status}' state`,
        });
        return;
    }

    const session = await mongoose.startSession();
    let stockFailed = false;

    try {
        await session.withTransaction(async () => {
            // Deduct stock atomically
            for (const item of order.items) {
                const qty = Number(item.quantity || 0);
                if (qty <= 0) continue;

                const baseFilter = {
                    _id:           item.productId,
                    stock:         { $ne: 'out_of_stock' },
                    stockQuantity: { $gte: qty },
                };

                // Also check variant stock if applicable
                let variantPath = null;
                if (item.variantKey) {
                    const prodSnapshot = await Product.findById(item.productId)
                        .select('variants.stockMap')
                        .session(session)
                        .lean();
                    const matchedStockKey = findMatchingVariantKey(prodSnapshot?.variants?.stockMap, item.variantKey);
                    const safeVariantKey = matchedStockKey ? encodeVariantKey(matchedStockKey) : encodeVariantKey(item.variantKey);
                    if (safeVariantKey) {
                        variantPath = `variants.stockMap.${safeVariantKey}`;
                    }
                }
                if (variantPath) baseFilter[variantPath] = { $gte: qty };

                const incUpdate = { stockQuantity: -qty };
                if (variantPath) incUpdate[variantPath] = -qty;

                const updatedProduct = await Product.findOneAndUpdate(
                    baseFilter,
                    { $inc: incUpdate },
                    { new: true, session }
                );

                if (!updatedProduct) {
                    stockFailed = true;
                    throw new Error(`Stock exhausted for item: ${item.name}`);
                }

                const nextStock = updatedProduct.stockQuantity <= 0 ? 'out_of_stock'
                    : updatedProduct.stockQuantity <= (updatedProduct.lowStockThreshold || 5) ? 'low_stock'
                    : 'in_stock';
                await Product.updateOne({ _id: updatedProduct._id }, { $set: { stock: nextStock } }, { session });
            }

            // ── All stock deducted successfully ──
            // IDEMPOTENCY: only create commissions if none exist for this order yet
            const existingCount = await Commission.countDocuments({ orderId: order._id }).session(session);
            if (existingCount === 0) {
                // Built from the checkout snapshot (same builder as wallet pay).
                const commissionDocs = buildCommissionDocsFromOrder(order);
                await Commission.insertMany(commissionDocs, { session });

                console.log('[FINANCIAL_EVENT] Commission created via shared processor', {
                    orderId:         String(order._id),
                    customerId:      String(order.userId),
                    vendorCount:     commissionDocs.length,
                    totalCommission: order.commissionAmount,
                    timestamp:       new Date().toISOString(),
                });
            }

            // Increment coupon usage — use couponId (ObjectId) for precise lookup
            if (order.couponCode) {
                const couponFilter = order.couponId
                    ? { _id: order.couponId }
                    : { code: order.couponCode.toUpperCase() };
                await Coupon.updateOne(couponFilter, { $inc: { usedCount: 1 } }, { session });
            }

            // Paid: the order now waits for vendor acceptance (vendor accepting moves it to 'processing').
            await Order.findByIdAndUpdate(
                order._id,
                { $set: { status: 'pending', paymentStatus: 'paid' } },
                { session }
            );

            // Update Payment attempt
            await PaymentAttempt.findByIdAndUpdate(attempt._id, { $set: { status: 'paid' } }, { session });

            // Update Payment summary
            await Payment.findByIdAndUpdate(attempt.paymentId, { $set: { status: 'paid', method } }, { session });

            // Invalidate other attempts
            await PaymentAttempt.updateMany(
                { orderId: order._id, _id: { $ne: attempt._id }, status: 'created' },
                { $set: { status: 'failed' } },
                { session }
            );

            console.log('[FINANCIAL_EVENT] Payment captured successfully via shared processor', {
                orderId:           String(order._id),
                razorpayOrderId,
                razorpayPaymentId,
                amount:            order.total,
                timestamp:         new Date().toISOString(),
            });
        });
    } catch (err) {
        if (stockFailed) {
            // EXTERNAL API RULE: Razorpay refund called AFTER session handling, not inside transaction
            // Auto-refund for stock exhaustion (no session needed — session already aborted)
            await PaymentAttempt.findByIdAndUpdate(attempt._id, { status: 'stock_failed_refunding' });
            await Payment.findByIdAndUpdate(attempt.paymentId, { status: 'refund_pending' });
            await Order.findByIdAndUpdate(order._id, { status: 'payment_failed', paymentStatus: 'failed' });

            const rzpRefundAmount = Number((order.total - (order.walletAmountUsed || 0)).toFixed(2));
            const walletRefundAmount = order.walletAmountUsed || 0;

            // 1. Process Razorpay refund if any cash was paid online
            if (rzpRefundAmount > 0) {
                try {
                    const rzpRefund = await initiateRefund(razorpayPaymentId, rzpRefundAmount, { reason: 'stock_exhausted' });
                    await Refund.create({
                        orderId:          order._id,
                        amount:           rzpRefundAmount,
                        referenceId:      `STOCK_FAIL_REFUND_RZP_${attempt._id}`,
                        method:           'razorpay_auto',
                        destination:      'original_source',
                        status:           'processing',
                        razorpayRefundId: rzpRefund.id,
                        paymentAttemptId: attempt._id,
                        notes:            'Auto-refund: stock exhausted after payment (Razorpay portion)',
                    });
                    console.warn('[FINANCIAL_EVENT] Auto-refund Razorpay triggered due to stock fail', {
                        orderId: String(order._id), amount: rzpRefundAmount, timestamp: new Date().toISOString()
                    });
                } catch (refundErr) {
                    logger.error('[REFUND_ERROR] Razorpay auto-refund failed:', { message: refundErr.message });
                }
            }

            // 2. Process Wallet refund if any wallet balance was used
            if (walletRefundAmount > 0) {
                try {
                    await creditWallet(
                        order.userId,
                        walletRefundAmount,
                        'cancel_refund',
                        {
                            orderId: order._id,
                            description: `Reversed ₹${walletRefundAmount} wallet payment due to stock failure after payment capture`,
                            reference: `STOCK_FAIL_REFUND_WALLET_${attempt._id}`
                        }
                    );
                    await Refund.create({
                        orderId:          order._id,
                        amount:           walletRefundAmount,
                        referenceId:      `STOCK_FAIL_REFUND_WALLET_${attempt._id}`,
                        method:           'wallet_credit',
                        destination:      'wallet',
                        status:           'completed',
                        paymentAttemptId: attempt._id,
                        notes:            'Auto-refund: stock exhausted after payment (Wallet portion)',
                    });
                    console.warn('[FINANCIAL_EVENT] Auto-refund Wallet triggered due to stock fail', {
                        orderId: String(order._id), amount: walletRefundAmount, timestamp: new Date().toISOString()
                    });
                } catch (walletErr) {
                    logger.error('[REFUND_ERROR] Wallet auto-refund failed:', { message: walletErr.message });
                }
            }
        } else {
            // Non-stock error — rethrow and let finally clean up
            throw err;
        }
    } finally {
        try { if (session.inTransaction()) await session.abortTransaction(); } catch (_) {}
        try { await session.endSession(); } catch (_) {}
    }

    // ─── Post-transaction notifications (fire-and-forget) ─────────────────────
    if (!stockFailed) {
        try {
            // T1.2: Fixed recipient → recipientId (notification.service.js requires 'recipientId')
            const orderHumanId = order.orderId || order._id;
            if (order.userId) {
                try {
                    await createNotification({
                        recipientId:   order.userId,
                        recipientType: 'user',
                        title:         'Order Confirmed',
                        message:       `Your order #${orderHumanId} has been confirmed successfully!`,
                        type:          'order',
                        eventKey:      `order:${orderHumanId}:confirmed:user`,
                        deepLink:      `/orders/${orderHumanId}`,
                        data:          {
                            orderId: String(orderHumanId),
                            orderMongoId: String(order._id),
                            recipientRole: 'user',
                            deepLink: `/orders/${orderHumanId}`,
                        },
                    });
                } catch (e) {
                    logger.error('[USER_NOTIF_ERROR]', { message: e.message });
                }
            }

            // Notify each admin individually with their recipientId
            try {
                const admins = await Admin.find({ isActive: true }).select('_id').lean();
                await Promise.allSettled(admins.map(adm =>
                    createNotification({
                        recipientId:   adm._id,
                        recipientType: 'admin',
                        title:         'New Order Placed',
                        message:       `A new order #${orderHumanId} of total ₹${order.total} has been placed.`,
                        type:          'order',
                        eventKey:      `order:${orderHumanId}:placed:admin:${adm._id}`,
                        deepLink:      `/admin/orders/${orderHumanId}`,
                        data:          {
                            orderId: String(orderHumanId),
                            orderMongoId: String(order._id),
                            recipientRole: 'admin',
                            deepLink: `/admin/orders/${orderHumanId}`,
                        },
                    })
                ));
            } catch (e) {
                logger.error('[ADMIN_NOTIF_ERROR]', { message: e.message });
            }

            try {
                const vendorIds = [...new Set(
                    (order.vendorItems && order.vendorItems.length > 0)
                        ? order.vendorItems.map(v => String(v.vendorId)).filter(Boolean)
                        : order.items.map(i => String(i.vendorId)).filter(Boolean)
                )];
                await Promise.allSettled(vendorIds.map(vId =>
                    createNotification({
                        recipientId:   vId,
                        recipientType: 'vendor',
                        title:         'New Order Received',
                        message:       `You have received a new order #${orderHumanId}.`,
                        type:          'order',
                        eventKey:      `order:${orderHumanId}:vendor_received:${vId}`,
                        deepLink:      `/vendor/orders/${orderHumanId}`,
                        data:          {
                            orderId: String(orderHumanId),
                            orderMongoId: String(order._id),
                            recipientRole: 'vendor',
                            deepLink: `/vendor/orders/${orderHumanId}`,
                        },
                    })
                ));
            } catch (e) {
                logger.error('[VENDOR_NOTIF_ERROR]', { message: e.message });
            }
        } catch (notifErr) {
            logger.error('[NOTIFICATION_ERROR] Post-payment notification failed:', { message: notifErr.message });
        }

        order.status = 'pending';
        order.paymentStatus = 'paid';

        try {
            await sendOrderConfirmationEmail(order, order.shippingAddress?.email);
        } catch (emailErr) {
            logger.error('[EMAIL_ERROR] Order confirmation email failed:', { message: emailErr.message });
        }

        try {
            await notifyOrderUpdate(order);
        } catch (socketErr) {
            logger.error('[SOCKET_ERROR] Socket update failed:', { message: socketErr.message });
        }
    }
}
