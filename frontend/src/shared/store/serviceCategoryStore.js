import { create } from 'zustand';
import {
  getAllServiceCategories,
  createServiceCategory,
  updateServiceCategory,
  updateServiceCategoryStatus,
  deleteServiceCategory,
} from '../../modules/Admin/services/adminService';
import toast from 'react-hot-toast';

export const useServiceCategoryStore = create((set, get) => ({
  categories: [],
  isLoading: false,
  total: 0,
  page: 1,
  pages: 1,

  fetchCategories: async (params = {}) => {
    set({ isLoading: true });
    try {
      const response = await getAllServiceCategories(params);
      const data = response?.data || response;
      if (data && Array.isArray(data.categories)) {
        set({
          categories: data.categories.map((c) => ({ ...c, id: c._id || c.id })),
          total: data.total || data.categories.length,
          page: data.page || 1,
          pages: data.pages || 1,
          isLoading: false,
        });
      } else if (Array.isArray(data)) {
        const normalized = data.map((c) => ({ ...c, id: c._id || c.id }));
        set({
          categories: normalized,
          total: normalized.length,
          page: 1,
          pages: 1,
          isLoading: false,
        });
      } else {
        set({ categories: [], total: 0, page: 1, pages: 1, isLoading: false });
      }
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  createCategory: async (categoryData) => {
    set({ isLoading: true });
    try {
      const response = await createServiceCategory(categoryData);
      const newCat = response?.data || response;
      const normalized = { ...newCat, id: newCat._id || newCat.id };

      set((state) => ({
        categories: [normalized, ...state.categories],
        total: state.total + 1,
        isLoading: false,
      }));
      toast.success('Service category created successfully.');
      return normalized;
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  updateCategory: async (id, categoryData) => {
    set({ isLoading: true });
    try {
      const response = await updateServiceCategory(id, categoryData);
      const updatedCat = response?.data || response;
      const normalized = { ...updatedCat, id: updatedCat._id || updatedCat.id };

      set((state) => ({
        categories: state.categories.map((cat) =>
          String(cat.id || cat._id) === String(id) ? normalized : cat
        ),
        isLoading: false,
      }));
      toast.success('Service category updated successfully.');
      return normalized;
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  toggleStatus: async (id, currentStatus) => {
    const nextStatus = !currentStatus;
    try {
      const response = await updateServiceCategoryStatus(id, nextStatus);
      const updatedCat = response?.data || response;
      set((state) => ({
        categories: state.categories.map((cat) =>
          String(cat.id || cat._id) === String(id)
            ? { ...cat, isActive: updatedCat?.isActive ?? nextStatus }
            : cat
        ),
      }));
      toast.success(`Service category ${nextStatus ? 'activated' : 'deactivated'} successfully.`);
    } catch (error) {
      throw error;
    }
  },

  deleteCategory: async (id) => {
    set({ isLoading: true });
    try {
      await deleteServiceCategory(id);
      set((state) => ({
        categories: state.categories.filter(
          (cat) => String(cat.id || cat._id) !== String(id)
        ),
        total: Math.max(0, state.total - 1),
        isLoading: false,
      }));
      toast.success('Service category deleted successfully.');
      return true;
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },
}));
