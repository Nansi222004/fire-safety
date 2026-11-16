/**
 * GST helpers shared by exchange pricing and B2B tax invoices.
 *
 * This file does NOT calculate tax amounts — calculateOrderFinancials (financial.service.js) is the only place
 * GST is computed. Here we only work out how an already-computed GST amount is split between CGST + SGST/UTGST
 * (intra-state supply) and IGST (inter-state supply), validate GSTINs and map states to GST state codes.
 */

const round2 = (value) => parseFloat(Number(value || 0).toFixed(2));

// GST state / UT codes (first two digits of a GSTIN).
export const GST_STATE_CODES = Object.freeze({
    '01': 'Jammu and Kashmir',
    '02': 'Himachal Pradesh',
    '03': 'Punjab',
    '04': 'Chandigarh',
    '05': 'Uttarakhand',
    '06': 'Haryana',
    '07': 'Delhi',
    '08': 'Rajasthan',
    '09': 'Uttar Pradesh',
    '10': 'Bihar',
    '11': 'Sikkim',
    '12': 'Arunachal Pradesh',
    '13': 'Nagaland',
    '14': 'Manipur',
    '15': 'Mizoram',
    '16': 'Tripura',
    '17': 'Meghalaya',
    '18': 'Assam',
    '19': 'West Bengal',
    '20': 'Jharkhand',
    '21': 'Odisha',
    '22': 'Chhattisgarh',
    '23': 'Madhya Pradesh',
    '24': 'Gujarat',
    '26': 'Dadra and Nagar Haveli and Daman and Diu',
    '27': 'Maharashtra',
    '29': 'Karnataka',
    '30': 'Goa',
    '31': 'Lakshadweep',
    '32': 'Kerala',
    '33': 'Tamil Nadu',
    '34': 'Puducherry',
    '35': 'Andaman and Nicobar Islands',
    '36': 'Telangana',
    '37': 'Andhra Pradesh',
    '38': 'Ladakh',
});

const normaliseStateName = (name) => String(name || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z]/g, '');

const STATE_ALIASES = {
    orissa: '21',
    pondicherry: '34',
    nctofdelhi: '07',
    newdelhi: '07',
    jammuandkashmir: '01',
    jandk: '01',
    andamanandnicobar: '35',
    andamanandnicobarislands: '35',
    damananddiu: '26',
    dadraandnagarhaveli: '26',
    uttaranchal: '05',
};

const STATE_CODE_BY_NAME = Object.fromEntries(
    Object.entries(GST_STATE_CODES).map(([code, name]) => [normaliseStateName(name), code])
);

/** GST state code for a state name ("Maharashtra" → "27"), or null when it can't be identified. */
export const stateCodeFromName = (stateName) => {
    const key = normaliseStateName(stateName);
    if (!key) return null;
    return STATE_CODE_BY_NAME[key] || STATE_ALIASES[key] || null;
};

const GSTIN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** Upper-cased, whitespace-free GSTIN string (does not validate). */
export const normaliseGstin = (gstin) => String(gstin || '').replace(/\s+/g, '').toUpperCase();

/**
 * True when `gstin` is a structurally valid 15-character GSTIN: a known state code, PAN-shaped body,
 * 'Z' in position 14 and a correct mod-36 check character. Does not prove the GSTIN is registered/active.
 */
export const isValidGstin = (gstin) => {
    const value = normaliseGstin(gstin);
    if (!GSTIN_PATTERN.test(value)) return false;
    if (!GST_STATE_CODES[value.slice(0, 2)] && value.slice(0, 2) !== '97') return false;

    let sum = 0;
    for (let i = 0; i < 14; i += 1) {
        const product = GSTIN_CHARS.indexOf(value[i]) * (i % 2 === 0 ? 1 : 2);
        sum += Math.floor(product / 36) + (product % 36);
    }
    const check = GSTIN_CHARS[(36 - (sum % 36)) % 36];
    return value[14] === check;
};

/** State code embedded in a valid GSTIN, else null. */
export const stateCodeFromGstin = (gstin) => (isValidGstin(gstin) ? normaliseGstin(gstin).slice(0, 2) : null);

/**
 * Splits an already-computed GST amount by place of supply:
 *   same state      → intra-state: CGST + SGST (SGST is UTGST for UTs without a legislature), half each,
 *                     any odd paisa goes to SGST so the two always add up to the tax exactly;
 *   different state → inter-state: IGST for the full amount;
 *   unknown state   → 'undetermined' (no split invented; callers must not print a split on an invoice).
 */
export const splitGst = (taxAmount, supplierStateCode, placeOfSupplyStateCode) => {
    const tax = round2(taxAmount);
    if (!supplierStateCode || !placeOfSupplyStateCode) {
        return { supplyType: 'undetermined', cgst: null, sgst: null, igst: null, tax };
    }
    if (String(supplierStateCode) === String(placeOfSupplyStateCode)) {
        // Split the magnitude so a negative difference (credit) splits the same way as a positive one.
        const sign = tax < 0 ? -1 : 1;
        const half = Math.floor(Math.round(Math.abs(tax) * 100) / 2) / 100;
        const cgst = round2(sign * half);
        return { supplyType: 'intra_state', cgst, sgst: round2(tax - cgst), igst: 0, tax };
    }
    return { supplyType: 'inter_state', cgst: 0, sgst: 0, igst: tax, tax };
};

/** Indian financial year label for a date ("2026-11-12" → "2026-27"); FY runs 1 April – 31 March (IST). */
export const financialYearOf = (date = new Date()) => {
    const ist = new Date(new Date(date).getTime() + 5.5 * 60 * 60 * 1000);
    const year = ist.getUTCFullYear();
    const startYear = ist.getUTCMonth() >= 3 ? year : year - 1;
    return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
};
