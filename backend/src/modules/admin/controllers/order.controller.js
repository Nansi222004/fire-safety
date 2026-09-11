import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Order from '../../../models/Order.model.js';
import DeliveryBoy from '../../../models/DeliveryBoy.model.js';
import User from '../../../models/User.model.js';
import Commission from '../../../models/Commission.model.js';
import Product from '../../../models/Product.model.js';
import Vendor from '../../../models/Vendor.model.js';
import { createNotification } from '../../../services/notification.service.js';
import { notifyOrderUpdate } from '../../../services/socket.service.js';
import { buildOrderItemsSummary, buildVendorItemsSummary } from '../../../utils/notificationProductFormatter.js';
import { handleOrderDeliveryBalances } from '../../../services/orderFinancialHelper.js';
import mongoose from 'mongoose';
import { processDeliveryBoyPayout } from '../../../services/deliveryPayout.service.js';
import Shipment from '../../../models/Shipment.model.js';
import Coupon from '../../../models/Coupon.model.js';
import Refund from '../../../models/Refund.model.js';
import AuditLog from '../../../models/AuditLog.model.js';
import VendorWalletTransaction from '../../../models/VendorWalletTransaction.model.js';
import PaymentAttempt from '../../../models/PaymentAttempt.model.js';
import { processRazorpayRefund } from '../../../services/payment.service.js';
import { cancelShipmentDeliveryAssignment } from '../../../services/assignmentService.js';
import { processCancellationRefund } from '../../../services/cancellationRefundService.js';
import { ensureDeliveryOtpForShipment } from '../../../services/deliveryOtp.service.js';

// GET /api/admin/orders
export const getAllOrders = asyncHandler(async (req, res) => {
    const { status, page = 1, limit = 20, search, startDate, endDate, userId } = req.query;
    const numericPage = Number(page) || 1;
    const numericLimit = Number(limit) || 20;
    const skip = (numericPage - 1) * numericLimit;
    let filter = { isDeleted: { $ne: true } };

    if (status && status !== 'all') {
        const deliveryStatuses = ['ready_for_pickup', 'shipped', 'out_for_delivery', 'delivered'];
        if (deliveryStatuses.includes(status)) {
            const matchingShipments = await mongoose.model('Shipment').find({ status }).select('orderId').lean();
            const orderIds = matchingShipments.map(s => s.orderId);
            if (filter._id) {
                filter._id.$in = filter._id.$in.filter(id => orderIds.some(oid => String(oid) === String(id)));
            } else {
                filter._id = { $in: orderIds };
            }
        } else {
            filter.status = status;
        }
    }
    
    if (String(req.query.assignableOnly || '') === 'true' && !filter.status) {
        filter.status = { $in: ['pending', 'processing', 'shipped'] };
    }
    if (search) {
        const regex = new RegExp(search, 'i');
        const matchedUsers = await User.find({
            $or: [{ name: regex }, { email: regex }, { phone: regex }]
        }).select('_id').limit(200).lean();
        const matchedUserIds = matchedUsers.map((u) => u._id);

        filter.$or = [
            { orderId: regex },
            { 'shippingAddress.name': regex },
            { 'shippingAddress.email': regex },
            ...(matchedUserIds.length > 0 ? [{ userId: { $in: matchedUserIds } }] : []),
        ];
    }
    if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) filter.createdAt.$gte = new Date(startDate);
        if (endDate) filter.createdAt.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }
    if (req.query.vendorId) {
        filter['vendorItems.vendorId'] = req.query.vendorId;
    }
    if (userId) {
        filter.userId = userId;
    }
    if (String(req.query.onlyUnassigned || '') === 'true') {
        const unassignedShipments = await mongoose.model('Shipment').find({
            deliveryBoyId: { $in: [null, undefined] },
            status: { $nin: ['delivered', 'cancelled', 'returned'] } // Only active shipments
        }).select('orderId').lean();
        const orderIds = unassignedShipments.map(s => s.orderId);
        filter._id = { $in: orderIds };
    }

    const [orders, total] = await Promise.all([
        Order.find(filter)
            .populate('userId', 'name email phone')
            .populate({
                path: 'shipments',
                populate: { path: 'deliveryBoyId', select: 'name phone' }
            })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(numericLimit)
            .lean(),
        Order.countDocuments(filter),
    ]);

    const ordersWithDynamicStatus = orders.map(order => {
        if (order.shipments && order.shipments.length > 0) {
            const allDelivered = order.shipments.every(s => s.status === 'delivered');
            const anyShipped = order.shipments.some(s => ['shipped', 'out_for_delivery'].includes(s.status));
            const anyReady = order.shipments.some(s => s.status === 'ready_for_pickup');
            
            if (allDelivered) {
                order.status = 'delivered';
                order.deliveredAt = order.shipments.find(s => s.deliveredAt)?.deliveredAt || new Date();
            } else if (anyShipped) {
                order.status = 'shipped';
            } else if (anyReady) {
                order.status = 'ready_for_pickup';
            }
        }
        return order;
    });

    res.status(200).json(new ApiResponse(200, {
        orders: ordersWithDynamicStatus,
        total,
        page: numericPage,
        pages: Math.ceil(total / numericLimit),
    }, 'Orders fetched.'));
});

