import mongoose from 'mongoose';

const serviceFieldSchema = new mongoose.Schema(
    {
        key: { type: String, required: true, trim: true },
        label: { type: String, required: true, trim: true },
        type: {
            type: String,
            enum: ['TEXT', 'TEXTAREA', 'NUMBER', 'SELECT', 'MULTI_SELECT', 'RADIO', 'CHECKBOX', 'DATE', 'FILE'],
            required: true,
        },
        required: { type: Boolean, default: false },
        placeholder: { type: String, default: '' },
        options: [{ type: String, trim: true }],
        sortOrder: { type: Number, default: 0 },
    },
    { _id: true }
);

const serviceRequestSchema = new mongoose.Schema(
    {
        vendorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Vendor',
            required: true,
            index: true,
        },
        serviceName: {
            type: String,
            required: true,
            trim: true,
        },
        categoryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'ServiceCategory',
            required: true,
            index: true,
        },
        description: {
            type: String,
            trim: true,
            default: '',
        },
        shortDescription: {
            type: String,
            trim: true,
            default: '',
        },
        image: {
            type: String,
            default: '',
        },
        pricingType: {
            type: String,
            enum: ['FIXED', 'PER_UNIT', 'SIZE_BASED', 'CUSTOM_QUOTE'],
            default: 'FIXED',
            required: true,
        },
        suggestedPrice: {
            type: Number,
            min: 0,
            default: 0,
        },
        bookingType: {
            type: String,
            enum: ['INSTANT', 'SCHEDULED', 'SITE_VISIT', 'CUSTOM_QUOTE'],
            default: 'SCHEDULED',
            required: true,
        },
        estimatedDuration: {
            type: String,
            default: '',
        },
        serviceFields: [serviceFieldSchema],
        additionalNotes: {
            type: String,
            trim: true,
            default: '',
        },
        status: {
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: 'pending',
            index: true,
        },
        approvedServiceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Service',
            default: null,
        },
        approvedVendorServiceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'VendorService',
            default: null,
        },
        reviewedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Admin',
            default: null,
        },
        reviewedAt: {
            type: Date,
            default: null,
        },
        rejectionReason: {
            type: String,
            default: null,
        },
    },
    { timestamps: true }
);

serviceRequestSchema.index({ vendorId: 1, status: 1 });
serviceRequestSchema.index({ categoryId: 1, serviceName: 1, status: 1 });

const ServiceRequest = mongoose.model('ServiceRequest', serviceRequestSchema);
export { ServiceRequest };
export default ServiceRequest;
