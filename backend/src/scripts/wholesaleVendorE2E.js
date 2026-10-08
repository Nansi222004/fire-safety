import crypto from 'crypto';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:5001/api';
const adminEmail = process.env.E2E_ADMIN_EMAIL;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;

if (!adminEmail || !adminPassword) {
    throw new Error('E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD are required.');
}

const stamp = `${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
const credentials = {
    businessName: 'SafeFire Wholesale E2E Test',
    name: 'SafeFire Wholesale Tester',
    email: `safefire.wholesale.e2e.${stamp}@example.com`,
    password: `SfE2E!${crypto.randomBytes(9).toString('base64url')}9a`,
    phone: '9876543210',
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

let vendorId = null;
let userId = null;
let productId = null;
let adminToken = null;
let vendorToken = null;
let userToken = null;
const checks = {};

try {
    await request('/vendor/auth/register', {
        method: 'POST',
        expected: [201],
        body: {
            name: credentials.name,
            email: credentials.email,
            password: credentials.password,
            phone: credentials.phone,
            storeName: credentials.businessName,
            storeDescription: 'Dedicated wholesale end-to-end verification account.',
            address: {
                street: '101 SafeFire E2E Test Road',
                city: 'Mumbai',
                state: 'Maharashtra',
                zipCode: '400001',
                country: 'India',
            },
            documents: {
                license: '/uploads/e2e/wholesale-business-license.pdf',
                identity: '/uploads/e2e/wholesale-identity-proof.pdf',
            },
            vendorCapabilities: { sellsProducts: true, providesServices: false },
            requestWholesale: true,
            wholesaleDetails: {
                businessType: 'Wholesale fire-safety distributor',
                gstNumber: '27ABCDE1234F1Z5',
                expectedMonthlyVolume: '100-500 units',
                description: 'Dedicated SafeFire wholesale E2E verification application.',
            },
        },
    });
    checks.registration = true;

    await request('/vendor/auth/verify-otp', {
        method: 'POST',
        body: { email: credentials.email, otp: '123456' },
    });
    checks.emailVerification = true;

    const adminLogin = await request('/admin/auth/login', {
        method: 'POST',
        body: { email: adminEmail, password: adminPassword },
    });
    adminToken = adminLogin.data.accessToken;

    const pending = await request(`/admin/vendors/pending?search=${encodeURIComponent(credentials.email)}&limit=20`, {
        token: adminToken,
    });
    const pendingVendor = pending.data.vendors.find((vendor) => vendor.email === credentials.email);
    if (!pendingVendor) throw new Error('Registered vendor did not appear in Admin pending approvals.');
    vendorId = pendingVendor.id || pendingVendor._id;
    if (pendingVendor.wholesaleCapability?.status !== 'pending') {
        throw new Error('Wholesale application was not stored as pending.');
    }
    checks.pendingAdminList = true;

    const viewedPending = await request(`/admin/vendors/${vendorId}`, { token: adminToken });
    if (String(viewedPending.data._id) !== String(vendorId)) throw new Error('Admin View returned a different vendor.');
    checks.view = true;

    const approved = await request(`/admin/vendors/${vendorId}/status`, {
        method: 'PATCH',
        token: adminToken,
        body: { status: 'approved' },
    });
    if (
        approved.data.status !== 'approved'
        || approved.data.vendorCapabilities?.sellsProducts !== true
        || approved.data.vendorCapabilities?.providesServices !== false
        || approved.data.vendorCapabilities?.wholesaleEnabled !== true
        || approved.data.wholesaleCapability?.status !== 'approved'
    ) {
        throw new Error('Admin approval did not preserve B2C and enable Wholesale capability correctly.');
    }
    checks.approval = true;

    const edited = await request(`/admin/vendors/${vendorId}`, {
        method: 'PATCH',
        token: adminToken,
        body: { storeDescription: 'Wholesale E2E account verified through Admin Edit.' },
    });
    if (String(edited.data._id) !== String(vendorId) || !edited.data.storeDescription.includes('Admin Edit')) {
        throw new Error('Admin Edit did not update the intended vendor.');
    }
    checks.edit = true;

    const vendorLogin = await request('/vendor/auth/login', {
        method: 'POST',
        body: { email: credentials.email, password: credentials.password },
    });
    vendorToken = vendorLogin.data.accessToken;
    checks.vendorLogin = true;

    const wrongLogin = await request('/user/auth/login', {
        method: 'POST',
        body: { email: credentials.email, password: `${credentials.password}-wrong` },
        expected: [401],
    });
    checks.wrongPasswordRejected = wrongLogin.status === 401;

    const userLogin = await request('/user/auth/login', {
        method: 'POST',
        body: { email: credentials.email, password: credentials.password },
    });
    userToken = userLogin.data.accessToken;
    userId = userLogin.data.user.id;
    if (userLogin.data.user.wholesaleAccess !== true) throw new Error('User login did not expose Wholesale access.');
    checks.sameCredentialUserLogin = true;

    const access = await request('/user/wholesale/access', { token: userToken });
    if (access.data.wholesaleAccess !== true) throw new Error('Wholesale access endpoint returned false after approval.');
    checks.wholesaleAuthorization = true;

    const categories = await request('/categories/all');
    const categoryList = Array.isArray(categories.data)
        ? categories.data
        : (categories.data?.categories || []);
    const category = categoryList.find((item) => item.isActive !== false);
    if (!category) throw new Error('No active category is available for the Wholesale product test.');

    const createdProduct = await request('/vendor/products', {
        method: 'POST',
        token: vendorToken,
        expected: [201],
        body: {
            name: `SafeFire Wholesale E2E Product ${stamp}`,
            description: 'Temporary product for Wholesale price and MOQ verification.',
            categoryId: category._id || category.id,
            price: 5000,
            originalPrice: 6000,
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
        createdProduct.data.price !== 5000
        || createdProduct.data.wholesale?.price !== 4200
        || createdProduct.data.wholesale?.moq !== 10
        || createdProduct.data.b2cAvailable !== true
    ) {
        throw new Error('Wholesale product price/MOQ/B2C fields were not persisted correctly.');
    }
    checks.productPricingAndMoqPersisted = true;

    const vendorProducts = await request('/vendor/wholesale/products?scope=wholesale&limit=50', { token: vendorToken });
    const listed = vendorProducts.data.products.find((product) => String(product._id) === String(productId));
    if (!listed || listed.wholesale?.price !== 4200 || listed.wholesale?.moq !== 10) {
        throw new Error('Vendor Wholesale product listing did not return the configured pricing/MOQ.');
    }
    checks.vendorWholesaleProductVisible = true;

    const catalog = await request('/user/wholesale/products?limit=60', { token: userToken });
    if (catalog.data.products.some((product) => String(product._id) === String(productId))) {
        throw new Error('Buyer was incorrectly allowed to see its own Wholesale product.');
    }
    checks.userCatalogAuthorizedAndOwnProductExcluded = true;

    await request(`/admin/vendors/${vendorId}/status`, {
        method: 'PATCH',
        token: adminToken,
        body: { status: 'suspended', reason: 'Temporary suspension for focused E2E verification.' },
    });
    const suspendedAccess = await request('/user/wholesale/access', { token: userToken });
    if (suspendedAccess.data.wholesaleAccess !== false) throw new Error('Suspended vendor retained Wholesale access.');
    checks.suspend = true;

    await request(`/admin/vendors/${vendorId}/status`, {
        method: 'PATCH',
        token: adminToken,
        body: { status: 'approved' },
    });
    const reactivatedAccess = await request('/user/wholesale/access', { token: userToken });
    if (reactivatedAccess.data.wholesaleAccess !== true) throw new Error('Reactivated vendor did not regain Wholesale access.');
    checks.activate = true;

    const protectedDelete = await request(`/admin/vendors/${vendorId}`, {
        method: 'DELETE',
        token: adminToken,
        expected: [409],
    });
    checks.deleteProtectedWithProduct = protectedDelete.status === 409;

    await request(`/vendor/products/${productId}`, { method: 'DELETE', token: vendorToken });
    productId = null;

    await request(`/admin/vendors/${vendorId}`, { method: 'DELETE', token: adminToken });
    checks.deleteUnusedVendor = true;

    const afterDelete = await request(`/admin/vendors?search=${encodeURIComponent(credentials.email)}&limit=20`, {
        token: adminToken,
    });
    if (afterDelete.data.vendors.some((vendor) => vendor.email === credentials.email)) {
        throw new Error('Deleted vendor still appears in Admin vendor list.');
    }
    checks.deletedVendorRemovedFromList = true;

    const customerAfterVendorDelete = await request('/user/auth/login', {
        method: 'POST',
        body: { email: credentials.email, password: credentials.password },
    });
    if (customerAfterVendorDelete.data.user.wholesaleAccess !== false) {
        throw new Error('Customer retained Wholesale access after vendor deletion.');
    }
    checks.customerPreservedWithoutWholesaleAfterVendorDelete = true;

    console.log(JSON.stringify({
        success: true,
        testWholesaleVendor: {
            businessName: credentials.businessName,
            email: credentials.email,
            password: credentials.password,
            phone: credentials.phone,
            vendorId,
            userId,
            finalVendorState: 'deleted after successful protected-delete verification',
        },
        checks,
    }, null, 2));
} catch (error) {
    console.error(JSON.stringify({
        success: false,
        error: error.message,
        testWholesaleVendor: {
            businessName: credentials.businessName,
            email: credentials.email,
            password: credentials.password,
            phone: credentials.phone,
            vendorId,
            userId,
        },
        checks,
    }, null, 2));
    process.exitCode = 1;
}
