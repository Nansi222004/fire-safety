/**
 * READ-ONLY financial reconciliation of an existing database (Nov 2026 audit follow-up).
 *
 * Compares stored financial records with what the fixed calculation rules say they should be, and writes
 * a Markdown report plus JSON/CSV discrepancy exports. It never modifies data:
 *   1. it uses the raw MongoDB driver only (no Mongoose models, so no auto-index or collection creation);
 *   2. every driver write method, $out/$merge stages and non-read commands are patched to throw;
 *   3. it refuses to run when the database user can write, unless --target-is-copy is passed to confirm the
 *      URI points at a backup or sanitized copy (never production).
 * Exports contain record IDs and amounts only (no names, emails, phones or addresses).
 *
 * Usage:
 *   RECON_MONGO_URI="mongodb://<read-only-user>@host/db" node src/scripts/financialReconciliation.js --out <dir>
 *   (add --target-is-copy only for a restored backup / sanitized copy whose user has write rights)
 *
 * The URI is never taken from .env, so the app's own (read-write) database credentials can't be used by accident.
 */
import fs from 'node:fs';
import path from 'node:path';
import { MongoClient, Collection, Db, ObjectId } from 'mongodb';
import {
    getShipmentCodAmount,
    getVendorGroupPayable,
    getReturnRefundForItem,
} from '../services/financial.service.js';

// ─── Write guard ─────────────────────────────────────────────────────────────

const WRITE_METHODS = [
    'insertOne', 'insertMany', 'updateOne', 'updateMany', 'replaceOne', 'deleteOne', 'deleteMany',
    'findOneAndUpdate', 'findOneAndReplace', 'findOneAndDelete', 'bulkWrite', 'createIndex', 'createIndexes',
    'dropIndex', 'dropIndexes', 'drop', 'rename', 'initializeOrderedBulkOp', 'initializeUnorderedBulkOp',
];
const DB_WRITE_METHODS = ['createCollection', 'dropCollection', 'dropDatabase', 'renameCollection', 'createIndex'];
const READ_COMMANDS = new Set(['ping', 'hello', 'ismaster', 'isMaster', 'buildInfo', 'connectionStatus', 'listCollections', 'dbStats', 'collStats']);

export const installWriteGuard = () => {
    const refuse = (name) => function refused() {
        throw new Error(`READ-ONLY GUARD: "${name}" is not allowed in the reconciliation script.`);
    };
    for (const name of WRITE_METHODS) Collection.prototype[name] = refuse(`Collection.${name}`);
    for (const name of DB_WRITE_METHODS) Db.prototype[name] = refuse(`Db.${name}`);

    const originalAggregate = Collection.prototype.aggregate;
    Collection.prototype.aggregate = function guardedAggregate(pipeline = [], options) {
        if (pipeline.some((stage) => stage && ('$out' in stage || '$merge' in stage))) {
            throw new Error('READ-ONLY GUARD: $out / $merge aggregation stages are not allowed.');
        }
        return originalAggregate.call(this, pipeline, options);
    };
    const originalCommand = Db.prototype.command;
    Db.prototype.command = function guardedCommand(command, options) {
        const name = Object.keys(command || {})[0];
        if (!READ_COMMANDS.has(name)) throw new Error(`READ-ONLY GUARD: command "${name}" is not allowed.`);
        return originalCommand.call(this, command, options);
    };
};

const WRITE_ACTIONS = new Set([
    'insert', 'update', 'remove', 'createCollection', 'dropCollection', 'createIndex', 'dropIndex',
    'dropDatabase', 'renameCollectionSameDB', 'convertToCapped', 'collMod', 'bypassDocumentValidation',
]);

