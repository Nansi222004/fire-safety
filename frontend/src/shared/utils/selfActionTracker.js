/**
 * Utility to track self-initiated user actions in the current browser session.
 * Used to suppress redundant socket echoes for actions that already display
 * an immediate action-success toast.
 */

const recentActions = new Map();
const seenNotifications = new Map();
const ACTION_TTL_MS = 15000; // 15 seconds window for self-actions
const DEDUP_TTL_MS = 60000; // 60 seconds window for notification deduplication

/**
 * Clean up expired action records
 */
const pruneExpiredActions = () => {
    const now = Date.now();
    for (const [key, record] of recentActions.entries()) {
        if (now - record.timestamp > ACTION_TTL_MS) {
            recentActions.delete(key);
        }
    }
    for (const [key, timestamp] of seenNotifications.entries()) {
        if (now - timestamp > DEDUP_TTL_MS) {
            seenNotifications.delete(key);
        }
    }
};

/**
 * Record a self-initiated action before/during the API call.
 * @param {Object} actionInfo
 * @param {string} actionInfo.type - e.g. 'order_status_update'
 * @param {string} [actionInfo.orderId] - Mongo ID or human order ID
 * @param {string} [actionInfo.humanOrderId] - Human readable order ID
 * @param {string} [actionInfo.status] - e.g. 'shipped'
 * @returns {string} actionKey - Key used to cancel/clear if request fails
 */
export const recordSelfAction = ({ type, orderId, humanOrderId, status }) => {
    pruneExpiredActions();
    const timestamp = Date.now();
    const normalizedStatus = String(status || '').toLowerCase().trim();
    const actionKey = `${type}_${orderId || ''}_${normalizedStatus}_${timestamp}`;

    const record = {
        type,
        orderId: orderId ? String(orderId).toLowerCase().trim() : null,
        humanOrderId: humanOrderId ? String(humanOrderId).toLowerCase().trim() : null,
        status: normalizedStatus,
        timestamp,
    };

    recentActions.set(actionKey, record);
    return actionKey;
};

/**
 * Cancel a recorded action if the API call failed
 * @param {string} actionKey
 */
export const cancelSelfAction = (actionKey) => {
    if (actionKey) {
        recentActions.delete(actionKey);
    }
};

/**
 * Check if an incoming notification is a duplicate (already seen/processed).
 * Handles missing IDs safely with a deterministic composite key.
 * @param {Object} notif
 * @returns {boolean} true if notification was already seen within the deduplication window
 */
export const isDuplicateNotification = (notif) => {
    if (!notif) return false;
    pruneExpiredActions();

    const notifId = notif._id || notif.id;
    const dedupKey = notifId
        ? String(notifId)
        : `${String(notif.title || '')}_${String(notif.message || '')}_${notif.createdAt || ''}`;

    if (seenNotifications.has(dedupKey)) {
        return true;
    }

    seenNotifications.set(dedupKey, Date.now());
    return false;
};

/**
 * Check if an incoming notification corresponds to a recently self-initiated action.
 * @param {Object} notif - The notification object
 * @returns {boolean} true if this notification was triggered by this client session's action
 */
export const isSelfInitiatedNotification = (notif) => {
    if (!notif) return false;
    pruneExpiredActions();

    const notifType = String(notif.type || '').toLowerCase();
    const notifTitle = String(notif.title || '').toLowerCase();

    // Support Map instances or plain objects for notif.data
    const notifData = notif.data instanceof Map
        ? Object.fromEntries(notif.data)
        : (notif.data || {});

    // Only inspect order status update notifications
    const isOrderStatusNotif =
        notifData.action === 'vendor_order_status_update' ||
        notifTitle.includes('order status updated') ||
        (notifType === 'order' && notifTitle.includes('status updated'));

    if (!isOrderStatusNotif) {
        return false;
    }

    const notifOrderId = String(notifData.orderId || notifData.mongoOrderId || '').toLowerCase().trim();
    const notifStatus = String(notifData.status || '').toLowerCase().trim();

    const now = Date.now();
    for (const [, record] of recentActions.entries()) {
        if (now - record.timestamp > ACTION_TTL_MS) continue;

        if (record.type === 'order_status_update') {
            const statusMatch = !record.status || !notifStatus || record.status === notifStatus;
            const orderMatch =
                (record.orderId && (record.orderId === notifOrderId || (notifOrderId && notifOrderId.includes(record.orderId)))) ||
                (record.humanOrderId && (record.humanOrderId === notifOrderId || (notifOrderId && notifOrderId.includes(record.humanOrderId))));

            if (statusMatch && orderMatch) {
                return true;
            }
        }
    }

    return false;
};
