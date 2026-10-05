import assert from 'node:assert/strict';
import Shipment from '../models/Shipment.model.js';
import DeliveryBoy from '../models/DeliveryBoy.model.js';
import { manualAssignDeliveryPartner } from './assignmentService.js';

const originalShipmentFind = Shipment.findById;
const originalDriverFind = DeliveryBoy.findOne;

try {
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
}
