import mongoose from 'mongoose';

export const ISSUE_STATUSES = ['open', 'in_progress', 'resolved', 'closed'];

// Issue/alert identified by Admin (or suggested by the system) from an inspection result.
// Recommendations are chosen by Admin — the worker never selects vendors/products/services.
const inspectionIssueSchema = new mongoose.Schema(
    {
        issueNumber: { type: String, required: true, unique: true, index: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        equipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'FireSafetyEquipment', required: true, index: true },
        reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'InspectionReport', required: true, index: true },
        taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'InspectionTask', required: true },
        workerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', default: null },
        condition: { type: String, trim: true }, // condition reported by the worker
        title: { type: String, required: true, trim: true }, // customer-facing, e.g. "Extinguisher requires refill"
        description: { type: String, trim: true, default: '' }, // customer-facing
        internalNotes: { type: String, trim: true, default: '' }, // admin-only
        severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
        status: { type: String, enum: ISSUE_STATUSES, default: 'open', index: true },
        customerVisible: { type: Boolean, default: false, index: true },
        recommendations: [
            {
                kind: { type: String, enum: ['service', 'product', 'vendor'], required: true },
                serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', default: null },
                productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
                vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', default: null },
                note: { type: String, trim: true, default: '' },
            },
        ],
        notifiedAt: { type: Date, default: null },
        notificationCount: { type: Number, default: 0 },
        supportTicketIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SupportTicket' }],
        resolvedAt: { type: Date, default: null },
        createdBy: { type: String, enum: ['system', 'admin'], default: 'admin' },
    },
    { timestamps: true }
);

const InspectionIssue = mongoose.model('InspectionIssue', inspectionIssueSchema);
export { InspectionIssue };
export default InspectionIssue;
