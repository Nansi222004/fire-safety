import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import ServiceBooking from '../../../models/ServiceBooking.model.js';

/**
 * @desc    Get All Platform Service Bookings (Global visibility across all vendors)
 * @route   GET /api/admin/service-bookings
 * @access  Private (Admin Auth)
 */
export const getAllBookings = asyncHandler(async (req, res) => {
    const { vendorId, category, status, search, dateFrom, dateTo, page = 1, limit = 10 } = req.query;

    const filter = {};

    if (vendorId && vendorId !== 'all') {
        filter.vendorId = vendorId;
    }

    if (category && category !== 'all') {
        filter.categoryName = { $regex: category, $options: 'i' };
    }

    if (status && status !== 'all') {
        filter.status = status.toLowerCase();
    }

    if (search && search.trim()) {
        const query = search.trim();
        filter.$or = [
            { bookingId: { $regex: query, $options: 'i' } },
            { serviceName: { $regex: query, $options: 'i' } },
            { 'serviceAddress.fullName': { $regex: query, $options: 'i' } },
            { 'serviceAddress.phone': { $regex: query, $options: 'i' } },
            { pincode: { $regex: query, $options: 'i' } },
        ];
    }

    if (dateFrom || dateTo) {
        filter.bookingDate = {};
        if (dateFrom) {
            const start = new Date(dateFrom);
            start.setHours(0, 0, 0, 0);
            filter.bookingDate.$gte = start;
        }
        if (dateTo) {
            const end = new Date(dateTo);
            end.setHours(23, 59, 59, 999);
            filter.bookingDate.$lte = end;
        }
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 10);
    const skip = (pageNum - 1) * limitNum;

    const total = await ServiceBooking.countDocuments(filter);
    const bookings = await ServiceBooking.find(filter)
        .populate('userId', 'name email phone')
        .populate('vendorId', 'storeName name email phone rating')
        .populate('serviceId', 'name categoryId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean();

    res.status(200).json(
        new ApiResponse(
            200,
            {
                bookings,
                pagination: {
                    total,
                    page: pageNum,
                    limit: limitNum,
                    pages: Math.ceil(total / limitNum) || 1,
                },
            },
            'Global service bookings fetched successfully.'
        )
    );
});

/**
 * @desc    Get Single Service Booking Detail for Audit (Read-Only)
 * @route   GET /api/admin/service-bookings/:id
 * @access  Private (Admin Auth)
 */
export const getAdminBookingById = asyncHandler(async (req, res) => {
    const { id } = req.params;

    let booking = await ServiceBooking.findById(id)
        .populate('userId', 'name email phone')
        .populate('vendorId', 'storeName name email phone address rating logo')
        .populate('serviceId', 'name description serviceFields serviceSettings')
        .lean();

    if (!booking) {
        booking = await ServiceBooking.findOne({ bookingId: id })
            .populate('userId', 'name email phone')
            .populate('vendorId', 'storeName name email phone address rating logo')
            .populate('serviceId', 'name description serviceFields serviceSettings')
            .lean();
    }

    if (!booking) {
        throw new ApiError(404, 'Service booking not found.');
    }

    res.status(200).json(
        new ApiResponse(200, { booking }, 'Service booking detail fetched successfully.')
    );
});