/** Classifies a connectionStatus({ showPrivileges: true }) result: 'none' (no auth), 'write' or 'read-only'. */
export const assessPrivileges = (status, dbName) => {
    const users = status?.authInfo?.authenticatedUsers || [];
    if (users.length === 0) return { level: 'none', users };
    const privileges = status?.authInfo?.authenticatedUserPrivileges || [];
    const canWrite = privileges.some((p) => (p.actions || []).some((a) => WRITE_ACTIONS.has(a))
        && (p.resource?.anyResource || p.resource?.cluster || p.resource?.db === '' || p.resource?.db === dbName));
    return { level: canWrite ? 'write' : 'read-only', users };
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const idOf = (v) => String(v?._id || v || '');
const isCod = (order) => ['cod', 'cash'].includes(String(order?.paymentMethod || '').toLowerCase());
const NON_REVENUE_STATUSES = ['cancelled', 'payment_pending', 'payment_failed', 'returned'];
const OFFLINE_METHODS = ['cod', 'cash', 'wallet'];
const MONEY_TOLERANCE = 0.01;

const SEVERITY_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
const CATEGORY_LABEL = {
    CONFIRMED: 'Confirmed discrepancy',
    REVIEW: 'Needs review (cannot be decided from stored data alone)',
    BUSINESS_DIFFERENCE: 'Legitimate business / historical-rule difference',
};

const parseArgs = (argv) => {
    const args = { out: null, targetIsCopy: false };
    for (let i = 0; i < argv.length; i += 1) {
        if (argv[i] === '--out') args.out = argv[i + 1];
        if (argv[i] === '--target-is-copy') args.targetIsCopy = true;
    }
    return args;
};

// ─── Reconciliation ──────────────────────────────────────────────────────────

export const runReconciliation = async (db, { now = new Date() } = {}) => {
    const col = (name) => db.collection(name);
    const findings = [];
    const stats = {};
    const inspect = (check, n = 1) => { stats[check] = stats[check] || { inspected: 0, failed: 0 }; stats[check].inspected += n; };
    const add = (f) => {
        stats[f.check] = stats[f.check] || { inspected: 0, failed: 0 };
        stats[f.check].failed += 1;
        findings.push({
            financeApproval: false,
            expected: null,
            actual: null,
            difference: null,
            ...f,
            difference: f.difference ?? (f.expected != null && f.actual != null ? round2(Number(f.actual) - Number(f.expected)) : null),
        });
    };

    // Shared lookups
    const orders = await col('orders').find({ isDeleted: { $ne: true } }, {
        projection: {
            orderId: 1, userId: 1, status: 1, paymentMethod: 1, paymentStatus: 1, total: 1, subtotal: 1, tax: 1,
            discount: 1, shipping: 1, couponDiscount: 1, couponId: 1, couponCode: 1, taxableAmount: 1,
            commissionAmount: 1, vendorEarnings: 1, walletAmountUsed: 1, items: 1, vendorItems: 1, escrowStatus: 1,
            isCashSettled: 1, deliveredAt: 1, createdAt: 1, legacyFinancialSnapshot: 1,
        },
    }).toArray();
    const orderById = new Map(orders.map((o) => [idOf(o._id), o]));
    const shipments = await col('shipments').find({}, {
        projection: { orderId: 1, vendorId: 1, deliveryBoyId: 1, status: 1, type: 1, isCashSettled: 1, cashSettlementId: 1, codRemittanceId: 1 },
    }).toArray();
    const isForward = (s) => !s.type || s.type === 'forward';
    const commissions = await col('commissions').find({}).toArray();
    const refunds = await col('refunds').find({}).toArray();
    const refundsByOrder = new Map();
    for (const r of refunds) {
        if (!r.orderId) continue;
        const k = idOf(r.orderId);
        if (!refundsByOrder.has(k)) refundsByOrder.set(k, []);
        refundsByOrder.get(k).push(r);
    }
    const live = (r) => ['completed', 'processing'].includes(r.status);
    const shipmentAmount = (s) => getShipmentCodAmount(orderById.get(idOf(s.orderId)), s.vendorId);

    // 1. Rider COD cash-in-hand vs unsettled delivered packages
    const riders = await col('deliveryboys').find({}, { projection: { walletBalance: 1, cashInHand: 1, cashCollected: 1 } }).toArray();
    for (const rider of riders) {
        inspect('1. Rider cash-in-hand');
        const pending = shipments.filter((s) => idOf(s.deliveryBoyId) === idOf(rider._id) && isForward(s)
            && s.status === 'delivered' && s.isCashSettled !== true && isCod(orderById.get(idOf(s.orderId))));
        const expected = round2(pending.reduce((sum, s) => sum + shipmentAmount(s), 0));
        const actual = round2(rider.cashInHand);
        if (Math.abs(actual - expected) > MONEY_TOLERANCE) {
            const multiVendorPackages = pending.filter((s) => (orderById.get(idOf(s.orderId))?.vendorItems || []).length > 1).length;
            add({
                check: '1. Rider cash-in-hand', severity: 'HIGH', category: 'CONFIRMED', collection: 'deliveryboys',
                recordId: idOf(rider._id), field: 'cashInHand', expected, actual,
                rootCause: actual > expected
                    ? `Stored cash-in-hand exceeds the rider's unsettled COD packages (R-1: each package of a multi-vendor COD order added the whole order total; settlement subtracted it once). ${multiVendorPackages} unsettled multi-vendor package(s).`
                    : 'Stored cash-in-hand is below the unsettled COD packages (settlement subtracted whole order totals for packages the rider did not carry, or ledger gaps).',
                recommendation: 'Finance to confirm the cash physically held by the rider; then post one ADJUSTMENT ledger entry to bring cashInHand to the confirmed amount.',
                financeApproval: true,
                details: { unsettledPackages: pending.length, multiVendorPackages },
            });
        }
    }

    // 2. Rider cash settlements vs the packages they settled
    const cashSettlements = await col('cashsettlements').find({}).toArray();
    for (const cs of cashSettlements) {
        inspect('2. Rider cash settlement amount');
        const settled = shipments.filter((s) => idOf(s.cashSettlementId) === idOf(cs._id) && isForward(s));
        if (settled.length === 0) {
            add({
                check: '2. Rider cash settlement amount', severity: 'MEDIUM', category: 'REVIEW', collection: 'cashsettlements',
                recordId: idOf(cs._id), field: 'amount', expected: null, actual: round2(cs.amount),
                rootCause: 'No package is linked to this settlement (legacy settlement made before package-level tracking, or link missing).',
                recommendation: 'Match manually against the settlement receipt and orders[] list.',
                financeApproval: true,
            });
            continue;
        }
        const expected = round2(settled.reduce((sum, s) => sum + shipmentAmount(s), 0));
        const actual = round2(cs.amount);
        if (Math.abs(actual - expected) > MONEY_TOLERANCE) {
            add({
                check: '2. Rider cash settlement amount', severity: 'HIGH', category: 'CONFIRMED', collection: 'cashsettlements',
                recordId: idOf(cs._id), field: 'amount', expected, actual,
                rootCause: 'Settlement was computed as Σ order.total of orders touched (R-2), not the packages this rider delivered.',
                recommendation: actual > expected
                    ? 'Rider was asked for more cash than they collected: verify against the receipt and refund/credit the rider the difference.'
                    : 'Rider handed over less than the packages they collected: recover the difference after Finance review.',
                financeApproval: true,
                details: { packages: settled.length, riderId: idOf(cs.deliveryBoyId) },
            });
        }
    }

    // 3. Courier COD remittances vs package COD amount
    const remittances = await col('couriercodremittances').find({}).toArray();
    for (const r of remittances) {
        inspect('3. Courier COD remittance');
        const order = orderById.get(idOf(r.orderId));
        if (!order) continue;
        const expected = getShipmentCodAmount(order, r.vendorId);
        const actual = round2(r.codAmountExpected);
        if (Math.abs(actual - expected) > MONEY_TOLERANCE) {
            add({
                check: '3. Courier COD remittance', severity: 'MEDIUM', category: 'CONFIRMED', collection: 'couriercodremittances',
                recordId: idOf(r._id), humanId: order.orderId, field: 'codAmountExpected', expected, actual,
                rootCause: 'Expected COD used the double-GST package formula (F-08) or the whole order total.',
                recommendation: 'Recompute the courier variance with the expected amount; raise a dispute with the courier if received < expected.',
                financeApproval: true,
                details: { codAmountReceived: r.codAmountReceived },
            });
        }
        if (r.remittanceStatus === 'partial' || r.remittanceStatus === 'disputed') {
            add({
                check: '3. Courier COD remittance', severity: 'MEDIUM', category: 'REVIEW', collection: 'couriercodremittances',
                recordId: idOf(r._id), humanId: order.orderId, field: 'codAmountReceived', expected, actual: round2(r.codAmountReceived),
                rootCause: `Courier remitted less than expected (status "${r.remittanceStatus}").`,
                recommendation: 'Follow up with the courier; do not treat as revenue loss until resolved.',
                financeApproval: true,
            });
        }
    }

    // 4. Held commissions vs package settlement / lifecycle
    const shipmentFor = (orderId, vendorId) => shipments.find((s) => idOf(s.orderId) === idOf(orderId) && idOf(s.vendorId) === idOf(vendorId) && isForward(s));
    for (const c of commissions.filter((x) => x.orderId && x.status === 'pending' && ['held', 'processing'].includes(x.escrowStatus))) {
        inspect('4. Held commissions');
        const order = orderById.get(idOf(c.orderId));
        if (!order) {
            add({ check: '4. Held commissions', severity: 'MEDIUM', category: 'REVIEW', collection: 'commissions', recordId: idOf(c._id),
                field: 'orderId', rootCause: 'Commission points to a missing or deleted order.', recommendation: 'Confirm whether the order was deleted; cancel the commission if so.', financeApproval: true });
            continue;
        }
        const group = (order.vendorItems || []).find((g) => idOf(g.vendorId) === idOf(c.vendorId));
        if (order.status === 'cancelled' || group?.status === 'cancelled') {
            add({ check: '4. Held commissions', severity: 'HIGH', category: 'CONFIRMED', collection: 'commissions', recordId: idOf(c._id),
                humanId: order.orderId, field: 'status', expected: 'cancelled', actual: c.status,
                rootCause: 'Order or vendor package is cancelled but the commission is still held (would be released to the vendor).',
                recommendation: 'Cancel the commission; check the vendor onHoldBalance for the same amount.', financeApproval: true });
            continue;
        }
        const releaseDue = c.escrowReleaseDate && new Date(c.escrowReleaseDate) <= now;
        if (isCod(order) && releaseDue) {
            const s = shipmentFor(order._id, c.vendorId);
            if (s?.isCashSettled === true && order.isCashSettled !== true) {
                add({ check: '4. Held commissions', severity: 'MEDIUM', category: 'CONFIRMED', collection: 'commissions', recordId: idOf(c._id),
                    humanId: order.orderId, field: 'escrowStatus', expected: 'released', actual: c.escrowStatus,
                    rootCause: "Vendor package cash is settled (courier remittance or rider) but the old escrow cron only checked order.isCashSettled (C-3), so the vendor was never paid.",
                    recommendation: 'No manual correction: after deployment the fixed escrow cron releases it on its next run. Verify the vendor wallet afterwards.',
                    financeApproval: false, details: { vendorNetEarnings: c.vendorNetEarnings } });
            }
        }
        if (!c.escrowReleaseDate && (group?.status === 'delivered' || order.status === 'delivered')) {
            add({ check: '4. Held commissions', severity: 'MEDIUM', category: 'REVIEW', collection: 'commissions', recordId: idOf(c._id),
                humanId: order.orderId, field: 'escrowReleaseDate', expected: 'set at delivery', actual: null,
                rootCause: 'Package delivered but no escrow release date: delivery balances were never applied (onHoldBalance not credited).',
                recommendation: 'Check whether onHoldBalance includes this commission before setting a release date.', financeApproval: true });
        }
    }
    for (const c of commissions.filter((x) => x.escrowStatus === 'failed')) {
        inspect('4. Held commissions');
        add({ check: '4. Held commissions', severity: 'HIGH', category: 'REVIEW', collection: 'commissions', recordId: idOf(c._id),
            field: 'escrowStatus', actual: 'failed', rootCause: c.notes || 'Escrow release failed (e.g. onHoldBalance shortfall or missing vendor).',
            recommendation: 'Manual review: vendor not paid for this commission.', financeApproval: true });
    }

    // 5. Released commissions vs settlement history
    const vendorTxns = await col('vendorwallettransactions').find({}).toArray();
    const txnByRef = new Map(vendorTxns.filter((t) => t.referenceId).map((t) => [t.referenceId, t]));
    const settlements = await col('settlements').find({}).toArray();
    const settlementsByCommission = new Map();
    for (const s of settlements) for (const cid of s.commissionIds || []) {
        const k = idOf(cid);
        settlementsByCommission.set(k, (settlementsByCommission.get(k) || 0) + 1);
    }
    for (const c of commissions.filter((x) => x.orderId && x.escrowStatus === 'released')) {
        inspect('5. Released commissions');
        const order = orderById.get(idOf(c.orderId));
        const net = round2(c.vendorNetEarnings ?? c.vendorEarnings);
        const txn = txnByRef.get(`ESCROW_RELEASE_${idOf(c.orderId)}_${idOf(c.vendorId)}_${idOf(c._id)}`);
        if (!txn) {
            add({ check: '5. Released commissions', severity: 'MEDIUM', category: 'REVIEW', collection: 'commissions', recordId: idOf(c._id),
                humanId: order?.orderId, field: 'ledger', expected: 'ESCROW_RELEASE entry', actual: 'missing',
                rootCause: 'Released commission has no escrow-release ledger entry (legacy release or manual payout).',
                recommendation: 'Confirm the vendor was paid exactly once (wallet history / bank payout).', financeApproval: true });
        } else if (Math.abs(round2(txn.amount) - net) > MONEY_TOLERANCE) {
            add({ check: '5. Released commissions', severity: 'HIGH', category: 'CONFIRMED', collection: 'vendorwallettransactions', recordId: idOf(txn._id),
                humanId: order?.orderId, field: 'amount', expected: net, actual: round2(txn.amount),
                rootCause: 'Amount released differs from the commission net earnings (commission recalculated after release, e.g. partial return).',
                recommendation: 'Check for a matching RETURN_CLAWBACK; otherwise adjust after Finance approval.', financeApproval: true });
        }
        if (order && (order.status === 'cancelled' || (order.vendorItems || []).find((g) => idOf(g.vendorId) === idOf(c.vendorId))?.status === 'cancelled')) {
            add({ check: '5. Released commissions', severity: 'HIGH', category: 'CONFIRMED', collection: 'commissions', recordId: idOf(c._id),
                humanId: order.orderId, field: 'escrowStatus', expected: 'cancelled', actual: 'released',
                rootCause: 'Vendor was paid for a cancelled order/package.', recommendation: 'Claw back after Finance approval.', financeApproval: true });
        }
        if (order && isCod(order)) {
            const s = shipmentFor(order._id, c.vendorId);
            if (s && s.isCashSettled !== true) {
                add({ check: '5. Released commissions', severity: 'HIGH', category: 'REVIEW', collection: 'commissions', recordId: idOf(c._id),
                    humanId: order.orderId, field: 'escrowStatus', expected: 'held until package cash settled', actual: 'released',
                    rootCause: "Released while this vendor's package cash was still unsettled (old cron used the order-level flag, which another rider's settlement could set; R-2).",
                    recommendation: 'Confirm the package cash has since been collected; no vendor action needed if so.', financeApproval: true });
            }
        }
    }

    // 6. Duplicates
    const countBy = (items, keyFn) => {
        const m = new Map();
        for (const it of items) { const k = keyFn(it); if (!k) continue; m.set(k, (m.get(k) || 0) + 1); }
        return [...m.entries()].filter(([, n]) => n > 1);
    };
    const activeCommissions = commissions.filter((c) => c.orderId && c.status !== 'cancelled');
    inspect('6. Duplicates', activeCommissions.length);
    for (const [key, n] of countBy(activeCommissions, (c) => `${idOf(c.orderId)}|${idOf(c.vendorId)}`)) {
        const [orderId, vendorId] = key.split('|');
        add({ check: '6. Duplicates', severity: 'CRITICAL', category: 'CONFIRMED', collection: 'commissions', recordId: key,
            humanId: orderById.get(orderId)?.orderId, field: 'count', expected: 1, actual: n,
            rootCause: 'More than one active commission for the same order + vendor: the vendor can be paid twice.',
            recommendation: 'Keep one, cancel the rest after checking which were released.', financeApproval: true, details: { orderId, vendorId } });
    }
    inspect('6. Duplicates', settlementsByCommission.size);
    for (const [cid, n] of settlementsByCommission) if (n > 1) {
        add({ check: '6. Duplicates', severity: 'CRITICAL', category: 'CONFIRMED', collection: 'settlements', recordId: cid,
            field: 'commissionIds', expected: 1, actual: n, rootCause: 'Commission appears in more than one vendor settlement.',
            recommendation: 'Verify the payouts; recover the duplicate.', financeApproval: true });
    }
    const serviceCommissions = commissions.filter((c) => c.serviceBookingId);
    inspect('6. Duplicates', serviceCommissions.length);
    for (const [bid, n] of countBy(serviceCommissions, (c) => idOf(c.serviceBookingId))) {
        add({ check: '6. Duplicates', severity: 'CRITICAL', category: 'CONFIRMED', collection: 'commissions', recordId: bid,
            field: 'serviceBookingId', expected: 1, actual: n, rootCause: 'Service booking settled more than once.',
            recommendation: 'Check SERVICE_SETTLEMENT ledger entries and recover the duplicate payout.', financeApproval: true });
    }

    // 7. Escrow status vs lifecycle (order level)
    const commissionsByOrder = new Map();
    for (const c of commissions.filter((x) => x.orderId)) {
        const k = idOf(c.orderId);
        if (!commissionsByOrder.has(k)) commissionsByOrder.set(k, []);
        commissionsByOrder.get(k).push(c);
    }
    for (const o of orders) {
        inspect('7. Escrow lifecycle');
        const comms = (commissionsByOrder.get(idOf(o._id)) || []).filter((c) => c.status !== 'cancelled');
        if (o.escrowStatus === 'released' && comms.some((c) => c.escrowStatus !== 'released')) {
            add({ check: '7. Escrow lifecycle', severity: 'LOW', category: 'CONFIRMED', collection: 'orders', recordId: idOf(o._id), humanId: o.orderId,
                field: 'escrowStatus', expected: 'partially_released', actual: 'released',
                rootCause: 'Order-level escrow flag says released while a vendor commission is not (display flag only).',
                recommendation: 'Display-only; the commission record is authoritative. No money action.' });
        }
        if (['paid', 'partially_refunded'].includes(o.paymentStatus) && !NON_REVENUE_STATUSES.includes(o.status) && comms.length === 0 && (o.vendorItems || []).length) {
            add({ check: '7. Escrow lifecycle', severity: 'HIGH', category: 'CONFIRMED', collection: 'orders', recordId: idOf(o._id), humanId: o.orderId,
                field: 'commissions', expected: 'one per vendor package', actual: 0,
                rootCause: 'Paid order has no commission records, so vendors will never be paid through escrow.',
                recommendation: 'Recreate commissions from the order snapshot after Finance approval.', financeApproval: true });
        }
    }

    // 8. Wallets: stored balances vs ledgers
    const userWallets = await col('userwallets').find({}, { projection: { userId: 1, balance: 1 } }).toArray();
    const userTxns = await col('wallettransactions').find({}, { projection: { userId: 1, type: 1, amount: 1, status: 1, reference: 1 } }).toArray();
    const ledgerByUser = new Map();
    for (const t of userTxns) {
        const counts = t.type === 'credit' ? ['completed', 'reversed'].includes(t.status) : t.status === 'completed';
        if (!counts) continue;
        const k = idOf(t.userId);
        ledgerByUser.set(k, round2((ledgerByUser.get(k) || 0) + (t.type === 'credit' ? 1 : -1) * Number(t.amount || 0)));
    }
    for (const w of userWallets) {
        inspect('8. Customer wallet vs ledger');
        const expected = round2(ledgerByUser.get(idOf(w.userId)) || 0);
        const actual = round2(w.balance);
        if (Math.abs(actual - expected) > MONEY_TOLERANCE) {
            add({ check: '8. Customer wallet vs ledger', severity: 'HIGH', category: 'CONFIRMED', collection: 'userwallets', recordId: idOf(w._id),
                field: 'balance', expected, actual,
                rootCause: 'Stored balance differs from Σ completed ledger credits − debits (concurrent read-modify-write before F-04, or a write without a ledger entry).',
                recommendation: 'Finance to decide the correct balance; post an admin_adjustment ledger entry for the difference.', financeApproval: true,
                details: { userId: idOf(w.userId) } });
        }
    }
    for (const [key, n] of countBy(userTxns.filter((t) => t.reference), (t) => `${t.reference}|${t.type}`)) {
        add({ check: '6. Duplicates', severity: 'CRITICAL', category: 'CONFIRMED', collection: 'wallettransactions', recordId: key,
            field: 'reference', expected: 1, actual: n, rootCause: 'Same wallet reference applied more than once.',
            recommendation: 'Reverse the duplicate after Finance approval.', financeApproval: true });
    }

    const vendors = await col('vendors').find({}, { projection: { walletBalance: 1, onHoldBalance: 1 } }).toArray();
    const BALANCE_TYPES = new Set(['ESCROW_RELEASE', 'WITHDRAWAL_HOLD', 'WITHDRAWAL_REFUND', 'ADJUSTMENT', 'RETURN_CLAWBACK', 'CANCELLATION_CLAWBACK', 'SERVICE_SETTLEMENT']);
    const vendorLedger = new Map();
    for (const t of vendorTxns) {
        if (!BALANCE_TYPES.has(t.type)) continue; // WITHDRAWAL_COMPLETED is informational (balance already held)
        const k = idOf(t.vendorId);
        vendorLedger.set(k, round2((vendorLedger.get(k) || 0) + Number(t.amount || 0)));
    }
    const heldByVendor = new Map();
    for (const c of commissions.filter((x) => x.orderId && x.status === 'pending' && ['held', 'processing'].includes(x.escrowStatus) && x.escrowReleaseDate)) {
        const k = idOf(c.vendorId);
        heldByVendor.set(k, round2((heldByVendor.get(k) || 0) + Number(c.vendorNetEarnings ?? c.vendorEarnings ?? 0)));
    }
    for (const v of vendors) {
        inspect('8. Vendor wallet vs ledger');
        const expected = round2(vendorLedger.get(idOf(v._id)) || 0);
        const actual = round2(v.walletBalance);
        if (Math.abs(actual - expected) > MONEY_TOLERANCE) {
            add({ check: '8. Vendor wallet vs ledger', severity: 'HIGH', category: 'REVIEW', collection: 'vendors', recordId: idOf(v._id),
                field: 'walletBalance', expected, actual,
                rootCause: 'Stored vendor wallet differs from Σ balance-changing ledger entries (legacy writes without ledger rows, or a missing clawback/release entry).',
                recommendation: 'Reconcile against payouts and the commission list before any adjustment.', financeApproval: true });
        }
        inspect('8. Vendor on-hold vs held commissions');
        const heldExpected = round2(heldByVendor.get(idOf(v._id)) || 0);
        const heldActual = round2(v.onHoldBalance);
        if (Math.abs(heldActual - heldExpected) > MONEY_TOLERANCE) {
            add({ check: '8. Vendor on-hold vs held commissions', severity: 'MEDIUM', category: 'REVIEW', collection: 'vendors', recordId: idOf(v._id),
                field: 'onHoldBalance', expected: heldExpected, actual: heldActual,
                rootCause: 'On-hold balance differs from Σ held (delivered) commissions: return decrements from the wrong bucket (F-07), missed or double delivery credit (F-19), or escrow release shortfall.',
                recommendation: 'Finance review; escrow releases fail for this vendor while on-hold < earnings due.', financeApproval: true });
        }
    }

    const riderTxns = await col('deliverywallettransactions').find({}, { projection: { deliveryBoyId: 1, type: 1, amount: 1 } }).toArray();
    const riderWallet = new Map();
    for (const t of riderTxns) {
        if (!['DELIVERY_EARNING', 'WITHDRAWAL', 'WITHDRAWAL_REFUND', 'ADJUSTMENT'].includes(t.type)) continue;
        const k = idOf(t.deliveryBoyId);
        riderWallet.set(k, round2((riderWallet.get(k) || 0) + Number(t.amount || 0)));
    }
    for (const rider of riders) {
        inspect('8. Rider wallet vs ledger');
        const expected = round2(riderWallet.get(idOf(rider._id)) || 0);
        const actual = round2(rider.walletBalance);
        if (Math.abs(actual - expected) > MONEY_TOLERANCE) {
            add({ check: '8. Rider wallet vs ledger', severity: 'MEDIUM', category: 'REVIEW', collection: 'deliveryboys', recordId: idOf(rider._id),
                field: 'walletBalance', expected, actual,
                rootCause: 'Rider earnings wallet differs from Σ earning/withdrawal ledger entries (ADJUSTMENT rows may also move cash-in-hand).',
                recommendation: 'Review the rider ledger before paying out.', financeApproval: true });
        }
    }

    // 9. Historical order totals vs item snapshots
    const coupons = new Map((await col('coupons').find({}, { projection: { code: 1, type: 1, maxDiscount: 1 } }).toArray()).map((c) => [idOf(c._id), c]));
    const couponsByCode = new Map([...coupons.values()].map((c) => [String(c.code || '').toUpperCase(), c]));
    for (const o of orders) {
        const items = o.items || [];
        const hasSnapshots = items.length && items.every((i) => i.finalLineTotal != null && i.lineSubtotal != null && i.baseAmount != null);
        if (!hasSnapshots) continue;
        inspect('9. Order totals vs snapshots');
        const sum = (f) => round2(items.reduce((s, i) => s + Number(i[f] || 0), 0));
        const lineSubtotal = sum('lineSubtotal');
        const discountedSubtotal = sum('discountedSubtotal');
        const finalTotal = sum('finalLineTotal');
        const expectedTotal = isCod(o) ? Math.round(finalTotal) : finalTotal;
        if (Math.abs(round2(o.total) - expectedTotal) > (isCod(o) ? 1 : MONEY_TOLERANCE)) {
            add({ check: '9. Order totals vs snapshots', severity: 'HIGH', category: 'CONFIRMED', collection: 'orders', recordId: idOf(o._id), humanId: o.orderId,
                field: 'total', expected: expectedTotal, actual: round2(o.total),
                rootCause: 'Charged total differs from the sum of its own line snapshots.', recommendation: 'Investigate the order history before any customer contact.', financeApproval: true });
        }
        if (Math.abs(round2(o.subtotal) - lineSubtotal) > MONEY_TOLERANCE) {
            const isDiscountedSemantics = Math.abs(round2(o.subtotal) - discountedSubtotal) <= MONEY_TOLERANCE;
            add({ check: '9. Order totals vs snapshots', severity: 'LOW', category: isDiscountedSemantics ? 'BUSINESS_DIFFERENCE' : 'CONFIRMED',
                collection: 'orders', recordId: idOf(o._id), humanId: o.orderId, field: 'subtotal', expected: lineSubtotal, actual: round2(o.subtotal),
                rootCause: isDiscountedSemantics
                    ? 'Historical semantics (F-12): checkout stored the discounted subtotal. Money charged is correct; invoices show the discount twice.'
                    : 'Stored subtotal matches neither the pre- nor post-discount item total.',
                recommendation: 'Display-only. Optional back-fill (D-3) after Finance approval; no customer or vendor money impact.' });
        }
        const taxable = sum('baseAmount');
        if (o.taxableAmount != null && Math.abs(round2(o.taxableAmount) - taxable) > MONEY_TOLERANCE) {
            add({ check: '9. Order totals vs snapshots', severity: 'LOW', category: 'BUSINESS_DIFFERENCE', collection: 'orders', recordId: idOf(o._id), humanId: o.orderId,
                field: 'taxableAmount', expected: taxable, actual: round2(o.taxableAmount),
                rootCause: 'Historical taxableAmount included GST for tax-inclusive items (D-4).',
                recommendation: 'Use the item baseAmount for GST filings; optional back-fill.' });
        }
        const tax = sum('taxAmount');
        if (Math.abs(round2(o.tax) - tax) > 0.05) {
            add({ check: '9. Order totals vs snapshots', severity: 'MEDIUM', category: 'CONFIRMED', collection: 'orders', recordId: idOf(o._id), humanId: o.orderId,
                field: 'tax', expected: tax, actual: round2(o.tax), rootCause: 'Order tax differs from the item tax snapshots.',
                recommendation: 'Use item taxAmount for GST reporting.', financeApproval: true });
        }
        const coupon = (o.couponId && coupons.get(idOf(o.couponId))) || (o.couponCode && couponsByCode.get(String(o.couponCode).toUpperCase()));
        if (coupon?.type === 'percentage' && coupon.maxDiscount && Number(o.couponDiscount || 0) > coupon.maxDiscount + MONEY_TOLERANCE) {
            add({ check: '12. Other historical effects of fixed bugs', severity: 'MEDIUM', category: 'CONFIRMED', collection: 'orders', recordId: idOf(o._id), humanId: o.orderId,
                field: 'couponDiscount', expected: coupon.maxDiscount, actual: round2(o.couponDiscount),
                rootCause: 'Checkout did not apply the coupon maxDiscount cap (F-02). Revenue loss borne by the vendor share.',
                recommendation: 'No customer recovery recommended; Finance to note the loss per vendor.', financeApproval: true });
        }
    }

    // 10. Refunds vs orders
    const paymentAttempts = await col('paymentattempts').find({}, { projection: { orderId: 1, serviceBookingId: 1, status: 1, attemptNumber: 1, razorpayPaymentId: 1 } }).toArray();
    const attemptsByOrder = new Map();
    for (const a of paymentAttempts.filter((x) => x.orderId)) {
        const k = idOf(a.orderId);
        if (!attemptsByOrder.has(k)) attemptsByOrder.set(k, []);
        attemptsByOrder.get(k).push(a);
    }
    for (const o of orders) {
        inspect('10. Refunds vs orders');
        const rs = refundsByOrder.get(idOf(o._id)) || [];
        const refunded = round2(rs.filter(live).reduce((s, r) => s + Number(r.amount || 0), 0));
        if (refunded > round2(o.total) + MONEY_TOLERANCE) {
            add({ check: '10. Refunds vs orders', severity: 'CRITICAL', category: 'CONFIRMED', collection: 'orders', recordId: idOf(o._id), humanId: o.orderId,
                field: 'refunds', expected: round2(o.total), actual: refunded, rootCause: 'More refunded than the customer paid.',
                recommendation: 'Finance to review each refund on this order.', financeApproval: true });
        }
        const walletShare = OFFLINE_METHODS.includes(String(o.paymentMethod || '').toLowerCase()) ? 0 : Number(o.walletAmountUsed || 0);
        const gatewayRefunded = round2(rs.filter((r) => live(r) && r.destination !== 'wallet').reduce((s, r) => s + Number(r.amount || 0), 0));
        if (walletShare > 0 && gatewayRefunded > round2(o.total - walletShare) + MONEY_TOLERANCE) {
            add({ check: '10. Refunds vs orders', severity: 'HIGH', category: 'CONFIRMED', collection: 'orders', recordId: idOf(o._id), humanId: o.orderId,
                field: 'gatewayRefunds', expected: round2(o.total - walletShare), actual: gatewayRefunded,
                rootCause: 'Gateway refund exceeds what the gateway captured (F-09); the wallet share was not returned to the wallet.',
                recommendation: 'Check the Razorpay status of these refunds; credit the wallet share if it was never returned.', financeApproval: true });
        }
        if (o.status === 'cancelled' && ['paid', 'refund_queued'].includes(o.paymentStatus) && rs.filter(live).length === 0) {
            add({ check: '10. Refunds vs orders', severity: 'HIGH', category: 'CONFIRMED', collection: 'orders', recordId: idOf(o._id), humanId: o.orderId,
                field: 'refunds', expected: round2(o.total), actual: 0, rootCause: 'Paid order cancelled with no completed or processing refund.',
                recommendation: 'Refund the customer after Finance approval.', financeApproval: true });
        }
        if (o.status === 'cancelled' && walletShare > 0 && ['pending', 'failed'].includes(o.paymentStatus)
            && !rs.some((r) => live(r) && r.destination === 'wallet')) {
            add({ check: '10. Refunds vs orders', severity: 'HIGH', category: 'CONFIRMED', collection: 'orders', recordId: idOf(o._id), humanId: o.orderId,
                field: 'walletAmountUsed', expected: walletShare, actual: 0,
                rootCause: 'Unpaid wallet+gateway order cancelled without returning the wallet share debited at checkout (C-1).',
                recommendation: 'Credit the wallet share back to the customer after Finance approval.', financeApproval: true });
        }
        for (const r of rs.filter((x) => live(x) && /^(PARTIAL_CANCEL_|ADMIN_CANCEL_)/.test(String(x.referenceId || '')))) {
            const vendorId = String(r.referenceId).split('_').pop();
            const group = (o.vendorItems || []).find((g) => idOf(g.vendorId) === vendorId);
            if (!group) continue;
            const expected = getVendorGroupPayable(group);
            if (round2(r.amount) > expected + MONEY_TOLERANCE) {
                add({ check: '10. Refunds vs orders', severity: 'HIGH', category: 'CONFIRMED', collection: 'refunds', recordId: idOf(r._id), humanId: o.orderId,
                    field: 'amount', expected, actual: round2(r.amount),
                    rootCause: 'Package cancellation refund counted GST twice for tax-inclusive items (F-08).',
                    recommendation: 'Over-refund to the customer; Finance to decide whether to absorb or recover.', financeApproval: true });
            }
        }
        for (const r of rs.filter((x) => x.status === 'failed')) {
            add({ check: '10. Refunds vs orders', severity: 'HIGH', category: 'REVIEW', collection: 'refunds', recordId: idOf(r._id), humanId: o.orderId,
                field: 'status', actual: 'failed', expected: null, rootCause: r.failureReason || 'Refund failed.',
                recommendation: 'Customer has not received this refund: process manually.', financeApproval: true, details: { amount: r.amount } });
        }
        const attempts = attemptsByOrder.get(idOf(o._id)) || [];
        if (walletShare > 0 && attempts.some((a) => a.status === 'paid' && Number(a.attemptNumber) > 1)) {
            add({ check: '12. Other historical effects of fixed bugs', severity: 'HIGH', category: 'REVIEW', collection: 'orders', recordId: idOf(o._id), humanId: o.orderId,
                field: 'retryAmount', expected: round2(o.total - walletShare), actual: round2(o.total),
                rootCause: 'Paid on a retry while part of the order was paid from the wallet: retries charged the full total (F-03).',
                recommendation: 'Check the captured amount in Razorpay; refund the wallet share if it was charged twice.', financeApproval: true });
        }
        if (attempts.some((a) => a.status === 'failed' && a.razorpayPaymentId)) {
            add({ check: '12. Other historical effects of fixed bugs', severity: 'HIGH', category: 'REVIEW', collection: 'orders', recordId: idOf(o._id), humanId: o.orderId,
                field: 'paymentAttempt', actual: 'failed attempt with a payment id', expected: null,
                rootCause: 'A payment id exists on an attempt marked failed: a capture after a failed first try may have been ignored (SV-01).',
                recommendation: 'Check Razorpay: if captured, either fulfil the order or refund.', financeApproval: true });
        }
    }

    // Return refunds before decision 1A (GST excluded) — legitimate historical difference, listed for Finance
    const returns = await col('returnrequests').find({ requestType: 'return' }, { projection: { orderId: 1, vendorId: 1, items: 1, refundAmount: 1, status: 1, createdAt: 1 } }).toArray();
    for (const rr of returns) {
        inspect('10. Return refunds (GST)');
        const o = orderById.get(idOf(rr.orderId));
        if (!o) continue;
        const expected = round2((rr.items || []).reduce((s, it) => {
            const item = (o.items || []).find((x) => idOf(x.productId) === idOf(it.productId) && idOf(x.vendorId) === idOf(rr.vendorId));
            return s + getReturnRefundForItem(item, it.quantity);
        }, 0));
        if (expected > 0 && round2(rr.refundAmount) + MONEY_TOLERANCE < expected) {
            add({ check: '10. Return refunds (GST)', severity: 'LOW', category: 'BUSINESS_DIFFERENCE', collection: 'returnrequests', recordId: idOf(rr._id), humanId: o.orderId,
                field: 'refundAmount', expected, actual: round2(rr.refundAmount),
                rootCause: 'Created before decision 1A: return refunds excluded the GST the customer paid.',
                recommendation: 'Optional goodwill top-up of the GST difference; Finance decision.', financeApproval: true, details: { status: rr.status } });
        }
    }

    // Services
    const bookings = await col('servicebookings').find({}, { projection: { bookingId: 1, status: 1, paymentMethod: 1, paymentStatus: 1, settlementStatus: 1, pricing: 1 } }).toArray();
    const serviceRefunds = new Map();
    for (const r of refunds.filter((x) => x.serviceBookingId && live(x))) serviceRefunds.set(idOf(r.serviceBookingId), true);
    const serviceCommissionIds = new Set(serviceCommissions.map((c) => idOf(c.serviceBookingId)));
    for (const b of bookings) {
        inspect('Services');
        if (b.status === 'completed' && !serviceCommissionIds.has(idOf(b._id))) {
            add({ check: 'Services', severity: 'HIGH', category: 'CONFIRMED', collection: 'servicebookings', recordId: idOf(b._id), humanId: b.bookingId,
                field: 'settlement', expected: 'commission + vendor payout', actual: 'none',
                rootCause: 'Completed booking was never settled (non-atomic settlement failed part-way, SV-03).',
                recommendation: 'Settle the vendor manually after Finance approval.', financeApproval: true, details: { total: b.pricing?.total } });
        }
        if (b.status === 'cancelled' && b.paymentMethod !== 'cod' && (b.paymentStatus === 'refunded' || b.paymentStatus === 'paid') && !serviceRefunds.has(idOf(b._id))) {
            add({ check: 'Services', severity: 'HIGH', category: 'CONFIRMED', collection: 'servicebookings', recordId: idOf(b._id), humanId: b.bookingId,
                field: 'refund', expected: round2(b.pricing?.total), actual: 0,
                rootCause: 'Paid booking cancelled without a refund record (SV-06; status may wrongly say "refunded").',
                recommendation: 'Refund the customer after Finance approval.', financeApproval: true });
        }
    }
    for (const c of serviceCommissions) {
        inspect('Services');
        const b = bookings.find((x) => idOf(x._id) === idOf(c.serviceBookingId));
        const total = Number(b?.pricing?.total || 0);
        const tax = Number(b?.pricing?.tax || 0);
        if (b && tax > 0 && Math.abs(round2(c.commissionAmount) - round2((total * c.commissionRate) / 100)) <= MONEY_TOLERANCE) {
            add({ check: 'Services', severity: 'INFO', category: 'BUSINESS_DIFFERENCE', collection: 'commissions', recordId: idOf(c._id), humanId: b.bookingId,
                field: 'commissionAmount', expected: round2(((total - tax) * c.commissionRate) / 100), actual: round2(c.commissionAmount),
                rootCause: 'Settled before decision A: commission was charged on the GST-inclusive total.',
                recommendation: 'Historical rule; refund the GST commission to the vendor only if Finance decides to apply decision A retroactively.', financeApproval: true });
        }
    }

    // 11. Cross-panel totals
    const revenueOrders = orders.filter((o) => !NON_REVENUE_STATUSES.includes(o.status));
    const gmv = round2(revenueOrders.reduce((s, o) => s + Number(o.total || 0), 0));
    const parts = round2(revenueOrders.reduce((s, o) => s + Number(o.commissionAmount || 0) + Number(o.vendorEarnings || 0) + Number(o.shipping || 0), 0));
    const vendorNetSales = round2(revenueOrders.reduce((s, o) => s + (o.vendorItems || []).filter((g) => g.status !== 'cancelled')
        .reduce((x, g) => x + Math.max(0, Number(g.subtotal || 0) - Number(g.discount || 0)), 0), 0));
    for (const o of revenueOrders) {
        inspect('11. Order split vs total');
        const split = round2(Number(o.commissionAmount || 0) + Number(o.vendorEarnings || 0) + Number(o.shipping || 0));
        if (o.commissionAmount != null && o.vendorEarnings != null && Math.abs(split - round2(o.total)) > 1) {
            add({ check: '11. Order split vs total', severity: 'MEDIUM', category: 'REVIEW', collection: 'orders', recordId: idOf(o._id), humanId: o.orderId,
                field: 'commission+vendorEarnings+shipping', expected: round2(o.total), actual: split,
                rootCause: 'Commission + vendor earnings + shipping does not add up to what the customer paid (legacy order, or tax-inclusive/rounding edge).',
                recommendation: 'Review before using this order in P&L.' });
        }
    }

    findings.sort((a, b) => (SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]) || a.check.localeCompare(b.check));
    const totals = { gmv, commissionPlusVendorPlusShipping: parts, unexplainedDifference: round2(gmv - parts), vendorNetSales, revenueOrders: revenueOrders.length };
    return { findings, stats, totals, counts: {
        orders: orders.length, shipments: shipments.length, commissions: commissions.length, refunds: refunds.length,
        riders: riders.length, vendors: vendors.length, userWallets: userWallets.length, cashSettlements: cashSettlements.length,
        courierRemittances: remittances.length, serviceBookings: bookings.length, returnRequests: returns.length,
        walletTransactions: userTxns.length, vendorWalletTransactions: vendorTxns.length, riderTransactions: riderTxns.length,
        paymentAttempts: paymentAttempts.length, settlements: settlements.length,
    } };
};

