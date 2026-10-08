import Product from '../models/Product.model.js';
import Vendor from '../models/Vendor.model.js';
import { getDeliveryRoutingSettings } from './settingsService.js';
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

export const DELIVERY_METHODS = Object.freeze({ SHIPROCKET: 'SHIPROCKET', INTERNAL: 'INTERNAL' });
export const ROUTING_REASONS = Object.freeze({
    WHOLESALE: 'WHOLESALE',
    OVERWEIGHT: 'OVERWEIGHT',
    VENDOR_SELECTED_MANUAL: 'VENDOR_SELECTED_MANUAL',
    SHIPROCKET_UNSERVICEABLE: 'SHIPROCKET_UNSERVICEABLE',
    SHIPROCKET_PICKUP_UNAVAILABLE: 'SHIPROCKET_PICKUP_UNAVAILABLE',
});

/** providerId placeholder for shipments whose delivery method the vendor has not chosen yet. */
export const PENDING_SELECTION_PROVIDER = 'pending_selection';

const GRAMS_PER_KG = 1000;

/** Product.weight is canonical GRAMS (see Product model). Missing/invalid → model default (500 g). */
export const productWeightGrams = (product) => {
    const grams = Number(product?.weight);
    return Number.isFinite(grams) && grams > 0 ? grams : 500;
};

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
        const weightGrams = (group.items || []).reduce((sum, item) => {
            const product = productsById.get(String(item.productId));
            return sum + productWeightGrams(product) * Math.max(1, Number(item.quantity) || 1);
        }, 0);
        const weightKg = weightGrams / GRAMS_PER_KG;

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
            packageWeight: Math.max(1, Math.round(weightGrams)), // grams (existing Shipment unit)
            packageDimensions: productsById.get(String(group.items?.[0]?.productId))?.dimensions,
        };
    }
    return decisions;
};

export default buildOrderRoutingDecisions;
