import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import api from "../../../shared/utils/api";
import { registerFCMToken, removeFCMToken } from "../../../services/pushNotificationService";

const normalizeVendor = (vendor) => {
  if (!vendor) return null;
  return {
    ...vendor,
    id: vendor.id || vendor._id,
  };
};

/**
 * Seller account session store. Retail vendors and Wholesalers use the same store shape
 * with their own API prefix, token keys and push scope, so shared seller pages work in both portals.
 */
export const createSellerAuthStore = ({ apiPrefix, accessKey, refreshKey, persistKey, pushScope, accountLabel }) =>
  create(
    persist(
      (set, get) => ({
        vendor: null,
        token: null,
        refreshToken: null,
        isAuthenticated: false,
        isLoading: false,

        // Seller login action
        login: async (email, password, rememberMe = false) => {
          set({ isLoading: true });
          try {
            const response = await api.post(`${apiPrefix}/auth/login`, {
              email,
              password,
            });
            const authData = response?.data ?? response ?? {};
            const vendor = authData.vendor;
            const accessToken = authData.accessToken;
            const refreshToken = authData.refreshToken;

            if (!vendor || !accessToken || !refreshToken) {
              throw new Error("Invalid login response");
            }

            const normalized = normalizeVendor(vendor);
            set({
              vendor: normalized,
              token: accessToken,
              refreshToken,
              isAuthenticated: true,
              isLoading: false,
            });

            // Store token for seller API requests
            localStorage.setItem(accessKey, accessToken);
            localStorage.setItem(refreshKey, refreshToken);

            // Register FCM push token
            registerFCMToken(true, pushScope).catch(() => {});

            return { success: true, vendor: normalized };
          } catch (error) {
            set({ isLoading: false });
            throw error;
          }
        },

        // Registration — backend sends an OTP email; the account is NOT authenticated until OTP verified.
        register: async (formData) => {
          set({ isLoading: true });
          try {
            const response = formData instanceof FormData
              ? await api.post(`${apiPrefix}/auth/register`, formData, {
                headers: { "Content-Type": "multipart/form-data" },
              })
              : await api.post(`${apiPrefix}/auth/register`, formData);
            // response is already unwrapped by api.js interceptor → response.data
            const data = response?.data ?? response;

            set({ isLoading: false });

            return {
              success: true,
              message:
                data?.message ||
                "Registration successful! Please check your email for the OTP.",
            };
          } catch (error) {
            set({ isLoading: false });
            throw error;
          }
        },

        verifyOtp: async (email, otp) => {
          const response = await api.post(`${apiPrefix}/auth/verify-otp`, { email, otp });
          return response?.data ?? response;
        },

        resendOtp: async (email) => {
          const response = await api.post(`${apiPrefix}/auth/resend-otp`, { email });
          return response?.data ?? response;
        },

        forgotPassword: async (email) => {
          set({ isLoading: true });
          try {
            const response = await api.post(`${apiPrefix}/auth/forgot-password`, { email });
            const data = response?.data ?? response;
            set({ isLoading: false });
            return { success: true, message: data?.message };
          } catch (error) {
            set({ isLoading: false });
            throw error;
          }
        },

        verifyResetOtp: async (email, otp) => {
          set({ isLoading: true });
          try {
            const response = await api.post(`${apiPrefix}/auth/verify-reset-otp`, { email, otp });
            const data = response?.data ?? response;
            set({ isLoading: false });
            return { success: true, message: data?.message };
          } catch (error) {
            set({ isLoading: false });
            throw error;
          }
        },

        resetPassword: async (email, password, confirmPassword) => {
          set({ isLoading: true });
          try {
            const response = await api.post(`${apiPrefix}/auth/reset-password`, { email, password, confirmPassword });
            const data = response?.data ?? response;
            set({ isLoading: false });
            return { success: true, message: data?.message };
          } catch (error) {
            set({ isLoading: false });
            throw error;
          }
        },

        // Seller logout action
        logout: () => {
          const refreshToken = localStorage.getItem(refreshKey);
          if (refreshToken) {
            api.post(`${apiPrefix}/auth/logout`, { refreshToken }).catch(() => {});
          }

          // Remove FCM push token
          removeFCMToken(pushScope).catch(() => {});

          set({
            vendor: null,
            token: null,
            refreshToken: null,
            isAuthenticated: false,
          });
          localStorage.removeItem(accessKey);
          localStorage.removeItem(refreshKey);
        },

        // Seller delete account action
        deleteAccount: async () => {
          set({ isLoading: true });
          try {
            const response = await api.delete(`${apiPrefix}/auth/account`);
            const data = response?.data ?? response;

            // Remove FCM push token
            removeFCMToken(pushScope).catch(() => {});

            set({
              vendor: null,
              token: null,
              refreshToken: null,
              isAuthenticated: false,
              isLoading: false,
            });
            localStorage.removeItem(accessKey);
            localStorage.removeItem(refreshKey);

            return { success: true, message: data?.message || `${accountLabel} account deleted successfully.` };
          } catch (error) {
            set({ isLoading: false });
            throw error;
          }
        },

        updateProfile: async (profileData) => {
          set({ isLoading: true });
          try {
            const response = await api.put(`${apiPrefix}/auth/profile`, profileData);
            const data = response?.data ?? response;
            // Merge returned seller data back into state so UI stays in sync
            const updatedVendor =
              data && (data._id || data.id)
                ? data
                : (data?.vendor ?? { ...get().vendor, ...profileData });

            const normalized = normalizeVendor(updatedVendor);
            set({
              vendor: normalized,
              isLoading: false,
            });

            return { success: true, vendor: normalized };
          } catch (error) {
            set({ isLoading: false });
            throw error;
          }
        },

        syncVendor: (updatedVendor) => {
          if (updatedVendor) {
            set({ vendor: normalizeVendor(updatedVendor) });
          }
        },

        // Initialize seller auth state from localStorage
        initialize: () => {
          const token = localStorage.getItem(accessKey);
          if (token) {
            const storedState = JSON.parse(
              localStorage.getItem(persistKey) || "{}"
            );
            const refreshToken = localStorage.getItem(refreshKey);
            const persistedVendor = storedState.state?.vendor || null;
            if (persistedVendor) {
              const normalized = normalizeVendor(persistedVendor);
              set({
                vendor: normalized,
                token,
                refreshToken: refreshToken || null,
                isAuthenticated: true,
                isLoading: false,
              });
            }
          }
        },
      }),
      {
        name: persistKey,
        storage: createJSONStorage(() => localStorage),
      }
    )
  );

export const useVendorAuthStore = createSellerAuthStore({
  apiPrefix: "/vendor",
  accessKey: "vendor-token",
  refreshKey: "vendor-refresh-token",
  persistKey: "vendor-auth-storage",
  pushScope: "vendor",
  accountLabel: "Vendor",
});
