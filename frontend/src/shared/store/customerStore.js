import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as adminService from '../../modules/Admin/services/adminService';
import toast from 'react-hot-toast';

export const useCustomerStore = create(
  persist(
    (set, get) => ({
      customers: [],
      selectedCustomer: null,
      pagination: {
        total: 0,
        page: 1,
        limit: 10,
        pages: 0
      },
      error: null,

      // Initialize/Fetch customers
      initialize: async (params = {}) => {
        set({ isLoading: true, error: null });
        try {
          const response = await adminService.getAllCustomers(params);
          const data = response?.data ?? response;
          const rawCustomers = Array.isArray(data?.customers)
            ? data.customers
            : (Array.isArray(data) ? data : []);
          const pagination = data?.pagination || {
            total: rawCustomers.length,
            page: 1,
            limit: 10,
            pages: 1
          };

          // Map backend data to frontend expectations
          const normalizedCustomers = rawCustomers.map(c => ({
            ...c,
            id: c._id || c.id,
            status: c.isActive ? 'active' : 'blocked'
          }));

          set({
            customers: normalizedCustomers,
            pagination,
            isLoading: false,
            error: null
          });
        } catch (error) {
          set({ isLoading: false, error: error.message || 'Failed to fetch customers' });
          // Error handled by api interceptor
        }
      },

      // Get customer by ID from API
      fetchCustomerById: async (id) => {
        set({ isLoading: true, error: null });
        try {
          const response = await adminService.getCustomerById(id);
          const customer = response?.data ?? response;

          if (!customer) {
            set({ selectedCustomer: null, isLoading: false });
            return null;
          }

          const normalizedCustomer = {
            ...customer,
            id: customer._id || customer.id,
            status: customer.isActive ? 'active' : 'blocked'
          };

          set({ selectedCustomer: normalizedCustomer, isLoading: false, error: null });
          return normalizedCustomer;
        } catch (error) {
          set({ isLoading: false, error: error.message || 'Failed to fetch customer details' });
          return null;
        }
      },

      // Update customer details via API
      updateCustomer: async (id, customerData) => {
        set({ isLoading: true, error: null });
        try {
          const response = await adminService.updateCustomer(id, customerData);
          const updatedCustomer = response?.data ?? response;

          set((state) => ({
            customers: state.customers.map(c =>
              String(c.id) === String(id)
                ? { ...c, ...updatedCustomer, id: updatedCustomer._id || updatedCustomer.id, status: updatedCustomer.isActive ? 'active' : 'blocked' }
                : c
            ),
            isLoading: false
          }));

          toast.success('Customer updated successfully');
          return {
            ...updatedCustomer,
            id: updatedCustomer._id || updatedCustomer.id,
            status: updatedCustomer.isActive ? 'active' : 'blocked'
          };
        } catch (error) {
          set({ isLoading: false, error: error.message || 'Failed to update customer' });
          throw error;
        }
      },

      // Placeholder for activity history (frontend depends on it)
      addActivity: (customerId, activity) => {
        console.log(`Activity for ${customerId}:`, activity);
      },

      // Update customer status via API
      toggleCustomerStatus: async (id) => {
        const customer = get().customers.find(c => String(c.id) === String(id));
        if (!customer) return;

        const newIsActive = !(customer.status === 'active');

        set({ isLoading: true, error: null });
        try {
          const response = await adminService.updateCustomerStatus(id, newIsActive);
          const updatedCustomer = response?.data ?? response;

          // Update local state
          set((state) => ({
            customers: state.customers.map(c =>
              String(c.id) === String(id)
                ? { ...c, isActive: updatedCustomer.isActive, status: updatedCustomer.isActive ? 'active' : 'blocked' }
                : c
            ),
            isLoading: false
          }));

          toast.success(`Customer ${updatedCustomer.isActive ? 'activated' : 'blocked'} successfully`);
          return {
            ...updatedCustomer,
            id: updatedCustomer._id,
            status: updatedCustomer.isActive ? 'active' : 'blocked'
          };
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      // Select a customer (local)
      setSelectedCustomer: (customer) => {
        set({ selectedCustomer: customer });
      },
    }),
    {
      name: 'admin-customer-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

