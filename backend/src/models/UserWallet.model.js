import mongoose from 'mongoose';

const userWalletSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            unique: true,
            index: true,
        },
        balance: {
            type: Number,
            required: true,
            default: 0,
        },
        rewardPoints: {
            type: Number,
            required: true,
            default: 0,
        },
        cashbackBalance: {
            type: Number,
            required: true,
            default: 0,
        },
        totalCredits: {
            type: Number,
            required: true,
            default: 0,
        },
        totalDebits: {
            type: Number,
            required: true,
            default: 0,
        },
        currency: {
            type: String,
            required: true,
            default: 'INR',
        },
        status: {
            type: String,
            enum: ['active', 'locked'],
            default: 'active',
        },
    },
    { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// Read-only convenience flag used by the admin UI; `status` is the source of truth (debitWallet checks it).
userWalletSchema.virtual('isLocked').get(function isLocked() {
    return this.status === 'locked';
});

const UserWallet = mongoose.model('UserWallet', userWalletSchema);
export { UserWallet };
export default UserWallet;
