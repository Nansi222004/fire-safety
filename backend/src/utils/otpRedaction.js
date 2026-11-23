/**
 * OTP secrets in API responses and socket broadcasts.
 *
 *   *OtpHash            never leaves the server.
 *   deliveryOtpDebug    the customer's delivery code: only the customer's own (authenticated) order responses.
 *   pickupOtpDebug      the rider's pickup code: only the rider's own responses (the seller must type it in).
 *
 * Return/exchange codes (returnPickupOtpDebug, vendorHandoverOtpDebug, …) are already shaped per audience by
 * toReturnRequestView and are left untouched here.
 */
const HASH_KEY = /otphash$/i;
export const DELIVERY_FLOW_CODES = ['deliveryOtpDebug', 'pickupOtpDebug'];

const isPlainObject = (value) => {
    if (!value || typeof value !== 'object') return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
};

/**
 * Returns a redacted copy. ObjectIds, Dates and other non-plain values are kept as they are.
 * @param {*} value
 * @param {{ keep?: string[] }} [options]  delivery-flow codes this audience owns (e.g. ['deliveryOtpDebug'])
 */
export const redactOtpSecrets = (value, { keep = [] } = {}, depth = 0) => {
    if (depth > 15) return value;
    if (Array.isArray(value)) return value.map((item) => redactOtpSecrets(item, { keep }, depth + 1));
    if (!isPlainObject(value)) return value;
    const out = {};
    for (const [key, item] of Object.entries(value)) {
        if (HASH_KEY.test(key)) continue;
        if (DELIVERY_FLOW_CODES.includes(key) && !keep.includes(key)) continue;
        out[key] = redactOtpSecrets(item, { keep }, depth + 1);
    }
    return out;
};

/** Keys present anywhere in the value that this audience must not receive (used by tests). */
export const findOtpSecrets = (value, { keep = [] } = {}, path = '', depth = 0, found = []) => {
    if (depth > 15 || !value || typeof value !== 'object') return found;
    if (Array.isArray(value)) {
        value.forEach((item, i) => findOtpSecrets(item, { keep }, `${path}[${i}]`, depth + 1, found));
        return found;
    }
    for (const [key, item] of Object.entries(value)) {
        if (HASH_KEY.test(key) || (DELIVERY_FLOW_CODES.includes(key) && !keep.includes(key))) found.push(`${path}.${key}`);
        findOtpSecrets(item, { keep }, `${path}.${key}`, depth + 1, found);
    }
    return found;
};

/**
 * Express middleware: redacts every JSON response of the router it is mounted on, for one audience.
 * The body is first normalized exactly as res.json would serialize it, so nothing is missed in class instances
 * or Mongoose documents.
 */
export const redactOtpInResponses = ({ keep = [] } = {}) => (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = (body) => {
        if (body === null || body === undefined || typeof body !== 'object') return originalJson(body);
        let plain;
        try {
            plain = JSON.parse(JSON.stringify(body));
        } catch {
            return originalJson(body);
        }
        return originalJson(redactOtpSecrets(plain, { keep }));
    };
    next();
};

export default redactOtpSecrets;
