import Shipment from '../models/Shipment.model.js';
import ReturnRequest from '../models/ReturnRequest.model.js';
import { buildOrderRoutingDecisions } from './deliveryRouting.service.js';
import { createShiprocketShipmentOrFallback } from './shiprocketShipment.service.js';

export const replacementVendorGroup = (returnRequest, order) => {
    const originalGroup = (order.vendorItems || []).find((group) =>
        String(group.vendorId) === String(returnRequest.vendorId)
    );
    const requestedByProduct = new Map((returnRequest.items || []).map((item) => [String(item.productId), item]));
    const items = (originalGroup?.items || order.items || [])
        .filter((item) => String(item.vendorId || originalGroup?.vendorId) === String(returnRequest.vendorId))
        .filter((item) => requestedByProduct.has(String(item.productId)))
        .map((item) => {
            const requested = requestedByProduct.get(String(item.productId));
            const quantity = Math.max(1, Number(requested.quantity) || 1);
            const replacementPrice = Number(returnRequest.exchangeDetails?.newProductPrice);
            const price = Number.isFinite(replacementPrice) ? replacementPrice : Number(item.price) || 0;
            return {
                ...(typeof item.toObject === 'function' ? item.toObject() : item),
                quantity,
                price,
                finalLineTotal: price * quantity,
                variant: returnRequest.exchangeDetails?.requestedVariant || item.variant,
                variantKey: returnRequest.exchangeDetails?.requestedVariant?.variantKey || item.variantKey,
            };
        });

    return {
        vendorId: returnRequest.vendorId,
        vendorName: originalGroup?.vendorName,
        shipping: 0,
        items,
    };
};

export const createExchangeReplacementShipment = async (returnRequestId) => {
    const returnRequest = await ReturnRequest.findById(returnRequestId).populate('orderId');
    if (!returnRequest || returnRequest.requestType !== 'exchange') {
        return { success: false, reason: 'EXCHANGE_REQUEST_NOT_FOUND' };
    }
    if (returnRequest.status !== 'replacement_ready' && returnRequest.status !== 'replacement_assigned') {
        return { success: false, reason: 'EXCHANGE_NOT_READY' };
    }

    const order = returnRequest.orderId;
    const vendorGroup = replacementVendorGroup(returnRequest, order);
    if (!vendorGroup.items.length) return { success: false, reason: 'REPLACEMENT_ITEMS_NOT_FOUND' };

    const decisions = await buildOrderRoutingDecisions({
        vendorItems: [vendorGroup],
        shippingAddress: order.shippingAddress,
        paymentMethod: 'online',
        isWholesale: order.orderType === 'b2b',
        // Exchange replacements have no vendor selection step: choose automatically.
        selectionMode: 'auto',
    });
    const routing = decisions[String(returnRequest.vendorId)];
    const stableShipmentNumber = `EXC-${String(returnRequest._id)}`;
    let shipment;
    try {
        shipment = await Shipment.findOneAndUpdate(
            { returnRequestId: returnRequest._id, type: 'exchange_forward' },
            {
                $setOnInsert: {
                    orderId: order._id,
                    returnRequestId: returnRequest._id,
                    flowKey: `exchange:${String(returnRequest._id)}`,
                    vendorId: returnRequest.vendorId,
                    vendorName: vendorGroup.vendorName,
                    type: 'exchange_forward',
                    shipmentNumber: stableShipmentNumber,
                    providerId: routing.providerId,
                    providerLocked: true,
                    selectedBy: 'AUTO',
                    deliveryMethod: routing.deliveryMethod,
                    deliveryRoutingReason: routing.deliveryRoutingReason,
                    deliveryRoutingDetails: routing.deliveryRoutingDetails,
                    distance: routing.distanceKm,
                    providerPickupLocationId: routing.providerPickupLocationId,
                    providerMetadata: routing.providerMetadata,
                    packageWeight: routing.packageWeight,
                    packageDimensions: routing.packageDimensions,
                    customerShippingCharge: 0,
                    status: 'pending',
                    statusHistory: [{
                        status: 'pending',
                        updatedAt: new Date(),
                        updatedBy: 'system',
                        notes: 'Exchange replacement shipment created through SafeFire delivery routing.',
                    }],
                    externalCreationStatus: routing.deliveryMethod === 'SHIPROCKET' ? 'not_started' : 'not_applicable',
                    deliveryAssignmentStatus: 'pending',
                },
            },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );
    } catch (error) {
        if (error?.code !== 11000) throw error;
        shipment = await Shipment.findOne({ returnRequestId: returnRequest._id, type: 'exchange_forward' });
    }

    returnRequest.exchangeShipmentId = shipment._id;
    await returnRequest.save();

    if (shipment.deliveryMethod !== 'SHIPROCKET') {
        return { success: true, shipment, internal: true, idempotent: shipment.createdAt < shipment.updatedAt };
    }

    const creation = await createShiprocketShipmentOrFallback(shipment._id);
    if (creation.success) {
        await ReturnRequest.updateOne(
            { _id: returnRequest._id, status: 'replacement_ready' },
            { $set: { status: 'replacement_assigned' } }
        );
    }
    return {
        ...creation,
        shipment: creation.shipment || shipment,
        internal: creation.fallback === true,
    };
};

export default createExchangeReplacementShipment;
