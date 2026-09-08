import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Vendor from '../../../models/Vendor.model.js';
import ServicePartnerApplication from '../../../models/ServicePartnerApplication.model.js';
import ServiceCategory from '../../../models/ServiceCategory.model.js';
import Admin from '../../../models/Admin.model.js';
import { createNotification } from '../../../services/notification.service.js';

/**
 * @desc    Submit a new Service Partner Application
 * @route   POST /api/vendor/service-partner-applications
 * @access  Private (Vendor)
 */
export const submitApplication = asyncHandler(async (req, res) => {
    const vendorId = req.user.id;
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) throw new ApiError(404, 'Vendor not found.');

    if (vendor.status !== 'approved') {
        throw new ApiError(403, 'Only approved vendors can apply to become Service Partners.');
    }

    // Check if there is already an active pending or under_review application
    const existingActive = await ServicePartnerApplication.findOne({
        vendorId,
        status: { $in: ['pending', 'under_review'] },
        isCurrent: true,
    });

    if (existingActive) {
        throw new ApiError(400, 'You already have a Service Partner application currently under review.');
    }

    const {
        businessDescription = '',
        serviceExperienceYears = 0,
        requestedServiceCategories = [],
        requestedServiceAreas = [],
        certifications = [],
        documents = [],
        additionalInformation = '',
    } = req.body;

    if (!businessDescription || String(businessDescription).trim().length < 20) {
        throw new ApiError(400, 'Please provide a business description (at least 20 characters).');
    }

    if (!Array.isArray(requestedServiceCategories) || requestedServiceCategories.length === 0) {
        throw new ApiError(400, 'Please select at least one service category.');
    }

    if (!Array.isArray(requestedServiceAreas) || requestedServiceAreas.length === 0) {
        throw new ApiError(400, 'Please specify at least one service area / pincode.');
    }

    // Verify requested service categories exist
    const validCats = await ServiceCategory.find({
        _id: { $in: requestedServiceCategories },
        isActive: true,
    }).select('_id');

    if (validCats.length === 0) {
        throw new ApiError(400, 'None of the requested service categories are valid active categories.');
    }

    // Mark previous applications as not current
    await ServicePartnerApplication.updateMany(
        { vendorId, isCurrent: true },
        { $set: { isCurrent: false } }
    );

    const newApplication = await ServicePartnerApplication.create({
        vendorId,
        status: 'pending',
        isCurrent: true,
        appliedAt: new Date(),
        applicationData: {
            businessDescription: String(businessDescription).trim(),
            serviceExperienceYears: Math.max(0, Number(serviceExperienceYears) || 0),
            requestedServiceCategories: validCats.map((c) => c._id),
            requestedServiceAreas: requestedServiceAreas.map((a) => String(a).trim()).filter(Boolean),
            certifications: Array.isArray(certifications)
                ? certifications.map((c) => ({
                      name: String(c.name || '').trim(),
                      issuer: String(c.issuer || '').trim(),
                      certificateNumber: String(c.certificateNumber || '').trim(),
                      expiryDate: c.expiryDate ? new Date(c.expiryDate) : null,
                  }))
                : [],
            additionalInformation: String(additionalInformation || '').trim(),
        },
        documents: Array.isArray(documents)
            ? documents.map((d) => ({
                  name: String(d.name || '').trim(),
                  url: String(d.url || '').trim(),
                  documentType: String(d.documentType || 'certification').trim(),
                  filePublicId: String(d.filePublicId || '').trim(),
                  uploadedAt: new Date(),
              }))
            : [],
    });

    // Update vendor serviceCapability status to pending only if not already approved
    const isAlreadyApproved =
        vendor.serviceCapability?.status === 'approved' &&
        vendor.vendorCapabilities?.providesServices === true;

    if (!isAlreadyApproved) {
        vendor.serviceCapability = {
            status: 'pending',
            applicationId: newApplication._id,
            appliedAt: new Date(),
            reviewedBy: null,
            reviewedAt: null,
            rejectionReason: null,
        };
        await vendor.save();
    }

    // Notify all active superadmins / admins
    try {
        const admins = await Admin.find({ isActive: true }).select('_id');
        for (const admin of admins) {
            await createNotification({
                recipientId: admin._id,
                recipientType: 'admin',
                title: 'New Service Partner Application',
                message: `${vendor.storeName || vendor.name} submitted an application to become a Service Partner.`,
                type: 'system',
                data: {
                    applicationId: String(newApplication._id),
                    vendorId: String(vendor._id),
                },
            }).catch(() => null);
        }
    } catch (notifErr) {
        console.warn('Failed to dispatch admin notification for service application:', notifErr.message);
    }

    const populated = await ServicePartnerApplication.findById(newApplication._id)
        .populate('applicationData.requestedServiceCategories', 'name slug image')
        .lean();

    res.status(201).json(new ApiResponse(201, populated, 'Service Partner application submitted successfully.'));
});

