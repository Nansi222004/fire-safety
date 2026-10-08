/**
 * Reverse logistics orchestrator.
 *
 * The original forward shipment is authoritative for the reverse provider:
 * Shiprocket forward shipments first use Shiprocket reverse logistics, while
 * internal deliveries stay in the existing own-fleet return flow. Creation is
 * claimed atomically on the single reverse Shipment for a ReturnRequest.
 */
import Shipment from '../models/Shipment.model.js';
import ReturnRequest from '../models/ReturnRequest.model.js';
import Vendor from '../models/Vendor.model.js';
import Product from '../models/Product.model.js';
import ownFleetProvider from '../providers/ownFleet.provider.js';
import shiprocketProvider from '../providers/shiprocket.provider.js';
import delhiveryProvider from '../providers/delhivery.provider.js';

const PROVIDER_ADAPTERS = {
    own_fleet: ownFleetProvider,
    shiprocket: shiprocketProvider,
    delhivery: delhiveryProvider,
};

const buildPackage = async (returnReq) => {
    const productIds = (returnReq.items || []).map((item) => item.productId).filter(Boolean);
    const products = await Product.find({ _id: { $in: productIds } })
        .select('_id weight dimensions')
        .lean();
    const byId = new Map(products.map((product) => [String(product._id), product]));
    let packageWeight = 0;
    let packageDimensions = null;

    for (const item of returnReq.items || []) {
        const product = byId.get(String(item.productId));
        packageWeight += (Math.max(0, Number(product?.weight) || 0.5)) * Math.max(1, Number(item.quantity) || 1);
        if (!packageDimensions && product?.dimensions) packageDimensions = product.dimensions;
    }

    return {
        packageWeight: Math.max(0.001, Number((packageWeight || 0.5).toFixed(3))),
        packageDimensions: packageDimensions || { length: 15, breadth: 12, height: 8 },
    };
};

const findOriginalShipment = async (returnReq, order) => {
    if (returnReq.originalShipmentId) {
        const linked = await Shipment.findOne({
            _id: returnReq.originalShipmentId,
            orderId: order._id,
            vendorId: returnReq.vendorId,
            $or: [{ type: 'forward' }, { type: { $exists: false } }],
        });
        if (linked) return linked;
    }
    return Shipment.findOne({
        orderId: order._id,
        vendorId: returnReq.vendorId,
        $or: [{ type: 'forward' }, { type: { $exists: false } }],
    })
        .sort({ createdAt: 1 });
};