// GET /api/admin/orders/:id
export const getOrderById = asyncHandler(async (req, res) => {
    const order = await Order.findOne({
        $or: [{ orderId: req.params.id }, { _id: req.params.id.match(/^[0-9a-fA-F]{24}$/) ? req.params.id : null }],
        isDeleted: { $ne: true },
    })
        .populate('userId', 'name email phone')
        .populate({
            path: 'shipments',
            populate: { path: 'deliveryBoyId', select: 'name phone email vehicleType vehicleNumber' }
        })
        .populate('items.productId', 'name images price')
        .lean();

    if (!order) throw new ApiError(404, 'Order not found.');

    const commissions = await Commission.find({ orderId: order._id }).lean();
    order.commissions = commissions || [];
    const refunds = await Refund.find({ orderId: order._id }).sort({ createdAt: -1 }).lean();
    order.refunds = refunds || [];
    const paymentAttempts = await PaymentAttempt.find({ orderId: order._id }).sort({ createdAt: -1 }).lean();
    order.paymentAttempts = paymentAttempts || [];

    if (order.shipments && order.shipments.length > 0) {
        const allDelivered = order.shipments.every(s => s.status === 'delivered');
        const anyShipped = order.shipments.some(s => ['shipped', 'out_for_delivery'].includes(s.status));
        const anyReady = order.shipments.some(s => s.status === 'ready_for_pickup');
        
        if (allDelivered) {
            order.status = 'delivered';
            order.deliveredAt = order.shipments.find(s => s.deliveredAt)?.deliveredAt || new Date();
        } else if (anyShipped) {
            order.status = 'shipped';
        } else if (anyReady) {
            order.status = 'ready_for_pickup';
        }
    }

    res.status(200).json(new ApiResponse(200, order, 'Order fetched.'));
});

