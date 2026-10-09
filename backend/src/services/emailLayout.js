/**
 * Shared SafeFire email layout (same brand as the OTP template in otp.service.js):
 * red gradient header, white card on a light-grey canvas, footer. Table-based + inline styles
 * so it renders consistently in Gmail, Outlook and mobile clients.
 */

export const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const BRAND = {
    red: '#E31E24',
    redDark: '#C8191F',
    ink: '#1F2937',
    muted: '#64748B',
    border: '#E2E8F0',
    canvas: '#F4F6F8',
    soft: '#FFF5F5',
    font: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
};

const siteUrl = () => String(process.env.FRONTEND_URL || process.env.CLIENT_URL || '').split(',')[0].trim().replace(/\/$/, '');

export const isFullHtmlDocument = (html = '') => /^\s*(<!doctype|<html)/i.test(String(html));

/** Primary call-to-action button. `path` is appended to FRONTEND_URL; omitted when no URL is configured. */
export const emailButton = (label, path = '/') => {
    const base = siteUrl();
    if (!base) return '';
    return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:24px auto 4px;"><tr>
  <td align="center" style="border-radius:10px;background:${BRAND.red};">
    <a href="${escapeHtml(base + path)}" target="_blank" style="display:inline-block;padding:13px 28px;font-family:${BRAND.font};font-size:14px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:10px;">${escapeHtml(label)}</a>
  </td></tr></table>`;
};

/** Highlighted code box (OTPs, voucher codes). */
export const emailCodeBox = (code, label = 'Your code') => `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:20px 0;"><tr>
  <td align="center" style="background:${BRAND.soft};border:2px dashed ${BRAND.red};border-radius:12px;padding:18px;">
    <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${BRAND.muted};">${escapeHtml(label)}</div>
    <div style="font-size:30px;font-weight:800;letter-spacing:8px;color:${BRAND.red};font-family:'Courier New',monospace;margin-top:6px;">${escapeHtml(code)}</div>
  </td></tr></table>`;

/**
 * Wraps body HTML in the SafeFire layout.
 * @param {{ title?: string, preheader?: string, bodyHtml: string }} opts
 */
export const renderEmailLayout = ({ title = 'SafeFire', preheader = '', bodyHtml = '' }) => {
    const year = new Date().getFullYear();
    const base = siteUrl();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.canvas};font-family:${BRAND.font};-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%;">
  <div style="display:none;font-size:1px;color:${BRAND.canvas};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader || title)}</div>
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:${BRAND.canvas};table-layout:fixed;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;background-color:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid ${BRAND.border};">
          <tr>
            <td align="center" style="background:${BRAND.red};background:linear-gradient(135deg,#E31E24 0%,#C8191F 55%,#8B0A0F 100%);padding:28px 20px 24px;color:#FFFFFF;">
              <div style="font-size:26px;line-height:1;">🔥</div>
              <div style="font-size:22px;font-weight:800;letter-spacing:2px;text-transform:uppercase;margin-top:10px;color:#FFFFFF;">SAFEFIRE</div>
              <div style="font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,0.88);margin-top:4px;">Certified Fire Safety &amp; Protection</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 28px;color:${BRAND.ink};font-size:15px;line-height:1.6;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td align="center" style="background:#F8FAFC;border-top:1px solid ${BRAND.border};padding:20px 24px;color:${BRAND.muted};font-size:12px;line-height:1.6;">
              Need help? Reply to this email or visit ${base ? `<a href="${escapeHtml(base)}" style="color:${BRAND.red};text-decoration:none;font-weight:600;">SafeFire</a>` : 'SafeFire'} Help &amp; Support.<br>
              &copy; ${year} SafeFire. All rights reserved.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

/** Plain-text fallback derived from HTML (for clients that do not render HTML). */
export const htmlToText = (html = '') => String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<(br|\/p|\/div|\/tr|\/h[1-6]|\/li)\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&rarr;/g, '→')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
