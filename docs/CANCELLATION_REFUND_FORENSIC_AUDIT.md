# SafeFire — Product & Service Cancellation Refund & Money Flow Forensic Audit

**Audit Date:** September 7, 2026  
**Audit Type:** READ-ONLY FORENSIC FINANCIAL AUDIT  
**Auditor:** Antigravity AI Forensic Engine  
**Deliverable:** `docs/CANCELLATION_REFUND_FORENSIC_AUDIT.md`  

---

## AUDIT RESTRICTIONS ENFORCEMENT & INTEGRITY DECLARATION

```text
Browser testing:       NOT PERFORMED (Strictly avoided as instructed)
Database mutation:     NOT PERFORMED (Zero test data injected, zero mutations)
Code changes:          NOT PERFORMED (Read-only static code & architectural inspection)
Audit type:            READ-ONLY FORENSIC FINANCIAL AUDIT
```

---

## 1. Executive Summary

A comprehensive, read-only static code forensic financial audit was conducted across the SafeFire e-commerce and services platform codebase. The audit inspected every controller, service, middleware, Mongoose schema, background cron, event listener, and API route governing order and service booking cancellations, payment captures, wallet transactions, commission ledgers, escrow holds, and payment gateway interactions.

### The Most Critical Discovery: Zero Real Money Is Ever Refunded on Cancellation

1. **NO AUTOMATIC RAZORPAY REFUND IMPLEMENTED FOR CANCELLATIONS:**
   Across all Product and Service cancellation flows, **SafeFire NEVER calls Razorpay's refund API (`payments.refund` or `initiateRefund`)**.
   - When a customer cancels an online-paid product order, their refund is **100% credited into their internal SafeFire User Wallet** (`WalletTransaction`, `UserWallet.balance`).
   - When a customer cancels an online-paid service booking, their refund is **100% credited into their internal SafeFire User Wallet**.
   - When a seller/vendor cancels an order or service booking, the refund is **100% credited into the customer's SafeFire User Wallet**.
   - **The fiat currency collected via UPI, credit card, debit card, or net banking remains permanently in SafeFire's Razorpay merchant bank account.**
   - Furthermore, **SafeFire provides NO customer wallet withdrawal mechanism** (only vendors and delivery riders have withdrawal schemas and endpoints). Customers cannot withdraw their wallet balance back to their bank accounts or original payment sources.

