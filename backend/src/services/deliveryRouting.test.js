import assert from 'node:assert/strict';
import {
    DELIVERY_METHODS,
    ROUTING_REASONS,
    calculatePackageWeightKg,
    evaluateDeliveryRouting,
    productWeightKg,
} from './deliveryRouting.service.js';
import { ShiprocketApiClient } from './shiprocket.api.js';

// Routing depends ONLY on wholesale + weight. Distance and order value are not inputs.
const settings = { maxWeightKg: 20 };
const route = (overrides = {}) => evaluateDeliveryRouting({ isWholesale: false, weightKg: 5, settings, ...overrides });
const BOTH = [DELIVERY_METHODS.SHIPROCKET, DELIVERY_METHODS.INTERNAL];

assert.equal(productWeightKg({ weight: 1 }), 1, '1 means 1 kg');
assert.equal(productWeightKg({ weight: 5 }), 5, '5 means 5 kg');
assert.equal(productWeightKg({ weight: 20.01 }), 20.01, 'decimal kilograms are preserved');
const products = new Map([
    ['a', { weight: 5 }],
    ['b', { weight: 3 }],
]);
assert.equal(calculatePackageWeightKg([{ productId: 'a', quantity: 2 }], products), 10, 'weight multiplies by quantity');
assert.equal(calculatePackageWeightKg([
    { productId: 'a', quantity: 2 },
    { productId: 'b', quantity: 4 },
], products), 22, 'multi-item weights are summed in kg');

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
assert.deepEqual(route({ weightKg: 1 }).allowedDeliveryMethods, BOTH, '1 kg is eligible');
assert.deepEqual(route({ weightKg: 5 }).allowedDeliveryMethods, BOTH, '5 kg is eligible');
assert.equal(route({ weightKg: 22 }).deliveryRoutingReason, ROUTING_REASONS.OVERWEIGHT, '22 kg multi-item order → manual');
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
