import api from '../../../shared/utils/api';

/**
 * Fetch Customer Service Catalog (Active Categories & Services)
 */
export const getServiceCatalog = (params = {}) =>
  api.get('/customer/services/catalog', { params });

/**
 * Fetch Service Master Details by Slug or ID
 */
export const getServiceBySlug = (slug) =>
  api.get(`/customer/services/detail/${slug}`);

/**
 * Check Pincode Serviceability & Fetch Available Vendors
 */
export const checkPincodeServiceability = (data) =>
  api.post('/customer/services/check-serviceability', data);
export const checkServiceability = checkPincodeServiceability;

/**
 * Create a new Service Booking
 */
export const createServiceBooking = (data) =>
  api.post('/customer/bookings', data);
export const createBooking = createServiceBooking;

/**
 * Verify Razorpay payment signature for a service booking
 */
export const verifyServicePayment = (data) =>
  api.post('/customer/bookings/verify-payment', data);

/**
 * Fetch Customer's Service Bookings List
 */
export const getCustomerServiceBookings = () =>
  api.get('/customer/bookings');

/**
 * Fetch Service Booking Detail by ID
 */
export const getServiceBookingById = (id) =>
  api.get(`/customer/bookings/${id}`);

/**
 * Cancel a Service Booking
 */
export const cancelServiceBooking = (id, reason) =>
  api.patch(`/customer/bookings/${id}/cancel`, { reason });

/**
 * Submit a Review for a Completed Service Booking
 */
export const addServiceReview = (id, reviewData) =>
  api.post(`/customer/bookings/${id}/review`, reviewData);

/**
 * Fetch Reviews for a Service Master
 */
export const getServiceReviews = (slug, params = {}) =>
  api.get(`/customer/services/${slug}/reviews`, { params });
