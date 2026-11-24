import Joi from 'joi';

/**
 * Structured product content entered by the seller/Admin:
 *   highlights      — key points shown as a bullet list on the product page
 *   specifications  — name/value rows shown as a table (names are free text; nothing is hardcoded per category)
 */
export const PRODUCT_CONTENT_LIMITS = Object.freeze({
    maxHighlights: 20,
    highlightLength: 300,
    maxSpecifications: 40,
    specLabelLength: 60,
    specValueLength: 200,
});
const L = PRODUCT_CONTENT_LIMITS;

// Validation (request level). Empty rows are allowed here and dropped by the sanitizers below.
export const highlightsSchema = Joi.array()
    .items(Joi.string().trim().allow('').max(L.highlightLength))
    .max(L.maxHighlights)
    .messages({ 'array.max': `Add at most ${L.maxHighlights} highlights.`, 'string.max': `Each highlight must be at most ${L.highlightLength} characters.` });

export const specificationsSchema = Joi.array()
    .items(Joi.object({
        label: Joi.string().trim().allow('').max(L.specLabelLength),
        value: Joi.string().trim().allow('').max(L.specValueLength),
    }).unknown(false))
    .max(L.maxSpecifications)
    .messages({ 'array.max': `Add at most ${L.maxSpecifications} specifications.` });

const clean = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Trimmed, non-empty, de-duplicated highlight points (order kept). */
export const sanitizeHighlights = (list) => {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const out = [];
    for (const item of list) {
        const text = clean(item, L.highlightLength).replace(/^(?:[-*•●▪◦]|\d+[.)])\s+/, '');
        const key = text.toLowerCase();
        if (!text || seen.has(key)) continue;
        seen.add(key);
        out.push(text);
        if (out.length >= L.maxHighlights) break;
    }
    return out;
};

/** Rows with both a name and a value; a repeated name keeps its first row. */
export const sanitizeSpecifications = (list) => {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const out = [];
    for (const row of list) {
        const label = clean(row?.label, L.specLabelLength);
        const value = clean(row?.value, L.specValueLength);
        const key = label.toLowerCase();
        if (!label || !value || seen.has(key)) continue;
        seen.add(key);
        out.push({ label, value });
        if (out.length >= L.maxSpecifications) break;
    }
    return out;
};

/** Applies both sanitizers to the keys present in a create/update payload (absent keys are left untouched). */
export const applyProductContent = (payload) => {
    if (!payload || typeof payload !== 'object') return payload;
    if (Object.prototype.hasOwnProperty.call(payload, 'highlights')) payload.highlights = sanitizeHighlights(payload.highlights);
    if (Object.prototype.hasOwnProperty.call(payload, 'specifications')) payload.specifications = sanitizeSpecifications(payload.specifications);
    return payload;
};
