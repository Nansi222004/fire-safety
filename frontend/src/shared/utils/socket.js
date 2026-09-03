import { io } from 'socket.io-client';

const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL;

if (!rawApiBaseUrl || typeof rawApiBaseUrl !== 'string' || !rawApiBaseUrl.trim()) {
    throw new Error(
        'VITE_API_BASE_URL is not configured. Please set VITE_API_BASE_URL in your environment variables (e.g., VITE_API_BASE_URL=http://localhost:5000/api for local development or VITE_API_BASE_URL=https://firesafetyshop.in/api for production).'
    );
}

const SOCKET_URL = rawApiBaseUrl.trim().replace(/\/api\/?$/, '').replace(/\/+$/, '');

let socket = null;
let currentToken = null;
const joinedRooms = new Set();

const getActiveToken = (tokenInput) => {
    if (tokenInput) return tokenInput;
    if (typeof window === 'undefined') return null;
    const path = window.location.pathname;
    if (path.startsWith('/admin')) {
        return localStorage.getItem('adminToken') || localStorage.getItem('admin-token') || localStorage.getItem('token');
    }
    if (path.startsWith('/vendor')) {
        return localStorage.getItem('vendor-token') || localStorage.getItem('token');
    }
    if (path.startsWith('/delivery')) {
        return localStorage.getItem('delivery-token') || localStorage.getItem('token');
    }
    return localStorage.getItem('token') || localStorage.getItem('user-token');
};

export const getSocket = (tokenInput) => {
    const token = getActiveToken(tokenInput);

    if (token && token !== currentToken) {
        if (socket) {
            console.log('🔌 Token changed. Reconnecting socket...');
            socket.disconnect();
            socket = null;
            joinedRooms.clear();
        }
        currentToken = token;
    }

    if (!socket && token) {
        socket = io(SOCKET_URL, {
            auth: { token },
            transports: ['polling', 'websocket'],
            withCredentials: true
        });

        socket.on('connect', () => {
            console.log('🔌 Connected to socket server');
            // Rejoin all active rooms on connection / reconnection
            joinedRooms.forEach((room) => {
                socket.emit('join', room);
                console.log(`🔌 Rejoined room: ${room}`);
            });
        });

        socket.on('disconnect', (reason) => {
            console.log(`🔌 Disconnected from socket server (${reason})`);
        });

        socket.on('error', (err) => {
            console.error('🔌 Socket error:', err);
        });
    }
    return socket;
};

export const disconnectSocket = () => {
    if (socket) {
        socket.disconnect();
        socket = null;
        currentToken = null;
        joinedRooms.clear();
    }
};

export const joinRoom = (room) => {
    const roomStr = String(room || '').trim();
    if (!roomStr) return;
    joinedRooms.add(roomStr);
    if (socket) {
        socket.emit('join', roomStr);
        console.log(`🔌 Joined room: ${roomStr}`);
    }
};

export const leaveRoom = (room) => {
    const roomStr = String(room || '').trim();
    if (!roomStr) return;
    joinedRooms.delete(roomStr);
    if (socket) {
        socket.emit('leave', roomStr);
        console.log(`🔌 Left room: ${roomStr}`);
    }
};
