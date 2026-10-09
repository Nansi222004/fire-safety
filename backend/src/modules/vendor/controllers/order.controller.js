import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import crypto from 'crypto';
import ApiError from '../../../utils/ApiError.js';
import Order from '../../../models/Order.model.js';
import Shipment from '../../../models/Shipment.model.js';
import DeliveryBoy from '../../../models/DeliveryBoy.model.js';
import Commission from '../../../models/Commission.model.js';
import Settlement from '../../../models/Settlement.model.js';
import mongoose from 'mongoose';
import { createNotification } from '../../../services/notification.service.js';
import {
    autoAssignDeliveryPartner,
    autoAssignDeliveryPartnerLegacy,
    manualAssignDeliveryPartner,
    listEligiblePartnersForShipment,
    toPartnerOption,
    ASSIGNMENT_ERROR_MESSAGES,
} from '../../../services/assignmentService.js';
import { notifyOrderUpdate } from '../../../services/socket.service.js';
import { getDefaultCommissionRate, getDeliveryRoutingSettings } from '../../../services/settingsService.js';
import { processCancellationRefund } from '../../../services/cancellationRefundService.js';
import { ensureDeliveryOtpForShipment } from '../../../services/deliveryOtp.service.js';
import { createShiprocketShipmentOrFallback } from '../../../services/shiprocketShipment.service.js';
import { resolveShiprocketPickupLocation, evaluateDeliveryRouting } from '../../../services/deliveryRouting.service.js';
import Vendor from '../../../models/Vendor.model.js';

// GET /api/vendor/delivery-partners/available?shipmentId=  (shipment must belong to the vendor)
export const getAvailableDeliveryPartners = asyncHandler(async (req, res) => {
    const { partners, blocker } = await listEligiblePartnersForShipment({
        shipmentId: mongoose.Types.ObjectId.isValid(req.query.shipmentId) ? req.query.shipmentId : null,
        vendorId: req.user.id,
    });
    res.status(200).json(new ApiResponse(200, partners.map(toPartnerOption),
        blocker ? ASSIGNMENT_ERROR_MESSAGES[blocker] || blocker : 'Eligible delivery partners fetched.'));
});

export const assignDeliveryPartner = asyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.body.deliveryBoyId)) {
        throw new ApiError(400, 'A valid delivery partner is required.');
    }
    const orderFilter = [{ orderId: req.params.id }];
    if (mongoose.Types.ObjectId.isValid(req.params.id)) orderFilter.push({ _id: req.params.id });
    const order = await Order.findOne({
        $or: orderFilter,
        'vendorItems.vendorId': req.user.id,
    }).select('_id');
    if (!order) throw new ApiError(404, 'Vendor order not found.');
    const shipment = await Shipment.findOne({
        _id: req.params.shipmentId,
        orderId: order._id,
        vendorId: req.user.id,
    });
    if (!shipment) throw new ApiError(404, 'Internal delivery shipment not found.');
    const result = await manualAssignDeliveryPartner({
        shipmentId: shipment._id,
        deliveryBoyId: req.body.deliveryBoyId,
        actorRole: 'vendor',
        actorId: req.user.id,
        allowReassignment: false,
    });
    if (!result.success) {
        const status = ['ALREADY_ASSIGNED', 'ASSIGNMENT_CONFLICT'].includes(result.code) ? 409 : 400;
        throw new ApiError(status, result.code === 'ALREADY_ASSIGNED'
            ? 'A delivery partner is already assigned. Ask Admin to use explicit reassignment.'
            : ASSIGNMENT_ERROR_MESSAGES[result.code] || `Unable to assign delivery partner: ${result.code}`);
    }
    res.status(200).json(new ApiResponse(200, result.shipment, 'Delivery partner assigned.'));
});

// ─── Delivery method (Shiprocket vs Manual) ───────────────────────────────────

const LOCKED_SHIPMENT_STATUSES = ['ready_for_pickup', 'pickup_scheduled', 'picked_up', 'shipped', 'in_transit',
    'out_for_delivery', 'delivered', 'cancelled', 'return_initiated', 'returned', 'failed'];

/** New shipments must have a delivery method chosen before they can be handed over. */
const assertShipmentReadyForTransition = (shipment, nextStatus) => {
    if (!shipment) return;
    const awaitingChoice = Array.isArray(shipment.allowedDeliveryMethods)
        && shipment.allowedDeliveryMethods.length > 0
        && !shipment.deliveryMethod;
    if (awaitingChoice) {
        throw new ApiError(409, `Choose a delivery method (Shiprocket or Manual Delivery) before marking the order ${nextStatus.replace(/_/g, ' ')}.`);
    }
};

