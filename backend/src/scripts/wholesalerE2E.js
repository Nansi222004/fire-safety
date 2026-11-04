/**
 * End-to-end check of the Wholesaler account flow against a running API.
 *   register (GSTIN) → verify OTP → admin approval → wholesaler portal → B2B product →
 *   same-credential buyer login on the customer side → revoke / restore → cleanup.
 *
 * Requires: E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, test OTP enabled on the server. Optional: E2E_BASE_URL.
 */
import crypto from 'crypto';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:5001/api';
const adminEmail = process.env.E2E_ADMIN_EMAIL;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;

if (!adminEmail || !adminPassword) {
    throw new Error('E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD are required.');
}

const pick = (alphabet, length) => Array.from({ length }, () => alphabet[crypto.randomInt(alphabet.length)]).join('');
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';
// Unique, correctly formatted GSTIN per run (GSTINs are unique across wholesalers).
const randomGstin = () => `27${pick(LETTERS, 5)}${pick(DIGITS, 4)}${pick(LETTERS, 1)}${pick('123456789', 1)}Z${pick(DIGITS + LETTERS, 1)}`;

const stamp = `${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
const credentials = {
    businessName: 'SafeFire Wholesaler E2E Test',
    name: 'SafeFire Wholesaler Tester',
    email: `safefire.wholesaler.e2e.${stamp}@example.com`,
    password: `SfE2E!${crypto.randomBytes(9).toString('base64url')}9a`,
    phone: '9876543210',
    gstNumber: randomGstin(),
};

const request = async (path, { method = 'GET', token, body, expected = [200] } = {}) => {
    const response = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: {
            ...(body ? { 'Content-Type': 'application/json' } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    let payload = {};
    try { payload = await response.json(); } catch { /* no body */ }
    if (!expected.includes(response.status)) {
        throw new Error(`${method} ${path} returned ${response.status}: ${payload?.message || 'Unknown error'}`);
    }
    return { status: response.status, data: payload?.data, payload };
};

let wholesalerId = null;
let userId = null;
let productId = null;
let adminToken = null;
let wholesalerToken = null;
let userToken = null;
const checks = {};

try {
    await request('/wholesaler/auth/register', {
        method: 'POST',
        expected: [201],
        body: {
            name: credentials.name,
            email: credentials.email,
            password: credentials.password,
            phone: credentials.phone,
            businessName: credentials.businessName,
            gstNumber: credentials.gstNumber,
            businessType: 'Distributor',
            expectedMonthlyVolume: '100-500 units',
            description: 'Dedicated SafeFire wholesaler E2E verification account.',
            address: {
                street: '101 SafeFire E2E Test Road',
                city: 'Mumbai',
                state: 'Maharashtra',
                zipCode: '400001',
                country: 'India',
            },
            documents: {
                license: '/uploads/e2e/wholesaler-gst-certificate.pdf',
                identity: '/uploads/e2e/wholesaler-identity-proof.pdf',
            },
        },
    });
    checks.registration = true;

    const duplicateGstin = await request('/wholesaler/auth/register', {
        method: 'POST',
        expected: [409],
        body: {
            name: credentials.name,
            email: `dup.${credentials.email}`,
            password: credentials.password,
            phone: credentials.phone,
            businessName: credentials.businessName,
            gstNumber: credentials.gstNumber,
            address: { street: '1 Road', city: 'Mumbai', state: 'Maharashtra', zipCode: '400001', country: 'India' },
            documents: { license: '/uploads/e2e/a.pdf', identity: '/uploads/e2e/b.pdf' },
        },
    });
    checks.duplicateGstinRejected = duplicateGstin.status === 409;

    await request('/wholesaler/auth/verify-otp', {
        method: 'POST',
        body: { email: credentials.email, otp: '123456' },
    });
    checks.emailVerification = true;

    const pendingLogin = await request('/wholesaler/auth/login', {
        method: 'POST',
        body: { email: credentials.email, password: credentials.password },
        expected: [403],
    });
    checks.pendingLoginBlocked = pendingLogin.status === 403;

    const adminLogin = await request('/admin/auth/login', {
        method: 'POST',
        body: { email: adminEmail, password: adminPassword },
    });
    adminToken = adminLogin.data.accessToken;

    const pending = await request(`/admin/wholesale/applications?status=pending&search=${encodeURIComponent(credentials.email)}`, {
        token: adminToken,
    });
    const pendingWholesaler = pending.data.vendors.find((v) => v.email === credentials.email);
    if (!pendingWholesaler) throw new Error('Registered wholesaler did not appear in Admin Wholesalers (pending).');
    wholesalerId = pendingWholesaler._id;
    if (pendingWholesaler.wholesaleCapability?.businessDetails?.gstNumber !== credentials.gstNumber) {
        throw new Error('GSTIN was not stored on the wholesaler application.');
    }
    checks.pendingAdminList = true;

    const retailList = await request(`/admin/vendors?search=${encodeURIComponent(credentials.email)}&limit=20`, { token: adminToken });
    if (retailList.data.vendors.some((v) => v.email === credentials.email)) {
        throw new Error('Wholesaler appeared in the retail vendor list.');
    }
    checks.excludedFromRetailVendorList = true;

    const approved = await request(`/admin/wholesale/applications/${wholesalerId}/approve`, { method: 'POST', token: adminToken });
    if (
        approved.data.status !== 'approved'
        || approved.data.vendorCapabilities?.wholesaleEnabled !== true
        || approved.data.vendorCapabilities?.sellsProducts !== false
        || approved.data.wholesaleCapability?.status !== 'approved'
    ) {
        throw new Error('Approval did not activate the account with wholesale-only capability.');
    }
    checks.approval = true;

    const vendorPortalLogin = await request('/vendor/auth/login', {
        method: 'POST',
        body: { email: credentials.email, password: credentials.password },
        expected: [401],
    });
    checks.vendorPortalLoginRejected = vendorPortalLogin.status === 401;

    const wholesalerLogin = await request('/wholesaler/auth/login', {
        method: 'POST',
        body: { email: credentials.email, password: credentials.password },
    });
    wholesalerToken = wholesalerLogin.data.accessToken;
    if (wholesalerLogin.data.vendor?.accountType !== 'wholesaler') throw new Error('Login did not return a wholesaler account.');
    checks.wholesalerLogin = true;

    const vendorApiWithWholesalerToken = await request('/vendor/orders', { token: wholesalerToken, expected: [403] });
    checks.vendorApiRejectsWholesalerToken = vendorApiWithWholesalerToken.status === 403;

    const categories = await request('/categories/all');
    const categoryList = Array.isArray(categories.data) ? categories.data : (categories.data?.categories || []);
    const category = categoryList.find((item) => item.isActive !== false);
    if (!category) throw new Error('No active category is available for the wholesale product test.');

    const createdProduct = await request('/wholesaler/products', {
        method: 'POST',
        token: wholesalerToken,
        expected: [201],
        body: {
            name: `SafeFire Wholesaler E2E Product ${stamp}`,
            description: 'Temporary product for wholesaler price and MOQ verification.',
            categoryId: category._id || category.id,
            price: 4200,
            // A wholesaler can never list a product for retail, whatever the client sends.
            b2cAvailable: true,
            wholesale: { enabled: true, price: 4200, moq: 10 },
            stockQuantity: 100,
            lowStockThreshold: 10,
            weight: 1,
            dimensions: { length: 30, breadth: 20, height: 15 },
        },
    });
    productId = createdProduct.data._id;
    if (
        createdProduct.data.b2cAvailable !== false
        || createdProduct.data.wholesale?.price !== 4200
        || createdProduct.data.wholesale?.moq !== 10
    ) {
        throw new Error('Wholesaler product was not stored as B2B-only with its price/MOQ.');
    }
    checks.productWholesaleOnly = true;

    const repriced = await request(`/wholesaler/products/${productId}/pricing`, {
        method: 'PATCH',
        token: wholesalerToken,
        body: { wholesalePrice: 4100, moq: 12, stockQuantity: 80 },
    });
    if (repriced.data.wholesale?.price !== 4100 || repriced.data.wholesale?.moq !== 12 || repriced.data.stockQuantity !== 80) {
        throw new Error('Pricing & stock update was not applied.');
    }
    checks.pricingAndStockUpdate = true;

    const listed = await request('/wholesaler/products?limit=50', { token: wholesalerToken });
    if (!listed.data.products.some((p) => String(p._id) === String(productId))) {
        throw new Error('Wholesaler product listing did not include the new product.');
    }
    const dashboard = await request('/wholesaler/dashboard', { token: wholesalerToken });
    if (dashboard.data.products.total < 1 || dashboard.data.business.gstNumber !== credentials.gstNumber) {
        throw new Error('Wholesaler dashboard summary is incorrect.');
    }
    checks.portalListingAndDashboard = true;

    await request(`/vendors/${wholesalerId}`, { expected: [404] });
    checks.notListedAsPublicRetailSeller = true;

    const userLogin = await request('/user/auth/login', {
        method: 'POST',
        body: { email: credentials.email, password: credentials.password },
    });
    userToken = userLogin.data.accessToken;
    userId = userLogin.data.user.id;
    if (userLogin.data.user.wholesaleAccess !== true) throw new Error('Same-credential customer login did not grant wholesale access.');
    checks.sameCredentialBuyerLogin = true;

    const catalog = await request('/user/wholesale/products?limit=60', { token: userToken });
    if (catalog.data.products.some((p) => String(p._id) === String(productId))) {
        throw new Error('Buyer was allowed to see its own wholesale product.');
    }
    checks.buyerCatalogExcludesOwnProducts = true;

    await request(`/admin/wholesale/applications/${wholesalerId}/reject`, {
        method: 'POST',
        token: adminToken,
        body: { reason: 'Temporary revoke for E2E verification.' },
    });
    const revokedAccess = await request('/user/wholesale/access', { token: userToken });
    if (revokedAccess.data.wholesaleAccess !== false) throw new Error('Revoked wholesaler kept buyer access.');
    await request('/wholesaler/dashboard', { token: wholesalerToken, expected: [403] });
    checks.revokeBlocksPortalAndBuying = true;

    await request(`/admin/wholesale/applications/${wholesalerId}/approve`, { method: 'POST', token: adminToken });
    const restoredAccess = await request('/user/wholesale/access', { token: userToken });
    if (restoredAccess.data.wholesaleAccess !== true) throw new Error('Re-approved wholesaler did not regain buyer access.');
    checks.reapproveRestoresAccess = true;

    const protectedDelete = await request(`/admin/vendors/${wholesalerId}`, { method: 'DELETE', token: adminToken, expected: [409] });
    checks.deleteProtectedWithProduct = protectedDelete.status === 409;

    await request(`/wholesaler/products/${productId}`, { method: 'DELETE', token: wholesalerToken });
    productId = null;
    await request(`/admin/vendors/${wholesalerId}`, { method: 'DELETE', token: adminToken });
    checks.cleanup = true;

    console.log(JSON.stringify({ success: true, wholesaler: { email: credentials.email, gstNumber: credentials.gstNumber, wholesalerId, userId }, checks }, null, 2));
} catch (error) {
    console.error(JSON.stringify({
        success: false,
        error: error.message,
        wholesaler: { email: credentials.email, password: credentials.password, gstNumber: credentials.gstNumber, wholesalerId, userId, productId },
        checks,
    }, null, 2));
    process.exitCode = 1;
}
