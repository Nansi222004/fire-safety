import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Order from '../../../models/Order.model.js';
import Shipment from '../../../models/Shipment.model.js';
import Payment from '../../../models/Payment.model.js';
import PaymentAttempt from '../../../models/PaymentAttempt.model.js';
import Commission from '../../../models/Commission.model.js';
import Product from '../../../models/Product.model.js';
import Vendor from '../../../models/Vendor.model.js';
import ReturnRequest from '../../../models/ReturnRequest.model.js';
import mongoose from 'mongoose';
import { createRazorpayOrder, verifyPaymentSignature } from '../../../services/payment.service.js';
import { getWallet, debitWallet } from '../../../services/wallet.service.js';
import LogisticsEventBus from '../../../events/logisticsEventBus.js';
import LOGISTICS_EVENTS from '../../../events/logisticsEvents.js';
import { processCapturedPayment } from '../../../services/paymentProcessor.js';
import { isPaymentMethodEnabled, isOnlinePaymentActive } from '../../../services/settingsService.js';
import Admin from '../../../models/Admin.model.js';
import { createNotification } from '../../../services/notification.service.js';
import { sendOrderConfirmationEmail } from '../../../services/email.service.js';
import { notifyOrderUpdate } from '../../../services/socket.service.js';
import { buildOrderItemsSummary, buildVendorItemsSummary } from '../../../utils/notificationProductFormatter.js';
import ShippingQuote from '../../../models/ShippingQuote.model.js';

import { calculateOrderFinancials } from '../../../services/financial.service.js';
import { calculateVendorShippingForGroups } from '../../../services/vendorShipping.service.js';
import { generateOrderId } from '../../../utils/generateOrderId.js';
import { generateTrackingNumber } from '../../../utils/generateTrackingNumber.js';
import { describePaymentMethod } from '../../../utils/paymentMethodLabel.js';
import { getRazorpayKeyId } from '../../../config/razorpayConfig.js';
import { findMatchingVariantKey, encodeVariantKey } from '../../../utils/variantKeyHelper.js';
import { assertWholesaleBuyer, resolveWholesaleLine } from '../../../services/wholesale.service.js';
import { buildOrderRoutingDecisions } from '../../../services/deliveryRouting.service.js';
import { validateCoupon, consumeCouponUsage } from '../../../services/coupon.service.js';
import { resolveVendorCommissionRates } from '../../../services/commission.service.js';

