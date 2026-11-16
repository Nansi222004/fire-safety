import { splitGst } from './gst.service.js';

/**
 * Centralized financial calculator for order checkout and settlements.
 * Enforces:
 * - Coupon cap business rule (couponDiscount = min(couponDiscount, subtotal))
 * - Proportional coupon discount distribution across vendors first, then items
 * - Reuses item-specific tax rates on the discounted item subtotal
 * - Commission calculated on discounted subtotal (vendor-funded coupons)
 * - Vendor Earnings = effective subtotal - commission
 * - Escrow Amount = Vendor Earnings
 * - Settlement Amount = Vendor Earnings
 * - Platform Revenue = Commission
 * - Immediate two-decimal-place rounding
 * - Exact reconciliation across all vendor-wise splits
 */
export const calculateOrderFinancials = ({
    items, // array of { productId, price, quantity, taxRate, taxIncluded, vendorId }
    couponDiscount,
    shipping, // total shipping
    vendorCommissions, // object of { [vendorId]: commissionRate }
    vendorShippings = {} // object of { [vendorId]: shippingAmount }
}) => {
    const rawCouponDiscount = Number(couponDiscount || 0);
    const rawShipping = Number(shipping || 0);

    // 1. Sort items deterministically
    const sortedItems = [...items].sort((a, b) =>
        String(a.productId || a.id).localeCompare(String(b.productId || b.id))
    );

    // Calculate original subtotals
    let originalSubtotal = 0;
    const itemSubtotals = sortedItems.map(item => {
        const price = Number(item.price || 0);
        const quantity = Number(item.quantity || 1);
        const sub = parseFloat((price * quantity).toFixed(2));
        originalSubtotal = parseFloat((originalSubtotal + sub).toFixed(2));
        return { ...item, sub };
    });

    const actualCouponDiscount = parseFloat(Math.min(rawCouponDiscount, originalSubtotal).toFixed(2));
    const discountedSubtotal = parseFloat((originalSubtotal - actualCouponDiscount).toFixed(2));

    // 2. Group items by vendor to compute vendor subtotals
    const vendorMap = {};
    itemSubtotals.forEach(item => {
        const vid = String(item.vendorId);
        if (!vendorMap[vid]) {
            vendorMap[vid] = {
                vendorId: vid,
                subtotal: 0,
                items: []
            };
        }
        vendorMap[vid].subtotal = parseFloat((vendorMap[vid].subtotal + item.sub).toFixed(2));
        vendorMap[vid].items.push(item);
    });

    const sortedVendors = Object.values(vendorMap).sort((a, b) =>
        String(a.vendorId).localeCompare(String(b.vendorId))
    );

    // 3. Proportional Coupon Distribution across Vendors
    let distributedDiscountSum = 0;
    sortedVendors.forEach((v, index) => {
        let discountShare = 0;
        if (actualCouponDiscount > 0 && originalSubtotal > 0) {
            if (index === sortedVendors.length - 1) {
                discountShare = parseFloat((actualCouponDiscount - distributedDiscountSum).toFixed(2));
            } else {
                discountShare = parseFloat(((actualCouponDiscount * v.subtotal) / originalSubtotal).toFixed(2));
                distributedDiscountSum = parseFloat((distributedDiscountSum + discountShare).toFixed(2));
            }
        }
        v.discountShare = discountShare;
    });

    // 4. Proportional Coupon Distribution across items under each vendor, and tax calculation
    const itemsWithDiscount = [];
    let totalTax = 0;
    let totalCommission = 0;
    let totalVendorEarnings = 0;

    sortedVendors.forEach(v => {
        let itemDiscountSum = 0;
        let itemShippingSum = 0;
        let itemTaxSum = 0;
        let itemCommissionSum = 0;
        let itemVendorEarningsSum = 0;

        const commissionRate = vendorCommissions[v.vendorId];
        if (commissionRate === undefined || commissionRate === null) {
            throw new Error(`Commission rate not found for vendor ${v.vendorId}. Ensure vendorCommissions is fully populated.`);
        }

        const vendorShipping = Number(vendorShippings[v.vendorId] || 0);

        v.items.forEach((item, index) => {
            // A. Coupon Discount Share
            let itemDiscountShare = 0;
            if (v.discountShare > 0 && v.subtotal > 0) {
                if (index === v.items.length - 1) {
                    itemDiscountShare = parseFloat((v.discountShare - itemDiscountSum).toFixed(2));
                } else {
                    itemDiscountShare = parseFloat(((v.discountShare * item.sub) / v.subtotal).toFixed(2));
                    itemDiscountSum = parseFloat((itemDiscountSum + itemDiscountShare).toFixed(2));
                }
            }

            const discountedItemSubtotal = parseFloat((item.sub - itemDiscountShare).toFixed(2));
            const rate = Number(item.taxRate !== undefined ? item.taxRate : 18);

            // B. Tax Included / Excluded calculation
            let itemTax = 0;
            let commissionBase = 0;
            if (item.taxIncluded) {
                const base = parseFloat((discountedItemSubtotal / (1 + rate / 100)).toFixed(2));
                itemTax = parseFloat((discountedItemSubtotal - base).toFixed(2));
                commissionBase = base;
            } else {
                itemTax = parseFloat(((discountedItemSubtotal * rate) / 100).toFixed(2));
                commissionBase = discountedItemSubtotal;
            }

            // C. Shipping Charge allocation
            let itemShipping = 0;
            if (vendorShipping > 0 && v.subtotal > 0) {
                if (index === v.items.length - 1) {
                    itemShipping = parseFloat((vendorShipping - itemShippingSum).toFixed(2));
                } else {
                    itemShipping = parseFloat(((vendorShipping * item.sub) / v.subtotal).toFixed(2));
                    itemShippingSum = parseFloat((itemShippingSum + itemShipping).toFixed(2));
                }
            }

            // D. Item Commission & Vendor Earnings
            const itemCommission = parseFloat(((commissionBase * commissionRate) / 100).toFixed(2));
            const itemVendorEarnings = parseFloat((commissionBase - itemCommission + itemTax).toFixed(2));

            // E. Final Line Total Paid by Customer
            const totalTaxAmount = parseFloat((itemTax).toFixed(2));
            const finalLineTotal = parseFloat((discountedItemSubtotal + (item.taxIncluded ? 0 : itemTax) + itemShipping).toFixed(2));

            itemsWithDiscount.push({
                productId: item.productId,
                name: item.name,
                image: item.image || '',
                price: item.price,
                quantity: item.quantity,
                taxRate: rate,
                taxIncluded: !!item.taxIncluded,
                lineSubtotal: item.sub,
                couponDiscount: itemDiscountShare,
                discountedSubtotal: discountedItemSubtotal,
                baseAmount: commissionBase,
                taxAmount: totalTaxAmount,
                shippingCharge: itemShipping,
                commissionRate: commissionRate,
                commissionAmount: itemCommission,
                vendorEarnings: itemVendorEarnings,
                platformCommission: itemCommission,
                finalLineTotal: finalLineTotal,
                vendorId: item.vendorId,
                variantKey: item.variantKey || null,
            });

            totalTax = parseFloat((totalTax + totalTaxAmount).toFixed(2));
            totalCommission = parseFloat((totalCommission + itemCommission).toFixed(2));
            totalVendorEarnings = parseFloat((totalVendorEarnings + itemVendorEarnings).toFixed(2));

            itemTaxSum = parseFloat((itemTaxSum + totalTaxAmount).toFixed(2));
            itemCommissionSum = parseFloat((itemCommissionSum + itemCommission).toFixed(2));
            itemVendorEarningsSum = parseFloat((itemVendorEarningsSum + itemVendorEarnings).toFixed(2));
        });

        // Store aggregated sums on vendor object for vendor calculations section below
        v.vendorTax = itemTaxSum;
        v.commission = itemCommissionSum;
        v.vendorEarnings = itemVendorEarningsSum;
        v.vendorShipping = vendorShipping;
    });

    // 5. Vendor final calculations (commission, earnings, tax, total paid by customer)
    const vendorCalculations = sortedVendors.map(v => {
        const commissionRate = vendorCommissions[v.vendorId];
        const effectiveSubtotal = parseFloat(
            itemsWithDiscount
                .filter(item => String(item.vendorId) === String(v.vendorId))
                .reduce((sum, item) => sum + item.baseAmount, 0)
                .toFixed(2)
        );

        const vendorTotalPaidByCustomer = parseFloat(
            itemsWithDiscount
                .filter(item => String(item.vendorId) === String(v.vendorId))
                .reduce((sum, item) => sum + item.finalLineTotal, 0)
                .toFixed(2)
        );

        return {
            vendorId: v.vendorId,
            subtotal: v.subtotal,
            discountShare: v.discountShare,
            effectiveSubtotal,
            commissionRate,
            commission: v.commission,
            vendorEarnings: v.vendorEarnings,
            vendorTax: v.vendorTax,
            vendorTotalPaidByCustomer
        };
    });

    const tax = totalTax;
    const finalTotal = parseFloat(itemsWithDiscount.reduce((sum, item) => sum + item.finalLineTotal, 0).toFixed(2));
    // GST taxable value: for tax-inclusive items the tax is backed out of the discounted line amount.
    const taxableAmount = parseFloat(itemsWithDiscount.reduce((sum, item) => sum + item.baseAmount, 0).toFixed(2));

    return {
        originalSubtotal,
        couponDiscount: actualCouponDiscount,
        discountedSubtotal,
        taxableAmount,
        tax,
        finalTotal,
        commissionAmount: totalCommission,
        vendorEarnings: totalVendorEarnings,
        escrowAmount: totalVendorEarnings,
        settlementAmount: totalVendorEarnings,
        platformRevenue: totalCommission,
        vendorCalculations,
        items: itemsWithDiscount
    };
};