2. **CRITICAL FINANCIAL EXPLOIT IN SERVICE BOOKINGS (P0):**
   When a customer initiates a service booking with payment method `online` but abandons payment before Razorpay capture, the booking is created with `paymentStatus: 'pending'` and `status: 'pending'`.
   - The vendor dashboard displays this booking. The vendor can advance it: `pending` → `confirmed` → `in_progress` → `completed`.
   - In [`vendorBooking.controller.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/vendor/controllers/vendorBooking.controller.js#L202-L277), when `targetStatus === 'completed'`, the code checks `const isCod = booking.paymentMethod === 'cod';`. If `isCod` is `false`, **it assumes SafeFire captured online payment, and immediately credits `vendorEarnings` from platform funds into the vendor's wallet balance**, even though the customer NEVER paid a single rupee!

3. **CONCURRENCY RACE CONDITION IN SERVICE CANCELLATION (P0):**
   Unlike product order cancellation (which runs inside an atomic MongoDB transaction session), [`customerService.controller.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/customer/controllers/customerService.controller.js#L654-L772) runs **without a transaction session**. If concurrent cancellation requests arrive simultaneously, `wallet.balance` is incremented and saved before the duplicate-key error on `WalletTransaction.reference` is thrown, resulting in **un-rolled-back duplicate wallet credits**.

4. **ADMIN OVERRIDE CANCEL AFTER ESCROW RELEASE CREATES UNRECOVERABLE DOUBLE PAYOUT (P1):**
   If an administrator cancels a vendor package via [`adminOverrideCancelVendorItem`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/admin/controllers/order.controller.js#L393-L520) after the 7-day escrow window has already released earnings to the vendor's wallet, the system marks the commission record as `'cancelled'` and credits the customer's wallet 100%, but **fails to claw back or debit the vendor's wallet balance**. SafeFire suffers a direct unrecovered financial loss.

5. **CUSTOMER SERVICE CANCELLATION WHILE WORK IS IN PROGRESS (P1):**
   In [`customerService.controller.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/customer/controllers/customerService.controller.js#L668), the cancellation guard only checks `booking.status === 'completed' || booking.status === 'cancelled'`. A customer can cancel a booking while `status === 'in_progress'` (when the technician is physically on site), receiving a 100% wallet refund while leaving the vendor with ₹0 compensation.

---

## 2. Product Cancellation Flow Architecture

### 2.1 Entry Points Map

```text
Product Cancellation Entry Points:
  │
  ├── 1. Customer Full Order Cancel
  │      Route: PATCH /api/user/orders/:id/cancel
  │      Controller: backend/src/modules/user/controllers/order.controller.js:cancelOrder
  │      Guard: ['pending', 'processing', 'payment_pending'].includes(order.status)
  │
  ├── 2. Customer Partial Item / Package Cancel
  │      Route: PATCH /api/user/orders/:id/items/:vendorItemId/cancel
  │      Controller: backend/src/modules/user/controllers/order.controller.js:cancelVendorItem
  │      Guard: targetVendorGroup.status NOT in ['packed', 'pickup_assigned', 'shipped', 'delivered', 'returned', 'cancelled']
  │
  ├── 3. Vendor Package Cancel
  │      Route: PATCH /api/vendor/orders/:id/status (with body: { status: 'cancelled' })
  │      Controller: backend/src/modules/vendor/controllers/order.controller.js:updateOrderStatus
  │      Guard: transitionMap[currentStatus] allows 'cancelled' (only allowed from 'pending' and 'processing')
  │
  ├── 4. Admin Full Order Cancel
  │      Route: PATCH /api/admin/orders/:id/status (with body: { status: 'cancelled' })
  │      Controller: backend/src/modules/admin/controllers/order.controller.js:updateOrderStatus
  │      Guard: allowedTransitions (allowed from 'pending', 'processing', 'ready_for_pickup', 'shipped')
  │
  └── 5. Admin Override Partial Item / Package Cancel
         Route: PATCH /api/admin/orders/:id/items/:vendorItemId/cancel
         Controller: backend/src/modules/admin/controllers/order.controller.js:adminOverrideCancelVendorItem
         Guard: targetVendorGroup.status !== 'cancelled'
```

### 2.2 Reusable Core Processor

All product cancellation flows delegate execution to [`cancellationRefundService.processCancellationRefund`](file:///d:/Appzeto_Projects/safe-fire/backend/src/services/cancellationRefundService.js#L39-L391).
- **Session Management:** Creates a MongoDB client transaction session (`session.startTransaction()`) if one is not passed in.
- **Atomic Operations within Transaction:**
  1. Status updates on `Order` and `Order.vendorItems`.
  2. Financial calculation of refund amount.
  3. Customer wallet credit via [`creditWallet`](file:///d:/Appzeto_Projects/safe-fire/backend/src/services/wallet.service.js#L43).
  4. Creation of `Refund` ledger document.
  5. Restoration of product inventory (`Product.stockQuantity += quantity` with variant support).
  6. Restoration of coupon slot (`Coupon.usedCount -= 1`).
  7. Reversal of vendor commission (`Commission.status = 'cancelled'`, `Commission.escrowStatus = 'cancelled'`).
  8. Cancellation of assigned shipment delivery via [`cancelShipmentDeliveryAssignment`](file:///d:/Appzeto_Projects/safe-fire/backend/src/services/assignmentService.js#L832).

---

## 3. Service Booking Cancellation Flow Architecture

### 3.1 Entry Points Map

```text
Service Booking Cancellation Entry Points:
  │
  ├── 1. Customer Booking Cancel
  │      Route: PATCH /api/customer/bookings/:id/cancel
  │      Controller: backend/src/modules/customer/controllers/customerService.controller.js:cancelBooking
  │      Guard: booking.status !== 'completed' && booking.status !== 'cancelled'
  │
  ├── 2. Vendor Booking Cancel
  │      Route: PATCH /api/vendor/service-bookings/:id/status (with body: { status: 'cancelled' })
  │      Controller: backend/src/modules/vendor/controllers/vendorBooking.controller.js:updateBookingStatus
  │      Guard: ALLOWED_TRANSITIONS allows 'cancelled' from 'pending', 'confirmed', 'assigned', 'in_progress'
  │
  ├── 3. Admin Booking Cancel
  │      STATUS: NOT IMPLEMENTED
  │      Route: None exists. Admin controller (adminBooking.controller.js) only has getAllBookings and getAdminBookingById.
  │
  └── 4. System / Automatic Timeout Cancel
         STATUS: NOT IMPLEMENTED
```

---

## 4. Scenario Analysis: Customer Cancels

### 4.1 Customer Cancels Product — Online Payment

```text
Customer Pays ₹1,000 via Razorpay
             │
             ▼
Razorpay captures ₹1,000 cash → Deposited to SafeFire Merchant Bank Account
             │
             ▼
SafeFire Backend (processCapturedPayment):
   • Order.paymentStatus = 'paid'
   • Commission created: vendorEarnings = ₹800, commission = ₹200 (escrowStatus = 'held')
             │
             ▼
Customer calls PATCH /api/user/orders/:id/cancel
             │
             ▼
cancellationRefundService.processCancellationRefund executes:
   • order.status = 'cancelled'
   • order.paymentStatus = 'refunded'
   • refundAmount = Number(order.total) (₹1,000)
   • creditWallet(userId, ₹1,000, 'cancel_refund')
   • Refund.create({ method: 'wallet_credit', destination: 'wallet', status: 'completed' })
   • Product inventory restored
   • Commission.status = 'cancelled', Commission.escrowStatus = 'cancelled'
   • Shipment.status = 'cancelled', Driver unassigned
             │
             ▼
ACTUAL FINANCIAL RESULT:
   • Customer receives: ₹1,000 in SafeFire UserWallet balance (CANNOT WITHDRAW)
   • Customer receives back to Bank/UPI/Card: ₹0
   • Razorpay Refund API called: NO (Never called)
   • SafeFire Merchant Account holds: ₹1,000 real fiat cash
   • Vendor receives: ₹0 (escrow cancelled)
   • Admin Commission earned: ₹0 (cancelled)
```

**Financial Details for Product Cancellation:**
- **Refund Amount:** Exact `order.total` (inclusive of items, taxes, shipping, minus discounts).
- **Shipping Refund:** 100% refunded to wallet.
- **Tax Refund:** 100% refunded to wallet.
- **Discount/Coupon:** Coupon `usedCount` is decremented by 1 so customer can reuse it. The coupon discount itself is not converted to cash.
- **Gift Card / Wallet Portion:** If customer paid using a mix of wallet and online, the full `order.total` is credited back to wallet.
- **Partial Cancellation Support:** Fully supported via `cancelVendorItem`. If only Vendor A's package is cancelled, only Vendor A's package amount (`subtotal - discount + tax + shipping`) is refunded to customer wallet.

### 4.2 Customer Cancels Product — COD

```text
Customer Orders ₹1,000 via COD
             │
             ▼
Order.paymentStatus = 'pending', order.walletAmountUsed = 0
Commission created (escrowStatus = 'held')
             │
             ▼
Customer calls PATCH /api/user/orders/:id/cancel
             │
             ▼
cancellationRefundService.processCancellationRefund executes:
   • order.paymentStatus !== 'paid' and walletAmountUsed === 0 → refundAmount = 0
   • No wallet credit issued (creditWallet skipped)
   • No Refund record created
   • Product inventory restored
   • Commission marked 'cancelled'
   • Shipment marked 'cancelled', Driver unassigned
             │
             ▼
ACTUAL FINANCIAL RESULT:
   • Customer receives: ₹0 (correct, as no cash was paid)
   • Delivery Boy receives: ₹0 (no delivery occurred, no payout)
   • Vendor receives: ₹0
   • Platform Commission: ₹0
   • Cancellation Fee: None (₹0)
```

*Note on Partial Wallet + COD:* If customer paid ₹200 from wallet and ₹800 via COD, `order.walletAmountUsed` is ₹200. Line 93 of [`cancellationRefundService.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/services/cancellationRefundService.js#L93) evaluates `order.walletAmountUsed > 0` and **refunds ₹200 to customer wallet**.

### 4.3 Customer Cancels Service — Online Payment

```text
Customer Books Service for ₹2,500 via Razorpay
             │
             ▼
Razorpay captures ₹2,500 cash → SafeFire Merchant Bank Account
ServiceBooking.paymentStatus = 'paid', status = 'confirmed'
(NO Commission record created at booking time)
             │
             ▼
Customer calls PATCH /api/customer/bookings/:id/cancel
             │
             ▼
customerService.controller.js:cancelBooking executes:
   • booking.paymentStatus === 'paid' → refundAmount = ₹2,500
   • refundRef = `SERVICE_CANCEL_REFUND_${booking._id}`
   • creditWallet(userId, ₹2,500, 'cancel_refund')
   • Refund.create({ method: 'wallet_credit', destination: 'wallet', status: 'completed' })
   • ServiceCapacity.updateOne({ bookedCount: -1 })
   • booking.status = 'cancelled', booking.paymentStatus = 'refunded'
             │
             ▼
ACTUAL FINANCIAL RESULT:
   • Customer receives: ₹2,500 in SafeFire UserWallet (CANNOT WITHDRAW)
   • Customer receives back to Bank/UPI/Card: ₹0
   • Razorpay Refund API called: NO (Never called)
   • Vendor receives: ₹0
   • Admin Commission: ₹0
   • Cancellation Window: None (No time-based restriction)
   • Cancellation Fee: None (₹0)
   • In-Progress Vulnerability: Customer can cancel while status is 'in_progress', getting 100% refund.
```

### 4.4 Customer Cancels Service — COD / Wallet

- **COD:** `paymentStatus` is `'pending'`. `refundAmount = 0`. No wallet credit. Capacity slot released. Status set to `'cancelled'`.
- **Wallet:** `paymentStatus` is `'paid'`. `refundAmount = pricing.total`. Full amount credited back to `UserWallet`.

---

## 5. Scenario Analysis: Vendor Cancels

### 5.1 Vendor Cancels Product — Online Payment

```text
Customer Paid ₹3,000 Online for Order (Vendor A = ₹1,000, Vendor B = ₹2,000)
             │
             ▼
Vendor A calls PATCH /api/vendor/orders/:id/status { status: 'cancelled' }
             │
             ▼
vendor/controllers/order.controller.js invokes:
processCancellationRefund({ orderId, vendorGroupId: VendorA.id, cancelledBy: 'vendor' })
             │
             ▼
Execution:
   • targetVendorGroup (Vendor A) marked 'cancelled'
   • calculatedRefund = (subtotal - discount + tax + shipping) for Vendor A (₹1,000)
   • creditWallet(userId, ₹1,000, 'cancel_refund')
   • Refund.create({ referenceId: `PARTIAL_CANCEL_${order._id}_${vendorA._id}`, method: 'wallet_credit' })
   • Product inventory for Vendor A restored
   • Commission for Vendor A marked: status = 'cancelled', escrowStatus = 'cancelled'
   • Shipment for Vendor A cancelled, assigned driver unassigned
   • Vendor B's items, commission, and shipment remain untouched in 'processing'
             │
             ▼
ACTUAL FINANCIAL RESULT:
   • Customer receives: ₹1,000 in SafeFire UserWallet (CANNOT WITHDRAW)
   • Customer receives back to Bank/UPI/Card: ₹0
   • Razorpay Refund API called: NO
   • Vendor A receives: ₹0 (escrow cancelled)
   • Vendor A Penalty: None implemented (₹0)
   • Vendor B receives: Normal payout when delivered
   • Admin Commission: Vendor A's commission reversed; Vendor B's preserved
```

### 5.2 Vendor Cancels Product — COD

- `order.paymentStatus !== 'paid'` and `walletAmountUsed === 0`.
- `calculatedRefund = 0`.
- Customer wallet: ₹0.
- Vendor A items marked `'cancelled'`.
- Vendor A commission marked `'cancelled'`.
- Driver unassigned; no payout issued.
- Vendor penalty: None implemented.

### 5.3 Service Vendor Cancels — Online Payment

```text
Customer Booked Service for ₹1,500 Online (Paid via Razorpay)
             │
             ▼
Vendor calls PATCH /api/vendor/service-bookings/:id/status { status: 'cancelled', cancellationReason: 'Technician unavailable' }
             │
             ▼
vendorBooking.controller.js:updateBookingStatus executes:
   • Validates transition from current status to 'cancelled'
   • Optimistic concurrency lock: findOneAndUpdate({ status: currentStatus })
   • booking.status = 'cancelled'
   • ServiceCapacity slot released (bookedCount - 1)
   • booking.paymentStatus === 'paid' → refundAmount = ₹1,500
   • creditWallet(booking.userId, ₹1,500, 'cancel_refund')
   • Refund.create({ method: 'wallet_credit', destination: 'wallet', status: 'completed' })
   • booking.paymentStatus = 'refunded', booking.refundStatus = 'refunded'
             │
             ▼
ACTUAL FINANCIAL RESULT:
   • Customer receives: ₹1,500 in SafeFire UserWallet (CANNOT WITHDRAW)
   • Customer receives back to Bank/UPI/Card: ₹0
   • Razorpay Refund API called: NO
   • Vendor receives: ₹0
   • Vendor Penalty: None (₹0)
   • Admin Commission: ₹0 (never created)
```

### 5.4 Service Vendor Cancels — COD

- `paymentStatus` is `'pending'`.
- `refundAmount = 0`. No wallet credit.
- Capacity slot released.
- Booking status updated to `'cancelled'`.

---

## 6. Scenario Analysis: Admin Cancellation

### 6.1 Admin Cancels Product Order (Full)

- **Route:** `PATCH /api/admin/orders/:id/status` with `status: 'cancelled'`.
- **Logic:** Lines 174–184 of [`backend/src/modules/admin/controllers/order.controller.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/admin/controllers/order.controller.js#L174-L184).
- **Execution:** Calls `processCancellationRefund({ orderId, cancelledBy: 'admin' })`.
- **Financial Result:**
  - If paid: Full order total credited to customer SafeFire wallet. Razorpay refund NOT called.
  - If COD: ₹0 refunded.
  - Commissions cancelled. Inventory restored. Shipments cancelled.

### 6.2 Admin Override Cancel Vendor Package (Partial)

- **Route:** `PATCH /api/admin/orders/:id/items/:vendorItemId/cancel`.
- **Logic:** Lines 393–568 of [`admin/controllers/order.controller.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/admin/controllers/order.controller.js#L393-L568).
- **CRITICAL FLAW FOUND:** If `forceRefund: true` or order is paid, customer wallet is credited `calculatedRefund`. Lines 500–515 set `Commission.status = 'cancelled'`. However, **if the escrow was already released to the vendor wallet (order was previously delivered), the vendor wallet balance is NOT debited**. The vendor keeps the payout, customer gets the refund, and the platform absorbs the financial loss.

### 6.3 Admin Service Booking Cancellation

- **Route:** **NONE IMPLEMENTED.**
- [`adminBooking.controller.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/admin/controllers/adminBooking.controller.js) contains only `getAllBookings` and `getAdminBookingById`. An administrator cannot cancel a service booking from the admin panel.

---

## 7. Forensic Verification of the Service Marketplace Financial Gap

We independently verified the finding from the previous service audit against the active codebase:

| Question | Forensic Verdict | Code Proof & Analysis |
| :--- | :--- | :--- |
| 1. Is service online payment actually implemented? | **YES** | Implemented via `createRazorpayOrder` in [`customerService.controller.js:526`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/customer/controllers/customerService.controller.js#L526). |
| 2. Is Razorpay order creation implemented? | **YES** | `rzpOrder = await createRazorpayOrder(total, 'INR', booking.bookingId, ...)` generates real Razorpay orders. |
| 3. Is Razorpay signature verification implemented? | **YES** | `verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)` in [`customerService.controller.js:571`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/customer/controllers/customerService.controller.js#L571). |
| 4. Is money actually captured? | **YES** | Verified through Razorpay cryptographic HMAC signature check and delegated to `processCapturedPayment`. |
| 5. Is `paymentStatus: 'paid'` merely set by application logic? | **PARTIALLY FIXED, BUT NEW P0 EXPLOIT FOUND** | In checkout, it is set only after verification. **HOWEVER**, in [`vendorBooking.controller.js:257`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/vendor/controllers/vendorBooking.controller.js#L257), a vendor can mark an unpaid online booking as `completed`, and the server automatically credits `vendorEarnings` into the vendor's wallet without validating that `paymentStatus === 'paid'`. |
| 6. Does cancellation attempt a refund? | **WALLET ONLY** | Refunds strictly to customer wallet. Does not attempt Razorpay refund. |
| 7. Could the system mark a booking paid without receiving money? | **YES (VULNERABILITY)** | If customer creates an online booking and abandons payment, vendor can advance to `completed` and receive real platform payout. |
| 8. Could the system attempt a refund for a payment that does not exist? | **NO** | Both customer and vendor cancellation explicitly check `if (booking.paymentStatus === 'paid')` before issuing wallet refund. |

---

## 8. Comprehensive Inventory of All Refund Implementations

Every refund-related code block across the entire backend:

| Function | File | Line | Invoked By | Payment Type | Amount | Destination | Calling Razorpay? | Reachable from Cancellation? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :---: | :---: |
| `creditWallet` | [`wallet.service.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/services/wallet.service.js#L43) | 43 | Cancellation & Return Services | All | Variable | Customer `UserWallet` | **NO** | **YES** (Core of all cancellations) |
| `processCancellationRefund` | [`cancellationRefundService.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/services/cancellationRefundService.js#L39) | 39 | Order Controllers (User, Vendor, Admin) | Online & Wallet | Full order total or package total | Customer `UserWallet` | **NO** | **YES** (Products) |
| `cancelBooking` | [`customerService.controller.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/customer/controllers/customerService.controller.js#L654) | 654 | Customer API | Online & Wallet | `booking.pricing.total` | Customer `UserWallet` | **NO** | **YES** (Customer Services) |
| `updateBookingStatus` | [`vendorBooking.controller.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/vendor/controllers/vendorBooking.controller.js#L297) | 297 | Vendor API | Online & Wallet | `booking.pricing.total` | Customer `UserWallet` | **NO** | **YES** (Vendor Services) |
| `adminOverrideCancelVendorItem` | [`order.controller.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/admin/controllers/order.controller.js#L471) | 471 | Admin API | Online & Wallet | Package total | Customer `UserWallet` | **NO** | **YES** (Admin Product Partial) |
| `initiateRefund` | [`paymentProcessor.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/services/paymentProcessor.js#L248) | 248 | Payment Processor (Stock Exhaustion) | Online | Online portion of paid order | **Razorpay Original Source** | **YES** | **NO** (Only on stock failure at checkout) |
| `initiateRefund` | [`shipmentCancelled.listener.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/events/listeners/shipmentCancelled.listener.js#L106) | 106 | `SHIPMENT_CANCELLED` Event | Online | `order.total` | **Razorpay Original Source** | **YES** | **NO** (Dead path: `ownFleet.provider.js:316` hardcodes `refundRequired: false`) |
| `initiateRefund` | [`order.controller.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/user/controllers/order.controller.js#L28) | 28 | Dead Import | N/A | N/A | N/A | N/A | **NO** (Imported at line 28, never called) |
| `initiateRefund` | [`webhook.controller.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/user/controllers/webhook.controller.js#L15) | 15 | Dead Import | N/A | N/A | N/A | N/A | **NO** (Imported at line 15, never called) |
| `initiateRefund` | [`return.controller.js` (Vendor)](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/vendor/controllers/return.controller.js#L17) | 17 | Dead Import | N/A | N/A | N/A | N/A | **NO** (Imported at line 17, never called) |
| `initiateRefund` | [`return.controller.js` (Admin)](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/admin/controllers/return.controller.js#L14) | 14 | Dead Import | N/A | N/A | N/A | N/A | **NO** (Imported at line 14, never called) |

---

## 9. Customer Wallet vs. Razorpay Refund Trace

### 9.1 Customer Wallet Refunds
- **Wallet Model:** [`UserWallet.model.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/models/UserWallet.model.js) (`balance`, `totalCredits`, `totalDebits`).
- **Transaction Model:** [`WalletTransaction.model.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/models/WalletTransaction.model.js) (`type: 'credit'`, `transactionType: 'cancel_refund'`, `reference`).
- **Refund Model:** [`Refund.model.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/models/Refund.model.js) (`method: 'wallet_credit'`, `destination: 'wallet'`, `status: 'completed'`).
- **Atomicity in Products:** Guaranteed via Mongoose transaction session in `cancellationRefundService.js`.
- **Atomicity in Services:** **NOT GUARANTEED.** Missing session in `customerService.controller.js`.
- **Customer Withdrawal:** **IMPOSSIBLE.** No withdrawal route or controller exists for customers.

### 9.2 Razorpay Refunds
- **Service Function:** [`initiateRefund`](file:///d:/Appzeto_Projects/safe-fire/backend/src/services/payment.service.js#L80) calls `razorpay.payments.refund(razorpayPaymentId, { amount: Math.round(amountInRupees * 100) })`.
- **Reachability from Cancellation:** **0% REACHABLE.**
- **Consequence:** Razorpay is never instructed to return funds to customer credit cards, debit cards, bank accounts, or UPI handles during cancellation.

---

## 10. Vendor Wallet, Escrow, and Commission Mechanics

### 10.1 Product Orders
1. **Creation:** When order payment is captured, commissions are inserted with `escrowStatus: 'held'`, `status: 'pending'`. Vendor wallet balance is **not** credited.
2. **Cancellation before Delivery:** `cancellationRefundService.js` sets `Commission.status = 'cancelled'`, `Commission.escrowStatus = 'cancelled'`. Vendor receives ₹0.
3. **Escrow Release (Cron):** [`escrowCron.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/cron/escrowCron.js#L88-L135) releases funds only if order is `delivered`, 7 days have elapsed, COD cash is settled (`order.isCashSettled: true`), and no return request exists.
4. **Cancellation after Payout:** If Admin forces cancellation after escrow release, vendor wallet is not debited.

### 10.2 Service Bookings
1. **Creation:** No commission or escrow record is created when a service booking is placed or paid.
2. **Cancellation before Completion:** Customer gets wallet refund. Vendor gets ₹0. Commission is never created.
3. **Completion:** When vendor marks booking `completed`, [`vendorBooking.controller.js:202-277`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/vendor/controllers/vendorBooking.controller.js#L202-L277) **immediately credits `vendorEarnings` into the vendor's wallet balance**. There is zero escrow holding window.

---

## 11. Delivery Payout Mechanics

- **Payout Trigger:** Delivery partner earnings are processed strictly in [`deliveryPayout.service.js:processDeliveryBoyPayout`](file:///d:/Appzeto_Projects/safe-fire/backend/src/services/deliveryPayout.service.js#L13) upon **successful delivery OTP verification**.
- **Cancellation before Pickup:** Delivery boy is unassigned via `cancelShipmentDeliveryAssignment`. Payout is ₹0.
- **Cancellation after Pickup:** If Admin cancels while order is in `shipped` status, `cancelShipmentDeliveryAssignment` unassigns driver and sets shipment to `'cancelled'`. Driver receives ₹0 payout.
- **Physical Goods Risk:** When Admin cancels in `shipped` status, no reverse logistics or vendor return task is dispatched to the driver. The physical product is orphaned with the driver.

---

## 12. Multi-Vendor Order Partial Cancellation

Scenario: Order total ₹3,000 (Vendor A = ₹1,000, Vendor B = ₹2,000). Vendor A cancels:
1. **Customer Refund:** Exact calculation for Vendor A (`subtotal - discount + tax + shipping` = ₹1,000) is credited to customer wallet.
2. **Vendor B Status:** Vendor B's items and status remain active.
3. **Vendor A Commission:** Cancelled (`status = 'cancelled'`, `escrowStatus = 'cancelled'`).
4. **Vendor B Commission:** Completely untouched.
5. **Top-Level Status:** `order.status` remains `processing` (or dynamic shipment status).
6. **Accounting Consistency:** Clean split per vendor package.

---

## 13. Idempotency & Duplicate Refund Protection

| Cancellation Flow | Sequential Duplicate Protection | Concurrent Race Condition Protection | Risk Level |
| :--- | :---: | :---: | :---: |
| **Product — Customer Full** | ✅ Protected (`order.status` check) | ✅ Protected (Mongoose session + unique `Refund.referenceId`) | **NONE** |
| **Product — Customer Item** | ✅ Protected (`targetVendorGroup.status` check) | ✅ Protected (Mongoose session + unique `Refund.referenceId`) | **NONE** |
| **Product — Vendor Item** | ✅ Protected (`transitionMap` & skip guard in service) | ✅ Protected (Mongoose session + unique `Refund.referenceId`) | **NONE** |
| **Product — Admin Override** | ✅ Protected (`targetVendorGroup.status` check) | ✅ Protected (Mongoose session + unique `Refund.referenceId`) | **NONE** |
| **Service — Customer Cancel** | ✅ Protected (`booking.status` check) | ❌ **VULNERABLE** (No Mongoose session; `wallet.balance` saved before duplicate reference error) | **P0** |
| **Service — Vendor Cancel** | ✅ Protected (Optimistic lock `findOneAndUpdate({ status: currentStatus })`) | ✅ Protected by atomic query filter | **LOW** |

---

## 14. Notification Flow Analysis

| Scenario | Customer Notified? | Vendor Notified? | Admin Notified? | Delivery Boy Notified? | Channel / Notes |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Customer Cancels Product** | ✅ YES | ✅ YES | ❌ NO | ✅ YES (if assigned) | In-app DB notification + FCM push + Socket |
| **Customer Cancels Package** | ✅ YES | ✅ YES | ❌ NO | ✅ YES (if assigned) | In-app DB notification + FCM push + Socket |
| **Vendor Cancels Product Item** | ❌ **NO** | ❌ NO | ❌ NO | ✅ YES (if assigned) | **MISSING:** Only websocket broadcast. Customer receives no DB notification or push alert! |
| **Admin Cancels Product Order** | ❌ **NO** | ❌ NO | ❌ NO | ✅ YES (if assigned) | **MISSING:** Skips notification block because of early return at line 183. |
| **Admin Overrides Package** | ✅ YES | ❌ NO | ❌ NO | ✅ YES (if assigned) | Customer notified. Affected vendor is NOT notified! |
| **Customer Cancels Service** | ✅ YES | ✅ YES | ❌ NO | N/A | In-app DB notification + FCM push. |
| **Vendor Cancels Service** | ✅ YES | ❌ NO | ❌ NO | N/A | In-app DB notification (does not state refund was issued) + Socket. |

---

## 15. Complete Money-Flow Matrix

| Scenario | Payment Method | Who Cancels | Customer Money Destination | Refund Method | Vendor Money | Commission Ledger | Delivery Payout | Status Verdict |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :---: |
| **Product** | Online | Customer | **SafeFire UserWallet** | `wallet_credit` | ₹0 (escrow cancelled) | Reversed (`cancelled`) | ₹0 (unassigned) | **GAP** (No Razorpay refund) |
| **Product** | Online | Vendor | **SafeFire UserWallet** | `wallet_credit` | ₹0 (escrow cancelled) | Reversed (`cancelled`) | ₹0 (unassigned) | **GAP** (No Razorpay refund) |
| **Product** | COD | Customer | ₹0 (None paid) | N/A | ₹0 | Reversed (`cancelled`) | ₹0 (unassigned) | **PASS** |
| **Product** | COD | Vendor | ₹0 (None paid) | N/A | ₹0 | Reversed (`cancelled`) | ₹0 (unassigned) | **PASS** |
| **Service** | Online | Customer | **SafeFire UserWallet** | `wallet_credit` | ₹0 | Reversed / None | N/A | **GAP** (No Razorpay refund) |
| **Service** | Online | Vendor | **SafeFire UserWallet** | `wallet_credit` | ₹0 | Reversed / None | N/A | **GAP** (No Razorpay refund) |
| **Service** | COD | Customer | ₹0 (None paid) | N/A | ₹0 | None | N/A | **PASS** |
| **Service** | COD | Vendor | ₹0 (None paid) | N/A | ₹0 | None | N/A | **PASS** |

---

## 16. Exact Money Ledger Diagrams

### Diagram 1: Customer Cancels Online Product Order

```text
CUSTOMER PAYS ₹1,000 ONLINE
           │
           ▼
       Razorpay
           │
           ▼
 Payment Captured (₹1,000 cash in SafeFire Bank Account)
           │
           ▼
 Order Created (SafeFire DB)
           ├── Vendor Pending Escrow: ₹800 (escrowStatus: 'held')
           └── Platform Commission:   ₹200 (status: 'pending')
           │
           ▼
    CUSTOMER CANCELS
           │
           ▼
   ACTUAL CODE EXECUTION
           ├── Razorpay API:    NOT CALLED (₹1,000 stays in SafeFire Bank)
           ├── Customer Wallet: Credited +₹1,000 (UserWallet.balance)
           ├── Vendor Escrow:   Commission.escrowStatus = 'cancelled' (₹0 payout)
           └── Commission:      Commission.status = 'cancelled' (₹0 profit)
```

### Diagram 2: Vendor Cancels Online Product Package

```text
CUSTOMER PAID ₹1,000 ONLINE FOR VENDOR A PACKAGE
           │
           ▼
 SafeFire Bank Holds ₹1,000
 Vendor A Escrow Held: ₹800
           │
           ▼
   VENDOR A CANCELS
           │
           ▼
   ACTUAL CODE EXECUTION
           ├── Razorpay API:    NOT CALLED (₹1,000 stays in SafeFire Bank)
           ├── Customer Wallet: Credited +₹1,000 (UserWallet.balance)
           ├── Vendor A Wallet: ₹0 (No penalty, no earnings)
           └── Commission A:    Commission.status = 'cancelled'
```

### Diagram 3: Customer Cancels Online Service Booking

```text
CUSTOMER PAYS ₹2,000 ONLINE FOR SERVICE
           │
           ▼
       Razorpay
           │
           ▼
 Payment Captured (₹2,000 cash in SafeFire Bank Account)
 ServiceBooking: paymentStatus = 'paid', status = 'confirmed'
 (Zero commission, zero escrow records created)
           │
           ▼
    CUSTOMER CANCELS
           │
           ▼
   ACTUAL CODE EXECUTION
           ├── Razorpay API:    NOT CALLED (₹2,000 stays in SafeFire Bank)
           ├── Customer Wallet: Credited +₹2,000 (UserWallet.balance)
           ├── Vendor Wallet:   ₹0 (Vendor gets nothing)
           └── Capacity:        Daily slot released (+1 available)
```

### Diagram 4: Unpaid Online Service Booking Exploit

```text
CUSTOMER INITIATES ONLINE BOOKING FOR ₹2,000
           │
           ▼
Customer ABANDONS payment at Razorpay modal
           │
           ▼
ServiceBooking created: paymentStatus = 'pending', status = 'pending'
           │
           ▼
Vendor sees booking in dashboard and clicks:
'Confirm' → 'In Progress' → 'Completed'
           │
           ▼
vendorBooking.controller.js lines 202-277:
   • Checks: isCod = (paymentMethod === 'cod') → FALSE
   • ASSUMES SAFEFIRE RECEIVED ₹2,000 ONLINE!
   • Calculates: commission = ₹300, vendorEarnings = ₹1,700
   • Credits Vendor Wallet: Vendor.walletBalance += ₹1,700
           │
           ▼
FINANCIAL OUTCOME:
   • Customer paid:  ₹0
   • SafeFire holds: ₹0
   • Vendor gets:    ₹1,700 of SafeFire's money! (P0 EXPLOIT)
```

---

## 17. Financial Risk Classification

### P0 — Critical Financial Risks

1. **Zero Real-Money Refund on Online Cancellations:**
   Customers who pay via UPI / NetBanking / Cards never receive their money back to their bank accounts upon cancellation. All refunds are forced into internal digital wallet credits with no customer withdrawal capability.
2. **Unpaid Service Booking Payout Vulnerability:**
   Vendors can complete online service bookings that were never paid (`paymentStatus: 'pending'`), causing the backend to credit `vendorEarnings` into the vendor's wallet from platform funds.
3. **Concurrent Service Booking Cancellation Race Condition:**
   `cancelBooking` in `customerService.controller.js` lacks MongoDB transaction session isolation, permitting concurrent requests to double-credit customer wallet balances.

### P1 — High Financial Risks

1. **Admin Override Cancel After Escrow Release:**
   Admin cancellation of a delivered package via `adminOverrideCancelVendorItem` fails to claw back or debit the vendor's wallet for earnings already released, producing a double payout.
2. **Customer Service Cancellation In-Progress:**
   Customers can cancel service bookings while in `in_progress` status for a 100% refund, leaving vendors uncompensated for work already performed.
3. **Orphaned Physical Inventory on Shipped Order Cancellation:**
   When Admin cancels an order in `shipped` status, the shipment is cancelled and the driver unassigned without creating a return-to-vendor task, leading to physical loss of goods.

### P2 — Medium Financial & Operational Risks

1. **Silent Vendor Product Cancellation:**
   Vendor package cancellation does not create an in-app database notification or push notification for the customer.
2. **Silent Admin Product Cancellation:**
   Full order cancellation by Admin returns early, bypassing customer and vendor notification dispatch.
3. **Partial Cancellation Order Total Desynchronization:**
   Partial package cancellation does not decrement `order.total` or update `order.paymentStatus` to `'partially_refunded'`.

### P3 — Low Risks

1. Notification on vendor service cancellation does not mention that a refund was issued to the user's wallet.
2. Dead imports of `initiateRefund` left in `order.controller.js`, `webhook.controller.js`, and return controllers.

---

## 18. Exact Source Code References

| Area | File Path | Lines | Function / Symbol |
| :--- | :--- | :--- | :--- |
| **Product Cancel Service** | [`backend/src/services/cancellationRefundService.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/services/cancellationRefundService.js#L39-L391) | 39–391 | `processCancellationRefund` |
| **Customer Product Cancel** | [`backend/src/modules/user/controllers/order.controller.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/user/controllers/order.controller.js#L907-L984) | 907–984 | `cancelOrder` |
| **Customer Item Cancel** | [`backend/src/modules/user/controllers/order.controller.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/user/controllers/order.controller.js#L987-L1070) | 987–1070 | `cancelVendorItem` |
| **Vendor Product Cancel** | [`backend/src/modules/vendor/controllers/order.controller.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/vendor/controllers/order.controller.js#L223-L270) | 223–270 | `updateOrderStatus` |
| **Admin Product Cancel** | [`backend/src/modules/admin/controllers/order.controller.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/admin/controllers/order.controller.js#L161-L185) | 161–185 | `updateOrderStatus` |
| **Admin Override Cancel** | [`backend/src/modules/admin/controllers/order.controller.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/admin/controllers/order.controller.js#L393-L568) | 393–568 | `adminOverrideCancelVendorItem` |
| **Customer Service Cancel** | [`backend/src/modules/customer/controllers/customerService.controller.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/customer/controllers/customerService.controller.js#L654-L772) | 654–772 | `cancelBooking` |
| **Vendor Service Cancel** | [`backend/src/modules/vendor/controllers/vendorBooking.controller.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/vendor/controllers/vendorBooking.controller.js#L123-L384) | 123–384 | `updateBookingStatus` |
| **Vendor Unpaid Exploit** | [`backend/src/modules/vendor/controllers/vendorBooking.controller.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/vendor/controllers/vendorBooking.controller.js#L202-L277) | 202–277 | `updateBookingStatus` (completion block) |
| **Core Wallet Credit** | [`backend/src/services/wallet.service.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/services/wallet.service.js#L43-L165) | 43–165 | `creditWallet` |
| **Razorpay Refund Def** | [`backend/src/services/payment.service.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/services/payment.service.js#L80-L93) | 80–93 | `initiateRefund` |
| **Escrow Release Cron** | [`backend/src/cron/escrowCron.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/cron/escrowCron.js#L27-L200) | 27–200 | `_runEscrowRelease` |
| **Delivery Payout Service** | [`backend/src/services/deliveryPayout.service.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/services/deliveryPayout.service.js#L13-L125) | 13–125 | `processDeliveryBoyPayout` |
| **Shipment Cancel Method** | [`backend/src/services/assignmentService.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/services/assignmentService.js#L832-L874) | 832–874 | `cancelShipmentDeliveryAssignment` |

---

## 19. Recommended Architectural Fixes (Recommendations Only — NOT Implemented)

1. **Implement Dual-Mode Refund Choice (Original Payment Source vs. Wallet):**
   - Provide customer with option: "Refund to SafeFire Wallet (Instant)" or "Refund to Original Payment Method (5-7 business days via Razorpay)".
   - When original source is chosen, lookup `PaymentAttempt.razorpayPaymentId` and call `initiateRefund(razorpayPaymentId, refundAmount)`.
2. **Prevent Vendor Progression of Unpaid Online Service Bookings:**
   - In `vendorBooking.controller.js`, enforce:
     ```javascript
     if (booking.paymentMethod !== 'cod' && booking.paymentStatus !== 'paid' && targetStatus !== 'cancelled') {
         throw new ApiError(400, 'Cannot confirm or advance booking until online payment has been captured.');
     }
     ```
3. **Wrap Service Cancellation in MongoDB Transaction Session:**
   - Ensure `customerService.controller.js:cancelBooking` executes inside `session.withTransaction()` so wallet credits and refund records commit atomically.
4. **Disallow Service Cancellation When `in_progress`:**
   - Update guard to: `if (['in_progress', 'completed', 'cancelled'].includes(booking.status)) throw new ApiError(400, 'Cannot cancel a booking that is in progress or completed.');`
5. **Implement Admin Escrow Clawback:**
   - In `adminOverrideCancelVendorItem`, if `targetVendorGroup.escrowStatus === 'released'`, automatically debit the vendor's wallet balance (`Vendor.findByIdAndUpdate(vendorId, { $inc: { walletBalance: -vendorEarnings } })`) and record a `VendorWalletTransaction` of type `CLAWBACK`.
6. **Add Missing Notifications:**
   - Dispatch customer notifications when vendor cancels product items or admin cancels orders.
7. **Implement Admin Service Booking Cancellation:**
   - Expose `PATCH /api/admin/service-bookings/:id/cancel` in `adminBooking.controller.js`.

---

## 20. Plain-English Answers to the 12 Critical Questions

### 1. If a customer pays online for a product and then cancels, exactly where does their money go?
The customer's real fiat money (rupees) **remains in SafeFire's Razorpay merchant account / bank account**. The customer receives an internal digital credit to their **SafeFire User Wallet**. It does NOT go back to their bank, card, or UPI. Furthermore, because SafeFire has no customer withdrawal functionality, the customer cannot withdraw this money and can only spend it on future SafeFire purchases.

### 2. If a seller cancels a product after the customer has already paid online, exactly where does the customer's money go?
The money goes to the customer's **SafeFire User Wallet** as a digital credit. SafeFire does not invoke Razorpay's refund API, so the customer's bank account receives ₹0. The seller receives ₹0 (their escrowed earnings are cancelled).

### 3. If a customer pays online for a service and then cancels, exactly where does their money go?
The money goes into the customer's **SafeFire User Wallet** as a digital balance credit. The real money stays in SafeFire's bank account.

### 4. If a service vendor cancels after the customer has already paid online, exactly where does the customer's money go?
The money goes into the customer's **SafeFire User Wallet**. Razorpay refund is NOT called. The service vendor receives ₹0.

### 5. If a COD order is cancelled, is there any money movement?
**No.** For pure COD orders, `refundAmount` is ₹0. No wallet credit is issued, no payment gateway is called, no vendor wallet is debited, and the delivery boy receives ₹0. If the customer had paid a partial deposit using their wallet at checkout, only that wallet portion is credited back to their wallet.

### 6. Does SafeFire actually call Razorpay's refund API anywhere in these cancellation flows?
**NO.** SafeFire **never** calls Razorpay's refund API (`payments.refund` or `initiateRefund`) in any customer, vendor, or admin cancellation flow. The only places `initiateRefund` is called in the entire codebase are on checkout stock-exhaustion failure in `paymentProcessor.js` and in a dead event listener.

### 7. Can a customer/vendor cancellation result in money being retained incorrectly?
**YES.**
- SafeFire retains 100% of real customer fiat cash in its bank while giving customers non-withdrawable digital app credits.
- If an admin overrides/cancels an order after escrow has been released to a vendor, the vendor retains their payout in their wallet while the customer is also refunded, resulting in double payout.

### 8. Can the same cancellation/refund request refund the customer twice?
- **Product cancellation:** **Protected.** Product flows use atomic Mongoose transactions and unique reference keys on `Refund.referenceId` and `WalletTransaction.reference`.
- **Service cancellation:** **Vulnerable under concurrency.** Customer service cancellation does NOT use a MongoDB transaction session. Two simultaneous requests can increment `wallet.balance` twice before hitting a duplicate-key error.

### 9. Does vendor cancellation correctly reverse seller earnings and commission?
- **For products:** **YES.** Commission and escrow are marked `'cancelled'`. The escrow cron will not pay the vendor.
- **For services:** **YES** (because commission/earnings are only created upon completion; before completion, vendor has ₹0).

### 10. Does service cancellation have the same financial protection as product cancellation?
**NO.** Product cancellation is executed by a centralized service (`cancellationRefundService.js`) running inside a Mongoose transaction session with inventory restoration, coupon restoration, shipment cancellation, and commission reversal. Service cancellation is an isolated controller function lacking database transactions, lacking an admin cancellation interface, and vulnerable to race conditions.

### 11. Is the current Service online-payment implementation actually processing real money, or is it only setting `paymentStatus = paid`?
The current checkout implementation **is processing real money through Razorpay** (it generates Razorpay order IDs and verifies cryptographic HMAC signatures before capture). **HOWEVER, there is a critical vulnerability:** A vendor can manually advance an unpaid online booking (`paymentStatus: 'pending'`) to `completed`, causing SafeFire to pay out `vendorEarnings` into the vendor's wallet from platform funds without ever receiving money from the customer.

### 12. What MUST be fixed before we can safely call Product + Service cancellation financially production-ready?
1. **Implement Razorpay Refund Integration:** Offer customers the ability to refund back to their original payment method via `initiateRefund(razorpayPaymentId, amount)`.
2. **Block Progression of Unpaid Service Bookings:** Add a strict check preventing vendors from confirming or completing online service bookings where `paymentStatus !== 'paid'`.
3. **Transaction Session for Service Cancellation:** Wrap `cancelBooking` in a MongoDB client transaction session.
4. **Prevent Service Cancellation In-Progress:** Block customer cancellation once the booking status is `in_progress`.
5. **Vendor Wallet Clawback on Admin Cancellation:** Debit vendor wallets if an admin cancels an item whose escrow was already released.
6. **Customer Notifications:** Dispatch proper DB and push notifications when vendors or admins cancel product packages.
