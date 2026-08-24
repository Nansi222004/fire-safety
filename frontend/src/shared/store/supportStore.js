import { create } from 'zustand';
import * as adminService from '../../modules/Admin/services/adminService';
import toast from 'react-hot-toast';

export const useSupportStore = create((set, get) => ({
    tickets: [],
    isLoading: false,
    error: null,
    pagination: {
        total: 0,
        page: 1,
        limit: 10,
        pages: 1
    },

    fetchTickets: async (params = {}) => {
        set({ isLoading: true });
        try {
            const response = await adminService.getAllTickets(params);
            const payload = response?.tickets ? response : (response?.data || {});
            set({
                tickets: payload.tickets || [],
                pagination: payload.pagination || { total: 0, page: 1, limit: 10, pages: 1 },
                isLoading: false
            });
        } catch (error) {
            set({ error: error.message, isLoading: false });
            toast.error(error.message || 'Failed to fetch tickets');
        }
    },

    fetchTicketById: async (id) => {
        set({ isLoading: true });
        try {
            const response = await adminService.getTicketById(id);
            set({ isLoading: false });
            return response?.id || response?._id ? response : (response?.data || null);
        } catch (error) {
            set({ isLoading: false });
            toast.error(error.message || 'Failed to fetch ticket details');
            return null;
        }
    },

    updateTicketStatus: async (id, data) => {
        try {
            await adminService.updateTicketStatus(id, data);
            set((state) => ({
                tickets: state.tickets.map((t) =>
                    t.id === id ? { ...t, ...data } : t
                )
            }));
            toast.success('Ticket updated successfully');
            return true;
        } catch (error) {
            toast.error(error.message || 'Failed to update ticket');
            return false;
        }
    },

    addReply: async (id, message) => {
        set({ isLoading: true });
        try {
            const response = await adminService.addTicketMessage(id, message);
            set({ isLoading: false });
            toast.success('Reply added successfully');
            return response?.id || response?._id ? response : (response?.data || response || true);
        } catch (error) {
            set({ isLoading: false });
            toast.error(error.message || 'Failed to add reply');
            return null;
        }
    }
}));
