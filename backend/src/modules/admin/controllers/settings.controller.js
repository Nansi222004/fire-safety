import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Settings from '../../../models/Settings.model.js';
import {
    clearSettingsCache,
    assertValidCommissionPercent,
    assertValidReturnWindowDays,
    resolvePaymentSettings,
    hasUsablePaymentMethod,
} from '../../../services/settingsService.js';

// GET /api/admin/settings/:key
export const getSettings = asyncHandler(async (req, res) => {
    const { key } = req.params;
    const settings = await Settings.findOne({ key });
    
    if (!settings) {
        return res.status(200).json(new ApiResponse(200, { key, value: {} }, 'Settings not found, returning empty.'));
    }
    
    res.status(200).json(new ApiResponse(200, settings, 'Settings fetched.'));
});

// PUT /api/admin/settings/:key
export const updateSettings = asyncHandler(async (req, res) => {
    const { key } = req.params;
    const { value } = req.body;

    if (!value) throw new ApiError(400, 'Value is required.');

    // Validate settings parameters
    if (key === 'shipping') {
        const rate = Number(value.defaultShippingRate);
        const threshold = Number(value.freeShippingThreshold);
        if (Number.isNaN(rate) || rate < 0) {
            throw new ApiError(400, 'Default shipping rate must be a non-negative number.');
        }
        if (Number.isNaN(threshold) || threshold < 0) {
            throw new ApiError(400, 'Free shipping threshold must be a non-negative number.');
        }
        const routingFields = {
            maxShiprocketDistanceKm: 'Maximum Shiprocket distance',
            maxShiprocketWeightKg: 'Maximum Shiprocket weight',
            maxAutomaticShiprocketOrderValue: 'Maximum automatic Shiprocket order value',
        };
        for (const [field, label] of Object.entries(routingFields)) {
            const number = Number(value[field]);
            if (!Number.isFinite(number) || number <= 0) {
                throw new ApiError(400, `${label} must be greater than zero.`);
            }
            value[field] = number;
        }
        // Delivery App and Seller Delivery switches: booleans only (absent = keep the default).
        // A save that omits them keeps the stored values (PUT replaces the whole value).
        const stored = (await Settings.findOne({ key: 'shipping' }).lean())?.value || {};
        for (const field of ['deliveryAppEnabled', 'sellerDeliveryEnabled']) {
            if (value[field] === undefined) {
                if (typeof stored[field] === 'boolean') value[field] = stored[field];
            } else if (typeof value[field] !== 'boolean') {
                throw new ApiError(400, `${field} must be true or false.`);
            }
        }
    }

    if (key === 'payment') {
        for (const field of ['onlineEnabled', 'codEnabled', 'cardEnabled', 'upiEnabled', 'walletEnabled']) {
            if (value[field] !== undefined && typeof value[field] !== 'boolean') {
                throw new ApiError(400, `${field} must be true or false.`);
            }
        }
        // Customers must always have a way to pay the full amount: COD, or online with card or UPI.
        // (Wallet alone is not enough — customers without a balance could not order at all.)
        if (!hasUsablePaymentMethod(resolvePaymentSettings(value))) {
            throw new ApiError(400, 'Keep at least one payment method on: Cash on Delivery, or Online Payments with Card or UPI enabled.');
        }
        if (value.paymentFees) {
            for (const [method, fee] of Object.entries(value.paymentFees)) {
                const num = Number(fee);
                if (Number.isNaN(num) || num < 0 || num > 100) {
                    throw new ApiError(400, `Payment fee for ${method} must be between 0% and 100%.`);
                }
            }
        }
    }

    // Approved financial configuration: invalid values must never be saved (no silent fallbacks downstream).
    if (key === 'general' && value && typeof value === 'object') {
        if (value.defaultCommissionRate !== undefined) {
            value.defaultCommissionRate = assertValidCommissionPercent(value.defaultCommissionRate);
        }
        if (value.returnWindow !== undefined && value.returnWindow !== null && value.returnWindow !== '') {
            value.returnWindow = assertValidReturnWindowDays(value.returnWindow);
        }
    }
    if (key === 'orders' && value && typeof value === 'object' && value.returnWindow !== undefined) {
        value.returnWindow = assertValidReturnWindowDays(value.returnWindow);
    }

    if (key === 'general' && value && typeof value === 'object' && value.productDisclaimer !== undefined) {
        if (typeof value.productDisclaimer !== 'string') throw new ApiError(400, 'Product note must be text.');
        value.productDisclaimer = value.productDisclaimer.trim();
        if (value.productDisclaimer.length > 1000) throw new ApiError(400, 'Product note must be at most 1000 characters.');
    }

    if (key === 'general' && value && typeof value === 'object') {
        if (value.contactEmail) {
            value.supportEmail = value.contactEmail;
        }
        if (value.contactPhone) {
            value.supportPhone = value.contactPhone;
            if (!value.whatsappPhone) {
                value.whatsappPhone = value.contactPhone;
            }
        }
    }

    const settings = await Settings.findOneAndUpdate(
        { key },
        { value },
        { upsert: true, new: true }
    );

    // Invalidate settings cache immediately
    clearSettingsCache();

    res.status(200).json(new ApiResponse(200, settings, 'Settings updated.'));
});

// GET /api/admin/settings
export const getAllSettings = asyncHandler(async (req, res) => {
    const settings = await Settings.find();
    const config = settings.reduce((acc, curr) => {
        acc[curr.key] = curr.value;
        return acc;
    }, {});
    
    res.status(200).json(new ApiResponse(200, config, 'All settings fetched.'));
});
