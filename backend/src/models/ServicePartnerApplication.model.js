import mongoose from 'mongoose';

const servicePartnerApplicationSchema = new mongoose.Schema(
    {
        vendorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Vendor',
            required: true,
            index: true,
        },
        status: {
            type: String,
            enum: ['pending', 'under_review', 'approved', 'rejected'],
            default: 'pending',
            index: true,
        },
        applicationData: {
            businessDescription: {
                type: String,
                trim: true,
                default: '',
            },
            serviceExperienceYears: {
                type: Number,
                default: 0,
                min: 0,
            },
            requestedServiceCategories: [
                {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'ServiceCategory',
                },
            ],
            requestedServiceAreas: [
                {
                    type: String,
                    trim: true,
                },
            ],
            certifications: [
                {
                    name: { type: String, trim: true },
                    issuer: { type: String, trim: true },
                    certificateNumber: { type: String, trim: true },
                    expiryDate: { type: Date },
                },
            ],
            additionalInformation: {
                type: String,
                trim: true,
                default: '',
            },
        },
        documents: [
            {
                name: { type: String, trim: true },
                url: { type: String, trim: true },
                documentType: { type: String, trim: true },
                filePublicId: { type: String, trim: true },
                uploadedAt: { type: Date, default: Date.now },
            },
        ],
        appliedAt: {
            type: Date,
            default: Date.now,
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
        adminNotes: {
            type: String,
            default: null,
        },
        resubmittedAt: {
            type: Date,
            default: null,
        },
        isCurrent: {
            type: Boolean,
            default: true,
            index: true,
        },
        reviewHistory: [
            {
                status: { type: String },
                reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
                reviewedAt: { type: Date, default: Date.now },
                reason: { type: String },
                notes: { type: String },
            },
        ],
    },
    { timestamps: true }
);

servicePartnerApplicationSchema.index({ vendorId: 1, isCurrent: 1 });
servicePartnerApplicationSchema.index({ vendorId: 1, status: 1 });
servicePartnerApplicationSchema.index({ status: 1, createdAt: -1 });

const ServicePartnerApplication = mongoose.model(
    'ServicePartnerApplication',
    servicePartnerApplicationSchema
);

export { ServicePartnerApplication };
export default ServicePartnerApplication;
