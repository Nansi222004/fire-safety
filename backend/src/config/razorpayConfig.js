/**
 * Razorpay key selection (test vs live).
 *
 *   RAZORPAY_LIVE=true   → RAZORPAY_LIVE_KEY_ID / RAZORPAY_LIVE_KEY_SECRET / RAZORPAY_LIVE_WEBHOOK_SECRET
 *   RAZORPAY_LIVE=false  → RAZORPAY_TEST_KEY_ID / RAZORPAY_TEST_KEY_SECRET / RAZORPAY_TEST_WEBHOOK_SECRET
 *   (unset counts as false)
 *
 * If the mode-specific variable is empty, the older single-set names (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET,
 * RAZORPAY_WEBHOOK_SECRET) are used, so servers and test scripts that still set those keep working.
 *
 * Values are read on every call so the active set follows the environment without a code change.
 */

export const isRazorpayLive = () => String(process.env.RAZORPAY_LIVE || '').trim().toLowerCase() === 'true';

const pick = (suffix) => {
    const prefix = isRazorpayLive() ? 'RAZORPAY_LIVE_' : 'RAZORPAY_TEST_';
    return process.env[`${prefix}${suffix}`] || process.env[`RAZORPAY_${suffix}`] || '';
};

export const getRazorpayKeyId = () => pick('KEY_ID');
export const getRazorpayKeySecret = () => pick('KEY_SECRET');
export const getRazorpayWebhookSecret = () => pick('WEBHOOK_SECRET');

/**
 * Startup check: logs which mode is active and warns when the key id does not match the mode
 * (e.g. RAZORPAY_LIVE=true but an rzp_test_ key). Never logs secrets.
 */
export const logRazorpayMode = () => {
    const live = isRazorpayLive();
    const keyId = getRazorpayKeyId();
    const mode = live ? 'LIVE' : 'TEST';

    if (!keyId || !getRazorpayKeySecret()) {
        console.warn(`[Razorpay] ${mode} mode: key id or key secret is not set. Online payments will fail.`);
        return;
    }
    if (live && !keyId.startsWith('rzp_live_')) {
        console.warn(`[Razorpay] RAZORPAY_LIVE=true but the key id is not a live key (rzp_live_...). Check .env.`);
    } else if (!live && keyId.startsWith('rzp_live_')) {
        console.warn(`[Razorpay] RAZORPAY_LIVE is not true but a live key (rzp_live_...) is in use. Check .env.`);
    }
    if (!getRazorpayWebhookSecret()) {
        console.warn(`[Razorpay] ${mode} mode: webhook secret is not set. Razorpay webhooks will be rejected.`);
    }
    console.log(`[Razorpay] Using ${mode} keys (${keyId.slice(0, 13)}...)`);
};

export default {
    isRazorpayLive,
    getRazorpayKeyId,
    getRazorpayKeySecret,
    getRazorpayWebhookSecret,
    logRazorpayMode,
};