const round2 = (value) => parseFloat(Number(value || 0).toFixed(2));

/**
 * Amount the customer paid for one vendor package (order.vendorItems[n]).
 *
 * Items priced by calculateOrderFinancials carry `finalLineTotal`, which already accounts for
 * tax-inclusive pricing, the coupon share and the shipping share, so summing it is the amount
 * actually charged. The legacy `subtotal - discount + tax + shipping` formula counts GST twice for
 * tax-inclusive products and is kept only for old orders saved without item snapshots.
 */
export const getVendorGroupPayable = (group) => {
    if (!group) return 0;
    const items = Array.isArray(group.items) ? group.items : [];
    const hasSnapshots = items.length > 0
        && items.every((item) => item?.finalLineTotal !== undefined && item?.finalLineTotal !== null && Number.isFinite(Number(item.finalLineTotal)));
    if (hasSnapshots) {
        return round2(items.reduce((sum, item) => sum + Number(item.finalLineTotal), 0));
    }
    return round2(Math.max(
        0,
        Number(group.subtotal || 0) - Number(group.discount || 0) + Number(group.tax || 0) + Number(group.shipping || 0)
    ));
};

/**
 * Commission snapshot for the items a vendor keeps after a partial return, scaled from the per-item
 * snapshots saved at checkout (kept qty / purchased qty). Vendor earnings keep the GST of kept items
 * (earnings = base − commission + tax, as at checkout), so a partial return claws back exactly the
 * returned items' share, GST included, which matches the GST now refunded to the customer.
 *
 * @param {Array}  vendorItems         order.items belonging to the vendor
 * @param {Object} returnedQuantities  { [productId]: total returned qty }
 * @param {number} vendorShipping      the vendor package's shipping charge (not refunded on returns)
 */
