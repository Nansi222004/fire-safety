import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import ServiceBooking from '../../../models/ServiceBooking.model.js';
import Notification from '../../../models/Notification.model.js';
import { emitToRoom } from '../../../services/socket.service.js';

// Allowed State Machine Transitions map
const ALLOWED_TRANSITIONS = {
    pending: ['confirmed', 'cancelled'],
    confirmed: ['in_progress', 'cancelled'],
    in_progress: ['completed', 'cancelled'],
    completed: [],
    cancelled: [],
};

// Helper to create notification safely
const createNotification = async (recipientId, recipientType, title, message, data = {}) => {
    try {
        await Notification.create({
            recipientId,
            recipientType: String(recipientType || 'user').toLowerCase(),
            type: 'system',
            title,
            message,
            data,
        });
    } catch (err) {
        console.error('Failed to create notification:', err.message);
    }
};

/**
 * @desc    Get Vendor Service Bookings (Scoped strictly by vendorId)
 * @route   GET /api/vendor/service-bookings
 * @access  Private (Vendor Auth)
 */
export const getVendorBookings = asyncHandler(async (req, res) => {
    const vendorId = req.user.id || req.user._id;
    const { status, search, date, page = 1, limit = 10 } = req.query;

    const filter = { vendorId };

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

    if (date) {
        const startDate = new Date(date);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(date);
        endDate.setHours(23, 59, 59, 999);
        filter.bookingDate = { $gte: startDate, $lte: endDate };
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 10);
    const skip = (pageNum - 1) * limitNum;

    const total = await ServiceBooking.countDocuments(filter);
    const bookings = await ServiceBooking.find(filter)
        .populate('userId', 'name email phone')
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
            'Vendor service bookings fetched successfully.'
        )
    );
});

/**
 * @desc    Get Single Vendor Service Booking Detail (Scoped strictly by vendorId)
 * @route   GET /api/vendor/service-bookings/:id
 * @access  Private (Vendor Auth)
 */
export const getVendorBookingById = asyncHandler(async (req, res) => {
    const vendorId = req.user.id || req.user._id;
    const { id } = req.params;

    let booking = await ServiceBooking.findOne({ _id: id, vendorId })
        .populate('userId', 'name email phone')
        .populate('serviceId', 'name description serviceFields serviceSettings')
        .lean();

    if (!booking) {
        booking = await ServiceBooking.findOne({ bookingId: id, vendorId })
            .populate('userId', 'name email phone')
            .populate('serviceId', 'name description serviceFields serviceSettings')
            .lean();
    }

    if (!booking) {
        throw new ApiError(404, 'Service booking not found or access denied.');
    }

    res.status(200).json(
        new ApiResponse(200, { booking }, 'Service booking details fetched successfully.')
    );
});

/**
 * @desc    Update Vendor Service Booking Status (State Machine + Concurrency Protection + Customer Notification)
 * @route   PATCH /api/vendor/service-bookings/:id/status
 * @access  Private (Vendor Auth)
 */
