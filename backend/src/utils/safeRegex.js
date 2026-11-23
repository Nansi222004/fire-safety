import ApiError from './ApiError.js';

/** Escapes every RegExp metacharacter so user text is matched literally. */
export const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Case-insensitive "contains" regex for user-supplied search text, matched literally (no regex injection, no
 * catastrophic backtracking). Returns null for empty input; throws 400 when the text is longer than maxLength.
 */
export const buildSearchRegex = (input, { maxLength = 100, label = 'Search text' } = {}) => {
    const text = String(input ?? '').trim();
    if (!text) return null;
    if (text.length > maxLength) {
        throw new ApiError(400, `${label} must be at most ${maxLength} characters.`);
    }
    return new RegExp(escapeRegex(text), 'i');
};

export default buildSearchRegex;
