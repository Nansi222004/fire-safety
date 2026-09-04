import express from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import {
    saveToken,
    removeToken,
    sendTestNotification,
    sendBroadcastNotification,
} from '../controllers/fcmToken.controller.js';

const router = express.Router();

// All FCM token operations require authentication
router.use(authenticate);

// Web token registration
router.post('/save', saveToken);
router.post('/web/save', saveToken);

// Mobile token registration
router.post('/mobile/save', (req, res, next) => {
    req.body.platform = 'mobile';
    return saveToken(req, res, next);
});

// Token removal
router.delete('/remove', removeToken);
router.post('/remove', removeToken);

// Test notification for authenticated user
router.post('/test', sendTestNotification);

// Broadcast push notification to target audience (admin / auth)
router.post('/broadcast', sendBroadcastNotification);

export default router;

