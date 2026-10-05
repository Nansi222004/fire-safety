import mongoose from 'mongoose';

export const EQUIPMENT_TYPES = ['fire_extinguisher', 'fire_alarm', 'smoke_detector', 'hydrant_system', 'fire_pump', 'sprinkler_system', 'other'];

// Equipment condition as recorded by an inspection. `not_inspected` = no inspection yet.
export const EQUIPMENT_CONDITIONS = ['ok', 'needs_refill', 'needs_maintenance', 'not_working', 'damaged', 'needs_replacement'];

export const locationSchema = new mongoose.Schema(
    {
        label: { type: String, trim: true, default: '' }, // e.g. "ABC Industries – Plant 1"
        address: { type: String, trim: true, default: '' },
        city: { type: String, trim: true, default: '' },
        state: { type: String, trim: true, default: '' },
        zipCode: { type: String, trim: true, default: '' },
    },
    { _id: false }
);

// A customer's installed fire-safety equipment. Deliberately separate from Products/Orders.
const fireSafetyEquipmentSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        addressId: { type: mongoose.Schema.Types.ObjectId, ref: 'Address', default: null },
        location: { type: locationSchema, default: () => ({}) },
        equipmentType: { type: String, enum: EQUIPMENT_TYPES, required: true },
        name: { type: String, required: true, trim: true }, // e.g. "5 KG Fire Extinguisher"
        details: {
            brand: { type: String, trim: true, default: '' },
            model: { type: String, trim: true, default: '' },
            capacity: { type: String, trim: true, default: '' },
            serialNumber: { type: String, trim: true, default: '' },
            installedOn: { type: Date, default: null },
            expiresOn: { type: Date, default: null },
            placement: { type: String, trim: true, default: '' }, // e.g. "Ground floor, near exit"
        },
        currentStatus: {
            type: String,
            enum: ['not_inspected', ...EQUIPMENT_CONDITIONS],
            default: 'not_inspected',
            index: true,
        },
        lastInspectedAt: { type: Date, default: null },
        lastReportId: { type: mongoose.Schema.Types.ObjectId, ref: 'InspectionReport', default: null },
        isActive: { type: Boolean, default: true, index: true },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    },
    { timestamps: true }
);

fireSafetyEquipmentSchema.index({ userId: 1, isActive: 1 });

const FireSafetyEquipment = mongoose.model('FireSafetyEquipment', fireSafetyEquipmentSchema);
export { FireSafetyEquipment };
export default FireSafetyEquipment;
