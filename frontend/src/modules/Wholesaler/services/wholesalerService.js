import api from '../../../shared/utils/api';

// Wholesaler-only endpoints. Shared seller pages keep calling /vendor/* and are routed to
// /wholesaler/* by the API client while the Wholesaler portal is open.

export const getWholesalerDashboard = () => api.get('/wholesaler/dashboard');

export const getWholesalerProfile = () => api.get('/wholesaler/auth/profile');

export const getWholesalerProducts = (params = {}) => api.get('/wholesaler/products', { params });

/**
 * Update wholesale price / MOQ / stock of one product.
 * @param {string} productId
 * @param {{ wholesalePrice?: number, moq?: number, stockQuantity?: number }} payload
 */
export const updateWholesalerPricing = (productId, payload) =>
    api.patch(`/wholesaler/products/${productId}/pricing`, payload);

export const getWholesalerOrders = (params = {}) => api.get('/wholesaler/orders', { params });