/** An INTERNAL shipment may only be shipped once a valid partner has accepted it. */
const assertInternalShipmentHasActiveRider = async (shipment) => {
    if (!shipment || shipment.deliveryMethod !== 'INTERNAL') return;
    if (!shipment.deliveryBoyId) {
        throw new ApiError(409, 'Assign a delivery partner before marking this Manual Delivery order as shipped.');
    }
    if (shipment.deliveryAssignmentStatus !== 'accepted') {
        throw new ApiError(409, 'The assigned delivery partner has not accepted this delivery yet.');
    }
    const rider = await DeliveryBoy.findOne({ _id: shipment.deliveryBoyId, isActive: true, applicationStatus: 'approved' }).select('_id').lean();
    if (!rider) throw new ApiError(409, 'The assigned delivery partner is no longer active. Reassign the delivery.');
};

// PATCH /api/vendor/orders/:id/shipments/:shipmentId/delivery-method  { method: 'SHIPROCKET' | 'INTERNAL' }
export const selectDeliveryMethod = asyncHandler(async (req, res) => {
    const method = String(req.body?.method || '').toUpperCase();
    if (!['SHIPROCKET', 'INTERNAL'].includes(method)) {
        throw new ApiError(400, 'Delivery method must be SHIPROCKET or INTERNAL.');
    }
    if (!mongoose.Types.ObjectId.isValid(req.params.shipmentId)) throw new ApiError(400, 'Invalid shipment.');

    const orderFilter = [{ orderId: req.params.id }];
    if (mongoose.Types.ObjectId.isValid(req.params.id)) orderFilter.push({ _id: req.params.id });
    const order = await Order.findOne({ $or: orderFilter, 'vendorItems.vendorId': req.user.id, isDeleted: { $ne: true } });
    if (!order) throw new ApiError(404, 'Vendor order not found.');
    // Ownership first: a vendor can only ever touch its own shipment.
    const shipment = await Shipment.findOne({ _id: req.params.shipmentId, orderId: order._id, vendorId: req.user.id });
    if (!shipment) throw new ApiError(404, 'Shipment not found.');
    const vendorItem = order.vendorItems.find((vi) => String(vi.vendorId) === String(req.user.id));
    if (vendorItem?.status !== 'processing') {
        throw new ApiError(409, 'Accept the order first. The delivery method can be chosen while the order is processing.');
    }
    if (LOCKED_SHIPMENT_STATUSES.includes(shipment.status)) {
        throw new ApiError(409, 'The delivery method can no longer be changed for this shipment.');
    }
    if (shipment.deliveryBoyId || shipment.providerOrderId) {
        throw new ApiError(409, 'A delivery is already in progress for this shipment. The delivery method cannot be changed.');
    }
    let allowed = Array.isArray(shipment.allowedDeliveryMethods) && shipment.allowedDeliveryMethods.length
        ? shipment.allowedDeliveryMethods
        : null;
    if (!allowed) {
        const settings = await getDeliveryRoutingSettings();
        const routing = evaluateDeliveryRouting({
            isWholesale: Boolean(order.isWholesale),
            weightKg: shipment.packageWeight || 1,
            settings,
        });
        allowed = routing.allowedDeliveryMethods;
        shipment.allowedDeliveryMethods = allowed;
    }
    if (!allowed.includes(method)) {
        throw new ApiError(409, shipment.deliveryRoutingDetails || 'This delivery method is not available for this shipment.');
    }

    const selection = { role: 'vendor', actorId: req.user.id, selectedAt: new Date() };
    let warning = null;
    if (method === 'SHIPROCKET') {
        const vendor = await Vendor.findById(req.user.id);
        const pickupLocation = await resolveShiprocketPickupLocation(vendor);
        if (!pickupLocation) {
            warning = 'Your Shiprocket pickup location is not synchronized yet. If it is still missing when you mark the order ready for pickup, the shipment will fall back to Manual Delivery.';
        }
        Object.assign(shipment, {
            deliveryMethod: 'SHIPROCKET',
            providerId: 'shiprocket',
            deliveryRoutingReason: undefined,
            deliveryRoutingDetails: 'Vendor selected Shiprocket.',
            providerPickupLocationId: pickupLocation || shipment.providerPickupLocationId,
            externalCreationStatus: 'not_started',
            deliveryAssignmentStatus: 'pending',
            deliveryMethodSelectedBy: selection,
        });
    } else {
        // Wholesale/overweight keep their mandatory reason; otherwise record the vendor's choice.
        const keepReason = ['WHOLESALE', 'OVERWEIGHT'].includes(shipment.deliveryRoutingReason);
        Object.assign(shipment, {
            deliveryMethod: 'INTERNAL',
            providerId: 'own_fleet',
            deliveryRoutingReason: keepReason ? shipment.deliveryRoutingReason : 'VENDOR_SELECTED_MANUAL',
            deliveryRoutingDetails: keepReason ? shipment.deliveryRoutingDetails : 'Vendor selected Manual Delivery.',
            externalCreationStatus: 'not_applicable',
            deliveryAssignmentStatus: 'pending',
            deliveryMethodSelectedBy: selection,
        });
    }
    await shipment.save();
    notifyOrderUpdate(order);

    res.status(200).json(new ApiResponse(200, { shipment, warning },
        method === 'SHIPROCKET' ? 'Shiprocket selected for this shipment.' : 'Manual Delivery selected for this shipment.'));
});

