import crypto from 'crypto';
import { sendEmail } from './email.service.js';

const escapeHtml = (str) =>
    String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

/**
 * Builds a responsive, branded HTML & text email template aligned with the SafeFire theme.
 * @param {Object} options
 * @param {string} options.otp - 6-digit code
 * @param {string} [options.userName] - Recipient name
 * @param {string} [options.type] - Verification purpose
 * @returns {{ subject: string, html: string, text: string }}
 */
export const buildOtpEmailTemplate = ({ otp, userName = '', type = 'verification' }) => {
    const isPasswordReset = type === 'password_reset' || type === 'reset';
    const isVendor = type === 'vendor_verification';

    const currentYear = new Date().getFullYear();
    const safeName = escapeHtml(userName.trim());
    const greeting = safeName ? `Hello <strong>${safeName}</strong>,` : 'Hello,';
    const greetingPlain = safeName ? `Hello ${safeName},` : 'Hello,';

    let heading = 'Verify Your Email Address';
    let codeBadge = 'Verification Code';
    let description =
        'Thank you for registering with <strong>SafeFire</strong>. To complete your account registration and secure your profile, please use the 6-digit verification code below:';
    let descriptionPlain =
        'Thank you for registering with SafeFire. To complete your account registration and secure your profile, please use the 6-digit verification code below:';
    let subject = 'Your verification code — SafeFire';

    if (isPasswordReset) {
        heading = 'Password Reset Request';
        codeBadge = 'Password Reset Code';
        description =
            'We received a request to reset your <strong>SafeFire</strong> password. Use the 6-digit code below to proceed with resetting your password:';
        descriptionPlain =
            'We received a request to reset your SafeFire password. Use the 6-digit code below to proceed with resetting your password:';
        subject = 'Password reset code — SafeFire';
    } else if (isVendor) {
        heading = 'Vendor Partner Verification';
        codeBadge = 'Partner Verification Code';
        description =
            'Thank you for registering as a seller on <strong>SafeFire</strong>. Please verify your email with the 6-digit code below to complete your partner onboarding:';
        descriptionPlain =
            'Thank you for registering as a seller on SafeFire. Please verify your email with the 6-digit code below to complete your partner onboarding:';
        subject = 'Vendor verification code — SafeFire';
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background-color:#F4F6F8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <!-- Preheader snippet for email inbox list -->
  <div style="display:none;font-size:1px;color:#F4F6F8;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;mso-hide:all;">
    Your SafeFire ${codeBadge.toLowerCase()} is ${otp}. Valid for 10 minutes.
  </div>

  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#F4F6F8;table-layout:fixed;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <!-- Card Container -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;background-color:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #E2E8F0;box-shadow:0 4px 20px rgba(0,0,0,0.06);">
          <!-- Header Banner (SafeFire Brand Gradient & Badge) -->
          <tr>
            <td align="center" style="background:#E31E24;background:linear-gradient(135deg,#E31E24 0%,#C8191F 55%,#8B0A0F 100%);padding:32px 20px 28px;color:#FFFFFF;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="width:52px;height:52px;background:rgba(255,255,255,0.18);border:2px solid rgba(255,255,255,0.35);border-radius:50%;font-size:26px;line-height:52px;text-align:center;">
                    🔥
                  </td>
                </tr>
              </table>
              <div style="font-size:22px;font-weight:800;letter-spacing:2px;text-transform:uppercase;margin-top:12px;color:#FFFFFF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                SAFEFIRE
              </div>
              <div style="font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,0.88);margin-top:4px;">
                Certified Fire Safety &amp; Protection
              </div>
            </td>
          </tr>

          <!-- Body Content Area -->
          <tr>
            <td style="padding:32px 28px 24px;color:#1F2937;">
              <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#111827;text-align:left;">
                ${escapeHtml(heading)}
              </h2>
              <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#374151;">
                ${greeting}
              </p>
              <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#4B5563;">
                ${description}
              </p>

              <!-- OTP Code Display Card -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#FEF2F2;border:1.5px solid #FCA5A5;border-radius:12px;margin-bottom:24px;">
                <tr>
                  <td align="center" style="padding:22px 16px;">
                    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#991B1B;margin-bottom:8px;">
                      ${escapeHtml(codeBadge)}
                    </div>
                    <div style="font-family:'Courier New',Courier,monospace;font-size:36px;font-weight:800;letter-spacing:8px;color:#E31E24;padding:4px 0 6px;">
                      ${otp}
                    </div>
                    <div style="font-size:12px;color:#6B7280;font-weight:500;margin-top:4px;">
                      ⏱ Expires in <strong>10 minutes</strong>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Security Advisory Notice -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#F8FAFC;border-left:4px solid #E31E24;border-radius:0 8px 8px 0;margin-bottom:24px;">
                <tr>
                  <td style="padding:12px 16px;">
                    <div style="font-size:13px;font-weight:700;color:#1F2937;margin-bottom:3px;">
                      🔒 Security Advice
                    </div>
                    <div style="font-size:12px;line-height:1.5;color:#64748B;">
                      Never share this code with anyone. SafeFire will never ask you for your verification code.
                    </div>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:13px;line-height:1.5;color:#9CA3AF;">
                If you did not request this verification code, please ignore this email. No changes will be made to your account.
              </p>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 28px;">
              <hr style="border:none;border-top:1px solid #E5E7EB;margin:0;">
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 28px;background-color:#FAFAFA;text-align:center;color:#94A3B8;font-size:11px;line-height:1.6;">
              <div style="font-weight:600;color:#64748B;margin-bottom:4px;">
                SafeFire Shop
              </div>
              <div style="color:#94A3B8;margin-bottom:6px;">
                Certified Fire Safety Equipment &amp; Protection
              </div>
              <div style="color:#CBD5E1;">
                &copy; ${currentYear} SafeFire. All rights reserved.
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const text = `==================================================
SAFEFIRE — CERTIFIED FIRE SAFETY & PROTECTION
==================================================

${heading}

${greetingPlain}

${descriptionPlain}

--------------------------------------------------
${codeBadge.toUpperCase()}: ${otp}
(Expires in 10 minutes)
--------------------------------------------------

SECURITY ADVICE:
Never share this code with anyone. SafeFire will never ask you for your verification code.

If you did not request this code, you can safely ignore this email.

==================================================
SafeFire Shop — Certified Fire Safety Equipment & Protection
© ${currentYear} SafeFire. All rights reserved.
`;

    return { subject, html, text };
};

/**
 * Generates a 6-digit OTP and sets expiry (10 minutes)
 * @param {Object} user - Mongoose user/vendor document
 * @param {string} type - Purpose label (for logging and templating)
 */
export const sendOTP = async (user, type = 'verification') => {
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    user.otp = otp;
    user.otpExpiry = otpExpiry;
    await user.save({ validateBeforeSave: false });

    try {
        const { subject, html, text } = buildOtpEmailTemplate({
            otp,
            userName: user.name || user.storeName || '',
            type,
        });

        await sendEmail({
            to: user.email,
            subject,
            text,
            html,
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

