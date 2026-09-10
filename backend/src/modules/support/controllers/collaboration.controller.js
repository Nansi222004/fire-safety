import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import CollaborationInquiry from '../../../models/CollaborationInquiry.model.js';
import Admin from '../../../models/Admin.model.js';
import { createNotification } from '../../../services/notification.service.js';
import mongoose from 'mongoose';

const VALID_COLLABORATION_TYPES = [
    'Business Partnership',
    'Corporate Partnership',
    'Supplier / Manufacturer',
    'Service Partnership',
    'Other',
];

const VALID_STATUSES = ['new', 'in_review', 'contacted', 'closed'];

/**
 * @desc    Submit a public collaboration request
 * @route   POST /api/support/collaboration
 * @access  Public
 */
export const submitCollaborationInquiry = asyncHandler(async (req, res) => {
    const { name, companyName, phone, email, collaborationType, message } = req.body;

    const trimmedName = String(name || '').trim();
    const trimmedCompany = String(companyName || '').trim();
    const trimmedPhone = String(phone || '').trim();
    const trimmedEmail = String(email || '').trim().toLowerCase();
    const trimmedType = String(collaborationType || '').trim();
    const trimmedMessage = String(message || '').trim();

    // 1. Validate required fields
    if (!trimmedName) throw new ApiError(400, 'Full name is required.');
    if (!trimmedCompany) throw new ApiError(400, 'Company or Organization name is required.');
    if (!trimmedPhone) throw new ApiError(400, 'Phone number is required.');
    if (!trimmedEmail) throw new ApiError(400, 'Email address is required.');
    if (!trimmedType) throw new ApiError(400, 'Collaboration type is required.');
    if (!trimmedMessage) throw new ApiError(400, 'Message is required.');

    // 2. Validate formats & lengths
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(trimmedEmail)) {
        throw new ApiError(400, 'Please provide a valid email address.');
    }

    const cleanDigits = trimmedPhone.replace(/\D/g, '');
    if (cleanDigits.length < 10 || cleanDigits.length > 15) {
        throw new ApiError(400, 'Please provide a valid phone number with at least 10 digits.');
    }

    if (!VALID_COLLABORATION_TYPES.includes(trimmedType)) {
        throw new ApiError(400, `Invalid collaboration type. Allowed types: ${VALID_COLLABORATION_TYPES.join(', ')}.`);
    }

    if (trimmedMessage.length < 10) {
        throw new ApiError(400, 'Message must be at least 10 characters.');
    }

    if (trimmedMessage.length > 3000) {
        throw new ApiError(400, 'Message cannot exceed 3000 characters.');
    }

    // 3. Abuse prevention & rate limiting / deduplication (2-minute window per email/phone)
    const recentDuplicate = await CollaborationInquiry.findOne({
        $or: [{ email: trimmedEmail }, { phone: trimmedPhone }],
        createdAt: { $gte: new Date(Date.now() - 2 * 60 * 1000) },
    }).lean();

    if (recentDuplicate) {
        throw new ApiError(429, 'You have recently submitted a collaboration request. Our team is already reviewing it.');
    }

    // 4. Extract client metadata
    const ipAddress = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
    const userAgent = req.get('user-agent') || '';

    // 5. Persist inquiry to MongoDB
    const inquiry = await CollaborationInquiry.create({
        name: trimmedName,
        companyName: trimmedCompany,
        phone: trimmedPhone,
        email: trimmedEmail,
        collaborationType: trimmedType,
        message: trimmedMessage,
        status: 'new',
        ipAddress: Array.isArray(ipAddress) ? ipAddress[0] : String(ipAddress).split(',')[0].trim(),
        userAgent: String(userAgent).slice(0, 500),
    });

    // 6. Notify active platform admins (without exposing sensitive info or breaking if notification fails)
    try {
        const admins = await Admin.find({ isActive: true }).select('_id').lean();
        admins.forEach((admin) => {
            createNotification({
                recipientId: admin._id,
                recipientType: 'admin',
                title: 'New Collaboration Request',
                message: `A new collaboration request was submitted by ${trimmedName} from ${trimmedCompany} (${trimmedType}).`,
                type: 'support',
                data: {
                    inquiryId: String(inquiry._id),
                    collaborationType: trimmedType,
                },
            }).catch((err) => console.error('[Collaboration Notification Error]:', err.message));
        });
    } catch (notifyErr) {
        console.error('[Collaboration Admin Notify Error]:', notifyErr.message);
    }

    return res.status(201).json(
        new ApiResponse(
            201,
            {
                id: inquiry._id,
                status: inquiry.status,
                createdAt: inquiry.createdAt,
            },
            'Thank you! Your collaboration request has been submitted. Our team will contact you shortly.'
        )
    );
});