const deriveTopLevelOrderStatus = (vendorItems = [], fallback = 'pending') => {
    const statuses = (vendorItems || [])
        .map((item) => String(item?.status || '').toLowerCase())
        .filter(Boolean);

    if (!statuses.length) return String(fallback || 'pending').toLowerCase();

    if (statuses.every((s) => s === 'cancelled')) return 'cancelled';
    if (statuses.every((s) => s === 'delivered')) return 'delivered';

    const nonCancelled = statuses.filter((s) => s !== 'cancelled');
    if (nonCancelled.length > 0 && nonCancelled.every((s) => s === 'delivered')) {
        return 'partially_delivered';
    }

    if (statuses.includes('shipped')) return 'shipped';
    if (statuses.includes('ready_for_pickup')) return 'ready_for_pickup';
    if (statuses.includes('processing')) return 'processing';
    if (statuses.includes('pending')) return 'pending';
    if (statuses.includes('cancelled')) return 'partially_cancelled';

    return String(fallback || 'pending').toLowerCase();
};

// GET /api/vendor/orders
export const getVendorOrders = asyncHandler(async (req, res) => {
    const { status, page = 1, limit = 20 } = req.query;
    const numericPage = Math.max(1, Number(page) || 1);
    const numericLimit = Math.max(1, Number(limit) || 20);
    const skip = (numericPage - 1) * numericLimit;

    const filter = status
        ? { vendorItems: { $elemMatch: { vendorId: req.user.id, status } } }
        : { 'vendorItems.vendorId': req.user.id };

    // Optional B2C / B2B (wholesale) segmentation. Absent → all orders (unchanged behaviour).
    if (req.query.orderType === 'b2b') {
        filter.orderType = 'b2b';
    } else if (req.query.orderType === 'b2c') {
        filter.orderType = { $ne: 'b2b' };
    }

    const orders = await Order.find(filter)
        .populate({
            path: 'shipments',
            match: { vendorId: req.user.id },
            populate: { path: 'deliveryBoyId', select: 'name email phone vehicleType vehicleNumber status' }
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(numericLimit)
        .lean();
    const total = await Order.countDocuments(filter);

    const orderIds = orders.map(o => o._id);
    const commissions = await Commission.find({
        orderId: { $in: orderIds },
        vendorId: req.user.id
    }).lean();

    const defaultRate = await getDefaultCommissionRate();
    const ordersWithCommissions = orders.map(order => {
        const comm = commissions.find(c => String(c.orderId) === String(order._id));
        const filteredItems = (order.items || []).filter(item => String(item.vendorId) === String(req.user.id));
        const filteredVendorItems = (order.vendorItems || []).filter(vi => String(vi.vendorId) === String(req.user.id));
        
        // Resolve vendor shipment
        const vendorShipment = (order.shipments || []).find(s => String(s.vendorId) === String(req.user.id));

        // Preserve vendor preparation status as source of truth.
        // Only sync forward when delivery actually enters transit or completes delivery.
        filteredVendorItems.forEach(vi => {
            if (vi.status !== 'cancelled') {
                if (vendorShipment?.status === 'delivered' || order.status === 'delivered') {
                    vi.status = 'delivered';
                } else if (['shipped', 'out_for_delivery', 'picked_up', 'in_transit'].includes(vendorShipment?.status) || order.status === 'shipped') {
                    vi.status = 'shipped';
                }
            }
        });

        const vi = filteredVendorItems[0] || {};
        const vSubtotal = vi.subtotal || 0;
        const vDiscount = vi.discount || 0;
        const vTax = vi.tax || 0;
        const vShipping = vi.shipping || 0;
        const vCommissionRate = vi.commissionRate !== undefined && vi.commissionRate !== null ? vi.commissionRate : defaultRate;
        
        const commSubtotal = comm ? (comm.vendorSubtotal || comm.subtotal || vSubtotal) : vSubtotal;
        const commDiscount = comm ? (comm.vendorCouponDiscount !== undefined ? comm.vendorCouponDiscount : comm.discountShare || vDiscount) : vDiscount;
        const commDiscountedSub = comm ? (comm.vendorDiscountedSubtotal !== undefined ? comm.vendorDiscountedSubtotal : comm.effectiveSubtotal || (commSubtotal - commDiscount)) : (commSubtotal - commDiscount);
        const commTax = comm ? (comm.vendorTax || vTax) : vTax;
        const commPaidAmount = comm ? (comm.vendorTotalPaidByCustomer || (commDiscountedSub + vShipping + commTax)) : (commDiscountedSub + vShipping + commTax);
        const commRate = comm ? comm.commissionRate : vCommissionRate;
        const commAmount = comm ? (comm.commissionAmount !== undefined ? comm.commissionAmount : comm.commission) : parseFloat((commDiscountedSub * commRate / 100).toFixed(2));
        const commEarnings = comm ? (comm.vendorNetEarnings !== undefined ? comm.vendorNetEarnings : comm.vendorEarnings) : parseFloat((commDiscountedSub - commAmount).toFixed(2));
        const escrowStatus = comm ? (comm.escrowStatus || 'held') : 'held';
        const settlementStatus = comm ? (comm.settlementStatus || comm.status || 'pending') : 'pending';

        return {
            ...order,
            status: vi.status || order.status,
            items: filteredItems,
            vendorItems: filteredVendorItems,
            shipment: vendorShipment || null,
            commissionDetails: comm ? {
                ...comm,
                effectiveSubtotal: commDiscountedSub,
                commission: commAmount,
                vendorEarnings: commEarnings
            } : null,
            vendorFinancials: {
                subtotal: parseFloat(commSubtotal.toFixed(2)),
                discount: parseFloat(commDiscount.toFixed(2)),
                tax: parseFloat(commTax.toFixed(2)),
                shipping: parseFloat(vShipping.toFixed(2)),
                customerPaidAmount: parseFloat(commPaidAmount.toFixed(2)),
                commission: parseFloat(commAmount.toFixed(2)),
                earnings: parseFloat(commEarnings.toFixed(2)),
                escrowStatus,
                settlementStatus
            }
        };
    });

    res.status(200).json(new ApiResponse(200, { orders: ordersWithCommissions, total, page: numericPage, pages: Math.ceil(total / numericLimit) }, 'Orders fetched.'));
});

// GET /api/vendor/orders/:id
export const getVendorOrderById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const idFilter = [{ orderId: id }];
    if (mongoose.Types.ObjectId.isValid(id)) {
        idFilter.push({ _id: id });
    }

    const order = await Order.findOne({
        $or: idFilter,
        'vendorItems.vendorId': req.user.id,
    })
    .populate({
        path: 'shipments',
        match: { vendorId: req.user.id },
        populate: { path: 'deliveryBoyId', select: 'name email phone vehicleType vehicleNumber status' }
    })
    .populate('userId', 'name email');

    if (!order) throw new ApiError(404, 'Order not found.');

    const commissionDoc = await Commission.findOne({
        orderId: order._id,
        vendorId: req.user.id
    }).lean();

    const defaultRate = await getDefaultCommissionRate();
    const orderObj = order.toObject({ virtuals: true });
    const comm = commissionDoc;
    const filteredItems = (orderObj.items || []).filter(item => String(item.vendorId) === String(req.user.id));
    const filteredVendorItems = (orderObj.vendorItems || []).filter(vi => String(vi.vendorId) === String(req.user.id));
    
    // Resolve vendor shipment
    const vendorShipment = (orderObj.shipments || []).find(s => String(s.vendorId) === String(req.user.id));
    if (vendorShipment && (!vendorShipment.allowedDeliveryMethods || !vendorShipment.allowedDeliveryMethods.length)) {
        const settings = await getDeliveryRoutingSettings();
        const routing = evaluateDeliveryRouting({
            isWholesale: Boolean(order.isWholesale),
            weightKg: vendorShipment.packageWeight || 1,
            settings,
        });
        vendorShipment.allowedDeliveryMethods = routing.allowedDeliveryMethods;
        if (!vendorShipment.deliveryRoutingReason && routing.deliveryRoutingReason) {
            vendorShipment.deliveryRoutingReason = routing.deliveryRoutingReason;
        }
        if (!vendorShipment.deliveryRoutingDetails && routing.deliveryRoutingDetails) {
            vendorShipment.deliveryRoutingDetails = routing.deliveryRoutingDetails;
        }
        Shipment.updateOne({ _id: vendorShipment._id }, {
            $set: {
                allowedDeliveryMethods: routing.allowedDeliveryMethods,
                ...(routing.deliveryRoutingReason ? { deliveryRoutingReason: routing.deliveryRoutingReason } : {}),
                ...(routing.deliveryRoutingDetails ? { deliveryRoutingDetails: routing.deliveryRoutingDetails } : {}),
            }
        }).catch(() => {});
    }

    // Preserve vendor preparation status as source of truth.
    // Only sync forward when delivery actually enters transit or completes delivery.
    filteredVendorItems.forEach(vi => {
        if (vi.status !== 'cancelled') {
            if (vendorShipment?.status === 'delivered' || orderObj.status === 'delivered') {
                vi.status = 'delivered';
            } else if (['shipped', 'out_for_delivery', 'picked_up', 'in_transit'].includes(vendorShipment?.status) || orderObj.status === 'shipped') {
                vi.status = 'shipped';
            }
        }
    });
    
    const vi = filteredVendorItems[0] || {};
    const vSubtotal = vi.subtotal || 0;
    const vDiscount = vi.discount || 0;
    const vTax = vi.tax || 0;
    const vShipping = vi.shipping || 0;
    const vCommissionRate = vi.commissionRate !== undefined && vi.commissionRate !== null ? vi.commissionRate : defaultRate;
    
    const commSubtotal = comm ? (comm.vendorSubtotal || comm.subtotal || vSubtotal) : vSubtotal;
    const commDiscount = comm ? (comm.vendorCouponDiscount !== undefined ? comm.vendorCouponDiscount : comm.discountShare || vDiscount) : vDiscount;
    const commDiscountedSub = comm ? (comm.vendorDiscountedSubtotal !== undefined ? comm.vendorDiscountedSubtotal : comm.effectiveSubtotal || (commSubtotal - commDiscount)) : (commSubtotal - commDiscount);
    const commTax = comm ? (comm.vendorTax || vTax) : vTax;
    const commPaidAmount = comm ? (comm.vendorTotalPaidByCustomer || (commDiscountedSub + vShipping + commTax)) : (commDiscountedSub + vShipping + commTax);
    const commRate = comm ? comm.commissionRate : vCommissionRate;
    const commAmount = comm ? (comm.commissionAmount !== undefined ? comm.commissionAmount : comm.commission) : parseFloat((commDiscountedSub * commRate / 100).toFixed(2));
    const commEarnings = comm ? (comm.vendorNetEarnings !== undefined ? comm.vendorNetEarnings : comm.vendorEarnings) : parseFloat((commDiscountedSub - commAmount).toFixed(2));
    const escrowStatus = comm ? (comm.escrowStatus || 'held') : 'held';
    const settlementStatus = comm ? (comm.settlementStatus || comm.status || 'pending') : 'pending';

    orderObj.status = vi.status || orderObj.status;
    orderObj.items = filteredItems;
    orderObj.vendorItems = filteredVendorItems;
    // Canonical shape: `shipments` is always an array scoped to this vendor (frontend contract).
    orderObj.shipments = vendorShipment ? [vendorShipment] : [];
    orderObj.commissionDetails = comm ? {
        ...comm,
        effectiveSubtotal: commDiscountedSub,
        commission: commAmount,
        vendorEarnings: commEarnings
    } : null;
    orderObj.vendorFinancials = {
        subtotal: parseFloat(commSubtotal.toFixed(2)),
        discount: parseFloat(commDiscount.toFixed(2)),
        tax: parseFloat(commTax.toFixed(2)),
        shipping: parseFloat(vShipping.toFixed(2)),
        customerPaidAmount: parseFloat(commPaidAmount.toFixed(2)),
        commission: parseFloat(commAmount.toFixed(2)),
        earnings: parseFloat(commEarnings.toFixed(2)),
        escrowStatus,
        settlementStatus
    };

    res.status(200).json(new ApiResponse(200, orderObj, 'Order fetched.'));
});

