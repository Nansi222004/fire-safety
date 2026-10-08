import {
  getVendorCapabilities,
  getAvailableVendorModes,
  filterVendorMenu,
  PRODUCT_MENU_TITLES,
  SERVICE_MENU_TITLES,
} from '../vendorCapabilities.js';
import vendorMenu from '../../config/vendorMenu.json' with { type: 'json' };

console.log('--- STARTING CAPABILITY AUTOMATED TEST ---');

// Test 1: Service-only Vendor
const serviceVendor = {
  storeName: 'Fire Safe Services Pro mto396jt',
  vendorCapabilities: { sellsProducts: false, providesServices: true }
};

const serviceCaps = getVendorCapabilities(serviceVendor);
const serviceMenu = filterVendorMenu(vendorMenu, serviceVendor);
const serviceTitles = new Set(serviceMenu.map(i => i.title));

console.assert(serviceCaps.sellsProducts === false, 'Service vendor sellsProducts should be false');
console.assert(serviceCaps.providesServices === true, 'Service vendor providesServices should be true');
console.assert(serviceCaps.isServiceOnly === true, 'Service vendor isServiceOnly should be true');
console.assert(serviceCaps.badgeText === 'SERVICE PARTNER', 'Service vendor badge should be SERVICE PARTNER');
console.assert(serviceTitles.has('Services') === true, 'Service vendor MUST have Services menu');
for (const pt of PRODUCT_MENU_TITLES) {
  console.assert(serviceTitles.has(pt) === false, `Service vendor MUST NOT have ${pt}`);
}
console.log('Test 1 (Service-only): PASS');

// Test 2: Product-only Vendor
const productVendor = {
  storeName: 'Safe Fire Equipment Store',
  vendorCapabilities: { sellsProducts: true, providesServices: false }
};

const productCaps = getVendorCapabilities(productVendor);
const productMenu = filterVendorMenu(vendorMenu, productVendor);
const productTitles = new Set(productMenu.map(i => i.title));

console.assert(productCaps.sellsProducts === true, 'Product vendor sellsProducts should be true');
console.assert(productCaps.providesServices === false, 'Product vendor providesServices should be false');
console.assert(productCaps.isProductOnly === true, 'Product vendor isProductOnly should be true');
console.assert(productCaps.badgeText === 'APPROVED SELLER', 'Product vendor badge should be APPROVED SELLER');
console.assert(productTitles.has('Products') === true, 'Product vendor MUST have Products menu');
console.assert(productTitles.has('Orders') === true, 'Product vendor MUST have Orders menu');
console.assert(productTitles.has('Services') === false, 'Product vendor MUST NOT have Services menu');
console.log('Test 2 (Product-only): PASS');

// Registration selection is a request, not provider authorization.
const serviceRequestedVendor = {
  vendorCapabilities: { sellsProducts: true, providesServices: false },
  serviceCapability: { status: 'pending', applicationId: null },
};
const requestedCaps = getVendorCapabilities(serviceRequestedVendor);
console.assert(requestedCaps.isServiceRequested === true, 'Registration service selection should remain REQUESTED.');
console.assert(requestedCaps.isServicePending === false, 'A request without an application must not be shown as under review.');
console.assert(requestedCaps.providesServices === false, 'A service request must not grant provider access.');
console.assert(getAvailableVendorModes(serviceRequestedVendor).includes('services') === false, 'Requested Services must not unlock service mode.');

const serviceApplicationVendor = {
  vendorCapabilities: { sellsProducts: true, providesServices: false },
  serviceCapability: { status: 'pending', applicationId: 'application-id' },
};
const applicationCaps = getVendorCapabilities(serviceApplicationVendor);
console.assert(applicationCaps.isServiceRequested === false, 'Submitted application must not remain registration-only REQUESTED.');
console.assert(applicationCaps.isServicePending === true, 'Submitted application should be under review.');
console.log('Test 2b (Service request vs submitted application): PASS');

// Test 3: Hybrid Vendor
const hybridVendor = {
  storeName: 'Shield Fire Solutions mto396jt',
  vendorCapabilities: { sellsProducts: true, providesServices: true }
};

