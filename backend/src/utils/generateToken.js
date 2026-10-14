import crypto from 'crypto';
import { signAccessToken, signRefreshToken } from '../config/jwt.js';

/**
 * Generates access + refresh token pair for a given user/role
 * @param {Object} payload - { id, role, email }
 * @returns {{ accessToken, refreshToken }}
 */
export const generateTokens = (payload) => {
    const accessToken = signAccessToken(payload);
    // A unique jti makes every refresh token distinct, even when two are issued within the same second,
    // so rotation always invalidates the previous token.
    const refreshToken = signRefreshToken({ ...payload, jti: crypto.randomUUID() });
    return { accessToken, refreshToken };
};
