import { useVendorAuthStore } from "../../modules/Vendor/store/vendorAuthStore";
import { useWholesalerAuthStore } from "../../modules/Wholesaler/store/wholesalerAuthStore";
import { isWholesalerPath } from "../utils/sellerPortal";

/**
 * Auth store of the seller portal currently open (retail Vendor or Wholesaler).
 * Used by seller pages shared between both portals. Both stores are subscribed so the
 * hook order never changes; only the active portal's state is returned.
 */
export const useSellerAuthStore = (selector) => {
  const vendorState = useVendorAuthStore(selector);
  const wholesalerState = useWholesalerAuthStore(selector);
  return isWholesalerPath() ? wholesalerState : vendorState;
};

useSellerAuthStore.getState = () =>
  (isWholesalerPath() ? useWholesalerAuthStore : useVendorAuthStore).getState();
