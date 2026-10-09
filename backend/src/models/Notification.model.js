import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
    {
        recipientId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
        recipientType: { type: String, enum: ['user', 'vendor', 'delivery', 'admin'], required: true },
        title: { type: String, required: true },
        message: { type: String, required: true },
        type: { type: String, enum: ['order', 'payment', 'system', 'promotion', 'store_inquiry', 'support', 'service', 'refund'], default: 'system' },
        isRead: { type: Boolean, default: false, index: true },
        eventKey: { type: String, trim: true, index: true },
        data: { type: Map, of: String }, // extra metadata
    },
    { timestamps: true }
);

// Idempotency: prevent multiple notifications for the same recipient + business event key.
// Sparse index guarantees legacy notifications without eventKey are not blocked.
notificationSchema.index(
    { recipientId: 1, recipientType: 1, eventKey: 1 },
    { unique: true, sparse: true }
);

const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;
