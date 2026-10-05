import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// Remembers the vendor's selected dashboard workspace (b2c | services | wholesale).
// The effective mode is always re-validated against approved capabilities
// via resolveVendorMode() before use.
export const useVendorModeStore = create(
  persist(
    (set) => ({
      mode: null,
      setMode: (mode) => set({ mode }),
    }),
    {
      name: "vendor-dashboard-mode",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
