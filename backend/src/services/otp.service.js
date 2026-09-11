import crypto from 'crypto';
import { sendEmail } from './email.service.js';

/**
 * Generates a 6-digit OTP and sets expiry (10 minutes)
 * @param {Object} user - Mongoose user/vendor document
 * @param {string} type - Purpose label (for logging)
 */
export const sendOTP = async (user, type = 'verification') => {
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    user.otp = otp;
    user.otpExpiry = otpExpiry;
    await user.save({ validateBeforeSave: false });

    try {
        await sendEmail({
            to: user.email,
            subject: 'Your verification code',
            text: `Your verification code is ${otp}. It expires in 10 minutes.`,
            html: `<p>Your verification code is <strong>${otp}</strong>. It expires in 10 minutes.</p>`,
        });
    } catch (err) {
        // Keep auth flow working in environments where SMTP is not configured.
        console.warn(`[OTP] Email send failed for ${user.email}: ${err.message}`);
        if (process.env.NODE_ENV !== 'production') {
            console.log(`[OTP] ${type} OTP generated for ${user.email}`);
        }
    }

    return otp;
};

/**
 * Standard SHA-256 HMAC-like hash using JWT_SECRET as salt
 * @param {string|number} otp
 * @returns {string} hex digest
 */
export const hashOtp = (otp) => {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET is not configured.');
    return crypto.createHash('sha256').update(`${String(otp)}:${secret}`).digest('hex');
};

/**
 * Compares plain OTP against stored hash using the standard hashing primitive
 * @param {string|number} otp
 * @param {string} hash
 * @returns {boolean}
 */
export const verifyOtpHash = (otp, hash) => {
    if (!otp || !hash) return false;
    return hashOtp(otp) === hash;
};

/**
 * Generates an OTP for customer delivery.
 * In local development with DELIVERY_OTP_TEST_MODE=true, returns deterministic '9999'.
 * In production or standard mode, returns cryptographically secure 6-digit random string.
 * @returns {string}
 */
export const generateDeliveryOtpValue = () => {
    const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
    if (!isProduction && process.env.DELIVERY_OTP_TEST_MODE === 'true') {
        return '9999';
    }
    const { randomInt } = crypto;
    return String(randomInt(100000, 1000000));
};

