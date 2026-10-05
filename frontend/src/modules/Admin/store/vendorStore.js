import { create } from "zustand";
import {
  getAllVendors,
  getVendorById,
  updateVendorStatus as updateVendorStatusApi,
  updateVendor as updateVendorApi,
  deleteVendor as deleteVendorApi,
  updateCommissionRate as updateCommissionRateApi,
} from "../services/adminService";

const normalizeVendor = (vendor) => {
  if (!vendor || typeof vendor !== "object") return vendor;
  const id = String(vendor.id || vendor._id || "");
  return {
    ...vendor,
    id,
    _id: String(vendor._id || id),
  };
};

export const useVendorStore = create((set, get) => ({
  vendors: [],
  selectedVendor: null,
  isLoading: false,

  initialize: async () => {
    set({ isLoading: true });
    try {
      const vendors = [];
      let page = 1;
      let totalPages = 1;

      do {
        const response = await getAllVendors({ page, limit: 200 });
        const payload = response?.data ?? response;
        const pageVendors = Array.isArray(payload?.vendors)
          ? payload.vendors.map(normalizeVendor)
          : [];

        vendors.push(...pageVendors);
        totalPages = Math.max(Number(payload?.pages) || 1, 1);
        page += 1;
      } while (page <= totalPages);

      set({ vendors, isLoading: false });
      return vendors;
    } catch {
      set({ isLoading: false });
      return [];
    }
  },

  getAllVendors: () => get().vendors,

  getVendor: async (id) => {
    const existing = get().vendors.find(
      (v) => String(v.id || v._id) === String(id)
    );
    if (existing) {
      set({ selectedVendor: existing });
      return existing;
    }

    try {
      const response = await getVendorById(id);
      const vendor = normalizeVendor(response?.data ?? response);
      if (!vendor) return null;
      set((state) => ({
        selectedVendor: vendor,
        vendors: state.vendors.some(
          (v) => String(v.id || v._id) === String(vendor.id)
        )
          ? state.vendors.map((v) =>
            String(v.id || v._id) === String(vendor.id) ? vendor : v
          )
          : [...state.vendors, vendor],
      }));
      return vendor;
    } catch {
      return null;
    }
  },

  updateVendorStatus: async (id, status, reason = "") => {
    try {
      const response = await updateVendorStatusApi(id, status, reason);
      const vendor = normalizeVendor(response?.data ?? response);
      if (!vendor) return false;
      set((state) => ({
        vendors: state.vendors.map((v) =>
          String(v.id || v._id) === String(id) ? { ...v, ...vendor } : v
        ),
        selectedVendor:
          state.selectedVendor &&
          String(state.selectedVendor.id || state.selectedVendor._id) ===
          String(id)
            ? { ...state.selectedVendor, ...vendor }
            : state.selectedVendor,
      }));
      return true;
    } catch {
      return false;
    }
  },

  updateVendor: async (id, updates) => {
    try {
      const response = await updateVendorApi(id, updates);
      const vendor = normalizeVendor(response?.data ?? response);
      if (!vendor) return { success: false };
      set((state) => ({
        vendors: state.vendors.map((item) =>
          String(item.id || item._id) === String(id) ? { ...item, ...vendor } : item
        ),
        selectedVendor:
          state.selectedVendor && String(state.selectedVendor.id || state.selectedVendor._id) === String(id)
            ? { ...state.selectedVendor, ...vendor }
            : state.selectedVendor,
      }));
      return { success: true, vendor };
    } catch (error) {
      return { success: false, message: error?.message || 'Failed to update vendor.' };
    }
  },

  deleteVendor: async (id) => {
    try {
      await deleteVendorApi(id);
      set((state) => ({
        vendors: state.vendors.filter((item) => String(item.id || item._id) !== String(id)),
        selectedVendor:
          state.selectedVendor && String(state.selectedVendor.id || state.selectedVendor._id) === String(id)
            ? null
            : state.selectedVendor,
      }));
      return { success: true };
    } catch (error) {
      return { success: false, message: error?.message || 'Vendor could not be deleted.' };
    }
  },

  updateCommissionRate: async (id, commissionRate) => {
    try {
      const response = await updateCommissionRateApi(id, commissionRate);
      const vendor = normalizeVendor(response?.data ?? response);
      if (!vendor) return false;
      set((state) => ({
        vendors: state.vendors.map((v) =>
          String(v.id || v._id) === String(id) ? { ...v, ...vendor } : v
        ),
        selectedVendor:
          state.selectedVendor &&
          String(state.selectedVendor.id || state.selectedVendor._id) ===
          String(id)
            ? { ...state.selectedVendor, ...vendor }
            : state.selectedVendor,
      }));
      return true;
    } catch {
      return false;
    }
  },
}));
