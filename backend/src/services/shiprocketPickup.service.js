import crypto from 'crypto';
import Vendor from '../models/Vendor.model.js';
import shiprocketProvider from '../providers/shiprocket.provider.js';
import logger from '../utils/logger.js';

const normalize = (value) => String(value || '').trim();
const mapToObject = (value) => {
    if (value instanceof Map) return Object.fromEntries(value.entries());
    if (value && typeof value.toObject === 'function') {
        const object = value.toObject();
        return object instanceof Map ? Object.fromEntries(object.entries()) : object;
    }
    return value || {};
};

const addressForVendor = (vendor) => {
    const warehouse = vendor?.warehouseAddress || {};
    const business = vendor?.address || {};
    return {
        pickup_location: `safefire_${String(vendor._id)}`,
        name: normalize(warehouse.contactPerson || vendor.name || vendor.storeName),
        email: normalize(vendor.email),
        phone: normalize(warehouse.contactNumber || vendor.phone),
        address: normalize(warehouse.address || business.street),
        address_2: '',
        city: normalize(warehouse.city || business.city),
        state: normalize(warehouse.state || business.state),
        country: normalize(business.country || 'India'),
        pin_code: normalize(warehouse.pincode || business.zipCode),
    };
};

const hashAddress = (payload) => crypto
    .createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');

const remoteAddresses = (data) => {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.shipping_address)) return data.shipping_address;
    if (Array.isArray(data?.data?.shipping_address)) return data.data.shipping_address;
    return [];
};

const remoteAlias = (entry) => normalize(
    entry?.pickup_location || entry?.pickup_location_name || entry?.name
);

export const syncVendorShiprocketPickup = async (vendorId) => {
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return { success: false, reason: 'VENDOR_NOT_FOUND' };
    if (vendor.status !== 'approved') return { success: false, reason: 'VENDOR_NOT_APPROVED' };

    const payload = addressForVendor(vendor);
    const required = ['name', 'email', 'phone', 'address', 'city', 'state', 'country', 'pin_code'];
    const missing = required.filter((key) => !payload[key]);
    const addressHash = hashAddress(payload);

    vendor.shiprocketPickupSync = {
        ...(vendor.shiprocketPickupSync?.toObject?.() || vendor.shiprocketPickupSync || {}),
        lastAttemptAt: new Date(),
    };

    if (missing.length) {
        vendor.shiprocketPickupSync.status = 'failed';
        vendor.shiprocketPickupSync.lastError = `Missing pickup fields: ${missing.join(', ')}`;
        await vendor.save();
        return { success: false, reason: 'INVALID_ADDRESS', error: vendor.shiprocketPickupSync.lastError };
    }

    const mappedAlias = normalize(vendor.warehouseAddress?.providerPickupLocationIds?.get?.('shiprocket'));
    try {
        const listResult = await shiprocketProvider.getPickupLocations();
        if (!listResult?.success) throw new Error(listResult?.error?.message || 'Unable to list Shiprocket pickup locations');

        let existing = remoteAddresses(listResult.data).find((entry) =>
            remoteAlias(entry).toLowerCase() === payload.pickup_location.toLowerCase()
        );
        let createdAddress = null;

        if (existing) {
            if (mappedAlias && vendor.shiprocketPickupSync?.addressHash && vendor.shiprocketPickupSync.addressHash !== addressHash) {
                // Shiprocket's public pickup-address API documents create/list but no safe in-place update.
                // Keep the stable mapping and surface an explicit synchronization task; never duplicate it.
                vendor.shiprocketPickupSync.status = 'update_required';
                vendor.shiprocketPickupSync.pickupLocation = payload.pickup_location;
                vendor.shiprocketPickupSync.remoteId = normalize(existing.id || existing.pickup_id);
                vendor.shiprocketPickupSync.lastError = 'Shiprocket pickup address differs; in-place update is not supported by the configured API.';
                await vendor.save();
                return { success: false, reason: 'UPDATE_REQUIRED', pickupLocation: payload.pickup_location };
            }
        } else {
            const createResult = await shiprocketProvider.addPickupLocation(payload);
            if (!createResult?.success) {
                // Another process may have created the same stable alias concurrently.
                const retryList = await shiprocketProvider.getPickupLocations();
                existing = retryList?.success
                    ? remoteAddresses(retryList.data).find((entry) =>
                        remoteAlias(entry).toLowerCase() === payload.pickup_location.toLowerCase()
                    )
                    : null;
                if (!existing) throw new Error(createResult?.error?.message || 'Shiprocket pickup creation failed');
            } else {
                createdAddress = createResult.data?.address || createResult.data;
            }
        }

        vendor.warehouseAddress = {
            ...(vendor.warehouseAddress?.toObject?.() || vendor.warehouseAddress || {}),
            warehouseName: vendor.warehouseAddress?.warehouseName || vendor.storeName,
            contactPerson: vendor.warehouseAddress?.contactPerson || vendor.name,
            contactNumber: vendor.warehouseAddress?.contactNumber || vendor.phone,
            address: vendor.warehouseAddress?.address || vendor.address?.street,
            city: vendor.warehouseAddress?.city || vendor.address?.city,
            state: vendor.warehouseAddress?.state || vendor.address?.state,
            pincode: vendor.warehouseAddress?.pincode || vendor.address?.zipCode,
            providerPickupLocationIds: {
                ...mapToObject(vendor.warehouseAddress?.providerPickupLocationIds),
                shiprocket: payload.pickup_location,
            },
        };
        vendor.shiprocketPickupSync = {
            status: 'synced',
            pickupLocation: payload.pickup_location,
            remoteId: normalize(existing?.id || existing?.pickup_id || createdAddress?.id || createdAddress?.pickup_id),
            addressHash,
            lastAttemptAt: new Date(),
            lastSyncedAt: new Date(),
            lastError: '',
        };
        await vendor.save();
        return { success: true, pickupLocation: payload.pickup_location, reused: Boolean(existing) };
    } catch (error) {
        vendor.shiprocketPickupSync.status = 'failed';
        vendor.shiprocketPickupSync.lastError = error.message;
        await vendor.save();
        logger.error(`[Shiprocket Pickup] Vendor ${vendor._id}: ${error.message}`);
        return { success: false, reason: 'SHIPROCKET_ERROR', error: error.message };
    }
};

export const queueVendorShiprocketPickupSync = (vendorId) => {
    setImmediate(() => {
        syncVendorShiprocketPickup(vendorId).catch((error) =>
            logger.error(`[Shiprocket Pickup] Background sync failed for ${vendorId}: ${error.message}`)
        );
    });
};

export default syncVendorShiprocketPickup;
