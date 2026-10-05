import assert from 'node:assert/strict';
import { replacementVendorGroup } from './exchangeShipment.service.js';

const request = {
    vendorId: 'vendor-a',
    items: [{ productId: 'product-a', quantity: 2 }],
    exchangeDetails: {
        newProductPrice: 425,
        requestedVariant: { size: 'L', color: 'Red', variantKey: 'L|Red' },
    },
};
const order = {
    vendorItems: [{
        vendorId: 'vendor-a',
        vendorName: 'Vendor A',
        items: [
            { productId: 'product-a', vendorId: 'vendor-a', quantity: 5, price: 400, variantKey: 'M|Red' },
            { productId: 'product-b', vendorId: 'vendor-a', quantity: 1, price: 900 },
        ],
    }],
};

const group = replacementVendorGroup(request, order);
assert.equal(group.items.length, 1, 'Only requested exchange items should be shipped.');
assert.equal(group.items[0].quantity, 2);
assert.equal(group.items[0].price, 425);
assert.equal(group.items[0].finalLineTotal, 850);
assert.equal(group.items[0].variantKey, 'L|Red');
console.log('Exchange replacement package tests passed.');
