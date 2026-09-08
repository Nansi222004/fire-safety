# SafeFire — Cancellation, Refund & Money Flow Financial Hardening

## Overview & Executive Summary

This document details the comprehensive financial hardening implemented across SafeFire's Product and Service marketplace cancellation, refund, wallet, escrow, commission, and payout architectures.

All financial vulnerabilities identified during the Phase 0 Forensic Inspection (P0, P1, and P2) have been resolved with strict database transactions, concurrency locks, state progression gates, ledger-backed escrow clawbacks, physical shipment protections, and robust notifications.

> **CRITICAL ARCHITECTURAL NOTE — REFUND SEMANTICS:**  
> **Normal cancellation refunds currently use SafeFire UserWallet wallet_credit. The Razorpay refund API is not invoked by normal cancellation flows.**  
> Online payments captured via Razorpay are credited into the customer's SafeFire UserWallet (`wallet_credit`). No simulated, speculative, or un-executed Razorpay gateway refund records (`razorpayRefundId`) are created.

---

## 1. Before vs. After Behavior Summary

| Area | Vulnerability Before Hardening | Hardened State After Implementation |
| :--- | :--- | :--- |
| **Service Payment Gate** | Vendors could advance unpaid online service bookings (`paymentStatus: 'pending'`) to `confirmed`, `assigned`, `in_progress`, and `completed`, claiming platform payout for uncollected funds. | Strict two-tiered gate: non-COD bookings MUST have `paymentStatus: 'paid'` before advancing beyond `pending` and before financial completion settlement. |
| **Service Cancellation Atomicity** | `customerService.controller.js:cancelBooking` executed without Mongoose transactions. Concurrent or crashing requests could create partial credits or duplicate refunds. | Wrapped in ACID MongoDB transactions (`startSession()` / `startTransaction()`) with atomic claim query: only `['pending', 'confirmed', 'assigned']` are cancellable. |
| **Service Cancellation Concurrency** | Race condition between multiple simultaneous cancellation requests could double-credit customer wallets. | Atomic conditional update (`findOneAndUpdate({ ...query, status: { $in: [...] } })`) claims the single cancellation lock. Exactly one request succeeds; duplicates fail safely with 400. |
| **In-Progress Service Cancellation** | Customers could cancel services already `in_progress` (technician working on site) and extract a full refund. | Blocked with 400: Customer cannot cancel `in_progress` or `completed` bookings. |
| **Admin Escrow Clawback** | Admin cancellation of a delivered item cancelled `Commission` records, but never deducted already released funds from `Vendor.walletBalance`. | Queries released commissions; claws back `Vendor.walletBalance` for exact paid amount; records `VendorWalletTransaction` of type `CANCELLATION_CLAWBACK` with idempotent reference. |
| **Shipped / In-Transit Goods** | Cancellation after driver pickup destroyed shipments (`deliveryBoyId = undefined`), losing physical tracking and orphaning goods with driver. | Strict transit check: if shipment is in `['picked_up', 'shipped', 'in_transit', 'out_for_delivery']`, destructive cancellation is rejected with descriptive 400 error. |
| **Partial Order Status Roll-up** | In multi-vendor orders, cancelling one vendor's package left `order.status` and `paymentStatus` inconsistent. | Standardized roll-up: sets `order.status = 'partially_cancelled'` (or `'partially_delivered'`), and `order.paymentStatus = 'partially_refunded'` (if paid). |
| **Notifications** | Missing customer notifications on vendor product cancellation and missing vendor notifications on admin cancellation. | All successful cancellations dispatch notifications to customer and affected vendor(s) specifying exact wallet refund amount and destination. |

---

## 2. Product Money Flow

### Product Online Cancellation (Paid via Razorpay/Card/UPI)
- **Customer:** Receives instant 100% refund into their SafeFire UserWallet.
- **Vendor:** Does not receive earnings. Inventory is restored. Commission record is marked `cancelled` and escrow marked `cancelled`.
- **Wallet:** `UserWallet.balance` incremented; `WalletTransaction` recorded (`type: 'credit'`, `transactionType: 'cancel_refund'`).
- **Commission:** Escrow held by platform is cancelled; no payout released.
- **Razorpay:** Original payment remains captured at the gateway. No Razorpay refund API is called during normal cancellation.

