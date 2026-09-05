import logger from '../utils/logger.js';
import Settings from '../models/Settings.model.js';

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

/**
 * Retrieve the default platform commission rate configured in the admin dashboard settings.
 * Returns the configured rate as a number, or 10 as a default fallback.
 * @returns {Promise<number>}
 */
export const getDefaultCommissionRate = async () => {
    try {
        const value = await getCachedSettings('general', {});
        if (value && value.defaultCommissionRate !== undefined) {
            const rate = Number(value.defaultCommissionRate);
            if (Number.isFinite(rate)) {
                return rate;
            }
        }
    } catch (err) {
        logger.error('Error fetching default commission rate:', err);
    }
    return 10; // Default fallback
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
    return getCachedSettings('payment', {
        codEnabled: true,
        cardEnabled: true,
        walletEnabled: true,
        upiEnabled: true
    });
};

/**
 * Get platform shipping settings with fallbacks
 */
export const getShippingSettings = async () => {
    return getCachedSettings('shipping', {
        defaultShippingRate: 0,
        freeShippingThreshold: 0
    });
};

/**
 * Verify if a specific payment method is active in settings
 */
export const isPaymentMethodEnabled = async (method) => {
    const payment = await getPaymentSettings();
    const cleanMethod = String(method || '').trim().toLowerCase();
    
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

/**
 * Retrieve the configured return/exchange window in days (default: 7 days)
 * @returns {Promise<number>}
 */
export const getReturnWindowDays = async () => {
    try {
        const orderSettings = await getCachedSettings('orders', {});
        if (orderSettings && orderSettings.returnWindow !== undefined) {
            const days = Number(orderSettings.returnWindow);
            if (Number.isFinite(days) && days > 0) {
                return days;
            }
        }
        const general = await getCachedSettings('general', {});
        if (general && general.returnWindow !== undefined) {
            const days = Number(general.returnWindow);
            if (Number.isFinite(days) && days > 0) {
                return days;
            }
        }
    } catch (err) {
        logger.error('Error fetching return window setting:', err);
    }
    return 7;
};