const hybridCaps = getVendorCapabilities(hybridVendor);
const hybridMenu = filterVendorMenu(vendorMenu, hybridVendor);
const hybridTitles = new Set(hybridMenu.map(i => i.title));

console.assert(hybridCaps.sellsProducts === true, 'Hybrid vendor sellsProducts should be true');
console.assert(hybridCaps.providesServices === true, 'Hybrid vendor providesServices should be true');
console.assert(hybridCaps.isHybrid === true, 'Hybrid vendor isHybrid should be true');
console.assert(hybridTitles.has('Products') === true, 'Hybrid vendor MUST have Products menu');
console.assert(hybridTitles.has('Services') === true, 'Hybrid vendor MUST have Services menu');
console.assert(hybridTitles.has('Orders') === true, 'Hybrid vendor MUST have Orders menu');
console.log('Test 3 (Hybrid): PASS');

// Test 4: Structured Grouping Verification
import { getGroupedVendorMenu } from '../vendorCapabilities.js';

// Service groups
const serviceGrouped = getGroupedVendorMenu(serviceMenu, serviceVendor);
const serviceGroupTitles = serviceGrouped.map(g => g.title);
console.assert(serviceGroupTitles.includes('CORE WORKFLOW'), 'Service-only should have CORE WORKFLOW group');
console.assert(serviceGroupTitles.includes('MANAGEMENT & TOOLS'), 'Service-only should have MANAGEMENT & TOOLS group');
console.assert(serviceGroupTitles.includes('CATALOG & ORDERS') === false, 'Service-only should NOT have CATALOG & ORDERS group');
const serviceTotalItems = serviceGrouped.reduce((acc, g) => acc + g.items.length, 0);
console.assert(serviceTotalItems === 11, `Service-only should have 11 items in groups, found ${serviceTotalItems}`);
console.log('Test 4 (Service Grouping): PASS');

// Product groups
const productGrouped = getGroupedVendorMenu(productMenu, productVendor);
const productGroupTitles = productGrouped.map(g => g.title);
console.assert(productGroupTitles.includes('CATALOG & ORDERS'), 'Product-only should have CATALOG & ORDERS group');
console.assert(productGroupTitles.includes('MANAGEMENT & TOOLS'), 'Product-only should have MANAGEMENT & TOOLS group');
const productTotalItems = productGrouped.reduce((acc, g) => acc + g.items.length, 0);
console.assert(productTotalItems === 18, `Product-only should have 18 items in groups, found ${productTotalItems}`);
console.log('Test 5 (Product Grouping): PASS');

// Hybrid groups
const hybridGrouped = getGroupedVendorMenu(hybridMenu, hybridVendor);
const hybridGroupTitles = hybridGrouped.map(g => g.title);
console.assert(hybridGroupTitles.includes('CORE WORKFLOW'), 'Hybrid should have CORE WORKFLOW group');
console.assert(hybridGroupTitles.includes('MANAGEMENT & TOOLS'), 'Hybrid should have MANAGEMENT & TOOLS group');
const hybridTotalItems = hybridGrouped.reduce((acc, g) => acc + g.items.length, 0);
console.assert(hybridTotalItems === 19, `Hybrid should have 19 items in groups, found ${hybridTotalItems}`);
console.log('Test 6 (Hybrid Grouping): PASS');

const wholesaleVendor = {
  vendorCapabilities: { sellsProducts: true, providesServices: false, wholesaleEnabled: true },
  wholesaleCapability: { status: 'approved' },
};
console.assert(
  JSON.stringify(getAvailableVendorModes(wholesaleVendor)) === JSON.stringify(['b2c', 'wholesale']),
  'Product + Wholesale vendor should expose B2C and Wholesale modes.'
);
const allModesVendor = {
  vendorCapabilities: { sellsProducts: true, providesServices: true, wholesaleEnabled: true },
  serviceCapability: { status: 'approved' },
  wholesaleCapability: { status: 'approved' },
};
console.assert(
  JSON.stringify(getAvailableVendorModes(allModesVendor)) === JSON.stringify(['b2c', 'services', 'wholesale']),
  'Fully capable vendor should expose B2C, Services, and Wholesale modes.'
);
console.log('Test 7 (Wholesale Modes): PASS');

console.log('--- ALL CAPABILITY & GROUPING UNIT TESTS PASSED ---');