### Product COD Cancellation (Unpaid)
- **Customer:** ₹0 refund (no money was collected). No wallet credit or fake refund document created.
- **Vendor:** ₹0 earnings. Inventory is restored. Commission cancelled.
- **Wallet:** Untouched.
- **Commission:** Platform fee deduction cancelled.
- **Razorpay:** Not involved.

---

## 3. Service Money Flow

### Service Online Cancellation (Paid via Razorpay/Card/UPI)
- **Customer:** Receives instant 100% refund into their SafeFire UserWallet (`wallet_credit`).
- **Vendor:** Receives ₹0 earnings. ServiceCapacity reservation is released (`bookedCount` decremented by 1).
- **Wallet:** `UserWallet.balance` incremented atomically; `WalletTransaction` recorded with idempotent reference `SERVICE_CANCEL_REFUND_${booking._id}`.
- **Commission:** Not generated (or marked cancelled if previously created).
- **Razorpay:** Payment capture remains at gateway; refund destination is SafeFire UserWallet.

### Service COD Cancellation (Unpaid)
- **Customer:** ₹0 refund (cash was never collected on site).
- **Vendor:** Receives ₹0 earnings. ServiceCapacity reservation is released.
- **Wallet:** Untouched.
- **Commission:** Not generated.
- **Razorpay:** Not involved.

---

## 4. Service Payment Gate Details

Financial protection is enforced in two complementary checkpoints in `vendorBooking.controller.js`:

1. **Status Progression Gate (`updateBookingStatus`):**
   ```javascript
   const isCod = booking.paymentMethod === 'cod';
   if (targetStatus !== 'cancelled' && !isCod && booking.paymentStatus !== 'paid') {
       throw new ApiError(
           400,
           'Cannot advance an online service booking until payment has been successfully captured.'
       );
   }
   ```
   - An unpaid online booking can NEVER be advanced to `confirmed`, `assigned`, or `in_progress`.
   - Vendor cancellation of an unpaid booking remains permitted.

2. **Completion Financial Settlement Gate:**
   ```javascript
   if (targetStatus === 'completed' && booking.settlementStatus !== 'settled') {
       if (!isCod && booking.paymentStatus !== 'paid') {
           throw new ApiError(400, 'Cannot complete an online service booking with uncaptured payment.');
       }
       // ... vendor wallet credit & commission creation
   }
   ```
   - Under no circumstances can vendor earnings be credited for an unpaid, failed, or refunded booking.

---

## 5. Service Cancellation Atomicity & Concurrency

In `customerService.controller.js:cancelBooking`:
1. **Transaction Lifecycle:**
   - Started via `session = await mongoose.startSession(); session.startTransaction();`.
   - All mutations (`creditWallet`, `Refund.create`, `ServiceCapacity.updateOne`, `ServiceBooking.findByIdAndUpdate`, `PaymentAttempt.updateMany`) share the session.
   - If any step fails, `session.abortTransaction()` ensures zero partial mutations or orphaned credits.
2. **Atomic Concurrency Protection:**
   - Atomic conditional update claims the cancellation lock:
     ```javascript
     const booking = await ServiceBooking.findOneAndUpdate(
         { ...query, status: { $in: ['pending', 'confirmed', 'assigned'] } },
         { $set: { status: 'cancelled', ... } },
         { new: false, session }
     );
     ```
   - For simultaneous concurrent requests:
     - Request A matches and captures the pre-cancellation document.
     - Request B finds no document in cancellable status and receives 400 (`Cannot cancel a booking that is already cancelled.`).
     - Exactly one refund is credited, exactly one Refund document is created, and capacity is released exactly once.

---

## 6. Admin Escrow Clawback

Located in `backend/src/modules/admin/controllers/order.controller.js:adminOverrideCancelVendorItem`:
- **When Triggered:** When an admin overrides/cancels an order item for which escrow was already released (`comm.escrowStatus === 'released'` or `comm.status === 'paid'`).
- **Clawback Amount:** Strictly the net amount actually paid to the vendor (`comm.walletCredit || comm.vendorNetEarnings || comm.vendorEarnings`).
- **Ledger Record:**
  - Debits `Vendor.walletBalance` via `$inc: { walletBalance: -totalClawback }`.
  - Creates a `VendorWalletTransaction` document:
    - `type: 'CANCELLATION_CLAWBACK'`
    - `amount: -totalClawback`
    - `referenceId: 'CANCELLATION_CLAWBACK_' + order._id + '_' + targetVendorGroup.vendorId`
    - `walletBalanceBefore` & `walletBalanceAfter` recorded.
