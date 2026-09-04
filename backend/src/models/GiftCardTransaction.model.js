import mongoose from 'mongoose';

const giftCardTransactionSchema = new mongoose.Schema(
    {
        giftCardId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'GiftCard',
            required: true,
            index: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            index: true,
        },
        type: {
            type: String,
            enum: [
                'PURCHASE',
                'ACTIVATION',
                'REDEMPTION',
                'PARTIAL_REDEMPTION',
                'EXPIRY',
                'CANCELLATION',
            ],
            required: true,
            index: true,
        },
        amount: {
            type: Number,
            required: true,
        },
        balanceBefore: {
            type: Number,
            required: true,
        },
        balanceAfter: {
            type: Number,
            required: true,
        },
        walletTransactionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'WalletTransaction',
            index: true,
        },
        reference: {
            type: String,
            unique: true,
            sparse: true,
            index: true,
        },
        notes: {
            type: String,
            trim: true,
            default: '',
        },
        ipAddress: {
            type: String,
            default: '',
        },
        userAgent: {
            type: String,
            default: '',
        },
    },
    { timestamps: { createdAt: true, updatedAt: false } }
);

giftCardTransactionSchema.index({ giftCardId: 1, createdAt: -1 });

const GiftCardTransaction = mongoose.model('GiftCardTransaction', giftCardTransactionSchema);
export { GiftCardTransaction };
export default GiftCardTransaction;
