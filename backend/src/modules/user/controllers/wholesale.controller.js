import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Product from '../../../models/Product.model.js';
import Vendor from '../../../models/Vendor.model.js';
import {
    getWholesaleBuyerForUser,
    assertWholesaleBuyer,
    toWholesaleProductView,
    WHOLESALE_APPROVED_FILTER,
} from '../../../services/wholesale.service.js';

const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Only products from currently-approved wholesale sellers are offered (excluding the buyer's own).
const buildWholesaleProductFilter = async (buyer) => {
    const sellerIds = await Vendor.find(WHOLESALE_APPROVED_FILTER).distinct('_id');
    return {
        isActive: true,
        'wholesale.enabled': true,
        'wholesale.price': { $gte: 0 },
        vendorId: { $in: sellerIds.filter((id) => String(id) !== String(buyer._id)) },
    };
};

/**
 * @desc    Whether the logged-in customer account has Wholesale/B2B access
 * @route   GET /api/user/wholesale/access
 */
export const getWholesaleAccess = asyncHandler(async (req, res) => {
    const buyer = await getWholesaleBuyerForUser(req.user.id);
    res.status(200).json(new ApiResponse(200, {
        wholesaleAccess: Boolean(buyer),
        businessName: buyer?.storeName || null,
    }, 'Wholesale access resolved.'));
});

/**
 * @desc    Wholesale catalog (B2B products + wholesale pricing + MOQ). B2B accounts only.
 * @route   GET /api/user/wholesale/products?search=&page=&limit=
 */
export const getWholesaleCatalog = asyncHandler(async (req, res) => {
    const buyer = await assertWholesaleBuyer(req.user.id);
    const numericPage = Math.max(1, parseInt(req.query.page, 10) || 1);
    const numericLimit = Math.min(60, Math.max(1, parseInt(req.query.limit, 10) || 24));

    const filter = await buildWholesaleProductFilter(buyer);
    const search = String(req.query.search || '').trim();
    if (search) filter.name = { $regex: escapeRegex(search), $options: 'i' };

    const [products, total] = await Promise.all([
        Product.find(filter)
            .select('name slug image images description unit price b2cAvailable wholesale stockQuantity stock taxRate categoryId brandId vendorId')
            .populate('vendorId', 'storeName')
            .sort({ createdAt: -1 })
            .skip((numericPage - 1) * numericLimit)
            .limit(numericLimit)
            .lean(),
        Product.countDocuments(filter),
    ]);

    res.status(200).json(new ApiResponse(200, {
        products: products.map(toWholesaleProductView),
        total,
        page: numericPage,
        pages: Math.ceil(total / numericLimit),
    }, 'Wholesale products fetched.'));
});

/**
 * @desc    Single wholesale product. B2B accounts only.
 * @route   GET /api/user/wholesale/products/:id
 */
export const getWholesaleProduct = asyncHandler(async (req, res) => {
    const buyer = await assertWholesaleBuyer(req.user.id);
    const filter = await buildWholesaleProductFilter(buyer);
    const product = await Product.findOne({ ...filter, _id: req.params.id })
        .select('name slug image images description unit price b2cAvailable wholesale stockQuantity stock taxRate categoryId brandId vendorId')
        .populate('vendorId', 'storeName')
        .lean();
    if (!product) throw new ApiError(404, 'Wholesale product not found.');
    res.status(200).json(new ApiResponse(200, toWholesaleProductView(product), 'Wholesale product fetched.'));
});