export const recalculateKeptVendorFinancials = (vendorItems, returnedQuantities = {}, vendorShipping = 0) => {
    const totals = { keptSubtotal: 0, discountShare: 0, effectiveSubtotal: 0, commission: 0, vendorEarnings: 0, vendorTax: 0 };
    for (const item of vendorItems || []) {
        const pid = String(item.productId || item.id || '');
        const purchasedQty = Number(item.quantity || 1);
        const keptQty = Math.max(0, purchasedQty - Number(returnedQuantities[pid] || 0));
        if (keptQty <= 0) continue;
        const factor = keptQty / purchasedQty;
        totals.keptSubtotal += Number(item.price || 0) * keptQty;
        totals.discountShare += Number(item.couponDiscount || 0) * factor;
        totals.effectiveSubtotal += Number(item.baseAmount || 0) * factor;
        totals.commission += Number(item.commissionAmount || 0) * factor;
        totals.vendorEarnings += Number(item.vendorEarnings || 0) * factor;
        totals.vendorTax += Number(item.taxAmount || 0) * factor;
    }
    const rounded = Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, round2(v)]));
    rounded.totalPaid = round2(rounded.effectiveSubtotal + Number(vendorShipping || 0) + rounded.vendorTax);
    return rounded;
};

/**
 * Amount refunded to the customer for returning `quantity` units of an order item: what they paid for
 * those units, GST included, coupon share excluded, shipping excluded. Uses the checkout snapshot when
 * present; legacy items fall back to price × (1 − vendor discount ratio) plus GST at the item's rate.
 */
