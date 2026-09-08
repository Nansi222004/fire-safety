import mongoose from 'mongoose';
import logger from '../utils/logger.js';
import Order from '../models/Order.model.js';
import Product from '../models/Product.model.js';
import Commission from '../models/Commission.model.js';
import Coupon from '../models/Coupon.model.js';
import Refund from '../models/Refund.model.js';
import Shipment from '../models/Shipment.model.js';
import PaymentAttempt from '../models/PaymentAttempt.model.js';
import { processRazorpayRefund } from './payment.service.js';
import { cancelShipmentDeliveryAssignment } from './assignmentService.js';

const resolveOrderItemVariantKey = (productSnapshot, item) => {
    if (item?.variantKey) return item.variantKey;
    const variantObject = item?.variant || {};
    const size = String(variantObject?.size || '').trim();
    const color = String(variantObject?.color || '').trim();
    if (!size && !color) return null;
    const stockMap = productSnapshot?.variants?.stockMap;
    if (!stockMap) return null;
    const keys = stockMap instanceof Map ? Array.from(stockMap.keys()) : Object.keys(stockMap);
    for (const key of keys) {
        const parts = String(key).split('_');
        const keySize = parts[0] || '';
        const keyColor = parts[1] || '';
        if (
            (!size || keySize.toLowerCase() === size.toLowerCase()) &&
            (!color || keyColor.toLowerCase() === color.toLowerCase())
        ) {
            return key;
        }
    }
    return null;
};

/**
 * Reusable cancellation refund and inventory restoration processor.
 * Safely handles Full Order and Partial Package cancellations by User, Vendor, or Admin.
 */
