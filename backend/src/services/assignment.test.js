import assert from 'node:assert/strict';
import Shipment from '../models/Shipment.model.js';
import DeliveryBoy from '../models/DeliveryBoy.model.js';
import Order from '../models/Order.model.js';
import Settings from '../models/Settings.model.js';
import { manualAssignDeliveryPartner } from './assignmentService.js';
import { clearSettingsCache } from './settingsService.js';

const originalShipmentFind = Shipment.findById;
const originalDriverFind = DeliveryBoy.findOne;
const originalOrderFind = Order.findById;
const originalSettingsFind = Settings.findOne;

// Admin shipping settings (Delivery App switch); null = never saved → Delivery App ON.
let shippingSettings = null;

try {
    Settings.findOne = () => ({ lean: async () => (shippingSettings ? { key: 'shipping', value: shippingSettings } : null) });
    clearSettingsCache();

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

    // Delivery App OFF: no new assignment for vendors or Admin…
    shippingSettings = { deliveryAppEnabled: false };
    clearSettingsCache();
    Shipment.findById = async () => ({ _id: 'shipment-b', providerId: 'own_fleet', deliveryMethod: 'INTERNAL' });
    for (const actorRole of ['vendor', 'admin']) {
        result = await manualAssignDeliveryPartner({ shipmentId: 'shipment-b', deliveryBoyId: 'driver-a', actorRole, actorId: 'x' });
        assert.equal(result.code, 'DELIVERY_APP_DISABLED', `${actorRole} cannot create a new assignment while the Delivery App is off.`);
    }
    // …but Admin may still act on a shipment that already has a rider (here: same rider → idempotent success).
    Shipment.findById = async () => ({ _id: 'shipment-a', providerId: 'own_fleet', deliveryMethod: 'INTERNAL', deliveryBoyId: 'driver-a' });
    result = await manualAssignDeliveryPartner({ shipmentId: 'shipment-a', deliveryBoyId: 'driver-a', actorRole: 'admin', actorId: 'admin-a' });
    assert.equal(result.success, true, 'Admin keeps control of shipments that already have a rider.');
    result = await manualAssignDeliveryPartner({ shipmentId: 'shipment-a', deliveryBoyId: 'driver-a', actorRole: 'vendor', actorId: 'vendor-a' });
    assert.equal(result.code, 'DELIVERY_APP_DISABLED', 'Vendors cannot (re)assign while the Delivery App is off.');

    console.log('Manual delivery assignment conflict tests passed.');
} finally {
    Shipment.findById = originalShipmentFind;
    DeliveryBoy.findOne = originalDriverFind;
    Order.findById = originalOrderFind;
    Settings.findOne = originalSettingsFind;
    clearSettingsCache();
}
