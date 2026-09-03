import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import ServiceRequest from '../../../models/ServiceRequest.model.js';
import ServiceCategory from '../../../models/ServiceCategory.model.js';
import Service from '../../../models/Service.model.js';

/**
 * @desc    Submit a new service creation request to Admin
 * @route   POST /api/vendor/service-requests
 * @access  Private (Vendor)
 */
export const createServiceRequest = asyncHandler(async (req, res) => {
    const vendorId = req.user.id || req.user._id;
    const {
        serviceName,
        categoryId,
        description = '',
        shortDescription = '',
        image = '',
        pricingType = 'FIXED',
        suggestedPrice = 0,
        bookingType = 'SCHEDULED',
        estimatedDuration = '',
        serviceFields = [],
        additionalNotes = '',
    } = req.body;

    const trimmedName = String(serviceName || '').trim();
    if (!trimmedName) {
        throw new ApiError(400, 'Service name is required.');
    }

    // 1. Verify Service Category exists and is active
    const category = await ServiceCategory.findById(categoryId);
    if (!category || !category.isActive) {
        throw new ApiError(400, 'Selected Service Category is invalid or inactive.');
    }

    const nameRegex = new RegExp(`^${trimmedName.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i');

    // 2. Duplicate Service Master Check
    const existingMaster = await Service.findOne({
        categoryId,
        name: nameRegex,
    });
    if (existingMaster) {
        throw new ApiError(400, 'This service already exists on the platform. Please enable it from Available Services.');
    }

    // 3. Duplicate Pending Request Check for this Vendor
    const existingPending = await ServiceRequest.findOne({
        vendorId,
        categoryId,
        serviceName: nameRegex,
        status: 'pending',
    });
    if (existingPending) {
        throw new ApiError(400, 'You already have a pending request for this service.');
    }

    // 4. Create Service Request
    const serviceRequest = await ServiceRequest.create({
        vendorId,
        serviceName: trimmedName,
        categoryId,
        description: String(description || '').trim(),
        shortDescription: String(shortDescription || '').trim(),
        image: String(image || '').trim(),
        pricingType,
        suggestedPrice: Math.max(0, Number(suggestedPrice) || 0),
        bookingType,
        estimatedDuration: String(estimatedDuration || '').trim(),
        serviceFields: Array.isArray(serviceFields) ? serviceFields : [],
        additionalNotes: String(additionalNotes || '').trim(),
        status: 'pending',
    });

    const populated = await ServiceRequest.findById(serviceRequest._id)
        .populate('categoryId', 'name slug image')
        .lean();

    res.status(201).json(new ApiResponse(201, populated, 'Service request submitted successfully.'));
});

/**
 * @desc    Get all service requests submitted by the authenticated vendor
 * @route   GET /api/vendor/service-requests
 * @access  Private (Vendor)
 */
export const getVendorServiceRequests = asyncHandler(async (req, res) => {
    const vendorId = req.user.id || req.user._id;
    const { status, page = 1, limit = 20 } = req.query;

    const numericPage = Math.max(1, Number.parseInt(page, 10) || 1);
    const numericLimit = Math.max(1, Number.parseInt(limit, 10) || 20);
    const skip = (numericPage - 1) * numericLimit;

    const filter = { vendorId };
    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
        filter.status = status;
    }

    const [requests, total] = await Promise.all([
        ServiceRequest.find(filter)
            .populate('categoryId', 'name slug image')
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
            'Vendor service requests fetched.'
        )
    );
});

/**
 * @desc    Get details of a single service request for the vendor
 * @route   GET /api/vendor/service-requests/:id
 * @access  Private (Vendor)
 */
export const getVendorServiceRequestById = asyncHandler(async (req, res) => {
    const vendorId = req.user.id || req.user._id;

    const request = await ServiceRequest.findOne({
        _id: req.params.id,
        vendorId,
    })
        .populate('categoryId', 'name slug image')
        .populate('approvedServiceId', 'name slug')
        .lean();

    if (!request) {
        throw new ApiError(404, 'Service request not found.');
    }

    res.status(200).json(new ApiResponse(200, request, 'Service request details fetched.'));
});
