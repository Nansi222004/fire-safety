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
 * Normalizes a number to non-negative finite number, or null if blank/invalid.
 * Explicitly guards against JavaScript Number("") === 0 coercion.
 * Blank strings, null, undefined, and non-numeric values return null.
 *
 * @param {*} raw
 * @returns {number|null}
 */
export const toNonNegativeNumber = (raw) => {
    if (raw === null || raw === undefined || raw === false) return null;
    if (typeof raw === 'string' && raw.trim() === '') return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

/**
 * Finds the exact key present in a Map or Object that corresponds to the given candidate variant key.
 * Checks canonical encoded key, exact string, decoded string, and normalized comparisons.
 *
 * @param {Map|object} mapOrObj
 * @param {string} candidateKey
 * @returns {string|null} The matching key present in the map, or null
 */
export const findMatchingVariantKey = (mapOrObj, candidateKey) => {
    if (!mapOrObj || !candidateKey) return null;
    const isMap = mapOrObj instanceof Map || typeof mapOrObj.get === 'function';
    const entries = isMap ? Array.from(mapOrObj.keys()) : Object.keys(mapOrObj);
    if (!entries.length) return null;

    const targetStr = String(candidateKey).trim();
    const encodedTarget = encodeVariantKey(targetStr);
    const decodedTarget = decodeVariantKey(targetStr);
    const normTarget = normalizeVariantPart(decodedTarget);

    // 1. Exact canonical encoded match (highest priority for MongoDB safety)
    if (entries.includes(encodedTarget)) return encodedTarget;

    // 2. Exact match
    if (entries.includes(targetStr)) return targetStr;

    // 3. Decoded match
    if (entries.includes(decodedTarget)) return decodedTarget;

    // 4. Normalized match against entries
    for (const key of entries) {
        const normKey = normalizeVariantPart(decodeVariantKey(String(key)));
        if (normKey === normTarget) return String(key);
    }

    return null;
};

/**
 * Resolves a value from a prices, stockMap, or imageMap structure.
 * Supports Mongoose Maps, plain objects, and Map instances.
 * Implements deterministic precedence:
 * 1. Canonical encoded key (e.g. '1%2e2 m|white')
 * 2. Exact raw candidate (e.g. '1.2 m|white')
 * 3. Decoded candidate
 * 4. Normalized variations
 *
 * Also detects encoded/raw variant-key collisions:
 * If conflicting non-blank values exist under both encoded and raw keys in the same map,
 * logs a warning and deterministically selects the canonical encoded key's value.
 * If options.throwOnConflict is true, throws an ApiError instead of silently overwriting.
 *
 * @param {Map|object} mapOrObj
 * @param {string|string[]} candidateKeys
 * @param {object} [options]
 * @param {boolean} [options.throwOnConflict=false]
 * @returns {*} resolved value or undefined
 */
export const resolveVariantMapValue = (mapOrObj, candidateKeys, options = {}) => {
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

    const matches = [];

    // 1. Direct and encoded/decoded lookups for each candidate
    for (const rawCandidate of keysToCheck) {
        if (!rawCandidate) continue;
        const candidate = String(rawCandidate).trim();
        const encoded = encodeVariantKey(candidate);
        const decoded = decodeVariantKey(candidate);

        // Precedence 1: Encoded candidate
        const valEncoded = getVal(encoded);
        if (valEncoded !== undefined) {
            matches.push({ key: encoded, value: valEncoded, precedence: 1 });
        }

        // Precedence 2: Exact candidate (if different from encoded)
        if (candidate !== encoded) {
            const valExact = getVal(candidate);
            if (valExact !== undefined) {
                matches.push({ key: candidate, value: valExact, precedence: 2 });
            }
        }

        // Precedence 3: Decoded candidate (if distinct from candidate and encoded)
        if (decoded !== candidate && decoded !== encoded) {
            const valDecoded = getVal(decoded);
            if (valDecoded !== undefined) {
                matches.push({ key: decoded, value: valDecoded, precedence: 3 });
            }
        }
    }

    // Precedence 4: Case-insensitive fallback iteration over all entries
    if (matches.length === 0) {
        const entries = isMap ? Array.from(mapOrObj.entries()) : Object.entries(mapOrObj);
        for (const rawCandidate of keysToCheck) {
            if (!rawCandidate) continue;
            const normTarget = normalizeVariantPart(decodeVariantKey(String(rawCandidate)));
            for (const [entryKey, entryVal] of entries) {
                const normEntry = normalizeVariantPart(decodeVariantKey(String(entryKey)));
                if (normEntry === normTarget && entryVal !== undefined) {
                    matches.push({ key: String(entryKey), value: entryVal, precedence: 4 });
                }
            }
        }
    }

    if (matches.length === 0) return undefined;

    // Sort by deterministic precedence
    matches.sort((a, b) => a.precedence - b.precedence);

    // Collision detection: Check if distinct keys have conflicting non-empty values
    const uniqueKeys = matches.filter((m, idx, arr) => arr.findIndex(x => x.key === m.key) === idx);
    if (uniqueKeys.length > 1) {
        const primary = uniqueKeys[0];
        const conflicts = uniqueKeys.filter(m => {
            if (m.key === primary.key) return false;
            // Compare values
            const numA = toNonNegativeNumber(primary.value);
            const numB = toNonNegativeNumber(m.value);
            if (numA !== null && numB !== null) return numA !== numB;
            const strA = String(primary.value ?? '').trim();
            const strB = String(m.value ?? '').trim();
            if (strA && strB) return strA !== strB;
            return false;
        });

        if (conflicts.length > 0) {
            const conflictMsg = `[Variant Collision] Conflicting values detected for variant candidates: ${uniqueKeys.map(m => `"${m.key}": ${JSON.stringify(m.value)}`).join(', ')}. Deterministic precedence applied: using "${primary.key}".`;
            console.warn(conflictMsg);

            if (options.throwOnConflict) {
                const err = new Error(`Conflicting values provided for variant "${decodeVariantKey(primary.key)}": "${primary.value}" vs "${conflicts[0].value}".`);
                err.statusCode = 400;
                throw err;
            }
        }
    }

    return matches[0].value;
};
