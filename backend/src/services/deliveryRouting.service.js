import Product from '../models/Product.model.js';
import Vendor from '../models/Vendor.model.js';
import shiprocketProvider from '../providers/shiprocket.provider.js';
import { getDeliveryRoutingSettings } from './settingsService.js';
import { syncVendorShiprocketPickup } from './shiprocketPickup.service.js';

export const DELIVERY_METHODS = Object.freeze({ SHIPROCKET: 'SHIPROCKET', INTERNAL: 'INTERNAL' });
export const ROUTING_REASONS = Object.freeze({
    WHOLESALE: 'WHOLESALE',
    HIGH_VALUE: 'HIGH_VALUE',
    OVERWEIGHT: 'OVERWEIGHT',
    LONG_DISTANCE: 'LONG_DISTANCE',
    DISTANCE_UNAVAILABLE: 'DISTANCE_UNAVAILABLE',
    SHIPROCKET_UNSERVICEABLE: 'SHIPROCKET_UNSERVICEABLE',
    SHIPROCKET_PICKUP_UNAVAILABLE: 'SHIPROCKET_PICKUP_UNAVAILABLE',
});

const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;

export const haversineDistanceKm = (origin, destination) => {
    const lat1 = finite(origin?.lat);
    const lon1 = finite(origin?.lng);
    const lat2 = finite(destination?.lat);
    const lon2 = finite(destination?.lng);
    if ([lat1, lon1, lat2, lon2].some((value) => value === null)) return null;
    const radians = (degrees) => degrees * Math.PI / 180;
    const dLat = radians(lat2 - lat1);
    const dLon = radians(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const formatAddress = (address = {}) => [
    address.address || address.street,
    address.city,
    address.state,
    address.pincode || address.zipCode,
    address.country,
].filter(Boolean).join(', ');

export const calculateDeliveryDistanceKm = async (origin, destination) => {
    const direct = haversineDistanceKm(origin, destination);
    if (direct !== null) return direct;

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    const originText = formatAddress(origin);
    const destinationText = formatAddress(destination);
    if (!apiKey || !originText || !destinationText) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
        const params = new URLSearchParams({ origins: originText, destinations: destinationText, key: apiKey });
        const response = await fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?${params}`, {
            signal: controller.signal,
        });
        const data = await response.json();
        const element = data?.rows?.[0]?.elements?.[0];
        return element?.status === 'OK' && Number.isFinite(element?.distance?.value)
            ? element.distance.value / 1000
            : null;
    } catch {
        return null;
    } finally {
        clearTimeout(timeout);
    }
};

export const evaluateDeliveryRouting = async ({
    isWholesale,
    orderValue,
    weightKg,
    origin,
    destination,
    pickupLocation,
    paymentMethod,
    settings,
    distanceCalculator = calculateDeliveryDistanceKm,
    serviceabilityChecker = async (context) => {
        const quote = await shiprocketProvider.getQuote(context);
        return {
            serviceable: quote?.success === true,
            reason: quote?.error?.message,
            providerMetadata: quote?.providerMetadata || {},
        };
    },
}) => {
    const internal = (reason, explanation, extra = {}) => ({
        deliveryMethod: DELIVERY_METHODS.INTERNAL,
        providerId: 'own_fleet',
        deliveryRoutingReason: reason,
        deliveryRoutingDetails: explanation,
        ...extra,
    });

    if (isWholesale) {
        return internal(ROUTING_REASONS.WHOLESALE, 'Wholesale/B2B orders require internal manual delivery assignment.');
    }
    if (orderValue > settings.maxOrderValue) {
        return internal(ROUTING_REASONS.HIGH_VALUE,
            `Order value ₹${orderValue.toFixed(2)} exceeds the configured Shiprocket limit of ₹${settings.maxOrderValue.toFixed(2)}.`);
    }
    if (weightKg > settings.maxWeightKg) {
        return internal(ROUTING_REASONS.OVERWEIGHT,
            `Weight ${weightKg.toFixed(2)} kg exceeds the configured Shiprocket limit of ${settings.maxWeightKg.toFixed(2)} kg.`);
    }
    if (!pickupLocation) {
        return internal(ROUTING_REASONS.SHIPROCKET_PICKUP_UNAVAILABLE,
            'The vendor does not yet have a synchronized Shiprocket pickup location.');
    }

    const distanceKm = await distanceCalculator(origin, destination);
    if (!Number.isFinite(distanceKm)) {
        return internal(ROUTING_REASONS.DISTANCE_UNAVAILABLE,
            'Vendor-to-customer distance could not be verified safely.', { distanceKm: null });
    }
    if (distanceKm > settings.maxDistanceKm) {
        return internal(ROUTING_REASONS.LONG_DISTANCE,
            `Distance ${distanceKm.toFixed(2)} km exceeds the configured Shiprocket limit of ${settings.maxDistanceKm.toFixed(2)} km.`,
            { distanceKm });
    }

    const serviceability = await serviceabilityChecker({
        origin,
        destination,
        packageWeight: Math.max(1, Math.round(weightKg * 1000)),
        paymentMethod,
        estimatedDistanceKm: distanceKm,
    });
    if (!serviceability?.serviceable) {
        return internal(ROUTING_REASONS.SHIPROCKET_UNSERVICEABLE,
            serviceability?.reason || 'Shiprocket has no serviceable courier for this route.', { distanceKm });
    }

    return {
        deliveryMethod: DELIVERY_METHODS.SHIPROCKET,
        providerId: 'shiprocket',
        deliveryRoutingReason: null,
        deliveryRoutingDetails: `Eligible for Shiprocket: ${distanceKm.toFixed(2)} km, ${weightKg.toFixed(2)} kg, value ₹${orderValue.toFixed(2)}.`,
        distanceKm,
        providerPickupLocationId: pickupLocation,
        providerMetadata: serviceability.providerMetadata || (serviceability.selectedCourier
            ? { selectedCourier: serviceability.selectedCourier }
            : {}),
    };
};

const weightInKg = (storedWeight) => {
    const value = Math.max(0, Number(storedWeight) || 0);
    // Current vendor UI stores kg, while older records used the model's gram-oriented default.
    return value > 100 ? value / 1000 : value;
};

export const buildOrderRoutingDecisions = async ({
    vendorItems,
    shippingAddress,
    paymentMethod,
    isWholesale = false,
}) => {
    const productIds = [...new Set((vendorItems || []).flatMap((group) =>
        (group.items || []).map((item) => item.productId).filter(Boolean)
    ))];
    const vendorIds = (vendorItems || []).map((group) => group.vendorId);
    const [products, vendors, settings] = await Promise.all([
        Product.find({ _id: { $in: productIds } }).select('_id weight dimensions').lean(),
        Vendor.find({ _id: { $in: vendorIds } }),
        getDeliveryRoutingSettings(),
    ]);
    const productsById = new Map(products.map((product) => [String(product._id), product]));
    const vendorsById = new Map(vendors.map((vendor) => [String(vendor._id), vendor]));
    const decisions = {};

    for (const group of vendorItems || []) {
        const vendorId = String(group.vendorId);
        const vendor = vendorsById.get(vendorId);
        let pickupLocation = vendor?.warehouseAddress?.providerPickupLocationIds?.get?.('shiprocket') || '';
        if (!pickupLocation && vendor?.status === 'approved') {
            const sync = await syncVendorShiprocketPickup(vendor._id);
            if (sync.success) pickupLocation = sync.pickupLocation;
        }

        const weightKg = (group.items || []).reduce((sum, item) => {
            const product = productsById.get(String(item.productId));
            return sum + weightInKg(product?.weight) * Math.max(1, Number(item.quantity) || 1);
        }, 0);
        const orderValue = (group.items || []).reduce((sum, item) =>
            sum + (Number(item.finalLineTotal) || Number(item.price) * Number(item.quantity) || 0), 0
        );
        const warehouse = vendor?.warehouseAddress || {};
        const business = vendor?.address || {};
        const origin = {
            address: warehouse.address || business.street,
            city: warehouse.city || business.city,
            state: warehouse.state || business.state,
            pincode: warehouse.pincode || business.zipCode,
            country: business.country,
            lat: warehouse.location?.coordinates?.[1] ?? business.location?.coordinates?.[1],
            lng: warehouse.location?.coordinates?.[0] ?? business.location?.coordinates?.[0],
        };
        const destination = {
            ...shippingAddress,
            pincode: shippingAddress?.pincode || shippingAddress?.zipCode,
            lat: shippingAddress?.lat ?? shippingAddress?.location?.coordinates?.[1],
            lng: shippingAddress?.lng ?? shippingAddress?.location?.coordinates?.[0],
        };
        decisions[vendorId] = {
            ...(await evaluateDeliveryRouting({
                isWholesale,
                orderValue,
                weightKg,
                origin,
                destination,
                pickupLocation,
                paymentMethod,
                settings,
            })),
            packageWeight: Math.max(1, Math.round(weightKg * 1000)),
            packageDimensions: productsById.get(String(group.items?.[0]?.productId))?.dimensions,
        };
    }
    return decisions;
};

export default buildOrderRoutingDecisions;
