import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import VendorService from '../../../models/VendorService.model.js';
import Service from '../../../models/Service.model.js';
import ServiceCategory from '../../../models/ServiceCategory.model.js';

/**
 * @desc    Get active platform services available for the authenticated vendor to enable
 * @route   GET /api/vendor/services/available
 * @access  Private (Vendor)
 */
export const getAvailableServices = asyncHandler(async (req, res) => {
    const vendorId = req.user.id;
    const { search, categoryId, page, limit } = req.query;

    // 1. Get IDs of services already enabled by this vendor
    const enabledDocs = await VendorService.find({ vendorId }).select('serviceId').lean();
    const enabledServiceIds = enabledDocs.map((d) => d.serviceId);

    // 2. Get active Service Category IDs
    const activeCategories = await ServiceCategory.find({ isActive: true }).select('_id').lean();
    const activeCategoryIds = activeCategories.map((c) => c._id);

    // 3. Build filter for active Service Master records not yet enabled
    const filter = {
        isActive: true,
        categoryId: { $in: activeCategoryIds },
        _id: { $nin: enabledServiceIds },
    };

    if (search) {
        const searchRegex = new RegExp(String(search).trim(), 'i');
        filter.$or = [
            { name: searchRegex },
            { description: searchRegex },
            { shortDescription: searchRegex },
        ];
    }

    if (categoryId) {
        filter.categoryId = categoryId;
    }

    if (page || limit) {
        const numericPage = Math.max(1, Number(page) || 1);
        const numericLimit = Math.max(1, Number(limit) || 20);
        const skip = (numericPage - 1) * numericLimit;

        const [services, total] = await Promise.all([
            Service.find(filter)
                .populate('categoryId', 'name slug image isActive')
                .sort({ sortOrder: 1, name: 1 })
                .skip(skip)
                .limit(numericLimit)
                .lean(),
            Service.countDocuments(filter),
        ]);

        return res.status(200).json(
            new ApiResponse(
                200,
                {
                    services,
                    total,
                    page: numericPage,
                    pages: Math.ceil(total / numericLimit),
                },
                'Available services fetched successfully.'
            )
        );
    }

    const services = await Service.find(filter)
        .populate('categoryId', 'name slug image isActive')
        .sort({ sortOrder: 1, name: 1 })
        .lean();

    res.status(200).json(new ApiResponse(200, services, 'Available services fetched successfully.'));
});

/**
 * @desc    Get all enabled services for the authenticated vendor
 * @route   GET /api/vendor/services
 * @access  Private (Vendor)
 */
export const getMyVendorServices = asyncHandler(async (req, res) => {
    const vendorId = req.user.id;
    const { search, categoryId, status, page, limit } = req.query;

    const filter = { vendorId };

    if (status) {
        if (String(status).toUpperCase() === 'ACTIVE' || status === 'true') {
            filter.isActive = true;
        } else if (String(status).toUpperCase() === 'INACTIVE' || status === 'false') {
            filter.isActive = false;
        }
    }

    let vendorServices = await VendorService.find(filter)
        .populate({
            path: 'serviceId',
            populate: { path: 'categoryId', select: 'name slug image isActive' },
        })
        .sort({ createdAt: -1 })
        .lean();

    // Client-side filtering in memory for populated search / categoryId
    if (search) {
        const searchRegex = new RegExp(String(search).trim(), 'i');
        vendorServices = vendorServices.filter((vs) => {
            const sName = vs.serviceId?.name || '';
            const sDesc = vs.serviceId?.description || '';
            return searchRegex.test(sName) || searchRegex.test(sDesc);
        });
    }

    if (categoryId) {
        vendorServices = vendorServices.filter((vs) => {
            const catId = vs.serviceId?.categoryId?._id || vs.serviceId?.categoryId;
            return String(catId) === String(categoryId);
        });
    }

    if (page || limit) {
        const numericPage = Math.max(1, Number(page) || 1);
        const numericLimit = Math.max(1, Number(limit) || 20);
        const skip = (numericPage - 1) * numericLimit;
        const paginated = vendorServices.slice(skip, skip + numericLimit);

        return res.status(200).json(
            new ApiResponse(
                200,
                {
                    vendorServices: paginated,
                    total: vendorServices.length,
                    page: numericPage,
                    pages: Math.ceil(vendorServices.length / numericLimit),
                },
                'Vendor services fetched successfully.'
            )
        );
    }

    res.status(200).json(new ApiResponse(200, vendorServices, 'Vendor services fetched successfully.'));
});

/**
 * @desc    Get single VendorService by ID
 * @route   GET /api/vendor/services/:id
 * @access  Private (Vendor)
 */
export const getVendorServiceById = asyncHandler(async (req, res) => {
    const vendorService = await VendorService.findOne({
        _id: req.params.id,
        vendorId: req.user.id,
    })
        .populate({
            path: 'serviceId',
            populate: { path: 'categoryId', select: 'name slug image isActive' },
        })
        .lean();

    if (!vendorService) {
        throw new ApiError(404, 'Vendor service not found.');
    }

    res.status(200).json(new ApiResponse(200, vendorService, 'Vendor service fetched successfully.'));
});

/**
 * @desc    Enable a platform service for the authenticated vendor
 * @route   POST /api/vendor/services/:serviceId/enable
 * @access  Private (Vendor)
 */
