import mongoose from 'mongoose';

const serviceCapacitySchema = new mongoose.Schema(
    {
        vendorServiceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'VendorService',
            required: true,
            index: true,
        },
        vendorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Vendor',
            required: true,
            index: true,
        },
        dateStr: {
            type: String, // 'YYYY-MM-DD'
            required: true,
            index: true,
        },
        bookedCount: {
            type: Number,
            default: 0,
            min: 0,
        },
        dailyCapacity: {
            type: Number,
            required: true,
            min: 1,
        },
    },
    { timestamps: true }
);

// Compound unique index ensuring exactly one capacity ledger per vendor service per date
serviceCapacitySchema.index({ vendorServiceId: 1, dateStr: 1 }, { unique: true });

const ServiceCapacity = mongoose.model('ServiceCapacity', serviceCapacitySchema);
export { ServiceCapacity };
export default ServiceCapacity;
