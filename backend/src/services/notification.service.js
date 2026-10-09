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

// In-memory cache for recent push dispatches to guarantee zero concurrent duplicates
const pushDedupeCache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

setInterval(() => {
    const now = Date.now();
    for (const [key, timestamp] of pushDedupeCache.entries()) {
        if (now - timestamp > CACHE_TTL_MS) {
            pushDedupeCache.delete(key);
        }
    }
}, 5 * 60 * 1000);

/**
 * Build canonical role-specific deep link for order and delivery entities
 */
export function buildCanonicalDeepLink(recipientType, data = {}) {
    if (data.deepLink) return data.deepLink;
    if (data.link) return data.link;
    if (data.url) return data.url;

    const ord = data.orderId || data.orderNumber || data.mongoOrderId || data.entityId;
    const type = String(recipientType || 'user').toLowerCase();

    if (ord) {
        if (type === 'vendor') {
            return `/vendor/orders/${ord}`;
        }
        if (type === 'delivery' || type === 'deliveryboy') {
            return `/delivery/orders/${ord}`;
        }
        if (type === 'admin') {
            return `/admin/orders/${ord}`;
        }
        return `/orders/${ord}`;
    }

    if (data.shipmentId) {
        if (type === 'delivery' || type === 'deliveryboy') {
            return `/delivery/orders/${data.shipmentId}`;
        }
        if (type === 'vendor') {
            return `/vendor/orders/${data.shipmentId}`;
        }
    }

    return '/';
}

/**
 * Derive deterministic business event key if not explicitly passed
 */
export function deriveEventKey(recipientType, recipientId, data = {}, title = '', type = 'system') {
    if (data.eventKey) return String(data.eventKey).trim();

    const ord = data.orderId || data.orderNumber || data.mongoOrderId || data.entityId;
    const rType = String(recipientType || 'user').toLowerCase();
    const rId = String(recipientId || '');

    if (ord) {
        if (data.status) {
            return `order:${ord}:status:${String(data.status).toLowerCase()}:${rType}${rType === 'vendor' ? `:${rId}` : ''}`;
        }
        const lowerTitle = String(title || '').toLowerCase();
        if (lowerTitle.includes('placed') || lowerTitle.includes('confirmed')) {
            return `order:${ord}:placed:${rType}${rType === 'vendor' ? `:${rId}` : ''}`;
        }
        if (lowerTitle.includes('received')) {
            return `order:${ord}:vendor_received:${rId}`;
        }
        if (lowerTitle.includes('delivered')) {
            return `order:${ord}:status:delivered:${rType}${rType === 'vendor' ? `:${rId}` : ''}`;
        }
        if (lowerTitle.includes('cancel')) {
            return `order:${ord}:status:cancelled:${rType}${rType === 'vendor' ? `:${rId}` : ''}`;
        }
        if (lowerTitle.includes('otp')) {
            return `order:${ord}:delivery_otp:${rType}`;
        }
    }

    if (data.shipmentId) {
        const shp = String(data.shipmentId);
        const lowerTitle = String(title || '').toLowerCase();
        if (lowerTitle.includes('assign') || lowerTitle.includes('offer')) {
            return `shipment:${shp}:delivery_assigned:${rId}`;
        }
        if (lowerTitle.includes('cancel')) {
            return `shipment:${shp}:cancelled:${rId}`;
        }
    }

    if (data.returnRequestId) {
        return `return:${data.returnRequestId}:${data.status || 'update'}:${rType}`;
    }

    return null;
}

/**
 * Create a notification for a user/vendor/delivery/admin, emit via Socket.IO, and dispatch FCM push
 *
 * Supports both object signature:
 * createNotification({ recipientId, recipientType, title, message, type, eventKey, data })
 * and legacy positional signature:
 * createNotification(recipientId, recipientType, title, message, data)
 *
 * @param {Object|string} optionsOrRecipientId
 * @returns {Promise<Object>} The created or deduplicated notification document
 */
