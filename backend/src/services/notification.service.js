import Notification from '../models/Notification.model.js';
import User from '../models/User.model.js';
import Vendor from '../models/Vendor.model.js';
import DeliveryBoy from '../models/DeliveryBoy.model.js';
import Admin from '../models/Admin.model.js';
import { emitToRoom } from './socket.service.js';
import { sendPushNotification } from './firebaseAdmin.service.js';

/**
 * Resolve model by recipientType
 */
function getModelByRecipientType(recipientType) {
    const type = String(recipientType || '').toLowerCase();
    switch (type) {
        case 'user':
        case 'customer':
            return User;
        case 'vendor':
            return Vendor;
        case 'delivery':
        case 'deliveryboy':
            return DeliveryBoy;
        case 'admin':
        case 'superadmin':
            return Admin;
        default:
            return User;
    }
}

/**
 * Clean up invalid/expired FCM tokens from recipient model
 */
async function pruneInvalidTokens(Model, recipientId, invalidTokens = []) {
    if (!Model || !recipientId || !Array.isArray(invalidTokens) || invalidTokens.length === 0) return;

    try {
        await Model.updateOne(
            { _id: recipientId },
            {
                $pull: {
                    fcmTokens: { $in: invalidTokens },
                    fcmTokenMobile: { $in: invalidTokens },
                },
            }
        );
        console.log(`[Notification Service] Pruned ${invalidTokens.length} stale FCM token(s) for ${Model.modelName} ${recipientId}`);
    } catch (err) {
        console.error('[Notification Service] Error pruning invalid FCM tokens:', err.message);
    }
}

/**
 * Create a notification for a user/vendor/delivery/admin, emit via Socket.IO, and dispatch FCM push
 *
 * Supports both object signature:
 * createNotification({ recipientId, recipientType, title, message, type, data })
 * and legacy positional signature:
 * createNotification(recipientId, recipientType, title, message, data)
 *
 * @param {Object|string} optionsOrRecipientId
 * @returns {Promise<Object>} The created notification document
 */
export const createNotification = async (optionsOrRecipientId, ...rest) => {
    let recipientId, recipientType, title, message, type = 'system', data = {};

    if (
        typeof optionsOrRecipientId === 'object' &&
        optionsOrRecipientId !== null &&
        !Array.isArray(optionsOrRecipientId) &&
        ('recipientId' in optionsOrRecipientId || 'title' in optionsOrRecipientId)
    ) {
        ({
            recipientId,
            recipientType = 'user',
            title,
            message,
            type = 'system',
            data = {},
        } = optionsOrRecipientId);
    } else {
        recipientId = optionsOrRecipientId;
        recipientType = rest[0] || 'user';
        title = rest[1] || '';
        message = rest[2] || '';
        data = rest[3] || {};
        type = data?.type || 'system';
    }

    const normalizedRecipientType = String(recipientType || 'user').toLowerCase();

    // 1. Create DB Notification Record
    const notification = await Notification.create({
        recipientId,
        recipientType: normalizedRecipientType,
        title,
        message,
        type,
        data,
    });

    // 2. Real-time WebSocket Broadcast (Preserve existing socket behavior)
    try {
        const room = `${normalizedRecipientType}_${recipientId}`;
        emitToRoom(room, 'notification', notification);
        emitToRoom(room, 'new_notification', notification);
    } catch (socketErr) {
        console.error('[Notification Service] Socket emit error:', socketErr.message);
    }

    // 3. Dispatch Firebase Cloud Messaging (FCM) Push Notification (Fire-and-forget, non-blocking)
    (async () => {
        try {
            const Model = getModelByRecipientType(normalizedRecipientType);
            const recipientDoc = await Model.findById(recipientId).select('fcmTokens fcmTokenMobile').lean();

            if (!recipientDoc) return;

            const tokens = [
                ...(recipientDoc.fcmTokens || []),
                ...(recipientDoc.fcmTokenMobile || []),
            ].filter(Boolean);

            if (tokens.length === 0) return;

            // Merge data with notification metadata and deep link if available
            const pushData = {
                ...(typeof data === 'object' ? data : {}),
                type: String(type || 'system'),
                notificationId: String(notification._id),
                recipientType: normalizedRecipientType,
            };

            const pushResult = await sendPushNotification(tokens, {
                title,
                body: message,
                data: pushData,
            });

            // Automatically clean up invalid/unregistered tokens
            if (pushResult?.invalidTokens?.length > 0) {
                await pruneInvalidTokens(Model, recipientId, pushResult.invalidTokens);
            }
        } catch (pushErr) {
            console.error('[Notification Service] Push dispatch error:', pushErr.message);
        }
    })();

    return notification;
};

/**
 * Send push notification directly to a user (SOP Helper Function)
 */
export const sendNotificationToUser = async (userId, payload, includeMobile = true) => {
    try {
        const user = await User.findById(userId).select('fcmTokens fcmTokenMobile').lean();
        if (!user) return;

        let tokens = [...(user.fcmTokens || [])];
        if (includeMobile && user.fcmTokenMobile) {
            tokens = [...tokens, ...user.fcmTokenMobile];
        }

        const uniqueTokens = [...new Set(tokens.filter(Boolean))];
        if (uniqueTokens.length === 0) return;

        const pushResult = await sendPushNotification(uniqueTokens, payload);
        if (pushResult?.invalidTokens?.length > 0) {
            await pruneInvalidTokens(User, userId, pushResult.invalidTokens);
        }
        return pushResult;
    } catch (error) {
        console.error('[Notification Service] Error sending notification to user:', error.message);
    }
};

/**
 * Get unread notifications for a recipient
 */
export const getUnreadNotifications = async (recipientId, recipientType) => {
    return Notification.find({ recipientId, recipientType, isRead: false })
        .sort({ createdAt: -1 })
        .limit(20);
};

/**
 * Mark all notifications as read for a recipient
 */
export const markAllAsRead = async (recipientId, recipientType) => {
    return Notification.updateMany({ recipientId, recipientType, isRead: false }, { isRead: true });
};

export default {
    createNotification,
    sendNotificationToUser,
    getUnreadNotifications,
    markAllAsRead,
};
