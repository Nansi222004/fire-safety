import mongoose from 'mongoose';
import { locationSchema, EQUIPMENT_CONDITIONS } from './FireSafetyEquipment.model.js';

// Immutable record of one inspection visit. A new inspection always creates a new report,
// so equipment history is never overwritten.
const inspectionReportSchema = new mongoose.Schema(
    {
        reportNumber: { type: String, required: true, unique: true, index: true },
        taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'InspectionTask', required: true, unique: true },
        workerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', required: true, index: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        location: { type: locationSchema, default: () => ({}) },
        items: [
            {
                equipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'FireSafetyEquipment', required: true },
                equipmentName: { type: String, trim: true }, // snapshot at inspection time
                equipmentType: { type: String, trim: true },
                condition: { type: String, enum: EQUIPMENT_CONDITIONS, required: true },
                observations: { type: String, trim: true, default: '' },
                photos: [{ type: String, trim: true }],
            },
        ],
        notes: { type: String, trim: true, default: '' },
        inspectedAt: { type: Date, required: true },
        submittedAt: { type: Date, default: Date.now },
        reviewStatus: { type: String, enum: ['pending_review', 'reviewed'], default: 'pending_review', index: true },
        reviewedAt: { type: Date, default: null },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
        adminNotes: { type: String, trim: true, default: '' }, // internal, never shown to customer
    },
    { timestamps: true }
);

inspectionReportSchema.index({ 'items.equipmentId': 1, inspectedAt: -1 });

const InspectionReport = mongoose.model('InspectionReport', inspectionReportSchema);
export { InspectionReport };
export default InspectionReport;