- **Duplicate Protection:** Idempotency lookup by `referenceId` prevents double clawback on repeat admin requests.
- **Negative Balance Handling:** If `vendor.walletBalance < 0`, an administrative alert notification is automatically dispatched.

---

## 7. Shipment Safety & Reverse Logistics Guard

Located in `admin/controllers/order.controller.js` and `cancellationRefundService.js`:
- Physical transit statuses: `['picked_up', 'shipped', 'in_transit', 'out_for_delivery']`.
- **Before Pickup (`pending`, `confirmed`, `ready_for_pickup`):**
  - Safe to cancel. Shipment status set to `cancelled`, rider unassigned safely.
- **After Pickup (`picked_up`, `in_transit`, `out_for_delivery`):**
  - Destructive cancellation is **strictly rejected** with HTTP 400:
    > *"Cannot cancel package because shipment is already in transit with delivery partner. Reverse logistics or return workflow must be used."*
  - Prevents orphaning physical inventory with delivery drivers and ensures custody tracking is never severed.

---

## 8. Notifications

All notifications are dispatched asynchronously **after** database transaction commit:
1. **Vendor Product Cancellation:** Customer receives DB notification specifying refund amount credited to SafeFire Wallet.
2. **Admin Full Order Cancellation:** Customer and all affected vendors receive cancellation notifications.
3. **Admin Partial Cancellation:** Customer and the specific affected vendor receive itemized cancellation notifications.
4. **Vendor Service Cancellation:** Customer receives notification stating:
   > *"Booking #... cancelled. ₹... has been refunded to your SafeFire Wallet."*

---

## 9. Verification & Automated Test Matrix

Comprehensive automated suite implemented in:  
`backend/tests/integration/testCancellationFinancialHardening.mjs`

### Test Results Summary:
- **Total Test Assertions:** 40
- **Passed:** 40 (100%)
- **Failed:** 0
- **Execution Time:** ~25s across MongoDB transactions and state machines

### Test Scenarios Verified:
1. Pending online service -> confirmed rejected (400)
2. Pending online service -> assigned/in_progress rejected (400)
3. Pending online service -> completed rejected (400)
4. Failed online service -> completed rejected (400)
5. Refunded online service -> completed rejected (400)
6. Paid online service -> completed allowed (earnings credited)
7. COD pending service -> normal progression allowed
8. Unpaid online service -> vendor wallet receives ₹0
9. Paid pending service cancellation -> one refund
10. Paid confirmed service cancellation -> one refund
11. Assigned service cancellation -> allowed per policy
12. In-progress customer service cancellation -> rejected (400)
13. Completed customer service cancellation -> rejected (400)
14. Cancelled service duplicate cancellation -> rejected safely (400)
15. Sequential duplicate cancellation -> exactly one refund
16. Concurrent duplicate cancellation -> exactly one refund
17. Exactly one Refund document created
18. Exactly one WalletTransaction document created
19. Exactly one ServiceCapacity reservation released
20. Transaction abort rollback test -> leaves no partial wallet credit
21. Escrow held cancellation -> no vendor payout/clawback
22. Escrow released cancellation -> correct vendor clawback
23. Exactly one `CANCELLATION_CLAWBACK` ledger transaction
24. Duplicate admin cancellation -> no second clawback
25. Vendor ledger reconciles before and after clawback
26. Cancellation before pickup behaves safely
27. Cancellation after pickup does not orphan goods
28. Unsupported destructive cancellation in transit is rejected clearly
29. Vendor product cancellation -> customer notification dispatched
30. Admin full cancellation -> customer notification dispatched
31. Admin partial cancellation -> affected vendor notification dispatched
32. Vendor service cancellation -> customer notification with wallet refund wording
33. Online cancellation -> SafeFire wallet credit
34. Normal cancellation -> Razorpay refund API NOT called
35. COD cancellation -> no fake refund
36. Refund reference is unique/idempotent
37. Partial cancellation leaves remaining vendor package intact
38. Commission for cancelled package is cancelled
39. Remaining vendor commission is untouched
40. Order status/payment accounting remains schema-valid (`partially_cancelled`, `partially_refunded`)
