import nodemailer from 'nodemailer';
import { renderEmailLayout, isFullHtmlDocument, htmlToText, escapeHtml, emailButton, BRAND } from './emailLayout.js';

/**
 * Every outgoing email uses the SafeFire layout: HTML fragments (and text-only emails) are
 * wrapped in it; complete HTML documents (e.g. the OTP template) are sent unchanged.
 */
export const buildThemedHtml = ({ subject = 'SafeFire', html, text }) => {
    if (html) return isFullHtmlDocument(html) ? html : renderEmailLayout({ title: subject, preheader: text || subject, bodyHtml: html });
    if (text) return renderEmailLayout({ title: subject, preheader: text, bodyHtml: `<p style="margin:0;">${escapeHtml(text).replace(/\n/g, '<br>')}</p>` });
    return undefined;
};

let transporter = null;

/**
 * Returns a nodemailer transporter instance initialized with environment variables.
 * Uses lazy initialization so environment variables loaded after module evaluation are honored.
 */
export const getTransporter = () => {
    if (!transporter) {
        const port = Number(process.env.SMTP_PORT) || 587;
        const isSecure = process.env.SMTP_SECURE === 'true' || port === 465;

        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port,
            secure: isSecure,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
            tls: {
                rejectUnauthorized: process.env.NODE_ENV === 'production',
            },
            connectionTimeout: 15000,
            greetingTimeout: 15000,
        });
    }
    return transporter;
};

/**
 * Verifies that the SMTP credentials and server connection are working.
 * @returns {Promise<boolean>}
 */
export const verifySmtpConnection = async () => {
    try {
        const transport = getTransporter();
        await transport.verify();
        return true;
    } catch (err) {
        console.error('[SMTP Verification Error]:', err.message);
        throw err;
    }
};

/**
 * Send an email
 * @param {Object} options - { to, subject, html, text }
 */
export const sendEmail = async ({ to, subject, html, text }) => {
    if (!to) {
        console.warn('[Email Service] sendEmail called without a recipient email. Skipping.');
        return null;
    }

    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.warn('[Email Service] SMTP credentials not configured (SMTP_USER/SMTP_PASS). Email skipped.');
        return null;
    }

    const mailOptions = {
        from: `"${process.env.FROM_NAME || 'Safe Fire Shop'}" <${process.env.FROM_EMAIL || process.env.SMTP_USER}>`,
        to,
        subject,
        html: buildThemedHtml({ subject, html, text }),
        text: text || (html ? htmlToText(html) : undefined),
    };

    const transport = getTransporter();
    const info = await transport.sendMail(mailOptions);
    return info;
};

const formatInr = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const PAYMENT_LABELS = { cod: 'Cash on Delivery', cash: 'Cash on Delivery', card: 'Card', upi: 'UPI', wallet: 'SafeFire Wallet', bank: 'Net Banking' };

const variantLabel = (variant) => {
    if (!variant || typeof variant !== 'object') return '';
    const selection = variant.selection && typeof variant.selection === 'object'
        ? Object.values(variant.selection instanceof Map ? Object.fromEntries(variant.selection) : variant.selection)
        : [];
    return [variant.size, variant.color, variant.material, ...selection].filter(Boolean).map(String).join(' · ');
};

const sectionHeading = (label) =>
    `<h2 style="margin:26px 0 6px;font-size:13px;font-weight:800;color:${BRAND.ink};text-transform:uppercase;letter-spacing:.6px;">${label}</h2>`;

