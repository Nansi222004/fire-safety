import User from '../models/User.model.js';
import Vendor from '../models/Vendor.model.js';
import ApiError from '../utils/ApiError.js';

/**
 * Wholesale / B2B helpers.
 *
 * Wholesale is an independent vendor capability: it never alters
 * sellsProducts / providesServices / serviceCapability.
 */

// A vendor has wholesale capability only after admin approval.
export const isVendorWholesaleApproved = (vendor) =>
    vendor?.vendorCapabilities?.wholesaleEnabled === true &&
    vendor?.wholesaleCapability?.status === 'approved';

export const WHOLESALE_APPROVED_FILTER = {
    status: 'approved',
    'vendorCapabilities.wholesaleEnabled': true,
    'wholesaleCapability.status': 'approved',
};

/**
 * Resolves the approved wholesale vendor account linked to a customer account.
 * Eligibility is re-evaluated on every call from authoritative data:
 *   • the customer account is active and verified,
 *   • it carries an explicit link (linkedWholesaleVendorId) created when the vendor's own
 *     credentials were proven on the User Side — a matching email alone is NOT enough,
 *   • the linked vendor is still approved, verified, wholesale-enabled and wholesale-approved,
 *   • and the vendor still owns the same email (the account identity did not change).
 * Returns null for normal B2C customers, unlinked accounts and suspended/revoked vendors.
 */
export const getWholesaleBuyerForUser = async (userId) => {
    if (!userId) return null;
    const user = await User.findById(userId).select('email isActive isVerified linkedWholesaleVendorId').lean();
    if (!user?.email || !user.isActive || !user.isVerified || !user.linkedWholesaleVendorId) return null;

    return Vendor.findOne({
        _id: user.linkedWholesaleVendorId,
        email: user.email,
        isVerified: true,
        ...WHOLESALE_APPROVED_FILTER,
    })
        .select('_id name storeName email')
        .lean();
};

/**
 * Links a customer account to its approved wholesale vendor after the vendor password was
 * verified for this login. No-op when the credentials do not belong to an approved wholesale vendor.
 */
export const linkWholesaleVendorIfCredentialsMatch = async (user, normalizedEmail, password) => {
    if (!user?._id || !normalizedEmail || !password) return false;
    const vendor = await Vendor.findOne({ email: normalizedEmail, isVerified: true, ...WHOLESALE_APPROVED_FILTER })
        .select('+password _id');
    if (!vendor || !(await vendor.comparePassword(password))) return false;
    if (String(user.linkedWholesaleVendorId || '') !== String(vendor._id)) {
        await User.updateOne({ _id: user._id }, { $set: { linkedWholesaleVendorId: vendor._id, linkedWholesaleAt: new Date() } });
    }
    return true;
};

export const assertWholesaleBuyer = async (userId) => {
    const buyer = await getWholesaleBuyerForUser(userId);
    if (!buyer) {
        throw new ApiError(403, 'Wholesale access is available only to approved wholesale/B2B accounts.');
    }
    return buyer;
};

/**
 * "Same account credentials" support: when an approved wholesale vendor signs in on the
 * user side and no customer account exists for that email yet, provision a linked,
 * pre-verified customer account (the vendor email is already verified).
 * Returns the new User document, or null when the credentials don't belong to an
 * approved wholesale vendor — normal login behaviour is otherwise unchanged.
 */
export const provisionWholesaleBuyerAccount = async (normalizedEmail, password) => {
    if (!normalizedEmail || !password) return null;
    const vendor = await Vendor.findOne({ email: normalizedEmail, isVerified: true, ...WHOLESALE_APPROVED_FILTER })
        .select('+password name phone');
    if (!vendor) return null;

    const isMatch = await vendor.comparePassword(password);
    if (!isMatch) return null;

    const normalizedPhone = String(vendor.phone || '').replace(/\D/g, '').slice(-10);
    try {
        // Plain password → hashed by the User pre-save hook.
        return await User.create({
            name: vendor.name,
            email: normalizedEmail,
            password,
            ...(normalizedPhone ? { phone: normalizedPhone } : {}),
            isVerified: true,
            // Vendor credentials were just verified → explicit account link.
            linkedWholesaleVendorId: vendor._id,
            linkedWholesaleAt: new Date(),
        });
    } catch (err) {
        if (err?.code === 11000) {
            return User.findOne({ email: normalizedEmail }).select('+password');
        }
        throw err;
    }
};

/**
 * Verifies the credentials of the approved wholesale vendor linked by email.
 * This is intentionally narrower than normal vendor login: pending, rejected,
 * inactive, or unverified vendors can never use it to enter the customer app.
 */
export const verifyWholesaleVendorCredentials = async (normalizedEmail, password) => {
    if (!normalizedEmail || !password) return false;
    const vendor = await Vendor.findOne({ email: normalizedEmail, isVerified: true, ...WHOLESALE_APPROVED_FILTER })
        .select('+password');
    if (!vendor) return false;
    return vendor.comparePassword(password);
};

export const isProductWholesaleAvailable = (product) =>
    product?.wholesale?.enabled === true &&
    Number.isFinite(Number(product?.wholesale?.price)) &&
    Number(product.wholesale.price) >= 0;

/**
 * Server-side validation + pricing for one wholesale line.
 * Never trusts client-sent price.
 */
export const resolveWholesaleLine = (product, quantity, { buyerVendorId, sellerVendor } = {}) => {
    if (!isProductWholesaleAvailable(product)) {
        throw new ApiError(400, `${product?.name || 'Product'} is not available for wholesale purchase.`);
    }
    if (sellerVendor && !isVendorWholesaleApproved(sellerVendor)) {
        throw new ApiError(400, `${product.name} is not currently offered by an approved wholesale seller.`);
    }
    if (buyerVendorId && String(product.vendorId?._id || product.vendorId) === String(buyerVendorId)) {
        throw new ApiError(400, `You cannot place a wholesale order for your own product (${product.name}).`);
    }

    const moq = Math.max(1, Number(product.wholesale.moq) || 1);
    if (quantity < moq) {
        throw new ApiError(400, `Minimum order quantity (MOQ) for "${product.name}" is ${moq}.`);
    }
    if (product.stock === 'out_of_stock' || Number(product.stockQuantity || 0) < quantity) {
        throw new ApiError(400, `Only ${Number(product.stockQuantity || 0)} units of ${product.name} available.`);
    }

    return { price: Number(product.wholesale.price), moq };
};

// Public-facing shape of a product for wholesale buyers.
export const toWholesaleProductView = (product) => ({
    _id: product._id,
    name: product.name,
    slug: product.slug,
    image: product.image || product.images?.[0] || '',
    images: product.images || [],
    description: product.description || '',
    unit: product.unit,
    retailPrice: product.b2cAvailable === false ? null : product.price,
    wholesalePrice: Number(product.wholesale?.price),
    moq: Math.max(1, Number(product.wholesale?.moq) || 1),
    stockQuantity: product.stockQuantity,
    stock: product.stock,
    taxRate: product.taxRate,
    categoryId: product.categoryId,
    brandId: product.brandId,
    vendor: product.vendorId && typeof product.vendorId === 'object'
        ? { _id: product.vendorId._id, storeName: product.vendorId.storeName }
        : { _id: product.vendorId },
});
