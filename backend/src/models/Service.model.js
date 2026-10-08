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

        // ─── Booking flow configuration (all admin-managed; defaults keep legacy behaviour) ──
        // "Category type" options for this service, e.g. CO2 / ABC / DCP, or 2 KG / 4 KG / 9 KG.
        // Providers set a price per option via VendorService.variantPrices[key].
        variantConfig: {
            label: { type: String, trim: true, default: 'Category Type' },
            description: { type: String, trim: true, default: '' },
        },
        variants: [
            {
                key: { type: String, required: true, trim: true },
                label: { type: String, required: true, trim: true },
                description: { type: String, trim: true, default: '' },
                isActive: { type: Boolean, default: true },
                sortOrder: { type: Number, default: 0 },
            },
        ],
        // Shown only when serviceSettings.requiresQuantity is true.
        quantityConfig: {
            label: { type: String, trim: true, default: 'Quantity' },
            unitLabel: { type: String, trim: true, default: 'unit' },
            min: { type: Number, default: 1, min: 1 },
            max: { type: Number, default: 100, min: 1 },
        },
        bookingConfig: {
            slotDurationMinutes: { type: Number, default: 60, min: 15, max: 480 },
            advanceBookingDays: { type: Number, default: 30, min: 1, max: 180 },
            minLeadMinutes: { type: Number, default: 0, min: 0 },
        },
        pricingConfig: {
            visitCharge: { type: Number, default: 0, min: 0 },
            taxRate: { type: Number, default: 0, min: 0, max: 100 },
            priceNote: { type: String, trim: true, default: '' },
        },
    },
    { timestamps: true }
);

serviceSchema.index({ categoryId: 1, name: 1 });
serviceSchema.index({ categoryId: 1, isActive: 1 });
serviceSchema.index({ isActive: 1, sortOrder: 1, name: 1 });

const Service = mongoose.model('Service', serviceSchema);
export { Service };
export default Service;
