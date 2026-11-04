import mongoose from 'mongoose';
import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Vendor from '../../../models/Vendor.model.js';
import Product from '../../../models/Product.model.js';
import Order from '../../../models/Order.model.js';

const OPEN_STATUSES = ['pending', 'processing', 'ready_for_pickup', 'shipped'];

/**
 * @desc    Wholesaler dashboard: B2B catalog, order and wallet summary for the signed-in wholesaler
 * @route   GET /api/wholesaler/dashboard
 */
export const getDashboard = asyncHandler(async (req, res) => {
    const wholesalerId = new mongoose.Types.ObjectId(req.user.id);

    const [wholesaler, productStats, orderStats, recentOrders] = await Promise.all([
        Vendor.findById(wholesalerId)
            .select('name storeName email walletBalance onHoldBalance pendingWithdrawal wholesaleCapability.businessDetails.gstNumber')
            .lean(),
        Product.aggregate([
            { $match: { vendorId: wholesalerId } },
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    active: { $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] } },
                    lowStock: { $sum: { $cond: [{ $eq: ['$stock', 'low_stock'] }, 1, 0] } },
                    outOfStock: { $sum: { $cond: [{ $eq: ['$stock', 'out_of_stock'] }, 1, 0] } },
                },
            },
        ]),
        Order.aggregate([
            { $match: { orderType: 'b2b', 'vendorItems.vendorId': wholesalerId } },
            { $unwind: '$vendorItems' },
            { $match: { 'vendorItems.vendorId': wholesalerId } },
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    open: { $sum: { $cond: [{ $in: ['$vendorItems.status', OPEN_STATUSES] }, 1, 0] } },
                    pending: { $sum: { $cond: [{ $eq: ['$vendorItems.status', 'pending'] }, 1, 0] } },
                    delivered: { $sum: { $cond: [{ $eq: ['$vendorItems.status', 'delivered'] }, 1, 0] } },
                    cancelled: { $sum: { $cond: [{ $eq: ['$vendorItems.status', 'cancelled'] }, 1, 0] } },
                    revenue: {
                        $sum: {
                            $cond: [{ $eq: ['$vendorItems.status', 'delivered'] }, { $ifNull: ['$vendorItems.subtotal', 0] }, 0],
                        },
                    },
                },
            },
        ]),
        Order.find({ orderType: 'b2b', 'vendorItems.vendorId': wholesalerId })
            .select('orderId createdAt paymentStatus vendorItems shippingAddress.name')
            .sort({ createdAt: -1 })
            .limit(5)
            .lean(),
    ]);
    if (!wholesaler) throw new ApiError(404, 'Wholesaler not found.');

    const products = productStats[0] || { total: 0, active: 0, lowStock: 0, outOfStock: 0 };
    const orders = orderStats[0] || { total: 0, open: 0, pending: 0, delivered: 0, cancelled: 0, revenue: 0 };
    delete products._id;
    delete orders._id;

    res.status(200).json(new ApiResponse(200, {
        business: {
            name: wholesaler.name,
            businessName: wholesaler.storeName,
            email: wholesaler.email,
            gstNumber: wholesaler.wholesaleCapability?.businessDetails?.gstNumber || '',
        },
        products,
        orders: { ...orders, revenue: Math.round((orders.revenue || 0) * 100) / 100 },
        wallet: {
            walletBalance: Number((wholesaler.walletBalance || 0).toFixed(2)),
            onHoldBalance: Number((wholesaler.onHoldBalance || 0).toFixed(2)),
            pendingWithdrawal: Number((wholesaler.pendingWithdrawal || 0).toFixed(2)),
        },
        recentOrders: recentOrders.map((order) => {
            const group = (order.vendorItems || []).find((g) => String(g.vendorId) === String(wholesalerId)) || {};
            return {
                _id: order._id,
                orderId: order.orderId,
                createdAt: order.createdAt,
                buyerName: order.shippingAddress?.name || '',
                paymentStatus: order.paymentStatus,
                status: group.status || 'pending',
                subtotal: group.subtotal || 0,
                itemCount: (group.items || []).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0),
            };
        }),
    }, 'Wholesaler dashboard fetched.'));
});