// ─── Output ──────────────────────────────────────────────────────────────────

const csvEscape = (v) => {
    const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const writeOutputs = (outDir, result, meta) => {
    fs.mkdirSync(outDir, { recursive: true });
    const { findings, stats, totals, counts } = result;
    fs.writeFileSync(path.join(outDir, 'discrepancies.json'), JSON.stringify(findings, null, 2));
    const cols = ['severity', 'category', 'check', 'collection', 'recordId', 'humanId', 'field', 'expected', 'actual', 'difference', 'financeApproval', 'rootCause', 'recommendation', 'details'];
    fs.writeFileSync(path.join(outDir, 'discrepancies.csv'), [cols.join(','), ...findings.map((f) => cols.map((c) => csvEscape(f[c])).join(','))].join('\n'));

    const recordsInspected = Object.values(counts).reduce((a, b) => a + b, 0);
    const checksRun = Object.values(stats).reduce((a, s) => a + s.inspected, 0);
    const bySeverity = {};
    const byCategory = {};
    for (const f of findings) {
        bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
        byCategory[f.category] = (byCategory[f.category] || 0) + 1;
    }
    const confirmedMoney = findings.filter((f) => f.category === 'CONFIRMED' && ['CRITICAL', 'HIGH'].includes(f.severity));
    const summary = {
        ...meta, recordsInspected, reconciliationsRun: checksRun, reconciliationsPassed: checksRun - findings.length,
        discrepancies: findings.length, bySeverity, byCategory,
        financeApprovalRequired: findings.filter((f) => f.financeApproval).length, totals, counts, perCheck: stats,
    };
    fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));

    const table = (rows) => rows.map((r) => `| ${r.join(' | ')} |`).join('\n');
    const md = [
        '# Financial Reconciliation Report (read-only)', '',
        `- **Run at:** ${meta.runAt}`, `- **Database:** \`${meta.database}\` (${meta.targetNote})`,
        `- **Mode:** read-only (write guard active; ${meta.privilegeNote})`, '',
        '## Summary', '',
        table([['Metric', 'Value'], ['---', '---'],
            ['Records inspected', recordsInspected], ['Reconciliations run', checksRun], ['Reconciliations passed', checksRun - findings.length],
            ['Discrepancies', findings.length], ['Needing Finance approval', summary.financeApprovalRequired],
            ['Confirmed CRITICAL/HIGH', confirmedMoney.length]]), '',
        '### By severity', '', table([['Severity', 'Count'], ['---', '---'], ...Object.entries(bySeverity)]), '',
        '### By category', '', table([['Category', 'Meaning', 'Count'], ['---', '---', '---'], ...Object.entries(byCategory).map(([k, n]) => [k, CATEGORY_LABEL[k] || k, n])]), '',
        '### Per check', '', table([['Check', 'Inspected', 'Discrepancies'], ['---', '---', '---'], ...Object.entries(stats).map(([k, s]) => [k, s.inspected, s.failed])]), '',
        '### Platform totals (revenue orders only)', '',
        table([['Metric', 'Amount (₹)'], ['---', '---'], ['GMV (Σ order total)', totals.gmv], ['Σ commission + vendor earnings + shipping', totals.commissionPlusVendorPlusShipping],
            ['Unexplained difference (rounding / legacy)', totals.unexplainedDifference], ['Vendor net sales (Σ subtotal − coupon share)', totals.vendorNetSales]]), '',
        '## Discrepancies', '',
        findings.length === 0 ? 'None found.' : table([
            ['Sev', 'Category', 'Check', 'Record', 'Field', 'Expected', 'Actual', 'Diff', 'Finance', 'Root cause', 'Recommendation'],
            Array(11).fill('---'),
            ...findings.map((f) => [f.severity, f.category, f.check, `${f.collection}/${f.recordId}${f.humanId ? ` (${f.humanId})` : ''}`, f.field,
                f.expected ?? '', f.actual ?? '', f.difference ?? '', f.financeApproval ? 'yes' : 'no',
                String(f.rootCause || '').replace(/\|/g, '/'), String(f.recommendation || '').replace(/\|/g, '/')]),
        ]), '',
        'No data was modified. Every correction above needs Finance approval and must be applied through the normal ledgers (adjustment entries), never by editing balances directly.',
    ].join('\n');
    fs.writeFileSync(path.join(outDir, 'report.md'), md);
    return summary;
};

