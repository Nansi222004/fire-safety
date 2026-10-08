import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Service from '../../../models/Service.model.js';
import ServiceCategory from '../../../models/ServiceCategory.model.js';
import { slugify } from '../../../utils/slugify.js';

/**
 * Helper to normalize dynamic service field keys and options
 */
const slugKey = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/**
 * Normalizes admin booking-flow config (category types, quantity, schedule, pricing extras).
 * Only keys present in the request are returned, so partial updates leave other config untouched.
 */
const normalizeBookingFlowConfig = (body = {}) => {
    const out = {};
    if (body.variantConfig) {
        out.variantConfig = {
            label: String(body.variantConfig.label || '').trim() || 'Category Type',
            description: String(body.variantConfig.description || '').trim(),
        };
    }
    if (Array.isArray(body.variants)) {
        const seen = new Set();
        out.variants = body.variants.map((v, i) => {
            const key = slugKey(v.key || v.label);
            if (!key) throw new ApiError(400, 'Each category type needs a name.');
            if (seen.has(key)) throw new ApiError(400, `Duplicate category type "${v.label}".`);
            seen.add(key);
            return {
                key,
                label: String(v.label || '').trim(),
                description: String(v.description || '').trim(),
                isActive: v.isActive !== false,
                sortOrder: Number.isInteger(v.sortOrder) ? v.sortOrder : i,
            };
        });
    }
    if (body.quantityConfig) {
        const min = Math.max(1, Number(body.quantityConfig.min) || 1);
        const max = Math.max(1, Number(body.quantityConfig.max) || 100);
        if (max < min) throw new ApiError(400, 'Maximum quantity cannot be less than minimum quantity.');
        out.quantityConfig = {
            label: String(body.quantityConfig.label || '').trim() || 'Quantity',
            unitLabel: String(body.quantityConfig.unitLabel || '').trim() || 'unit',
            min,
            max,
        };
    }
    if (body.bookingConfig) {
        out.bookingConfig = {
            slotDurationMinutes: Number(body.bookingConfig.slotDurationMinutes) || 60,
            advanceBookingDays: Number(body.bookingConfig.advanceBookingDays) || 30,
            minLeadMinutes: Math.max(0, Number(body.bookingConfig.minLeadMinutes) || 0),
        };
    }
    if (body.pricingConfig) {
        out.pricingConfig = {
            visitCharge: Math.max(0, Number(body.pricingConfig.visitCharge) || 0),
            taxRate: Math.min(100, Math.max(0, Number(body.pricingConfig.taxRate) || 0)),
            priceNote: String(body.pricingConfig.priceNote || '').trim(),
        };
    }
    return out;
};

const normalizeServiceFields = (fields = []) => {
    if (!Array.isArray(fields)) return [];
    return fields.map((f, index) => {
        const rawLabel = String(f?.label || '').trim();
        const rawKey = String(f?.key || '').trim();
        const cleanKey = (rawKey || slugify(rawLabel) || `field_${index + 1}`)
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, '_');

        const cleanOptions = Array.isArray(f?.options)
            ? f.options.map((opt) => String(opt || '').trim()).filter(Boolean)
            : [];

        return {
            key: cleanKey,
            label: rawLabel,
            type: f?.type || 'TEXT',
            required: Boolean(f?.required),
            placeholder: String(f?.placeholder || '').trim(),
            options: cleanOptions,
            sortOrder: Number(f?.sortOrder) || index,
        };
    }).filter((f) => f.label);
};

/**
 * @desc    Get all services with filtering, search, and pagination
 * @route   GET /api/admin/services
 * @access  Private (Admin)
 */
