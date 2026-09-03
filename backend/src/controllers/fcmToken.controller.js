import User from '../models/User.model.js';
import Vendor from '../models/Vendor.model.js';
import DeliveryBoy from '../models/DeliveryBoy.model.js';
import Admin from '../models/Admin.model.js';
import { sendPushNotification } from '../services/firebaseAdmin.service.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';

/**
 * Helper to resolve the database document for the authenticated entity
 */
async function resolveAccount(userAuth) {
    if (!userAuth?.id) return null;

    const role = String(userAuth.role || '').toLowerCase();

    if (role === 'customer') {
        const user = await User.findById(userAuth.id);
        if (user) return { doc: user, modelName: 'User', recipientType: 'user' };
    } else if (role === 'vendor') {
        const vendor = await Vendor.findById(userAuth.id);
        if (vendor) return { doc: vendor, modelName: 'Vendor', recipientType: 'vendor' };
    } else if (role === 'delivery') {
        const deliveryBoy = await DeliveryBoy.findById(userAuth.id);
        if (deliveryBoy) return { doc: deliveryBoy, modelName: 'DeliveryBoy', recipientType: 'delivery' };
    } else if (role === 'admin' || role === 'superadmin') {
        const admin = await Admin.findById(userAuth.id);
        if (admin) return { doc: admin, modelName: 'Admin', recipientType: 'admin' };
    }

    // Fallback across all models in case role wasn't accurately set in token payload
    const user = await User.findById(userAuth.id);
    if (user) return { doc: user, modelName: 'User', recipientType: 'user' };

    const vendor = await Vendor.findById(userAuth.id);
    if (vendor) return { doc: vendor, modelName: 'Vendor', recipientType: 'vendor' };

    const deliveryBoy = await DeliveryBoy.findById(userAuth.id);
    if (deliveryBoy) return { doc: deliveryBoy, modelName: 'DeliveryBoy', recipientType: 'delivery' };

    const admin = await Admin.findById(userAuth.id);
    if (admin) return { doc: admin, modelName: 'Admin', recipientType: 'admin' };

    return null;
}

/**
 * @desc    Save/Register FCM Push Token for authenticated user/vendor/delivery/admin
 * @route   POST /api/fcm-tokens/save or POST /api/fcm-tokens/mobile/save
 * @access  Private (Authenticated)
 */
export const saveToken = asyncHandler(async (req, res) => {
    const { token, platform = 'web' } = req.body;

    if (!token || typeof token !== 'string' || token.trim().length < 10) {
        throw new ApiError(400, 'A valid FCM token is required.');
    }

    const cleanToken = token.trim();
    const cleanPlatform = String(platform || 'web').toLowerCase();

    const account = await resolveAccount(req.user);
    if (!account?.doc) {
        throw new ApiError(404, 'User account not found.');
    }

    const doc = account.doc;

    if (cleanPlatform === 'mobile' || cleanPlatform === 'android' || cleanPlatform === 'ios') {
        if (!Array.isArray(doc.fcmTokenMobile)) {
            doc.fcmTokenMobile = [];
        }
        if (!doc.fcmTokenMobile.includes(cleanToken)) {
            doc.fcmTokenMobile.push(cleanToken);
            // Limit to 10 tokens FIFO
            if (doc.fcmTokenMobile.length > 10) {
                doc.fcmTokenMobile = doc.fcmTokenMobile.slice(-10);
            }
        }
    } else {
        if (!Array.isArray(doc.fcmTokens)) {
            doc.fcmTokens = [];
        }
        if (!doc.fcmTokens.includes(cleanToken)) {
            doc.fcmTokens.push(cleanToken);
            // Limit to 10 tokens FIFO
            if (doc.fcmTokens.length > 10) {
                doc.fcmTokens = doc.fcmTokens.slice(-10);
            }
        }
    }

    await doc.save();

    res.status(200).json({
        success: true,
        message: 'FCM token saved',
        data: {
            platform: cleanPlatform,
            tokenCount: cleanPlatform === 'mobile' ? doc.fcmTokenMobile.length : doc.fcmTokens.length,
        },
    });
});

/**
 * @desc    Remove FCM Push Token on logout or device removal
 * @route   DELETE /api/fcm-tokens/remove or POST /api/fcm-tokens/remove
 * @access  Private (Authenticated)
 */
export const removeToken = asyncHandler(async (req, res) => {
    const token = req.body?.token || req.query?.token || req.body?.fcmToken || req.query?.fcmToken;
    const platform = req.body?.platform || req.query?.platform;

    if (!token || typeof token !== 'string') {
        throw new ApiError(400, 'FCM token to remove is required.');
    }

    const cleanToken = token.trim();
    const cleanPlatform = platform ? String(platform).toLowerCase() : null;

    const account = await resolveAccount(req.user);
    if (!account?.doc) {
        throw new ApiError(404, 'User account not found.');
    }

    const doc = account.doc;

    if (!cleanPlatform || cleanPlatform === 'web') {
        if (Array.isArray(doc.fcmTokens)) {
            doc.fcmTokens = doc.fcmTokens.filter(t => t !== cleanToken);
        }
    }

    if (!cleanPlatform || cleanPlatform === 'mobile' || cleanPlatform === 'android' || cleanPlatform === 'ios') {
        if (Array.isArray(doc.fcmTokenMobile)) {
            doc.fcmTokenMobile = doc.fcmTokenMobile.filter(t => t !== cleanToken);
        }
    }

    await doc.save();

    res.status(200).json({
        success: true,
        message: 'FCM token removed',
    });
});

/**
 * @desc    Send test notification to authenticated user
 * @route   POST /api/fcm-tokens/test
 * @access  Private (Authenticated)
 */
export const sendTestNotification = asyncHandler(async (req, res) => {
    const account = await resolveAccount(req.user);
    if (!account?.doc) {
        throw new ApiError(404, 'User account not found.');
    }

    const doc = account.doc;
    const tokens = [...(doc.fcmTokens || []), ...(doc.fcmTokenMobile || [])];
    const uniqueTokens = [...new Set(tokens.filter(Boolean))];

    if (uniqueTokens.length === 0) {
        return res.status(200).json({
            success: false,
            error: 'No FCM tokens found for this account. Please allow push notifications in your browser first.',
        });
    }

    const result = await sendPushNotification(uniqueTokens, {
        title: 'SafeFire Test Notification',
        body: `Test notification sent successfully at ${new Date().toLocaleTimeString()}`,
        data: {
            type: 'test',
            link: '/',
            timestamp: new Date().toISOString(),
        },
    });

    res.status(200).json({
        success: true,
        message: 'Test notification sent',
        result,
    });
});
