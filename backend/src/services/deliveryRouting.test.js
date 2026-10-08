import assert from 'node:assert/strict';
import {
    DELIVERY_METHODS,
    ROUTING_REASONS,
    evaluateDeliveryRouting,
} from './deliveryRouting.service.js';
import { ShiprocketApiClient } from './shiprocket.api.js';

// Routing depends ONLY on wholesale + weight. Distance and order value are not inputs.
const settings = { maxWeightKg: 20 };
const route = (overrides = {}) => evaluateDeliveryRouting({ isWholesale: false, weightKg: 5, settings, ...overrides });
const BOTH = [DELIVERY_METHODS.SHIPROCKET, DELIVERY_METHODS.INTERNAL];

let result = route();
assert.equal(result.deliveryMethod, null, 'normal B2C waits for vendor choice');
assert.deepEqual(result.allowedDeliveryMethods, BOTH, 'normal B2C: Shiprocket + Manual');
assert.equal(result.deliveryRoutingReason, null);

result = route({ isWholesale: true, weightKg: 1 });
assert.equal(result.deliveryMethod, DELIVERY_METHODS.INTERNAL, 'wholesale → manual');
assert.deepEqual(result.allowedDeliveryMethods, [DELIVERY_METHODS.INTERNAL]);
assert.equal(result.deliveryRoutingReason, ROUTING_REASONS.WHOLESALE);

result = route({ weightKg: 25 });
assert.equal(result.deliveryRoutingReason, ROUTING_REASONS.OVERWEIGHT, 'overweight → manual');
assert.deepEqual(result.allowedDeliveryMethods, [DELIVERY_METHODS.INTERNAL]);

assert.deepEqual(route({ weightKg: 20 }).allowedDeliveryMethods, BOTH, 'exactly at the limit stays Shiprocket-eligible');
assert.equal(route({ weightKg: 20.01 }).deliveryRoutingReason, ROUTING_REASONS.OVERWEIGHT, 'just over the limit → manual');
assert.deepEqual(route({ settings: { maxWeightKg: 40 }, weightKg: 35 }).allowedDeliveryMethods, BOTH, 'configurable weight limit');

// Inputs that used to force INTERNAL (distance / value) no longer exist in routing.
result = route({ orderValue: 999999, distanceKm: 9999, origin: {}, destination: {} });
assert.deepEqual(result.allowedDeliveryMethods, BOTH, 'distance / order value have no influence');
assert.ok(!['LONG_DISTANCE', 'DISTANCE_UNAVAILABLE', 'HIGH_VALUE'].includes(result.deliveryRoutingReason));

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