// ─── POST /api/user/payment/initialize ────────────────────────────────────────
// Creates DB order (payment_pending) + Razorpay order. No stock deducted yet.
export const initializePayment = asyncHandler(async (req, res) => {
    const {
        items,
        couponCode,
        shippingAddress,
        paymentMethod,
        shippingOption,
        shippingQuotes,
        idempotencyKey,
        orderType,
    } = req.body;

    const userId = req.user?.id;
    if (orderType !== undefined && !['b2c', 'b2b'].includes(orderType)) {
        throw new ApiError(400, 'Invalid order type.');
    }
    const isWholesaleOrder = orderType === 'b2b';
    const normalizedPaymentMethod = paymentMethod === 'cash' ? 'cod' : paymentMethod;

    // No method chosen: say so (never treated as COD or any other method). Same 400 as an unavailable method.
    if (!String(paymentMethod ?? '').trim()) {
        throw new ApiError(400, 'Please choose a payment method.');
    }

    // Central Payment Gate: the Admin COD / online / wallet switches decide which methods take new orders.
    const isMethodActive = await isPaymentMethodEnabled(normalizedPaymentMethod);
    if (!isMethodActive) {
        throw new ApiError(400, `${describePaymentMethod(paymentMethod)} is currently unavailable. Please choose another payment method.`);
    }
    // Wallet may cover only part of an online order; the rest then needs the gateway.
    if (req.body.useWallet && !['wallet', 'cod'].includes(normalizedPaymentMethod) && !(await isPaymentMethodEnabled('wallet'))) {
        throw new ApiError(400, 'SafeFire Wallet is currently unavailable. Please pay the full amount online.');
    }

    // 4.3 — Idempotency: if client sends a key, return the existing order if it was already created
    if (idempotencyKey) {
        const existing = await Order.findOne({
            userId,
            idempotencyKey,
            status: { $in: ['payment_pending', 'processing', 'pending'] },
        }).lean();
        if (existing) {
            if (existing.paymentMethod === 'wallet' || existing.paymentStatus === 'paid') {
                const currentWallet = await getWallet(userId);
                return res.status(200).json(new ApiResponse(200, {
                    orderId: existing.orderId,
                    total: existing.total,
                    paymentMethod: existing.paymentMethod,
                    paymentStatus: existing.paymentStatus,
                    walletBalance: currentWallet.balance,
                    idempotent: true,
                }, 'Returning existing paid order.'));
            }
            if (existing.paymentMethod === 'cod') {
                return res.status(200).json(new ApiResponse(200, {
                    orderId: existing.orderId,
                    total: existing.total,
                    paymentMethod: 'cod',
                    paymentStatus: existing.paymentStatus || 'pending',
                    razorpayOrderId: null,
                    idempotent: true,
                }, 'Returning existing COD order.'));
            }
            const existingAttempt = await PaymentAttempt.findOne({ orderId: existing._id }).sort({ attemptNumber: -1 }).lean();
            return res.status(200).json(new ApiResponse(200, {
                orderId: existing.orderId,
                razorpayOrderId: existingAttempt?.razorpayOrderId || null,
                amount: Number((Number(existing.total || 0) - Number(existing.walletAmountUsed || 0)).toFixed(2)),
                currency: 'INR',
                key: getRazorpayKeyId(),
                idempotent: true,
            }, 'Returning existing payment session.'));
        }
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
        throw new ApiError(400, 'Order items are required.');
    }
    if (!shippingAddress) {
        throw new ApiError(400, 'Shipping address is required.');
    }

    // --- Resolve products and validate server-side pricing ---
    const productIds = [...new Set(items.map(i => i.productId))];
    const products = await Product.find({ _id: { $in: productIds }, isActive: true }).lean();
    const productMap = Object.fromEntries(products.map(p => [String(p._id), p]));

    // --- Wholesale / B2B: server-side eligibility (never trust the client) ---
    let wholesaleBuyer = null;
    let wholesaleSellerMap = {};
    if (isWholesaleOrder) {
        wholesaleBuyer = await assertWholesaleBuyer(userId);
        if (couponCode) {
            throw new ApiError(400, 'Coupons cannot be applied to wholesale orders.');
        }
        const sellerIds = [...new Set(products.map(p => String(p.vendorId)))];
        const sellers = await Vendor.find({ _id: { $in: sellerIds } })
            .select('status accountType vendorCapabilities wholesaleCapability.status')
            .lean();
        wholesaleSellerMap = Object.fromEntries(sellers.map(v => [String(v._id), v]));
    }

    const enrichedItems = [];
    const vendorMap = {};

    for (const item of items) {
        const product = productMap[String(item.productId)];
        if (!product) throw new ApiError(404, `Product not found: ${item.productId}`);

        const basePrice = Number(product.price);
        if (!Number.isFinite(basePrice)) throw new ApiError(400, `Invalid price for ${product.name}`);

        let price = basePrice;
        const quantity = Number(item.quantity);
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000) {
            throw new ApiError(400, `Invalid quantity for product ${item.productId}. Must be a positive integer between 1 and 10000.`);
        }

        if (isWholesaleOrder) {
            const seller = wholesaleSellerMap[String(product.vendorId)];
            if (!seller || seller.status !== 'approved') {
                throw new ApiError(400, `${product.name} is not currently available.`);
            }
            // Validates B2B availability, approved seller, MOQ and stock; returns the wholesale unit price.
            price = resolveWholesaleLine(product, quantity, {
                buyerVendorId: wholesaleBuyer._id,
                sellerVendor: seller,
            }).price;
        } else if (product.b2cAvailable === false) {
            throw new ApiError(400, `${product.name} is available for wholesale (B2B) purchase only.`);
        }
        const vendorId = String(product.vendorId);

        const variantKey = item.variantKey || null;
        if (!isWholesaleOrder && variantKey) {
            // The product page and cart show the variant's own price; charge that price, not the base price.
            const matchedPriceKey = findMatchingVariantKey(product.variants?.prices, variantKey);
            if (matchedPriceKey) {
                const prices = product.variants.prices;
                const variantPrice = Number(typeof prices.get === 'function' ? prices.get(matchedPriceKey) : prices[matchedPriceKey]);
                if (Number.isFinite(variantPrice) && variantPrice >= 0) price = variantPrice;
            }
            const matchedStockKey = findMatchingVariantKey(product.variants?.stockMap, variantKey);
            if (matchedStockKey) {
                const stockMap = product.variants.stockMap;
                const variantStock = Number(typeof stockMap.get === 'function' ? stockMap.get(matchedStockKey) : stockMap[matchedStockKey]);
                if (Number.isFinite(variantStock) && variantStock < quantity) {
                    throw new ApiError(400, `Only ${variantStock} units available for selected variant of ${product.name}.`);
                }
            }
        }
        const variantImage =
            variantKey && product.variants?.imageMap
                ? String((product.variants.imageMap instanceof Map || typeof product.variants.imageMap.get === 'function' ? product.variants.imageMap.get(variantKey) : product.variants.imageMap[variantKey]) || '').trim()
                : '';

        enrichedItems.push({
            productId: product._id,
            name: product.name,
            image: variantImage || product.image || '',
            price,
            quantity,
            vendorId: product.vendorId,
            taxRate: product.taxRate,
            taxIncluded: product.taxIncluded,
            variantKey,
        });

        if (!vendorMap[vendorId]) {
            vendorMap[vendorId] = {
                vendorId: product.vendorId,
                vendorName: product.vendorName || '',
                items: [],
            };
        }
        vendorMap[vendorId].items.push({ ...item, price, quantity });
    }

    // --- Coupon validation ---
    let appliedCoupon = null;
    let couponDiscount = 0;
    if (couponCode) {
        // Same rules as the cart preview (/coupons/validate): start/expiry dates, usage limit,
        // minimum order value and the maxDiscount cap on percentage coupons.
        const rawSubtotal = enrichedItems.reduce((s, i) => s + i.price * i.quantity, 0);
        const { coupon, discount } = await validateCoupon(String(couponCode), rawSubtotal);
        appliedCoupon = coupon;
        couponDiscount = discount;
    }

    // --- Shipping calculation ---
    const vendorDocs = await Vendor.find({ _id: { $in: Object.keys(vendorMap) } })
        .select('_id commissionRate storeName name')
        .lean();
    const vendorDocsMap = Object.fromEntries(vendorDocs.map(v => [String(v._id), v]));

    const vendorShippingInput = Object.values(vendorMap).map(v => {
        const doc = vendorDocsMap[String(v.vendorId)] || {};
        const vSubtotal = v.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        return {
            vendorId: v.vendorId,
            subtotal: vSubtotal,
        };
    });

    const shippingResult = await calculateVendorShippingForGroups({
        vendorGroups: vendorShippingInput,
        shippingAddress,
        shippingOption: shippingOption || 'standard',
        couponType: appliedCoupon?.type || null,
    });
    const shipping = shippingResult?.totalShipping || 0;
    const shippingByVendor = shippingResult?.shippingByVendor || {};
    // Canonical rule: vendor's own rate, else Admin default (fails clearly if unset); snapshotted on the order.
    const vendorCommissions = await resolveVendorCommissionRates(vendorDocs);

    // --- Calculate financials server-side ---
    const financials = calculateOrderFinancials({
        items: enrichedItems,
        couponDiscount,
        shipping,
        vendorCommissions,
        vendorShippings: shippingByVendor,
    });

    // Order.subtotal is the pre-discount item total (as in placeOrder); `discount` is stored separately,
    // so subtotal - discount + tax + shipping reads correctly on invoices and order pages.
    const { finalTotal: rawTotal, originalSubtotal: subtotal, tax } = financials;
    const total = normalizedPaymentMethod === 'cod' ? Math.round(rawTotal) : rawTotal;

    // Create populated vendorItems array with full financials, commissions, and item details (names, images)
    const vendorItems = financials.vendorCalculations.map(vc => {
        const vendorIdStr = String(vc.vendorId);
        const doc = vendorDocsMap[vendorIdStr] || {};
        const groupItems = financials.items
            .filter(item => String(item.vendorId) === vendorIdStr)
            .map(item => ({
                productId: item.productId,
                vendorId: item.vendorId,
                name: item.name,
                image: item.image,
                price: item.price,
                quantity: item.quantity,
                variant: item.variantKey ? { variantKey: item.variantKey } : {},
                variantKey: item.variantKey || undefined,
                // --- FINANCIAL SNAPSHOT FIELDS ---
                taxRate: item.taxRate,
                taxIncluded: item.taxIncluded,
                lineSubtotal: item.lineSubtotal,
                couponDiscount: item.couponDiscount,
                discountedSubtotal: item.discountedSubtotal,
                baseAmount: item.baseAmount,
                taxAmount: item.taxAmount,
                shippingCharge: item.shippingCharge,
                commissionRate: item.commissionRate,
                commissionAmount: item.commissionAmount,
                vendorEarnings: item.vendorEarnings,
                platformCommission: item.platformCommission,
                finalLineTotal: item.finalLineTotal,
            }));

        return {
            vendorId: vc.vendorId,
            vendorName: doc.storeName || doc.name || '',
            items: groupItems,
            subtotal: vc.subtotal,
            shipping: Number(shippingByVendor[vendorIdStr] || 0),
            tax: vc.vendorTax,
            discount: vc.discountShare,
            status: 'pending',
            commissionRate: vc.commissionRate,
            commissionAmount: vc.commission,
            vendorEarnings: vc.vendorEarnings,
            isOnHoldBalanceAdded: false,
        };
    });

    // ─── Resolve Valid Shipping Quotes ─────────────────────────────────────────
    let validQuotes = {};
    if (shippingQuotes && typeof shippingQuotes === 'object') {
        const quoteIds = Object.values(shippingQuotes).map(q => q?.quoteId).filter(Boolean);
        if (quoteIds.length > 0) {
            const dbQuotes = await ShippingQuote.find({ quoteId: { $in: quoteIds } }).lean();
            validQuotes = Object.fromEntries(dbQuotes.map(q => [q.quoteId, q]));
        }
    }

    // Authoritative fulfillment choice. Client quotes may affect price, never routing.
    const routingDecisions = await buildOrderRoutingDecisions({
        vendorItems,
        shippingAddress,
        paymentMethod: normalizedPaymentMethod,
        isWholesale: isWholesaleOrder,
    });

    // ─── COD: Create order immediately with stock deduction ───────────────────
    if (normalizedPaymentMethod === 'cod') {
        const session = await mongoose.startSession();
        let order;
        let createdShipments = [];
        try {
            await session.withTransaction(async () => {
                const orderId = generateOrderId();
                const [createdOrder] = await Order.create([{
                    orderId,
                    userId,
                    ...(isWholesaleOrder ? { orderType: 'b2b' } : {}),
                    items: financials.items.map(item => ({
                        productId: item.productId,
                        vendorId: item.vendorId,
                        name: item.name,
                        image: item.image,
                        price: item.price,
                        quantity: item.quantity,
                        variant: item.variantKey ? { variantKey: item.variantKey } : {},
                        variantKey: item.variantKey || undefined,
                        // --- FINANCIAL SNAPSHOT FIELDS ---
                        taxRate: item.taxRate,
                        taxIncluded: item.taxIncluded,
                        lineSubtotal: item.lineSubtotal,
                        couponDiscount: item.couponDiscount,
                        discountedSubtotal: item.discountedSubtotal,
                        baseAmount: item.baseAmount,
                        taxAmount: item.taxAmount,
                        shippingCharge: item.shippingCharge,
                        commissionRate: item.commissionRate,
                        commissionAmount: item.commissionAmount,
                        vendorEarnings: item.vendorEarnings,
                        platformCommission: item.platformCommission,
                        finalLineTotal: item.finalLineTotal,
                    })),
                    vendorItems,
                    shippingAddress,
                    paymentMethod: 'cod',

                    // Awaiting vendor acceptance — the same status the vendor dashboard derives from its pending items.
                    status: 'pending',
                    paymentStatus: 'pending',
                    subtotal,
                    shipping,
                    tax,
                    discount: couponDiscount,
                    total,
                    couponCode: couponCode?.toUpperCase(),
                    couponDiscount,
                    discountedSubtotal: financials.discountedSubtotal,
                    taxableAmount: financials.taxableAmount,
                    commissionAmount: financials.commissionAmount,
                    vendorEarnings: financials.vendorEarnings,
                    escrowAmount: financials.escrowAmount,
                    settlementAmount: financials.settlementAmount,
                    platformRevenue: financials.platformRevenue,
                    trackingNumber: generateTrackingNumber(),
                    estimatedDelivery: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
                    invoiceNumber: `INV-${orderId}`,
                    invoiceDate: new Date(),
                    // COD orders now carry the checkout idempotency key too (the unique index on scope+key
                    // rejects a concurrent duplicate; the pre-check above returns the existing order on retry).
                    idempotencyKey: idempotencyKey || undefined,
                    idempotencyScope: idempotencyKey ? `user:${String(userId)}` : undefined,
                }], { session });
                order = createdOrder;

                // Deduct stock (product total and, for variant lines, the variant's own stock bucket)
                for (const item of enrichedItems) {
                    const productSnapshot = item.variantKey
                        ? await Product.findById(item.productId).select('variants.stockMap').session(session).lean()
                        : null;
                    const matchedStockKey = item.variantKey ? findMatchingVariantKey(productSnapshot?.variants?.stockMap, item.variantKey) : null;
                    const variantPath = matchedStockKey ? `variants.stockMap.${encodeVariantKey(matchedStockKey)}` : null;
                    const stockFilter = { _id: item.productId, stock: { $ne: 'out_of_stock' }, stockQuantity: { $gte: Number(item.quantity) } };
                    const stockInc = { stockQuantity: -Number(item.quantity) };
                    if (variantPath) {
                        stockFilter[variantPath] = { $gte: Number(item.quantity) };
                        stockInc[variantPath] = -Number(item.quantity);
                    }
                    const updatedProduct = await Product.findOneAndUpdate(
                        stockFilter,
                        { $inc: stockInc },
                        { new: true, session }
                    );
                    if (!updatedProduct) throw new ApiError(409, `Insufficient stock for ${item.name}.`);

                    const nextStock = updatedProduct.stockQuantity <= 0 ? 'out_of_stock'
                        : updatedProduct.stockQuantity <= updatedProduct.lowStockThreshold ? 'low_stock' : 'in_stock';
                    await Product.updateOne({ _id: updatedProduct._id }, { $set: { stock: nextStock } }, { session });
                }

                // Create commissions — all required Commission schema fields populated
                const commissionDocs = financials.vendorCalculations.map(vc => ({
                    orderId:                   order._id,
                    vendorId:                  vc.vendorId,
                    vendorName:                vendorMap[String(vc.vendorId)]?.vendorName || '',
                    subtotal:                  vc.subtotal,
                    vendorSubtotal:            vc.subtotal,
                    discountShare:             vc.discountShare,
                    vendorCouponDiscount:      vc.discountShare,
                    effectiveSubtotal:         vc.effectiveSubtotal,
                    vendorDiscountedSubtotal:  vc.effectiveSubtotal,
                    commissionRate:            vc.commissionRate,
                    commission:                vc.commission,
                    commissionAmount:          vc.commission,
                    vendorEarnings:            vc.vendorEarnings,
                    vendorNetEarnings:         vc.vendorEarnings,
                    escrowAmount:              vc.vendorEarnings,
                    walletCredit:              0,
                    escrowStatus:              'held',
                    settlementStatus:          'pending',
                    vendorTax:                 vc.vendorTax || 0,
                    vendorTotalPaidByCustomer: vc.vendorTotalPaidByCustomer || vc.subtotal,
                    ...(appliedCoupon ? {
                        couponId:    appliedCoupon._id,
                        couponCode:  appliedCoupon.code,
                        couponType:  appliedCoupon.type,
                        couponValue: appliedCoupon.value,
                    } : {}),
                }));
                await Commission.insertMany(commissionDocs, { session });

                // Coupon usage
                if (appliedCoupon) {
                    await consumeCouponUsage(appliedCoupon, session);
                }

                // Phase 5.1 Parity: Create Shipments for COD order
                const shipmentDocs = vendorItems.map((vGroup) => {
                    const routing = routingDecisions[String(vGroup.vendorId)];
                    let providerId = routing.providerId;
                    let quoteId = null;
                    let estCost = 0;
                    let notes = 'Shipment created at order placement (COD fallback)';

                    const vQuoteReq = shippingQuotes ? shippingQuotes[String(vGroup.vendorId)] : null;
                    if (vQuoteReq && vQuoteReq.quoteId && validQuotes[vQuoteReq.quoteId]) {
                        const dbQuote = validQuotes[vQuoteReq.quoteId];
                        quoteId = dbQuote._id;
                        estCost = routing.deliveryMethod === 'SHIPROCKET' && dbQuote.providerId === 'shiprocket'
                            ? (dbQuote.estimatedCost || 0)
                            : 0;
                        notes = `Shipment created with provider ${providerId} via quote ${dbQuote.quoteId}`;
                    }

                    return {
                        orderId:                order._id,
                        vendorId:               vGroup.vendorId,
                        vendorName:             vGroup.vendorName,
                        providerId:             providerId,
                        deliveryMethod:         routing.deliveryMethod || undefined, // null → vendor chooses after accepting
                        allowedDeliveryMethods: routing.allowedDeliveryMethods,
                        deliveryRoutingReason:  routing.deliveryRoutingReason,
                        deliveryRoutingDetails: routing.deliveryRoutingDetails,
                        providerPickupLocationId: routing.providerPickupLocationId,
                        providerMetadata:       routing.providerMetadata,
                        shippingQuoteId:        quoteId,
                        selectedBy:             'AUTO',
                        providerLocked:         true,
                        customerShippingCharge: Number(vGroup.shipping) || 0,
                        estimatedDeliveryCost:  estCost,
                        status:                 'pending',
                        statusHistory: [{
                            status:    'pending',
                            updatedAt: new Date(),
                            updatedBy: 'system',
                            notes:     notes,
                        }],
                        packageWeight: routing.packageWeight,
                        packageDimensions: routing.packageDimensions,
                        externalCreationStatus: routing.deliveryMethod === 'INTERNAL' ? 'not_applicable' : 'not_started',
                        escrowStatus: 'held',
                        deliveryAssignmentStatus: 'pending',
                        rejectedDeliveryBoys: [],
                    };
                });

                for (const doc of shipmentDocs) {
                    const shipment = new Shipment(doc);
                    await shipment.save({ session });
                    createdShipments.push(shipment);
                }

                // Mark quotes as used
                if (validQuotes && Object.keys(validQuotes).length > 0) {
                    const quoteIdsToUpdate = Object.values(validQuotes).map(q => q._id);
                    await ShippingQuote.updateMany(
                        { _id: { $in: quoteIdsToUpdate } },
                        { $set: { usedForOrder: true, orderId: order._id } },
                        { session }
                    );
                }
            });
        } catch (err) {
            // Two identical submissions raced past the pre-check: return the order the first one created.
            if (idempotencyKey && err?.code === 11000 && err?.keyPattern?.idempotencyKey) {
                const existing = await Order.findOne({ idempotencyScope: `user:${String(userId)}`, idempotencyKey }).lean();
                if (existing) {
                    return res.status(200).json(new ApiResponse(200, {
                        orderId: existing.orderId,
                        total: existing.total,
                        paymentMethod: existing.paymentMethod,
                        paymentStatus: existing.paymentStatus || 'pending',
                        razorpayOrderId: null,
                        idempotent: true,
                    }, 'Returning existing COD order.'));
                }
            }
            throw err;
        } finally {
            await session.endSession();
        }

        // Emit SHIPMENT_CREATED events
        for (const shipment of createdShipments) {
            LogisticsEventBus.emitEvent(LOGISTICS_EVENTS.SHIPMENT_CREATED, {
                shipmentId:  String(shipment._id),
                shipmentNumber: shipment.shipmentNumber,
                orderId:     String(order._id),
                orderNumber: order.orderId,
                vendorId:    String(shipment.vendorId),
                providerId:  shipment.providerId,
                selectedBy:  shipment.selectedBy,
            });
        }

        // Trigger notifications and email asynchronously (non-blocking)
        if (order && order.orderId) {
            const notificationTasks = [];
            
            const orderHumanId = String(order.orderId || order._id);
            // 1. User Notification
            if (userId) {
                const itemsText = buildOrderItemsSummary(order.items);
                notificationTasks.push(
                    createNotification({
                        recipientId: userId,
                        recipientType: 'user',
                        title: 'Order Placed!',
                        message: `Your order ${orderHumanId} has been placed successfully.${itemsText}`,
                        type: 'order',
                        eventKey: `order:${orderHumanId}:placed:customer`,
                        data: {
                            orderId: orderHumanId,
                            orderMongoId: String(order._id),
                            deepLink: `/orders/${orderHumanId}`,
                            link: `/orders/${orderHumanId}`,
                        },
                    }).catch(err => console.error('[COD User Notification] Failed:', err.message))
                );
            }

            // 2. Admin Notifications
            Admin.find({ isActive: true }).select('_id').lean()
                .then(admins => {
                    admins.forEach(adm => {
                        createNotification({
                            recipientId: adm._id,
                            recipientType: 'admin',
                            title: 'New Order Placed',
                            message: `A new COD order #${orderHumanId} of total ₹${order.total} has been placed.`,
                            type: 'order',
                            eventKey: `order:${orderHumanId}:placed:admin:${adm._id}`,
                            data: {
                                orderId: orderHumanId,
                                orderMongoId: String(order._id),
                                deepLink: `/admin/orders/${orderHumanId}`,
                                link: `/admin/orders/${orderHumanId}`,
                            },
                        }).catch(err => console.error('[COD Admin Notification] Failed:', err.message));
                    });
                })
                .catch(err => console.error('[COD Admin Fetch] Failed:', err.message));

            // 3. Vendor Notifications
            (order.vendorItems || []).forEach(vGroup => {
                const vendorId = vGroup.vendorId?._id || vGroup.vendorId;
                if (!vendorId) return;
                const vItemsText = buildVendorItemsSummary(vGroup.items);
                notificationTasks.push(
                    createNotification({
                        recipientId: vendorId,
                        recipientType: 'vendor',
                        title: 'New Order Received!',
                        message: `You have received a new order ${orderHumanId} totalling ₹${vGroup.subtotal}.${vItemsText}`,
                        type: 'order',
                        eventKey: `order:${orderHumanId}:vendor_received:${vendorId}`,
                        data: {
                            orderId: orderHumanId,
                            orderMongoId: String(order._id),
                            deepLink: `/vendor/orders/${orderHumanId}`,
                            link: `/vendor/orders/${orderHumanId}`,
                        },
                    }).catch(err => console.error('[COD Vendor Notification] Failed:', err.message))
                );
            });

            // 4. Send Confirmation Email & Socket updates
            const emailAddress = order?.shippingAddress?.email || (req.user?.email);
            if (emailAddress) {
                sendOrderConfirmationEmail(order, emailAddress).catch((err) =>
                    console.error(`[COD Order Email] Failed to send for ${order.orderId}:`, err.message)
                );
            }
            notifyOrderUpdate(order);
        }

        return res.status(201).json(new ApiResponse(201, {
            orderId: order.orderId,
            total,
            paymentMethod: 'cod',
            paymentStatus: order.paymentStatus || 'pending',
            razorpayOrderId: null,
        }, 'COD order placed successfully.'));
    }

    // ─── Online Payment: Create payment_pending order + Razorpay order ─────────
    const session = await mongoose.startSession();
    let order, payment, attempt;
    let rzpOrder = null;
    let walletAmountUsed = 0;
    let createdShipments = [];
    try {
        await session.withTransaction(async () => {
            const orderId = generateOrderId();

            // 1. Calculate wallet deductions if paymentMethod is wallet or useWallet is true
            if (normalizedPaymentMethod === 'wallet' || req.body.useWallet) {
                if (!userId) {
                    throw new ApiError(401, 'Authentication required for wallet payment.');
                }
                const wallet = await getWallet(userId);
                if (wallet.status === 'locked') {
                    throw new ApiError(403, 'Your wallet is temporarily locked. Wallet balance cannot be used for purchases at the moment.');
                }
                if (normalizedPaymentMethod === 'wallet') {
                    if (wallet.balance < total) {
                        const shortfall = (total - wallet.balance).toFixed(2);
                        throw new ApiError(400, `Insufficient wallet balance. Short by ₹${shortfall}. Please add funds or choose another available payment method.`);
                    }
                    walletAmountUsed = total;
                } else {
                    walletAmountUsed = Math.min(wallet.balance, total);
                }
            }

            const remainingTotal = Number((total - walletAmountUsed).toFixed(2));
            const isFullyPaidByWallet = walletAmountUsed === total;

            const [createdOrder] = await Order.create([{
                orderId,
                userId,
                ...(isWholesaleOrder ? { orderType: 'b2b' } : {}),
                items: financials.items.map(item => ({
                    productId: item.productId,
                    vendorId: item.vendorId,
                    name: item.name,
                    image: item.image,
                    price: item.price,
                    quantity: item.quantity,
                    variant: item.variantKey ? { variantKey: item.variantKey } : {},
                    variantKey: item.variantKey || undefined,
                    // --- FINANCIAL SNAPSHOT FIELDS ---
                    taxRate: item.taxRate,
                    taxIncluded: item.taxIncluded,
                    lineSubtotal: item.lineSubtotal,
                    couponDiscount: item.couponDiscount,
                    discountedSubtotal: item.discountedSubtotal,
                    baseAmount: item.baseAmount,
                    taxAmount: item.taxAmount,
                    shippingCharge: item.shippingCharge,
                    commissionRate: item.commissionRate,
                    commissionAmount: item.commissionAmount,
                    vendorEarnings: item.vendorEarnings,
                    platformCommission: item.platformCommission,
                    finalLineTotal: item.finalLineTotal,
                })),
                vendorItems,

                shippingAddress,
                paymentMethod: isFullyPaidByWallet ? 'wallet' : normalizedPaymentMethod,
                status: isFullyPaidByWallet ? 'pending' : 'payment_pending', // paid orders wait for vendor acceptance like COD  // No stock deducted yet unless fully paid
                paymentStatus: isFullyPaidByWallet ? 'paid' : 'pending',
                subtotal,
                shipping,
                tax,
                discount: couponDiscount,
                total,
                walletAmountUsed,
                couponCode: couponCode?.toUpperCase(),
                couponDiscount,
                discountedSubtotal: financials.discountedSubtotal,
                taxableAmount: financials.taxableAmount,
                commissionAmount: financials.commissionAmount,
                vendorEarnings: financials.vendorEarnings,
                escrowAmount: financials.escrowAmount,
                settlementAmount: financials.settlementAmount,
                platformRevenue: financials.platformRevenue,
                trackingNumber: generateTrackingNumber(),
                estimatedDelivery: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
                invoiceNumber: `INV-${orderId}`,
                invoiceDate: new Date(),
                idempotencyKey: idempotencyKey || undefined,
                idempotencyScope: idempotencyKey ? `user:${String(userId)}` : undefined,
                // Store coupon info for use at webhook time
                couponId: appliedCoupon?._id,
            }], { session });
            order = createdOrder;

            // 2. Debit wallet if needed
            if (walletAmountUsed > 0) {
                await debitWallet(userId, walletAmountUsed, 'wallet_payment', {
                    orderId: order._id,
                    reference: `ORDER_PAYMENT_${order.orderId}`,
                    description: `Paid ₹${walletAmountUsed} via wallet for order #${order.orderId}`
                }, session);
            }

            if (isFullyPaidByWallet) {
                // Fully paid by wallet - complete order setups (stock, commissions, coupon count)
                for (const item of enrichedItems) {
                    const productSnapshot = await Product.findById(item.productId).session(session);
                    const matchedStockKey = item.variantKey ? findMatchingVariantKey(productSnapshot?.variants?.stockMap, item.variantKey) : null;
                    const safeVariantKey = matchedStockKey ? encodeVariantKey(matchedStockKey) : null;
                    const variantPath = safeVariantKey ? `variants.stockMap.${safeVariantKey}` : null;

                    const baseFilter = {
                        _id: item.productId,
                        stock: { $ne: 'out_of_stock' },
                        stockQuantity: { $gte: Number(item.quantity) }
                    };
                    if (variantPath) {
                        baseFilter[variantPath] = { $gte: Number(item.quantity) };
                    }

                    const updatePayload = { $inc: { stockQuantity: -Number(item.quantity) } };
                    if (variantPath) {
                        updatePayload.$inc[variantPath] = -Number(item.quantity);
                    }

                    const updatedProduct = await Product.findOneAndUpdate(
                        baseFilter,
                        updatePayload,
                        { new: true, session }
                    );
                    if (!updatedProduct) throw new ApiError(409, `Insufficient stock for ${item.name}.`);

                    const nextStock = updatedProduct.stockQuantity <= 0 ? 'out_of_stock'
                        : updatedProduct.stockQuantity <= updatedProduct.lowStockThreshold ? 'low_stock' : 'in_stock';
                    await Product.updateOne({ _id: updatedProduct._id }, { $set: { stock: nextStock } }, { session });
                }

                // Commissions
                const commissionDocs = financials.vendorCalculations.map(vc => ({
                    orderId:                   order._id,
                    vendorId:                  vc.vendorId,
                    vendorName:                vendorMap[String(vc.vendorId)]?.vendorName || '',
                    subtotal:                  vc.subtotal,
                    vendorSubtotal:            vc.subtotal,
                    discountShare:             vc.discountShare,
                    vendorCouponDiscount:      vc.discountShare,
                    effectiveSubtotal:         vc.effectiveSubtotal,
                    vendorDiscountedSubtotal:  vc.effectiveSubtotal,
                    commissionRate:            vc.commissionRate,
                    commission:                vc.commission,
                    commissionAmount:          vc.commission,
                    vendorEarnings:            vc.vendorEarnings,
                    vendorNetEarnings:         vc.vendorEarnings,
                    escrowAmount:              vc.vendorEarnings,
                    walletCredit:              0,
                    escrowStatus:              'held',
                    settlementStatus:          'pending',
                    vendorTax:                 vc.vendorTax || 0,
                    vendorTotalPaidByCustomer: vc.vendorTotalPaidByCustomer || vc.subtotal,
                    ...(appliedCoupon ? {
                        couponId:    appliedCoupon._id,
                        couponCode:  appliedCoupon.code,
                        couponType:  appliedCoupon.type,
                        couponValue: appliedCoupon.value,
                    } : {}),
                }));
                await Commission.insertMany(commissionDocs, { session });

                if (appliedCoupon) {
                    await consumeCouponUsage(appliedCoupon, session);
                }

                // Create Payment record
                await Payment.create([{
                    orderId: order._id,
                    userId,
                    amount: total,
                    status: 'paid',
                    method: 'wallet',
                }], { session });

            } else {
                // Partially paid by wallet - we need to charge remaining via Razorpay
                const [createdPayment] = await Payment.create([{
                    orderId: order._id,
                    userId,
                    amount: remainingTotal,
                    status: 'pending',
                }], { session });
                payment = createdPayment;

                // Create Razorpay order INSIDE DB transaction (external API call)
                try {
                    rzpOrder = await createRazorpayOrder(remainingTotal, 'INR', order.orderId, { userId: String(userId) });
                } catch (err) {
                    console.error('[RAZORPAY_INITIALIZE_ERROR] Failed to create order:', err);
                    throw new ApiError(502, 'Payment gateway error. Please try again.');
                }

                // Create PaymentAttempt
                attempt = (await PaymentAttempt.create([{
                    orderId: order._id,
                    paymentId: payment._id,
                    razorpayOrderId: rzpOrder.id,
                    purpose: 'ORDER_PAYMENT',
                    status: 'created',
                    attemptNumber: 1,
                }], { session }))[0];
            }

            // Phase 5.1 Parity: Create Shipments for prepaid order
            const shipmentDocs = vendorItems.map((vGroup) => {
                const routing = routingDecisions[String(vGroup.vendorId)];
                let providerId = routing.providerId;
                let quoteId = null;
                let estCost = 0;
                let notes = 'Shipment created at order placement (Prepaid fallback)';

                const vQuoteReq = shippingQuotes ? shippingQuotes[String(vGroup.vendorId)] : null;
                if (vQuoteReq && vQuoteReq.quoteId && validQuotes[vQuoteReq.quoteId]) {
                    const dbQuote = validQuotes[vQuoteReq.quoteId];
                    quoteId = dbQuote._id;
                    estCost = routing.deliveryMethod === 'SHIPROCKET' && dbQuote.providerId === 'shiprocket'
                        ? (dbQuote.estimatedCost || 0)
                        : 0;
                    notes = `Shipment created with provider ${providerId} via quote ${dbQuote.quoteId}`;
                }

                return {
                    orderId:                order._id,
                    vendorId:               vGroup.vendorId,
                    vendorName:             vGroup.vendorName,
                    providerId:             providerId,
                    deliveryMethod:         routing.deliveryMethod || undefined, // null → vendor chooses after accepting
                    allowedDeliveryMethods: routing.allowedDeliveryMethods,
                    deliveryRoutingReason:  routing.deliveryRoutingReason,
                    deliveryRoutingDetails: routing.deliveryRoutingDetails,
                    providerPickupLocationId: routing.providerPickupLocationId,
                    providerMetadata:       routing.providerMetadata,
                    shippingQuoteId:        quoteId,
                    selectedBy:             'AUTO',
                    providerLocked:         true,
                    customerShippingCharge: Number(vGroup.shipping) || 0,
                    estimatedDeliveryCost:  estCost,
                    status:                 'pending',
                    statusHistory: [{
                        status:    'pending',
                        updatedAt: new Date(),
                        updatedBy: 'system',
                        notes:     notes,
                    }],
                    packageWeight: routing.packageWeight,
                    packageDimensions: routing.packageDimensions,
                    externalCreationStatus: routing.deliveryMethod === 'INTERNAL' ? 'not_applicable' : 'not_started',
                    escrowStatus: 'held',
                    deliveryAssignmentStatus: 'pending',
                    rejectedDeliveryBoys: [],
                };
            });

            for (const doc of shipmentDocs) {
                const shipment = new Shipment(doc);
                await shipment.save({ session });
                createdShipments.push(shipment);
            }

            // Mark quotes as used
            if (validQuotes && Object.keys(validQuotes).length > 0) {
                const quoteIdsToUpdate = Object.values(validQuotes).map(q => q._id);
                await ShippingQuote.updateMany(
                    { _id: { $in: quoteIdsToUpdate } },
                    { $set: { usedForOrder: true, orderId: order._id } },
                    { session }
                );
            }
        });
    } finally {
        await session.endSession();
    }

    if (walletAmountUsed === total) {
        // Emit SHIPMENT_CREATED events if fully paid by wallet
        for (const shipment of createdShipments) {
            LogisticsEventBus.emitEvent(LOGISTICS_EVENTS.SHIPMENT_CREATED, {
                shipmentId:  String(shipment._id),
                shipmentNumber: shipment.shipmentNumber,
                orderId:     String(order._id),
                orderNumber: order.orderId,
                vendorId:    String(shipment.vendorId),
                providerId:  shipment.providerId,
                selectedBy:  shipment.selectedBy,
            });
        }

        const orderHumanId = String(order.orderId || order._id);
        // Fully paid by wallet - trigger async side effects
        createNotification({
            recipientId: userId,
            recipientType: 'user',
            title: 'Order Confirmed',
            message: `Your order #${orderHumanId} has been confirmed successfully!`,
            type: 'order',
            eventKey: `order:${orderHumanId}:placed:customer`,
            data: {
                orderId: orderHumanId,
                orderMongoId: String(order._id),
                deepLink: `/orders/${orderHumanId}`,
                link: `/orders/${orderHumanId}`,
            },
        }).catch(console.error);

        // Notify each admin individually
        Admin.find({ isActive: true }).select('_id').lean()
            .then(admins => {
                admins.forEach(adm => {
                    createNotification({
                        recipientId: adm._id,
                        recipientType: 'admin',
                        title: 'New Order Placed',
                        message: `A new order #${orderHumanId} of total ₹${order.total} has been placed.`,
                        type: 'order',
                        eventKey: `order:${orderHumanId}:placed:admin:${adm._id}`,
                        data: {
                            orderId: orderHumanId,
                            orderMongoId: String(order._id),
                            deepLink: `/admin/orders/${orderHumanId}`,
                            link: `/admin/orders/${orderHumanId}`,
                        },
                    }).catch(err => console.error('[Wallet Admin Notification] Failed:', err.message));
                });
            })
            .catch(err => console.error('[Wallet Admin Fetch] Failed:', err.message));

        // Notify vendors
        (order.vendorItems || []).forEach(vGroup => {
            const vendorId = vGroup.vendorId?._id || vGroup.vendorId;
            if (!vendorId) return;
            const vItemsText = buildVendorItemsSummary(vGroup.items);
            createNotification({
                recipientId: vendorId,
                recipientType: 'vendor',
                title: 'New Order Received!',
                message: `You have received a new order ${orderHumanId} totalling ₹${vGroup.subtotal}.${vItemsText}`,
                type: 'order',
                eventKey: `order:${orderHumanId}:vendor_received:${vendorId}`,
                data: {
                    orderId: orderHumanId,
                    orderMongoId: String(order._id),
                    deepLink: `/vendor/orders/${orderHumanId}`,
                    link: `/vendor/orders/${orderHumanId}`,
                },
            }).catch(err => console.error('[Wallet Vendor Notification] Failed:', err.message));
        });

        try {
            await sendOrderConfirmationEmail(order, order.shippingAddress?.email || req.user?.email);
        } catch (e) {
            console.error('[Email Error]', e.message);
        }

        order.status = 'pending';
        order.paymentStatus = 'paid';
        notifyOrderUpdate(order).catch(console.error);

        const updatedWallet = await getWallet(userId);

        return res.status(201).json(new ApiResponse(201, {
            orderId: order.orderId,
            total,
            paymentMethod: 'wallet',
            paymentStatus: 'paid',
            walletBalance: updatedWallet.balance,
        }, 'Order placed successfully using wallet balance.'));
    }

    return res.status(201).json(new ApiResponse(201, {
        orderId: order.orderId,
        razorpayOrderId: rzpOrder.id,
        amount: Number((total - walletAmountUsed).toFixed(2)),
        currency: 'INR',
        key: getRazorpayKeyId(),
    }, 'Payment initialized. Complete payment to confirm order.'));
});

