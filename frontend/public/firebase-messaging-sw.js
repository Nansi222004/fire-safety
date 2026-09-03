// Firebase Cloud Messaging Service Worker for SafeFire
// Adhering strictly to Push Notifications SOP v2.0

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

        const title = payload.notification?.title || payload.data?.title || 'SafeFire Notification';
        const options = {
            body: payload.notification?.body || payload.data?.body || payload.data?.message || '',
            icon: payload.notification?.icon || payload.data?.icon || '/favicon.ico',
            badge: '/favicon.ico',
            data: payload.data || {},
            tag: payload.data?.notificationId || payload.data?.id || `safefire-${Date.now()}`,
            renotify: true,
        };

        return self.registration.showNotification(title, options);
    });
}

// Fallback standard Web Push event listener
self.addEventListener('push', (event) => {
    if (!event.data) return;

    try {
        const payload = event.data.json();
        const title = payload.notification?.title || payload.data?.title || 'SafeFire Alert';
        const options = {
            body: payload.notification?.body || payload.data?.body || payload.data?.message || '',
            icon: payload.notification?.icon || payload.data?.icon || '/favicon.ico',
            badge: '/favicon.ico',
            data: payload.data || {},
            tag: payload.data?.notificationId || payload.data?.id || `safefire-push-${Date.now()}`,
            renotify: true,
        };

        event.waitUntil(self.registration.showNotification(title, options));
    } catch (err) {
        // Raw text push fallback
        const text = event.data.text();
        event.waitUntil(
            self.registration.showNotification('SafeFire Alert', {
                body: text,
                icon: '/favicon.ico',
            })
        );
    }
});

// Notification click and deep-link routing
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const data = event.notification.data || {};
    const link = data.link || data.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // Check if there is already an open window
            for (const client of clientList) {
                if ('focus' in client) {
                    if (client.url.includes(link) && link !== '/') {
                        return client.focus();
                    }
                }
            }
            if (clientList.length > 0 && 'focus' in clientList[0] && 'navigate' in clientList[0]) {
                const client = clientList[0];
                client.navigate(link);
                return client.focus();
            }
            // Open new window
            if (clients.openWindow) {
                return clients.openWindow(link);
            }
        })
    );
});
