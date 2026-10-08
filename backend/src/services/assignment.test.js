import assert from 'node:assert/strict';
import Shipment from '../models/Shipment.model.js';
import DeliveryBoy from '../models/DeliveryBoy.model.js';
import Order from '../models/Order.model.js';
import { manualAssignDeliveryPartner } from './assignmentService.js';

const originalShipmentFind = Shipment.findById;
const originalDriverFind = DeliveryBoy.findOne;
const originalOrderFind = Order.findById;

try {
    // Open order (manual assignment validates the order is not closed).
    Order.findById = () => ({ select: () => ({ lean: async () => ({ status: 'processing', paymentMethod: 'cod', total: 100, vendorItems: [] }) }) });
    DeliveryBoy.findOne = async () => ({ _id: 'driver-a', maxActiveOrders: 3 });
    Shipment.findById = async () => ({
        _id: 'shipment-a',
        providerId: 'own_fleet',
        deliveryMethod: 'INTERNAL',
        deliveryBoyId: 'driver-a',
    });

    let result = await manualAssignDeliveryPartner({
        shipmentId: 'shipment-a',
        deliveryBoyId: 'driver-a',
        actorRole: 'vendor',
        actorId: 'vendor-a',
    });
    assert.equal(result.success, true);
    assert.equal(result.idempotent, true, 'Repeating the same assignment must be idempotent.');

    Shipment.findById = async () => ({
        _id: 'shipment-a',
        providerId: 'own_fleet',
        deliveryMethod: 'INTERNAL',
        deliveryBoyId: 'driver-a',
    });
    result = await manualAssignDeliveryPartner({
        shipmentId: 'shipment-a',
        deliveryBoyId: 'driver-b',
        actorRole: 'admin',
        actorId: 'admin-a',
    });
    assert.equal(result.code, 'ALREADY_ASSIGNED', 'A different driver cannot silently overwrite an assignment.');

    console.log('Manual delivery assignment conflict tests passed.');
} finally {
    Shipment.findById = originalShipmentFind;
    DeliveryBoy.findOne = originalDriverFind;
    Order.findById = originalOrderFind;
}
