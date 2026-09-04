import { create } from 'zustand';
import * as adminService from '../../modules/Admin/services/adminService';
import toast from 'react-hot-toast';

export const useReviewStore = create((set, get) => ({
    reviews: [],
    isLoading: false,
    error: null,
    pagination: {
        total: 0,
        page: 1,
        limit: 10,
        pages: 1
    },

    fetchReviews: async (params = {}) => {
        set({ isLoading: true, error: null });
        try {
            const response = await adminService.getAllReviews(params);
            const data = response?.data ?? response;
            const reviewList = Array.isArray(data?.reviews)
                ? data.reviews
                : (Array.isArray(data) ? data : []);
            const pagination = data?.pagination || response?.pagination || {
                total: reviewList.length,
                page: 1,
                limit: 10,
                pages: 1
            };

            set({
                reviews: reviewList,
                pagination,
                isLoading: false,
                error: null
            });
        } catch (error) {
            set({ error: error.message, isLoading: false });
            toast.error(error.message || 'Failed to fetch reviews');
        }
    },

    updateReviewStatus: async (id, status) => {
        try {
            await adminService.updateReviewStatus(id, status);
            set((state) => ({
                reviews: state.reviews.map((r) =>
                    r.id === id ? { ...r, status } : r
                )
            }));
            toast.success(`Review ${status}`);
            return true;
        } catch (error) {
            toast.error(error.message || 'Failed to update review status');
            return false;
        }
    },

    deleteReview: async (id) => {
        if (!window.confirm('Are you sure you want to delete this review?')) return false;

        try {
            await adminService.deleteReview(id);
            set((state) => ({
                reviews: state.reviews.filter(r => r.id !== id)
            }));
            toast.success('Review deleted successfully');
            return true;
        } catch (error) {
            toast.error(error.message || 'Failed to delete review');
            return false;
        }
    }
}));
