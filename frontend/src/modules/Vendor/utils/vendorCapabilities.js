/**
 * Authoritative Vendor Capabilities Helper
 * SafeFire Dual Marketplace System
 */

export const PRODUCT_MENU_TITLES = new Set([
  'Products',
  'Brand Requests',
  'Category Requests',
  'Orders',
  'Returns & Exchanges',
  'Product Reviews',
  'Stock Management',
  'Inventory Reports',
]);

export const SERVICE_MENU_TITLES = new Set([
  'Services',
]);

/**
 * Authoritative capability evaluator for any vendor object
 *
 * @param {Object} vendor - The vendor object from useVendorAuthStore
 * @returns {Object} Normalized capability flags and badges
 */
export const getVendorCapabilities = (vendor) => {
  // If vendorCapabilities object exists, evaluate explicitly
  const caps = vendor?.vendorCapabilities || {};
  
  // Strict boolean evaluation
  const sellsProducts = caps.sellsProducts === true;
  const providesServices = caps.providesServices === true;

  const isServiceOnly = providesServices && !sellsProducts;
  const isProductOnly = sellsProducts && !providesServices;
  const isHybrid = sellsProducts && providesServices;

  // Authoritative badge definitions matching SafeFire design specifications
  let badgeText = "APPROVED SELLER";
  let badgeType = "product"; // 'product' | 'service' | 'hybrid'

  if (isServiceOnly) {
    badgeText = "SERVICE PARTNER";
    badgeType = "service";
  } else if (isHybrid) {
    badgeText = "VERIFIED PARTNER";
    badgeType = "hybrid";
  } else {
    badgeText = "APPROVED SELLER";
    badgeType = "product";
  }

  return {
    sellsProducts,
    providesServices,
    isServiceOnly,
    isProductOnly,
    isHybrid,
    badgeText,
    badgeType,
  };
};

/**
 * Filters the vendor navigation menu dynamically according to vendor capabilities.
 *
 * Business Rules:
 * 1. Product-only (sellsProducts=true, providesServices=false):
 *    -> Product menus visible, Service menus hidden.
 * 2. Service-only (sellsProducts=false, providesServices=true):
 *    -> Service menus visible, Product menus hidden.
 * 3. Hybrid (sellsProducts=true, providesServices=true):
 *    -> Both Product and Service menus visible.
 * 4. Shared menus (Dashboard, Wallet History, Support Tickets, Customers, Performance Metrics, Analytics, Earnings, Settings, Profile):
 *    -> Visible to all vendors.
 *
 * @param {Array} menu - Array of menu items from vendorMenu.json
 * @param {Object} vendor - Authenticated vendor object
 * @returns {Array} Filtered menu items
 */
export const filterVendorMenu = (menu = [], vendor) => {
  const { sellsProducts, providesServices } = getVendorCapabilities(vendor);

  return menu.filter((item) => {
    // If it's a product-specific item, only show if vendor can sell products
    if (PRODUCT_MENU_TITLES.has(item.title)) {
      return sellsProducts;
    }

    // If it's a service-specific item, only show if vendor can provide services
    if (SERVICE_MENU_TITLES.has(item.title)) {
      return providesServices;
    }

    // Shared items are always visible
    return true;
  });
};

/**
 * Groups the filtered vendor navigation menu into structured semantic categories
 * dynamically tailored to the vendor's active capabilities.
 *
 * Distinguishes the primary operational workflow (Dashboard, Services/Products)
 * from secondary shared management tools (Wallet, Earnings, Support, Analytics, Settings).
 *
 * @param {Array} filteredMenu - Filtered menu items from filterVendorMenu()
 * @param {Object} vendor - Authenticated vendor object
 * @returns {Array<{ title: string, items: Array }>} Ordered grouped menu sections
 */
export const getGroupedVendorMenu = (filteredMenu = [], vendor) => {
  const caps = getVendorCapabilities(vendor);

  const getSectionTitle = (itemTitle) => {
    if (caps.isServiceOnly) {
      if (['Dashboard', 'Services'].includes(itemTitle)) {
        return 'CORE WORKFLOW';
      }
      return 'MANAGEMENT & TOOLS';
    }

    if (caps.isProductOnly) {
      if ([
        'Dashboard',
        'Products',
        'Brand Requests',
        'Category Requests',
        'Orders',
        'Returns & Exchanges',
        'Product Reviews',
        'Stock Management',
        'Inventory Reports',
      ].includes(itemTitle)) {
        return 'CATALOG & ORDERS';
      }
      return 'MANAGEMENT & TOOLS';
    }

    // Hybrid (Products + Services)
    if ([
      'Dashboard',
      'Services',
      'Products',
      'Brand Requests',
      'Category Requests',
      'Orders',
      'Returns & Exchanges',
      'Product Reviews',
      'Stock Management',
      'Inventory Reports',
    ].includes(itemTitle)) {
      return 'CORE WORKFLOW';
    }
    return 'MANAGEMENT & TOOLS';
  };

  const SECTION_ORDER = {
    'CORE WORKFLOW': 1,
    'CATALOG & ORDERS': 1,
    'MANAGEMENT & TOOLS': 2,
  };

  const groups = {};
  for (const item of filteredMenu) {
    const sectionTitle = getSectionTitle(item.title);
    if (!groups[sectionTitle]) {
      groups[sectionTitle] = [];
    }
    groups[sectionTitle].push(item);
  }

  return Object.entries(groups)
    .sort(([a], [b]) => (SECTION_ORDER[a] || 99) - (SECTION_ORDER[b] || 99))
    .map(([title, items]) => ({ title, items }));
};