export const getReturnRefundForItem = (orderItem, quantity, discountRatio = 0) => {
    const qty = Number(quantity || 0);
    const purchasedQty = Number(orderItem?.quantity || 0);
    if (!orderItem || qty <= 0) return 0;

    const hasSnapshot = purchasedQty > 0
        && [orderItem.discountedSubtotal, orderItem.taxAmount].every((v) => v !== undefined && v !== null && Number.isFinite(Number(v)));
    if (hasSnapshot) {
        const paidForLine = Number(orderItem.discountedSubtotal) + (orderItem.taxIncluded ? 0 : Number(orderItem.taxAmount));
        return round2((paidForLine / purchasedQty) * qty);
    }

    const net = Number(orderItem.price || 0) * qty * (1 - Number(discountRatio || 0));
    const rate = Number(orderItem.taxRate ?? 18);
    return round2(orderItem.taxIncluded ? net : net * (1 + rate / 100));
};

/**
 * Exchange price difference, GST included (approved rule 1, Nov 2026). Example: 1000 + 18% (1180) exchanged for
 * 1200 + 18% (1416) → the customer pays 236, not 200.
 *
 * Both sides go through calculateOrderFinancials, so each line uses its own product's GST rate and
 * inclusive/exclusive setting and the same rounding as checkout:
 *   original    = the exchanged units as bought (order-item price, taxRate, taxIncluded snapshot);
 *   replacement = the same quantity of the new variant at its current price with the replacement product's
 *                 taxRate / taxIncluded.
 * The coupon share the customer got on those units is applied to both sides, so the exchange neither takes the
 * coupon benefit away nor grants it twice. Shipping is not part of an exchange difference.
 *
 * priceDelta > 0 → customer must pay before dispatch; < 0 → refund, never more than what was paid for the units.
 * The GST part of the difference is split CGST/SGST vs IGST when supplier and place-of-supply states are known.
 *
 * @param {Array}  lines  [{ orderItem, quantity, replacement: { price, taxRate, taxIncluded } }]
 * @param {Object} opts   { discountRatio (legacy orders without snapshots), supplierStateCode, placeOfSupplyStateCode }
 */