// ─── CLI ─────────────────────────────────────────────────────────────────────

const main = async () => {
    const args = parseArgs(process.argv.slice(2));
    const uri = process.env.RECON_MONGO_URI;
    if (!uri) {
        console.error('RECON_MONGO_URI is not set. Point it at a READ-ONLY user, or at a restored backup / sanitized copy (with --target-is-copy).');
        console.error('It is deliberately not read from .env so the app\'s read-write credentials are never used.');
        process.exit(2);
    }
    if (!args.out) {
        console.error('--out <directory> is required.');
        process.exit(2);
    }

    installWriteGuard();
    const client = new MongoClient(uri, { readPreference: 'secondaryPreferred', appName: 'safefire-readonly-reconciliation' });
    await client.connect();
    try {
        const db = client.db();
        const status = await db.command({ connectionStatus: 1, showPrivileges: true });
        const { level, users } = assessPrivileges(status, db.databaseName);
        const canWrite = level === 'write';
        let privilegeNote;
        if (level === 'none') {
            privilegeNote = 'no authentication (local copy)';
            if (!args.targetIsCopy) {
                console.error('Unauthenticated connection: cannot prove read-only access. Re-run with --target-is-copy only if this is a backup/copy.');
                process.exit(3);
            }
        } else if (canWrite) {
            privilegeNote = 'user CAN write; allowed only because --target-is-copy was given';
            if (!args.targetIsCopy) {
                console.error(`The database user (${users.map((u) => u.user).join(', ')}) has write privileges. Refusing to run against what may be production.`);
                console.error('Create a read-only user (role "read" on this database) or restore a backup and pass --target-is-copy.');
                process.exit(3);
            }
        } else {
            privilegeNote = 'database user verified read-only';
        }

        const result = await runReconciliation(db);
        const summary = writeOutputs(args.out, result, {
            runAt: new Date().toISOString(),
            database: db.databaseName,
            targetNote: args.targetIsCopy ? 'declared backup/copy' : 'read-only user',
            privilegeNote,
        });
        console.log(JSON.stringify({
            recordsInspected: summary.recordsInspected, reconciliationsRun: summary.reconciliationsRun,
            reconciliationsPassed: summary.reconciliationsPassed, discrepancies: summary.discrepancies,
            bySeverity: summary.bySeverity, byCategory: summary.byCategory, financeApprovalRequired: summary.financeApprovalRequired,
            output: path.resolve(args.out),
        }, null, 2));
    } finally {
        await client.close();
    }
};

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('financialReconciliation.js')) {
    main().catch((err) => {
        console.error('Reconciliation failed:', err.message);
        process.exit(1);
    });
}
