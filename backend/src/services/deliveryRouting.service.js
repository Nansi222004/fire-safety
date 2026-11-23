import Product from '../models/Product.model.js';
import Vendor from '../models/Vendor.model.js';
import { getDeliveryRoutingSettings, getDeliveryAppSettings } from './settingsService.js';
import { syncVendorShiprocketPickup } from './shiprocketPickup.service.js';

/**
 * Delivery routing — business rule:
 *   • Wholesale / B2B shipment            → Manual (INTERNAL) delivery only
 *   • Shipment weight  > max Shiprocket kg → Manual (INTERNAL) delivery only
 *   • Otherwise                             → vendor chooses Shiprocket or Manual after accepting
 *
 * Distance is NOT part of routing (no Google Maps / distance APIs). Order value is NOT part of routing.
 * Shiprocket serviceability/pickup problems are handled when the Shiprocket shipment is created
 * (existing fallback to INTERNAL in shiprocketShipment.service).
 */

export const DELIVERY_METHODS = Object.freeze({ SHIPROCKET: 'SHIPROCKET', INTERNAL: 'INTERNAL', SELLER_DELIVERY: 'SELLER_DELIVERY' });
export const SELLER_DELIVERY_PROVIDER = 'seller_delivery';
export const ROUTING_REASONS = Object.freeze({
    WHOLESALE: 'WHOLESALE',
    OVERWEIGHT: 'OVERWEIGHT',
    VENDOR_SELECTED_MANUAL: 'VENDOR_SELECTED_MANUAL',
    VENDOR_SELECTED_SELLER_DELIVERY: 'VENDOR_SELECTED_SELLER_DELIVERY',
    SHIPROCKET_UNSERVICEABLE: 'SHIPROCKET_UNSERVICEABLE',
    SHIPROCKET_PICKUP_UNAVAILABLE: 'SHIPROCKET_PICKUP_UNAVAILABLE',
});

export const isCodPaymentMethod = (paymentMethod) => ['cod', 'cash'].includes(String(paymentMethod || '').toLowerCase());

/** Seller Delivery is identified explicitly by BOTH fields — never inferred from missing data. */
export const isSellerDeliveryShipment = (shipment) =>
    shipment?.deliveryMethod === DELIVERY_METHODS.SELLER_DELIVERY && shipment?.providerId === SELLER_DELIVERY_PROVIDER;

/**
 * Delivery methods a shipment can actually use right now (pure).
 * Starts from the shipment's stored allowedDeliveryMethods (or the wholesale/weight rule for records saved
 * without it), then applies the current Admin switches and payment rules:
 *   • INTERNAL removed while the Delivery App is off.
 *   • SELLER_DELIVERY added (never stored on historical records) when Admin enabled it, for forward
 *     customer-order shipments of prepaid orders. Seller-collected COD has no approved settlement flow.
 * @returns {{ methods: string[], unavailable: {method: string, reason: string}[], reason: string|null }}
 */
export const resolveEffectiveDeliveryMethods = ({ shipment, order, deliverySettings, routingSettings }) => {
    const unavailable = [];
    if (!shipment) return { methods: [], unavailable, reason: 'Shipment not found.' };
    const stored = Array.isArray(shipment.allowedDeliveryMethods) && shipment.allowedDeliveryMethods.length
        ? shipment.allowedDeliveryMethods
        : evaluateDeliveryRouting({
            isWholesale: Boolean(order?.isWholesale),
            weightKg: Number(shipment.packageWeight) || 1,
            settings: routingSettings || { maxWeightKg: 20 },
        }).allowedDeliveryMethods;
    let methods = [...new Set(stored.filter((m) => m !== DELIVERY_METHODS.SELLER_DELIVERY))];

    if (!deliverySettings?.deliveryAppEnabled && methods.includes(DELIVERY_METHODS.INTERNAL)) {
        methods = methods.filter((m) => m !== DELIVERY_METHODS.INTERNAL);
        unavailable.push({ method: DELIVERY_METHODS.INTERNAL, reason: 'The SafeFire Delivery App is turned off by Admin.' });
    }

    const isForward = !shipment.type || shipment.type === 'forward';
    if (isForward && deliverySettings?.sellerDeliveryEnabled) {
        if (isCodPaymentMethod(order?.paymentMethod)) {
            unavailable.push({ method: DELIVERY_METHODS.SELLER_DELIVERY, reason: 'Seller Delivery is not available for Cash on Delivery orders.' });
        } else if (!order?.userId) {
            // The delivery OTP is shown only in the customer's signed-in account; an order without an account
            // (legacy guest record) could never be confirmed by the customer.
            unavailable.push({ method: DELIVERY_METHODS.SELLER_DELIVERY, reason: 'Seller Delivery needs a registered customer account to show the delivery OTP.' });
        } else {
            methods.push(DELIVERY_METHODS.SELLER_DELIVERY);
        }
    }

    const reason = methods.length
        ? null
        : ['No delivery method is available for this shipment right now.', ...unavailable.map((u) => u.reason), 'Contact Admin to resolve it.'].join(' ');
    return { methods, unavailable, reason };
};

/** Async wrapper: loads the current Admin switches and routing limits. */
export const getEffectiveDeliveryMethods = async (shipment, order) => {
    const [deliverySettings, routingSettings] = await Promise.all([getDeliveryAppSettings(), getDeliveryRoutingSettings()]);
    return resolveEffectiveDeliveryMethods({ shipment, order, deliverySettings, routingSettings });
};

/** providerId placeholder for shipments whose delivery method the vendor has not chosen yet. */
export const PENDING_SELECTION_PROVIDER = 'pending_selection';

