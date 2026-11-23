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
import {
    getDeliveryRoutingSettings,
    getConfiguredReturnWindowDays,
    getDeliveryAppSettings,
    assertDeliveryAppEnabled,
    DELIVERY_APP_DISABLED,
} from '../../../services/settingsService.js';
import { processCancellationRefund } from '../../../services/cancellationRefundService.js';
import { ensureDeliveryOtpForShipment } from '../../../services/deliveryOtp.service.js';
import { createShiprocketShipmentOrFallback } from '../../../services/shiprocketShipment.service.js';
import {
    resolveShiprocketPickupLocation,
    evaluateDeliveryRouting,
    resolveEffectiveDeliveryMethods,
    isCodPaymentMethod,
    isSellerDeliveryShipment,
    SELLER_DELIVERY_PROVIDER,
} from '../../../services/deliveryRouting.service.js';
import {
    shipSellerDelivery,
    updateSellerDeliveryTracking,
    sendSellerDeliveryOtp,
    confirmSellerDelivery,
} from '../../../services/sellerDelivery.service.js';
import { deriveTopLevelOrderStatus } from '../../../utils/orderStatus.js';
import Vendor from '../../../models/Vendor.model.js';
import { buildVendorItemsSummary } from '../../../utils/notificationProductFormatter.js';
import { getVendorGroupPayable } from '../../../services/financial.service.js';
import { getPayoutEligibility } from '../../../services/orderFinancialHelper.js';

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
        const status = ['ALREADY_ASSIGNED', 'ASSIGNMENT_CONFLICT', DELIVERY_APP_DISABLED].includes(result.code) ? 409 : 400;
        const message = result.code === 'ALREADY_ASSIGNED'
            ? 'A delivery partner is already assigned. Ask Admin to use explicit reassignment.'
            : ASSIGNMENT_ERROR_MESSAGES[result.code] || `Unable to assign delivery partner: ${result.code}`;
        throw new ApiError(status, message, [{ code: result.code, message }]);
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
        throw new ApiError(409, `Choose a delivery method before marking the order ${nextStatus.replace(/_/g, ' ')}.`);
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

/**
 * Delivery App off: an INTERNAL shipment that has no rider yet can never get one, so it must not be handed
 * over (ready for pickup) — the seller should switch to another available method.
 */
const assertInternalShipmentCanGetRider = async (shipment) => {
    if (!shipment || shipment.deliveryMethod !== 'INTERNAL' || shipment.deliveryBoyId) return;
    const { deliveryAppEnabled } = await getDeliveryAppSettings();
    if (!deliveryAppEnabled) {
        const message = 'The SafeFire Delivery App is turned off by Admin, so Manual Delivery cannot get a delivery partner. Choose another available delivery method or contact Admin.';
        throw new ApiError(409, message, [{ code: DELIVERY_APP_DISABLED, message }]);
    }
};

/** Effective delivery methods for many shipments with one settings read (pure per shipment). */
const loadDeliveryContext = async () => {
    const [deliverySettings, routingSettings] = await Promise.all([getDeliveryAppSettings(), getDeliveryRoutingSettings()]);
    return { deliverySettings, routingSettings };
};

const decorateShipmentWithEffectiveMethods = (shipment, order, ctx) => {
    if (!shipment) return shipment;
    const effective = resolveEffectiveDeliveryMethods({ shipment, order, ...ctx });
    shipment.effectiveAllowedDeliveryMethods = effective.methods;
    shipment.unavailableDeliveryMethods = effective.unavailable;
    shipment.noDeliveryMethodReason = effective.reason;
    return shipment;
};

const METHOD_LABELS = { SHIPROCKET: 'Shiprocket', INTERNAL: 'Manual Delivery', SELLER_DELIVERY: 'Seller Delivery' };