export const calculateExchangeDifference = (lines, { discountRatio = 0, supplierStateCode = null, placeOfSupplyStateCode = null } = {}) => {
    const priceLine = (price, quantity, taxRate, taxIncluded, couponShare) => calculateOrderFinancials({
        items: [{ productId: 'exchange-line', vendorId: 'exchange', price, quantity, taxRate, taxIncluded: Boolean(taxIncluded) }],
        couponDiscount: couponShare,
        shipping: 0,
        // Commission is irrelevant to what the customer pays; 0 only satisfies the calculator's contract.
        vendorCommissions: { exchange: 0 },
    });

    const pricedLines = (lines || []).map(({ orderItem, quantity, replacement }) => {
        const qty = Number(quantity || 0);
        const purchasedQty = Number(orderItem?.quantity || 0);
        if (!orderItem || qty <= 0 || (purchasedQty > 0 && qty > purchasedQty)) {
            throw new Error('Invalid exchange quantity.');
        }
        const replacementPrice = Number(replacement?.price);
        if (!Number.isFinite(replacementPrice) || replacementPrice < 0) {
            throw new Error('Replacement price is not available.');
        }

        const hasCouponSnapshot = purchasedQty > 0 && orderItem.couponDiscount !== undefined && orderItem.couponDiscount !== null;
        const couponShare = round2(hasCouponSnapshot
            ? (Number(orderItem.couponDiscount) / purchasedQty) * qty
            : Number(orderItem.price || 0) * qty * Number(discountRatio || 0));

        const original = priceLine(Number(orderItem.price || 0), qty, orderItem.taxRate, orderItem.taxIncluded, couponShare);
        const replaced = priceLine(replacementPrice, qty, replacement.taxRate, replacement.taxIncluded, couponShare);

        return {
            productId: orderItem.productId,
            quantity: qty,
            originalUnitPrice: Number(orderItem.price || 0),
            replacementUnitPrice: replacementPrice,
            originalTaxRate: original.items[0].taxRate,
            replacementTaxRate: replaced.items[0].taxRate,
            couponShare,
            originalTaxable: original.taxableAmount,
            originalTax: original.tax,
            originalTotal: original.finalTotal,
            originalPaid: getReturnRefundForItem(orderItem, qty, discountRatio),
            replacementTaxable: replaced.taxableAmount,
            replacementTax: replaced.tax,
            replacementTotal: replaced.finalTotal,
            difference: round2(replaced.finalTotal - original.finalTotal),
        };
    });

    const sum = (key) => round2(pricedLines.reduce((acc, line) => acc + Number(line[key] || 0), 0));
    const originalTotal = sum('originalTotal');
    const replacementTotal = sum('replacementTotal');
    const originalPaid = sum('originalPaid');
    const taxableDelta = round2(sum('replacementTaxable') - sum('originalTaxable'));
    const taxDelta = round2(sum('replacementTax') - sum('originalTax'));
    let priceDelta = round2(replacementTotal - originalTotal);
    if (priceDelta < 0) priceDelta = round2(Math.max(priceDelta, -originalPaid));

    return {
        lines: pricedLines,
        originalTotal,
        replacementTotal,
        originalPaid,
        originalTaxable: sum('originalTaxable'),
        replacementTaxable: sum('replacementTaxable'),
        originalTax: sum('originalTax'),
        replacementTax: sum('replacementTax'),
        taxableDelta,
        taxDelta,
        priceDelta,
        gstSplit: splitGst(taxDelta, supplierStateCode, placeOfSupplyStateCode),
    };
};

/**
 * Cash to collect at the door for one vendor package of a COD order (what the rider or courier collects,
 * what admin settles, what courier remittance should contain). Each package collects only its own share,
 * rounded to the rupee like COD totals. With no cancelled packages the last package absorbs the rounding
 * difference so the packages add up exactly to the COD order total. Cancelled packages collect nothing.
 * Non-COD orders collect nothing.
 */
export const getShipmentCodAmount = (order, vendorId) => {
    const method = String(order?.paymentMethod || '').toLowerCase();
    if (!order || !['cod', 'cash'].includes(method)) return 0;

    const groups = Array.isArray(order.vendorItems) ? order.vendorItems : [];
    const groupVendorId = (g) => String(g?.vendorId?._id || g?.vendorId || '');
    if (groups.length <= 1) {
        return groups[0]?.status === 'cancelled' ? 0 : round2(order.total);
    }

    const index = groups.findIndex((g) => groupVendorId(g) === String(vendorId?._id || vendorId));
    if (index < 0 || groups[index].status === 'cancelled') return 0;

    const amounts = groups.map((g) => (g.status === 'cancelled' ? 0 : Math.round(getVendorGroupPayable(g))));
    if (!groups.some((g) => g.status === 'cancelled')) {
        const last = groups.length - 1;
        amounts[last] = Math.round(Number(order.total || 0)) - amounts.slice(0, last).reduce((sum, a) => sum + a, 0);
    }
    return round2(Math.max(0, amounts[index]));
};
