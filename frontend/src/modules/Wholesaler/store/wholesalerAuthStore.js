import { createSellerAuthStore } from "../../Vendor/store/vendorAuthStore";

// Wholesaler (B2B seller) session — a separate account from retail vendors, with its own token keys.
export const useWholesalerAuthStore = createSellerAuthStore({
  apiPrefix: "/wholesaler",
  accessKey: "wholesaler-token",
  refreshKey: "wholesaler-refresh-token",
  persistKey: "wholesaler-auth-storage",
  pushScope: "wholesaler",
  accountLabel: "Wholesaler",
});
