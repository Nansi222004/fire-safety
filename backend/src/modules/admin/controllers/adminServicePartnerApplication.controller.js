import mongoose from 'mongoose';
import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Vendor from '../../../models/Vendor.model.js';
import ServicePartnerApplication from '../../../models/ServicePartnerApplication.model.js';
import { createNotification } from '../../../services/notification.service.js';

/**
 * @desc    List all Service Partner Applications with filtering and pagination
 * @route   GET /api/admin/service-partner-applications
 * @access  Private (Admin)
 */
export const listApplications = asyncHandler(async (req, res) => {
    const { status, search, page = 1, limit = 20 } = req.query;
    const numericPage = Math.max(1, Number(page) || 1);
    const numericLimit = Math.max(1, Number(limit) || 20);
    const skip = (numericPage - 1) * numericLimit;

    const filter = {};
    if (status && ['pending', 'under_review', 'approved', 'rejected'].includes(status)) {
        filter.status = status;
    }

    const [applications, total, counts] = await Promise.all([
        ServicePartnerApplication.find(filter)
            .populate({
                path: 'vendorId',
                select: 'name storeName email phone storeLogo address vendorCapabilities serviceCapability status',
            })
            .populate('applicationData.requestedServiceCategories', 'name slug image')
            .populate('reviewedBy', 'name email')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(numericLimit)
            .lean(),
        ServicePartnerApplication.countDocuments(filter),
        ServicePartnerApplication.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                },
            },
        ]),
    ]);

    const stats = {
        pending: 0,
        under_review: 0,
        approved: 0,
        rejected: 0,
    };
    counts.forEach((c) => {
        if (stats[c._id] !== undefined) stats[c._id] = c.count;
    });

    res.status(200).json(
        new ApiResponse(
            200,
            {
                applications,
                pagination: {
                    total,
                    page: numericPage,
                    pages: Math.ceil(total / numericLimit),
                    limit: numericLimit,
                },
                stats,
            },
            'Service partner applications fetched successfully.'
        )
    );
});

/**
 * @desc    Get single application by ID
 * @route   GET /api/admin/service-partner-applications/:id
 * @access  Private (Admin)
 */
export const getApplicationById = asyncHandler(async (req, res) => {
    const application = await ServicePartnerApplication.findById(req.params.id)
        .populate({
            path: 'vendorId',
            select: 'name storeName email phone storeLogo address vendorCapabilities serviceCapability status documents',
        })
        .populate('applicationData.requestedServiceCategories', 'name slug image')
        .populate('reviewedBy', 'name email')
        .populate('reviewHistory.reviewedBy', 'name email')
        .lean();

    if (!application) {
        throw new ApiError(404, 'Service Partner Application not found.');
    }

    res.status(200).json(new ApiResponse(200, application, 'Application details fetched.'));
});

/**
 * @desc    Approve a Service Partner Application
 * @route   POST /api/admin/service-partner-applications/:id/approve
 * @access  Private (Admin)
 */
export const approveApplication = asyncHandler(async (req, res) => {
    const applicationId = req.params.id;
    const adminId = req.user.id;
    const { adminNotes } = req.body;

    const session = await mongoose.startSession();
    session.startTransaction();

    let application;
    let vendor;

    try {
        application = await ServicePartnerApplication.findById(applicationId).session(session);
        if (!application) {
            throw new ApiError(404, 'Service Partner Application not found.');
        }

        // Idempotency: If already approved, return success without duplicate work
        if (application.status === 'approved') {
            await session.commitTransaction();
            return res.status(200).json(new ApiResponse(200, application, 'Application is already approved.'));
        }

        if (!['pending', 'under_review'].includes(application.status)) {
            throw new ApiError(400, `Cannot approve an application with status "${application.status}".`);
        }

        vendor = await Vendor.findById(application.vendorId).session(session);
        if (!vendor) {
            throw new ApiError(404, 'Associated vendor not found.');
        }

        // Verify that this application is not superseded by a newer application
        const newerApp = await ServicePartnerApplication.findOne({
            vendorId: application.vendorId,
            _id: { $ne: application._id },
            createdAt: { $gt: application.createdAt },
        }).session(session);

        if (newerApp) {
            throw new ApiError(400, 'Cannot approve: This application has been superseded by a newer application.');
        }

        const now = new Date();

        // 1. Update Application
        application.status = 'approved';
        application.reviewedBy = adminId;
        application.reviewedAt = now;
        if (adminNotes) application.adminNotes = String(adminNotes).trim();
        application.reviewHistory.push({
            status: 'approved',
            reviewedBy: adminId,
            reviewedAt: now,
            notes: adminNotes ? String(adminNotes).trim() : 'Approved by Admin',
        });
        await application.save({ session });

        // 2. Synchronize Vendor Capabilities
        vendor.serviceCapability = {
            status: 'approved',
            applicationId: application._id,
            appliedAt: application.appliedAt || now,
            reviewedBy: adminId,
            reviewedAt: now,
            rejectionReason: null,
        };
        vendor.vendorCapabilities = vendor.vendorCapabilities || { sellsProducts: true, providesServices: false };
        vendor.vendorCapabilities.providesServices = true;
        await vendor.save({ session });

        await session.commitTransaction();
    } catch (err) {
        await session.abortTransaction();
        throw err;
    } finally {
        session.endSession();
    }

    // 3. Dispatch Notification post-commit
    try {
        await createNotification({
            recipientId: vendor._id,
            recipientType: 'vendor',
            title: 'Service Partner Application Approved! 🎉',
            message: 'Congratulations! Your SafeFire Service Partner application has been approved. You can now configure your service offerings in the Vendor Portal.',
            type: 'system',
            data: {
                applicationId: String(application._id),
                status: 'approved',
            },
        });
    } catch (notifErr) {
        console.warn('Failed to send vendor approval notification:', notifErr.message);
    }

    const populated = await ServicePartnerApplication.findById(application._id)
        .populate('applicationData.requestedServiceCategories', 'name slug image')
        .populate('reviewedBy', 'name email')
        .lean();

    res.status(200).json(new ApiResponse(200, populated, 'Service Partner application approved successfully.'));
});