/** Branded order-confirmation email: order summary, items, totals and delivery address. */
export const buildOrderConfirmationEmail = (order) => {
    const isCod = order?.paymentMethod === 'cod' || order?.paymentMethod === 'cash';
    const displayTotal = isCod && typeof order?.total === 'number' ? Math.round(order.total) : order?.total;
    const isWholesale = order?.orderType === 'b2b';
    const address = order?.shippingAddress || {};
    const rawName = address.name || order?.guestInfo?.name || '';
    const customerName = escapeHtml(rawName);
    const placedOn = new Date(order?.createdAt || Date.now()).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    const items = Array.isArray(order?.items) ? order.items : [];
    const lineTotalOf = (item) => item.lineSubtotal ?? Number(item.price || 0) * Number(item.quantity || 0);

    const itemRows = items.map((item) => {
        const variant = variantLabel(item.variant);
        const thumb = item.image
            ? `<img src="${escapeHtml(item.image)}" width="48" height="48" alt="" style="display:block;width:48px;height:48px;border-radius:8px;object-fit:cover;border:1px solid ${BRAND.border};">`
            : `<div style="width:48px;height:48px;border-radius:8px;background:${BRAND.soft};"></div>`;
        return `<tr>
  <td style="padding:12px 0;border-bottom:1px solid ${BRAND.border};width:56px;vertical-align:top;">${thumb}</td>
  <td style="padding:12px 8px;border-bottom:1px solid ${BRAND.border};vertical-align:top;font-size:14px;">
    <div style="font-weight:700;color:${BRAND.ink};">${escapeHtml(item.name || 'Product')}</div>
    ${variant ? `<div style="font-size:12px;color:${BRAND.muted};">${escapeHtml(variant)}</div>` : ''}
    <div style="font-size:12px;color:${BRAND.muted};">Qty ${Number(item.quantity || 0)} × ${formatInr(item.price)}</div>
  </td>
  <td align="right" style="padding:12px 0;border-bottom:1px solid ${BRAND.border};vertical-align:top;font-size:14px;font-weight:700;color:${BRAND.ink};white-space:nowrap;">${formatInr(lineTotalOf(item))}</td>
</tr>`;
    }).join('');

    const totalRow = (label, value, { strong = false, negative = false, valueHtml } = {}) => `<tr>
  <td style="padding:4px 0;font-size:${strong ? 16 : 14}px;color:${strong ? BRAND.ink : BRAND.muted};font-weight:${strong ? 800 : 400};">${label}</td>
  <td align="right" style="padding:4px 0;font-size:${strong ? 18 : 14}px;color:${strong ? BRAND.red : BRAND.ink};font-weight:${strong ? 800 : 600};">${valueHtml || `${negative ? '− ' : ''}${formatInr(value)}`}</td>
</tr>`;

    const summaryCell = (label, value) =>
        `<td style="padding:14px 16px;font-size:12px;color:${BRAND.muted};vertical-align:top;">${label}<br><strong style="font-size:14px;color:${BRAND.ink};">${value}</strong></td>`;

    const addressLines = [
        address.address,
        [address.city, address.state].filter(Boolean).join(', '),
        [address.zipCode, address.country].filter(Boolean).join(' '),
    ].filter(Boolean).map(escapeHtml).join('<br>');

    const bodyHtml = `
<h1 style="margin:0 0 6px;font-size:22px;font-weight:800;color:${BRAND.ink};">Thank you for your order${customerName ? `, ${customerName}` : ''}!</h1>
<p style="margin:0 0 20px;color:${BRAND.muted};font-size:14px;">We have received your ${isWholesale ? 'wholesale (B2B) ' : ''}order and will keep you updated as it moves along.</p>
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background:${BRAND.soft};border:1px solid #FECACA;border-radius:12px;">
  <tr>
    ${summaryCell('Order ID', escapeHtml(order?.orderId || ''))}
    ${summaryCell('Placed on', placedOn)}
    ${summaryCell('Payment', escapeHtml(PAYMENT_LABELS[order?.paymentMethod] || order?.paymentMethod || '—'))}
  </tr>
</table>
${items.length ? `${sectionHeading('Items')}<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">${itemRows}</table>` : ''}
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top:14px;">
  ${order?.subtotal != null ? totalRow('Subtotal', order.subtotal) : ''}
  ${order?.subtotal != null ? (Number(order?.shipping) ? totalRow('Shipping', order.shipping) : totalRow('Shipping', 0, { valueHtml: '<span style="color:#059669;">Free</span>' })) : ''}
  ${Number(order?.tax) ? totalRow('Tax', order.tax) : ''}
  ${Number(order?.discount) ? totalRow('Discount', order.discount, { negative: true }) : ''}
  <tr><td colspan="2" style="border-top:2px solid ${BRAND.border};padding-top:6px;"></td></tr>
  ${totalRow(isCod ? 'Total (pay on delivery)' : 'Total paid', displayTotal, { strong: true })}
</table>
${addressLines ? `${sectionHeading('Delivering to')}<p style="margin:0;font-size:14px;color:${BRAND.ink};">${customerName ? `<strong>${customerName}</strong><br>` : ''}${addressLines}${address.phone ? `<br><span style="color:${BRAND.muted};">Phone: ${escapeHtml(address.phone)}</span>` : ''}</p>` : ''}
<p style="margin:20px 0 0;font-size:14px;color:${BRAND.muted};">Tracking number: <strong style="color:${BRAND.ink};">${escapeHtml(order?.trackingNumber || 'Will be shared once shipped')}</strong></p>
${emailButton('Track your order', '/orders')}`;

    const text = [
        `Thank you for your order${rawName ? `, ${rawName}` : ''}!`,
        `Order ID: ${order?.orderId}`,
        `Placed on: ${placedOn}`,
        '',
        ...items.map((i) => `- ${i.name} × ${i.quantity}: ${formatInr(lineTotalOf(i))}`),
        '',
        `Total: ${formatInr(displayTotal)}${isCod ? ' (Cash on Delivery)' : ''}`,
        `Tracking: ${order?.trackingNumber || 'Pending'}`,
    ].join('\n');

    const subject = `Order Confirmed — ${order?.orderId}`;
    return {
        subject,
        text,
        html: renderEmailLayout({ title: subject, preheader: `Your SafeFire order ${order?.orderId} is confirmed. Total ${formatInr(displayTotal)}.`, bodyHtml }),
    };
};

export const sendOrderConfirmationEmail = async (order, userEmail) => {
    if (!userEmail) {
        console.warn(`[Order Email] No email provided for order ${order?.orderId}`);
        return null;
    }

    const { subject, html, text } = buildOrderConfirmationEmail(order);
    await sendEmail({ to: userEmail, subject, html, text });
};
