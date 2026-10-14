import { Router } from 'express';
import {
    getServiceCatalog,
    getServiceBySlug,
    checkServiceability,
    createBooking,
    verifyServicePayment,
    getCustomerBookings,
    getBookingById,
    cancelBooking,
    addServiceReview,
    getServiceReviews,
    getServiceQuote,
    getServiceSchedule,
} from '../controllers/customerService.controller.js';
import { authenticate } from '../../../middlewares/authenticate.js';
import { authorize, enforceAccountStatus } from '../../../middlewares/authorize.js';

const router = Router();

// Public routes
router.get('/services/catalog', getServiceCatalog);
router.get('/services/detail/:slug', getServiceBySlug);
router.post('/services/check-serviceability', checkServiceability);
router.post('/services/quote', getServiceQuote);
router.get('/services/schedule', getServiceSchedule);
router.get('/services/:slug/reviews', getServiceReviews);

// Authenticated Customer routes (customer accounts only; blocked/unverified accounts are rejected)
const customerAuth = [authenticate, authorize('customer'), enforceAccountStatus];
router.post('/bookings', ...customerAuth, createBooking);
router.post('/bookings/verify-payment', ...customerAuth, verifyServicePayment);
router.get('/bookings', ...customerAuth, getCustomerBookings);
router.get('/bookings/:id', ...customerAuth, getBookingById);
router.patch('/bookings/:id/cancel', ...customerAuth, cancelBooking);
router.post('/bookings/:id/review', ...customerAuth, addServiceReview);

export default router;
