import { Router } from 'express';
import * as wholesalerAuthController from '../controllers/auth.controller.js';
import * as wholesalerController from '../controllers/wholesaler.controller.js';
// Wholesalers are stored as Vendor documents (accountType = 'wholesaler'), so the vendor handlers are
// reused here. Every vendor handler scopes its data to req.user.id; auth handlers are additionally
// scoped to the Wholesaler account type through req.accountType (see asWholesaler below).
// Paths mirror /api/vendor so the shared seller pages work unchanged in the Wholesaler portal.
import * as vendorAuthController from '../../vendor/controllers/auth.controller.js';
import * as productController from '../../vendor/controllers/product.controller.js';
import * as orderController from '../../vendor/controllers/order.controller.js';
import * as catalogController from '../controllers/catalog.controller.js';
import * as documentController from '../../vendor/controllers/document.controller.js';
import * as notificationController from '../../vendor/controllers/notification.controller.js';
import * as returnController from '../../vendor/controllers/return.controller.js';
import * as uploadController from '../../vendor/controllers/upload.controller.js';
import * as walletController from '../../vendor/controllers/wallet.controller.js';
import * as supportController from '../../vendor/controllers/support.controller.js';
import * as brandController from '../../vendor/controllers/brand.controller.js';
import * as categoryController from '../../vendor/controllers/category.controller.js';
import { wholesalerRegisterSchema } from '../validators/auth.validator.js';
import {
    loginSchema,
    verifyOtpSchema,
    resendOtpSchema,
    refreshTokenSchema,
    logoutSchema,
    forgotPasswordSchema,
    verifyResetOtpSchema,
    resetPasswordSchema,
} from '../../vendor/validators/auth.validator.js';
import {
    createProductSchema,
    updateProductSchema,
    productIdParamSchema,
} from '../../vendor/validators/product.validator.js';

import { authenticate } from '../../../middlewares/authenticate.js';
import { authorize, enforceAccountStatus } from '../../../middlewares/authorize.js';
import { authLimiter, otpLimiter, otpVerifyLimiter } from '../../../middlewares/rateLimiter.js';
import { validate } from '../../../middlewares/validate.js';
import {
    uploadSingle,
    uploadMultiple,
    uploadDocumentSingle,
    uploadVendorRegistrationDocuments,
    cleanupUploadsOnError,
} from '../../../middlewares/upload.js';

const router = Router();

const asWholesaler = (req, _res, next) => {
    req.accountType = 'wholesaler';
    next();
};
router.use(asWholesaler);

export const wholesalerAuth = [authenticate, authorize('wholesaler'), enforceAccountStatus];

// Wholesalers sell B2B only: retail availability is never accepted from the client.
const forceWholesaleOnly = (req, _res, next) => {
    req.body.b2cAvailable = false;
    next();
};

// A wholesaler only ever sells wholesale orders.
const forceB2bOrders = (req, _res, next) => {
    req.query.orderType = 'b2b';
    next();
};

// Auth
router.post(
    '/auth/register',
    authLimiter,
    uploadVendorRegistrationDocuments([
        { name: 'license', maxCount: 1 }, // GST certificate
        { name: 'identity', maxCount: 1 },
    ]),
    (req, res, next) => {
        // Parse req.body.address if passed as string in multipart form data
        if (typeof req.body.address === 'string') {
            try {
                req.body.address = JSON.parse(req.body.address);
            } catch (e) {
                // Ignore parse error, will fail validation cleanly
            }
        }
        next();
    },
    validate(wholesalerRegisterSchema),
    wholesalerAuthController.register,
    cleanupUploadsOnError
);
router.post('/auth/verify-otp', otpVerifyLimiter, validate(verifyOtpSchema), vendorAuthController.verifyOTP);
router.post('/auth/resend-otp', otpLimiter, validate(resendOtpSchema), vendorAuthController.resendOTP);
router.post('/auth/forgot-password', authLimiter, validate(forgotPasswordSchema), vendorAuthController.forgotPassword);
router.post('/auth/verify-reset-otp', otpVerifyLimiter, validate(verifyResetOtpSchema), vendorAuthController.verifyResetOTP);
router.post('/auth/reset-password', authLimiter, validate(resetPasswordSchema), vendorAuthController.resetPassword);
router.post('/auth/login', authLimiter, validate(loginSchema), vendorAuthController.login);
router.post('/auth/refresh', validate(refreshTokenSchema), vendorAuthController.refresh);
router.post('/auth/logout', validate(logoutSchema), vendorAuthController.logout);
router.get('/auth/profile', ...wholesalerAuth, vendorAuthController.getProfile);
router.put('/auth/profile', ...wholesalerAuth, vendorAuthController.updateProfile);
router.put('/auth/bank-details', ...wholesalerAuth, vendorAuthController.updateBankDetails);
router.delete('/auth/account', ...wholesalerAuth, vendorAuthController.deleteAccount);

