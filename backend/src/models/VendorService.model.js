import mongoose from 'mongoose';

const vendorServiceSchema = new mongoose.Schema(
    {
        vendorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Vendor',
            required: true,
            index: true,
        },
        serviceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Service',
            required: true,
            index: true,
        },
        isActive: {
            type: Boolean,
            default: true,
            index: true,
        },
        price: {
            type: Number,
            min: 0,
            default: 0,
        },
        variantPrices: {
            type: Map,
            of: Number,
        },
        serviceAreas: [{ type: String, trim: true }],
        workingHours: {
            start: { type: String, default: '09:00' },
            end: { type: String, default: '18:00' },
        },
        dailyCapacity: {
            type: Number,
            min: 0,
            default: 10,
        },
        vendorNotes: {
            type: String,
            trim: true,
            default: '',
        },
    },
    { timestamps: true }
);

// Compound unique index ensuring a vendor cannot enable the same service multiple times
vendorServiceSchema.index({ vendorId: 1, serviceId: 1 }, { unique: true });
vendorServiceSchema.index({ vendorId: 1, isActive: 1 });

const VendorService = mongoose.model('VendorService', vendorServiceSchema);
export { VendorService };
export default VendorService;