// ─── POST /api/user/payment/retry/:orderId ─────────────────────────────────
// Creates a new PaymentAttempt for a payment_pending order (retry after failed UPI etc.)
export const retryPayment = asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    const userId = req.user?.id;

    const order = await Order.findOne({ orderId, userId }).lean();
    if (!order) throw new ApiError(404, 'Order not found.');

    // Central Payment Gate: retries need online payments on, and the order's own method still enabled.
    if (!(await isOnlinePaymentActive())) {
        throw new ApiError(400, 'Online payments are currently unavailable, so this payment cannot be retried right now.');
    }
    const isRetryMethodActive = await isPaymentMethodEnabled(order.paymentMethod);
    if (!isRetryMethodActive) {
        throw new ApiError(400, `The payment method ${describePaymentMethod(order.paymentMethod)} used for this order is currently unavailable.`);
    }
    if (order.status !== 'payment_pending') {
        throw new ApiError(400, 'This order is not awaiting payment. Cannot retry.');
    }

    // 4.10 — Max 5 payment attempts per order guard
    const attemptCount = await PaymentAttempt.countDocuments({ orderId: order._id });
    if (attemptCount >= 5) {
        throw new ApiError(429, 'Maximum payment attempts (5) reached for this order. Please cancel and create a new order.');
    }

    const payment = await Payment.findOne({ orderId: order._id }).lean();
    if (!payment) throw new ApiError(404, 'Payment record not found.');

    // Get current max attempt number
    const lastAttempt = await PaymentAttempt.findOne({ orderId: order._id })
        .sort({ attemptNumber: -1 })
        .lean();
    const attemptNumber = (lastAttempt?.attemptNumber || 0) + 1;

    // Only the gateway portion is still due: any wallet share was debited when the order was created.
    const amountDue = Number((Number(order.total || 0) - Number(order.walletAmountUsed || 0)).toFixed(2));
    if (amountDue <= 0) {
        throw new ApiError(400, 'Nothing is left to pay on this order.');
    }

    // Create new Razorpay order
    let rzpOrder;
    try {
        rzpOrder = await createRazorpayOrder(amountDue, 'INR', `${order.orderId}-retry-${attemptNumber}`);
    } catch (err) {
        console.error('[RAZORPAY_RETRY_ERROR] Failed to create retry order:', err);
        throw new ApiError(502, 'Payment gateway error. Please try again.');
    }

    const attempt = await PaymentAttempt.create({
        orderId: order._id,
        paymentId: payment._id,
        razorpayOrderId: rzpOrder.id,
        purpose: 'ORDER_PAYMENT',
        status: 'created',
        attemptNumber,
    });

    return res.status(200).json(new ApiResponse(200, {
        orderId: order.orderId,
        razorpayOrderId: rzpOrder.id,
        amount: amountDue,
        currency: 'INR',
        key: getRazorpayKeyId(),
        attemptNumber,
    }, 'New payment attempt created.'));
});

