import nodemailer from 'nodemailer';

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
        html,
        text,
    };

    const transport = getTransporter();
    const info = await transport.sendMail(mailOptions);
    return info;
};

export const sendOrderConfirmationEmail = async (order, userEmail) => {
    if (!userEmail) {
        console.warn(`[Order Email] No email provided for order ${order?.orderId}`);
        return null;
    }

    const isCod = order?.paymentMethod === 'cod' || order?.paymentMethod === 'cash';
    const displayTotal = isCod && typeof order?.total === 'number' ? Math.round(order.total) : order?.total;

    await sendEmail({
        to: userEmail,
        subject: `Order Confirmed — ${order.orderId}`,
        html: `<h2>Thank you for your order!</h2><p>Order ID: <strong>${order.orderId}</strong></p><p>Total: ₹${displayTotal}</p><p>Tracking: ${order.trackingNumber || 'Pending'}</p>`,
    });
};
