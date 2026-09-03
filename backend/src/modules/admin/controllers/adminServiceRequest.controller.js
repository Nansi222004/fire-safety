import mongoose from 'mongoose';
import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import ServiceRequest from '../../../models/ServiceRequest.model.js';
import ServiceCategory from '../../../models/ServiceCategory.model.js';
import Service from '../../../models/Service.model.js';
import VendorService from '../../../models/VendorService.model.js';
import { slugify } from '../../../utils/slugify.js';
import { createNotification } from '../../../services/notification.service.js';
import { clearResponseCache } from '../../../middlewares/responseCache.js';

/**
 * @desc    Get all vendor service requests for Admin
 * @route   GET /api/admin/service-requests
 * @access  Private (Admin)
 */
export const getAllServiceRequests = asyncHandler(async (req, res) => {
    const { status, categoryId, search, page = 1, limit = 20 } = req.query;

    const numericPage = Math.max(1, Number.parseInt(page, 10) || 1);
    const numericLimit = Math.max(1, Number.parseInt(limit, 10) || 20);
    const skip = (numericPage - 1) * numericLimit;

    const filter = {};
    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
        filter.status = status;
    }
    if (categoryId) {
        filter.categoryId = categoryId;
    }
    if (search && String(search).trim()) {
        const safeRegex = new RegExp(String(search).trim().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'i');
        filter.serviceName = safeRegex;
    }

    const [requests, total] = await Promise.all([
        ServiceRequest.find(filter)
            .populate('vendorId', 'storeName name email phone')
            .populate('categoryId', 'name slug image')
            .populate('approvedServiceId', 'name slug')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(numericLimit)
            .lean(),
        ServiceRequest.countDocuments(filter),
    ]);

    const pages = Math.ceil(total / numericLimit) || 1;

    res.status(200).json(
        new ApiResponse(
            200,
            { requests, total, page: numericPage, pages },
            'Admin service requests fetched.'
        )
    );
});

/**
 * @desc    Get details of a single vendor service request for Admin
 * @route   GET /api/admin/service-requests/:id
 * @access  Private (Admin)
 */
export const getServiceRequestById = asyncHandler(async (req, res) => {
    const request = await ServiceRequest.findById(req.params.id)
        .populate('vendorId', 'storeName name email phone address city state')
        .populate('categoryId', 'name slug image')
        .populate('approvedServiceId', 'name slug')
        .populate('reviewedBy', 'name email')
        .lean();

    if (!request) {
        throw new ApiError(404, 'Service request not found.');
    }

    res.status(200).json(new ApiResponse(200, request, 'Service request details fetched.'));
});

/**
 * @desc    Approve a vendor service request: Creates official Service Master & VendorService
 * @route   POST /api/admin/service-requests/:id/approve
 * @access  Private (Admin)
 */