// ─── POST /api/user/payment/exchange-upgrade/:returnRequestId ──────────────
// Creates a PaymentAttempt for extra charge on price-upgrade exchange
export const exchangeUpgradePayment = asyncHandler(async (req, res) => {
    const { returnRequestId } = req.params;
    const userId = req.user?.id;

    const request = await ReturnRequest.findOne({ _id: returnRequestId, userId }).lean();
    if (!request) throw new ApiError(404, 'Return request not found.');
    if (request.requestType !== 'exchange') throw new ApiError(400, 'Not an exchange request.');

    // Central Payment Gate: the price difference can only be paid online.
    if (!(await isOnlinePaymentActive())) {
        throw new ApiError(400, 'Online payment is temporarily disabled. Exchange price-difference upgrades cannot be completed right now. Please contact customer support or request a standard return.');
    }

    const priceDelta = request.exchangeDetails?.priceDelta;
    const priceDeltaStatus = request.exchangeDetails?.priceDeltaStatus;
    if (!priceDelta || priceDelta <= 0) throw new ApiError(400, 'No upgrade payment required.');
    if (priceDeltaStatus !== 'pending') throw new ApiError(400, `Price delta already ${priceDeltaStatus}.`);
    if (['rejected', 'completed'].includes(request.status)) {
        throw new ApiError(400, `This exchange is ${request.status}; no payment can be taken for it.`);
    }

    // 4.9 — Idempotency: prevent duplicate exchange upgrade attempts
    const existingAttempt = await PaymentAttempt.findOne({
        relatedReturnId: request._id,
        purpose: 'EXCHANGE_UPGRADE',
        status: { $in: ['created', 'processing'] },
    }).lean();
    if (existingAttempt) {
        return res.status(200).json(new ApiResponse(200, {
            razorpayOrderId: existingAttempt.razorpayOrderId,
            amount: priceDelta,
            currency: 'INR',
            key: getRazorpayKeyId(),
            idempotent: true,
        }, 'Returning existing exchange upgrade payment.'));
    }

    const order = await Order.findById(request.orderId).lean();
    const payment = await Payment.findOne({ orderId: order._id }).lean();

    let rzpOrder;
    try {
        rzpOrder = await createRazorpayOrder(priceDelta, 'INR', `exchange-${request._id}`);
    } catch (err) {
        console.error('[RAZORPAY_EXCHANGE_UPGRADE_ERROR] Failed to create upgrade order:', err);
        throw new ApiError(502, 'Payment gateway error.');
    }

    const attempt = await PaymentAttempt.create({
        orderId: order._id,
        paymentId: payment?._id,
        razorpayOrderId: rzpOrder.id,
        purpose: 'EXCHANGE_UPGRADE',
        status: 'created',
        attemptNumber: (await PaymentAttempt.countDocuments({ relatedReturnId: request._id, purpose: 'EXCHANGE_UPGRADE' })) + 1,
        relatedReturnId: request._id,
        amount: priceDelta, // exactly the saved canonical difference; checked again on capture
    });

    await ReturnRequest.findByIdAndUpdate(request._id, {
        'exchangeDetails.exchangePaymentId': attempt._id,
    });

    return res.status(200).json(new ApiResponse(200, {
        razorpayOrderId: rzpOrder.id,
        amount: priceDelta,
        currency: 'INR',
        key: getRazorpayKeyId(),
    }, 'Exchange upgrade payment initialized.'));
});

