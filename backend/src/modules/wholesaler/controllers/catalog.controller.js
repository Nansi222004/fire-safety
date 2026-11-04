import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Product from '../../../models/Product.model.js';

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

/**
 * @desc    List the wholesaler's products
 * @route   GET /api/wholesaler/products?search=
 */
export const getWholesaleProducts = asyncHandler(async (req, res) => {
    const { search = '', page = 1, limit = 50 } = req.query;
    const numericPage = Math.max(1, Number(page) || 1);
    const numericLimit = Math.min(100, Math.max(1, Number(limit) || 50));

    // Every wholesaler product is wholesale-only, so no channel filter is needed.
    const filter = { vendorId: req.user.id };
    if (String(search).trim()) {
        const escaped = String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        filter.name = { $regex: escaped, $options: 'i' };
    }

    const [products, total] = await Promise.all([
        Product.find(filter)
            .select('name image images price stockQuantity stock isActive b2cAvailable wholesale variants.stockMap categoryId unit createdAt updatedAt')
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
 * @desc    Update wholesale price / MOQ / availability / stock of a wholesaler product
 * @route   PATCH /api/wholesaler/products/:id/pricing
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
