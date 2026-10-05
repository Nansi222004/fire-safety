import assert from 'node:assert/strict';
import Vendor from '../models/Vendor.model.js';
import { resolveWholesaleLine, verifyWholesaleVendorCredentials } from './wholesale.service.js';

const originalFindOne = Vendor.findOne;
let capturedFilter;
let comparedPassword;

try {
    Vendor.findOne = (filter) => {
        capturedFilter = filter;
        return {
            select: async () => ({
                comparePassword: async (password) => {
                    comparedPassword = password;
                    return password === 'CorrectVendorPassword!';
                },
            }),
        };
    };

    assert.equal(
        await verifyWholesaleVendorCredentials('approved@example.com', 'CorrectVendorPassword!'),
        true
    );
    assert.equal(capturedFilter.email, 'approved@example.com');
    assert.equal(capturedFilter.status, 'approved');
    assert.equal(capturedFilter['vendorCapabilities.wholesaleEnabled'], true);
    assert.equal(capturedFilter['wholesaleCapability.status'], 'approved');
    assert.equal(capturedFilter.isVerified, true);
    assert.equal(comparedPassword, 'CorrectVendorPassword!');

    assert.equal(
        await verifyWholesaleVendorCredentials('approved@example.com', 'WrongPassword!'),
        false
    );
    assert.equal(await verifyWholesaleVendorCredentials('', 'anything'), false);

    const product = {
        _id: 'product-a',
        name: 'ABC Extinguisher',
        vendorId: 'seller-a',
        wholesale: { enabled: true, price: 4200, moq: 10 },
        stock: 'in_stock',
        stockQuantity: 50,
    };
    assert.deepEqual(
        resolveWholesaleLine(product, 10, {
            buyerVendorId: 'buyer-a',
            sellerVendor: {
                status: 'approved',
                vendorCapabilities: { wholesaleEnabled: true },
                wholesaleCapability: { status: 'approved' },
            },
        }),
        { price: 4200, moq: 10 },
        'Wholesale price and MOQ must be resolved from backend product data.'
    );
    assert.throws(
        () => resolveWholesaleLine(product, 9, { buyerVendorId: 'buyer-a' }),
        /Minimum order quantity/
    );
    console.log('Wholesale same-credential verification tests passed.');
} finally {
    Vendor.findOne = originalFindOne;
}