/** Product.weight is canonical kilograms (see Product model). Missing/invalid → model default (0.5 kg). */
export const productWeightKg = (product) => {
    const kilograms = Number(product?.weight);
    return Number.isFinite(kilograms) && kilograms > 0 ? kilograms : 0.5;
};

/** Pure package-weight aggregation used by routing and unit tests. */
export const calculatePackageWeightKg = (items, productsById) => Number((items || []).reduce((sum, item) => {
    const product = productsById.get(String(item.productId));
    return sum + productWeightKg(product) * Math.max(1, Number(item.quantity) || 1);
}, 0).toFixed(3));

/**
 * Pure routing decision for one vendor shipment.
 * @param {{ isWholesale: boolean, weightKg: number, settings: { maxWeightKg: number } }} input
 */
export const evaluateDeliveryRouting = ({ isWholesale, weightKg, settings }) => {
    const manualOnly = (reason, explanation) => ({
        deliveryMethod: DELIVERY_METHODS.INTERNAL,
        providerId: 'own_fleet',
        allowedDeliveryMethods: [DELIVERY_METHODS.INTERNAL],
        deliveryRoutingReason: reason,
        deliveryRoutingDetails: explanation,
    });

    if (isWholesale) {
        return manualOnly(ROUTING_REASONS.WHOLESALE, 'Wholesale orders require Manual Delivery.');
    }
    // Exactly at the limit is still eligible for Shiprocket.
    if (weightKg > settings.maxWeightKg) {
        return manualOnly(
            ROUTING_REASONS.OVERWEIGHT,
            `Order exceeds the maximum Shiprocket weight limit (${weightKg.toFixed(2)} kg > ${settings.maxWeightKg.toFixed(2)} kg).`
        );
    }
    return {
        deliveryMethod: null, // chosen by the vendor after accepting the order
        providerId: PENDING_SELECTION_PROVIDER,
        allowedDeliveryMethods: [DELIVERY_METHODS.SHIPROCKET, DELIVERY_METHODS.INTERNAL],
        deliveryRoutingReason: null,
        deliveryRoutingDetails: 'Eligible for Shiprocket or Manual Delivery — vendor selects after accepting the order.',
    };
};

/** Resolves (and if needed synchronises) the vendor's Shiprocket pickup location id. */
export const resolveShiprocketPickupLocation = async (vendor) => {
    let pickupLocation = vendor?.warehouseAddress?.providerPickupLocationIds?.get?.('shiprocket')
        || vendor?.warehouseAddress?.providerPickupLocationIds?.shiprocket
        || '';
    if (!pickupLocation && vendor?.status === 'approved') {
        const sync = await syncVendorShiprocketPickup(vendor._id);
        if (sync.success) pickupLocation = sync.pickupLocation;
    }
    return pickupLocation || '';
};

/**
 * Builds per-vendor routing decisions for an order (each vendor shipment decided independently).
 * @param {object} params
 * @param {'vendor'|'auto'} [params.selectionMode='vendor']
 *   'vendor' — normal shipments wait for the vendor's choice (customer orders).
 *   'auto'   — normal shipments go to Shiprocket when the vendor has a pickup location, else INTERNAL
 *              (used by flows without a vendor selection step, e.g. exchange replacements).
 */
export const buildOrderRoutingDecisions = async ({
    vendorItems,
    isWholesale = false,
    selectionMode = 'vendor',
}) => {
    const productIds = [...new Set((vendorItems || []).flatMap((group) =>
        (group.items || []).map((item) => item.productId).filter(Boolean)
    ))];
    const vendorIds = (vendorItems || []).map((group) => group.vendorId);
    const [products, vendors, settings] = await Promise.all([
        Product.find({ _id: { $in: productIds } }).select('_id weight dimensions').lean(),
        selectionMode === 'auto' ? Vendor.find({ _id: { $in: vendorIds } }) : Promise.resolve([]),
        getDeliveryRoutingSettings(),
    ]);
    const productsById = new Map(products.map((product) => [String(product._id), product]));
    const vendorsById = new Map(vendors.map((vendor) => [String(vendor._id), vendor]));
    const decisions = {};

    for (const group of vendorItems || []) {
        const vendorId = String(group.vendorId);
        const weightKg = calculatePackageWeightKg(group.items, productsById);

        let routing = evaluateDeliveryRouting({ isWholesale, weightKg, settings });

        if (selectionMode === 'auto' && routing.deliveryMethod === null) {
            const pickupLocation = await resolveShiprocketPickupLocation(vendorsById.get(vendorId));
            routing = pickupLocation
                ? {
                    ...routing,
                    deliveryMethod: DELIVERY_METHODS.SHIPROCKET,
                    providerId: 'shiprocket',
                    providerPickupLocationId: pickupLocation,
                    deliveryRoutingDetails: 'Shiprocket selected automatically.',
                }
                : {
                    ...routing,
                    deliveryMethod: DELIVERY_METHODS.INTERNAL,
                    providerId: 'own_fleet',
                    deliveryRoutingReason: ROUTING_REASONS.SHIPROCKET_PICKUP_UNAVAILABLE,
                    deliveryRoutingDetails: 'The vendor does not yet have a synchronized Shiprocket pickup location.',
                };
        }

        decisions[vendorId] = {
            ...routing,
            weightKg,
            packageWeight: Math.max(0.001, Number(weightKg.toFixed(3))), // kg
            packageDimensions: productsById.get(String(group.items?.[0]?.productId))?.dimensions,
        };
    }
    return decisions;
};

export default buildOrderRoutingDecisions;
