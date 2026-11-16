import mongoose from 'mongoose';
import Vendor from '../models/Vendor.model.js';
import Commission from '../models/Commission.model.js';
import Order from '../models/Order.model.js';
import { getVendorGroupPayable } from './financial.service.js';
import { getPayoutHoldDays } from './settingsService.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Canonical vendor payout status for one commission (approved rule 3), for Vendor/Admin display. It only reads the
 * saved escrow state and release date (fixed at delivery = delivery + return window); it never computes a date.
 *   held       — in escrow; eligibleOn is the saved release date (null: not delivered yet, or the return window
 *                was not configured at delivery — see reason)
 *   eligible   — release date passed; paid out by the next scheduled escrow run unless an open return blocks it
 *   processing — the escrow run is releasing it now
 *   paid       — released to the vendor wallet
 *   cancelled / refunded / failed — no payout (or needs manual follow-up)
 *
 * @param {Object}  commission           Commission document (lean ok)
 * @param {Object}  [opts]
 * @param {boolean} [opts.returnWindowConfigured]  pass false to report reason 'return_window_not_configured'
 * @param {Date}    [opts.now]
 */
export const getPayoutEligibility = (commission, { returnWindowConfigured = true, now = new Date() } = {}) => {
    if (!commission) return { status: 'held', eligibleOn: null, releasedAt: null, reason: 'no_commission_record' };
    const escrow = commission.escrowStatus || 'held';
    const eligibleOn = commission.escrowReleaseDate ? new Date(commission.escrowReleaseDate) : null;
    const releasedAt = commission.releasedAt ? new Date(commission.releasedAt) : null;
    if (escrow === 'released' || commission.status === 'paid') return { status: 'paid', eligibleOn, releasedAt, reason: null };
    if (escrow === 'processing') return { status: 'processing', eligibleOn, releasedAt, reason: null };
    if (escrow === 'cancelled' || commission.status === 'cancelled') return { status: 'cancelled', eligibleOn, releasedAt, reason: null };
    if (escrow === 'refunded' || escrow === 'refund_processing') return { status: 'refunded', eligibleOn, releasedAt, reason: null };
    if (escrow === 'failed') return { status: 'failed', eligibleOn, releasedAt, reason: 'release_failed' };
    if (!eligibleOn) {
        return { status: 'held', eligibleOn: null, releasedAt, reason: returnWindowConfigured ? 'awaiting_delivery' : 'return_window_not_configured' };
    }
    return eligibleOn <= now
        ? { status: 'eligible', eligibleOn, releasedAt, reason: 'awaiting_scheduled_release' }
        : { status: 'held', eligibleOn, releasedAt, reason: 'return_window' };
};

/**
 * Canonical "this vendor's package was delivered" step. Starts the vendor's escrow:
 *   1. atomically marks the package delivered AND claims its one-time on-hold credit (one update, guarded by
 *      isOnHoldBalanceAdded in the filter, so concurrent confirmations cannot both credit — F-19);
 *   2. sets the commission's escrow release date = deliveredAt + the Admin-configured return window (approved
 *      rule 3; snapshotted now, so later window changes affect only future deliveries) and credits onHoldBalance.
 *      If the window is not configured the release date is left empty: the funds stay held (never released early)
 *      and the escrow cron fills the date in once Admin configures it;
 *   3. rolls the order status up to 'delivered' / 'partially_delivered' in the database.
 *
 * Rider OTP deliveries and courier webhooks only update the Shipment; before this ran from the shipment-delivered
 * listener, nothing marked the package delivered in the Order, so the escrow cron never paid those vendors.
 *
 * @returns {{ credited: boolean, earnings: number, escrowReleaseDate: Date|null }}
 */
