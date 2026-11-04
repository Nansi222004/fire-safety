/**
 * Seller portals: retail Vendor (/vendor) and Wholesaler (/wholesaler).
 *
 * Wholesalers are separate accounts, but several seller pages (order detail, wallet, earnings,
 * documents, support, returns, product form) are shared. Those pages are written against /vendor
 * routes; inside the Wholesaler portal their links are mapped with sellerPath() and their
 * /vendor/* API calls are sent to /wholesaler/* by the API client.
 *
 * Note: '/wholesale' (no "r") is the customer-side wholesale storefront, not a seller portal.
 */
export const WHOLESALER_BASE = '/wholesaler';

const currentPath = () => (typeof window !== 'undefined' ? window.location.pathname : '/');

export const isWholesalerPath = (path = currentPath()) =>
  path === WHOLESALER_BASE || path.startsWith(`${WHOLESALER_BASE}/`);

export const isSellerPortalPath = (path = currentPath()) =>
  path.startsWith('/vendor') || isWholesalerPath(path);

// localStorage key of the access token for the seller portal currently open.
export const sellerTokenKey = () => (isWholesalerPath() ? 'wholesaler-token' : 'vendor-token');

// Vendor routes whose Wholesaler equivalent is not a plain prefix swap.
const WHOLESALER_ROUTE_ALIASES = [
  ['/vendor/wholesale/', `${WHOLESALER_BASE}/`],
  ['/vendor/products/manage-products', `${WHOLESALER_BASE}/products`],
  ['/vendor/settings/profile', `${WHOLESALER_BASE}/profile`],
];

/**
 * Maps a /vendor route to the route of the portal currently open.
 * Outside the Wholesaler portal the path is returned unchanged.
 */
export const sellerPath = (vendorPath) => {
  if (!isWholesalerPath() || typeof vendorPath !== 'string' || !vendorPath.startsWith('/vendor')) {
    return vendorPath;
  }
  const alias = WHOLESALER_ROUTE_ALIASES.find(([from]) => vendorPath.startsWith(from));
  if (alias) return alias[1] + vendorPath.slice(alias[0].length);
  return WHOLESALER_BASE + vendorPath.slice('/vendor'.length);
};
