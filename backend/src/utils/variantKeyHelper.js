/**
 * Canonical Variant Key Helper for SafeFire
 * Provides reversible, collision-safe variant key encoding for MongoDB / Mongoose Maps.
 *
 * Problem solved:
 * MongoDB and Mongoose Maps reject or mishandle keys containing dots ('.') because dots
 * are interpreted as BSON path separators. Using a naive replacement like '.' -> '_' causes
 * collisions (e.g. "1.2 m" collides with "1_2 m").
 *
 * Solution:
 * Standard percent-encoding:
 * - '%' is escaped to '%25'
 * - '.' is escaped to '%2e'
 * This forms a strict mathematical bijection: encode(decode(k)) === k.
 * Legacy un-encoded keys are also checked during lookups for 100% backward compatibility.
 */

/**
 * Reversibly encodes a variant key so it contains no dots ('.') or unescaped '%'.
 * @param {string} key
 * @returns {string}
 */
export const encodeVariantKey = (key) => {
    if (!key || typeof key !== 'string') return '';
    return key.replace(/%/g, '%25').replace(/\./g, '%2e');
};

/**
 * Reversibly decodes an encoded variant key back to its original string.
 * @param {string} key
 * @returns {string}
 */
export const decodeVariantKey = (key) => {
    if (!key || typeof key !== 'string') return '';
    return key.replace(/%2e/gi, '.').replace(/%25/g, '%');
};

/**
 * Normalizes a single variant axis value (trims, lowercases).
 * @param {string} value
 * @returns {string}
 */
export const normalizeVariantPart = (value) => String(value || '').trim().toLowerCase();

/**
 * Normalizes an axis name (e.g. "Storage Type" -> "storage_type").
 * @param {string} value
 * @returns {string}
 */
export const normalizeAxisName = (value) =>
    String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_');

/**
 * Creates an encoded canonical variant key from size and color.
 * @param {string} size
 * @param {string} color
 * @returns {string}
 */
export const createVariantKey = (size = '', color = '') => {
    const rawKey = `${normalizeVariantPart(size)}|${normalizeVariantPart(color)}`;
    return encodeVariantKey(rawKey);
};

/**
 * Creates an encoded canonical variant key from a dynamic selection object.
 * @param {object} selection - e.g. { material: "fiberglass", storage: "pouch" }
 * @returns {string}
 */
export const createDynamicVariantKey = (selection = {}) => {
    const rawKey = Object.entries(selection || {})
        .map(([axis, value]) => [normalizeAxisName(axis), normalizeVariantPart(value)])
        .filter(([axis, value]) => axis && value)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([axis, value]) => `${axis}=${value}`)
        .join('|');
    return encodeVariantKey(rawKey);
};

/**
 * Resolves a value from a prices, stockMap, or imageMap structure.
 * Supports Mongoose Maps, plain objects, and Map instances.
 * Checks candidate keys in order:
 * 1. Exact candidate key
 * 2. Encoded candidate key
 * 3. Decoded candidate key
 * 4. Normalized variations
 *
 * @param {Map|object} mapOrObj
 * @param {string|string[]} candidateKeys
 * @returns {*} resolved value or undefined
 */
export const resolveVariantMapValue = (mapOrObj, candidateKeys) => {
    if (!mapOrObj || typeof mapOrObj !== 'object') return undefined;

    const keysToCheck = Array.isArray(candidateKeys) ? candidateKeys : [candidateKeys];
    const isMap = mapOrObj instanceof Map || typeof mapOrObj.get === 'function';

    const getVal = (k) => {
        if (!k || typeof k !== 'string') return undefined;
        if (isMap) {
            if (mapOrObj.has(k)) return mapOrObj.get(k);
        } else if (Object.prototype.hasOwnProperty.call(mapOrObj, k)) {
            return mapOrObj[k];
        }
        return undefined;
    };

    // 1. Direct and encoded/decoded lookups for each candidate
    for (const rawCandidate of keysToCheck) {
        if (!rawCandidate) continue;
        const candidate = String(rawCandidate).trim();
        const encoded = encodeVariantKey(candidate);
        const decoded = decodeVariantKey(candidate);

        // Check exact
        let val = getVal(candidate);
        if (val !== undefined) return val;

        // Check encoded
        if (encoded !== candidate) {
            val = getVal(encoded);
            if (val !== undefined) return val;
        }

        // Check decoded
        if (decoded !== candidate) {
            val = getVal(decoded);
            if (val !== undefined) return val;
        }
    }

    // 2. Case-insensitive fallback iteration over all entries
    const entries = isMap ? Array.from(mapOrObj.entries()) : Object.entries(mapOrObj);
    for (const rawCandidate of keysToCheck) {
        if (!rawCandidate) continue;
        const normTarget = normalizeVariantPart(decodeVariantKey(String(rawCandidate)));
        for (const [entryKey, entryVal] of entries) {
            const normEntry = normalizeVariantPart(decodeVariantKey(String(entryKey)));
            if (normEntry === normTarget) {
                return entryVal;
            }
        }
    }

    return undefined;
};
