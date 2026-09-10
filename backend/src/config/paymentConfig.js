/**
 * Centralized SafeFire Payment Configuration
 *
 * Supported Payment Modes:
 *  - 'COD_ONLY': Cash on Delivery only. All online payment initiations (Razorpay, UPI, Cards)
 *                are blocked at the API layer and hidden in checkout.
 *  - 'ONLINE_ENABLED': Normal hybrid mode where Razorpay, UPI, cards, and COD are available.
 *
 * Current Active Phase: 'COD_ONLY'
 * To re-enable Razorpay in the future, set PAYMENT_MODE=ONLINE_ENABLED in .env
 */

export const PAYMENT_MODES = Object.freeze({
    COD_ONLY: 'COD_ONLY',
    ONLINE_ENABLED: 'ONLINE_ENABLED',
});

// Default to COD_ONLY if not explicitly specified as ONLINE_ENABLED
// Evaluated dynamically so test runners and environment toggles can switch modes seamlessly
export const getPaymentMode = () => {
    return process.env.PAYMENT_MODE === PAYMENT_MODES.ONLINE_ENABLED
        ? PAYMENT_MODES.ONLINE_ENABLED
        : PAYMENT_MODES.COD_ONLY;
};

export const isCodOnlyMode = () => getPaymentMode() === PAYMENT_MODES.COD_ONLY;
export const isOnlinePaymentEnabled = () => getPaymentMode() === PAYMENT_MODES.ONLINE_ENABLED;

export default {
    PAYMENT_MODES,
    getPaymentMode,
    isCodOnlyMode,
    isOnlinePaymentEnabled,
};
