import Commission from '../models/Commission.model.js';
import Vendor from '../models/Vendor.model.js';
import { getDefaultCommissionRate } from './settingsService.js';

const ownRatePercent = (vendor) => {
    const value = vendor?.commissionRate;
    if (value === null || value === undefined || value === '') return null;
    const rate = Number(value);
    return Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : null;
};

/**
 * Canonical commission-rate rule (approved rule 2): a vendor's own Admin-set rate when present, otherwise the
 * Admin-configured platform default. There is no hardcoded rate: if a vendor has no own rate and the platform
 * default is not configured, getDefaultCommissionRate throws a clear 503 instead of guessing.
 * The resolved rate is snapshotted on each order/commission, so later changes never touch history.
 *
 * @param {Array<{_id, commissionRate}>} vendors
 * @returns {Promise<Record<string, number>>} percent by vendor id
 */
export const resolveVendorCommissionRates = async (vendors = []) => {
    const rates = {};
    const needDefault = [];
    for (const vendor of vendors) {
        const id = String(vendor?._id || vendor?.id || '');
        const own = ownRatePercent(vendor);
        if (own !== null) rates[id] = own;
        else needDefault.push(id);
    }
    if (needDefault.length) {
        const platformDefault = await getDefaultCommissionRate();
        for (const id of needDefault) rates[id] = platformDefault;
    }
    return rates;
};

/** Which rule supplied a vendor's rate, for display: 'vendor' (own rate) or 'platform_default'. */
export const getCommissionRateSource = (vendor) => (ownRatePercent(vendor) !== null ? 'vendor' : 'platform_default');

/**
 * Calculate commission for a vendor order item group.
 * 4.2 — Unified with financial.service.js logic:
 *   - Commission is applied to the PRE-TAX base price only (not tax-inclusive subtotal).
 *   - Matches the calculation done in calculateOrderFinancials().
 *
 * @param {string} vendorId
 * @param {number} subtotal        - Tax-inclusive subtotal for this vendor group
 * @param {number} [taxRate=18]    - Blended tax rate for the group (default 18%)
 * @param {boolean} [taxIncluded]  - Whether tax is already baked into the subtotal
 * @returns {{ commission, vendorEarnings, commissionRate }}
 */
export const calculateCommission = async (vendorId, subtotal, taxRate = 18, taxIncluded = false, precalculatedBase = null) => {
    const vendor = await Vendor.findById(vendorId).select('commissionRate');
    if (!vendor) throw new Error(`Vendor not found: ${vendorId}`);

    const commissionRate = (await resolveVendorCommissionRates([vendor]))[String(vendor._id)];

    // If precalculated base is provided, use it directly (target architecture snapshot base)
    const commissionBase = precalculatedBase !== null && precalculatedBase !== undefined
        ? precalculatedBase
        : taxIncluded
            ? parseFloat((subtotal / (1 + taxRate / 100)).toFixed(2))
            : subtotal;

    const commission     = parseFloat(((commissionBase * commissionRate) / 100).toFixed(2));
    const vendorEarnings = parseFloat((commissionBase - commission).toFixed(2));

    return { commissionRate, commission, vendorEarnings, commissionBase };
};

/**
 * Get commission summary for a vendor
 */
export const getVendorCommissionSummary = async (vendorId) => {
    const result = await Commission.aggregate([
        { $match: { vendorId: vendorId } },
        {
            $group: {
                _id: '$status',
                total: { $sum: '$vendorEarnings' },
                count: { $sum: 1 },
            },
        },
    ]);

    return result.reduce((acc, r) => {
        acc[r._id] = { total: r.total, count: r.count };
        return acc;
    }, {});
};
