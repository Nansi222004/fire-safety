import { Server } from 'socket.io';
import { verifyAccessToken } from '../config/jwt.js';
import logger from '../utils/logger.js';
import { toReturnRequestView } from '../models/ReturnRequest.model.js';
import { redactOtpSecrets } from '../utils/otpRedaction.js';

let io;

const DEFAULT_DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:5174', 'http://localhost:3001', 'http://127.0.0.1:3000', 'http://127.0.0.1:5173'];
const ALLOWED_ORIGINS = process.env.FRONTEND_URL
    ? [...new Set([...process.env.FRONTEND_URL.split(',').map((o) => o.trim()), ...DEFAULT_DEV_ORIGINS])]
    : DEFAULT_DEV_ORIGINS;

// Rooms that require authentication to join
const PROTECTED_ROOM_PREFIXES = ['user_', 'vendor_', 'delivery_', 'order_', 'chat_', 'admin_'];

const isProtectedRoom = (room) =>
    PROTECTED_ROOM_PREFIXES.some((prefix) => String(room || '').startsWith(prefix));

const ADMIN_ROLES = ['admin', 'superadmin'];

/**
 * May this authenticated socket user join this room?
 *   user_/vendor_/delivery_<id> → only that account (or Admin)
 *   admin_*                     → Admin only (it receives every order update)
 *   order_<mongoId|orderId>     → the order's customer, one of its sellers, a rider assigned to it, or Admin
 * Other rooms keep their existing rules.
 */
export const authorizeRoomJoin = async (user, room) => {
    const roomStr = String(room || '').trim();
    if (!roomStr) return false;
    if (!isProtectedRoom(roomStr)) return true;
    if (!user?.id) return false;
    const role = String(user.role || '').toLowerCase();
    const isAdmin = ADMIN_ROLES.includes(role);
    const currentId = String(user.id);

    const privatePrefix = ['user_', 'vendor_', 'delivery_'].find((p) => roomStr.startsWith(p));
    if (privatePrefix) return isAdmin || roomStr.slice(privatePrefix.length) === currentId;
    if (roomStr.startsWith('admin_')) return isAdmin;
    if (roomStr.startsWith('order_')) {
        if (isAdmin) return true;
        const ref = roomStr.slice('order_'.length).slice(0, 64);
        const [{ default: mongoose }, { default: Order }, { default: Shipment }] = await Promise.all([
            import('mongoose'), import('../models/Order.model.js'), import('../models/Shipment.model.js'),
        ]);
        if (!mongoose.isValidObjectId(currentId)) return false;
        const byRef = mongoose.isValidObjectId(ref) && String(ref).length === 24 ? { $or: [{ _id: ref }, { orderId: ref }] } : { orderId: ref };
        if (role === 'customer') return Boolean(await Order.exists({ ...byRef, userId: currentId }));
        if (role === 'vendor' || role === 'wholesaler') return Boolean(await Order.exists({ ...byRef, 'vendorItems.vendorId': currentId }));
        if (role === 'delivery') {
            const order = await Order.findOne(byRef).select('_id deliveryBoyId').lean();
            if (!order) return false;
            if (String(order.deliveryBoyId || '') === currentId) return true;
            return Boolean(await Shipment.exists({ orderId: order._id, deliveryBoyId: currentId }));
        }
        return false;
    }
    return true; // chat_ and other protected prefixes: authenticated, as before
};

export const initSocket = (server) => {
    io = new Server(server, {
        cors: {
            origin: process.env.NODE_ENV === 'production' ? ALLOWED_ORIGINS : (origin, callback) => callback(null, true),
            methods: ['GET', 'POST'],
            credentials: true,
        },
    });

    // Authenticate socket connection via JWT in handshake
    io.use((socket, next) => {
        const token =
            socket.handshake.auth?.token ||
            socket.handshake.headers?.authorization?.replace('Bearer ', '');

        if (token) {
            try {
                socket.user = verifyAccessToken(token);
            } catch {
                // Non-fatal: public clients won't have a token.
                // Protected rooms will be blocked at join time.
                socket.user = null;
            }
        } else {
            socket.user = null;
        }

        next();
    });

    io.on('connection', (socket) => {
        socket.on('join', (room) => {
            const roomStr = String(room || '').trim();
            if (!roomStr) return;

            // Block unauthenticated clients from joining protected rooms
            if (isProtectedRoom(roomStr) && !socket.user) {
                socket.emit('error', { message: 'Authentication required to join this room.' });
                return;
            }

            // Enforce per-room access (own account rooms, Admin-only rooms, order rooms for parties of the order).
            authorizeRoomJoin(socket.user, roomStr)
                .then((allowed) => {
                    if (!allowed) {
                        socket.emit('error', { message: 'Access denied to this room.' });
                        return;
                    }
                    socket.join(roomStr);
                })
                .catch((err) => {
                    logger.error('[SOCKET] Room authorization failed', { message: err.message });
                    socket.emit('error', { message: 'Access denied to this room.' });
                });
        });

        socket.on('leave', (room) => {
            const roomStr = String(room || '').trim();
            if (roomStr) {
                socket.leave(roomStr);
            }
        });

        socket.on('disconnect', () => {
            logger.info(`Socket disconnected: ${socket.id}`);
        });
    });

    return io;
};