// PATCH /api/vendor/orders/:id/status
export const updateOrderStatus = asyncHandler(async (req, res) => {
    const { status } = req.body;
    if (!status) throw new ApiError(400, 'Status is required.');
    const allowed = ['pending', 'processing', 'ready_for_pickup', 'shipped', 'cancelled'];
    if (!allowed.includes(status)) throw new ApiError(400, `Status must be one of: ${allowed.join(', ')}`);

    const transitionMap = {
        pending: ['pending', 'processing', 'cancelled'],
        processing: ['processing', 'ready_for_pickup', 'cancelled'],
        ready_for_pickup: ['ready_for_pickup', 'shipped'],
        shipped: ['shipped'],
        cancelled: ['cancelled'],
    };

    const orderIdParam = req.params.id;
    const isMongoId = mongoose.Types.ObjectId.isValid(orderIdParam);
    const query = {
        $or: [
            { orderId: orderIdParam },
            { _id: isMongoId ? orderIdParam : null }
        ],
        'vendorItems.vendorId': req.user.id,
    };

    const order = await Order.findOne(query);
    if (!order) throw new ApiError(404, 'Order not found.');
    const vendorItem = order.vendorItems.find((vi) => String(vi.vendorId) === String(req.user.id));
    if (!vendorItem) throw new ApiError(404, 'Vendor order item not found.');

    const currentStatus = String(vendorItem.status || 'pending');
    const allowedNextStatuses = transitionMap[currentStatus] || [];
    if (!allowedNextStatuses.includes(status)) {
        throw new ApiError(409, `Cannot move order from ${currentStatus} to ${status}.`);
    }

    if (status === 'ready_for_pickup' || status === 'shipped') {
        const guardShipment = await Shipment.findOne({ orderId: order._id, vendorId: req.user.id });
        assertShipmentReadyForTransition(guardShipment, status);
        if (status === 'shipped') await assertInternalShipmentHasActiveRider(guardShipment);
    }

    if (status === 'cancelled') {
        const result = await processCancellationRefund({
            orderId: order._id,
            vendorGroupId: req.user.id,
            cancelledBy: 'vendor',
            reason: req.body.reason || 'Cancelled by vendor',
            comment: req.body.comment || '',
        });

        notifyOrderUpdate(result.order || order);

        // Send customer notification after cancellation succeeds
        if (order.userId) {
            const vendorName = vendorItem?.vendorName || 'Seller';
            const refundMsg = (result.refundAmount || 0) > 0
                ? (order.paymentMethod === 'cod'
                    ? ' No refund applicable for Cash on Delivery.'
                    : ` ₹${result.refundAmount} refund initiated to your original payment method. Your bank/UPI provider may take additional time to credit the amount.`)
                : '';
            createNotification({
                recipientId: order.userId,
                recipientType: 'user',
                title: 'Item Cancelled by Seller',
                message: `Your item(s) from "${vendorName}" in Order #${order.orderId} was cancelled by the seller. Reason: ${req.body.reason || 'Cancelled by vendor'}.${refundMsg}`,
                type: 'order',
                data: { orderId: String(order._id), refundAmount: result.refundAmount || 0 },
            }).catch(err => console.error('[Vendor Order Cancel Notification Error]:', err.message));
        }

        return res.status(200).json(new ApiResponse(200, result.order || order, `Order item marked as cancelled and refund of ₹${result.refundAmount || 0} processed.`));
    }

    // Update only this vendor's items status
    order.vendorItems = order.vendorItems.map((vi) =>
        vi.vendorId.toString() === req.user.id ? { ...vi.toObject(), status } : vi
    );
    order.status = deriveTopLevelOrderStatus(order.vendorItems, order.status);
    await order.save();
    notifyOrderUpdate(order);

    const shipmentForVendor = await Shipment.findOne({
        orderId: order._id,
        vendorId: req.user.id,
    });

    if (shipmentForVendor) {
        shipmentForVendor.status = status === 'processing' ? 'confirmed' : status;
        await shipmentForVendor.save();

        if (status === 'shipped' && (shipmentForVendor.providerId === 'own_fleet' || shipmentForVendor.deliveryBoyId)) {
            await ensureDeliveryOtpForShipment(shipmentForVendor, order);
        }
    }

    if (status === 'ready_for_pickup') {
        // Phase 5.2: Use Shipment-primary assignment for new orders (with Shipment),
        // fall back to legacy Order-primary assignment for old orders (without Shipment).
        //
        // [⚠️ DUAL-WRITE] The Shipment path writes Shipment first, then dual-writes
        // Order.deliveryBoyId for backward compatibility. The legacy path writes Order only.
        // Both paths are fire-and-forget (non-blocking).

        if (shipmentForVendor) {
            // New order (Phase 5.1+): use Shipment-primary assignment
            if (shipmentForVendor.providerId === 'shiprocket') {
                // Atomic creation prevents duplicate Shiprocket orders on repeated status requests.
                // A provider/API failure converts the same Shipment to internal manual delivery.
                createShiprocketShipmentOrFallback(shipmentForVendor._id)
                    .then((result) => {
                        if (!result.success) console.error('[3PL] Shiprocket fallback:', result.error || result.reason);
                        notifyOrderUpdate(order);
                    })
                    .catch(err => console.error('[3PL] Shiprocket create/fallback exception:', err));
            } else if (shipmentForVendor.providerId === 'delhivery') {
                // Fire and forget Delhivery assignment
                import('../../../providers/delhivery.provider.js')
                    .then(({ default: delhiveryProvider }) => {
                        delhiveryProvider.createShipment(shipmentForVendor).then(res => {
                            if (res.success) {
                                shipmentForVendor.awbCode = res.awbCode;
                                shipmentForVendor.trackingUrl = res.trackingUrl;
                                shipmentForVendor.labelUrl = res.labelUrl;
                                shipmentForVendor.providerOrderId = res.providerMetadata?.waybill;
                                shipmentForVendor.providerMetadata = res.providerMetadata;
                                shipmentForVendor.save().catch(e => console.error('Failed to save 3PL shipment info:', e));
                            } else {
                                console.error('[3PL] Delhivery createShipment failed:', res.error);
                                shipmentForVendor.deliveryAssignmentStatus = 'failed';
                                shipmentForVendor.save().catch(e => console.error(e));
                            }
                        }).catch(err => console.error('[3PL] Delhivery createShipment exception:', err));
                    })
                    .catch(err => console.error('Failed to load delhivery provider:', err));
            } else if (shipmentForVendor.providerId === 'own_fleet') {
                // Manual (INTERNAL) delivery: Vendor or Admin assigns a partner via
                // /shipments/:id/assign-delivery (ManualDeliveryAssignment UI) — never auto-assigned.
                // Legacy own-fleet shipments without a delivery method keep automatic offers.
                if (shipmentForVendor.deliveryMethod !== 'INTERNAL') {
                    autoAssignDeliveryPartner(shipmentForVendor._id);
                }
            } else {
                console.warn(`[Auto Assign] Unknown provider ${shipmentForVendor.providerId} for shipment ${shipmentForVendor._id}.`);
            }
        } else {
            // Legacy order (pre-Phase-5.1): use Order-primary assignment
            autoAssignDeliveryPartnerLegacy(order._id);
        }
    }

    const notificationTasks = [];
    const vItemsText = buildVendorItemsSummary(vendorItem.items);
    const orderHumanId = String(order.orderId || order._id);

    if (order.userId) {
        let notifTitle = 'Order item status updated';
        let notifMsg = `An item in your order ${orderHumanId} is now ${status}.${vItemsText}`;

        if (status === 'processing') {
            notifTitle = 'Your order has been accepted';
            notifMsg = `Your order ${orderHumanId} has been accepted by the seller.${vItemsText}`;
        } else if (status === 'ready_for_pickup') {
            notifTitle = 'Order ready for pickup';
            notifMsg = `An item in your order ${orderHumanId} is packed and ready for courier pickup.${vItemsText}`;
        }

        notificationTasks.push(
            createNotification({
                recipientId: order.userId,
                recipientType: 'user',
                title: notifTitle,
                message: notifMsg,
                type: 'order',
                eventKey: `order:${orderHumanId}:status:${status}:user`,
                data: {
                    orderId: orderHumanId,
                    orderMongoId: String(order._id),
                    status: String(status),
                    scope: 'vendor_item',
                    deepLink: `/orders/${orderHumanId}`,
                },
            })
        );
    }

    if (notificationTasks.length > 0) {
        await Promise.allSettled(notificationTasks);
    }

    res.status(200).json(new ApiResponse(200, order, 'Order status updated.'));
});

