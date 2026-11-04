import assert from 'node:assert/strict';
import Vendor from '../models/Vendor.model.js';
import { enforceAccountStatus } from './authorize.js';

const originalFindById = Vendor.findById;

const stubAccount = (account) => {
    Vendor.findById = () => ({ select: () => ({ lean: async () => account }) });
};

const run = async (role, account) => {
    stubAccount(account);
    const req = { user: { id: 'acc-1', role } };
    let error;
    await enforceAccountStatus(req, {}, (err) => { error = err; });
    return { req, error };
};

const approvedWholesaler = {
    accountType: 'wholesaler',
    status: 'approved',
    isVerified: true,
    vendorCapabilities: { sellsProducts: false, providesServices: false, wholesaleEnabled: true },
    wholesaleCapability: { status: 'approved' },
};

try {
    // Approved wholesaler passes the wholesaler gate.
    let result = await run('wholesaler', approvedWholesaler);
    assert.equal(result.error, undefined);
    assert.equal(result.req.vendorCapabilities.wholesaleEnabled, true);

    // A wholesaler token can never act as a retail vendor.
    result = await run('vendor', approvedWholesaler);
    assert.equal(result.error?.statusCode, 403, 'Wholesaler accounts must be rejected on vendor routes.');

    // A retail vendor can never act as a wholesaler.
    result = await run('wholesaler', { ...approvedWholesaler, accountType: 'vendor' });
    assert.equal(result.error?.statusCode, 401, 'Retail vendor accounts must be rejected on wholesaler routes.');

    // Pending (not yet admin-approved) wholesaler is blocked.
    result = await run('wholesaler', { ...approvedWholesaler, status: 'pending' });
    assert.equal(result.error?.statusCode, 403);

    // Approved account whose wholesale access was revoked is blocked.
    result = await run('wholesaler', { ...approvedWholesaler, wholesaleCapability: { status: 'rejected' } });
    assert.equal(result.error?.statusCode, 403);

    // Legacy wholesale flags on a retail vendor are ignored.
    result = await run('vendor', {
        accountType: 'vendor',
        status: 'approved',
        isVerified: true,
        vendorCapabilities: { sellsProducts: true, providesServices: false, wholesaleEnabled: true },
        wholesaleCapability: { status: 'approved' },
    });
    assert.equal(result.error, undefined);
    assert.equal(result.req.vendorCapabilities.wholesaleEnabled, false);
    assert.equal(result.req.vendorCapabilities.sellsProducts, true);
    assert.equal(result.req.wholesaleCapability.status, 'none');

    console.log('Wholesaler account separation tests passed.');
} finally {
    Vendor.findById = originalFindById;
}