class ReverseEngine {
    async processReturn(returnRequestId, options = {}) {
        const { overrideProviderId } = options;
        try {
            const returnReq = await ReturnRequest.findById(returnRequestId).populate('orderId');
            if (!returnReq) throw new Error('ReturnRequest not found');
            const order = returnReq.orderId;
            if (!order) throw new Error('Order not found');

            const vendor = await Vendor.findById(returnReq.vendorId);
            if (!vendor) throw new Error(`Vendor not found for ID ${returnReq.vendorId}`);

            const originalShipment = await findOriginalShipment(returnReq, order);
            let selectedProviderId = overrideProviderId
                || (PROVIDER_ADAPTERS[originalShipment?.providerId] ? originalShipment.providerId : 'own_fleet');
            if (!PROVIDER_ADAPTERS[selectedProviderId]) {
                throw new Error(`Reverse adapter is not available for provider '${selectedProviderId}'.`);
            }

            const customerAddress = order.shippingAddress || {};
            const vendorWarehouse = vendor.warehouseAddress?.pincode
                ? vendor.warehouseAddress
                : (vendor.address || {});
            const packageInfo = await buildPackage(returnReq);
            const context = {
                origin: {
                    city: customerAddress.city || '',
                    state: customerAddress.state || '',
                    pincode: String(customerAddress.zipCode || customerAddress.pincode || ''),
                    lat: customerAddress.lat,
                    lng: customerAddress.lng,
                },
                destination: {
                    city: vendorWarehouse.city || '',
                    state: vendorWarehouse.state || '',
                    pincode: String(vendorWarehouse.pincode || vendorWarehouse.zipCode || ''),
                    lat: vendorWarehouse.lat || vendorWarehouse.location?.coordinates?.[1],
                    lng: vendorWarehouse.lng || vendorWarehouse.location?.coordinates?.[0],
                },
                packageWeight: packageInfo.packageWeight,
                paymentMethod: 'online',
                customerShippingCharge: 0,
            };

            if (selectedProviderId !== 'own_fleet') {
                const serviceability = await PROVIDER_ADAPTERS[selectedProviderId].checkReverseServiceability(context);
                if (!serviceability?.serviceable) {
                    if (overrideProviderId) {
                        return { success: false, reason: 'PROVIDER_NOT_SERVICEABLE', error: serviceability?.reason };
                    }
                    selectedProviderId = 'own_fleet';
                }
            }

            const stableShipmentNumber = `RTO-${String(returnReq._id)}`;
            let shipmentDoc;
            try {
                shipmentDoc = await Shipment.findOneAndUpdate(
                    { returnRequestId: returnReq._id, type: 'reverse' },
                    {
                        $setOnInsert: {
                            orderId: order._id,
                            vendorId: vendor._id,
                            returnRequestId: returnReq._id,
                            flowKey: `return:${String(returnReq._id)}`,
                            shipmentNumber: stableShipmentNumber,
                            type: 'reverse',
                            providerId: selectedProviderId,
                            customerShippingCharge: 0,
                            status: 'pending',
                            deliveryMethod: selectedProviderId === 'shiprocket' ? 'SHIPROCKET' : 'INTERNAL',
                            packageWeight: packageInfo.packageWeight,
                            packageDimensions: packageInfo.packageDimensions,
                            externalCreationStatus: 'not_started',
                        },
                    },
                    { new: true, upsert: true, setDefaultsOnInsert: true }
                );
            } catch (error) {
                if (error?.code !== 11000) throw error;
                shipmentDoc = await Shipment.findOne({ returnRequestId: returnReq._id, type: 'reverse' });
            }

            if (shipmentDoc.externalCreationStatus === 'created' || shipmentDoc.status === 'pickup_scheduled') {
                return {
                    success: true,
                    idempotent: true,
                    providerId: shipmentDoc.providerId,
                    shipmentId: shipmentDoc._id,
                    awb: shipmentDoc.awbCode,
                };
            }

            const claimed = await Shipment.findOneAndUpdate(
                {
                    _id: shipmentDoc._id,
                    externalCreationStatus: { $in: ['not_started', 'failed'] },
                    status: { $in: ['pending', 'failed'] },
                },
                {
                    $set: {
                        providerId: selectedProviderId,
                        deliveryMethod: selectedProviderId === 'shiprocket' ? 'SHIPROCKET' : 'INTERNAL',
                        externalCreationStatus: 'creating',
                        externalCreationError: '',
                        status: 'pending',
                    },
                },
                { new: true }
            );
            if (!claimed) {
                const current = await Shipment.findById(shipmentDoc._id);
                return {
                    success: current?.externalCreationStatus === 'created',
                    idempotent: true,
                    pending: current?.externalCreationStatus === 'creating',
                    providerId: current?.providerId,
                    shipmentId: current?._id,
                    awb: current?.awbCode,
                };
            }

            let createResult = await PROVIDER_ADAPTERS[selectedProviderId].createReversePickup(claimed);
            let fallbackError = '';
            if (!createResult?.success && selectedProviderId !== 'own_fleet' && !overrideProviderId) {
                fallbackError = createResult?.error?.message || createResult?.error || 'Courier reverse pickup failed.';
                selectedProviderId = 'own_fleet';
                claimed.providerId = selectedProviderId;
                claimed.deliveryMethod = 'INTERNAL';
                createResult = await ownFleetProvider.createReversePickup(claimed);
            }

            if (!createResult?.success) {
                const errorMessage = createResult?.error?.message || createResult?.error || 'Reverse pickup creation failed.';
                await Shipment.findByIdAndUpdate(claimed._id, {
                    $set: { status: 'failed', externalCreationStatus: 'failed', externalCreationError: errorMessage },
                });
                return { success: false, providerId: selectedProviderId, shipmentId: claimed._id, error: errorMessage };
            }

            const updatedShipment = await Shipment.findByIdAndUpdate(claimed._id, {
                $set: {
                    providerId: selectedProviderId,
                    deliveryMethod: selectedProviderId === 'shiprocket' ? 'SHIPROCKET' : 'INTERNAL',
                    providerOrderId: createResult.providerMetadata?.shiprocketOrderId,
                    awbCode: createResult.awbCode,
                    trackingUrl: createResult.trackingUrl,
                    courierName: createResult.courierName,
                    labelUrl: createResult.labelUrl,
                    providerMetadata: {
                        ...(createResult.providerMetadata || {}),
                        originalShipmentId: originalShipment?._id,
                        originalAwbCode: originalShipment?.awbCode,
                        ...(fallbackError ? { courierFallbackError: fallbackError } : {}),
                    },
                    status: selectedProviderId === 'own_fleet' ? 'pending' : 'pickup_scheduled',
                    externalCreationStatus: 'created',
                    externalCreationError: fallbackError,
                },
            }, { new: true });

            returnReq.reverseShipmentId = updatedShipment._id;
            if (selectedProviderId !== 'own_fleet') returnReq.status = 'pickup_assigned';
            await returnReq.save();

            return {
                success: true,
                providerId: selectedProviderId,
                shipmentId: updatedShipment._id,
                awb: updatedShipment.awbCode,
                fallback: Boolean(fallbackError),
            };
        } catch (error) {
            console.error('[ReverseEngine] Error:', error);
            return { success: false, error: error.message };
        }
    }
}

export default new ReverseEngine();
