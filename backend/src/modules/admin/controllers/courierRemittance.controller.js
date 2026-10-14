import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Shipment from '../../../models/Shipment.model.js';
import CourierCODRemittance from '../../../models/CourierCODRemittance.model.js';
import mongoose from 'mongoose';
import LogisticsEventBus from '../../../events/logisticsEventBus.js';
import LOGISTICS_EVENTS from '../../../events/logisticsEvents.js';

// GET /api/admin/courier-remittances/pending
export const getPendingCourierCod = asyncHandler(async (req, res) => {
    const { providerId } = req.query;

    const filter = {
        status: 'delivered',
        isCashSettled: false,
        providerId: { $ne: 'own_fleet' }
    };

    if (providerId) {
        filter.providerId = providerId;
    }

    // Need to find shipments where order is COD.
    // Let's use aggregate to join with orders.
    const pendingShipments = await Shipment.aggregate([
        { $match: filter },
        {
            $lookup: {
                from: 'orders',
                localField: 'orderId',
                foreignField: '_id',
                as: 'order'
            }
        },
        { $unwind: '$order' },
        {
            $match: {
                'order.paymentMethod': { $in: ['cod', 'cash'] }
            }
        },
        {
            $project: {
                _id: 1,
                shipmentNumber: 1,
                orderId: 1,
                vendorId: 1,
                providerId: 1,
                customerShippingCharge: 1,
                actualDeliveryCost: 1,
                deliveredAt: 1,
                orderTotal: '$order.total'
            }
        }
    ]);

    res.status(200).json(new ApiResponse(200, pendingShipments, 'Pending courier COD shipments fetched.'));
});

const round2 = (n) => Math.round(Number(n) * 100) / 100;

// What the courier should have collected for one shipment: the order total for a single-vendor order,
// otherwise that vendor's share (subtotal + shipping + tax - discount) so multi-vendor orders are not counted twice.
const shipmentCodAmount = (shipment) => {
    const order = shipment.order || {};
    const groups = Array.isArray(order.vendorItems) ? order.vendorItems : [];
    if (groups.length <= 1) return round2(order.total || 0);
    const group = groups.find((g) => String(g.vendorId) === String(shipment.vendorId));
    if (!group) return 0;
    return round2((group.subtotal || 0) + (group.shipping || 0) + (group.tax || 0) - (group.discount || 0));
};

// POST /api/admin/courier-remittances/settle
export const settleCourierCod = asyncHandler(async (req, res) => {
    const { shipmentIds, amountReceived, providerId, referenceId, notes } = req.body;

    if (!shipmentIds || !Array.isArray(shipmentIds) || shipmentIds.length === 0) {
        throw new ApiError(400, 'Shipment IDs are required.');
    }
    if (!providerId) {
        throw new ApiError(400, 'Provider ID is required.');
    }
    if (amountReceived === undefined || amountReceived === null) {
        throw new ApiError(400, 'Amount received is required.');
    }
    const totalReceived = Number(amountReceived);
    if (!Number.isFinite(totalReceived) || totalReceived < 0) {
        throw new ApiError(400, 'Amount received must be a non-negative number.');
    }
    if (shipmentIds.some((id) => !mongoose.isValidObjectId(id))) {
        throw new ApiError(400, 'Invalid shipment ID.');
    }

    const session = await mongoose.startSession();
    let settledShipments = [];
    const remittanceIdByShipment = new Map();
    const receivedByShipment = new Map();

    try {
        await session.withTransaction(async () => {
            const shipments = await Shipment.aggregate([
                { $match: { _id: { $in: shipmentIds.map(id => new mongoose.Types.ObjectId(id)) } } },
                {
                    $lookup: {
                        from: 'orders',
                        localField: 'orderId',
                        foreignField: '_id',
                        as: 'order'
                    }
                },
                { $unwind: '$order' }
            ]).session(session);

            if (shipments.length !== shipmentIds.length) {
                throw new ApiError(404, 'One or more shipments not found.');
            }

            settledShipments = [];
            shipments.forEach(s => {
                if (s.isCashSettled) throw new ApiError(400, `Shipment ${s.shipmentNumber} is already settled.`);
                if (s.providerId !== providerId) throw new ApiError(400, `Shipment ${s.shipmentNumber} does not match provider ${providerId}.`);
                if (!['cod', 'cash'].includes(s.order.paymentMethod)) throw new ApiError(400, `Shipment ${s.shipmentNumber} is not a COD order.`);
                settledShipments.push({ ...s, codAmountExpected: shipmentCodAmount(s) });
            });

            // The courier remits one lump sum; split it across shipments in proportion to what each should have collected.
            const totalExpected = settledShipments.reduce((sum, s) => sum + s.codAmountExpected, 0);
            let allocated = 0;
            settledShipments.forEach((s, i) => {
                const share = i === settledShipments.length - 1
                    ? round2(totalReceived - allocated)
                    : round2(totalExpected > 0 ? (totalReceived * s.codAmountExpected) / totalExpected : totalReceived / settledShipments.length);
                allocated = round2(allocated + share);
                receivedByShipment.set(String(s._id), share);
            });

            const confirmedAt = new Date();
            const reference = referenceId || `REMIT-${Date.now()}`;
            // 1. One remittance record per shipment (the model tracks COD per shipment).
            for (const s of settledShipments) {
                const received = receivedByShipment.get(String(s._id));
                const [remittance] = await CourierCODRemittance.create([{
                    providerId,
                    providerReference: reference,
                    bankReference: reference,
                    shipmentId: s._id,
                    orderId: s.orderId,
                    vendorId: s.vendorId,
                    awbCode: s.awbCode,
                    codAmountExpected: s.codAmountExpected,
                    codAmountReceived: received,
                    remittanceStatus: received + 0.01 < s.codAmountExpected ? 'partial' : 'received',
                    remittanceDate: confirmedAt,
                    confirmedBy: req.user?.id,
                    confirmedAt,
                    notes: notes || `Admin marked COD received for ${settledShipments.length} shipment(s).`,
                }], { session });
                remittanceIdByShipment.set(String(s._id), remittance._id);

                // 2. Mark the shipment as settled and link its remittance.
                await Shipment.updateOne(
                    { _id: s._id },
                    { $set: { isCashSettled: true, codRemittanceId: remittance._id, cashSettlementId: remittance._id } },
                    { session }
                );
            }
        });
    } finally {
        await session.endSession();
    }

    // 3. Emit COD_RECEIVED event for each shipment to unlock vendor escrow
    settledShipments.forEach(s => {
        LogisticsEventBus.emitEvent(LOGISTICS_EVENTS.COD_RECEIVED, {
            remittanceId: remittanceIdByShipment.get(String(s._id)),
            shipmentId: s._id,
            orderId: s.orderId,
            vendorId: s.vendorId,
            amountReceived: receivedByShipment.get(String(s._id)),
            providerId: s.providerId
        });
    });

    res.status(200).json(new ApiResponse(200, {
        settledCount: settledShipments.length,
        remittanceIds: [...remittanceIdByShipment.values()],
    }, 'Courier COD settled successfully.'));
});