export const processCancellationRefund = async ({
    orderId,
    vendorGroupId = null,
    cancelledBy = 'system',
    reason = 'Cancelled',
    comment = '',
    session = null,
}) => {
    let internalSession = session;
    let ownsSession = false;

    if (!internalSession) {
        internalSession = await mongoose.startSession();
        internalSession.startTransaction();
        ownsSession = true;
    }

    try {
        const query = mongoose.Types.ObjectId.isValid(orderId)
            ? { _id: orderId }
            : { orderId: orderId };

        const order = await Order.findOne(query).session(internalSession);
        if (!order) {
            throw new Error(`Order ${orderId} not found for cancellation.`);
        }

        let refundAmount = 0;
        let refundReference = '';
        let refundNotes = '';
        let pendingRzpCall = null;

        if (!vendorGroupId) {
            // ─────────────────────────────────────────────────────────────────
            // FULL ORDER CANCELLATION
            // ─────────────────────────────────────────────────────────────────
            const originalStatus = order.status;
            order.status = 'cancelled';
            order.cancelledAt = new Date();
            order.cancellationReason = reason;

            if (Array.isArray(order.vendorItems)) {
                order.vendorItems = order.vendorItems.map((vg) => ({
                    ...(vg.toObject ? vg.toObject() : vg),
                    status: 'cancelled',
                    cancelledAt: new Date(),
                    cancelledBy,
                    cancellationReason: reason,
                    cancellationComment: comment,
                }));
            }

            // Calculate refund amount
            if (order.paymentStatus === 'paid') {
                refundAmount = Number(order.total || 0);
            }

            refundReference = `ORDER_CANCEL_REFUND_${order._id}`;
            refundNotes = `Refund: Order #${order.orderId} cancelled by ${cancelledBy} (${reason})`;

            // Idempotency: verify if refund already completed or processing
            const existingRefund = await Refund.findOne({ referenceId: refundReference }).session(internalSession);
            if (existingRefund && (existingRefund.status === 'completed' || existingRefund.status === 'processing')) {
                return { order, refundAmount: existingRefund.amount, refund: existingRefund, duplicate: true };
            }

            // Cumulative partial refund protection: verify remaining refundable amount
            const capturedAmount = Number(order.total || 0);
            const existingCompletedRefunds = await Refund.find({
                orderId: order._id,
                status: { $in: ['completed', 'processing'] }
            }).session(internalSession);
            const alreadyRefunded = existingCompletedRefunds.reduce((sum, r) => sum + Number(r.amount || 0), 0);
            const remainingRefundable = parseFloat(Math.max(0, capturedAmount - alreadyRefunded).toFixed(2));
            const eligibleRefundAmount = Math.min(refundAmount, remainingRefundable);

            if ((order.paymentStatus === 'paid' || order.paymentStatus === 'partially_refunded') && eligibleRefundAmount > 0) {
                const paidAttempt = await PaymentAttempt.findOne({ orderId: order._id, status: 'paid' })
                    .sort({ updatedAt: -1 })
                    .session(internalSession);

                if (paidAttempt && paidAttempt.razorpayPaymentId) {
                    const [createdRefund] = await Refund.create(
                        [
                            {
                                orderId: order._id,
                                userId: order.userId,
                                paymentAttemptId: paidAttempt._id,
                                amount: eligibleRefundAmount,
                                referenceId: refundReference,
                                method: 'razorpay',
                                destination: 'original_source',
                                status: 'processing',
                                razorpayPaymentId: paidAttempt.razorpayPaymentId,
                                paymentMethod: order.paymentMethod || 'razorpay',
                                refundInitiatedAt: new Date(),
                                notes: refundNotes,
                            },
                        ],
                        { session: internalSession }
                    );

                    pendingRzpCall = {
                        refundRecordId: createdRefund._id,
                        paymentId: paidAttempt.razorpayPaymentId,
                        amount: eligibleRefundAmount,
                        reference: refundReference,
                        isFull: true,
                    };

                    order.paymentStatus = 'refund_queued';
                } else {
                    // Online paid but no payment attempt? Record failure, do not credit wallet!
                    await Refund.create(
                        [
                            {
                                orderId: order._id,
                                userId: order.userId,
                                amount: eligibleRefundAmount,
                                referenceId: refundReference,
                                method: 'razorpay',
                                destination: 'original_source',
                                status: 'failed',
                                failureReason: 'Original captured Razorpay payment ID could not be resolved',
                                notes: refundNotes,
                            },
                        ],
                        { session: internalSession }
                    );
                }
                refundAmount = eligibleRefundAmount;
            }

            await order.save({ session: internalSession });

            // Restore Product Inventory Stock
            if (originalStatus !== 'payment_pending') {
                for (const item of order.items || []) {
                    const quantity = Number(item.quantity || 0);
                    if (quantity <= 0) continue;

                    const productSnapshot = await Product.findById(item.productId)
                        .select('variants.stockMap variants.prices')
                        .session(internalSession)
                        .lean();
                    const variantKey = resolveOrderItemVariantKey(productSnapshot, item);

                    const incUpdate = { stockQuantity: quantity };
                    if (variantKey) {
                        incUpdate[`variants.stockMap.${variantKey}`] = quantity;
                    }

                    const product = await Product.findByIdAndUpdate(
                        item.productId,
                        { $inc: incUpdate },
                        { new: true, session: internalSession }
                    );
                    if (!product) continue;

                    const nextStockState =
                        product.stockQuantity <= 0
                            ? 'out_of_stock'
                            : product.stockQuantity <= product.lowStockThreshold
                            ? 'low_stock'
                            : 'in_stock';

                    await Product.updateOne(
                        { _id: product._id },
                        { $set: { stock: nextStockState } },
                        { session: internalSession }
                    );
                }
            }

            // Restore Coupon Usage Slot
            if (order.couponCode) {
                const couponFilter = order.couponId
                    ? { _id: order.couponId, usedCount: { $gt: 0 } }
                    : { code: order.couponCode.toUpperCase(), usedCount: { $gt: 0 } };
                await Coupon.updateOne(
                    couponFilter,
                    { $inc: { usedCount: -1 } },
                    { session: internalSession }
                );
            }

            // Reverse Vendor Commissions
            await Commission.updateMany(
                {
                    orderId: order._id,
                    status: { $ne: 'cancelled' },
                },
                {
                    $set: {
                        status: 'cancelled',
                        escrowStatus: 'cancelled',
                        paidAt: null,
                        settlementId: null,
                    },
                },
                { session: internalSession }
            );

            // Cancel all associated shipments (guard against transit)
            const shipments = await Shipment.find({ orderId: order._id }).session(internalSession);
            const PHYSICAL_TRANSIT_STATUSES = ['picked_up', 'shipped', 'in_transit', 'out_for_delivery'];
            const inTransitShipment = (shipments || []).find(s => PHYSICAL_TRANSIT_STATUSES.includes(s.status));
            if (inTransitShipment) {
                throw new Error(
                    `Cannot cancel order: Shipment #${inTransitShipment.shipmentNumber || inTransitShipment._id} is already in '${inTransitShipment.status}' status with delivery partner.`
                );
            }

            for (const shipment of shipments) {
                await cancelShipmentDeliveryAssignment(shipment._id, reason, internalSession);
            }

        } else {
            // ─────────────────────────────────────────────────────────────────
            // PARTIAL PACKAGE / VENDOR GROUP CANCELLATION
            // ─────────────────────────────────────────────────────────────────
            const vGroupIndex = (order.vendorItems || []).findIndex(
                (vg) =>
                    String(vg._id) === String(vendorGroupId) ||
                    String(vg.vendorId) === String(vendorGroupId)
            );

            if (vGroupIndex === -1) {
                throw new Error(`Vendor package ${vendorGroupId} not found in order ${orderId}.`);
            }

            const targetVendorGroup = order.vendorItems[vGroupIndex];
            if (targetVendorGroup.status === 'cancelled') {
                return { order, refundAmount: 0, skipped: true };
            }

            targetVendorGroup.status = 'cancelled';
            targetVendorGroup.cancelledAt = new Date();
            targetVendorGroup.cancelledBy = cancelledBy;
            targetVendorGroup.cancellationReason = reason;
            targetVendorGroup.cancellationComment = comment;

            // Calculate financial refund for this package
            const productAmount = parseFloat((targetVendorGroup.subtotal || 0).toFixed(2));
            const taxRefund = parseFloat((targetVendorGroup.tax || 0).toFixed(2));
            const shippingRefund = parseFloat((targetVendorGroup.shipping || 0).toFixed(2));
            const discountAdjustment = parseFloat((targetVendorGroup.discount || 0).toFixed(2));
            const calculatedRefund = parseFloat(
                (productAmount - discountAdjustment + taxRefund + shippingRefund).toFixed(2)
            );

            targetVendorGroup.refundBreakdown = {
                productAmount,
                taxRefund,
                shippingRefund,
                discountAdjustment: -discountAdjustment,
                finalRefund: calculatedRefund,
            };

            refundReference = `PARTIAL_CANCEL_${order._id}_${targetVendorGroup.vendorId}`;
            refundNotes = `Partial Refund: ${targetVendorGroup.vendorName} package cancelled by ${cancelledBy} (${reason})`;

            // Idempotency: verify if partial refund already completed or processing
            const existingPartialRefund = await Refund.findOne({ referenceId: refundReference }).session(internalSession);
            if (existingPartialRefund && (existingPartialRefund.status === 'completed' || existingPartialRefund.status === 'processing')) {
                return { order, refundAmount: existingPartialRefund.amount, refund: existingPartialRefund, duplicate: true };
            }

            // Cumulative partial refund protection: verify remaining refundable amount
            const capturedAmount = Number(order.total || 0);
            const existingCompletedRefunds = await Refund.find({
                orderId: order._id,
                status: { $in: ['completed', 'processing'] }
            }).session(internalSession);
            const alreadyRefunded = existingCompletedRefunds.reduce((sum, r) => sum + Number(r.amount || 0), 0);
            const remainingRefundable = parseFloat(Math.max(0, capturedAmount - alreadyRefunded).toFixed(2));
            const eligibleRefundAmount = Math.min(calculatedRefund, remainingRefundable);

            if ((order.paymentStatus === 'paid' || order.paymentStatus === 'partially_refunded') && eligibleRefundAmount > 0) {
                refundAmount = eligibleRefundAmount;
                const paidAttempt = await PaymentAttempt.findOne({ orderId: order._id, status: 'paid' })
                    .sort({ updatedAt: -1 })
                    .session(internalSession);

                if (paidAttempt && paidAttempt.razorpayPaymentId) {
                    const [createdRefund] = await Refund.create(
                        [
                            {
                                orderId: order._id,
                                userId: order.userId,
                                paymentAttemptId: paidAttempt._id,
                                amount: refundAmount,
                                referenceId: refundReference,
                                method: 'razorpay',
                                destination: 'original_source',
                                status: 'processing',
                                razorpayPaymentId: paidAttempt.razorpayPaymentId,
                                paymentMethod: order.paymentMethod || 'razorpay',
                                refundInitiatedAt: new Date(),
                                notes: refundNotes,
                            },
                        ],
                        { session: internalSession }
                    );

                    pendingRzpCall = {
                        refundRecordId: createdRefund._id,
                        paymentId: paidAttempt.razorpayPaymentId,
                        amount: refundAmount,
                        reference: refundReference,
                        isFull: false,
                    };

                    targetVendorGroup.refundedAmount = refundAmount;
                } else {
                    await Refund.create(
                        [
                            {
                                orderId: order._id,
                                userId: order.userId,
                                amount: refundAmount,
                                referenceId: refundReference,
                                method: 'razorpay',
                                destination: 'original_source',
                                status: 'failed',
                                failureReason: 'Original captured Razorpay payment ID could not be resolved',
                                notes: refundNotes,
                            },
                        ],
                        { session: internalSession }
                    );
                }
            }

            // Restore Inventory Stock for target vendor items
            for (const item of targetVendorGroup.items || []) {
                const quantity = Number(item.quantity || 0);
                if (quantity <= 0) continue;

                const productSnapshot = await Product.findById(item.productId)
                    .select('variants.stockMap variants.prices')
                    .session(internalSession)
                    .lean();
                const variantKey = resolveOrderItemVariantKey(productSnapshot, item);

                const incUpdate = { stockQuantity: quantity };
                if (variantKey) {
                    incUpdate[`variants.stockMap.${variantKey}`] = quantity;
                }

                const product = await Product.findByIdAndUpdate(
                    item.productId,
                    { $inc: incUpdate },
                    { new: true, session: internalSession }
                );
                if (product) {
                    const nextStockState =
                        product.stockQuantity <= 0
                            ? 'out_of_stock'
                            : product.stockQuantity <= product.lowStockThreshold
                            ? 'low_stock'
                            : 'in_stock';

                    await Product.updateOne(
                        { _id: product._id },
                        { $set: { stock: nextStockState } },
                        { session: internalSession }
                    );
                }
            }

            // Cancel shipment for this vendor (guard against transit)
            const shipment = await Shipment.findOne({
                orderId: order._id,
                vendorId: targetVendorGroup.vendorId,
            }).session(internalSession);

            const PHYSICAL_TRANSIT_STATUSES = ['picked_up', 'shipped', 'in_transit', 'out_for_delivery'];
            if (shipment && PHYSICAL_TRANSIT_STATUSES.includes(shipment.status)) {
                throw new Error(
                    `Cannot cancel package: Shipment #${shipment.shipmentNumber || shipment._id} is already in '${shipment.status}' status with delivery partner.`
                );
            }

            if (shipment) {
                await cancelShipmentDeliveryAssignment(shipment._id, reason, internalSession);
            }

            // Cancel commission for this vendor
            await Commission.updateMany(
                {
                    orderId: order._id,
                    vendorId: targetVendorGroup.vendorId,
                    status: { $ne: 'cancelled' },
                },
                {
                    $set: {
                        status: 'cancelled',
                        escrowStatus: 'cancelled',
                        paidAt: null,
                        settlementId: null,
                    },
                },
                { session: internalSession }
            );

            // Re-evaluate overall order status & payment status
            const remainingGroups = (order.vendorItems || []).filter((v) => v.status !== 'cancelled');
            if (remainingGroups.length === 0) {
                order.status = 'cancelled';
                order.cancelledAt = new Date();
                order.cancellationReason = reason;
                if (order.paymentStatus === 'paid' || order.paymentStatus === 'partially_refunded') {
                    order.paymentStatus = 'refunded';
                }
            } else {
                const anyDelivered = remainingGroups.some((v) => v.status === 'delivered');
                order.status = anyDelivered ? 'partially_delivered' : 'partially_cancelled';
                if (order.paymentStatus === 'paid') {
                    order.paymentStatus = 'partially_refunded';
                }
            }

            await order.save({ session: internalSession });
        }

        if (ownsSession) {
            await internalSession.commitTransaction();
        }

        // Post-commit external Razorpay refund invocation (safe from DB rollback)
        if (pendingRzpCall) {
            try {
                const rzpRes = await processRazorpayRefund({
                    paymentId: pendingRzpCall.paymentId,
                    amountInRupees: pendingRzpCall.amount,
                    reference: pendingRzpCall.reference,
                    notes: { orderId: String(order._id), reason, cancelledBy },
                });

                const isCompleted = rzpRes.status === 'completed';
                await Refund.findByIdAndUpdate(pendingRzpCall.refundRecordId, {
                    $set: {
                        status: isCompleted ? 'completed' : 'processing',
                        razorpayRefundId: rzpRes.refundId,
                        ...(isCompleted ? { refundCompletedAt: new Date() } : {}),
                    },
                });

                if (isCompleted) {
                    const allCompletedRefunds = await Refund.find({
                        orderId: order._id,
                        status: 'completed',
                    });
                    const totalRefundedSoFar = allCompletedRefunds.reduce((sum, r) => sum + (r.amount || 0), 0);
                    const isFullyRefunded = pendingRzpCall.isFull || totalRefundedSoFar >= (order.total || 0);
                    const nextPaymentStatus = isFullyRefunded ? 'refunded' : 'partially_refunded';
                    await Order.findByIdAndUpdate(order._id, { $set: { paymentStatus: nextPaymentStatus } });
                    order.paymentStatus = nextPaymentStatus;
                }
            } catch (rzpErr) {
                logger.error(`[Razorpay Refund Error] Order ${order._id}:`, rzpErr.message);
                if (rzpErr.isTimeout) {
                    await Refund.findByIdAndUpdate(pendingRzpCall.refundRecordId, {
                        $set: {
                            isAmbiguousTimeout: true,
                            failureReason: 'Gateway request timed out — marked processing for webhook/reconciliation',
                        },
                    });
                } else {
                    await Refund.findByIdAndUpdate(pendingRzpCall.refundRecordId, {
                        $set: {
                            status: 'failed',
                            failureReason: rzpErr.message || 'Razorpay refund failed',
                        },
                    });
                }
            }
        }

        const latestRefund = pendingRzpCall
            ? await Refund.findById(pendingRzpCall.refundRecordId)
            : await Refund.findOne({ referenceId: refundReference });

        return { order, refundAmount, refund: latestRefund };
    } catch (err) {
        if (ownsSession) {
            await internalSession.abortTransaction();
        }
        logger.error(`[CANCELLATION_REFUND_ERROR] Failed for order ${orderId}:`, err.message);
        throw err;
    } finally {
        if (ownsSession) {
            await internalSession.endSession();
        }
    }
};
