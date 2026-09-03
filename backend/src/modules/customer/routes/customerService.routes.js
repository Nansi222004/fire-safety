import { Router } from 'express';
import {
    getServiceCatalog,
    getServiceBySlug,
    checkServiceability,
    createBooking,
    getCustomerBookings,
    getBookingById,
    cancelBooking,
} from '../controllers/customerService.controller.js';
import { authenticate } from '../../../middlewares/authenticate.js';

const router = Router();

// Public routes
router.get('/services/catalog', getServiceCatalog);
router.get('/services/detail/:slug', getServiceBySlug);
router.post('/services/check-serviceability', checkServiceability);

// Authenticated Customer routes
router.post('/bookings', authenticate, createBooking);
router.get('/bookings', authenticate, getCustomerBookings);
router.get('/bookings/:id', authenticate, getBookingById);
router.patch('/bookings/:id/cancel', authenticate, cancelBooking);

export default router;
