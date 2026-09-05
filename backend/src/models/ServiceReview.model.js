import mongoose from 'mongoose';

const serviceReviewSchema = new mongoose.Schema(
    {
        serviceBookingId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'ServiceBooking',
            required: true,
            unique: true,
            index: true,
        },
        serviceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Service',
            required: true,
            index: true,
        },
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
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        rating: {
            type: Number,
            required: true,
            min: 1,
            max: 5,
        },
        title: {
            type: String,
            default: '',
            trim: true,
        },
        comment: {
            type: String,
            default: '',
            trim: true,
        },
        images: [{
            type: String,
        }],
        isApproved: {
            type: Boolean,
            default: true,
            index: true,
        },
    },
    { timestamps: true }
);

serviceReviewSchema.index({ serviceId: 1, isApproved: 1 });
serviceReviewSchema.index({ vendorId: 1, isApproved: 1 });

const ServiceReview = mongoose.model('ServiceReview', serviceReviewSchema);
export { ServiceReview };
export default ServiceReview;
