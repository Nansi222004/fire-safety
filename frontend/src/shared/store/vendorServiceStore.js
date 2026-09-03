import { create } from 'zustand';
import {
  getAvailableVendorServices,
  getMyVendorServices,
  enableVendorService,
  updateVendorService,
  updateVendorServiceStatus,
  deleteVendorService,
} from '../../modules/Vendor/services/vendorService';
import toast from 'react-hot-toast';

export const useVendorServiceStore = create((set, get) => ({
  availableServices: [],
  myServices: [],
  isLoading: false,
  totalAvailable: 0,
  totalMy: 0,

  fetchAvailableServices: async (params = {}) => {
    set({ isLoading: true });
    try {
      const response = await getAvailableVendorServices(params);
      const data = response?.data || response;
      if (data && Array.isArray(data.services)) {
        set({
          availableServices: data.services.map((s) => ({ ...s, id: s._id || s.id })),
          totalAvailable: data.total || data.services.length,
          isLoading: false,
        });
      } else if (Array.isArray(data)) {
        const normalized = data.map((s) => ({ ...s, id: s._id || s.id }));
        set({
          availableServices: normalized,
          totalAvailable: normalized.length,
          isLoading: false,
        });
      } else {
        set({ availableServices: [], totalAvailable: 0, isLoading: false });
      }
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  fetchMyServices: async (params = {}) => {
    set({ isLoading: true });
    try {
      const response = await getMyVendorServices(params);
      const data = response?.data || response;
      if (data && Array.isArray(data.vendorServices)) {
        set({
          myServices: data.vendorServices.map((s) => ({ ...s, id: s._id || s.id })),
          totalMy: data.total || data.vendorServices.length,
          isLoading: false,
        });
      } else if (Array.isArray(data)) {
        const normalized = data.map((s) => ({ ...s, id: s._id || s.id }));
        set({
          myServices: normalized,
          totalMy: normalized.length,
          isLoading: false,
        });
      } else {
        set({ myServices: [], totalMy: 0, isLoading: false });
      }
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  enableService: async (serviceId) => {
    set({ isLoading: true });
    try {
      const response = await enableVendorService(serviceId);
      const newVs = response?.data || response;
      const normalized = { ...newVs, id: newVs._id || newVs.id };

      set((state) => ({
        availableServices: state.availableServices.filter(
          (s) => String(s.id || s._id) !== String(serviceId)
        ),
        myServices: [normalized, ...state.myServices],
        totalAvailable: Math.max(0, state.totalAvailable - 1),
        totalMy: state.totalMy + 1,
        isLoading: false,
      }));
      toast.success('Service enabled for your store successfully.');
      return normalized;
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  updateServiceConfig: async (id, configData) => {
    set({ isLoading: true });
    try {
      const response = await updateVendorService(id, configData);
      const updatedVs = response?.data || response;
      const normalized = { ...updatedVs, id: updatedVs._id || updatedVs.id };

      set((state) => ({
        myServices: state.myServices.map((vs) =>
          String(vs.id || vs._id) === String(id) ? normalized : vs
        ),
        isLoading: false,
      }));
      toast.success('Service configuration updated successfully.');
      return normalized;
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  toggleStatus: async (id, currentStatus) => {
    const nextStatus = !currentStatus;
    try {
      const response = await updateVendorServiceStatus(id, nextStatus);
      const updatedVs = response?.data || response;
      set((state) => ({
        myServices: state.myServices.map((vs) =>
          String(vs.id || vs._id) === String(id)
            ? { ...vs, isActive: updatedVs?.isActive ?? nextStatus }
            : vs
        ),
      }));
      toast.success(`Service ${nextStatus ? 'enabled' : 'disabled'} successfully.`);
    } catch (error) {
      throw error;
    }
  },

  disableService: async (id) => {
    set({ isLoading: true });
    try {
      await deleteVendorService(id);
      set((state) => ({
        myServices: state.myServices.filter(
          (vs) => String(vs.id || vs._id) !== String(id)
        ),
        totalMy: Math.max(0, state.totalMy - 1),
        isLoading: false,
      }));
      toast.success('Service disabled and removed from store.');
      return true;
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },
}));
