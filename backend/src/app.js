import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import compression from 'compression';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

// Route imports
import publicRoutes from './routes/public.routes.js';
import userRoutes from './modules/user/routes/user.routes.js';
import adminRoutes from './modules/admin/routes/admin.routes.js';
import vendorRoutes from './modules/vendor/routes/vendor.routes.js';
import deliveryRoutes from './modules/delivery/routes/delivery.routes.js';
import webhookRouter from './modules/user/routes/webhook.routes.js';
import paymentRouter from './modules/user/routes/payment.routes.js';
import fcmTokenRoutes from './routes/fcmToken.routes.js';
import customerServiceRoutes from './modules/customer/routes/customerService.routes.js';
import giftCardRoutes, { adminGiftCardRouter } from './routes/giftCard.routes.js';

// Middleware imports
import { apiLimiter } from './middlewares/rateLimiter.js';
import errorHandler from './middlewares/errorHandler.js';
import notFound from './middlewares/notFound.js';

const app = express();
app.set('trust proxy', 1);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsRoot = path.resolve(__dirname, '../uploads');
const deliveryDocsRoot = path.resolve(uploadsRoot, 'delivery-docs');

const isValidDeliveryDocToken = (relativePath, rawToken) => {
    if (!rawToken) return false;
    const [expRaw, providedSignature] = String(rawToken).split('.');
    const exp = Number(expRaw);
    if (!Number.isFinite(exp) || exp <= Date.now() || !providedSignature) return false;

    const payload = `${relativePath}|${exp}`;
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET is not configured.');
    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

    if (providedSignature.length !== expectedSignature.length) return false;
    return crypto.timingSafeEqual(Buffer.from(providedSignature), Buffer.from(expectedSignature));
};

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const envOrigins = [process.env.FRONTEND_URL, process.env.CLIENT_URL]
    .filter(Boolean)
    .flatMap((u) => u.split(','))
    .map((o) => o.trim().replace(/\/+$/, ''));
const ALLOWED_ORIGINS = envOrigins.length > 0 ? envOrigins : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173'];

// ─── Security Middleware ─────────────────────────────────────────────────────
app.use(helmet());
app.use(mongoSanitize());
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || !IS_PRODUCTION) return callback(null, true);
        const normalized = origin.trim().replace(/\/+$/, '');
        if (ALLOWED_ORIGINS.includes(normalized)) return callback(null, true);
        callback(new Error(`CORS policy: Origin ${origin} not allowed.`));
    },
    credentials: true,
}));

// Compress JSON responses to reduce payload transfer time.
app.use(compression());

// ─── Webhook Route (MUST be before express.json to preserve raw body for HMAC) ─
app.use('/api/webhook', express.raw({ type: 'application/json' }), webhookRouter);

// ─── Body Parsing ────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Rate Limiting ───────────────────────────────────────────────────────────
app.use('/api', apiLimiter);

// ─── Health Check ────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Server is running',
        timestamp: new Date().toISOString(),
    });
});

// ─── API Routes ──────────────────────────────────────────────────────────────
app.use(
    '/uploads/delivery-docs',
    (req, res, next) => {
        const relativePath = `/uploads/delivery-docs${req.path}`;
        const token = req.query.docToken;
        if (!isValidDeliveryDocToken(relativePath, token)) {
            return res.status(403).json({ success: false, message: 'Access denied.' });
        }
        next();
    },
    express.static(deliveryDocsRoot, { fallthrough: false })
);

app.use(
    '/uploads',
    (req, res, next) => {
        if (req.path.startsWith('/delivery-docs/')) {
            return res.status(403).json({ success: false, message: 'Access denied.' });
        }
        next();
    },
    express.static(uploadsRoot)
);
app.use('/api', publicRoutes);                       // Public: products, categories, brands, coupons, banners
app.use('/api/fcm-tokens', fcmTokenRoutes);           // FCM Push Notification Tokens (SOP)
app.use('/api/user/fcm-tokens', fcmTokenRoutes);      // FCM Tokens scoped for customer
app.use('/api/vendor/fcm-tokens', fcmTokenRoutes);    // FCM Tokens scoped for vendor
app.use('/api/delivery/fcm-tokens', fcmTokenRoutes);  // FCM Tokens scoped for delivery
app.use('/api/admin/fcm-tokens', fcmTokenRoutes);     // FCM Tokens scoped for admin
app.use('/api/customer', customerServiceRoutes);      // Customer Services & Bookings: catalog, pincode check, bookings
app.use('/api/gift-cards', giftCardRoutes);               // Gift Cards & Vouchers (Customer)
app.use('/api/user/gift-cards', giftCardRoutes);          // Gift Cards & Vouchers (Customer alias)
app.use('/api/admin/gift-cards', adminGiftCardRouter);     // Gift Cards & Vouchers (Admin)
app.use('/api/user', userRoutes);                    // Customer: auth, addresses, wishlist, reviews, orders
app.use('/api/user/payment', paymentRouter);         // Payment: initialize, retry, exchange-upgrade
app.use('/api/admin', adminRoutes);                  // Admin: auth, vendors, orders, catalog, analytics
app.use('/api/vendor', vendorRoutes);                // Vendor: auth, products, orders, earnings
app.use('/api/delivery', deliveryRoutes);            // Delivery: auth, orders

// ─── Error Handling ──────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

export default app;