// Dashboard
router.get('/dashboard', ...wholesalerAuth, wholesalerController.getDashboard);

// Products (always wholesale-only)
router.get('/products', ...wholesalerAuth, catalogController.getWholesaleProducts);
router.get('/products/:id', ...wholesalerAuth, validate(productIdParamSchema, 'params'), productController.getVendorProductById);
router.post('/products', ...wholesalerAuth, validate(createProductSchema), forceWholesaleOnly, productController.createProduct);
router.put('/products/:id', ...wholesalerAuth, validate(productIdParamSchema, 'params'), validate(updateProductSchema), forceWholesaleOnly, productController.updateProduct);
router.delete('/products/:id', ...wholesalerAuth, validate(productIdParamSchema, 'params'), productController.deleteProduct);
router.patch('/products/:id/pricing', ...wholesalerAuth, validate(productIdParamSchema, 'params'), forceWholesaleOnly, catalogController.updateWholesalePricing);
router.patch('/stock/:productId', ...wholesalerAuth, productController.updateStock);

// Brands & categories
router.get('/brands', ...wholesalerAuth, brandController.getVendorBrands);
router.get('/brand-requests', ...wholesalerAuth, brandController.getVendorBrandRequests);
router.post('/brand-requests', ...wholesalerAuth, brandController.requestVendorBrand);
router.put('/brand-requests/:id/resubmit', ...wholesalerAuth, brandController.resubmitVendorBrandRequest);
router.get('/category-requests', ...wholesalerAuth, categoryController.getVendorCategoryRequests);
router.post('/category-requests', ...wholesalerAuth, categoryController.requestVendorCategory);
router.put('/category-requests/:id/resubmit', ...wholesalerAuth, categoryController.resubmitVendorCategoryRequest);

// Orders (B2B only)
router.get('/delivery-partners/available', ...wholesalerAuth, orderController.getAvailableDeliveryPartners);
router.get('/orders', ...wholesalerAuth, forceB2bOrders, orderController.getVendorOrders);
router.get('/orders/:id', ...wholesalerAuth, orderController.getVendorOrderById);
router.post('/orders/:id/shipments/:shipmentId/assign-delivery', ...wholesalerAuth, orderController.assignDeliveryPartner);
router.patch('/orders/:id/shipments/:shipmentId/delivery-method', ...wholesalerAuth, orderController.selectDeliveryMethod);
router.patch('/orders/:id/status', ...wholesalerAuth, orderController.updateOrderStatus);
router.post('/orders/:id/verify-pickup', ...wholesalerAuth, orderController.verifyPickup);

// Returns (same rules as retail)
router.get('/return-requests', ...wholesalerAuth, returnController.getVendorReturnRequests);
router.get('/return-requests/:id', ...wholesalerAuth, returnController.getVendorReturnRequestById);
router.patch('/return-requests/:id/status', ...wholesalerAuth, returnController.updateVendorReturnRequestStatus);
router.post('/return-requests/:id/verify-handoff-otp', ...wholesalerAuth, returnController.verifyHandoffOtp);

// Finance
router.get('/wallet/stats', ...wholesalerAuth, walletController.getWalletStats);
router.get('/wallet/history', ...wholesalerAuth, walletController.getTransactionHistory);
router.post('/wallet/withdraw', ...wholesalerAuth, walletController.requestWithdrawal);
router.get('/earnings', ...wholesalerAuth, orderController.getEarnings);

// Documents
router.get('/documents', ...wholesalerAuth, documentController.getVendorDocuments);
router.post('/documents', ...wholesalerAuth, uploadDocumentSingle('file'), documentController.createVendorDocument);
router.delete('/documents/:id', ...wholesalerAuth, documentController.deleteVendorDocument);

// Notifications
router.get('/notifications', ...wholesalerAuth, notificationController.getVendorNotifications);
router.put('/notifications/:id/read', ...wholesalerAuth, notificationController.markVendorNotificationAsRead);
router.put('/notifications/read-all', ...wholesalerAuth, notificationController.markAllVendorNotificationsAsRead);
router.delete('/notifications/:id', ...wholesalerAuth, notificationController.deleteVendorNotification);

// Support
router.get('/support/ticket-types', ...wholesalerAuth, supportController.getTicketTypes);
router.get('/support/tickets', ...wholesalerAuth, supportController.getMyTickets);
router.post('/support/tickets', ...wholesalerAuth, supportController.createTicket);
router.post('/support/tickets/:id/message', ...wholesalerAuth, supportController.replyToTicket);

// Uploads
router.post('/uploads/image', ...wholesalerAuth, uploadSingle('image'), uploadController.uploadImage);
router.post('/uploads/images', ...wholesalerAuth, uploadMultiple('images', 8), uploadController.uploadImages);

export default router;
