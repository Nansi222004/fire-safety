import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';
import ApiError from '../utils/ApiError.js';
import {
    createGiftCardOrder,
    verifyAndActivateGiftCard,
    redeemGiftCard,
    getMyGiftCards,
    getGiftCardSummary,
    getAdminGiftCards,
    getAdminMetricsSummary,
    getAdminGiftCardById,
    cancelGiftCard,
} from '../services/giftCard.service.js';

/**
 * @desc    Purchase / Initialize Gift Card Order with Razorpay
 * @route   POST /api/gift-cards/purchase
 * @access  Private (Customer)
 */
export const purchase = asyncHandler(async (req, res) => {
    const userId = req.user?.id || req.user?._id;
    const { amount, recipientName, recipientEmail, recipientPhone, message } = req.body;

    const result = await createGiftCardOrder({
        userId,
        amount,
        recipientName,
        recipientEmail,
        recipientPhone,
        message,
        clientIp: req.ip || req.connection?.remoteAddress,
        userAgent: req.headers['user-agent'],
    });

    res.status(201).json(
        new ApiResponse(201, result, 'Gift card checkout order created successfully.')
    );
});

/**
 * @desc    Verify Razorpay payment signature and activate Gift Card
 * @route   POST /api/gift-cards/verify-payment
 * @access  Private (Customer)
 */
export const verifyPayment = asyncHandler(async (req, res) => {
    const userId = req.user?.id || req.user?._id;
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    const result = await verifyAndActivateGiftCard({
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
        userId,
        clientIp: req.ip || req.connection?.remoteAddress,
        userAgent: req.headers['user-agent'],
    });

    res.status(200).json(
        new ApiResponse(200, result, 'Gift card payment verified and activated successfully.')
    );
});

/**
 * @desc    Redeem Gift Card / Voucher to SafeFire Wallet
 * @route   POST /api/gift-cards/redeem
 * @access  Private (Customer)
 */
export const redeem = asyncHandler(async (req, res) => {
    const userId = req.user?.id || req.user?._id;
    const { code, amountToRedeem } = req.body;

    const result = await redeemGiftCard({
        userId,
        code,
        amountToRedeem,
        clientIp: req.ip || req.connection?.remoteAddress,
        userAgent: req.headers['user-agent'],
    });

    res.status(200).json(
        new ApiResponse(200, result, `Successfully redeemed ₹${result.redeemedAmount.toLocaleString('en-IN')} to your SafeFire Wallet.`)
    );
});

/**
 * @desc    Get logged in user's Gift Cards (purchased & received)
 * @route   GET /api/gift-cards
 * @access  Private (Customer)
 */
export const getMyCards = asyncHandler(async (req, res) => {
    const userId = req.user?.id || req.user?._id;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;

    const result = await getMyGiftCards({ userId, page, limit });

    res.status(200).json(
        new ApiResponse(200, result, 'Gift cards retrieved successfully.')
    );
});

/**
 * @desc    Get user's Available Voucher Balance Summary
 * @route   GET /api/gift-cards/summary
 * @access  Private (Customer)
 */
export const getSummary = asyncHandler(async (req, res) => {
    const userId = req.user?.id || req.user?._id;

    const result = await getGiftCardSummary({ userId });

    res.status(200).json(
        new ApiResponse(200, result, 'Gift card summary retrieved successfully.')
    );
});

/**
 * @desc    Admin: List all gift cards with filters and metrics
 * @route   GET /api/admin/gift-cards
 * @access  Private (Admin)
 */
export const getAdminCards = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const { status, search, startDate, endDate } = req.query;

    const result = await getAdminGiftCards({
        page,
        limit,
        status,
        search,
        startDate,
        endDate,
    });

    res.status(200).json(
        new ApiResponse(200, result, 'Admin gift cards retrieved successfully.')
    );
});

/**
 * @desc    Admin: Get aggregate gift card metrics summary
 * @route   GET /api/admin/gift-cards/summary
 * @access  Private (Admin)
 */
export const getAdminSummary = asyncHandler(async (req, res) => {
    const result = await getAdminMetricsSummary();

    res.status(200).json(
        new ApiResponse(200, result, 'Admin gift card metrics retrieved successfully.')
    );
});

/**
 * @desc    Admin: Get single gift card with audit timeline
 * @route   GET /api/admin/gift-cards/:id
 * @access  Private (Admin)
 */
export const getAdminCardDetails = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await getAdminGiftCardById(id);

    res.status(200).json(
        new ApiResponse(200, result, 'Gift card details retrieved successfully.')
    );
});

/**
 * @desc    Admin: Cancel an unredeemed active gift card
 * @route   PATCH /api/admin/gift-cards/:id/cancel
 * @access  Private (Admin)
 */
export const cancelCard = asyncHandler(async (req, res) => {
    const adminId = req.user?.id || req.user?._id;
    const { id } = req.params;
    const { reason } = req.body;

    const result = await cancelGiftCard({
        cardId: id,
        adminId,
        reason,
        clientIp: req.ip || req.connection?.remoteAddress,
        userAgent: req.headers['user-agent'],
    });

    res.status(200).json(
        new ApiResponse(200, result, 'Gift card cancelled successfully.')
    );
});

export default {
    purchase,
    verifyPayment,
    redeem,
    getMyCards,
    getSummary,
    getAdminCards,
    getAdminSummary,
    getAdminCardDetails,
    cancelCard,
};
