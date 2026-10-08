import { messaging, getToken, onMessage, isConfigValid, firebaseConfig } from '../firebase';
import api from '../shared/utils/api';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

// Register Service Worker dynamically with environment variables
export async function registerServiceWorker() {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
        return null;
    }

    try {
        const query = new URLSearchParams();
        if (firebaseConfig?.apiKey) query.set('apiKey', firebaseConfig.apiKey);
        if (firebaseConfig?.authDomain) query.set('authDomain', firebaseConfig.authDomain);
        if (firebaseConfig?.projectId) query.set('projectId', firebaseConfig.projectId);
        if (firebaseConfig?.storageBucket) query.set('storageBucket', firebaseConfig.storageBucket);
        if (firebaseConfig?.messagingSenderId) query.set('messagingSenderId', firebaseConfig.messagingSenderId);
        if (firebaseConfig?.appId) query.set('appId', firebaseConfig.appId);
        if (firebaseConfig?.measurementId) query.set('measurementId', firebaseConfig.measurementId);

        const queryString = query.toString();
        const swUrl = queryString ? `/firebase-messaging-sw.js?${queryString}` : '/firebase-messaging-sw.js';

        const registration = await navigator.serviceWorker.register(swUrl, {
            scope: '/',
        });
        return registration;
    } catch (error) {
        console.warn('[Push Notification] Service Worker registration failed:', error.message);
        return null;
    }
}

// Request Notification Permission
export async function requestNotificationPermission() {
    if (typeof window === 'undefined' || !('Notification' in window)) {
        return false;
    }

    if (Notification.permission === 'granted') {
        return true;
    }

    if (Notification.permission === 'denied') {
        console.warn('[Push Notification] Notification permission has been denied by user.');
        return false;
    }

    try {
        const permission = await Notification.requestPermission();
        return permission === 'granted';
    } catch (error) {
        console.error('[Push Notification] Error requesting permission:', error.message);
        return false;
    }
}

// Get FCM Token
export async function getFCMToken() {
    if (!messaging || !isConfigValid) {
        return null;
    }

    try {
        const registration = await registerServiceWorker();
        if (!registration) return null;

        await registration.update().catch(() => {});

        const options = {
            serviceWorkerRegistration: registration,
        };

        if (VAPID_KEY) {
            options.vapidKey = VAPID_KEY;
        }

        const token = await getToken(messaging, options);
        if (token) {
            return token;
        }
        return null;
    } catch (error) {
        console.warn('[Push Notification] Error getting FCM token:', error.message);
        return null;
    }
}

// Push tokens must be stored on the account of the portal that registered them.
// Each role has its own endpoint (/api/<role>/fcm-tokens) so the request is authenticated with
// that role's session — the shared /fcm-tokens endpoint fell back to whichever login the browser
// had (usually the customer), so vendor / delivery / admin devices never received pushes.
const PUSH_SCOPES = ['user', 'vendor', 'delivery', 'admin'];
const resolvePushScope = (scope) => {
    if (PUSH_SCOPES.includes(scope)) return scope;
    const path = typeof window !== 'undefined' ? window.location.pathname : '/';
    if (path.startsWith('/vendor')) return 'vendor';
    if (path.startsWith('/delivery')) return 'delivery';
    if (path.startsWith('/admin')) return 'admin';
    return 'user';
};
const tokenCacheKey = (scope) => `fcm_token_web_${scope}`;

// Register FCM Token with Backend (SOP Step 5)
export async function registerFCMToken(forceUpdate = false, scope) {
    const pushScope = resolvePushScope(scope);
    try {
        const savedToken = localStorage.getItem(tokenCacheKey(pushScope));
        if (savedToken && !forceUpdate) {
            return savedToken;
        }

        const hasPermission = await requestNotificationPermission();
        if (!hasPermission) {
            return null;
        }

        const token = await getFCMToken();
        if (!token) {
            return null;
        }

        // Save token to backend
        try {
            await api.post(`/${pushScope}/fcm-tokens/save`, {
                token: token,
                platform: 'web',
            });
            localStorage.setItem(tokenCacheKey(pushScope), token);
            console.log('✅ [Push Notification] FCM token registered with SafeFire backend');
            return token;
        } catch (apiErr) {
            console.warn('[Push Notification] Failed to save token with backend:', apiErr.message);
            return token;
        }
    } catch (error) {
        console.warn('[Push Notification] Error registering FCM token:', error.message);
        return null;
    }
}

// Remove FCM Token on Logout (SOP Step 5)
export async function removeFCMToken(scope) {
    const pushScope = resolvePushScope(scope);
    try {
        const token = localStorage.getItem(tokenCacheKey(pushScope));
        if (!token) return;

        try {
            await api.post(`/${pushScope}/fcm-tokens/remove`, {
                token: token,
                platform: 'web',
            });
        } catch {
            // Ignore API error on logout token cleanup
        }

        localStorage.removeItem(tokenCacheKey(pushScope));
        console.log('[Push Notification] FCM token removed locally');
    } catch (error) {
        console.warn('[Push Notification] Error removing FCM token:', error.message);
    }
}

// Setup Foreground Notification Handler (SOP Step 5)
export function setupForegroundNotificationHandler(customHandler) {
    if (!messaging) return;

    try {
        onMessage(messaging, (payload) => {
            console.log('📬 [Push Notification] Foreground message received:', payload);

            const title = payload.notification?.title || payload.data?.title || 'SafeFire Notification';
            const body = payload.notification?.body || payload.data?.body || payload.data?.message || '';

            // If user has granted permission and window is active, show native browser notification if desired
            if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
                try {
                    new Notification(title, {
                        body: body,
                        icon: payload.notification?.icon || payload.data?.icon || '/favicon.ico',
                        data: payload.data,
                    });
                } catch {
                    // Native notification display fallback
                }
            }

            if (typeof customHandler === 'function') {
                customHandler(payload);
            }
        });
    } catch (err) {
        console.warn('[Push Notification] setupForegroundNotificationHandler error:', err.message);
    }
}

// Initialize Push Notifications on App Mount
export async function initializePushNotifications() {
    try {
        await registerServiceWorker();
    } catch (error) {
        console.warn('[Push Notification] initializePushNotifications error:', error.message);
    }
}

export default {
    registerServiceWorker,
    requestNotificationPermission,
    getFCMToken,
    registerFCMToken,
    removeFCMToken,
    setupForegroundNotificationHandler,
    initializePushNotifications,
};
