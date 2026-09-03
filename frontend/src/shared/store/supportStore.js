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
            const payload = response?.tickets !== undefined ? response : (response?.data || response || {});
            set({
                tickets: Array.isArray(payload.tickets) ? payload.tickets : [],
                pagination: payload.pagination || { total: 0, page: 1, limit: 10, pages: 1 },
                isLoading: false,
                error: null,
            });
        } catch (error) {
            set({ error: error.message, isLoading: false });
        }
    },

    fetchTicketById: async (id) => {
        set({ isLoading: true });
        try {
            const response = await adminService.getTicketById(id);
            const payload = (response?.id || response?._id) ? response : (response?.data || response);
            set({ isLoading: false });
            return payload;
        } catch (error) {
            set({ isLoading: false });
            return null;
        }
    },

    updateTicketStatus: async (id, data) => {
        try {
            await adminService.updateTicketStatus(id, data);
            set((state) => ({
                tickets: state.tickets.map((t) =>
                    (t.id === id || t._id === id) ? { ...t, ...data } : t
                )
            }));
            toast.success('Ticket updated successfully');
            return true;
        } catch (error) {
            return false;
        }
    },

    addReply: async (id, message) => {
        set({ isLoading: true });
        try {
            const response = await adminService.addTicketMessage(id, message);
            const payload = response?.message !== undefined ? response : (response?.data || response || true);
            set({ isLoading: false });
            toast.success('Reply added successfully');
            return payload;
        } catch (error) {
            set({ isLoading: false });
            return null;
        }
    }
}));