export const updateBookingStatus = asyncHandler(async (req, res) => {
    const vendorId = req.user.id || req.user._id;
    const { id } = req.params;
    const { status, cancellationReason, note } = req.body;

    if (!status) {
        throw new ApiError(400, 'Target status is required.');
    }

    const targetStatus = String(status).toLowerCase().trim();

    // 1. Fetch current booking & verify IDOR ownership
    const booking = await ServiceBooking.findOne({ _id: id, vendorId });
    if (!booking) {
        throw new ApiError(404, 'Service booking not found or access denied.');
    }

    const currentStatus = booking.status;

    // 2. Validate state machine transition
    const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(targetStatus)) {
        throw new ApiError(
            400,
            `Invalid status transition from '${currentStatus.toUpperCase()}' to '${targetStatus.toUpperCase()}'. Allowed transitions are: ${allowed.map(s => s.toUpperCase()).join(', ') || 'None'}.`
        );
    }

    // 3. Check cancellation reason if target status is cancelled
    if (targetStatus === 'cancelled' && (!cancellationReason || !cancellationReason.trim())) {
        throw new ApiError(400, 'Cancellation reason is mandatory when cancelling a service booking.');
    }

    // 4. Perform atomic update with concurrency protection
    const updatePayload = {
        $set: {
            status: targetStatus,
        },
        $push: {
            statusHistory: {
                previousStatus: currentStatus,
                newStatus: targetStatus,
                changedBy: vendorId,
                changedByRole: 'vendor',
                note: note || (targetStatus === 'cancelled' ? cancellationReason : `Status updated to ${targetStatus}`),
                changedAt: new Date(),
            },
        },
    };

    if (targetStatus === 'cancelled') {
        updatePayload.$set.cancelledBy = vendorId;
        updatePayload.$set.cancelledByRole = 'vendor';
        updatePayload.$set.cancellationReason = cancellationReason.trim();
        updatePayload.$set.cancelledAt = new Date();
    }

    if (note && note.trim()) {
        updatePayload.$set.vendorNotes = note.trim();
    }

    const updatedBooking = await ServiceBooking.findOneAndUpdate(
        { _id: booking._id, vendorId, status: currentStatus },
        updatePayload,
        { new: true }
    ).populate('userId', 'name email phone');

    if (!updatedBooking) {
        throw new ApiError(409, 'Booking status was updated concurrently by another session. Please refresh.');
    }

    // 5. Notify Customer (DB Notification)
    const statusTitles = {
        confirmed: 'Booking Confirmed!',
        in_progress: 'Service In Progress',
        completed: 'Service Completed!',
        cancelled: 'Service Booking Cancelled',
    };

    const statusMessages = {
        confirmed: `Your booking #${updatedBooking.bookingId} for "${updatedBooking.serviceName}" has been confirmed by the vendor.`,
        in_progress: `Technician has started work on your booking #${updatedBooking.bookingId}.`,
        completed: `Service for booking #${updatedBooking.bookingId} has been completed. Thank you!`,
        cancelled: `Booking #${updatedBooking.bookingId} was cancelled. Reason: ${cancellationReason}`,
    };

    await createNotification(
        updatedBooking.userId._id || updatedBooking.userId,
        'user',
        statusTitles[targetStatus] || 'Booking Status Updated',
        statusMessages[targetStatus] || `Status updated to ${targetStatus}`,
        { bookingId: String(updatedBooking._id), bookingNumber: updatedBooking.bookingId, status: targetStatus }
    );

    // 6. Emit Socket Event Safely
    try {
        emitToRoom(
            `user_${updatedBooking.userId._id || updatedBooking.userId}`,
            'serviceBookingStatusUpdated',
            {
                bookingId: updatedBooking._id,
                bookingNumber: updatedBooking.bookingId,
                status: targetStatus,
                updatedAt: updatedBooking.updatedAt,
            }
        );
    } catch (socketErr) {
        console.error('Socket emission error:', socketErr.message);
    }

    res.status(200).json(
        new ApiResponse(200, { booking: updatedBooking }, `Booking status updated to ${targetStatus.toUpperCase()} successfully.`)
    );
});

/**
 * @desc    Update Vendor Operational Notes
 * @route   PATCH /api/vendor/service-bookings/:id/notes
 * @access  Private (Vendor Auth)
 */
export const updateVendorNotes = asyncHandler(async (req, res) => {
    const vendorId = req.user.id || req.user._id;
    const { id } = req.params;
    const { notes } = req.body;

    const booking = await ServiceBooking.findOneAndUpdate(
        { _id: id, vendorId },
        { $set: { vendorNotes: String(notes || '').trim() } },
        { new: true }
    );

    if (!booking) {
        throw new ApiError(404, 'Service booking not found or access denied.');
    }

    res.status(200).json(
        new ApiResponse(200, { booking }, 'Vendor notes updated successfully.')
    );
});
