import Shipment from '../models/Shipment.model.js';

const reverseStatusMap = {
    pickup_assigned: 'pickup_scheduled',
    picked_up: 'picked_up',
    delivered_to_vendor: 'delivered',
};

const exchangeStatusMap = {
    out_for_delivery: 'out_for_delivery',
    completed: 'delivered',
};

export const syncReturnRequestShipmentStatus = async (returnRequest) => {
    if (!returnRequest?._id || !returnRequest?.status) return;

    const reverseStatus = reverseStatusMap[returnRequest.status]
        || (returnRequest.requestType === 'return' && returnRequest.status === 'completed' ? 'delivered' : null);
    if (reverseStatus) {
        await Shipment.findOneAndUpdate(
            { returnRequestId: returnRequest._id, type: 'reverse' },
            {
                $set: {
                    status: reverseStatus,
                    ...(reverseStatus === 'picked_up' ? { pickedUpAt: new Date() } : {}),
                    ...(reverseStatus === 'delivered' ? { deliveredAt: new Date() } : {}),
                },
            }
        );
    }

    if (returnRequest.requestType === 'exchange') {
        const exchangeStatus = exchangeStatusMap[returnRequest.status];
        if (exchangeStatus) {
            await Shipment.findOneAndUpdate(
                { returnRequestId: returnRequest._id, type: 'exchange_forward' },
                {
                    $set: {
                        status: exchangeStatus,
                        ...(exchangeStatus === 'delivered' ? { deliveredAt: new Date() } : {}),
                    },
                }
            );
        }
    }
};

export default syncReturnRequestShipmentStatus;
