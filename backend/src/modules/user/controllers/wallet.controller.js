import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Order from '../../../models/Order.model.js';
import Payment from '../../../models/Payment.model.js';
import PaymentAttempt from '../../../models/PaymentAttempt.model.js';
import Commission from '../../../models/Commission.model.js';
import Product from '../../../models/Product.model.js';
import Coupon from '../../../models/Coupon.model.js';
import mongoose from 'mongoose';
import { getWallet, debitWallet, getWalletTransactions } from '../../../services/wallet.service.js';
import { createNotification } from '../../../services/notification.service.js';
import { sendOrderConfirmationEmail } from '../../../services/email.service.js';
import { notifyOrderUpdate } from '../../../services/socket.service.js';
import { findMatchingVariantKey, encodeVariantKey } from '../../../utils/variantKeyHelper.js';
import { buildCommissionDocsFromOrder } from '../../../services/orderFinancialHelper.js';

/**
 * @desc    Get logged-in user's wallet
 * @route   GET /api/user/wallet
 * @access  Private (Customer)
 */
export const getCustomerWallet = asyncHandler(async (req, res) => {
    const wallet = await getWallet(req.user.id);
    res.status(200).json(new ApiResponse(200, wallet, 'Wallet details fetched successfully'));
});

/**
 * @desc    Get logged-in user's wallet transactions
 * @route   GET /api/user/wallet/transactions
 * @access  Private (Customer)
 */
export const getCustomerWalletTransactions = asyncHandler(async (req, res) => {
    const { type, transactionType, startDate, endDate, page = 1, limit = 20 } = req.query;
    const filters = {
        type,
        transactionType,
        startDate,
        endDate,
        page: parseInt(page, 10) || 1,
        limit: parseInt(limit, 10) || 20,
    };

    const data = await getWalletTransactions(req.user.id, filters);
    res.status(200).json(new ApiResponse(200, data, 'Wallet transactions fetched successfully'));
});

/**
 * @desc    Pay for a pending order fully using wallet balance
 * @route   POST /api/user/wallet/pay
 * @access  Private (Customer)
 */
export const payWithWallet = asyncHandler(async (req, res) => {
    const { orderId } = req.body;
    const userId = req.user.id;

    if (!orderId) {
        throw new ApiError(400, 'Order ID is required');
    }

    const order = await Order.findOne({ orderId, userId });
    if (!order) {
        throw new ApiError(404, 'Order not found');
    }

    if (order.status !== 'payment_pending') {
        throw new ApiError(400, `Order is not in payment_pending status (current: ${order.status})`);
    }

    // Only the unpaid part is due: a wallet share may already have been debited when the order was created
    // (debiting order.total again charged that share twice).
    const alreadyFromWallet = Number(order.walletAmountUsed || 0);
    const amountDue = Number((Number(order.total || 0) - alreadyFromWallet).toFixed(2));
    if (amountDue <= 0) {
        throw new ApiError(400, 'Nothing is left to pay on this order.');
    }
    const wallet = await getWallet(userId);
    if (wallet.balance < amountDue) {
        throw new ApiError(400, `Insufficient wallet balance to cover ₹${amountDue}`);
    }

    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            // 1. Debit wallet fully
            await debitWallet(userId, amountDue, 'wallet_payment', {
                orderId: order._id,
                reference: `ORDER_WALLET_PAY_${order._id}`,
                description: `Paid ₹${amountDue} using wallet for order #${order.orderId}`
            }, session);

            // 2. Deduct product variant stock atomically
            for (const item of order.items) {
                const qty = Number(item.quantity || 0);
                if (qty <= 0) continue;

                const baseFilter = {
                    _id:           item.productId,
                    stock:         { $ne: 'out_of_stock' },
                    stockQuantity: { $gte: qty },
                };

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
                    throw new ApiError(409, `Insufficient stock for item: ${item.name}`);
                }

                const nextStock = updatedProduct.stockQuantity <= 0 ? 'out_of_stock'
                    : updatedProduct.stockQuantity <= (updatedProduct.lowStockThreshold || 5) ? 'low_stock'
                    : 'in_stock';
                await Product.updateOne({ _id: updatedProduct._id }, { $set: { stock: nextStock } }, { session });
            }

            // 3. Vendor commissions from the checkout snapshot (never recomputed with current vendor rates)
            const existingCount = await Commission.countDocuments({ orderId: order._id }).session(session);
            if (existingCount === 0) {
                const commissionDocs = buildCommissionDocsFromOrder(order);
                await Commission.insertMany(commissionDocs, { session });
            }

            // 4. Increment coupon usage
            if (order.couponCode) {
                const couponFilter = order.couponId
                    ? { _id: order.couponId }
                    : { code: order.couponCode.toUpperCase() };
                await Coupon.updateOne(couponFilter, { $inc: { usedCount: 1 } }, { session });
            }

            // 5. Update Order status
            // Paid orders wait for vendor acceptance, as after an online capture.
            order.status = 'pending';
            order.paymentStatus = 'paid';
            order.paymentMethod = 'wallet';
            order.walletAmountUsed = order.total;
            await order.save({ session });

            // 6. Create payment record
            await Payment.create([{
                orderId: order._id,
                userId,
                amount: order.total,
                status: 'paid',
                method: 'wallet',
            }], { session });

            // 7. Expire pending payment attempts
            await PaymentAttempt.updateMany(
                { orderId: order._id, status: 'created' },
                { $set: { status: 'failed', notes: 'Paid fully via User Wallet' } },
                { session }
            );
        });
    } finally {
        await session.endSession();
    }

    // Trigger async side-effects
    createNotification({
        recipientId: userId,
        recipientType: 'user',
        title: 'Order Confirmed',
        message: `Your order #${order.orderId} has been confirmed successfully!`,
        type: 'order',
        data: { orderId: String(order._id) },
    }).catch(console.error);

    try {
        await sendOrderConfirmationEmail(order, order.shippingAddress?.email || req.user?.email);
    } catch (e) {
        console.error('[payWithWallet Email Error]', e.message);
    }

    notifyOrderUpdate(order).catch(console.error);

    res.status(200).json(new ApiResponse(200, { orderId: order.orderId }, 'Order paid successfully with wallet balance'));
});