export const createNotification = async (optionsOrRecipientId, ...rest) => {
    let recipientId, recipientType, title, message, type = 'system', data = {}, eventKey = null;

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
            eventKey = null,
            data = {},
        } = optionsOrRecipientId);
    } else {
        recipientId = optionsOrRecipientId;
        recipientType = rest[0] || 'user';
        title = rest[1] || '';
        message = rest[2] || '';
        data = rest[3] || {};
        type = data?.type || 'system';
        eventKey = data?.eventKey || null;
    }

    const normalizedRecipientType = String(recipientType || 'user').toLowerCase();

    // 0. Compute deterministic eventKey and canonical deep link
    const effectiveEventKey = eventKey || deriveEventKey(normalizedRecipientType, recipientId, data, title, type);
    const deepLink = buildCanonicalDeepLink(normalizedRecipientType, data);

    const enrichedData = {
        ...(typeof data === 'object' ? data : {}),
        deepLink,
        link: deepLink,
        recipientRole: normalizedRecipientType,
        ...(effectiveEventKey ? { eventKey: effectiveEventKey } : {}),
    };

    // 1. Idempotency Check: Prevent duplicate database notification and push dispatch
    if (effectiveEventKey) {
        const existing = await Notification.findOne({
            recipientId,
            recipientType: normalizedRecipientType,
            eventKey: effectiveEventKey,
        });

        if (existing) {
            console.log(`[Notification Service] Duplicate notification suppressed for ${normalizedRecipientType} ${recipientId} [eventKey: ${effectiveEventKey}]`);
            return existing;
        }

        const dedupePushKey = `${normalizedRecipientType}:${recipientId}:${effectiveEventKey}`;
        if (pushDedupeCache.has(dedupePushKey)) {
            console.log(`[Notification Service] In-flight duplicate push suppressed for ${dedupePushKey}`);
            const fresh = await Notification.findOne({
                recipientId,
                recipientType: normalizedRecipientType,
                eventKey: effectiveEventKey,
            });
            return fresh || existing;
        }
        pushDedupeCache.set(dedupePushKey, Date.now());
    }

    // 2. Create DB Notification Record with duplicate key handling
    let notification;
    try {
        notification = await Notification.create({
            recipientId,
            recipientType: normalizedRecipientType,
            title,
            message,
            type,
            eventKey: effectiveEventKey,
            data: enrichedData,
        });
    } catch (dbErr) {
        if (dbErr.code === 11000 && effectiveEventKey) {
            console.log(`[Notification Service] Duplicate key caught concurrently for ${effectiveEventKey}. Returning existing.`);
            const existing = await Notification.findOne({
                recipientId,
                recipientType: normalizedRecipientType,
                eventKey: effectiveEventKey,
            });
            return existing;
        }
        throw dbErr;
    }

    // 3. Real-time WebSocket Broadcast (Canonical event: 'new_notification')
    try {
        const room = `${normalizedRecipientType}_${recipientId}`;
        const notificationPlain = notification.toObject
            ? notification.toObject({ virtuals: false })
            : { ...notification };
        if (notificationPlain.data instanceof Map) {
            notificationPlain.data = Object.fromEntries(notificationPlain.data);
        } else if (notificationPlain.data && typeof notificationPlain.data === 'object') {
            notificationPlain.data = { ...notificationPlain.data };
        }
        emitToRoom(room, 'new_notification', notificationPlain);
    } catch (socketErr) {
        console.error('[Notification Service] Socket emit error:', socketErr.message);
    }

    // 4. Dispatch Firebase Cloud Messaging (FCM) Push Notification (Fire-and-forget, non-blocking)
    (async () => {
        try {
            const Model = getModelByRecipientType(normalizedRecipientType);
            const recipientDoc = await Model.findById(recipientId).select('fcmTokens fcmTokenMobile').lean();

            if (!recipientDoc) return;

            // Deduplicate all tokens for this recipient
            const tokens = [
                ...new Set(
                    [
                        ...(recipientDoc.fcmTokens || []),
                        ...(recipientDoc.fcmTokenMobile || []),
                    ].filter((t) => typeof t === 'string' && t.trim().length > 0)
                ),
            ];

            if (tokens.length === 0) return;

            // Merge data with complete metadata and deep link
            const pushData = {
                ...enrichedData,
                type: String(type || 'system'),
                notificationId: String(notification._id),
                recipientType: normalizedRecipientType,
                recipientRole: normalizedRecipientType,
                deepLink,
                link: deepLink,
                ...(effectiveEventKey ? { eventKey: effectiveEventKey } : {}),
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
