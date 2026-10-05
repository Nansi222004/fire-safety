import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

// Fire-safety field inspector. Restricted role: accounts are created by Admin only.
const workerSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
        phone: { type: String, trim: true },
        password: { type: String, required: true, select: false },
        isActive: { type: Boolean, default: true, index: true },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
        lastLoginAt: { type: Date, default: null },
        refreshTokenHash: { type: String, select: false },
        refreshTokenExpiresAt: { type: Date, select: false },
    },
    { timestamps: true }
);

workerSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

workerSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

const Worker = mongoose.model('Worker', workerSchema);
export { Worker };
export default Worker;
