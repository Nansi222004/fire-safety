import mongoose from 'mongoose';

const collaborationInquirySchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Full name is required'],
            trim: true,
            maxlength: [100, 'Name cannot exceed 100 characters'],
        },
        companyName: {
            type: String,
            required: [true, 'Company / Organization name is required'],
            trim: true,
            maxlength: [150, 'Company name cannot exceed 150 characters'],
        },
        phone: {
            type: String,
            required: [true, 'Phone number is required'],
            trim: true,
            maxlength: [20, 'Phone number cannot exceed 20 characters'],
        },
        email: {
            type: String,
            required: [true, 'Email address is required'],
            trim: true,
            lowercase: true,
            maxlength: [150, 'Email cannot exceed 150 characters'],
            match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
        },
        collaborationType: {
            type: String,
            required: [true, 'Collaboration type is required'],
            enum: {
                values: [
                    'Business Partnership',
                    'Corporate Partnership',
                    'Supplier / Manufacturer',
                    'Service Partnership',
                    'Other',
                ],
                message: '{VALUE} is not a valid collaboration type',
            },
            index: true,
        },
        message: {
            type: String,
            required: [true, 'Message is required'],
            trim: true,
            minlength: [10, 'Message must be at least 10 characters'],
            maxlength: [3000, 'Message cannot exceed 3000 characters'],
        },
        status: {
            type: String,
            enum: ['new', 'in_review', 'contacted', 'closed'],
            default: 'new',
            index: true,
        },
        adminNotes: {
            type: String,
            default: '',
            maxlength: [2000, 'Admin notes cannot exceed 2000 characters'],
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
        ipAddress: {
            type: String,
            default: '',
        },
        userAgent: {
            type: String,
            default: '',
        },
    },
    {
        timestamps: true,
    }
);

collaborationInquirySchema.index({ createdAt: -1 });

const CollaborationInquiry = mongoose.model('CollaborationInquiry', collaborationInquirySchema);
export { CollaborationInquiry };
export default CollaborationInquiry;
