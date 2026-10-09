import mongoose from 'mongoose';
import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Product from '../../../models/Product.model.js';
import Vendor from '../../../models/Vendor.model.js';
import Category from '../../../models/Category.model.js';
import {
    getWholesaleBuyerForUser,
    assertWholesaleBuyer,
    toWholesaleProductView,
    resolveWholesaleLine,
    WHOLESALE_APPROVED_FILTER,
} from '../../../services/wholesale.service.js';

const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PRODUCT_FIELDS = 'name slug image images description unit price b2cAvailable wholesale stockQuantity stock taxRate categoryId brandId vendorId';
const SORTS = {
    newest: { createdAt: -1 },
    price_asc: { 'wholesale.price': 1, createdAt: -1 },
    price_desc: { 'wholesale.price': -1, createdAt: -1 },
    name: { name: 1 },
};

/**
 * Wholesale catalog = active products configured for B2B (wholesale.enabled + valid price), owned by
 * currently approved wholesale sellers. B2C-only products are excluded; B2C+B2B products are included.
 * Existing business rule preserved: a buyer never sees (or buys) their own vendor's products.
 */
const buildWholesaleProductFilter = async (buyer, { includeOwn = false } = {}) => {
    const sellerIds = await Vendor.find(WHOLESALE_APPROVED_FILTER).distinct('_id');
    return {
        isActive: true,
        'wholesale.enabled': true,
        'wholesale.price': { $gte: 0 },
        vendorId: { $in: includeOwn ? sellerIds : sellerIds.filter((id) => String(id) !== String(buyer._id)) },
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
 * @route   GET /api/user/wholesale/products?search=&categoryId=&sort=&page=&limit=
 */
export const getWholesaleCatalog = asyncHandler(async (req, res) => {
    const buyer = await assertWholesaleBuyer(req.user.id);
    const numericPage = Math.max(1, parseInt(req.query.page, 10) || 1);
    const numericLimit = Math.min(60, Math.max(1, parseInt(req.query.limit, 10) || 24));

    const baseFilter = await buildWholesaleProductFilter(buyer);
    const filter = { ...baseFilter };
    const search = String(req.query.search || '').trim();
    if (search) filter.name = { $regex: escapeRegex(search), $options: 'i' };
    if (req.query.categoryId && mongoose.isValidObjectId(req.query.categoryId)) filter.categoryId = req.query.categoryId;
    const sort = SORTS[req.query.sort] || SORTS.newest;

    const [products, total, categoryIds, ownProductsHidden] = await Promise.all([
        Product.find(filter)
            .select(PRODUCT_FIELDS)
            .populate('vendorId', 'storeName')
            .sort(sort)
            .skip((numericPage - 1) * numericLimit)
            .limit(numericLimit)
            .lean(),
        Product.countDocuments(filter),
        Product.distinct('categoryId', baseFilter),
        // Tell the buyer why their own wholesale listings are not shown (they cannot buy from themselves).
        Product.countDocuments({ isActive: true, 'wholesale.enabled': true, vendorId: buyer._id }),
    ]);
    const categories = await Category.find({ _id: { $in: categoryIds }, isActive: true }).select('name slug').sort({ name: 1 }).lean();

    res.status(200).json(new ApiResponse(200, {
        products: products.map(toWholesaleProductView),
        total,
        page: numericPage,
        pages: Math.ceil(total / numericLimit),
        categories,
        ownProductsHidden,
    }, 'Wholesale products fetched.'));
});

/**
 * @desc    Single wholesale product. B2B accounts only.
 * @route   GET /api/user/wholesale/products/:id
 */
export const getWholesaleProduct = asyncHandler(async (req, res) => {
    const buyer = await assertWholesaleBuyer(req.user.id);
    if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(404, 'Wholesale product not found.');
    const filter = await buildWholesaleProductFilter(buyer);
    const product = await Product.findOne({ ...filter, _id: req.params.id })
        .select(PRODUCT_FIELDS)
        .populate('vendorId', 'storeName')
        .populate('categoryId', 'name')
        .lean();
    if (!product) {
        const own = await Product.exists({ _id: req.params.id, vendorId: buyer._id, 'wholesale.enabled': true });
        throw new ApiError(404, own ? 'This is your own wholesale product — you cannot buy from your own store.' : 'Wholesale product not found.');
    }
    res.status(200).json(new ApiResponse(200, toWholesaleProductView(product), 'Wholesale product fetched.'));
});

/**
 * @desc    Server-side validation/pricing of a wholesale cart (no order is created).
 *          Same rules as wholesale checkout: eligibility, B2B availability, approved seller,
 *          own-product restriction, MOQ, stock — and the database wholesale price.
 * @route   POST /api/user/wholesale/cart/validate  { items: [{ productId, quantity }] }
 */
export const validateWholesaleCart = asyncHandler(async (req, res) => {
    const buyer = await assertWholesaleBuyer(req.user.id);
    const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 100) : [];
    const ids = items.map((i) => String(i?.productId || '')).filter((id) => mongoose.isValidObjectId(id));
    const products = await Product.find({ _id: { $in: ids }, isActive: true }).select(PRODUCT_FIELDS).lean();
    const sellers = await Vendor.find({ _id: { $in: products.map((p) => p.vendorId) } })
        .select('status vendorCapabilities wholesaleCapability.status').lean();
    const productMap = new Map(products.map((p) => [String(p._id), p]));
    const sellerMap = new Map(sellers.map((v) => [String(v._id), v]));

    let subtotal = 0;
    const lines = items.map((item) => {
        const productId = String(item?.productId || '');
        const quantity = Number(item?.quantity);
        const product = productMap.get(productId);
        if (!product) return { productId, quantity, valid: false, error: 'Product is no longer available.' };
        if (!Number.isInteger(quantity) || quantity < 1) return { productId, quantity, valid: false, error: 'Quantity must be a whole number.' };
        const seller = sellerMap.get(String(product.vendorId));
        try {
            if (!seller || seller.status !== 'approved') throw new ApiError(400, `${product.name} is not currently available.`);
            const { price, moq } = resolveWholesaleLine(product, quantity, { buyerVendorId: buyer._id, sellerVendor: seller });
            const lineTotal = Math.round(price * quantity * 100) / 100;
            subtotal += lineTotal;
            return { productId, name: product.name, quantity, unitPrice: price, moq, lineTotal, stockQuantity: product.stockQuantity, valid: true };
        } catch (err) {
            return { productId, name: product.name, quantity, valid: false, error: err.message, moq: Math.max(1, Number(product.wholesale?.moq) || 1) };
        }
    });

    res.status(200).json(new ApiResponse(200, {
        lines,
        valid: lines.length > 0 && lines.every((l) => l.valid),
        subtotal: Math.round(subtotal * 100) / 100,
    }, 'Wholesale cart validated.'));
});
