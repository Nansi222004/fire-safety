import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', index: true },
    action: { type: String, required: true }, // e.g., 'UPDATE_PRODUCT', 'DELETE_USER'
    resource: { type: String, required: true }, // e.g., 'Product', 'User'
    resourceId: { type: mongoose.Schema.Types.ObjectId },
    changes: { type: mongoose.Schema.Types.Mixed }, // old vs new values
    ipAddress: String,
    userAgent: String
}, { timestamps: true });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);
export default AuditLog;