/**
 * @desc    Get current Service Partner Application status for authenticated vendor
 * @route   GET /api/vendor/service-partner-applications/current
 * @access  Private (Vendor)
 */
export const getCurrentApplication = asyncHandler(async (req, res) => {
    const vendorId = req.user.id;
    const vendor = await Vendor.findById(vendorId).select('serviceCapability vendorCapabilities name storeName');
    if (!vendor) throw new ApiError(404, 'Vendor not found.');

    let application = null;
    if (vendor.serviceCapability?.applicationId) {
        application = await ServicePartnerApplication.findById(vendor.serviceCapability.applicationId)
            .populate('applicationData.requestedServiceCategories', 'name slug image')
            .lean();
    }

    if (!application) {
        application = await ServicePartnerApplication.findOne({ vendorId, isCurrent: true })
            .populate('applicationData.requestedServiceCategories', 'name slug image')
            .sort({ createdAt: -1 })
            .lean();
    }

    res.status(200).json(
        new ApiResponse(
            200,
            {
                application,
                serviceCapability: vendor.serviceCapability || { status: 'none' },
                vendorCapabilities: vendor.vendorCapabilities || { sellsProducts: true, providesServices: false },
            },
            'Current service application fetched.'
        )
    );
});

/**
 * @desc    Resubmit a rejected Service Partner Application
 * @route   PUT /api/vendor/service-partner-applications/resubmit
 * @access  Private (Vendor)
 */
export const resubmitApplication = asyncHandler(async (req, res) => {
    const vendorId = req.user.id;
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) throw new ApiError(404, 'Vendor not found.');

    const currentApp = await ServicePartnerApplication.findOne({ vendorId, isCurrent: true }).sort({ createdAt: -1 });
    if (!currentApp || currentApp.status !== 'rejected') {
        throw new ApiError(400, 'Only rejected applications can be resubmitted.');
    }

    const {
        businessDescription = currentApp.applicationData.businessDescription,
        serviceExperienceYears = currentApp.applicationData.serviceExperienceYears,
        requestedServiceCategories = currentApp.applicationData.requestedServiceCategories,
        requestedServiceAreas = currentApp.applicationData.requestedServiceAreas,
        certifications = currentApp.applicationData.certifications,
        documents = currentApp.documents,
        additionalInformation = currentApp.applicationData.additionalInformation,
    } = req.body;

    if (!businessDescription || String(businessDescription).trim().length < 20) {
        throw new ApiError(400, 'Please provide a business description (at least 20 characters).');
    }

    // Mark previous as not current, preserve rejection reason in reviewHistory
    currentApp.isCurrent = false;
    await currentApp.save();

    const previousHistory = Array.isArray(currentApp.reviewHistory) ? currentApp.reviewHistory : [];
    if (currentApp.rejectionReason) {
        previousHistory.push({
            status: 'rejected',
            reviewedBy: currentApp.reviewedBy,
            reviewedAt: currentApp.reviewedAt || new Date(),
            reason: currentApp.rejectionReason,
            notes: currentApp.adminNotes,
        });
    }

    const newApplication = await ServicePartnerApplication.create({
        vendorId,
        status: 'pending',
        isCurrent: true,
        appliedAt: currentApp.appliedAt || new Date(),
        resubmittedAt: new Date(),
        reviewHistory: previousHistory,
        applicationData: {
            businessDescription: String(businessDescription).trim(),
            serviceExperienceYears: Math.max(0, Number(serviceExperienceYears) || 0),
            requestedServiceCategories,
            requestedServiceAreas,
            certifications,
            additionalInformation: String(additionalInformation || '').trim(),
        },
        documents,
    });

    const isAlreadyApproved =
        vendor.serviceCapability?.status === 'approved' &&
        vendor.vendorCapabilities?.providesServices === true;

    if (!isAlreadyApproved) {
        vendor.serviceCapability = {
            status: 'pending',
            applicationId: newApplication._id,
            appliedAt: new Date(),
            reviewedBy: null,
            reviewedAt: null,
            rejectionReason: null,
        };
        await vendor.save();
    }

    // Notify admins of resubmission
    try {
        const admins = await Admin.find({ isActive: true }).select('_id');
        for (const admin of admins) {
            await createNotification({
                recipientId: admin._id,
                recipientType: 'admin',
                title: 'Resubmitted Service Partner Application',
                message: `${vendor.storeName || vendor.name} resubmitted their Service Partner application for review.`,
                type: 'system',
                data: {
                    applicationId: String(newApplication._id),
                    vendorId: String(vendor._id),
                },
            }).catch(() => null);
        }
    } catch (notifErr) {
        console.warn('Failed to notify admins of resubmission:', notifErr.message);
    }

    const populated = await ServicePartnerApplication.findById(newApplication._id)
        .populate('applicationData.requestedServiceCategories', 'name slug image')
        .lean();

    res.status(200).json(new ApiResponse(200, populated, 'Application resubmitted successfully.'));
});
