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
} from '../controllers/customerService.controller.js';
import { authenticate } from '../../../middlewares/authenticate.js';

const router = Router();

// Public routes
router.get('/services/catalog', getServiceCatalog);
router.get('/services/detail/:slug', getServiceBySlug);
router.post('/services/check-serviceability', checkServiceability);
router.get('/services/:slug/reviews', getServiceReviews);

// Authenticated Customer routes
router.post('/bookings', authenticate, createBooking);
router.post('/bookings/verify-payment', authenticate, verifyServicePayment);
router.get('/bookings', authenticate, getCustomerBookings);
router.get('/bookings/:id', authenticate, getBookingById);
router.patch('/bookings/:id/cancel', authenticate, cancelBooking);
router.post('/bookings/:id/review', authenticate, addServiceReview);

export default router;
