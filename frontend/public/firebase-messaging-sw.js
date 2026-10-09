// Firebase Cloud Messaging Service Worker for SafeFire
// Adhering strictly to Push Notifications SOP v2.0

// Notification click and deep-link routing.
// Registered before the Firebase SDK loads so it runs first for every notification,
// including ones the SDK displays itself (their payload is nested under FCM_MSG).
const resolveNotificationLink = (data = {}) =>
    data.deepLink ||
    data.link ||
    data.url ||
    data.FCM_MSG?.data?.deepLink ||
    data.FCM_MSG?.data?.link ||
    data.FCM_MSG?.data?.url ||
    data.FCM_MSG?.fcmOptions?.link ||
    (() => {
        const orderId = data.orderId || data.orderMongoId || data.FCM_MSG?.data?.orderId || data.FCM_MSG?.data?.orderMongoId;
        const role = data.recipientRole || data.role || data.FCM_MSG?.data?.recipientRole || data.FCM_MSG?.data?.role;
        if (orderId) {
            if (role === 'vendor') return `/vendor/orders/${orderId}`;
            if (role === 'delivery' || role === 'deliveryPartner') return `/delivery/orders/${orderId}`;
            return `/orders/${orderId}`;
        }
        return '/';
    })();

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.stopImmediatePropagation();

    const link = resolveNotificationLink(event.notification.data || {});

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if ('focus' in client && client.url.includes(link) && link !== '/') {
                    return client.focus();
                }
            }
            if (clientList.length > 0 && 'focus' in clientList[0] && 'navigate' in clientList[0]) {
                const client = clientList[0];
                return client.navigate(link).then(() => client.focus());
            }
            if (clients.openWindow) {
                return clients.openWindow(link);
            }
        })
    );
});

importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

// Dynamically parse Firebase configuration passed from registration URL (100% env-driven)
const swLocation = new URL(self.location.href);
const firebaseConfig = {
    apiKey: swLocation.searchParams.get('apiKey') || '',
    authDomain: swLocation.searchParams.get('authDomain') || '',
    projectId: swLocation.searchParams.get('projectId') || '',
    storageBucket: swLocation.searchParams.get('storageBucket') || '',
    messagingSenderId: swLocation.searchParams.get('messagingSenderId') || '',
    appId: swLocation.searchParams.get('appId') || '',
    measurementId: swLocation.searchParams.get('measurementId') || '',
};

// Initialize Firebase compat SDK if dynamic credentials exist
if (firebase.apps.length === 0 && firebaseConfig.apiKey && firebaseConfig.projectId) {
    try {
        firebase.initializeApp(firebaseConfig);
    } catch (e) {
        console.warn('[firebase-messaging-sw] Firebase init warning:', e.message);
    }
}

let messaging = null;
try {
    if (firebase.messaging.isSupported()) {
        messaging = firebase.messaging();
    }
} catch (e) {
    console.warn('[firebase-messaging-sw] Messaging unsupported:', e.message);
}

// Background push notification handler
if (messaging) {
    messaging.onBackgroundMessage((payload) => {
        console.log('[firebase-messaging-sw.js] Received background message:', payload);

        // Messages with a "notification" block are displayed automatically by the Firebase SDK.
        // Showing them here as well produced a duplicate notification for every push.
        if (payload.notification) return undefined;

        const title = payload.notification?.title || payload.data?.title || 'SafeFire Notification';
        const options = {
            body: payload.notification?.body || payload.data?.body || payload.data?.message || '',
            icon: payload.notification?.icon || payload.data?.icon || '/favicon.ico',
            badge: '/favicon.ico',
            data: payload.data || {},
            tag: payload.data?.eventKey || payload.data?.notificationId || payload.data?.id || `safefire-bg-${Date.now()}`,
            renotify: false,
        };

        return self.registration.showNotification(title, options);
    });
}

// Fallback standard Web Push event listener
self.addEventListener('push', (event) => {
    if (!event.data) return;

    try {
        const payload = event.data.json();
        const isFcmMessage = Boolean(payload.fcmMessageId || payload.from || payload.notification || payload.data?.notificationId);
        if (messaging && isFcmMessage) return;
        const title = payload.notification?.title || payload.data?.title || 'SafeFire Alert';
        const options = {
            body: payload.notification?.body || payload.data?.body || payload.data?.message || '',
            icon: payload.notification?.icon || payload.data?.icon || '/favicon.ico',
            badge: '/favicon.ico',
            data: payload.data || {},
            tag: payload.data?.eventKey || payload.data?.notificationId || payload.data?.id || `safefire-push-${Date.now()}`,
            renotify: false,
        };

        event.waitUntil(self.registration.showNotification(title, options));
    } catch (err) {
        // Raw text push fallback (only when the Firebase SDK is not handling pushes)
        if (messaging) return;
        const text = event.data.text();
        event.waitUntil(
            self.registration.showNotification('SafeFire Alert', {
                body: text,
                icon: '/favicon.ico',
            })
        );
    }
});
