import { create } from 'zustand';
import {
  getAllServices,
  createService,
  updateService,
  updateServiceStatus,
  deleteService,
} from '../../modules/Admin/services/adminService';
import toast from 'react-hot-toast';

export const useServiceStore = create((set, get) => ({
  services: [],
  isLoading: false,
  total: 0,
  page: 1,
  pages: 1,

  fetchServices: async (params = {}) => {
    set({ isLoading: true });
    try {
      const response = await getAllServices(params);
      const data = response?.data || response;
      if (data && Array.isArray(data.services)) {
        set({
          services: data.services.map((s) => ({ ...s, id: s._id || s.id })),
          total: data.total || data.services.length,
          page: data.page || 1,
          pages: data.pages || 1,
          isLoading: false,
        });
      } else if (Array.isArray(data)) {
        const normalized = data.map((s) => ({ ...s, id: s._id || s.id }));
        set({
          services: normalized,
          total: normalized.length,
          page: 1,
          pages: 1,
          isLoading: false,
        });
      } else {
        set({ services: [], total: 0, page: 1, pages: 1, isLoading: false });
      }
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  createService: async (serviceData) => {
    set({ isLoading: true });
    try {
      const response = await createService(serviceData);
      const newSrv = response?.data || response;
      const normalized = { ...newSrv, id: newSrv._id || newSrv.id };

      set((state) => ({
        services: [normalized, ...state.services],
        total: state.total + 1,
        isLoading: false,
      }));
      toast.success('Service created successfully.');
      return normalized;
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  updateService: async (id, serviceData) => {
    set({ isLoading: true });
    try {
      const response = await updateService(id, serviceData);
      const updatedSrv = response?.data || response;
      const normalized = { ...updatedSrv, id: updatedSrv._id || updatedSrv.id };

      set((state) => ({
        services: state.services.map((srv) =>
          String(srv.id || srv._id) === String(id) ? normalized : srv
        ),
        isLoading: false,
      }));
      toast.success('Service updated successfully.');
      return normalized;
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  toggleStatus: async (id, currentStatus) => {
    const nextStatus = !currentStatus;
    try {
      const response = await updateServiceStatus(id, nextStatus);
      const updatedSrv = response?.data || response;
      set((state) => ({
        services: state.services.map((srv) =>
          String(srv.id || srv._id) === String(id)
            ? { ...srv, isActive: updatedSrv?.isActive ?? nextStatus }
            : srv
        ),
      }));
      toast.success(`Service ${nextStatus ? 'activated' : 'deactivated'} successfully.`);
    } catch (error) {
      throw error;
    }
  },

  deleteService: async (id) => {
    set({ isLoading: true });
    try {
      await deleteService(id);
      set((state) => ({
        services: state.services.filter(
          (srv) => String(srv.id || srv._id) !== String(id)
        ),
        total: Math.max(0, state.total - 1),
        isLoading: false,
      }));
      toast.success('Service deleted successfully.');
      return true;
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },
}));
