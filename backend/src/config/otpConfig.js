// Central switches for OTP shortcuts used in development and automated tests.
// Both are OFF unless explicitly enabled AND the app is not running with NODE_ENV=production, so a deployment
// that forgets to set NODE_ENV=production does not silently accept a fixed OTP or leak OTPs in API responses.

export const isProductionEnv = () => String(process.env.NODE_ENV || '').toLowerCase() === 'production';

/** Store / return plain-text OTPs (…OtpDebug fields) so testers can see them. Opt in with ENABLE_DEBUG_OTP=true. */
export const isOtpDebugEnabled = () => !isProductionEnv() && process.env.ENABLE_DEBUG_OTP === 'true';

/** Accept the fixed OTP 123456 for email verification. Opt in with ALLOW_TEST_OTP=true. */
export const isTestOtpAllowed = () => !isProductionEnv() && process.env.ALLOW_TEST_OTP === 'true';
export const TEST_OTP = '123456';