// ─── POST /api/user/payment/verify ───────────────────────────────────────────
// Verifies Razorpay signatures from the frontend, then processes the payment.
export const verifyPayment = asyncHandler(async (req, res) => {
    const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    if (!orderId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
        throw new ApiError(400, 'Missing payment verification details.');
    }

    // Verify signature cryptographically
    const isValid = verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
    if (!isValid) {
        throw new ApiError(400, 'Invalid payment signature. Verification failed.');
    }

    // T3.2: Enforce order ownership — prevent any user from triggering payment processing on another user's order.
    const order = await Order.findOne({ orderId, userId: req.user.id }).lean();
    if (!order) throw new ApiError(404, 'Order not found.');

    // Process using the shared, concurrent-safe payment processor
    await processCapturedPayment({
        razorpayOrderId,
        razorpayPaymentId,
        method: order.paymentMethod || 'card',
        payload: { source: 'frontend_direct_verify', body: req.body }
    });

    const updatedOrder = await Order.findById(order._id)
        .select('orderId status paymentStatus total')
        .lean();

    // The order was cancelled while the customer was paying: the processor refunds the capture.
    // Report that instead of a success the checkout page would show as "Order placed".
    if (updatedOrder.status === 'cancelled') {
        throw new ApiError(409, 'This order was cancelled before your payment completed. The amount is being refunded to your original payment method.');
    }

    return res.status(200).json(
        new ApiResponse(200, {
            orderId: updatedOrder.orderId,
            status: updatedOrder.status,
            paymentStatus: updatedOrder.paymentStatus,
        }, 'Payment verified and order processed successfully.')
    );
});

