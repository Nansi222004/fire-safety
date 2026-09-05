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

const serviceSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        slug: { type: String, required: true, unique: true },
        categoryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'ServiceCategory',
            required: true,
            index: true,
        },
        description: { type: String, trim: true, default: '' },
        shortDescription: { type: String, trim: true, default: '' },
        image: { type: String, default: '' },
        sortOrder: { type: Number, default: 0 },
        isActive: { type: Boolean, default: true, index: true },
        pricingType: {
            type: String,
            enum: ['FIXED', 'PER_UNIT', 'SIZE_BASED', 'CUSTOM_QUOTE'],
            default: 'FIXED',
            required: true,
        },
        bookingType: {
            type: String,
            enum: ['INSTANT', 'SCHEDULED', 'SITE_VISIT', 'CUSTOM_QUOTE'],
            default: 'SCHEDULED',
            required: true,
        },
        estimatedDuration: { type: String, default: '' },
        serviceSettings: {
            requiresAddress: { type: Boolean, default: true },
            requiresDate: { type: Boolean, default: true },
            requiresTimeSlot: { type: Boolean, default: true },
            requiresQuantity: { type: Boolean, default: false },
            requiresSiteVisit: { type: Boolean, default: false },
            requiresQuote: { type: Boolean, default: false },
            requiresDocuments: { type: Boolean, default: false },
            isRecurring: { type: Boolean, default: false },
        },
        rating: {
            type: Number,
            default: 0,
            min: 0,
            max: 5,
        },
        reviewCount: {
            type: Number,
            default: 0,
            min: 0,
        },
        serviceFields: [serviceFieldSchema],
    },
    { timestamps: true }
);

serviceSchema.index({ categoryId: 1, name: 1 });
serviceSchema.index({ categoryId: 1, isActive: 1 });
serviceSchema.index({ isActive: 1, sortOrder: 1, name: 1 });

const Service = mongoose.model('Service', serviceSchema);
export { Service };
export default Service;