/**
 * @desc    Reject a Service Partner Application
 * @route   POST /api/admin/service-partner-applications/:id/reject
 * @access  Private (Admin)
 */
export const rejectApplication = asyncHandler(async (req, res) => {
    const applicationId = req.params.id;
    const adminId = req.user.id;
    const { reason, adminNotes } = req.body;

    const trimmedReason = String(reason || '').trim();
    if (!trimmedReason || trimmedReason.length < 10) {
        throw new ApiError(400, 'Rejection reason is mandatory and must be at least 10 characters.');
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    let application;
    let vendor;
    let wasAlreadyApproved = false;

    try {
        application = await ServicePartnerApplication.findById(applicationId).session(session);
        if (!application) {
            throw new ApiError(404, 'Service Partner Application not found.');
        }

        if (!['pending', 'under_review'].includes(application.status)) {
            throw new ApiError(400, `Cannot reject an application with status "${application.status}".`);
        }

        vendor = await Vendor.findById(application.vendorId).session(session);
        if (!vendor) {
            throw new ApiError(404, 'Associated vendor not found.');
        }

        // Rule 3: Check if vendor was ALREADY approved prior to this application
        const priorApprovedApp = await ServicePartnerApplication.findOne({
            vendorId: vendor._id,
            status: 'approved',
            _id: { $ne: application._id },
        }).sort({ createdAt: -1 }).session(session);

        wasAlreadyApproved =
            (vendor.serviceCapability?.status === 'approved' && vendor.vendorCapabilities?.providesServices === true) ||
            Boolean(priorApprovedApp);

        const now = new Date();

        // 1. Update Application
        application.status = 'rejected';
        application.rejectionReason = trimmedReason;
        application.reviewedBy = adminId;
        application.reviewedAt = now;
        if (adminNotes) application.adminNotes = String(adminNotes).trim();
        application.reviewHistory.push({
            status: 'rejected',
            reviewedBy: adminId,
            reviewedAt: now,
            reason: trimmedReason,
            notes: adminNotes ? String(adminNotes).trim() : undefined,
        });
        await application.save({ session });

        // 2. Update Vendor Capability status safely
        if (!wasAlreadyApproved) {
            // First-time applicant: status becomes rejected, capability remains false
            vendor.serviceCapability = {
                status: 'rejected',
                applicationId: application._id,
                appliedAt: application.appliedAt || now,
                reviewedBy: adminId,
                reviewedAt: now,
                rejectionReason: trimmedReason,
            };
            vendor.vendorCapabilities = vendor.vendorCapabilities || { sellsProducts: true, providesServices: false };
            vendor.vendorCapabilities.providesServices = false;
            await vendor.save({ session });
        } else {
            // Previously approved vendor remains approved! Do not disable existing capability.
            if (priorApprovedApp) {
                vendor.serviceCapability.applicationId = priorApprovedApp._id;
            }
            vendor.serviceCapability.status = 'approved';
            vendor.vendorCapabilities = vendor.vendorCapabilities || { sellsProducts: true, providesServices: false };
            vendor.vendorCapabilities.providesServices = true;
            await vendor.save({ session });
            console.log(`[Service Application] Vendor ${vendor._id} retains approved standing; renewal application rejected.`);
        }

        await session.commitTransaction();
    } catch (err) {
        await session.abortTransaction();
        throw err;
    } finally {
        session.endSession();
    }

    // 3. Dispatch Rejection Notification post-commit
    try {
        await createNotification({
            recipientId: vendor._id,
            recipientType: 'vendor',
            title: 'Service Partner Application Requires Changes',
            message: `Your Service Partner application was reviewed and requires changes: ${trimmedReason}`,
            type: 'system',
            data: {
                applicationId: String(application._id),
                status: 'rejected',
                reason: trimmedReason,
            },
        });
    } catch (notifErr) {
        console.warn('Failed to send vendor rejection notification:', notifErr.message);
    }

    const populated = await ServicePartnerApplication.findById(application._id)
        .populate('applicationData.requestedServiceCategories', 'name slug image')
        .populate('reviewedBy', 'name email')
        .lean();

    res.status(200).json(new ApiResponse(200, populated, 'Service Partner application rejected.'));
});
