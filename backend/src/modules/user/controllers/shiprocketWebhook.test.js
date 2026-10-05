import assert from 'node:assert/strict';
import {
    authenticateShiprocketWebhook,
    mapShiprocketWebhookStatus,
} from './shiprocketWebhook.controller.js';

assert.doesNotThrow(() => authenticateShiprocketWebhook('test-secret', 'test-secret'));
assert.throws(
    () => authenticateShiprocketWebhook('wrong-secret', 'test-secret'),
    (error) => error.statusCode === 401
);
assert.throws(
    () => authenticateShiprocketWebhook('anything', ''),
    (error) => error.statusCode === 503
);

assert.equal(mapShiprocketWebhookStatus('forward', 'delivered'), 'delivered');
assert.equal(mapShiprocketWebhookStatus('exchange_forward', 'out for delivery'), 'out_for_delivery');
assert.equal(mapShiprocketWebhookStatus('reverse', 'in transit'), 'in_transit');
assert.equal(mapShiprocketWebhookStatus('reverse', 'rto delivered'), undefined);

console.log('Shiprocket webhook authentication and direction-mapping tests passed.');
