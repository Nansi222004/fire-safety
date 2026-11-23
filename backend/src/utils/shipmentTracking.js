/**
 * Normalized, customer-safe tracking view of one Shipment, built from the field set that belongs to its
 * delivery method:
 *   SHIPROCKET       → awbCode / courierName / trackingUrl written by the Shiprocket integration
 *   SELLER_DELIVERY  → sellerDelivery.* entered by the seller (never awbCode)
 *   INTERNAL         → SafeFire rider fields
 * Order.trackingNumber is an order-level key and is never used here.
 */

const IN_TRANSIT = ['shipped', 'in_transit', 'out_for_delivery'];

export const DELIVERY_METHOD_LABELS = Object.freeze({
    SHIPROCKET: 'Shiprocket courier',
    INTERNAL: 'SafeFire delivery partner',
    SELLER_DELIVERY: 'Seller-arranged courier',
});

export const isSafeHttpsUrl = (value) => {
    if (!value || typeof value !== 'string') return false;
    try {
        const url = new URL(value.trim());
        return url.protocol === 'https:' && Boolean(url.hostname);
    } catch {
        return false;
    }
};

const firstStatusDate = (shipment, statuses) => {
    const entry = (shipment?.statusHistory || []).find((h) => statuses.includes(h.status));
    return entry?.updatedAt || null;
};

/** Resolves the delivery method, including legacy shipments saved before deliveryMethod existed. */
export const resolveShipmentDeliveryMethod = (shipment) => {
    if (!shipment) return null;
    if (shipment.deliveryMethod === 'SELLER_DELIVERY' && shipment.providerId === 'seller_delivery') return 'SELLER_DELIVERY';
    if (shipment.deliveryMethod === 'SHIPROCKET' || shipment.deliveryMethod === 'INTERNAL') return shipment.deliveryMethod;
    if (shipment.providerId === 'shiprocket') return 'SHIPROCKET';
    if (shipment.providerId === 'own_fleet') return 'INTERNAL';
    return null; // awaiting the seller's choice, or another provider
};

/**
 * @param {object} shipment  Shipment (lean or document)
 * @returns {object|null}
 */
export const buildShipmentTracking = (shipment) => {
    if (!shipment) return null;
    const method = resolveShipmentDeliveryMethod(shipment);
    const status = shipment.status;
    const inTransit = IN_TRANSIT.includes(status);
    const base = {
        method,
        methodLabel: method ? DELIVERY_METHOD_LABELS[method] : (shipment.providerId === 'delhivery' ? 'Delhivery courier' : 'Delivery method pending'),
        status,
        courierName: null,
        trackingNumber: null,
        trackingUrl: null,
        shippedAt: null,
        deliveredAt: shipment.deliveredAt || null,
        confirmationMethod: shipment.deliveryConfirmation?.method || null,
        deliveryPerson: null,
    };

    if (method === 'SELLER_DELIVERY') {
        const sd = shipment.sellerDelivery || {};
        return {
            ...base,
            courierName: sd.courierName || null,
            trackingNumber: sd.trackingNumber || null,
            trackingUrl: isSafeHttpsUrl(sd.trackingUrl) ? sd.trackingUrl : null,
            shippedAt: sd.shippedAt || firstStatusDate(shipment, ['shipped']),
            deliveryPerson: inTransit && (sd.deliveryPersonName || sd.deliveryPersonPhone)
                ? { name: sd.deliveryPersonName || null, phone: sd.deliveryPersonPhone || null }
                : null,
            label: sd.courierName ? `Delivered by seller via ${sd.courierName}` : 'Delivered by seller',
        };
    }

    if (method === 'INTERNAL') {
        const rider = shipment.deliveryBoyId && typeof shipment.deliveryBoyId === 'object' ? shipment.deliveryBoyId : null;
        return {
            ...base,
            courierName: 'SafeFire Delivery',
            shippedAt: shipment.pickedUpAt || firstStatusDate(shipment, ['picked_up', 'shipped', 'out_for_delivery']),
            deliveryPerson: inTransit && rider?.name ? { name: rider.name, phone: rider.phone || null } : null,
            label: 'Delivered by SafeFire delivery partner',
        };
    }

    // Shiprocket and other external couriers keep using the integration's own fields.
    return {
        ...base,
        courierName: shipment.courierName || null,
        trackingNumber: shipment.awbCode || null,
        trackingUrl: isSafeHttpsUrl(shipment.trackingUrl) ? shipment.trackingUrl : null,
        shippedAt: shipment.pickedUpAt || firstStatusDate(shipment, ['picked_up', 'shipped', 'in_transit']),
        label: method === 'SHIPROCKET' ? `Shipped via ${shipment.courierName || 'Shiprocket'}` : null,
    };
};

/**
 * Customer-facing shipment: adds `tracking`, drops seller-internal audit data, and hides the seller's
 * delivery person contact once the package is no longer in transit.
 */
export const toCustomerShipment = (shipment) => {
    if (!shipment) return shipment;
    const out = { ...shipment, tracking: buildShipmentTracking(shipment) };
    if (out.sellerDelivery) {
        const { trackingUpdates, shippedBy, deliveryPersonName, deliveryPersonPhone, ...rest } = out.sellerDelivery;
        out.sellerDelivery = IN_TRANSIT.includes(out.status)
            ? { ...rest, deliveryPersonName, deliveryPersonPhone }
            : rest;
    }
    if (out.deliveryConfirmation) {
        out.deliveryConfirmation = { method: out.deliveryConfirmation.method, confirmedAt: out.deliveryConfirmation.confirmedAt };
    }
    return out;
};
