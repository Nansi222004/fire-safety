import Shipment from '../models/Shipment.model.js';
import Order from '../models/Order.model.js';
import Vendor from '../models/Vendor.model.js';
import shiprocketProvider from '../providers/shiprocket.provider.js';
import { isDeliveryAppEnabled } from './settingsService.js';
import { deriveTopLevelOrderStatus } from '../utils/orderStatus.js';

/**
 * Shiprocket creation failed while the Delivery App is off. The shipment goes back to "awaiting delivery
 * method" (Shiprocket removed from its allowed methods, seller package back to processing) so the seller can
 * pick another available method — or Admin resolves it. Payment and financial snapshots are not touched.
 */
const holdFailedShiprocketShipment = async (claimed, reason) => {
    const stored = Array.isArray(claimed.allowedDeliveryMethods) && claimed.allowedDeliveryMethods.length
        ? claimed.allowedDeliveryMethods
        : ['SHIPROCKET', 'INTERNAL'];
    const allowedDeliveryMethods = stored.filter((m) => m !== 'SHIPROCKET');
    const details = `Shiprocket shipment creation failed: ${reason}. The Delivery App is turned off, so the package was not sent to internal delivery. Choose another available delivery method or contact Admin.`;
    const held = await Shipment.findOneAndUpdate(
        { _id: claimed._id, providerOrderId: { $in: [null, undefined] }, deliveryBoyId: { $in: [null, undefined] } },
        {
            $set: {
                providerId: 'pending_selection',
                allowedDeliveryMethods,
                deliveryRoutingReason: 'SHIPROCKET_CREATION_FAILED',
                deliveryRoutingDetails: details,
                externalCreationStatus: 'failed',
                externalCreationError: reason,
                ...(claimed.status === 'ready_for_pickup' ? { status: 'confirmed' } : {}),
            },
            $unset: { deliveryMethod: '', deliveryAssignmentStatus: '' },
            $push: { statusHistory: { status: claimed.status === 'ready_for_pickup' ? 'confirmed' : claimed.status, updatedBy: 'system', notes: details } },
        },
        { new: true }
    );

    const order = await Order.findById(claimed.orderId);
    if (order) {
        let changed = false;
        order.vendorItems = order.vendorItems.map((vi) => {
            if (String(vi.vendorId) === String(claimed.vendorId) && vi.status === 'ready_for_pickup') {
                changed = true;
                return { ...vi.toObject(), status: 'processing' };
            }
            return vi;
        });
        if (changed) {
            order.status = deriveTopLevelOrderStatus(order.vendorItems, order.status);
            await order.save();
        }
        const orderHumanId = String(order.orderId || order._id);
        // Loaded lazily: the notification service initializes push messaging on import.
        const { createNotification, notifyAdmins } = await import('./notification.service.js');
        await createNotification({
            recipientId: claimed.vendorId,
            recipientType: 'vendor',
            title: 'Shiprocket shipment failed — choose a delivery method',
            message: `Order ${orderHumanId}: ${details}`,
            type: 'order',
            eventKey: `shipment:${claimed._id}:shiprocket_failed_held:vendor`,
            data: { orderId: orderHumanId, orderMongoId: String(order._id), shipmentId: String(claimed._id), deepLink: `/vendor/orders/${orderHumanId}` },
        }).catch((err) => console.warn(`[Shiprocket hold] vendor notification failed: ${err.message}`));
        await notifyAdmins({
            title: 'Shipment awaiting delivery method',
            message: `Order ${orderHumanId}, shipment ${claimed.shipmentNumber || claimed._id}: ${details}`,
            eventKey: `shipment:${claimed._id}:shiprocket_failed_held`,
            data: { orderId: orderHumanId, shipmentId: String(claimed._id) },
        });
    }
    return { success: false, fallback: false, awaitingDeliveryMethod: true, error: reason, shipment: held };
};

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
        // Delivery App off: never silently hand the package to internal riders. Return the shipment to the
        // seller's method choice (without Shiprocket) and tell the seller and Admin.
        if (!(await isDeliveryAppEnabled())) {
            return holdFailedShiprocketShipment(claimed, error.message);
        }
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
