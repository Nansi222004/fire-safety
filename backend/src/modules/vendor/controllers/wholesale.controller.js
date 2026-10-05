import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Vendor from '../../../models/Vendor.model.js';
import Product from '../../../models/Product.model.js';
import Category from '../../../models/Category.model.js';
import Brand from '../../../models/Brand.model.js';
import Admin from '../../../models/Admin.model.js';
import { slugify } from '../../../utils/slugify.js';
import { createNotification } from '../../../services/notification.service.js';

const deriveStockStatus = (stockQuantity = 0, lowStockThreshold = 10) => {
    if (stockQuantity <= 0) return 'out_of_stock';
    if (stockQuantity <= lowStockThreshold) return 'low_stock';
    return 'in_stock';
};

const toNonNegative = (value) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
};

const toPositiveInt = (value) => {
    const n = Number(value);
    return Number.isInteger(n) && n >= 1 ? n : null;
};

const sanitizeBusinessDetails = (body = {}) => ({
    businessType: String(body.businessType || '').trim().slice(0, 100),
    gstNumber: String(body.gstNumber || '').trim().toUpperCase().slice(0, 20),
    expectedMonthlyVolume: String(body.expectedMonthlyVolume || '').trim().slice(0, 100),
    description: String(body.description || '').trim().slice(0, 1000),
});

/**
 * @desc    Get wholesale capability status for the authenticated vendor
 * @route   GET /api/vendor/wholesale/application
 */
export const getWholesaleApplication = asyncHandler(async (req, res) => {
    const vendor = await Vendor.findById(req.user.id).select('vendorCapabilities wholesaleCapability').lean();
    if (!vendor) throw new ApiError(404, 'Vendor not found.');
    res.status(200).json(new ApiResponse(200, {
        wholesaleCapability: vendor.wholesaleCapability || { status: 'none' },
        vendorCapabilities: vendor.vendorCapabilities || { sellsProducts: true, providesServices: false, wholesaleEnabled: false },
    }, 'Wholesale application status fetched.'));
});

/**
 * @desc    Apply for Wholesale/B2B capability (approved vendors). Admin approval required.
 * @route   POST /api/vendor/wholesale/application
 */
export const applyForWholesale = asyncHandler(async (req, res) => {
    const vendor = await Vendor.findById(req.user.id);
    if (!vendor) throw new ApiError(404, 'Vendor not found.');

    const currentStatus = vendor.wholesaleCapability?.status || 'none';
    if (currentStatus === 'pending') {
        throw new ApiError(400, 'Your wholesale application is already under review.');
    }
    if (currentStatus === 'approved' && vendor.vendorCapabilities?.wholesaleEnabled === true) {
        throw new ApiError(400, 'Wholesale capability is already enabled for your account.');
    }

    const businessDetails = sanitizeBusinessDetails(req.body);
    if (businessDetails.description.length < 20) {
        throw new ApiError(400, 'Please describe your wholesale business (at least 20 characters).');
    }

    vendor.wholesaleCapability = {
        status: 'pending',
        businessDetails,
        appliedAt: new Date(),
        reviewedBy: null,
        reviewedAt: null,
        rejectionReason: null,
    };
    await vendor.save();

    try {
        const admins = await Admin.find({ isActive: true }).select('_id');
        await Promise.all(admins.map((admin) => createNotification({
            recipientId: admin._id,
            recipientType: 'admin',
            title: 'New Wholesale/B2B Application',
            message: `${vendor.storeName || vendor.name} applied for Wholesale/B2B capability.`,
            type: 'system',
            data: { vendorId: String(vendor._id) },
        }).catch(() => null)));
    } catch (notifErr) {
        console.warn('Failed to notify admins of wholesale application:', notifErr.message);
    }

    res.status(200).json(new ApiResponse(200, {
        wholesaleCapability: vendor.wholesaleCapability,
        vendorCapabilities: vendor.vendorCapabilities,
    }, 'Wholesale application submitted. Awaiting admin approval.'));
});

/**
 * @desc    List the vendor's products for the wholesale workspace
 * @route   GET /api/vendor/wholesale/products?scope=wholesale|all&search=
 */
export const getWholesaleProducts = asyncHandler(async (req, res) => {
    const { scope = 'wholesale', search = '', page = 1, limit = 50 } = req.query;
    const numericPage = Math.max(1, Number(page) || 1);
    const numericLimit = Math.min(100, Math.max(1, Number(limit) || 50));

    const filter = { vendorId: req.user.id };
    if (scope !== 'all') filter['wholesale.enabled'] = true;
    if (String(search).trim()) {
        const escaped = String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        filter.name = { $regex: escaped, $options: 'i' };
    }

    const [products, total] = await Promise.all([
        Product.find(filter)
            .select('name image images price stockQuantity stock isActive b2cAvailable wholesale categoryId unit createdAt')
            .populate('categoryId', 'name')
            .sort({ createdAt: -1 })
            .skip((numericPage - 1) * numericLimit)
            .limit(numericLimit)
            .lean(),
        Product.countDocuments(filter),
    ]);

    res.status(200).json(new ApiResponse(200, {
        products,
        total,
        page: numericPage,
        pages: Math.ceil(total / numericLimit),
    }, 'Wholesale products fetched.'));
});

/**
 * @desc    Create a wholesale product (B2B only, or B2C + B2B for product sellers)
 * @route   POST /api/vendor/wholesale/products
 */
