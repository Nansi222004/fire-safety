import mongoose from 'mongoose';
import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import ServiceBooking from '../../../models/ServiceBooking.model.js';
import Vendor from '../../../models/Vendor.model.js';
import Commission from '../../../models/Commission.model.js';
import VendorWalletTransaction from '../../../models/VendorWalletTransaction.model.js';
import Refund from '../../../models/Refund.model.js';
import PaymentAttempt from '../../../models/PaymentAttempt.model.js';
import ServiceCapacity from '../../../models/ServiceCapacity.model.js';
import { emitToRoom } from '../../../services/socket.service.js';
import { createNotification } from '../../../services/notification.service.js';
import { creditWallet } from '../../../services/wallet.service.js';
import { processRazorpayRefund } from '../../../services/payment.service.js';
import { istNow, generateCompletionOtp, isCompletionOtpMatch, COMPLETION_OTP_MAX_ATTEMPTS } from '../../../services/serviceBookingFlow.service.js';
import { resolveVendorCommissionRates } from '../../../services/commission.service.js';

const notifyCustomerCompletionCode = async (booking, otp) => {
    try {
        await createNotification({
            recipientId: booking.userId?._id || booking.userId,
            recipientType: 'user',
            title: 'Service Completion Code',
            message: `Your completion code for booking #${booking.bookingId} is ${otp}. Share it with the technician only after the work is done to your satisfaction.`,
            type: 'service',
            data: { bookingId: String(booking._id), bookingNumber: booking.bookingId },
        });
    } catch (err) {
        console.error('[VENDOR_BOOKING] Failed to send completion code notification:', err.message);
    }
};

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
    const { status, cancellationReason, note, completionOtp } = req.body;

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

    // Work can't start or finish before the scheduled day. Completion also releases the vendor payout,
    // so allowing it early let a job be marked done (and paid out) before it could have happened.
    if (['in_progress', 'completed'].includes(targetStatus)) {
        const scheduledDate = new Date(booking.bookingDate).toISOString().slice(0, 10); // stored as IST date at 00:00Z
        if (istNow().dateStr < scheduledDate) {
            throw new ApiError(
                400,
                `This booking is scheduled for ${scheduledDate}. It can be started or completed only on or after that date.`
            );
        }
    }

    // 3. Check cancellation reason if target status is cancelled
    if (targetStatus === 'cancelled' && (!cancellationReason || !cancellationReason.trim())) {
        throw new ApiError(400, 'Cancellation reason is mandatory when cancelling a service booking.');
    }

    // Phase 1 (P0): Payment gate for online service bookings
    // Non-COD bookings MUST have paymentStatus === 'paid' before advancing through lifecycle states.
    // Vendor cancellation remains allowed for unpaid bookings if the transition map permits.
    const isCod = booking.paymentMethod === 'cod';
    if (targetStatus !== 'cancelled' && !isCod && booking.paymentStatus !== 'paid') {
        throw new ApiError(
            400,
            'Cannot advance an online service booking until payment has been successfully captured.'
        );
    }

    // Customer-confirmed completion. Starting the job issues a code that only the customer sees; completing
    // it (which pays the vendor) requires that code, so a job can't be marked done without the customer.
    let issuedCompletionOtp = null;
    if (targetStatus === 'in_progress') {
        issuedCompletionOtp = generateCompletionOtp();
    }
    if (targetStatus === 'completed') {
        const reissueCode = async () => {
            const otp = generateCompletionOtp();
            await ServiceBooking.updateOne({ _id: booking._id }, { $set: { completionOtp: otp, completionOtpAttempts: 0 } });
            await notifyCustomerCompletionCode(booking, otp);
        };
        const stored = await ServiceBooking.findById(booking._id).select('+completionOtp +completionOtpAttempts').lean();
        if (!stored?.completionOtp) {
            // Job was started before completion codes existed: issue one now.
            await reissueCode();
            throw new ApiError(400, 'A completion code has been sent to the customer. Ask them for it and enter it to complete the service.');
        }
        const enteredCode = String(completionOtp || '').trim();
        if (!enteredCode) {
            throw new ApiError(400, "Enter the completion code shown in the customer's SafeFire app.");
        }
        if ((stored.completionOtpAttempts || 0) >= COMPLETION_OTP_MAX_ATTEMPTS) {
            await reissueCode();
            throw new ApiError(429, 'Too many incorrect codes. A new completion code has been sent to the customer.');
        }
        if (!isCompletionOtpMatch(stored.completionOtp, enteredCode)) {
            const after = await ServiceBooking.findByIdAndUpdate(
                booking._id,
                { $inc: { completionOtpAttempts: 1 } },
                { new: true }
            ).select('+completionOtpAttempts').lean();
            const attemptsLeft = COMPLETION_OTP_MAX_ATTEMPTS - (after?.completionOtpAttempts || 0);
            throw new ApiError(400, attemptsLeft > 0
                ? `Incorrect completion code. ${attemptsLeft} attempt(s) left.`
                : 'Incorrect completion code. A new code will be sent to the customer on the next attempt.');
        }
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

    if (issuedCompletionOtp) {
        updatePayload.$set.completionOtp = issuedCompletionOtp;
        updatePayload.$set.completionOtpAttempts = 0;
    }

    if (targetStatus === 'completed') {
        updatePayload.$set.completionVerifiedAt = new Date();
        updatePayload.$unset = { completionOtp: '', completionOtpAttempts: '' };
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
        // Phase 1B (P0): Defensive gate - never credit vendor wallet if non-COD payment was not captured
        if (!isCod && booking.paymentStatus !== 'paid') {
            throw new ApiError(400, 'Cannot complete an online service booking with uncaptured payment.');
        }

        const vendorDoc = await Vendor.findById(vendorId);
        // Canonical rule: vendor's own rate, else Admin default (fails clearly if unset).
        const commissionRate = (await resolveVendorCommissionRates([vendorDoc]))[String(vendorDoc._id)];

        const totalAmount = Number(booking.pricing?.total || 0);
        const serviceTax = Number(booking.pricing?.tax || 0);
        // Commission is charged on the pre-GST amount (service subtotal + visit charge), the same rule as
        // products (business decision, Nov 2026). GST is not platform revenue; the vendor keeps it to remit,
        // so earnings = total paid − commission = pre-GST amount − commission + GST.
        const commissionBase = parseFloat(Math.max(0, totalAmount - serviceTax).toFixed(2));
        const commissionAmount = parseFloat(((commissionBase * commissionRate) / 100).toFixed(2));
        const vendorEarnings = parseFloat((totalAmount - commissionAmount).toFixed(2));

        // Commission, wallet movement and ledger entry are written in one transaction. Previously they ran
        // one by one after the booking was already marked 'settled', so a failure part-way left a completed
        // booking with no vendor payout and no way to retry; the ledger's before/after also came from a
        // stale read instead of the actual update.
        const walletDelta = isCod ? -commissionAmount : vendorEarnings;
        let settledNow = false;
        const settleSession = await mongoose.startSession();
        try {
            await settleSession.withTransaction(async () => {
                // Check idempotency: ensure commission doesn't already exist for this booking
                const existingCommission = await Commission.findOne({ serviceBookingId: booking._id }).session(settleSession);
                if (existingCommission) return;

                await Commission.create([{
                    serviceBookingId: booking._id,
                    sourceType: 'service',
                    vendorId,
                    vendorName: vendorDoc?.storeName || vendorDoc?.name || '',
                    subtotal: booking.pricing?.subtotal || totalAmount,
                    vendorSubtotal: booking.pricing?.subtotal || totalAmount,
                    effectiveSubtotal: commissionBase,
                    vendorDiscountedSubtotal: commissionBase,
                    vendorTax: serviceTax,
                    vendorTotalPaidByCustomer: totalAmount,
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
                }], { session: settleSession });

                // COD: vendor collected cash on site, so the platform commission is deducted from the vendor wallet.
                // Prepaid/Online/Wallet: platform collected the money, so vendor earnings are credited.
                const updatedVendor = await Vendor.findByIdAndUpdate(
                    vendorId,
                    { $inc: { walletBalance: walletDelta } },
                    { new: true, session: settleSession }
                );
                const walletAfter = parseFloat(Number(updatedVendor?.walletBalance || 0).toFixed(2));

                await VendorWalletTransaction.create([{
                    vendorId,
                    type: 'SERVICE_SETTLEMENT',
                    amount: walletDelta,
                    grossAmount: totalAmount,
                    commissionAmount,
                    netAmount: walletDelta,
                    relatedServiceBookingId: booking._id,
                    referenceId: isCod ? `SERVICE_SETTLEMENT_COD_${booking._id}` : `SERVICE_SETTLEMENT_${booking._id}`,
                    walletBalanceBefore: parseFloat((walletAfter - walletDelta).toFixed(2)),
                    walletBalanceAfter: walletAfter,
                    performedBy: { role: 'system', id: null },
                    notes: isCod
                        ? `Platform commission deduction for COD Service Booking #${booking.bookingId} (Gross: ₹${totalAmount}, Comm: ₹${commissionAmount})`
                        : `Payout credited for completed Service Booking #${booking.bookingId} (Gross: ₹${totalAmount}, Net: ₹${vendorEarnings}, Comm: ₹${commissionAmount})`,
                }], { session: settleSession });
                settledNow = true;
            });
        } catch (settleErr) {
            // Leave the booking visibly unsettled so finance can see and settle it, instead of 'settled' with no payout.
            await ServiceBooking.updateOne({ _id: booking._id }, { $set: { settlementStatus: 'unsettled' } });
            console.error('[VENDOR_BOOKING] Settlement failed:', settleErr.message);
            throw new ApiError(500, 'Service marked completed but settlement failed. Support has been notified; please contact support.');
        } finally {
            await settleSession.endSession();
        }

        if (settledNow) {

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
    let refundNotice = '';
    if (targetStatus === 'cancelled') {
        // Release daily capacity slot
        const dateStr = new Date(booking.bookingDate).toISOString().slice(0, 10);
        await ServiceCapacity.updateOne(
            { vendorServiceId: booking.vendorServiceId, dateStr, bookedCount: { $gt: 0 } },
            { $inc: { bookedCount: -1 } }
        );

        // If booking was paid, handle refund
        if (booking.paymentStatus === 'paid') {
            const rawAmount = Number(booking.pricing?.total || 0);
            const refundRef = `SERVICE_CANCEL_REFUND_${booking._id}`;

            if (booking.paymentMethod === 'wallet' && rawAmount > 0) {
                const existingRefund = await Refund.findOne({ referenceId: refundRef });
                if (!existingRefund) {
                    await creditWallet(
                        booking.userId,
                        rawAmount,
                        'cancel_refund',
                        {
                            serviceBookingId: booking._id,
                            description: `Refund ₹${rawAmount} for Service Booking #${booking.bookingId} cancelled by vendor`,
                            reference: refundRef,
                        }
                    );

                    await Refund.create({
                        serviceBookingId: booking._id,
                        userId: booking.userId,
                        amount: rawAmount,
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
                refundNotice = ` ₹${rawAmount} has been refunded to your SafeFire Wallet.`;
            } else if (booking.paymentMethod !== 'cod' && rawAmount > 0) {
                // Online Razorpay-paid booking: original payment method refund
                const existingRefund = await Refund.findOne({ referenceId: refundRef });
                if (existingRefund && (existingRefund.status === 'completed' || existingRefund.status === 'processing')) {
                    refundNotice = ` Refund of ₹${existingRefund.amount} has been initiated to your original payment method. Your bank/UPI provider may take additional time to credit the amount.`;
                } else {
                    const capturedAmount = rawAmount;
                    const existingRefunds = await Refund.find({
                        serviceBookingId: booking._id,
                        status: { $in: ['completed', 'processing'] }
                    });
                    const alreadyRefunded = existingRefunds.reduce((sum, r) => sum + Number(r.amount || 0), 0);
                    const remainingRefundable = parseFloat(Math.max(0, capturedAmount - alreadyRefunded).toFixed(2));
                    const eligibleRefund = Math.min(rawAmount, remainingRefundable);

                    if (eligibleRefund > 0) {
                        const paidAttempt = await PaymentAttempt.findOne({
                            serviceBookingId: booking._id,
                            status: 'paid'
                        }).sort({ updatedAt: -1 });

                        if (paidAttempt && paidAttempt.razorpayPaymentId) {
                            const createdRefund = await Refund.create({
                                serviceBookingId: booking._id,
                                userId: booking.userId,
                                paymentAttemptId: paidAttempt._id,
                                amount: eligibleRefund,
                                referenceId: refundRef,
                                method: 'razorpay',
                                destination: 'original_source',
                                status: 'processing',
                                razorpayPaymentId: paidAttempt.razorpayPaymentId,
                                paymentMethod: booking.paymentMethod || 'razorpay',
                                refundInitiatedAt: new Date(),
                                notes: `Online Refund: Service Booking #${booking.bookingId} cancelled by vendor`,
                            });

                            try {
                                const rzpResult = await processRazorpayRefund({
                                    paymentId: paidAttempt.razorpayPaymentId,
                                    amountInRupees: eligibleRefund,
                                    reference: refundRef,
                                    notes: {
                                        serviceBookingId: String(booking._id),
                                        bookingNumber: booking.bookingId,
                                        cancelledBy: 'vendor',
                                    },
                                });

                                const isProcessing = rzpResult.status === 'processing';
                                const finalStatus = isProcessing ? 'processing' : 'completed';

                                await Refund.findByIdAndUpdate(createdRefund._id, {
                                    status: finalStatus,
                                    razorpayRefundId: rzpResult.refundId,
                                    refundCompletedAt: isProcessing ? null : new Date(),
                                });

                                await ServiceBooking.findByIdAndUpdate(booking._id, {
                                    $set: { paymentStatus: 'refunded', refundStatus: 'refunded' }
                                });
                            } catch (rzpErr) {
                                console.error('[Vendor Cancel Razorpay Refund Error]', rzpErr);
                                const isTimeout = !!rzpErr.isTimeout;
                                await Refund.findByIdAndUpdate(createdRefund._id, {
                                    status: isTimeout ? 'processing' : 'failed',
                                    failureReason: rzpErr.message || 'Razorpay refund initiation failed',
                                    isAmbiguousTimeout: isTimeout,
                                });
                            }

                            refundNotice = ` Refund of ₹${eligibleRefund} has been initiated to your original payment method. Your bank/UPI provider may take additional time to credit the amount.`;
                        }
                    }
                }
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
        in_progress: `Technician has started work on your booking #${updatedBooking.bookingId}. Your completion code is ${issuedCompletionOtp} — share it with the technician only after the work is done to your satisfaction.`,
        completed: `Service for booking #${updatedBooking.bookingId} has been completed. Thank you!`,
        cancelled: `Booking #${updatedBooking.bookingId} was cancelled by vendor. Reason: ${cancellationReason}.${refundNotice}`,
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