// GET /api/vendor/earnings
export const getEarnings = asyncHandler(async (req, res) => {
    const {
        page = 1,
        limit = 50,
        settlementsPage = 1,
        settlementsLimit = 50,
    } = req.query;
    const numericPage = Math.max(1, Number(page) || 1);
    const numericLimit = Math.max(1, Number(limit) || 50);
    const commissionSkip = (numericPage - 1) * numericLimit;
    const numericSettlementsPage = Math.max(1, Number(settlementsPage) || 1);
    const numericSettlementsLimit = Math.max(1, Number(settlementsLimit) || 50);
    const settlementSkip = (numericSettlementsPage - 1) * numericSettlementsLimit;

    const [commissionDocs, totalCommissions, settlements, totalSettlements] = await Promise.all([
        Commission.find({ vendorId: req.user.id })
            .populate('orderId', 'orderId status')
            .sort({ createdAt: -1 })
            .skip(commissionSkip)
            .limit(numericLimit),
        Commission.countDocuments({ vendorId: req.user.id }),
        Settlement.find({ vendorId: req.user.id })
            .sort({ createdAt: -1 })
            .skip(settlementSkip)
            .limit(numericSettlementsLimit),
        Settlement.countDocuments({ vendorId: req.user.id }),
    ]);
    const allCommissionsForSummary = await Commission.find({ vendorId: req.user.id })
        .populate('orderId', 'orderId status')
        .sort({ createdAt: -1 });

    const commissions = commissionDocs.map((doc) => {
        const commission = doc.toObject();
        const orderRef = commission.orderId?._id || commission.orderId;
        const orderDisplayId = commission.orderId?.orderId || String(orderRef || '');
        const orderStatus = String(commission.orderId?.status || '').toLowerCase();
        const effectiveStatus = orderStatus === 'cancelled' ? 'cancelled' : String(commission.status || 'pending');
        return {
            ...commission,
            orderRef,
            orderDisplayId,
            effectiveStatus,
        };
    });

    const summary = allCommissionsForSummary.reduce((acc, doc) => {
        const c = doc.toObject();
        const status = String(c.status || 'pending');
        const orderStatus = String(c.orderId?.status || '').toLowerCase();
        const effectiveStatus = orderStatus === 'cancelled' ? 'cancelled' : status;
        const earnings = Number(c.vendorEarnings || 0);
        const commissionAmount = Number(c.commission || 0);

        // Cancelled commissions should not contribute to active earnings totals.
        if (effectiveStatus !== 'cancelled') {
            acc.totalEarnings += earnings;
            acc.totalCommission += commissionAmount;
            acc.totalOrders += 1;
        }

        if (effectiveStatus === 'pending') acc.pendingEarnings += earnings;
        if (effectiveStatus === 'paid') acc.paidEarnings += earnings;
        if (effectiveStatus === 'cancelled') acc.cancelledEarnings += earnings;
        return acc;
    }, {
        totalEarnings: 0,
        pendingEarnings: 0,
        paidEarnings: 0,
        cancelledEarnings: 0,
        totalCommission: 0,
        totalOrders: 0
    });

    res.status(200).json(
        new ApiResponse(
            200,
            {
                summary,
                commissions,
                settlements,
                pagination: {
                    totalCommissions,
                    page: numericPage,
                    limit: numericLimit,
                    pages: Math.max(1, Math.ceil(totalCommissions / numericLimit)),
                },
                settlementsPagination: {
                    totalSettlements,
                    page: numericSettlementsPage,
                    limit: numericSettlementsLimit,
                    pages: Math.max(1, Math.ceil(totalSettlements / numericSettlementsLimit)),
                },
            },
            'Earnings fetched.'
        )
    );
});

