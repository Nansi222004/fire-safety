import mongoose from 'mongoose';

const paymentAttemptSchema = new mongoose.Schema(
    {
        orderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Order',
            required: false,
            index: true,
        },
        serviceBookingId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'ServiceBooking',
            index: true,
        },
        paymentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Payment',
            index: true,
        },
        razorpayOrderId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        razorpayPaymentId: {
            type: String,
            sparse: true,
            unique: true,
        },
        razorpaySignature: {
            type: String,
        },
        purpose: {
            type: String,
            enum: ['ORDER_PAYMENT', 'EXCHANGE_UPGRADE', 'SERVICE_BOOKING'],
            default: 'ORDER_PAYMENT',
            index: true,
        },
        status: {
            type: String,
            enum: [
                'created',               // Razorpay order created, awaiting user payment
                'processing',            // Webhook received, atomic lock acquired
                'paid',                  // Stock deducted, commission created
                'failed',                // User failed/abandoned payment
                'stock_failed_refunding',// Paid but stock out, refund triggered
                'captured_refunded',     // Captured after the order/booking was cancelled or already paid; auto-refunded
            ],
            default: 'created',
            index: true,
        },
        attemptNumber: {
            type: Number,
            default: 1,
        },
        webhookPayload: {
            type: mongoose.Schema.Types.Mixed,
        },
        relatedReturnId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'ReturnRequest',
            index: true,
        },
        // Rupee amount the gateway order was created for (EXCHANGE_UPGRADE: the request's saved priceDelta).
        // Compared with the request on capture so a stale or mismatched capture is refunded, not accepted.
        amount: { type: Number },
    },
    { timestamps: true }
);

const PaymentAttempt = mongoose.model('PaymentAttempt', paymentAttemptSchema);
export default PaymentAttempt;
