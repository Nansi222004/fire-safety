import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Worker from '../../../models/Worker.model.js';
import { generateTokens } from '../../../utils/generateToken.js';
import {
    clearRefreshSession,
    decodeRefreshTokenOrThrow,
    persistRefreshSession,
    rotateRefreshSession,
} from '../../../services/refreshToken.service.js';

const toPublicWorker = (worker) => ({
    id: worker._id,
    name: worker.name,
    email: worker.email,
    phone: worker.phone,
});

// POST /api/worker/auth/login
export const login = asyncHandler(async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!email || !password) throw new ApiError(400, 'Email and password are required.');

    const worker = await Worker.findOne({ email }).select('+password');
    if (!worker) throw new ApiError(401, 'Invalid email or password.');
    const isMatch = await worker.comparePassword(password);
    if (!isMatch) throw new ApiError(401, 'Invalid email or password.');
    if (!worker.isActive) throw new ApiError(403, 'Your worker account has been deactivated. Contact admin.');

    const { accessToken, refreshToken } = generateTokens({ id: worker._id, role: 'worker', email: worker.email });
    worker.lastLoginAt = new Date();
    await persistRefreshSession(worker, refreshToken);

    res.status(200).json(new ApiResponse(200, { accessToken, refreshToken, worker: toPublicWorker(worker) }, 'Login successful.'));
});

// POST /api/worker/auth/refresh
export const refresh = asyncHandler(async (req, res) => {
    const { refreshToken } = req.body || {};
    const decoded = decodeRefreshTokenOrThrow(refreshToken);
    if (decoded?.role !== 'worker') throw new ApiError(401, 'Invalid refresh token.');

    const worker = await Worker.findById(decoded.id).select('+refreshTokenHash +refreshTokenExpiresAt isActive email');
    if (!worker) throw new ApiError(401, 'Invalid refresh token.');
    if (!worker.isActive) throw new ApiError(403, 'Your worker account has been deactivated. Contact admin.');

    const tokens = await rotateRefreshSession(worker, { id: worker._id, role: 'worker', email: worker.email }, refreshToken);
    res.status(200).json(new ApiResponse(200, tokens, 'Session refreshed successfully.'));
});

// POST /api/worker/auth/logout
export const logout = asyncHandler(async (req, res) => {
    const { refreshToken } = req.body || {};
    if (refreshToken) {
        try {
            const decoded = decodeRefreshTokenOrThrow(refreshToken);
            const worker = await Worker.findById(decoded.id).select('+refreshTokenHash +refreshTokenExpiresAt');
            if (worker?.refreshTokenHash) await clearRefreshSession(worker);
        } catch {
            // Keep logout idempotent.
        }
    }
    res.status(200).json(new ApiResponse(200, null, 'Logged out successfully.'));
});

// GET /api/worker/auth/profile
export const getProfile = asyncHandler(async (req, res) => {
    const worker = await Worker.findById(req.user.id).lean();
    if (!worker) throw new ApiError(404, 'Worker not found.');
    res.status(200).json(new ApiResponse(200, toPublicWorker(worker), 'Profile fetched.'));
});