export const enableService = asyncHandler(async (req, res) => {
    const vendorId = req.user.id;
    const { serviceId } = req.params;

    // 1. Verify Service Master exists and is active
    const service = await Service.findById(serviceId);
    if (!service) {
        throw new ApiError(404, 'Service not found.');
    }
    if (!service.isActive) {
        throw new ApiError(400, 'Selected service is currently inactive on the platform.');
    }

    // 2. Verify Category exists and is active
    const category = await ServiceCategory.findById(service.categoryId);
    if (!category || !category.isActive) {
        throw new ApiError(400, 'Selected service category is currently inactive on the platform.');
    }

    // 3. Check if already enabled by this vendor
    const existing = await VendorService.findOne({ vendorId, serviceId });
    if (existing) {
        throw new ApiError(400, 'This service is already enabled for your store.');
    }

    // 4. Create VendorService record
    const vendorService = await VendorService.create({
        vendorId,
        serviceId,
        isActive: true,
        price: 0,
        serviceAreas: [],
        dailyCapacity: 10,
        workingHours: { start: '09:00', end: '18:00' },
    });

    const populated = await VendorService.findById(vendorService._id)
        .populate({
            path: 'serviceId',
            populate: { path: 'categoryId', select: 'name slug image isActive' },
        })
        .lean();

    res.status(201).json(new ApiResponse(201, populated, 'Service enabled successfully.'));
});

/**
 * @desc    Configure vendor-specific pricing, areas, capacity, and settings
 * @route   PUT /api/vendor/services/:id
 * @access  Private (Vendor)
 */
export const updateVendorService = asyncHandler(async (req, res) => {
    const vendorId = req.user.id;
    const vendorService = await VendorService.findOne({ _id: req.params.id, vendorId });

    if (!vendorService) {
        throw new ApiError(404, 'Vendor service record not found.');
    }

    const {
        price,
        variantPrices,
        serviceAreas,
        workingHours,
        dailyCapacity,
        vendorNotes,
        isActive,
        status,
    } = req.body;

    const updatePayload = {};

    if (price !== undefined) {
        const numPrice = Number(price);
        if (Number.isNaN(numPrice) || numPrice < 0) {
            throw new ApiError(400, 'Invalid service price.');
        }
        updatePayload.price = numPrice;
    }

    if (variantPrices && typeof variantPrices === 'object') {
        updatePayload.variantPrices = variantPrices;
    }

    if (Array.isArray(serviceAreas)) {
        updatePayload.serviceAreas = serviceAreas.map((a) => String(a || '').trim()).filter(Boolean);
    }

    if (workingHours && typeof workingHours === 'object') {
        updatePayload.workingHours = {
            start: String(workingHours.start || '09:00').trim(),
            end: String(workingHours.end || '18:00').trim(),
        };
    }

    if (dailyCapacity !== undefined) {
        const numCap = Number(dailyCapacity);
        if (!Number.isNaN(numCap) && numCap >= 0) {
            updatePayload.dailyCapacity = numCap;
        }
    }

    if (vendorNotes !== undefined) {
        updatePayload.vendorNotes = String(vendorNotes).trim();
    }

    if (typeof isActive === 'boolean') {
        updatePayload.isActive = isActive;
    } else if (status !== undefined) {
        updatePayload.isActive = String(status).toUpperCase() === 'ACTIVE';
    }

    const updated = await VendorService.findOneAndUpdate(
        { _id: req.params.id, vendorId },
        { $set: updatePayload },
        { new: true, runValidators: true }
    )
        .populate({
            path: 'serviceId',
            populate: { path: 'categoryId', select: 'name slug image isActive' },
        })
        .lean();

    res.status(200).json(new ApiResponse(200, updated, 'Vendor service updated successfully.'));
});

/**
 * @desc    Toggle status of a VendorService
 * @route   PATCH /api/vendor/services/:id/status
 * @access  Private (Vendor)
 */
export const updateVendorServiceStatus = asyncHandler(async (req, res) => {
    const vendorId = req.user.id;
    const vendorService = await VendorService.findOne({ _id: req.params.id, vendorId });

    if (!vendorService) {
        throw new ApiError(404, 'Vendor service record not found.');
    }

    const { isActive, status } = req.body;
    let nextState;

    if (typeof isActive === 'boolean') {
        nextState = isActive;
    } else if (status !== undefined) {
        nextState = String(status).toUpperCase() === 'ACTIVE';
    } else {
        nextState = !vendorService.isActive;
    }

    vendorService.isActive = nextState;
    await vendorService.save();

    res.status(200).json(new ApiResponse(200, vendorService, `Vendor service ${nextState ? 'enabled' : 'disabled'} successfully.`));
});

/**
 * @desc    Disable / remove a VendorService
 * @route   DELETE /api/vendor/services/:id
 * @access  Private (Vendor)
 */
export const deleteVendorService = asyncHandler(async (req, res) => {
    const vendorId = req.user.id;
    const vendorService = await VendorService.findOneAndDelete({ _id: req.params.id, vendorId });

    if (!vendorService) {
        throw new ApiError(404, 'Vendor service record not found.');
    }

    res.status(200).json(new ApiResponse(200, null, 'Vendor service disabled successfully.'));
});
