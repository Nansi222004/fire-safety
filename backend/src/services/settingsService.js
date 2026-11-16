import logger from '../utils/logger.js';
import Settings from '../models/Settings.model.js';
import ApiError from '../utils/ApiError.js';
import { isCodOnlyMode } from '../config/paymentConfig.js';

let settingsCache = {};
let cacheExpiry = {};

const getCachedSettings = async (key, defaultValue = {}) => {
    const now = Date.now();
    if (settingsCache[key] && cacheExpiry[key] && now < cacheExpiry[key]) {
        return settingsCache[key];
    }
    try {
        const settings = await Settings.findOne({ key }).lean();
        settingsCache[key] = settings?.value || defaultValue;
        cacheExpiry[key] = now + 10000; // 10 seconds cache TTL
        return settingsCache[key];
    } catch (err) {
        logger.error(`Error fetching settings for key ${key}:`, err);
        return defaultValue;
    }
};

/**
 * Clear the settings memory cache immediately
 */
export const clearSettingsCache = () => {
    settingsCache = {};
    cacheExpiry = {};
};

// ─── Approved financial configuration (docs/SAFEFIRE_APPROVED_FINANCIAL_RULES.md) ───────────────────────────
// No hardcoded financial fallbacks: when Admin has not configured a value, money-moving code fails clearly
// (or, for payouts, keeps funds held) instead of silently using 10% commission or a 7-day hold.

const toCommissionPercent = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const rate = Number(value);
    return Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : null;
};

const toReturnWindowDays = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const days = Number(value);
    return Number.isInteger(days) && days >= 0 && days <= 365 ? days : null;
};

export const MAX_RETURN_WINDOW_DAYS = 365;

/** Admin-configured platform default commission (percent, 0–100), or null when not configured/invalid. */
export const getConfiguredDefaultCommissionRate = async () => {
    const general = await getCachedSettings('general', {});
    return toCommissionPercent(general?.defaultCommissionRate);
};

/**
 * Platform default commission (percent) for vendors without their own rate.
 * Throws 503 when Admin has not configured it — never falls back to a hardcoded rate.
 */
export const getDefaultCommissionRate = async () => {
    const rate = await getConfiguredDefaultCommissionRate();
    if (rate === null) {
        throw new ApiError(503, 'The platform default commission rate is not configured. An admin must set it in Settings → Vendors before this action can be completed.');
    }
    return rate;
};

/** Validates an Admin-entered commission percentage; throws 400 when invalid. */
export const assertValidCommissionPercent = (value, label = 'Default commission rate') => {
    const rate = toCommissionPercent(value);
    if (rate === null) throw new ApiError(400, `${label} must be a number from 0 to 100.`);
    return rate;
};

/** Validates an Admin-entered return window (whole days, 0–365); throws 400 when invalid. */
export const assertValidReturnWindowDays = (value) => {
    const days = toReturnWindowDays(value);
    if (days === null) throw new ApiError(400, `Return window must be a whole number of days from 0 to ${MAX_RETURN_WINDOW_DAYS}.`);
    return days;
};

/**
 * Retrieve whether vendor approval is required from the general settings.
 * Returns true if required (default), or false if explicitly disabled.
 * @returns {Promise<boolean>}
 */
export const isVendorApprovalRequired = async () => {
    try {
        const value = await getCachedSettings('general', {});
        if (value && value.vendorApprovalRequired !== undefined) {
            return value.vendorApprovalRequired !== false;
        }
    } catch (err) {
        logger.error('Error fetching vendor approval required setting:', err);
    }
    return true; // Default fallback
};

/**
 * Get payment gateway settings with fallbacks
 */
export const getPaymentSettings = async () => {
    const settings = await getCachedSettings('payment', {
        codEnabled: true,
        cardEnabled: true,
        walletEnabled: true,
        upiEnabled: true
    });

    if (isCodOnlyMode()) {
        return {
            ...settings,
            codEnabled: true,
            cardEnabled: false,
            walletEnabled: settings.walletEnabled !== false,
            upiEnabled: false,
            cod: true,
            razorpay: false,
            wallet: settings.walletEnabled !== false,
            upi: false,
            paymentMode: 'COD_ONLY',
        };
    }

    return settings;
};

/**
 * Get platform shipping settings with fallbacks
 */
export const getShippingSettings = async () => {
    return getCachedSettings('shipping', {
        defaultShippingRate: 0,
        freeShippingThreshold: 0,
        maxShiprocketDistanceKm: 50,
        maxShiprocketWeightKg: 20,
        maxAutomaticShiprocketOrderValue: 50000,
    });
};

export const getDeliveryRoutingSettings = async () => {
    const shipping = await getShippingSettings();
    const positive = (value, fallback) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    };
    // Routing depends only on wholesale + weight (distance and order value are not routing inputs).
    return {
        maxWeightKg: positive(shipping.maxShiprocketWeightKg, 20),
    };
};

/**
 * Verify if a specific payment method is active in settings
 */
export const isPaymentMethodEnabled = async (method) => {
    const cleanMethod = String(method || '').trim().toLowerCase();
    
    // Central Payment Gate: In COD_ONLY mode, COD, cash, and SafeFire Wallet (if enabled) are accepted
    if (isCodOnlyMode()) {
        if (cleanMethod === 'cod' || cleanMethod === 'cash') {
            return true;
        }
        if (cleanMethod === 'wallet') {
            const payment = await getPaymentSettings();
            return payment.walletEnabled !== false;
        }
        return false;
    }

    const payment = await getPaymentSettings();
    
    if (cleanMethod === 'cod' || cleanMethod === 'cash') {
        return payment.codEnabled !== false;
    }
    if (cleanMethod === 'card' || cleanMethod === 'razorpay') {
        return payment.cardEnabled !== false;
    }
    if (cleanMethod === 'wallet') {
        return payment.walletEnabled !== false;
    }
    if (cleanMethod === 'upi') {
        return payment.upiEnabled !== false;
    }
    return false;
};

/**
 * Get defaults shipping rate and free threshold
 */
export const getPlatformShippingDefaults = async () => {
    const shipping = await getShippingSettings();
    return {
        defaultShippingRate: Number(shipping.defaultShippingRate !== undefined ? shipping.defaultShippingRate : 0),
        freeShippingThreshold: Number(shipping.freeShippingThreshold !== undefined ? shipping.freeShippingThreshold : 0)
    };
};

/** Admin-configured return window in days (orders.returnWindow, then general.returnWindow), or null. */
export const getConfiguredReturnWindowDays = async () => {
    const orderSettings = await getCachedSettings('orders', {});
    const fromOrders = toReturnWindowDays(orderSettings?.returnWindow);
    if (fromOrders !== null) return fromOrders;
    const general = await getCachedSettings('general', {});
    return toReturnWindowDays(general?.returnWindow);
};

/**
 * Return window in days. Canonical for return eligibility AND the vendor payout hold (approved rule 3).
 * Throws 503 when Admin has not configured it — never falls back to a hardcoded 7 days.
 */
export const getReturnWindowDays = async () => {
    const days = await getConfiguredReturnWindowDays();
    if (days === null) {
        throw new ApiError(503, 'The return window is not configured. An admin must set it in Settings → Orders.');
    }
    return days;
};

/** Vendor payout hold = the configured return window (approved rule 3). Null when not configured. */
export const getPayoutHoldDays = getConfiguredReturnWindowDays;


