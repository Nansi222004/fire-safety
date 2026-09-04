import express from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import {
    purchase,
    verifyPayment,
    redeem,
    getMyCards,
    getSummary,
    getAdminCards,
    getAdminSummary,
    getAdminCardDetails,
    cancelCard,
} from '../controllers/giftCard.controller.js';

const router = express.Router();

// ─── Customer Endpoints (Authenticated) ──────────────────────────────────────────
router.post('/purchase', authenticate, purchase);
router.post('/verify-payment', authenticate, verifyPayment);
router.post('/redeem', authenticate, redeem);
router.get('/my-cards', authenticate, getMyCards);
router.get('/summary', authenticate, getSummary);
router.get('/', authenticate, getMyCards);

// ─── Admin Endpoints (Authenticated Admin) ───────────────────────────────────────
export const adminGiftCardRouter = express.Router();
adminGiftCardRouter.use(authenticate, authorize('admin'));

// Specific / Static routes MUST come before parameterized /:id routes (BUG-01)
adminGiftCardRouter.get('/summary', getAdminSummary);
adminGiftCardRouter.get('/', getAdminCards);
adminGiftCardRouter.get('/:id', getAdminCardDetails);

// Support both POST and PATCH for Admin Cancellation (BUG-02)
adminGiftCardRouter.post('/:id/cancel', cancelCard);
adminGiftCardRouter.patch('/:id/cancel', cancelCard);

export default router;
