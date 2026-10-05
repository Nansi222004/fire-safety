import Shipment from '../models/Shipment.model.js';
import Order from '../models/Order.model.js';
import Vendor from '../models/Vendor.model.js';
import shiprocketProvider from '../providers/shiprocket.provider.js';

export const createShiprocketShipmentOrFallback = async (shipmentId) => {
    const existing = await Shipment.findById(shipmentId);
    if (!existing) return { success: false, reason: 'SHIPMENT_NOT_FOUND' };
    if (existing.deliveryMethod === 'INTERNAL' || existing.providerId !== 'shiprocket') {
        return { success: false, reason: 'INTERNAL_DELIVERY' };
    }
    if (existing.providerOrderId || existing.providerMetadata?.shiprocketOrderId) {
        return { success: true, idempotent: true, shipment: existing };
    }

    const claimed = await Shipment.findOneAndUpdate(
        {
            _id: shipmentId,
            providerId: 'shiprocket',
            deliveryMethod: 'SHIPROCKET',
            externalCreationStatus: { $in: ['not_started', 'failed'] },
            providerOrderId: { $in: [null, undefined] },
            deliveryBoyId: { $in: [null, undefined] },
        },
        { $set: { externalCreationStatus: 'creating', externalCreationError: '' } },
        { new: true }
    );
    if (!claimed) {
        const current = await Shipment.findById(shipmentId);
        return { success: Boolean(current?.providerOrderId), idempotent: true, shipment: current };
    }

    try {
        const order = await Order.findById(claimed.orderId).lean();
        const vendor = await Vendor.findById(claimed.vendorId).lean();
        if (!claimed.providerPickupLocationId) throw new Error('Vendor Shiprocket pickup location is missing.');
        if (!order?.shippingAddress?.zipCode) throw new Error('Customer destination pincode is missing.');
        if (!(claimed.packageWeight > 0)) throw new Error('Package weight is invalid.');
        const dimensions = claimed.packageDimensions || {};
        if (![dimensions.length, dimensions.breadth, dimensions.height].every((value) => Number(value) > 0)) {
            throw new Error('Package dimensions are invalid.');
        }

        const warehouse = vendor?.warehouseAddress || {};
        const business = vendor?.address || {};
        const serviceability = await shiprocketProvider.checkServiceability({
            origin: {
                pincode: warehouse.pincode || business.zipCode,
                city: warehouse.city || business.city,
                state: warehouse.state || business.state,
            },
            destination: {
                pincode: order.shippingAddress.zipCode,
                city: order.shippingAddress.city,
                state: order.shippingAddress.state,
            },
            packageWeight: claimed.packageWeight,
            paymentMethod: order.paymentMethod,
            estimatedDistanceKm: claimed.distance,
        });
        if (!serviceability?.serviceable) {
            throw new Error(serviceability?.reason || 'Shiprocket is no longer serviceable for this route.');
        }

        const result = await shiprocketProvider.createShipment(claimed);
        if (!result?.success) throw new Error(result?.error?.message || result?.error || 'Shiprocket shipment creation failed.');

        const updated = await Shipment.findByIdAndUpdate(claimed._id, {
            $set: {
                awbCode: result.awbCode,
                trackingUrl: result.trackingUrl,
                labelUrl: result.labelUrl,
                courierName: result.courierName,
                providerOrderId: result.providerMetadata?.shiprocketOrderId,
                providerMetadata: result.providerMetadata,
                externalCreationStatus: 'created',
                externalCreationError: '',
            },
        }, { new: true });
        return { success: true, shipment: updated };
    } catch (error) {
        const fallback = await Shipment.findByIdAndUpdate(claimed._id, {
            $set: {
                providerId: 'own_fleet',
                deliveryMethod: 'INTERNAL',
                deliveryRoutingReason: 'SHIPROCKET_CREATION_FAILED',
                deliveryRoutingDetails: `Shiprocket shipment creation failed; routed to internal delivery: ${error.message}`,
                providerLocked: true,
                externalCreationStatus: 'failed',
                externalCreationError: error.message,
                deliveryAssignmentStatus: 'pending',
            },
        }, { new: true });
        return { success: false, fallback: true, error: error.message, shipment: fallback };
    }
};

export default createShiprocketShipmentOrFallback;
