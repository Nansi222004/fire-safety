import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
    {
        recipientId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
        recipientType: { type: String, enum: ['user', 'vendor', 'delivery', 'admin'], required: true },
        title: { type: String, required: true },
        message: { type: String, required: true },
        type: { type: String, enum: ['order', 'payment', 'system', 'promotion', 'store_inquiry', 'support', 'service', 'refund', 'wallet', 'payout'], default: 'system' },
        isRead: { type: Boolean, default: false, index: true },
        eventKey: { type: String, trim: true, index: true },
        data: { type: Map, of: String }, // extra metadata
    },
    { timestamps: true }
);

// Idempotency: prevent multiple notifications for the same recipient + business event key.
// Sparse index guarantees legacy notifications without eventKey are not blocked.
// Deduplicate only notifications that carry an eventKey. (A `sparse` compound index would still index documents
// without eventKey — as null — and allow just one such notification per recipient.)
export const NOTIFICATION_DEDUPE_INDEX = 'recipient_event_dedupe';
notificationSchema.index(
    { recipientId: 1, recipientType: 1, eventKey: 1 },
    {
        name: NOTIFICATION_DEDUPE_INDEX,
        unique: true,
        partialFilterExpression: { eventKey: { $type: 'string' } },
    }
);

const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;
