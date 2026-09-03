import ApiError from '../utils/ApiError.js';
import User from '../models/User.model.js';
import Vendor from '../models/Vendor.model.js';
import DeliveryBoy from '../models/DeliveryBoy.model.js';
import Admin from '../models/Admin.model.js';

/**
 * Role-based authorization middleware
 * Usage: authorize('admin'), authorize('vendor'), authorize('customer', 'admin')
 */
export const authorize = (...roles) =>
    (req, res, next) => {
        if (!req.user) {
            return next(new ApiError(401, 'Authentication required.'));
        }
        if (!roles.includes(req.user.role)) {
            return next(new ApiError(403, `Access denied. Required role: ${roles.join(' or ')}`));
        }
        next();
    };

/**
 * Enforce latest account state on every protected request.
 * Prevents stale tokens from bypassing suspension/deactivation.
 */
export const enforceAccountStatus = async (req, res, next) => {
    try {
        if (!req.user?.id || !req.user?.role) {
            return next(new ApiError(401, 'Authentication required.'));
        }

        const role = String(req.user.role).toLowerCase();

        if (role === 'customer') {
            const user = await User.findById(req.user.id).select('isActive isVerified').lean();
            if (!user) return next(new ApiError(401, 'Account not found.'));
            if (!user.isActive) return next(new ApiError(403, 'Account is deactivated. Contact support.'));
            if (!user.isVerified) return next(new ApiError(403, 'Please verify your email first.'));
            return next();
        }

        if (role === 'vendor') {
            const vendor = await Vendor.findById(req.user.id).select('status isVerified vendorCapabilities').lean();
            if (!vendor) return next(new ApiError(401, 'Account not found.'));
            if (!vendor.isVerified) return next(new ApiError(403, 'Please verify your email first.'));
            if (vendor.status !== 'approved') {
                return next(new ApiError(403, `Vendor account is ${vendor.status}.`));
            }
            req.vendorCapabilities = vendor.vendorCapabilities || { sellsProducts: true, providesServices: false };
            return next();
        }

        if (role === 'delivery') {
            const deliveryBoy = await DeliveryBoy.findById(req.user.id).select('applicationStatus isActive').lean();
            if (!deliveryBoy) return next(new ApiError(401, 'Account not found.'));
            if (deliveryBoy.applicationStatus !== 'approved') {
                return next(new ApiError(403, `Delivery account is ${deliveryBoy.applicationStatus}.`));
            }
            if (!deliveryBoy.isActive) {
                return next(new ApiError(403, 'Account is deactivated. Contact admin.'));
            }
            return next();
        }

        if (role === 'admin' || role === 'superadmin') {
            const admin = await Admin.findById(req.user.id).select('isActive').lean();
            if (!admin) return next(new ApiError(401, 'Account not found.'));
            if (!admin.isActive) return next(new ApiError(403, 'Admin account is deactivated.'));
            return next();
        }

        return next(new ApiError(403, 'Access denied.'));
    } catch (err) {
        return next(err);
    }
};

/**
 * Capability-based authorization middleware for vendors
 * Usage: requireVendorCapability('products'), requireVendorCapability('services')
 */
export const requireVendorCapability = (capability) =>
    async (req, res, next) => {
        try {
            if (!req.user || req.user.role !== 'vendor') {
                return next(new ApiError(403, 'Vendor authorization required.'));
            }

            let caps = req.vendorCapabilities;
            if (!caps) {
                const vendor = await Vendor.findById(req.user.id).select('vendorCapabilities').lean();
                if (!vendor) return next(new ApiError(401, 'Vendor account not found.'));
                caps = vendor.vendorCapabilities || { sellsProducts: true, providesServices: false };
                req.vendorCapabilities = caps;
            }

            const targetCap = String(capability || '').toLowerCase();
            if (targetCap === 'products' || targetCap === 'sellsproducts') {
                if (caps.sellsProducts !== true) {
                    return next(new ApiError(403, 'Product seller capability is required to perform this action.'));
                }
            } else if (targetCap === 'services' || targetCap === 'providesservices') {
                if (caps.providesServices !== true) {
                    return next(new ApiError(403, 'Service provider capability is required to perform this action.'));
                }
            }
            next();
        } catch (err) {
            return next(err);
        }
    };