export const getAllServices = asyncHandler(async (req, res) => {
    const { page, limit, search, categoryId, status, pricingType, bookingType } = req.query;
    const filter = {};

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

    if (status) {
        if (String(status).toUpperCase() === 'ACTIVE' || status === 'true') {
            filter.isActive = true;
        } else if (String(status).toUpperCase() === 'INACTIVE' || status === 'false') {
            filter.isActive = false;
        }
    }

    if (pricingType) {
        filter.pricingType = String(pricingType).toUpperCase();
    }

    if (bookingType) {
        filter.bookingType = String(bookingType).toUpperCase();
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
                'Services fetched successfully.'
            )
        );
    }

    const services = await Service.find(filter)
        .populate('categoryId', 'name slug image isActive')
        .sort({ sortOrder: 1, name: 1 })
        .lean();

    res.status(200).json(new ApiResponse(200, services, 'Services fetched successfully.'));
});

/**
 * @desc    Get single service by ID
 * @route   GET /api/admin/services/:id
 * @access  Private (Admin)
 */
export const getServiceById = asyncHandler(async (req, res) => {
    const service = await Service.findById(req.params.id)
        .populate('categoryId', 'name slug image isActive')
        .lean();

    if (!service) {
        throw new ApiError(404, 'Service not found.');
    }

    res.status(200).json(new ApiResponse(200, service, 'Service fetched successfully.'));
});

/**
 * @desc    Create a new service
 * @route   POST /api/admin/services
 * @access  Private (Admin)
 */