// PATCH /api/vendor/orders/:id/shipments/:shipmentId/delivery-method  { method: 'SHIPROCKET' | 'INTERNAL' | 'SELLER_DELIVERY' }
export const selectDeliveryMethod = asyncHandler(async (req, res) => {
    const method = String(req.body?.method || '').toUpperCase();
    if (!['SHIPROCKET', 'INTERNAL', 'SELLER_DELIVERY'].includes(method)) {
        throw new ApiError(400, 'Delivery method must be SHIPROCKET, INTERNAL or SELLER_DELIVERY.');
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
    const ctx = await loadDeliveryContext();

    // Delivery App turned off after a Manual Delivery package was marked ready but before any rider was assigned:
    // the seller may move it to Seller Delivery (it stays ready for pickup and is then shipped with tracking).
    const strandedInternal = method === 'SELLER_DELIVERY'
        && !ctx.deliverySettings.deliveryAppEnabled
        && shipment.deliveryMethod === 'INTERNAL' && !shipment.deliveryBoyId
        && shipment.status === 'ready_for_pickup' && vendorItem?.status === 'ready_for_pickup';

    if (vendorItem?.status !== 'processing' && !strandedInternal) {
        throw new ApiError(409, 'Accept the order first. The delivery method can be chosen while the order is processing.');
    }
    if (LOCKED_SHIPMENT_STATUSES.includes(shipment.status) && !strandedInternal) {
        throw new ApiError(409, 'The delivery method can no longer be changed for this shipment.');
    }
    if (shipment.deliveryBoyId || shipment.providerOrderId) {
        throw new ApiError(409, 'A delivery is already in progress for this shipment. The delivery method cannot be changed.');
    }

    // Explicit switch/payment checks (clear messages), then the shared effective-method rule.
    if (method === 'INTERNAL') await assertDeliveryAppEnabled();
    if (method === 'SELLER_DELIVERY') {
        if (!ctx.deliverySettings.sellerDeliveryEnabled) throw new ApiError(409, 'Seller Delivery is not enabled by Admin.');
        if (isCodPaymentMethod(order.paymentMethod)) throw new ApiError(409, 'Seller Delivery is not available for Cash on Delivery orders.');
        if (shipment.type && shipment.type !== 'forward') throw new ApiError(409, 'Seller Delivery is only available for customer order shipments.');
    }
    if (!Array.isArray(shipment.allowedDeliveryMethods) || !shipment.allowedDeliveryMethods.length) {
        // Records saved before allowedDeliveryMethods existed: persist the wholesale/weight rule (never the
        // Admin-switch-dependent SELLER_DELIVERY, which is always derived at read time).
        shipment.allowedDeliveryMethods = evaluateDeliveryRouting({
            isWholesale: Boolean(order.isWholesale),
            weightKg: shipment.packageWeight || 1,
            settings: ctx.routingSettings,
        }).allowedDeliveryMethods;
    }
    const effective = resolveEffectiveDeliveryMethods({ shipment, order, ...ctx });
    if (!effective.methods.includes(method)) {
        const reason = effective.unavailable.find((u) => u.method === method)?.reason;
        throw new ApiError(409, reason || shipment.deliveryRoutingDetails || 'This delivery method is not available for this shipment.');
    }

    const selection = { role: 'vendor', actorId: req.user.id, selectedAt: new Date() };
    const keepReason = ['WHOLESALE', 'OVERWEIGHT'].includes(shipment.deliveryRoutingReason);
    let warning = null;
    if (method === 'SHIPROCKET') {
        const vendor = await Vendor.findById(req.user.id);
        const pickupLocation = await resolveShiprocketPickupLocation(vendor);
        if (!pickupLocation) {
            warning = ctx.deliverySettings.deliveryAppEnabled
                ? 'Your Shiprocket pickup location is not synchronized yet. If it is still missing when you mark the order ready for pickup, the shipment will fall back to Manual Delivery.'
                : 'Your Shiprocket pickup location is not synchronized yet. If it is still missing when you mark the order ready for pickup, the shipment will return to "choose a delivery method".';
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
    } else if (method === 'SELLER_DELIVERY') {
        Object.assign(shipment, {
            deliveryMethod: 'SELLER_DELIVERY',
            providerId: SELLER_DELIVERY_PROVIDER,
            deliveryRoutingReason: keepReason ? shipment.deliveryRoutingReason : 'VENDOR_SELECTED_SELLER_DELIVERY',
            deliveryRoutingDetails: keepReason ? shipment.deliveryRoutingDetails : 'Vendor selected Seller Delivery.',
            externalCreationStatus: 'not_applicable',
            deliveryAssignmentStatus: undefined,
            deliveryMethodSelectedBy: selection,
        });
    } else {
        // Wholesale/overweight keep their mandatory reason; otherwise record the vendor's choice.
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
    shipment.statusHistory.push({ status: shipment.status, updatedBy: 'vendor', notes: `Delivery method set to ${METHOD_LABELS[method]}.` });
    await shipment.save();
    notifyOrderUpdate(order);

    const shipmentObj = decorateShipmentWithEffectiveMethods(shipment.toObject(), order, ctx);
    res.status(200).json(new ApiResponse(200, { shipment: shipmentObj, warning }, `${METHOD_LABELS[method]} selected for this shipment.`));
});

// ─── Seller Delivery (seller's own courier) ───────────────────────────────────

// POST /api/vendor/orders/:id/shipments/:shipmentId/seller-delivery/ship
export const shipWithSellerDelivery = asyncHandler(async (req, res) => {
    const shipment = await shipSellerDelivery({ orderRef: req.params.id, shipmentId: req.params.shipmentId, vendorId: req.user.id, input: req.body });
    res.status(200).json(new ApiResponse(200, { shipment }, 'Package marked shipped with your courier details.'));
});

// PATCH /api/vendor/orders/:id/shipments/:shipmentId/seller-delivery/tracking
export const updateSellerDeliveryTrackingDetails = asyncHandler(async (req, res) => {
    const { shipment, changed } = await updateSellerDeliveryTracking({ orderRef: req.params.id, shipmentId: req.params.shipmentId, vendorId: req.user.id, input: req.body });
    res.status(200).json(new ApiResponse(200, { shipment, changed }, changed ? 'Tracking details updated.' : 'No changes to save.'));
});

// POST /api/vendor/orders/:id/shipments/:shipmentId/seller-delivery/send-otp
export const sendSellerDeliveryOtpToCustomer = asyncHandler(async (req, res) => {
    const result = await sendSellerDeliveryOtp({ orderRef: req.params.id, shipmentId: req.params.shipmentId, vendorId: req.user.id });
    res.status(200).json(new ApiResponse(200, result, 'Delivery OTP sent. The customer can see it on their order tracking page.'));
});

// POST /api/vendor/orders/:id/shipments/:shipmentId/seller-delivery/confirm  { otp }
export const confirmSellerDeliveryWithOtp = asyncHandler(async (req, res) => {
    const shipment = await confirmSellerDelivery({ orderRef: req.params.id, shipmentId: req.params.shipmentId, vendorId: req.user.id, otp: req.body.otp });
    res.status(200).json(new ApiResponse(200, { shipment }, 'Delivery confirmed with the customer OTP.'));
});

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
    const deliveryCtx = await loadDeliveryContext();

    const ordersWithCommissions = orders.map(order => {
        const comm = commissions.find(c => String(c.orderId) === String(order._id));
        const filteredItems = (order.items || []).filter(item => String(item.vendorId) === String(req.user.id));
        const filteredVendorItems = (order.vendorItems || []).filter(vi => String(vi.vendorId) === String(req.user.id));

        // Resolve vendor shipment
        const vendorShipment = (order.shipments || []).find(s => String(s.vendorId) === String(req.user.id));
        decorateShipmentWithEffectiveMethods(vendorShipment, order, deliveryCtx);

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
        const vCommissionRate = vi.commissionRate; // snapshot taken at checkout
        
        const commSubtotal = comm ? (comm.vendorSubtotal || comm.subtotal || vSubtotal) : vSubtotal;
        const commDiscount = comm ? (comm.vendorCouponDiscount !== undefined ? comm.vendorCouponDiscount : comm.discountShare || vDiscount) : vDiscount;
        const commDiscountedSub = comm ? (comm.vendorDiscountedSubtotal !== undefined ? comm.vendorDiscountedSubtotal : comm.effectiveSubtotal || (commSubtotal - commDiscount)) : (commSubtotal - commDiscount);
        const commTax = comm ? (comm.vendorTax || vTax) : vTax;
        // Fallback uses the shared package-payable rule (the old formula added GST twice for tax-inclusive items).
        const commPaidAmount = comm?.vendorTotalPaidByCustomer || getVendorGroupPayable(vi);
        const commRate = comm ? comm.commissionRate : vCommissionRate;
        const commAmount = comm ? (comm.commissionAmount !== undefined ? comm.commissionAmount : comm.commission) : Number(vi.commissionAmount || 0);
        const commEarnings = comm ? (comm.vendorNetEarnings !== undefined ? comm.vendorNetEarnings : comm.vendorEarnings) : Number(vi.vendorEarnings || 0);
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
    // What the seller can actually choose right now (Admin switches + payment rules), never a frontend guess.
    const deliveryCtx = await loadDeliveryContext();
    // Rules use the stored customer id (populate turns a missing user into null).
    decorateShipmentWithEffectiveMethods(vendorShipment, { ...orderObj, userId: order.populated('userId') || orderObj.userId }, deliveryCtx);
    orderObj.deliverySettings = deliveryCtx.deliverySettings;

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
    const vCommissionRate = vi.commissionRate; // snapshot taken at checkout
    
    const commSubtotal = comm ? (comm.vendorSubtotal || comm.subtotal || vSubtotal) : vSubtotal;
    const commDiscount = comm ? (comm.vendorCouponDiscount !== undefined ? comm.vendorCouponDiscount : comm.discountShare || vDiscount) : vDiscount;
    const commDiscountedSub = comm ? (comm.vendorDiscountedSubtotal !== undefined ? comm.vendorDiscountedSubtotal : comm.effectiveSubtotal || (commSubtotal - commDiscount)) : (commSubtotal - commDiscount);
    const commTax = comm ? (comm.vendorTax || vTax) : vTax;
    // Fallback uses the shared package-payable rule (the old formula added GST twice for tax-inclusive items).
        const commPaidAmount = comm?.vendorTotalPaidByCustomer || getVendorGroupPayable(vi);
    const commRate = comm ? comm.commissionRate : vCommissionRate;
    const commAmount = comm ? (comm.commissionAmount !== undefined ? comm.commissionAmount : comm.commission) : Number(vi.commissionAmount || 0);
    const commEarnings = comm ? (comm.vendorNetEarnings !== undefined ? comm.vendorNetEarnings : comm.vendorEarnings) : Number(vi.vendorEarnings || 0);
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
        settlementStatus,
        // Commission rate saved at checkout (percent); null when no snapshot exists. Never a default.
        commissionRate: commRate !== undefined && commRate !== null ? Number(commRate) : null,
        // Canonical payout status/date (approved rule 3): the saved release date, not recomputed.
        payout: getPayoutEligibility(comm, { returnWindowConfigured: (await getConfiguredReturnWindowDays()) !== null }),
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
        // Seller Delivery is shipped only through the Seller Delivery "ship" action (courier + tracking required).
        if (status === 'shipped' && isSellerDeliveryShipment(guardShipment)) {
            throw new ApiError(409, 'Enter the courier name and tracking number with "Ship with Seller Delivery" to mark this package shipped.');
        }
        if (status === 'ready_for_pickup' && currentStatus !== 'ready_for_pickup') await assertInternalShipmentCanGetRider(guardShipment);
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
            } else if (isSellerDeliveryShipment(shipmentForVendor)) {
                // Seller Delivery: nothing to book — no Shiprocket order, no rider. The seller ships it next with
                // courier + tracking details.
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
    if (!/^\d{4}$/.test(normalizedOtp)) {
        throw new ApiError(400, 'Please enter a valid 4-digit Pickup OTP.');
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
