import assert from 'node:assert/strict';
import { resolveProductSalesChannels } from './productChannel.service.js';

const allCapabilities = {
    vendorCapabilities: { sellsProducts: true, wholesaleEnabled: true },
    wholesaleCapability: { status: 'approved' },
};

assert.deepEqual(
    resolveProductSalesChannels({
        body: { b2cAvailable: true, wholesale: { enabled: true, price: 4200, moq: 10 } },
        ...allCapabilities,
    }),
    { b2cAvailable: true, wholesale: { enabled: true, price: 4200, moq: 10 } }
);

assert.deepEqual(
    resolveProductSalesChannels({
        body: { b2cAvailable: false, wholesale: { enabled: true, price: 4200, moq: 10 } },
        vendorCapabilities: { sellsProducts: false, wholesaleEnabled: true },
        wholesaleCapability: { status: 'approved' },
    }),
    { b2cAvailable: false, wholesale: { enabled: true, price: 4200, moq: 10 } }
);

assert.throws(
    () => resolveProductSalesChannels({
        body: { b2cAvailable: true, wholesale: { enabled: true, price: 4200, moq: 10 } },
        vendorCapabilities: { sellsProducts: true, wholesaleEnabled: false },
        wholesaleCapability: { status: 'none' },
    }),
    /Approved Wholesale\/B2B capability/
);
assert.throws(
    () => resolveProductSalesChannels({
        body: { b2cAvailable: false, wholesale: { enabled: true, price: 0, moq: 10 } },
        vendorCapabilities: { sellsProducts: false, wholesaleEnabled: true },
        wholesaleCapability: { status: 'approved' },
    }),
    /greater than 0/
);
assert.throws(
    () => resolveProductSalesChannels({
        body: { b2cAvailable: false, wholesale: { enabled: false } },
        ...allCapabilities,
    }),
    /at least one sales channel/
);

console.log('Unified product sales-channel tests passed.');
