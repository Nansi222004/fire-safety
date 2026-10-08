import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:5004/api';
const adminEmail = process.env.E2E_ADMIN_EMAIL;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;

if (!adminEmail || !adminPassword) {
    throw new Error('E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD are required.');
}

const stamp = `${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
const password = `SfCaps!${crypto.randomBytes(8).toString('base64url')}9a`;
const seller = {
    name: 'SafeFire Capability E2E Seller',
    storeName: 'SafeFire All Capabilities E2E',
    email: `safefire.capabilities.seller.${stamp}@example.com`,
    password,
    phone: '9876543211',
};
const buyer = {
    name: 'SafeFire Wholesale E2E Buyer',
    storeName: 'SafeFire Wholesale Buyer E2E',
    email: `safefire.capabilities.buyer.${stamp}@example.com`,
    password: `${password}B`,
    phone: '9876543212',
};
const normalUser = {
    name: 'SafeFire Normal E2E User',
    email: `safefire.capabilities.normal.${stamp}@example.com`,
    password: `${password}U`,
    phone: '9876543213',
};

const state = {
    adminToken: null,
    sellerVendorId: null,
    buyerVendorId: null,
    sellerToken: null,
    buyerUserToken: null,
    normalUserToken: null,
    serviceApplicationId: null,
    productId: null,
    b2bOnlyProductId: null,
};
const checks = {};

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

const registerVendor = async (details, capabilities) => {
    await request('/vendor/auth/register', {
        method: 'POST',
        expected: [201],
        body: {
            ...details,
            storeDescription: 'Controlled SafeFire capability end-to-end verification account.',
            address: {
                street: '101 SafeFire Capability Test Road',
                city: 'Mumbai',
                state: 'Maharashtra',
                zipCode: '400001',
                country: 'India',
            },
            documents: {
                license: '/uploads/e2e/capability-business-license.pdf',
                identity: '/uploads/e2e/capability-identity-proof.pdf',
            },
            vendorCapabilities: {
                sellsProducts: capabilities.sellsProducts,
                providesServices: capabilities.providesServices,
            },
            requestWholesale: capabilities.wholesale,
            wholesaleDetails: capabilities.wholesale ? {
                businessType: 'Fire safety distributor',
                gstNumber: '27ABCDE1234F1Z5',
                expectedMonthlyVolume: '100-500 units',
                description: 'Controlled SafeFire capability E2E verification.',
            } : undefined,
        },
    });
    await request('/vendor/auth/verify-otp', {
        method: 'POST',
        body: { email: details.email, otp: '123456' },
    });
};

const findAndApproveVendor = async (email) => {
    const pending = await request(`/admin/vendors/pending?search=${encodeURIComponent(email)}&limit=20`, {
        token: state.adminToken,
    });
    const vendor = pending.data.vendors.find((item) => item.email === email);
    if (!vendor) throw new Error(`Registered vendor ${email} did not appear in Admin pending approvals.`);
    const vendorId = vendor.id || vendor._id;
    const approved = await request(`/admin/vendors/${vendorId}/status`, {
        method: 'PATCH',
        token: state.adminToken,
        body: { status: 'approved' },
    });
    return { vendorId, vendor: approved.data };
};

const cleanup = async () => {
    // Use application APIs for ordinary cleanup. The service application has no
    // deletion endpoint, so remove only this script's exact temporary record.
    if (state.normalUserToken) {
        await request('/user/auth/account', { method: 'DELETE', token: state.normalUserToken, expected: [200, 404] }).catch(() => null);
    }
    if (state.buyerUserToken) {
        await request('/user/auth/account', { method: 'DELETE', token: state.buyerUserToken, expected: [200, 404] }).catch(() => null);
    }
    for (const productId of [state.productId, state.b2bOnlyProductId]) {
        if (productId && state.sellerToken) {
            await request(`/vendor/products/${productId}`, { method: 'DELETE', token: state.sellerToken, expected: [200, 404] }).catch(() => null);
        }
    }

    if (state.serviceApplicationId) {
        const mongoose = (await import('mongoose')).default;
        const { default: ServicePartnerApplication } = await import('../models/ServicePartnerApplication.model.js');
        const { default: Notification } = await import('../models/Notification.model.js');
        if (mongoose.connection.readyState === 0) await mongoose.connect(process.env.MONGO_URI);
        await ServicePartnerApplication.deleteOne({
            _id: state.serviceApplicationId,
            vendorId: state.sellerVendorId,
        });
        await Notification.deleteMany({
            $or: [
                { 'data.applicationId': String(state.serviceApplicationId) },
                { 'data.vendorId': String(state.sellerVendorId) },
            ],
        });
        await mongoose.disconnect();
    }

    for (const vendorId of [state.buyerVendorId, state.sellerVendorId]) {
        if (vendorId && state.adminToken) {
            await request(`/admin/vendors/${vendorId}`, {
                method: 'DELETE',
                token: state.adminToken,
                expected: [200, 404],
            }).catch(() => null);
        }
    }
};

try {
    const adminLogin = await request('/admin/auth/login', {
        method: 'POST',
        body: { email: adminEmail, password: adminPassword },
    });
    state.adminToken = adminLogin.data.accessToken;

    await registerVendor(seller, { sellsProducts: true, providesServices: true, wholesale: true });
    checks.allCapabilitiesRegistration = true;
    const approvedSeller = await findAndApproveVendor(seller.email);
    state.sellerVendorId = approvedSeller.vendorId;
    if (
        approvedSeller.vendor.vendorCapabilities?.sellsProducts !== true
        || approvedSeller.vendor.vendorCapabilities?.providesServices !== false
        || approvedSeller.vendor.vendorCapabilities?.wholesaleEnabled !== true
        || approvedSeller.vendor.serviceCapability?.status !== 'pending'
        || approvedSeller.vendor.serviceCapability?.applicationId
        || approvedSeller.vendor.wholesaleCapability?.status !== 'approved'
    ) {
        throw new Error('Registration capability intent was not preserved independently after account approval.');
    }
    checks.serviceRequestedNotAutoApproved = true;

    const sellerLogin = await request('/vendor/auth/login', {
        method: 'POST',
        body: { email: seller.email, password: seller.password },
    });
    state.sellerToken = sellerLogin.data.accessToken;

    const preApprovalServices = await request('/vendor/services/available', {
        token: state.sellerToken,
        expected: [403],
    });
    checks.serviceManagementProtectedBeforeApproval = preApprovalServices.status === 403;

    const categories = await request('/service-categories/all');
    const activeCategories = Array.isArray(categories.data) ? categories.data : [];
    if (!activeCategories.length) throw new Error('No active Service Master categories were returned.');
    checks.serviceCategoriesLoaded = activeCategories.length;

    const selectedCategory = activeCategories[0];
    const serviceApplication = await request('/vendor/service-partner-applications', {
        method: 'POST',
        token: state.sellerToken,
        expected: [201],
        body: {
            businessDescription: 'Controlled E2E service partner application for fire safety capability verification.',
            serviceExperienceYears: 5,
            requestedServiceCategories: [selectedCategory._id],
            requestedServiceAreas: ['400001', '400002'],
            certifications: [],
            documents: [],
            additionalInformation: 'Temporary automated verification record.',
        },
    });
    state.serviceApplicationId = serviceApplication.data._id;
    const currentApplication = await request('/vendor/service-partner-applications/current', {
        token: state.sellerToken,
    });
    const persistedCategories = currentApplication.data.application?.applicationData?.requestedServiceCategories || [];
    const persistedAreas = currentApplication.data.application?.applicationData?.requestedServiceAreas || [];
    if (
        String(persistedCategories[0]?._id || persistedCategories[0]) !== String(selectedCategory._id)
        || !persistedAreas.includes('400001')
    ) {
        throw new Error('Selected Service category or coverage area did not persist.');
    }
    checks.serviceSelectionPersisted = true;

    await request(`/admin/service-partner-applications/${state.serviceApplicationId}/approve`, {
        method: 'POST',
        token: state.adminToken,
        body: { adminNotes: 'Approved for controlled capability E2E verification.' },
    });
    const sellerProfile = await request('/vendor/auth/profile', { token: state.sellerToken });
    if (
        sellerProfile.data.vendorCapabilities?.sellsProducts !== true
        || sellerProfile.data.vendorCapabilities?.providesServices !== true
        || sellerProfile.data.vendorCapabilities?.wholesaleEnabled !== true
        || sellerProfile.data.serviceCapability?.status !== 'approved'
        || sellerProfile.data.wholesaleCapability?.status !== 'approved'
    ) {
        throw new Error('Approved seller did not expose all three independent capabilities.');
    }
    checks.allCapabilitiesApproved = true;
    await request('/vendor/services/available', { token: state.sellerToken });
    checks.serviceManagementAllowedAfterApproval = true;

    const categoryResponse = await request('/categories/all');
    const productCategory = (Array.isArray(categoryResponse.data) ? categoryResponse.data : [])
        .find((item) => item.isActive !== false);
    if (!productCategory) throw new Error('No active product category exists for Wholesale E2E.');

    const product = await request('/vendor/products', {
        method: 'POST',
        token: state.sellerToken,
        expected: [201],
        body: {
            name: `SafeFire E2E Wholesale Extinguisher ${stamp}`,
            description: 'Controlled temporary product for wholesale catalog, price and MOQ verification.',
            categoryId: productCategory._id,
            price: 5000,
            originalPrice: 6000,
            b2cAvailable: true,
            wholesale: { enabled: true, price: 4200, moq: 10 },
            stockQuantity: 200,
            lowStockThreshold: 10,
            weight: 1,
            dimensions: { length: 30, breadth: 20, height: 15 },
            image: 'https://example.com/safefire-e2e-extinguisher-main.jpg',
            images: [
                'https://example.com/safefire-e2e-extinguisher-main.jpg',
                'https://example.com/safefire-e2e-extinguisher-gallery.jpg',
            ],
            unit: 'Piece',
            hsnCode: '84241000',
        },
    });
    state.productId = product.data._id;
    if (
        product.data.price !== 5000
        || product.data.originalPrice !== 6000
        || product.data.b2cAvailable !== true
        || product.data.wholesale?.enabled !== true
        || product.data.wholesale?.price !== 4200
        || product.data.wholesale?.moq !== 10
        || product.data.stockQuantity !== 200
        || product.data.images?.length !== 2
    ) {
        throw new Error('Canonical product endpoint did not preserve the complete B2C+B2B product data.');
    }
    checks.wholesaleProductCreated = true;

    const vendorProductList = await request('/vendor/products?limit=100', { token: state.sellerToken });
    if (!vendorProductList.data.products.some((item) => String(item._id) === String(state.productId))) {
        throw new Error('Unified product did not appear in the normal Vendor Products list.');
    }
    checks.vendorProductsList = true;

    const vendorWholesaleList = await request('/vendor/wholesale/products?scope=wholesale&limit=100', {
        token: state.sellerToken,
    });
    if (!vendorWholesaleList.data.products.some((item) => String(item._id) === String(state.productId))) {
        throw new Error('Unified product did not appear in the Vendor Wholesale Products list.');
    }
    checks.vendorWholesaleList = true;

    const editedProduct = await request(`/vendor/products/${state.productId}`, {
        method: 'PUT',
        token: state.sellerToken,
        body: {
            description: 'Edited through the canonical Product edit endpoint while preserving independent channel pricing.',
            price: 5000,
            originalPrice: 6000,
            b2cAvailable: true,
            wholesale: { enabled: true, price: 4200, moq: 10 },
        },
    });
    if (editedProduct.data.price !== 5000 || editedProduct.data.wholesale?.price !== 4200 || editedProduct.data.wholesale?.moq !== 10) {
        throw new Error('Canonical edit changed retail and wholesale pricing unexpectedly.');
    }
    checks.canonicalEditPreservedChannels = true;

    const publicB2cProduct = await request(`/products/${state.productId}`);
    if (publicB2cProduct.data.price !== 5000 || publicB2cProduct.data.wholesale !== undefined) {
        throw new Error('Public B2C product detail exposed incorrect pricing or wholesale-only fields.');
    }
    checks.normalB2cProductView = true;

    const b2bOnly = await request('/vendor/products', {
        method: 'POST',
        token: state.sellerToken,
        expected: [201],
        body: {
            name: `SafeFire E2E B2B Only Extinguisher ${stamp}`,
            description: 'Controlled B2B-only product visibility verification.',
            categoryId: productCategory._id,
            price: 3900,
            b2cAvailable: false,
            wholesale: { enabled: true, price: 3900, moq: 5 },
            stockQuantity: 50,
            lowStockThreshold: 10,
            weight: 1,
            dimensions: { length: 30, breadth: 20, height: 15 },
        },
    });
    state.b2bOnlyProductId = b2bOnly.data._id;
    const publicB2bOnly = await request(`/products/${state.b2bOnlyProductId}`, { expected: [404] });
    checks.b2bOnlyHiddenFromPublic = publicB2bOnly.status === 404;

    await registerVendor(buyer, { sellsProducts: false, providesServices: false, wholesale: true });
    const approvedBuyer = await findAndApproveVendor(buyer.email);
    state.buyerVendorId = approvedBuyer.vendorId;
    if (
        approvedBuyer.vendor.vendorCapabilities?.sellsProducts !== false
        || approvedBuyer.vendor.vendorCapabilities?.providesServices !== false
        || approvedBuyer.vendor.vendorCapabilities?.wholesaleEnabled !== true
    ) {
        throw new Error('Wholesale-only buyer incorrectly received another capability.');
    }
    checks.capabilityIsolation = true;

    const wrongCredentials = await request('/user/auth/login', {
        method: 'POST',
        body: { email: buyer.email, password: `${buyer.password}-wrong` },
        expected: [401],
    });
    checks.wrongCredentialsRejected = wrongCredentials.status === 401;

    const buyerLogin = await request('/user/auth/login', {
        method: 'POST',
        body: { email: buyer.email, password: buyer.password },
    });
    state.buyerUserToken = buyerLogin.data.accessToken;
    if (buyerLogin.data.user.wholesaleAccess !== true) throw new Error('Same-credential buyer login lacked Wholesale access.');
    checks.sameCredentialWholesaleLogin = true;

    const catalog = await request('/user/wholesale/products?limit=60', { token: state.buyerUserToken });
    const listed = catalog.data.products.find((item) => String(item._id) === String(state.productId));
    if (!listed) throw new Error('Eligible Wholesale product was absent from the buyer catalog.');
    if (listed.wholesalePrice !== 4200 || listed.moq !== 10 || listed.retailPrice !== 5000) {
        throw new Error('Wholesale catalog did not return the server-owned retail/wholesale price and MOQ.');
    }
    checks.wholesaleCatalog = true;
    checks.wholesalePrice = listed.wholesalePrice;
    checks.moq = listed.moq;
    if (!catalog.data.products.some((item) => String(item._id) === String(state.b2bOnlyProductId))) {
        throw new Error('B2B-only product was absent from the approved buyer catalog.');
    }
    checks.b2bOnlyVisibleToWholesaleBuyer = true;

    const wholesaleDetail = await request(`/user/wholesale/products/${state.productId}`, {
        token: state.buyerUserToken,
    });
    if (wholesaleDetail.data.wholesalePrice !== 4200 || wholesaleDetail.data.moq !== 10) {
        throw new Error('Wholesale product detail did not expose the correct price/MOQ.');
    }
    checks.wholesaleProductDetail = true;

    const belowMoq = await request('/user/payment/initialize', {
        method: 'POST',
        token: state.buyerUserToken,
        expected: [400],
        body: {
            orderType: 'b2b',
            paymentMethod: 'cod',
            items: [{ productId: state.productId, quantity: 9 }],
            shippingAddress: {
                name: buyer.name,
                email: buyer.email,
                phone: buyer.phone,
                address: '202 Buyer Test Road',
                city: 'Mumbai',
                state: 'Maharashtra',
                zipCode: '400002',
                country: 'India',
            },
            shippingOption: 'standard',
        },
    });
    if (!String(belowMoq.payload?.message || '').includes('Minimum order quantity')) {
        throw new Error('Below-MOQ order was rejected for an unexpected reason.');
    }
    checks.backendMoqRejected = true;

    await request('/user/auth/register', { method: 'POST', expected: [201], body: normalUser });
    const normalVerification = await request('/user/auth/verify-otp', {
        method: 'POST',
        body: { email: normalUser.email, otp: '123456' },
    });
    state.normalUserToken = normalVerification.data.accessToken;
    const normalAccess = await request('/user/wholesale/access', { token: state.normalUserToken });
    if (normalAccess.data.wholesaleAccess !== false) throw new Error('Normal user received Wholesale access.');
    const normalCatalog = await request('/user/wholesale/products', {
        token: state.normalUserToken,
        expected: [403],
    });
    checks.normalUserDenied = normalCatalog.status === 403;

    await request(`/admin/vendors/${state.buyerVendorId}/status`, {
        method: 'PATCH',
        token: state.adminToken,
        body: { status: 'suspended', reason: 'Controlled suspension for capability security verification.' },
    });
    const suspendedAccess = await request('/user/wholesale/access', { token: state.buyerUserToken });
    if (suspendedAccess.data.wholesaleAccess !== false) throw new Error('Suspended Wholesale buyer retained access.');
    checks.suspendedWholesaleDenied = true;
    await request(`/admin/vendors/${state.buyerVendorId}/status`, {
        method: 'PATCH',
        token: state.adminToken,
        body: { status: 'approved' },
    });

    console.log(JSON.stringify({
        success: true,
        checks,
        serviceCategoryUsed: selectedCategory.name,
        testData: {
            sellerVendorId: state.sellerVendorId,
            buyerVendorId: state.buyerVendorId,
            productId: state.productId,
            b2bOnlyProductId: state.b2bOnlyProductId,
            serviceApplicationId: state.serviceApplicationId,
            temporary: true,
        },
    }, null, 2));
} catch (error) {
    console.error(JSON.stringify({ success: false, error: error.message, checks }, null, 2));
    process.exitCode = 1;
} finally {
    await cleanup();
}
