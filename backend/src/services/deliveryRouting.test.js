import assert from 'node:assert/strict';
import {
    DELIVERY_METHODS,
    ROUTING_REASONS,
    evaluateDeliveryRouting,
} from './deliveryRouting.service.js';
import { ShiprocketApiClient } from './shiprocket.api.js';

const settings = { maxDistanceKm: 50, maxWeightKg: 20, maxOrderValue: 50000 };
const base = {
    isWholesale: false,
    orderValue: 10000,
    weightKg: 5,
    origin: { pincode: '110001' },
    destination: { pincode: '110002' },
    pickupLocation: 'safefire_vendor_1',
    paymentMethod: 'cod',
    settings,
    distanceCalculator: async () => 35,
    serviceabilityChecker: async () => ({ serviceable: true }),
};

const route = (overrides = {}) => evaluateDeliveryRouting({ ...base, ...overrides });

assert.equal((await route()).deliveryMethod, DELIVERY_METHODS.SHIPROCKET, 'normal local B2C');

let result = await route({ distanceCalculator: async () => 80 });
assert.equal(result.deliveryRoutingReason, ROUTING_REASONS.LONG_DISTANCE, 'long distance');

result = await route({ isWholesale: true, orderValue: 999999, weightKg: 999 });
assert.equal(result.deliveryRoutingReason, ROUTING_REASONS.WHOLESALE, 'wholesale has first priority');

result = await route({ orderValue: 50001, weightKg: 999 });
assert.equal(result.deliveryRoutingReason, ROUTING_REASONS.HIGH_VALUE, 'value precedes weight');

result = await route({ weightKg: 20.01, distanceCalculator: async () => 999 });
assert.equal(result.deliveryRoutingReason, ROUTING_REASONS.OVERWEIGHT, 'weight precedes distance');

result = await route({ serviceabilityChecker: async () => ({ serviceable: false, reason: 'No courier' }) });
assert.equal(result.deliveryRoutingReason, ROUTING_REASONS.SHIPROCKET_UNSERVICEABLE, 'serviceability fallback');

result = await route({ settings: { ...settings, maxDistanceKm: 100 }, distanceCalculator: async () => 80 });
assert.equal(result.deliveryMethod, DELIVERY_METHODS.SHIPROCKET, 'dynamic distance threshold');

result = await route({ settings: { ...settings, maxWeightKg: 40 }, weightKg: 35 });
assert.equal(result.deliveryMethod, DELIVERY_METHODS.SHIPROCKET, 'dynamic weight threshold');

result = await route({ settings: { ...settings, maxOrderValue: 100000 }, orderValue: 75000 });
assert.equal(result.deliveryMethod, DELIVERY_METHODS.SHIPROCKET, 'dynamic value threshold');

const client = new ShiprocketApiClient({ mockMode: true });
const pickup = {
    pickup_location: 'safefire_vendor_test',
    name: 'SafeFire Vendor', email: 'vendor@example.com', phone: '9999999999',
    address: '1 Test Street', city: 'Delhi', state: 'Delhi', country: 'India', pin_code: '110001',
};
await client.addPickupLocation(pickup);
await client.addPickupLocation(pickup);
const pickupList = await client.getPickupLocations();
assert.equal(
    pickupList.data.shipping_address.filter((entry) => entry.pickup_location === pickup.pickup_location).length,
    1,
    'pickup creation is idempotent in provider mock'
);

console.log('Delivery routing tests passed.');