/**
 * @desc    Get all collaboration inquiries with pagination and filters
 * @route   GET /api/admin/support/collaboration-inquiries
 * @access  Private (Admin)
 */
export const getCollaborationInquiries = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, status, search, type } = req.query;
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);
    const skip = (pageNum - 1) * limitNum;

    const filter = {};

    if (status && status !== 'all' && VALID_STATUSES.includes(status)) {
        filter.status = status;
    }

    if (type && type !== 'all' && VALID_COLLABORATION_TYPES.includes(type)) {
        filter.collaborationType = type;
    }

    if (search && search.trim()) {
        const q = search.trim();
        filter.$or = [
            { name: { $regex: q, $options: 'i' } },
            { companyName: { $regex: q, $options: 'i' } },
            { email: { $regex: q, $options: 'i' } },
            { phone: { $regex: q, $options: 'i' } },
        ];
    }

    const [total, inquiries, statusCounts] = await Promise.all([
        CollaborationInquiry.countDocuments(filter),
        CollaborationInquiry.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum)
            .populate('reviewedBy', 'name email')
            .lean(),
        CollaborationInquiry.aggregate([
            { $group: { _id: '$status', count: { $sum: 1 } } },
        ]),
    ]);

    const stats = {
        total: 0,
        new: 0,
        in_review: 0,
        contacted: 0,
        closed: 0,
    };
    statusCounts.forEach((s) => {
        if (stats[s._id] !== undefined) {
            stats[s._id] = s.count;
        }
        stats.total += s.count;
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                inquiries,
                pagination: {
                    total,
                    page: pageNum,
                    limit: limitNum,
                    pages: Math.ceil(total / limitNum) || 1,
                },
                stats,
            },
            'Collaboration inquiries fetched successfully.'
        )
    );
});

/**
 * @desc    Get single collaboration inquiry by ID
 * @route   GET /api/admin/support/collaboration-inquiries/:id
 * @access  Private (Admin)
 */
export const getCollaborationInquiryById = asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new ApiError(400, 'Invalid inquiry ID format.');
    }

    const inquiry = await CollaborationInquiry.findById(id)
        .populate('reviewedBy', 'name email')
        .lean();

    if (!inquiry) {
        throw new ApiError(404, 'Collaboration inquiry not found.');
    }

    return res.status(200).json(
        new ApiResponse(200, inquiry, 'Collaboration inquiry details fetched.')
    );
});

/**
 * @desc    Update collaboration inquiry status and admin notes
 * @route   PATCH /api/admin/support/collaboration-inquiries/:id/status
 * @access  Private (Admin)
 */
export const updateCollaborationInquiryStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status, adminNotes } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new ApiError(400, 'Invalid inquiry ID format.');
    }

    if (status && !VALID_STATUSES.includes(status)) {
        throw new ApiError(400, `Invalid status. Allowed values: ${VALID_STATUSES.join(', ')}.`);
    }

    const inquiry = await CollaborationInquiry.findById(id);
    if (!inquiry) {
        throw new ApiError(404, 'Collaboration inquiry not found.');
    }

    if (status) {
        inquiry.status = status;
    }

    if (adminNotes !== undefined) {
        inquiry.adminNotes = String(adminNotes || '').trim().slice(0, 2000);
    }

    inquiry.reviewedBy = req.user?._id || req.user?.id || null;
    inquiry.reviewedAt = new Date();

    await inquiry.save();

    const updated = await CollaborationInquiry.findById(inquiry._id)
        .populate('reviewedBy', 'name email')
        .lean();

    return res.status(200).json(
        new ApiResponse(200, updated, 'Collaboration inquiry status updated successfully.')
    );
});

export default {
    submitCollaborationInquiry,
    getCollaborationInquiries,
    getCollaborationInquiryById,
    updateCollaborationInquiryStatus,
};