// PATCH /api/admin/orders/:id/status
export const updateOrderStatus = asyncHandler(async (req, res) => {
    const { status } = req.body;
    const allowed = ['pending', 'processing', 'ready_for_pickup', 'shipped', 'delivered', 'cancelled', 'returned'];
    if (!allowed.includes(status)) throw new ApiError(400, `Status must be one of: ${allowed.join(', ')}`);

    const order = await Order.findOne({
        $or: [{ orderId: req.params.id }, { _id: req.params.id.match(/^[0-9a-fA-F]{24}$/) ? req.params.id : null }],
        isDeleted: { $ne: true },
    }).populate('userId', 'name email');

    if (!order) throw new ApiError(404, 'Order not found.');

    const nextStatus = String(status || '').toLowerCase();
    if (nextStatus === 'cancelled') {
        // Guard against destructive cancellation if goods are physically in transit with delivery partner
        const shipments = await mongoose.model('Shipment').find({ orderId: order._id }).lean();
        const PHYSICAL_TRANSIT_STATUSES = ['picked_up', 'shipped', 'in_transit', 'out_for_delivery'];
        const inTransitShipment = (shipments || []).find(s => PHYSICAL_TRANSIT_STATUSES.includes(s.status));
        if (inTransitShipment) {
            throw new ApiError(
                400,
                `Cannot cancel order because shipment #${inTransitShipment.shipmentNumber || inTransitShipment._id} is already in '${inTransitShipment.status}' status with delivery partner. Reverse logistics or return workflow must be used.`
            );
        }

        const result = await processCancellationRefund({
            orderId: order._id,
            cancelledBy: 'admin',
            reason: req.body.reason || 'Cancelled by admin',
            comment: req.body.comment || '',
        });

        notifyOrderUpdate(result.order || order);

        // Notifications after successful cancellation
        const customerId = order.userId?._id || order.userId;
        if (customerId) {
            const refundMsg = (result.refundAmount || 0) > 0
                ? (order.paymentMethod === 'cod'
                    ? ' No refund applicable for Cash on Delivery.'
                    : ` ₹${result.refundAmount} refund initiated to your original payment method. Your bank/UPI provider may take additional time to credit the amount.`)
                : '';
            createNotification({
                recipientId: customerId,
                recipientType: 'user',
                title: 'Order Cancelled by Admin',
                message: `Your Order #${order.orderId} has been cancelled by Admin.${refundMsg}`,
                type: 'order',
                data: { orderId: String(order._id), refundAmount: result.refundAmount || 0 }
            }).catch(err => console.error('[Admin Order Cancel Notification Customer Error]:', err.message));
        }

        for (const vg of (order.vendorItems || [])) {
            if (vg.vendorId) {
                createNotification({
                    recipientId: vg.vendorId,
                    recipientType: 'vendor',
                    title: 'Order Cancelled by Admin',
                    message: `Order #${order.orderId} has been cancelled by Admin. Reason: ${req.body.reason || 'Cancelled by admin'}`,
                    type: 'order',
                    data: { orderId: String(order._id) }
                }).catch(err => console.error('[Admin Order Cancel Notification Vendor Error]:', err.message));
            }
        }

        return res.status(200).json(new ApiResponse(200, result.order || order, `Order cancelled by admin and refund of ₹${result.refundAmount || 0} processed.`));
    }

    let currentDynamicStatus = String(order.status || '').toLowerCase();
    
    // Dynamically calculate status from shipments (if any exist)
    const shipments = await mongoose.model('Shipment').find({ orderId: order._id }).lean();
    if (shipments && shipments.length > 0) {
        const allDelivered = shipments.every(s => s.status === 'delivered');
        const anyShipped = shipments.some(s => ['shipped', 'out_for_delivery'].includes(s.status));
        const anyReady = shipments.some(s => s.status === 'ready_for_pickup');
        
        if (allDelivered) currentDynamicStatus = 'delivered';
        else if (anyShipped) currentDynamicStatus = 'shipped';
        else if (anyReady) currentDynamicStatus = 'ready_for_pickup';
    }

    const previousStatus = currentDynamicStatus;

    const allowedTransitions = {
        pending:          ['processing', 'cancelled'],
        processing:       ['ready_for_pickup', 'shipped', 'cancelled'],
        ready_for_pickup: ['shipped', 'cancelled'],
        shipped:          ['delivered', 'cancelled', 'returned'],
        delivered:        ['returned'],
        cancelled:        [],
        returned:         [],
    };

    if (previousStatus !== nextStatus) {
        const nextAllowed = allowedTransitions[previousStatus] || [];
        if (!nextAllowed.includes(nextStatus)) {
            throw new ApiError(409, `Cannot move order from '${previousStatus}' to '${nextStatus}'.`);
        }
    }

    // Legacy delivery boy payout trigger removed (Phase 9.1).
    // Payouts are now triggered exclusively by Shipment lifecycle events,
    // not by manual Order status updates in the admin panel.

    order.status = nextStatus;
    if (nextStatus === 'delivered') {
        order.deliveredAt = new Date();
        order.cancelledAt = null;
    } else if (nextStatus === 'cancelled') {
        order.cancelledAt = new Date();
    } else if (nextStatus === 'returned') {
        order.cancelledAt = null;
    } else {
        order.deliveredAt = null;
        order.cancelledAt = null;
    }

    if (nextStatus === 'processing') {
        order.vendorItems = (order.vendorItems || []).map((vi) => {
            const current = String(vi?.status || 'pending');
            if (current === 'cancelled' || current === 'delivered') return vi;
            return { ...vi.toObject(), status: 'processing' };
        });
    }
    await order.save();
        if (nextStatus === 'shipped') {
            order.vendorItems = (order.vendorItems || []).map((vi) => {
                const current = String(vi?.status || 'pending');
                if (current === 'cancelled' || current === 'delivered') return vi;
                return { ...vi.toObject(), status: 'shipped' };
            });
            const ownFleetShipments = await Shipment.find({
                orderId: order._id,
                $or: [{ providerId: 'own_fleet' }, { deliveryBoyId: { $ne: null } }]
            });
            for (const s of ownFleetShipments) {
                s.status = 'shipped';
                await s.save();
                await ensureDeliveryOtpForShipment(s, order);
            }
        }
        if (nextStatus === 'delivered') {
            order.vendorItems = (order.vendorItems || []).map((vi) => {
                const current = String(vi?.status || 'pending');
                if (current === 'cancelled') return vi;
                return { ...vi.toObject(), status: 'delivered' };
            });
        }
        if (nextStatus === 'cancelled') {
            order.vendorItems = (order.vendorItems || []).map((vi) => {
                const current = String(vi?.status || 'pending');
                if (current === 'delivered') return vi;
                return { ...vi.toObject(), status: 'cancelled' };
            });
        }

        if (nextStatus === 'cancelled' && previousStatus !== 'cancelled' && ['pending', 'processing', 'shipped'].includes(previousStatus)) {
            for (const item of order.items || []) {
                const product = await Product.findById(item.productId);
                if (!product) continue;
                product.stockQuantity += Number(item.quantity || 0);
                if (product.stockQuantity <= 0) product.stock = 'out_of_stock';
                else if (product.stockQuantity <= product.lowStockThreshold) product.stock = 'low_stock';
                else product.stock = 'in_stock';
                await product.save();
            }
        }

        await handleOrderDeliveryBalances(order);
        await order.save();
        
    notifyOrderUpdate(order);

    if (nextStatus === 'cancelled') {
        // Reverse vendor earnings visibility for this order.
        // Keep it idempotent by only updating commissions not already cancelled.
        await Commission.updateMany(
            {
                orderId: order._id,
                status: { $ne: 'cancelled' },
            },
            {
                $set: {
                    status: 'cancelled',
                    paidAt: null,
                    settlementId: null,
                },
            }
        );
    }

    const notificationTasks = [];
    const itemsText = buildOrderItemsSummary(order.items);

    if (order.userId) {
        notificationTasks.push(
            createNotification({
                recipientId: order.userId,
                recipientType: 'user',
                title: 'Order status updated',
                message: `Your order ${order.orderId} is now ${status}.${itemsText}`,
                type: 'order',
                data: {
                    orderId: String(order.orderId),
                    status: String(nextStatus),
                },
            })
        );
    }

    const vendorIds = [
        ...new Set(
            (order.vendorItems || [])
                .map((item) => String(item?.vendorId || '').trim())
                .filter(Boolean)
        ),
    ];

    vendorIds.forEach((vendorId) => {
        const vendorGroup = (order.vendorItems || []).find((vg) => String(vg.vendorId) === String(vendorId));
        const vItemsText = vendorGroup ? buildVendorItemsSummary(vendorGroup.items) : '';

        notificationTasks.push(
            createNotification({
                recipientId: vendorId,
                recipientType: 'vendor',
                title: 'Order status updated by admin',
                message: `Order ${order.orderId} was updated to ${status} by admin.${vItemsText}`,
                type: 'order',
                data: {
                    orderId: String(order.orderId),
                    status: String(nextStatus),
                },
            })
        );
    });

    const orderShipments = await mongoose.model('Shipment').find({ orderId: order._id, deliveryBoyId: { $exists: true, $ne: null } }).lean();
    const deliveryBoyIds = [...new Set(orderShipments.map(s => String(s.deliveryBoyId)))];

    deliveryBoyIds.forEach(boyId => {
        notificationTasks.push(
            createNotification({
                recipientId: boyId,
                recipientType: 'delivery',
                title: 'Assigned order updated',
                message: `Order ${order.orderId} is now ${status}.${itemsText}`,
                type: 'order',
                data: {
                    orderId: String(order.orderId),
                    status: String(nextStatus),
                },
            })
        );
    });

    if (notificationTasks.length > 0) {
        await Promise.allSettled(notificationTasks);
    }

    res.status(200).json(new ApiResponse(200, order, 'Order status updated.'));
});


