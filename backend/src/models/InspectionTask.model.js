import mongoose from 'mongoose';
import { locationSchema } from './FireSafetyEquipment.model.js';

export const INSPECTION_TASK_STATUSES = ['pending', 'assigned', 'in_progress', 'submitted', 'reviewed', 'completed', 'cancelled'];

const inspectionTaskSchema = new mongoose.Schema(
    {
        taskNumber: { type: String, required: true, unique: true, index: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        location: { type: locationSchema, default: () => ({}) },
        equipmentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'FireSafetyEquipment' }],
        workerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', default: null, index: true },
        title: { type: String, required: true, trim: true },
        instructions: { type: String, trim: true, default: '' },
        scheduledDate: { type: Date, default: null },
        dueDate: { type: Date, default: null },
        status: { type: String, enum: INSPECTION_TASK_STATUSES, default: 'pending', index: true },
        startedAt: { type: Date, default: null },
        submittedAt: { type: Date, default: null },
        reviewedAt: { type: Date, default: null },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
        completedAt: { type: Date, default: null },
        reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'InspectionReport', default: null },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
        statusHistory: [
            {
                status: String,
                changedAt: { type: Date, default: Date.now },
                changedBy: { type: mongoose.Schema.Types.ObjectId },
                changedByType: { type: String, enum: ['admin', 'worker', 'system'] },
                note: String,
            },
        ],
    },
    { timestamps: true }
);

inspectionTaskSchema.index({ workerId: 1, status: 1, scheduledDate: 1 });

const InspectionTask = mongoose.model('InspectionTask', inspectionTaskSchema);
export { InspectionTask };
export default InspectionTask;
