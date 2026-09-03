import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import ServiceCategory from '../../../models/ServiceCategory.model.js';
import { slugify } from '../../../utils/slugify.js';

/**
 * @desc    Get all service categories with search, status filter, and pagination
 * @route   GET /api/admin/service-categories
 * @access  Private (Admin)
 */
export const getAllServiceCategories = asyncHandler(async (req, res) => {
    const { page, limit, search, status } = req.query;
    const filter = {};

    if (search) {
        const searchRegex = new RegExp(String(search).trim(), 'i');
        filter.$or = [
            { name: searchRegex },
            { description: searchRegex },
        ];
    }

    if (status) {
        if (String(status).toUpperCase() === 'ACTIVE' || status === 'true') {
            filter.isActive = true;
        } else if (String(status).toUpperCase() === 'INACTIVE' || status === 'false') {
            filter.isActive = false;
        }
    }

    if (page || limit) {
        const numericPage = Math.max(1, Number(page) || 1);
        const numericLimit = Math.max(1, Number(limit) || 20);
        const skip = (numericPage - 1) * numericLimit;

        const [categories, total] = await Promise.all([
            ServiceCategory.find(filter)
                .sort({ sortOrder: 1, name: 1 })
                .skip(skip)
                .limit(numericLimit)
                .lean(),
            ServiceCategory.countDocuments(filter),
        ]);

        return res.status(200).json(
            new ApiResponse(
                200,
                {
                    categories,
                    total,
                    page: numericPage,
                    pages: Math.ceil(total / numericLimit),
                },
                'Service categories fetched successfully.'
            )
        );
    }

    const categories = await ServiceCategory.find(filter).sort({ sortOrder: 1, name: 1 }).lean();
    res.status(200).json(new ApiResponse(200, categories, 'Service categories fetched successfully.'));
});

/**
 * @desc    Get single service category by ID
 * @route   GET /api/admin/service-categories/:id
 * @access  Private (Admin)
 */
export const getServiceCategoryById = asyncHandler(async (req, res) => {
    const category = await ServiceCategory.findById(req.params.id).lean();
    if (!category) {
        throw new ApiError(404, 'Service category not found.');
    }
    res.status(200).json(new ApiResponse(200, category, 'Service category fetched successfully.'));
});

/**
 * @desc    Create a new service category
 * @route   POST /api/admin/service-categories
 * @access  Private (Admin)
 */
export const createServiceCategory = asyncHandler(async (req, res) => {
    const { name, description = '', image = '', sortOrder = 0, isActive, status } = req.body;
    const trimmedName = String(name || '').trim();

    if (!trimmedName) {
        throw new ApiError(400, 'Service category name is required.');
    }

    // Case-insensitive duplicate name check
    const existing = await ServiceCategory.findOne({
        name: new RegExp(`^${trimmedName.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i'),
    });
    if (existing) {
        throw new ApiError(400, 'A service category with this name already exists.');
    }

    let slug = slugify(trimmedName);
    const existingSlug = await ServiceCategory.findOne({ slug });
    if (existingSlug) {
        slug = `${slug}-${Date.now()}`;
    }

    let activeState = true;
    if (typeof isActive === 'boolean') {
        activeState = isActive;
    } else if (status) {
        activeState = String(status).toUpperCase() === 'ACTIVE';
    }

    const category = await ServiceCategory.create({
        name: trimmedName,
        slug,
        description: String(description || '').trim(),
        image: String(image || '').trim(),
        sortOrder: Number(sortOrder) || 0,
        isActive: activeState,
    });

    res.status(201).json(new ApiResponse(201, category, 'Service category created successfully.'));
});

/**
 * @desc    Update service category details
 * @route   PUT /api/admin/service-categories/:id
 * @access  Private (Admin)
 */
export const updateServiceCategory = asyncHandler(async (req, res) => {
    const category = await ServiceCategory.findById(req.params.id);
    if (!category) {
        throw new ApiError(404, 'Service category not found.');
    }

    const { name, description, image, sortOrder, isActive, status } = req.body;
    const updatePayload = {};

    if (name !== undefined) {
        const trimmedName = String(name).trim();
        if (!trimmedName) {
            throw new ApiError(400, 'Service category name cannot be empty.');
        }

        // Case-insensitive duplicate check excluding current document
        const existing = await ServiceCategory.findOne({
            _id: { $ne: req.params.id },
            name: new RegExp(`^${trimmedName.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i'),
        });
        if (existing) {
            throw new ApiError(400, 'A service category with this name already exists.');
        }

        updatePayload.name = trimmedName;
        let newSlug = slugify(trimmedName);
        const existingSlug = await ServiceCategory.findOne({
            _id: { $ne: req.params.id },
            slug: newSlug,
        });
        if (existingSlug) {
            newSlug = `${newSlug}-${Date.now()}`;
        }
        updatePayload.slug = newSlug;
    }

    if (description !== undefined) {
        updatePayload.description = String(description).trim();
    }

    if (image !== undefined) {
        updatePayload.image = String(image).trim();
    }

    if (sortOrder !== undefined) {
        updatePayload.sortOrder = Number(sortOrder) || 0;
    }

    if (typeof isActive === 'boolean') {
        updatePayload.isActive = isActive;
    } else if (status !== undefined) {
        updatePayload.isActive = String(status).toUpperCase() === 'ACTIVE';
    }

    const updatedCategory = await ServiceCategory.findByIdAndUpdate(
        req.params.id,
        { $set: updatePayload },
        { new: true, runValidators: true }
    );

    res.status(200).json(new ApiResponse(200, updatedCategory, 'Service category updated successfully.'));
});

/**
 * @desc    Toggle/update service category status
 * @route   PATCH /api/admin/service-categories/:id/status
 * @access  Private (Admin)
 */
export const updateServiceCategoryStatus = asyncHandler(async (req, res) => {
    const category = await ServiceCategory.findById(req.params.id);
    if (!category) {
        throw new ApiError(404, 'Service category not found.');
    }

    const { isActive, status } = req.body;
    let nextState;

    if (typeof isActive === 'boolean') {
        nextState = isActive;
    } else if (status !== undefined) {
        nextState = String(status).toUpperCase() === 'ACTIVE';
    } else {
        nextState = !category.isActive;
    }

    category.isActive = nextState;
    await category.save();

    res.status(200).json(new ApiResponse(200, category, `Service category ${nextState ? 'activated' : 'deactivated'} successfully.`));
});

/**
 * @desc    Delete service category (safely)
 * @route   DELETE /api/admin/service-categories/:id
 * @access  Private (Admin)
 */
export const deleteServiceCategory = asyncHandler(async (req, res) => {
    const category = await ServiceCategory.findById(req.params.id);
    if (!category) {
        throw new ApiError(404, 'Service category not found.');
    }

    // Direct deletion since no dependent services exist yet in the database.
    // If services exist in the future, soft-delete / reference check can be enforced here.
    await ServiceCategory.findByIdAndDelete(req.params.id);

    res.status(200).json(new ApiResponse(200, null, 'Service category deleted successfully.'));
});