export const createService = asyncHandler(async (req, res) => {
    const {
        name,
        categoryId,
        description = '',
        shortDescription = '',
        image = '',
        sortOrder = 0,
        isActive,
        status,
        pricingType = 'FIXED',
        bookingType = 'SCHEDULED',
        estimatedDuration = '',
        serviceSettings,
        serviceFields,
    } = req.body;

    const trimmedName = String(name || '').trim();
    if (!trimmedName) {
        throw new ApiError(400, 'Service name is required.');
    }

    // Verify category exists
    const category = await ServiceCategory.findById(categoryId);
    if (!category) {
        throw new ApiError(400, 'Selected Service Category does not exist.');
    }

    // Case-insensitive duplicate check within the same category
    const existing = await ServiceCategory.findOne;
    const existingService = await Service.findOne({
        categoryId,
        name: new RegExp(`^${trimmedName.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i'),
    });
    if (existingService) {
        throw new ApiError(400, 'A service with this name already exists in the selected category.');
    }

    let slug = slugify(trimmedName);
    const existingSlug = await Service.findOne({ slug });
    if (existingSlug) {
        slug = `${slug}-${Date.now()}`;
    }

    let activeState = true;
    if (typeof isActive === 'boolean') {
        activeState = isActive;
    } else if (status) {
        activeState = String(status).toUpperCase() === 'ACTIVE';
    }

    const cleanFields = normalizeServiceFields(serviceFields);

    const service = await Service.create({
        name: trimmedName,
        slug,
        categoryId,
        description: String(description || '').trim(),
        shortDescription: String(shortDescription || '').trim(),
        image: String(image || '').trim(),
        sortOrder: Number(sortOrder) || 0,
        isActive: activeState,
        pricingType,
        bookingType,
        estimatedDuration: String(estimatedDuration || '').trim(),
        serviceSettings: {
            requiresAddress: true,
            requiresDate: true,
            requiresTimeSlot: true,
            requiresQuantity: false,
            requiresSiteVisit: false,
            requiresQuote: false,
            requiresDocuments: false,
            isRecurring: false,
            ...serviceSettings,
        },
        serviceFields: cleanFields,
        ...normalizeBookingFlowConfig(req.body),
    });

    const populatedService = await Service.findById(service._id)
        .populate('categoryId', 'name slug image isActive')
        .lean();

    res.status(201).json(new ApiResponse(201, populatedService, 'Service created successfully.'));
});

/**
 * @desc    Update service details
 * @route   PUT /api/admin/services/:id
 * @access  Private (Admin)
 */
export const updateService = asyncHandler(async (req, res) => {
    const service = await Service.findById(req.params.id);
    if (!service) {
        throw new ApiError(404, 'Service not found.');
    }

    const {
        name,
        categoryId,
        description,
        shortDescription,
        image,
        sortOrder,
        isActive,
        status,
        pricingType,
        bookingType,
        estimatedDuration,
        serviceSettings,
        serviceFields,
    } = req.body;

    const updatePayload = {};

    const targetCategory = categoryId || service.categoryId;

    if (categoryId) {
        const cat = await ServiceCategory.findById(categoryId);
        if (!cat) {
            throw new ApiError(400, 'Selected Service Category does not exist.');
        }
        updatePayload.categoryId = categoryId;
    }

    if (name !== undefined) {
        const trimmedName = String(name).trim();
        if (!trimmedName) {
            throw new ApiError(400, 'Service name cannot be empty.');
        }

        const existing = await Service.findOne({
            _id: { $ne: req.params.id },
            categoryId: targetCategory,
            name: new RegExp(`^${trimmedName.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i'),
        });

        if (existing) {
            throw new ApiError(400, 'A service with this name already exists in the selected category.');
        }

        updatePayload.name = trimmedName;
        let newSlug = slugify(trimmedName);
        const existingSlug = await Service.findOne({
            _id: { $ne: req.params.id },
            slug: newSlug,
        });
        if (existingSlug) {
            newSlug = `${newSlug}-${Date.now()}`;
        }
        updatePayload.slug = newSlug;
    }

    if (description !== undefined) updatePayload.description = String(description).trim();
    if (shortDescription !== undefined) updatePayload.shortDescription = String(shortDescription).trim();
    if (image !== undefined) updatePayload.image = String(image).trim();
    if (sortOrder !== undefined) updatePayload.sortOrder = Number(sortOrder) || 0;
    if (pricingType !== undefined) updatePayload.pricingType = pricingType;
    if (bookingType !== undefined) updatePayload.bookingType = bookingType;
    if (estimatedDuration !== undefined) updatePayload.estimatedDuration = String(estimatedDuration).trim();

    if (typeof isActive === 'boolean') {
        updatePayload.isActive = isActive;
    } else if (status !== undefined) {
        updatePayload.isActive = String(status).toUpperCase() === 'ACTIVE';
    }

    if (serviceSettings) {
        updatePayload.serviceSettings = {
            ...(service.serviceSettings?.toObject ? service.serviceSettings.toObject() : service.serviceSettings),
            ...serviceSettings,
        };
    }

    if (Array.isArray(serviceFields)) {
        updatePayload.serviceFields = normalizeServiceFields(serviceFields);
    }

    Object.assign(updatePayload, normalizeBookingFlowConfig(req.body));

    const updatedService = await Service.findByIdAndUpdate(
        req.params.id,
        { $set: updatePayload },
        { new: true, runValidators: true }
    ).populate('categoryId', 'name slug image isActive').lean();

    res.status(200).json(new ApiResponse(200, updatedService, 'Service updated successfully.'));
});

/**
 * @desc    Toggle/update service active status
 * @route   PATCH /api/admin/services/:id/status
 * @access  Private (Admin)
 */
export const updateServiceStatus = asyncHandler(async (req, res) => {
    const service = await Service.findById(req.params.id);
    if (!service) {
        throw new ApiError(404, 'Service not found.');
    }

    const { isActive, status } = req.body;
    let nextState;

    if (typeof isActive === 'boolean') {
        nextState = isActive;
    } else if (status !== undefined) {
        nextState = String(status).toUpperCase() === 'ACTIVE';
    } else {
        nextState = !service.isActive;
    }

    service.isActive = nextState;
    await service.save();

    res.status(200).json(new ApiResponse(200, service, `Service ${nextState ? 'activated' : 'deactivated'} successfully.`));
});

/**
 * @desc    Delete service
 * @route   DELETE /api/admin/services/:id
 * @access  Private (Admin)
 */
export const deleteService = asyncHandler(async (req, res) => {
    const service = await Service.findById(req.params.id);
    if (!service) {
        throw new ApiError(404, 'Service not found.');
    }

    await Service.findByIdAndDelete(req.params.id);
    res.status(200).json(new ApiResponse(200, null, 'Service deleted successfully.'));
});