export const approveServiceRequest = asyncHandler(async (req, res) => {
    const adminId = req.user.id || req.user._id;
    const request = await ServiceRequest.findById(req.params.id);

    if (!request) {
        throw new ApiError(404, 'Service request not found.');
    }
    if (request.status !== 'pending') {
        throw new ApiError(400, `Request is already ${request.status}.`);
    }

    const category = await ServiceCategory.findById(request.categoryId);
    if (!category || !category.isActive) {
        throw new ApiError(400, 'Associated Service Category is inactive or deleted.');
    }

    // Use exact vendor-submitted parameters as-is
    const finalServiceName = String(request.serviceName).trim();
    const finalDescription = String(request.description || '').trim();
    const finalShortDescription = String(request.shortDescription || '').trim();
    const finalImage = String(request.image || '').trim();
    const finalPricingType = request.pricingType || 'FIXED';
    const finalBookingType = request.bookingType || 'SCHEDULED';
    const finalDuration = String(request.estimatedDuration || '').trim();
    const finalFields = request.serviceFields || [];
    const finalPrice = Math.max(0, Number(request.suggestedPrice) || 0);

    const session = await mongoose.startSession();
    let approvedServiceDoc = null;
    let approvedVendorServiceDoc = null;

    try {
        let isTransactionSupported = true;
        try {
            session.startTransaction();
        } catch {
            isTransactionSupported = false;
        }

        const nameRegex = new RegExp(`^${finalServiceName.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i');

        // 1. Check if Service Master already exists (handles race condition)
        let serviceMaster = await Service.findOne({
            categoryId: request.categoryId,
            name: nameRegex,
        }).session(isTransactionSupported ? session : null);

        if (!serviceMaster) {
            let slug = slugify(finalServiceName);
            const existingSlug = await Service.findOne({ slug }).session(isTransactionSupported ? session : null);
            if (existingSlug) {
                slug = `${slug}-${Date.now()}`;
            }

            const newServiceDocs = await Service.create(
                [
                    {
                        name: finalServiceName,
                        slug,
                        categoryId: request.categoryId,
                        description: finalDescription,
                        shortDescription: finalShortDescription,
                        image: finalImage,
                        isActive: true,
                        pricingType: finalPricingType,
                        bookingType: finalBookingType,
                        estimatedDuration: finalDuration,
                        serviceSettings: {
                            requiresAddress: true,
                            requiresDate: true,
                            requiresTimeSlot: true,
                            requiresQuantity: false,
                            requiresSiteVisit: false,
                            requiresQuote: false,
                            requiresDocuments: false,
                            isRecurring: false,
                        },
                        serviceFields: finalFields,
                    },
                ],
                isTransactionSupported ? { session } : {}
            );
            serviceMaster = newServiceDocs[0];
        }

        approvedServiceDoc = serviceMaster;

        // 2. Create or update VendorService link for requesting vendor
        let vendorService = await VendorService.findOne({
            vendorId: request.vendorId,
            serviceId: serviceMaster._id,
        }).session(isTransactionSupported ? session : null);

        if (!vendorService) {
            const newVsDocs = await VendorService.create(
                [
                    {
                        vendorId: request.vendorId,
                        serviceId: serviceMaster._id,
                        isActive: true,
                        price: finalPrice,
                        serviceAreas: [],
                        dailyCapacity: 10,
                        workingHours: { start: '09:00', end: '18:00' },
                    },
                ],
                isTransactionSupported ? { session } : {}
            );
            vendorService = newVsDocs[0];
        } else {
            vendorService.isActive = true;
            if (finalPrice > 0) vendorService.price = finalPrice;
            await vendorService.save(isTransactionSupported ? { session } : {});
        }

        approvedVendorServiceDoc = vendorService;

        // 3. Update ServiceRequest status
        request.status = 'approved';
        request.approvedServiceId = serviceMaster._id;
        request.approvedVendorServiceId = vendorService._id;
        request.reviewedBy = adminId;
        request.reviewedAt = new Date();
        await request.save(isTransactionSupported ? { session } : {});

        if (isTransactionSupported) {
            await session.commitTransaction();
        }
    } catch (err) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        throw err;
    } finally {
        session.endSession();
    }

    clearResponseCache();

    // Notify vendor
    try {
        await createNotification({
            recipientId: request.vendorId,
            recipientType: 'vendor',
            title: 'Service Request Approved! 🎉',
            message: `Your requested service "${request.serviceName}" has been approved and added to your store services!`,
            type: 'system',
            data: {
                serviceRequestId: request._id,
                serviceId: approvedServiceDoc._id,
                vendorServiceId: approvedVendorServiceDoc._id,
            },
        });
    } catch (err) {
        console.error('Notification error on service request approval:', err);
    }

    const updatedRequest = await ServiceRequest.findById(request._id)
        .populate('categoryId', 'name slug')
        .populate('approvedServiceId', 'name slug')
        .lean();

    res.status(200).json(new ApiResponse(200, updatedRequest, 'Service request approved and service created successfully.'));
});

/**
 * @desc    Reject a vendor service request
 * @route   POST /api/admin/service-requests/:id/reject
 * @access  Private (Admin)
 */
export const rejectServiceRequest = asyncHandler(async (req, res) => {
    const adminId = req.user.id || req.user._id;
    const { rejectionReason } = req.body;

    const trimmedReason = String(rejectionReason || '').trim();
    if (!trimmedReason) {
        throw new ApiError(400, 'Rejection reason is required.');
    }

    const request = await ServiceRequest.findById(req.params.id);
    if (!request) {
        throw new ApiError(404, 'Service request not found.');
    }
    if (request.status !== 'pending') {
        throw new ApiError(400, `Request is already ${request.status}.`);
    }

    request.status = 'rejected';
    request.rejectionReason = trimmedReason;
    request.reviewedBy = adminId;
    request.reviewedAt = new Date();
    await request.save();

    // Notify vendor
    try {
        await createNotification({
            recipientId: request.vendorId,
            recipientType: 'vendor',
            title: 'Service Request Update ⚠️',
            message: `Your service request for "${request.serviceName}" was rejected. Reason: ${trimmedReason}`,
            type: 'system',
            data: {
                serviceRequestId: request._id,
                rejectionReason: trimmedReason,
            },
        });
    } catch (err) {
        console.error('Notification error on service request rejection:', err);
    }

    const updatedRequest = await ServiceRequest.findById(request._id)
        .populate('categoryId', 'name slug')
        .lean();

    res.status(200).json(new ApiResponse(200, updatedRequest, 'Service request rejected successfully.'));
});
