import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import ServiceBooking from '../../../models/ServiceBooking.model.js';
import Vendor from '../../../models/Vendor.model.js';
import Commission from '../../../models/Commission.model.js';
import VendorWalletTransaction from '../../../models/VendorWalletTransaction.model.js';
import Refund from '../../../models/Refund.model.js';
import ServiceCapacity from '../../../models/ServiceCapacity.model.js';
import { emitToRoom } from '../../../services/socket.service.js';
import { createNotification } from '../../../services/notification.service.js';
import { getDefaultCommissionRate } from '../../../services/settingsService.js';
import { creditWallet } from '../../../services/wallet.service.js';

// Allowed State Machine Transitions map
const ALLOWED_TRANSITIONS = {
    pending: ['confirmed', 'cancelled'],
    confirmed: ['assigned', 'in_progress', 'cancelled'],
    assigned: ['in_progress', 'cancelled'],
    in_progress: ['completed', 'cancelled'],
    completed: [],
    cancelled: [],
};

/**
 * @desc    Get Vendor Service Bookings (Scoped strictly by vendorId)
 * @route   GET /api/vendor/service-bookings
 * @access  Private (Vendor Auth)
 */
export const getVendorBookings = asyncHandler(async (req, res) => {
    const vendorId = req.vendor?._id || req.vendor?.id || req.user?.id || req.user?._id;
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
    const vendorId = req.vendor?._id || req.vendor?.id || req.user?.id || req.user?._id;
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
 * @desc    Update Vendor Service Booking Status with financial settlement on completion
 * @route   PATCH /api/vendor/service-bookings/:id/status
 * @access  Private (Vendor Auth)
 */
export const updateBookingStatus = asyncHandler(async (req, res) => {
    const vendorId = req.vendor?._id || req.vendor?.id || req.user?.id || req.user?._id;
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

    if (targetStatus === 'completed') {
        updatePayload.$set.settlementStatus = 'settled';
        if (booking.paymentMethod === 'cod') {
            updatePayload.$set.paymentStatus = 'paid';
        }
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

    // 5. Handle Financial Settlement on Completion
    if (targetStatus === 'completed' && booking.settlementStatus !== 'settled') {
        const vendorDoc = await Vendor.findById(vendorId);
        const defaultRate = await getDefaultCommissionRate();
        const commissionRate = Number.isFinite(vendorDoc?.commissionRate) ? vendorDoc.commissionRate : defaultRate;

        const totalAmount = Number(booking.pricing?.total || 0);
        const commissionAmount = parseFloat(((totalAmount * commissionRate) / 100).toFixed(2));
        const vendorEarnings = parseFloat((totalAmount - commissionAmount).toFixed(2));

        const isCod = booking.paymentMethod === 'cod';

        // Check idempotency: ensure commission doesn't already exist for this booking
        const existingCommission = await Commission.findOne({ serviceBookingId: booking._id });
        if (!existingCommission) {
            await Commission.create({
                serviceBookingId: booking._id,
                sourceType: 'service',
                vendorId,
                vendorName: vendorDoc?.storeName || vendorDoc?.name || '',
                subtotal: booking.pricing?.subtotal || totalAmount,
                vendorSubtotal: booking.pricing?.subtotal || totalAmount,
                commissionRate,
                commission: commissionAmount,
                commissionAmount,
                vendorEarnings,
                vendorNetEarnings: vendorEarnings,
                escrowAmount: vendorEarnings,
                status: 'paid',
                settlementStatus: 'paid',
                escrowStatus: 'released',
                paidAt: new Date(),
                releasedAt: new Date(),
            });

            if (isCod) {
                // For COD, vendor collected cash on site; platform commission is deducted from vendor wallet
                const walletBefore = vendorDoc?.walletBalance || 0;
                const walletAfter = parseFloat((walletBefore - commissionAmount).toFixed(2));
                await Vendor.findByIdAndUpdate(vendorId, { $inc: { walletBalance: -commissionAmount } });

                await VendorWalletTransaction.create({
                    vendorId,
                    type: 'SERVICE_SETTLEMENT',
                    amount: -commissionAmount,
                    grossAmount: totalAmount,
                    commissionAmount,
                    netAmount: -commissionAmount,
                    relatedServiceBookingId: booking._id,
                    referenceId: `SERVICE_SETTLEMENT_COD_${booking._id}`,
                    walletBalanceBefore: walletBefore,
                    walletBalanceAfter: walletAfter,
                    performedBy: { role: 'system', id: null },
                    notes: `Platform commission deduction for COD Service Booking #${booking.bookingId} (Gross: ₹${totalAmount}, Comm: ₹${commissionAmount})`,
                });
            } else {
                // For Prepaid/Online/Wallet, platform collected cash; vendor earnings credited to vendor wallet
                const walletBefore = vendorDoc?.walletBalance || 0;
                const walletAfter = parseFloat((walletBefore + vendorEarnings).toFixed(2));
                await Vendor.findByIdAndUpdate(vendorId, { $inc: { walletBalance: vendorEarnings } });

                await VendorWalletTransaction.create({
                    vendorId,
                    type: 'SERVICE_SETTLEMENT',
                    amount: vendorEarnings,
                    grossAmount: totalAmount,
                    commissionAmount,
                    netAmount: vendorEarnings,
                    relatedServiceBookingId: booking._id,
                    referenceId: `SERVICE_SETTLEMENT_${booking._id}`,
                    walletBalanceBefore: walletBefore,
                    walletBalanceAfter: walletAfter,
                    performedBy: { role: 'system', id: null },
                    notes: `Payout credited for completed Service Booking #${booking.bookingId} (Gross: ₹${totalAmount}, Net: ₹${vendorEarnings}, Comm: ₹${commissionAmount})`,
                });
            }

            // Dispatch notification to Vendor for completion and settlement
            try {
                await createNotification({
                    recipientId: vendorId,
                    recipientType: 'vendor',
                    title: 'Service Completed & Settled',
                    message: isCod
                        ? `Booking #${booking.bookingId} completed! Platform commission of ₹${commissionAmount} deducted from wallet.`
                        : `Booking #${booking.bookingId} settled! ₹${vendorEarnings} credited to your wallet (after ₹${commissionAmount} platform commission).`,
                    type: 'service',
                    data: { bookingId: String(booking._id), bookingNumber: booking.bookingId, netAmount: isCod ? -commissionAmount : vendorEarnings, commissionAmount }
                });
            } catch (err) {
                console.error('[VENDOR_BOOKING] Failed to dispatch settlement notification:', err.message);
            }
        }
    }

    // 6. Handle Cancellation Refund & Capacity Release
    if (targetStatus === 'cancelled') {
        // Release daily capacity slot
        const dateStr = new Date(booking.bookingDate).toISOString().slice(0, 10);
        await ServiceCapacity.updateOne(
            { vendorServiceId: booking.vendorServiceId, dateStr, bookedCount: { $gt: 0 } },
            { $inc: { bookedCount: -1 } }
        );

        // If booking was paid, refund to customer wallet
        if (booking.paymentStatus === 'paid') {
            const refundAmount = Number(booking.pricing?.total || 0);
            const refundRef = `SERVICE_CANCEL_REFUND_${booking._id}`;
            const existingRefund = await Refund.findOne({ referenceId: refundRef });

            if (!existingRefund && refundAmount > 0) {
                await creditWallet(
                    booking.userId,
                    refundAmount,
                    'cancel_refund',
                    {
                        serviceBookingId: booking._id,
                        description: `Refund ₹${refundAmount} for Service Booking #${booking.bookingId} cancelled by vendor`,
                        reference: refundRef,
                    }
                );

                await Refund.create({
                    serviceBookingId: booking._id,
                    userId: booking.userId,
                    amount: refundAmount,
                    referenceId: refundRef,
                    method: 'wallet_credit',
                    destination: 'wallet',
                    status: 'completed',
                    notes: `Refund for Service Booking #${booking.bookingId} cancelled by vendor`,
                });

                await ServiceBooking.findByIdAndUpdate(booking._id, {
                    $set: { paymentStatus: 'refunded', refundStatus: 'refunded' }
                });
            }
        }
    }

    // 7. Notify Customer
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

    await createNotification({
        recipientId: updatedBooking.userId._id || updatedBooking.userId,
        recipientType: 'user',
        title: statusTitles[targetStatus] || 'Booking Status Updated',
        message: statusMessages[targetStatus] || `Status updated to ${targetStatus}`,
        type: 'service',
        data: { bookingId: String(updatedBooking._id), bookingNumber: updatedBooking.bookingId, status: targetStatus }
    });

    // 8. Emit Socket Event Safely
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
    const vendorId = req.vendor?._id || req.vendor?.id || req.user?.id || req.user?._id;
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
