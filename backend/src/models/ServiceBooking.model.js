import mongoose from 'mongoose';

const serviceBookingSchema = new mongoose.Schema(
    {
        bookingId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        serviceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Service',
            required: true,
            index: true,
        },
        vendorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Vendor',
            required: true,
            index: true,
        },
        vendorServiceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'VendorService',
            required: true,
        },
        serviceName: {
            type: String,
            required: true,
        },
        categoryName: {
            type: String,
            default: '',
        },
        serviceImage: {
            type: String,
            default: '',
        },
        variant: {
            key: { type: String, default: '' },
            label: { type: String, default: '' },
            price: { type: Number, default: 0 },
        },
        quantity: {
            type: Number,
            default: 1,
            min: 1,
        },
        pincode: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },
        serviceAddress: {
            fullName: { type: String, required: true },
            phone: { type: String, required: true },
            address: { type: String, required: true },
            city: { type: String, required: true },
            state: { type: String, required: true },
            zipCode: { type: String, required: true },
        },
        bookingDate: {
            type: Date,
            required: true,
        },
        timeSlot: {
            type: String,
            required: true,
        },
        customFields: {
            type: Map,
            of: String,
            default: {},
        },
        pricing: {
            unitPrice: { type: Number, required: true },
            quantity: { type: Number, default: 1 },
            subtotal: { type: Number, required: true },
            tax: { type: Number, default: 0 },
            total: { type: Number, required: true },
        },
        paymentMethod: {
            type: String,
            enum: ['cod', 'card', 'upi', 'netbanking', 'wallet'],
            default: 'cod',
        },
        paymentStatus: {
            type: String,
            enum: ['pending', 'paid', 'failed', 'refunded'],
            default: 'pending',
        },
        status: {
            type: String,
            enum: ['pending', 'confirmed', 'assigned', 'in_progress', 'completed', 'cancelled'],
            default: 'pending',
            index: true,
        },
        notes: {
            type: String,
            default: '',
        },
        vendorNotes: {
            type: String,
            default: '',
        },
        cancellationReason: {
            type: String,
            default: '',
        },
    },
    { timestamps: true }
);

serviceBookingSchema.index({ userId: 1, createdAt: -1 });
serviceBookingSchema.index({ vendorId: 1, createdAt: -1 });
serviceBookingSchema.index({ status: 1, createdAt: -1 });

const ServiceBooking = mongoose.model('ServiceBooking', serviceBookingSchema);
export { ServiceBooking };
export default ServiceBooking;