export const createWholesaleProduct = asyncHandler(async (req, res) => {
    const sellsProducts = req.vendorCapabilities?.sellsProducts === true;
    const {
        name,
        description = '',
        categoryId,
        brandId,
        unit = 'Piece',
        images = [],
        taxRate = 18,
        hsnCode = '',
        channel = 'b2b',
    } = req.body;

    const trimmedName = String(name || '').trim();
    if (trimmedName.length < 2) throw new ApiError(400, 'Product name is required.');
    if (!categoryId) throw new ApiError(400, 'Category is required.');

    const category = await Category.findById(categoryId);
    if (!category) throw new ApiError(404, 'Category not found.');
    if (!category.isActive) throw new ApiError(400, 'Selected category is inactive.');

    if (brandId) {
        const brand = await Brand.findById(brandId);
        if (!brand) throw new ApiError(404, 'Brand not found.');
        if (!brand.isActive) throw new ApiError(400, 'Selected brand is inactive.');
        if (brand.visibility === 'private' && String(brand.ownerVendorId) !== String(req.user.id)) {
            throw new ApiError(403, 'You do not have permission to use this private brand.');
        }
    }

    const wholesalePrice = toNonNegative(req.body.wholesalePrice);
    if (wholesalePrice === null) throw new ApiError(400, 'A valid wholesale price is required.');
    const moq = toPositiveInt(req.body.moq);
    if (moq === null) throw new ApiError(400, 'MOQ must be a whole number of at least 1.');

    const sellRetail = channel === 'both';
    if (sellRetail && !sellsProducts) {
        throw new ApiError(403, 'Retail (B2C) availability requires the Product Seller capability.');
    }
    let retailPrice = wholesalePrice;
    if (sellRetail) {
        retailPrice = toNonNegative(req.body.retailPrice);
        if (retailPrice === null) throw new ApiError(400, 'A valid retail price is required for B2C availability.');
    }

    const stockQuantity = toNonNegative(req.body.stockQuantity);
    if (stockQuantity === null) throw new ApiError(400, 'Invalid stock quantity.');
    const lowStockThreshold = toNonNegative(req.body.lowStockThreshold ?? 10) ?? 10;

    const cleanImages = (Array.isArray(images) ? images : [])
        .map((img) => String(img || '').trim())
        .filter(Boolean)
        .slice(0, 8);

    const product = await Product.create({
        name: trimmedName,
        slug: `${slugify(trimmedName)}-${Date.now()}`,
        description: String(description || '').trim(),
        vendorId: req.user.id,
        categoryId,
        ...(brandId ? { brandId } : {}),
        unit: String(unit || 'Piece').trim(),
        images: cleanImages,
        image: cleanImages[0] || undefined,
        price: retailPrice,
        taxRate: toNonNegative(taxRate) ?? 18,
        hsnCode: String(hsnCode || '').trim(),
        stockQuantity,
        lowStockThreshold,
        stock: deriveStockStatus(stockQuantity, lowStockThreshold),
        b2cAvailable: sellRetail,
        wholesale: { enabled: true, price: wholesalePrice, moq },
    });

    res.status(201).json(new ApiResponse(201, product, 'Wholesale product created.'));
});

/**
 * @desc    Update wholesale pricing / MOQ / channel availability for a vendor product
 * @route   PATCH /api/vendor/wholesale/products/:id
 */
export const updateWholesalePricing = asyncHandler(async (req, res) => {
    const product = await Product.findOne({ _id: req.params.id, vendorId: req.user.id });
    if (!product) throw new ApiError(404, 'Product not found or access denied.');

    const sellsProducts = req.vendorCapabilities?.sellsProducts === true;
    const { wholesaleEnabled, wholesalePrice, moq, b2cAvailable, stockQuantity } = req.body;

    const next = {
        enabled: wholesaleEnabled !== undefined ? Boolean(wholesaleEnabled) : product.wholesale?.enabled === true,
        price: product.wholesale?.price,
        moq: product.wholesale?.moq || 1,
    };

    if (wholesalePrice !== undefined) {
        const parsed = toNonNegative(wholesalePrice);
        if (parsed === null) throw new ApiError(400, 'A valid wholesale price is required.');
        next.price = parsed;
    }
    if (moq !== undefined) {
        const parsed = toPositiveInt(moq);
        if (parsed === null) throw new ApiError(400, 'MOQ must be a whole number of at least 1.');
        next.moq = parsed;
    }
    if (next.enabled && toNonNegative(next.price) === null) {
        throw new ApiError(400, 'Set a wholesale price before enabling wholesale availability.');
    }

    let nextB2c = product.b2cAvailable !== false;
    if (b2cAvailable !== undefined) {
        nextB2c = Boolean(b2cAvailable);
        if (nextB2c && !sellsProducts) {
            throw new ApiError(403, 'Retail (B2C) availability requires the Product Seller capability.');
        }
    }
    if (!nextB2c && !next.enabled) {
        throw new ApiError(400, 'A product must stay available on at least one channel (B2C or B2B).');
    }

    product.wholesale = next;
    product.b2cAvailable = nextB2c;

    if (stockQuantity !== undefined) {
        const parsedStock = toNonNegative(stockQuantity);
        if (parsedStock === null) throw new ApiError(400, 'Invalid stock quantity.');
        const hasVariantStock = product.variants?.stockMap && product.variants.stockMap.size > 0;
        if (hasVariantStock) {
            throw new ApiError(400, 'This product uses variant-level stock. Update stock from Stock Management.');
        }
        product.stockQuantity = parsedStock;
        product.stock = deriveStockStatus(parsedStock, product.lowStockThreshold ?? 10);
    }

    await product.save();
    res.status(200).json(new ApiResponse(200, product, 'Wholesale pricing updated.'));
});