export const getIO = () => {
    if (!io) throw new Error('Socket.io not initialized!');
    return io;
};

// Helper to emit events to a specific room
export const emitToRoom = (room, event, data) => {
    if (io) io.to(room).emit(event, data);
};

// Helper to notify order updates real-time
export const notifyOrderUpdate = async (order) => {
    try {
        if (!order) return;
        // Broadcast copies never carry OTP hashes or codes (sellers, riders and Admin all receive this payload).
        const payload = redactOtpSecrets(JSON.parse(JSON.stringify(order.toObject ? order.toObject() : order)));
        const mongoId = String(payload._id || '');
        const humanId = String(payload.orderId || '');
        const userId = String(payload.userId?._id || payload.userId || '');
        const deliveryBoyId = String(payload.deliveryBoyId?._id || payload.deliveryBoyId || '');

        // Emit to the specific order rooms (both MongoDB _id and human-readable orderId)
        if (mongoId) emitToRoom(`order_${mongoId}`, 'order_updated', payload);
        if (humanId && humanId !== mongoId) emitToRoom(`order_${humanId}`, 'order_updated', payload);

        // Emit to user room
        if (userId) {
            emitToRoom(`user_${userId}`, 'order_updated', payload);
        }

        // Emit to delivery boy room
        if (deliveryBoyId) {
            emitToRoom(`delivery_${deliveryBoyId}`, 'order_updated', payload);
        }

        // Emit to admin room
        emitToRoom('admin_room', 'order_updated', payload);

        // Emit to all vendors involved
        if (Array.isArray(payload.vendorItems)) {
            const vendorIds = [...new Set(payload.vendorItems.map(item => String(item.vendorId?._id || item.vendorId || '')))].filter(Boolean);
            vendorIds.forEach(vendorId => {
                emitToRoom(`vendor_${vendorId}`, 'order_updated', payload);
            });
        }
    } catch (err) {
        logger.error('[SOCKET_ERROR] Error emitting order status update:', { message: err.message, orderId: order?._id });
    }
};

// Helper to notify return updates real-time
export const notifyReturnUpdate = async (request) => {
    try {
        if (!request) return;
        const payload = request.toObject ? request.toObject() : request;
        const returnId = payload._id;
        const orderId = payload.orderId;
        const userId = payload.userId?._id || payload.userId;
        const vendorId = payload.vendorId?._id || payload.vendorId;
        const deliveryBoyId = payload.deliveryBoyId?._id || payload.deliveryBoyId;

        // Emit to specific order room
        // Each audience gets only the OTP codes it owns (see toReturnRequestView); the shared order room gets none.
        if (orderId) {
            emitToRoom(`order_${orderId}`, 'return_updated', toReturnRequestView(payload, 'none'));
        }

        // Emit to user room
        if (userId) {
            emitToRoom(`user_${userId}`, 'return_updated', toReturnRequestView(payload, 'customer'));
        }

        // Emit to vendor room
        if (vendorId) {
            emitToRoom(`vendor_${vendorId}`, 'return_updated', toReturnRequestView(payload, 'vendor'));
        }

        // Emit to delivery boy room
        if (deliveryBoyId) {
            emitToRoom(`delivery_${deliveryBoyId}`, 'return_updated', toReturnRequestView(payload, 'rider'));
        }

        // Emit to admin room
        emitToRoom('admin_room', 'return_updated', payload);
    } catch (err) {
        logger.error('[SOCKET_ERROR] Error emitting return status update:', { message: err.message, returnRequestId: request?._id });
    }
};