export const markVendorPackageDelivered = async (orderId, vendorId, { deliveredAt = new Date(), session = null } = {}) => {
    const vendorObjectId = new mongoose.Types.ObjectId(String(vendorId?._id || vendorId));
    const when = deliveredAt instanceof Date ? deliveredAt : new Date(deliveredAt);

    const claimed = await Order.findOneAndUpdate(
        {
            _id: orderId,
            vendorItems: { $elemMatch: { vendorId: vendorObjectId, status: { $ne: 'cancelled' }, isOnHoldBalanceAdded: { $ne: true } } },
        },
        { $set: { 'vendorItems.$.status': 'delivered', 'vendorItems.$.isOnHoldBalanceAdded': true } },
        { new: true, session }
    );

    let earnings = 0;
    let escrowReleaseDate = null;
    if (claimed) {
        const holdDays = await getPayoutHoldDays();
        if (holdDays === null) {
            console.error('[PAYOUT_HOLD] Return window not configured: vendor funds stay held with no release date', {
                orderId: String(orderId), vendorId: String(vendorObjectId),
            });
        } else {
            escrowReleaseDate = new Date(when.getTime() + holdDays * DAY_MS);
        }
        const comm = await Commission.findOneAndUpdate(
            { orderId, vendorId: vendorObjectId, status: { $ne: 'cancelled' } },
            { $set: { escrowStatus: 'held', escrowReleaseDate } },
            { new: true, session }
        );
        const group = claimed.vendorItems.find((g) => String(g.vendorId) === String(vendorObjectId));
        if (comm) {
            earnings = parseFloat(Number(comm.vendorNetEarnings || comm.vendorEarnings || group?.vendorEarnings || 0).toFixed(2));
            if (earnings > 0) {
                await Vendor.findByIdAndUpdate(vendorObjectId, { $inc: { onHoldBalance: earnings } }, { session });
                console.log('[FINANCIAL_EVENT] onHoldBalance incremented', {
                    vendorId: String(vendorObjectId), orderId: String(orderId), amount: earnings, timestamp: new Date().toISOString(),
                });
            }
        } else {
            console.warn(`[Delivery Helper] Commission record not found for Order ${claimed.orderId}, Vendor ${vendorObjectId}`);
        }
    }

    // Roll the order status up from its packages (cancelled packages don't count).
    const order = claimed || await Order.findById(orderId).select('status vendorItems deliveredAt').session(session).lean();
    if (order) {
        const live = (order.vendorItems || []).filter((g) => g.status !== 'cancelled');
        const delivered = live.filter((g) => g.status === 'delivered');
        if (live.length && delivered.length) {
            const allDelivered = delivered.length === live.length;
            await Order.updateOne(
                { _id: orderId, status: { $nin: ['cancelled', 'returned'] } },
                { $set: allDelivered
                    ? { status: 'delivered', deliveredAt: order.deliveredAt || when }
                    : { status: 'partially_delivered' } },
                { session }
            );
        }
    }

    return { credited: Boolean(claimed), earnings, escrowReleaseDate };
};

/**
 * Admin / vendor status-update paths that set vendorItems[n].status = 'delivered' in memory and then save the
 * order: starts escrow for each newly delivered package through markVendorPackageDelivered (atomic, once).
 */
export const handleOrderDeliveryBalances = async (order) => {
    if (!order || !order.vendorItems) return;

    for (const vi of order.vendorItems) {
        if (vi.status === 'delivered' && !vi.isOnHoldBalanceAdded) {
            await markVendorPackageDelivered(order._id, vi.vendorId);
            // Keep the in-memory document consistent with what was written, since the caller saves it next.
            vi.isOnHoldBalanceAdded = true;
        }
    }
};

const round2 = (n) => parseFloat(Number(n || 0).toFixed(2));

/**
 * Commission records for a paid order, built from the vendor-package snapshot saved at checkout (rate, commission,
 * earnings, GST). Used wherever commissions are created after checkout (payment capture, wallet pay) so they
 * always equal what checkout calculated; never recomputed with a vendor's current rate.
 */
export const buildCommissionDocsFromOrder = (order) => (order.vendorItems || []).map((group) => {
    const items = Array.isArray(group.items) ? group.items : [];
    const hasSnapshots = items.length > 0 && items.every((i) => i.baseAmount !== undefined && i.baseAmount !== null);
    const base = hasSnapshots
        ? round2(items.reduce((sum, i) => sum + Number(i.baseAmount || 0), 0))
        : round2(Number(group.subtotal || 0) - Number(group.discount || 0));
    return {
        orderId: order._id,
        vendorId: group.vendorId,
        vendorName: group.vendorName || '',
        subtotal: group.subtotal,
        vendorSubtotal: group.subtotal,
        discountShare: group.discount || 0,
        vendorCouponDiscount: group.discount || 0,
        effectiveSubtotal: base,
        vendorDiscountedSubtotal: base,
        commissionRate: group.commissionRate,
        commission: group.commissionAmount || 0,
        commissionAmount: group.commissionAmount || 0,
        vendorEarnings: group.vendorEarnings || 0,
        vendorNetEarnings: group.vendorEarnings || 0,
        escrowAmount: group.vendorEarnings || 0,
        walletCredit: 0,
        escrowStatus: 'held',
        settlementStatus: 'pending',
        vendorTax: group.tax || 0,
        vendorTotalPaidByCustomer: getVendorGroupPayable(group),
        ...(order.couponId ? { couponId: order.couponId, couponCode: order.couponCode } : {}),
    };
});
