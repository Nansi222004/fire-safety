import ServiceBooking from '../models/ServiceBooking.model.js';
import ServiceCapacity from '../models/ServiceCapacity.model.js';
import PaymentAttempt from '../models/PaymentAttempt.model.js';
import { createNotification } from '../services/notification.service.js';

// How long an online service booking may wait for payment before its slot is given back.
// A capture that arrives after expiry is refunded automatically by paymentProcessor (booking no longer pending).
export const getServicePaymentTimeoutMinutes = () => {
    const configured = Number(process.env.SERVICE_PAYMENT_TIMEOUT_MINUTES);
    return Number.isFinite(configured) && configured > 0 ? configured : 30;
};

// Module-level guard: prevents overlapping runs on single instance
let _cronRunning = false;

/**
 * Cancels online (Razorpay) service bookings that were never paid within the timeout and releases their
 * capacity slot. Without this, an abandoned checkout held a slot for that day forever.
 * COD and wallet bookings are never touched: COD is paid on site and wallet bookings are paid at creation.
 */
export const expireUnpaidServiceBookings = async ({ now = new Date() } = {}) => {
    if (_cronRunning) return { expired: 0, skipped: true };
    _cronRunning = true;
    let expired = 0;
    try {
        const timeoutMinutes = getServicePaymentTimeoutMinutes();
        const cutoff = new Date(now.getTime() - timeoutMinutes * 60 * 1000);

        const candidates = await ServiceBooking.find({
            status: 'pending',
            paymentMethod: { $nin: ['cod', 'wallet'] },
            paymentStatus: { $in: ['pending', 'failed'] },
            createdAt: { $lt: cutoff },
        }).select('_id').lean();

        for (const { _id } of candidates) {
            try {
                // A capture is being processed right now; let it finish rather than racing it.
                if (await PaymentAttempt.exists({ serviceBookingId: _id, status: 'processing' })) continue;

                const reason = `Payment not completed within ${timeoutMinutes} minutes`;
                // Atomic claim: only a still-unpaid, still-pending booking is expired.
                const booking = await ServiceBooking.findOneAndUpdate(
                    { _id, status: 'pending', paymentStatus: { $in: ['pending', 'failed'] } },
                    {
                        $set: {
                            status: 'cancelled',
                            cancelledByRole: 'system',
                            cancellationReason: reason,
                            cancelledAt: now,
                        },
                        $push: {
                            statusHistory: {
                                previousStatus: 'pending',
                                newStatus: 'cancelled',
                                changedByRole: 'system',
                                note: reason,
                                changedAt: now,
                            },
                        },
                    },
                    { new: false }
                );
                if (!booking) continue;

                // The payment.failed webhook already released the slot for failed payments.
                if (booking.paymentStatus !== 'failed') {
                    const dateStr = new Date(booking.bookingDate).toISOString().slice(0, 10);
                    await ServiceCapacity.updateOne(
                        { vendorServiceId: booking.vendorServiceId, dateStr, bookedCount: { $gt: 0 } },
                        { $inc: { bookedCount: -1 } }
                    );
                }

                await PaymentAttempt.updateMany(
                    { serviceBookingId: booking._id, status: 'created' },
                    { $set: { status: 'failed' } }
                );
                expired += 1;

                createNotification({
                    recipientId: booking.userId,
                    recipientType: 'user',
                    title: 'Service Booking Expired',
                    message: `Booking #${booking.bookingId} for "${booking.serviceName}" was cancelled because payment was not completed. You have not been charged; please book again.`,
                    type: 'service',
                    data: { bookingId: String(booking._id), bookingNumber: booking.bookingId, status: 'cancelled' },
                }).catch((err) => console.error('[Service Booking Expiry] Notification failed:', err.message));
            } catch (err) {
                console.error(`[Service Booking Expiry] Failed for booking ${_id}:`, err.message);
            }
        }

        if (expired > 0) console.log(`[Service Booking Expiry] Expired ${expired} unpaid online booking(s).`);
        return { expired };
    } finally {
        _cronRunning = false;
    }
};
