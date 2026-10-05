import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import api from '../../../shared/utils/api';

// Fire-safety inspector session. Tokens live under the "worker" scope in shared/utils/api.js.
export const useWorkerAuthStore = create(
  persist(
    (set) => ({
      worker: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const data = await api.post('/worker/auth/login', {
            email: String(email || '').trim().toLowerCase(),
            password,
          });
          if (!data?.accessToken || !data?.refreshToken || !data?.worker) {
            throw new Error('Invalid login response from server.');
          }
          localStorage.setItem('worker-token', data.accessToken);
          localStorage.setItem('worker-refresh-token', data.refreshToken);
          set({ worker: data.worker, token: data.accessToken, isAuthenticated: true, isLoading: false });
          return data.worker;
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      logout: () => {
        const refreshToken = localStorage.getItem('worker-refresh-token');
        if (refreshToken) api.post('/worker/auth/logout', { refreshToken }).catch(() => {});
        localStorage.removeItem('worker-token');
        localStorage.removeItem('worker-refresh-token');
        set({ worker: null, token: null, isAuthenticated: false, isLoading: false });
      },
    }),
    {
      name: 'worker-auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ worker: state.worker, token: state.token, isAuthenticated: state.isAuthenticated }),
    }
  )
);
