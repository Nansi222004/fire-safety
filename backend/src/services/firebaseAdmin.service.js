import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

let isFirebaseInitialized = false;
let isMockMode = false;
let firebaseApp = null;
let messagingInstance = null;

/**
 * Safely initialize Firebase Admin SDK
 */
function initFirebase() {
    if (getApps().length > 0) {
        firebaseApp = getApps()[0];
        messagingInstance = getMessaging(firebaseApp);
        isFirebaseInitialized = true;
        return;
    }

    try {
        let credential = null;

        // 1. Direct JSON string from environment variable (Production Recommended)
        if (process.env.FIREBASE_CONFIG) {
            let configStr = process.env.FIREBASE_CONFIG.trim();
            if ((configStr.startsWith("'") && configStr.endsWith("'")) || (configStr.startsWith('"') && configStr.endsWith('"'))) {
                configStr = configStr.slice(1, -1);
            }
            // Handle Base64 encoded JSON if provided
            if (!configStr.startsWith('{') && !configStr.startsWith('[')) {
                try {
                    configStr = Buffer.from(configStr, 'base64').toString('utf8');
                } catch {
                    // fallback to raw string
                }
            }
            const serviceAccount = JSON.parse(configStr);
            credential = cert(serviceAccount);
        }
        // 2. Service account JSON file path
        else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
            const resolvedPath = path.resolve(process.cwd(), process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
            if (fs.existsSync(resolvedPath)) {
                const fileContent = fs.readFileSync(resolvedPath, 'utf8');
                const serviceAccount = JSON.parse(fileContent);
                credential = cert(serviceAccount);
            } else {
                console.warn(`[Firebase Admin] Service account file not found at: ${resolvedPath}`);
            }
        }
        // 3. Individual Environment Variables
        else if (
            process.env.FIREBASE_PROJECT_ID &&
            process.env.FIREBASE_CLIENT_EMAIL &&
            process.env.FIREBASE_PRIVATE_KEY
        ) {
            const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
            credential = cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: privateKey,
            });
        }
        // 4. Default standard file path fallback if exists
        else {
            const defaultPath = path.resolve(process.cwd(), 'config/firebase-service-account.json');
            if (fs.existsSync(defaultPath)) {
                const fileContent = fs.readFileSync(defaultPath, 'utf8');
                const serviceAccount = JSON.parse(fileContent);
                credential = cert(serviceAccount);
            }
        }

        if (credential) {
            firebaseApp = initializeApp({ credential });
            messagingInstance = getMessaging(firebaseApp);
            isFirebaseInitialized = true;
            console.log('✅ [Firebase Admin] Initialized successfully with credentials');
        } else {
            isMockMode = true;
            console.warn('⚠️ [Firebase Admin] No valid credentials found. Running in simulated mock mode.');
        }
    } catch (err) {
        isMockMode = true;
        console.error('❌ [Firebase Admin] Initialization failed:', err.message);
    }
}

// Initialize on module load
initFirebase();

/**
 * Format string-only data map for FCM data payload
 */
function sanitizeDataPayload(data = {}) {
    const sanitized = {};
    if (!data || typeof data !== 'object') return sanitized;

    for (const [key, value] of Object.entries(data)) {
        if (value !== undefined && value !== null) {
            if (typeof value === 'object') {
                sanitized[String(key)] = JSON.stringify(value);
            } else {
                sanitized[String(key)] = String(value);
            }
        }
    }
    return sanitized;
}

/**
 * Send push notification to multiple tokens using Firebase Admin sendEachForMulticast
 *
 * @param {string[]} tokens - Array of FCM registration tokens
 * @param {Object} payload - Notification payload { title, body, data, icon }
 * @returns {Promise<{ successCount: number, failureCount: number, invalidTokens: string[], responses: Array }>}
 */
export async function sendPushNotification(tokens = [], payload = {}) {
    try {
        if (!Array.isArray(tokens) || tokens.length === 0) {
            return { successCount: 0, failureCount: 0, invalidTokens: [], responses: [] };
        }

        // Deduplicate and filter non-empty tokens
        const uniqueTokens = [...new Set(tokens.filter(t => typeof t === 'string' && t.trim().length > 0))];
        if (uniqueTokens.length === 0) {
            return { successCount: 0, failureCount: 0, invalidTokens: [], responses: [] };
        }

        const notificationData = sanitizeDataPayload(payload.data || {});

        // Mock mode handler (when credentials not present during dev/testing)
        if (isMockMode || !isFirebaseInitialized || !messagingInstance) {
            console.log(`[Firebase Admin Mock] Simulated push sent to ${uniqueTokens.length} token(s):`, {
                title: payload.title,
                body: payload.body,
                data: notificationData,
            });
            return {
                successCount: uniqueTokens.length,
                failureCount: 0,
                invalidTokens: [],
                responses: uniqueTokens.map(() => ({ success: true, messageId: `mock-msg-${Date.now()}` })),
            };
        }

        const message = {
            notification: {
                title: payload.title || 'SafeFire Notification',
                body: payload.body || '',
            },
            data: notificationData,
            tokens: uniqueTokens,
        };

        const response = await messagingInstance.sendEachForMulticast(message);

        const invalidTokens = [];
        if (response.failureCount > 0 && Array.isArray(response.responses)) {
            response.responses.forEach((resp, idx) => {
                if (!resp.success && resp.error) {
                    const errorCode = resp.error.code || '';
                    const errorMessage = resp.error.message || '';
                    // Check for invalid or unregistered tokens
                    if (
                        errorCode === 'messaging/invalid-registration-token' ||
                        errorCode === 'messaging/registration-token-not-registered' ||
                        errorCode === 'messaging/invalid-argument' ||
                        errorMessage.includes('Requested entity was not found') ||
                        errorMessage.includes('registration-token-not-registered')
                    ) {
                        invalidTokens.push(uniqueTokens[idx]);
                    }
                }
            });
        }

        return {
            successCount: response.successCount || 0,
            failureCount: response.failureCount || 0,
            invalidTokens,
            responses: response.responses || [],
        };
    } catch (error) {
        console.error('❌ [Firebase Admin] Error in sendPushNotification:', error.message);
        return {
            successCount: 0,
            failureCount: tokens.length,
            invalidTokens: [],
            responses: [],
            error: error.message,
        };
    }
}

export { isFirebaseInitialized, isMockMode, initFirebase };
export default { sendPushNotification, isFirebaseInitialized, isMockMode, initFirebase };
