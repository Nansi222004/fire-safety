import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

let app = null;
let messaging = null;
let isPushSupported = false;

const isConfigValid = Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.messagingSenderId &&
    firebaseConfig.appId
);

if (typeof window !== 'undefined' && isConfigValid) {
    try {
        app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

        // Check if messaging is supported in current browser environment
        isSupported().then((supported) => {
            if (supported) {
                try {
                    messaging = getMessaging(app);
                    isPushSupported = true;
                } catch (err) {
                    console.warn('[Firebase Client] getMessaging failed:', err.message);
                }
            } else {
                console.warn('[Firebase Client] Firebase Messaging is not supported in this browser.');
            }
        }).catch((err) => {
            console.warn('[Firebase Client] isSupported check failed:', err.message);
        });
    } catch (err) {
        console.warn('[Firebase Client] Firebase initialization error:', err.message);
    }
} else if (typeof window !== 'undefined') {
    console.info('[Firebase Client] Firebase config not detected. Push notifications will run in silent standby.');
}

export { app, messaging, getToken, onMessage, isPushSupported, isConfigValid, firebaseConfig };
export default app;