// POST /api/vendor/orders/:id/verify-pickup
export const verifyPickup = asyncHandler(async (req, res) => {
    const { otp } = req.body;
    const normalizedOtp = String(otp || '').trim();
    if (!/^\d{6}$/.test(normalizedOtp)) {
        throw new ApiError(400, 'Please enter a valid 6-digit Pickup OTP.');
    }

    const { id } = req.params;
    const idFilter = [{ orderId: id }];
    if (mongoose.Types.ObjectId.isValid(id)) {
        idFilter.push({ _id: id });
    }

    const order = await Order.findOne({
        $or: idFilter,
        'vendorItems.vendorId': req.user.id,
    });

    if (!order) throw new ApiError(404, 'Order not found.');

    const shipment = await mongoose.model('Shipment').findOne({
        orderId: order._id,
        vendorId: req.user.id
    }).select('+pickupOtpHash +pickupOtpExpiry +pickupOtpDebug');

    if (!shipment) throw new ApiError(404, 'Shipment not found for this vendor.');

    const vendorItem = order.vendorItems.find((vi) => String(vi.vendorId) === String(req.user.id));
    if (!vendorItem) throw new ApiError(404, 'Vendor order item not found.');

    if (!['ready_for_pickup', 'confirmed'].includes(shipment.status)) {
        throw new ApiError(409, `Pickup verification is only allowed when shipment is Ready for Pickup. Current status is ${shipment.status}.`);
    }

    if (shipment.deliveryAssignmentStatus !== 'accepted') {
        throw new ApiError(409, `No active accepted delivery partner for this shipment. Current status is ${shipment.deliveryAssignmentStatus}.`);
    }

    if (!shipment.pickupOtpHash || !shipment.pickupOtpExpiry) {
        throw new ApiError(400, 'Pickup OTP was not generated. Please re-assign or re-accept the delivery offer.');
    }

    if (shipment.pickupOtpExpiry < new Date()) {
        throw new ApiError(400, 'Pickup OTP has expired. Please ask the delivery boy to resend it.');
    }

    // Verify OTP
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET is not configured.');
    const hashedInput = crypto.createHash('sha256').update(`${normalizedOtp}:${secret}`).digest('hex');

    if (shipment.pickupOtpHash !== hashedInput) {
        throw new ApiError(400, 'Invalid Pickup OTP.');
    }

    // OTP Verified! Advance status to picked_up
    shipment.status = 'picked_up';
    shipment.pickedUpAt = new Date();
    shipment.pickupOtpHash = undefined;
    shipment.pickupOtpDebug = undefined;
    await shipment.save();

    // Update order vendor item status
    order.vendorItems = order.vendorItems.map((vi) =>
        String(vi.vendorId) === String(req.user.id) ? { ...vi.toObject(), status: 'shipped' } : vi
    );
    order.status = deriveTopLevelOrderStatus(order.vendorItems, order.status);
    await order.save();
    
    notifyOrderUpdate(order);
    
    // Trigger notification tasks
    const notificationTasks = [];
    const vItemsText = buildVendorItemsSummary(vendorItem.items);
    const orderHumanId = String(order.orderId || order._id);

    if (order.userId) {
        notificationTasks.push(
            createNotification({
                recipientId: order.userId,
                recipientType: 'user',
                title: 'Order item status updated',
                message: `An item in your order ${orderHumanId} is now shipped.${vItemsText}`,
                type: 'order',
                eventKey: `order:${orderHumanId}:status:shipped:user`,
                data: {
                    orderId: orderHumanId,
                    orderMongoId: String(order._id),
                    status: 'shipped',
                    scope: 'vendor_item',
                    deepLink: `/orders/${orderHumanId}`,
                },
            })
        );
    }

    if (order.deliveryBoyId) {
        notificationTasks.push(
            createNotification({
                recipientId: order.deliveryBoyId,
                recipientType: 'delivery',
                title: 'Pickup verified successfully',
                message: `Pickup for order ${orderHumanId} has been verified. You can now proceed to deliver the items.${vItemsText}`,
                type: 'order',
                eventKey: `order:${orderHumanId}:pickup_verified:${order.deliveryBoyId}`,
                data: {
                    orderId: orderHumanId,
                    orderMongoId: String(order._id),
                    status: 'shipped',
                    deepLink: `/delivery/orders/${orderHumanId}`,
                },
            })
        );
    }

    await Promise.allSettled(notificationTasks);

    res.status(200).json(new ApiResponse(200, order, 'Pickup OTP verified successfully. Package marked as shipped.'));
});
