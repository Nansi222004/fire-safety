import mongoose from 'mongoose';

const giftCardSchema = new mongoose.Schema(
    {
        code: {
            type: String,
            required: true,
            trim: true,
            // Masked display code e.g. SF-GIFT-****-****-4102
        },
        fullCode: {
            type: String,
            required: true,
            trim: true,
            // Full voucher code e.g. SF-GIFT-ABCD-EFGH-JKLM (accessible to buyer/recipient)
        },
        codeHash: {
            type: String,
            required: true,
            unique: true,
            index: true,
            // SHA-256 hash of normalized code (uppercase, alphanumeric only)
        },
        initialAmount: {
            type: Number,
            required: true,
            min: [100, 'Minimum gift card amount is ₹100'],
            max: [50000, 'Maximum gift card amount is ₹50,000'],
        },
        remainingBalance: {
            type: Number,
            required: true,
            min: [0, 'Remaining balance cannot be negative'],
        },
        currency: {
            type: String,
            required: true,
            default: 'INR',
        },
        status: {
            type: String,
            enum: [
                'PENDING_PAYMENT',
                'ACTIVE',
                'PARTIALLY_REDEEMED',
                'FULLY_REDEEMED',
                'EXPIRED',
                'CANCELLED',
            ],
            default: 'PENDING_PAYMENT',
            index: true,
        },
        purchasedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        purchasedByEmail: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
        },
        recipientUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            index: true,
        },
        recipientName: {
            type: String,
            trim: true,
            default: '',
        },
        recipientEmail: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
            index: true,
        },
        recipientPhone: {
            type: String,
            trim: true,
            default: '',
        },
        message: {
            type: String,
            trim: true,
            maxlength: [500, 'Personal message cannot exceed 500 characters'],
            default: '',
        },
        razorpayOrderId: {
            type: String,
            unique: true,
            sparse: true,
            index: true,
        },
        razorpayPaymentId: {
            type: String,
            sparse: true,
            index: true,
        },
        razorpaySignature: {
            type: String,
        },
        paymentStatus: {
            type: String,
            enum: ['pending', 'paid', 'failed'],
            default: 'pending',
            index: true,
        },
        issuedAt: {
            type: Date,
        },
        activatedAt: {
            type: Date,
        },
        expiresAt: {
            type: Date,
            index: true,
        },
        redeemedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        lastUsedAt: {
            type: Date,
        },
    },
    { timestamps: true }
);

// Compound indexes for optimal queries
giftCardSchema.index({ purchasedBy: 1, createdAt: -1 });
giftCardSchema.index({ recipientEmail: 1, status: 1 });
giftCardSchema.index({ status: 1, expiresAt: 1 });

const GiftCard = mongoose.model('GiftCard', giftCardSchema);
export { GiftCard };
export default GiftCard;