// DELETE /api/admin/orders/:id
export const deleteOrder = asyncHandler(async (req, res) => {
    const order = await Order.findOneAndUpdate(
        {
            $or: [{ orderId: req.params.id }, { _id: req.params.id.match(/^[0-9a-fA-F]{24}$/) ? req.params.id : null }],
            isDeleted: { $ne: true },
        },
        {
            isDeleted: true,
            deletedAt: new Date(),
            deletedBy: req.user?.id || null,
        },
        { new: true }
    );
    if (!order) throw new ApiError(404, 'Order not found.');
    res.status(200).json(new ApiResponse(200, null, 'Order archived.'));
});

// PATCH /api/admin/orders/:id/items/:vendorItemId/cancel
export const adminOverrideCancelVendorItem = asyncHandler(async (req, res) => {
    const { id: orderIdParam, vendorItemId } = req.params;
    const { reason, comment, forceRefund } = req.body;
    const session = await mongoose.startSession();
    let updatedOrder = null;
    let cancelledVendorGroup = null;
    let calculatedRefund = 0;
    let pendingRzpCall = null;

    try {
        await session.withTransaction(async () => {
            const isMongoId = mongoose.Types.ObjectId.isValid(orderIdParam);
            const query = isMongoId
                ? { _id: orderIdParam }
                : { orderId: orderIdParam };

            const order = await Order.findOne(query).session(session);
            if (!order) throw new ApiError(404, 'Order not found.');

            const vendorGroupIndex = (order.vendorItems || []).findIndex(
                (vGroup) => String(vGroup._id) === String(vendorItemId) || String(vGroup.vendorId) === String(vendorItemId)
            );

            if (vendorGroupIndex === -1) {
                throw new ApiError(404, 'Package / Vendor items not found in this order.');
            }

            const targetVendorGroup = order.vendorItems[vendorGroupIndex];

            if (targetVendorGroup.status === 'cancelled') {
                throw new ApiError(400, 'This package is already cancelled.');
            }

            targetVendorGroup.status = 'cancelled';
            targetVendorGroup.cancelledAt = new Date();
            targetVendorGroup.cancelledBy = 'admin';
            targetVendorGroup.cancellationReason = reason || 'Cancelled by Admin';
            targetVendorGroup.cancellationComment = comment || 'Admin override cancellation';

            cancelledVendorGroup = targetVendorGroup;

            // Cancel shipment & unassign rider
            const shipment = await Shipment.findOne({
                orderId: order._id,
                vendorId: targetVendorGroup.vendorId,
            }).session(session);

            const PHYSICAL_TRANSIT_STATUSES = ['picked_up', 'shipped', 'in_transit', 'out_for_delivery'];
            if (shipment && PHYSICAL_TRANSIT_STATUSES.includes(shipment.status)) {
                throw new ApiError(400, `Cannot cancel: package shipment is already in '${shipment.status}' status with delivery partner.`);
            }

            if (shipment) {
                await cancelShipmentDeliveryAssignment(shipment._id, reason, session);
            }

            // Restore Inventory
            for (const item of targetVendorGroup.items) {
                const quantity = Number(item.quantity || 0);
                if (quantity <= 0) continue;

                const product = await Product.findByIdAndUpdate(item.productId, { $inc: { stockQuantity: quantity } }, { new: true, session });
                if (product) {
                    const nextStockState =
                        product.stockQuantity <= 0
                            ? 'out_of_stock'
                            : (product.stockQuantity <= product.lowStockThreshold ? 'low_stock' : 'in_stock');

                    await Product.updateOne(
                        { _id: product._id },
                        { $set: { stock: nextStockState } },
                        { session }
                    );
                }
            }

            // Calculate refund
            calculatedRefund = parseFloat(
                ((targetVendorGroup.subtotal || 0) - (targetVendorGroup.discount || 0) + (targetVendorGroup.tax || 0) + (targetVendorGroup.shipping || 0)).toFixed(2)
            );

            const isOnlinePayment = order.paymentMethod !== 'cod' && (order.paymentStatus === 'paid' || order.paymentStatus === 'partially_refunded' || forceRefund);

            if (isOnlinePayment && calculatedRefund > 0 && order.userId) {
                const refundRef = `ADMIN_CANCEL_${order._id}_${targetVendorGroup.vendorId}`;

                // Database Idempotency Check
                const existingRefund = await Refund.findOne({ referenceId: refundRef }).session(session);
                if (existingRefund && (existingRefund.status === 'completed' || existingRefund.status === 'processing')) {
                    targetVendorGroup.refundedAmount = existingRefund.amount;
                    calculatedRefund = existingRefund.amount;
                } else {
                    // Cumulative Partial Refund Protection: server-side limit
                    const capturedAmount = Number(order.total || 0);
                    const existingRefunds = await Refund.find({
                        orderId: order._id,
                        status: { $in: ['completed', 'processing'] }
                    }).session(session);
                    const alreadyRefunded = existingRefunds.reduce((sum, r) => sum + Number(r.amount || 0), 0);
                    const remainingRefundable = parseFloat(Math.max(0, capturedAmount - alreadyRefunded).toFixed(2));
                    const eligibleRefund = Math.min(calculatedRefund, remainingRefundable);

                    if (eligibleRefund > 0) {
                        const paidAttempt = await PaymentAttempt.findOne({ orderId: order._id, status: 'paid' })
                            .sort({ updatedAt: -1 })
                            .session(session);

                        if (paidAttempt && paidAttempt.razorpayPaymentId) {
                            const [createdRefund] = await Refund.create([{
                                orderId: order._id,
                                userId: order.userId,
                                paymentAttemptId: paidAttempt._id,
                                amount: eligibleRefund,
                                referenceId: refundRef,
                                method: 'razorpay',
                                destination: 'original_source',
                                status: 'processing',
                                razorpayPaymentId: paidAttempt.razorpayPaymentId,
                                paymentMethod: order.paymentMethod || 'razorpay',
                                refundInitiatedAt: new Date(),
                                notes: `Admin Override Cancellation: ${reason || 'Admin cancelled'}`,
                            }], { session });

                            targetVendorGroup.refundedAmount = eligibleRefund;
                            calculatedRefund = eligibleRefund;

                            pendingRzpCall = {
                                refundRecordId: createdRefund._id,
                                paymentId: paidAttempt.razorpayPaymentId,
                                amount: eligibleRefund,
                                reference: refundRef,
                            };
                        } else {
                            targetVendorGroup.refundedAmount = 0;
                            calculatedRefund = 0;
                        }
                    } else {
                        targetVendorGroup.refundedAmount = 0;
                        calculatedRefund = 0;
                    }
                }
            } else {
                targetVendorGroup.refundedAmount = 0;
                calculatedRefund = 0;
            }

            // Check if Commission was already released or paid to vendor -> Escrow Clawback
            const releasedCommissions = await Commission.find({
                orderId: order._id,
                vendorId: targetVendorGroup.vendorId,
                $or: [{ escrowStatus: 'released' }, { status: 'paid' }],
            }).session(session);

            let totalClawback = 0;
            for (const comm of releasedCommissions) {
                const amountPaidToVendor = Number(comm.walletCredit || comm.vendorNetEarnings || comm.vendorEarnings || 0);
                if (amountPaidToVendor > 0) {
                    totalClawback = parseFloat((totalClawback + amountPaidToVendor).toFixed(2));
                }
            }

            if (totalClawback > 0) {
                const clawbackRef = `CANCELLATION_CLAWBACK_${order._id}_${targetVendorGroup.vendorId}`;
                const existingClawback = await VendorWalletTransaction.findOne({ referenceId: clawbackRef }).session(session);

                if (!existingClawback) {
                    const vendor = await Vendor.findByIdAndUpdate(
                        targetVendorGroup.vendorId,
                        { $inc: { walletBalance: -totalClawback } },
                        { new: true, session }
                    );

                    if (vendor) {
                        await VendorWalletTransaction.create([{
                            vendorId:            targetVendorGroup.vendorId,
                            type:                'CANCELLATION_CLAWBACK',
                            amount:              -totalClawback,
                            grossAmount:         targetVendorGroup.subtotal,
                            commissionAmount:    targetVendorGroup.commissionAmount,
                            netAmount:           totalClawback,
                            referenceId:         clawbackRef,
                            walletBalanceBefore: parseFloat((vendor.walletBalance + totalClawback).toFixed(2)),
                            walletBalanceAfter:  vendor.walletBalance,
                            performedBy:         { role: 'admin', id: req.user?.id },
                            relatedOrderId:      order._id,
                            notes:               `Cancellation clawback for Order #${order.orderId} package (${targetVendorGroup.vendorName})`,
                        }], { session });

                        if (vendor.walletBalance < 0) {
                            createNotification({
                                recipientType: 'admin',
                                title:         'Vendor Negative Balance',
                                message:       `Vendor ${vendor.storeName || vendor._id} balance is ₹${vendor.walletBalance.toFixed(2)} after cancellation clawback on order ${order.orderId}.`,
                                type:          'alert',
                            }).catch(console.error);
                        }
                    }
                }
            }

            // Reverse Commission & Escrow
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
                { session }
            );

            // Roll-up status
            const remainingGroups = (order.vendorItems || []).filter((v) => v.status !== 'cancelled');
            if (remainingGroups.length === 0) {
                order.status = 'cancelled';
                order.cancelledAt = new Date();
                order.cancellationReason = reason || 'Cancelled by Admin';
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

            // Audit log
            await AuditLog.create([{
                adminId: req.user.id,
                action: 'ADMIN_PARTIAL_CANCEL_ORDER_ITEM',
                resource: 'Order',
                resourceId: order._id,
                changes: {
                    orderId: order.orderId,
                    vendorId: String(targetVendorGroup.vendorId),
                    reason,
                    comment,
                    refundAmount: calculatedRefund,
                },
                ipAddress: req.ip,
                userAgent: req.get('user-agent'),
            }], { session });

            await order.save({ session });
            updatedOrder = order;
        });
    } finally {
        await session.endSession();
    }

    if (pendingRzpCall) {
        try {
            const rzpResult = await processRazorpayRefund({
                paymentId: pendingRzpCall.paymentId,
                amountInRupees: pendingRzpCall.amount,
                reference: pendingRzpCall.reference,
                notes: {
                    orderId: String(updatedOrder._id),
                    adminAction: 'adminOverrideCancelVendorItem',
                },
            });

            const isProcessing = rzpResult.status === 'processing';
            const finalStatus = isProcessing ? 'processing' : 'completed';

            await Refund.findByIdAndUpdate(pendingRzpCall.refundRecordId, {
                status: finalStatus,
                razorpayRefundId: rzpResult.refundId,
                refundCompletedAt: isProcessing ? null : new Date(),
            });
        } catch (rzpErr) {
            console.error('[Admin Override Cancel Razorpay Refund Error]:', rzpErr);
            const isTimeout = !!rzpErr.isTimeout;
            await Refund.findByIdAndUpdate(pendingRzpCall.refundRecordId, {
                status: isTimeout ? 'processing' : 'failed',
                failureReason: rzpErr.message || 'Razorpay refund initiation failed',
                isAmbiguousTimeout: isTimeout,
            });
        }
    }

    if (updatedOrder) {
        notifyOrderUpdate(updatedOrder);

        if (updatedOrder.userId) {
            createNotification({
                recipientId: updatedOrder.userId,
                recipientType: 'user',
                title: 'Package Cancelled by Admin',
                message: `Admin has cancelled package from ${cancelledVendorGroup?.vendorName} in Order #${updatedOrder.orderId}.${calculatedRefund > 0 ? ` Refund of ₹${calculatedRefund} has been initiated to your original payment method. Your bank/UPI provider may take additional time to credit the amount.` : ''}`,
                type: 'order',
                data: { orderId: String(updatedOrder._id), refundAmount: calculatedRefund },
            }).catch(err => console.error('[Notif Error Customer]:', err.message));
        }

        if (cancelledVendorGroup?.vendorId) {
            createNotification({
                recipientId: cancelledVendorGroup.vendorId,
                recipientType: 'vendor',
                title: 'Package Cancelled by Admin',
                message: `Your package in Order #${updatedOrder.orderId} was cancelled by Admin. Reason: ${reason || 'Admin override'}`,
                type: 'order',
                data: { orderId: String(updatedOrder._id) },
            }).catch(err => console.error('[Notif Error Vendor]:', err.message));
        }
    }

    res.status(200).json(new ApiResponse(200, { order: updatedOrder }, 'Package cancelled by admin successfully.'));
});

