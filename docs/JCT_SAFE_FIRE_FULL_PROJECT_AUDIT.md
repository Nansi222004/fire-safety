# JCT SafeFire: Full Project Audit (Financial Accuracy & System Integrity)

**Date:** 10 Nov 2026
**Branch:** `main` (base commit `508b2fb`, plus uncommitted working-tree changes)
**Method:** I read the source code and traced checkout, payment, cancellation, return, escrow, wallet and reporting from end to end. I ran tests against a throwaway local MongoDB replica set. **No production or staging data was read or modified.** No `.env` values appear in this report.

> **How to read this report.** **Confirmed** means I reproduced the problem with a failing test, or the code path makes it certain (for example, a variable that is out of scope). **Suspected** means the code strongly suggests a problem that I did not execute. **BUSINESS RULE CONFIRMATION REQUIRED** means the code may be doing what was intended, and only the business can decide.

---

## 1. Executive Summary

The core pricing engine (`calculateOrderFinancials`) is sound: it splits coupons pro rata, reconciles vendor totals to the order total, and handles tax-inclusive and tax-exclusive pricing correctly. **Most of the money errors I found are in code that feeds that engine or recomputes its results by another route:**

| # | Finding | Severity | Status |
|---|---|---|---|
| F-01 | Live checkout charged the **base product price** for variant items. Example: a ₹2,500 variant was billed at ₹1,000. Variant stock was never checked or decremented for COD orders. | CRITICAL | **Fixed + test** |
| F-02 | Live checkout coupons: no `maxDiscount` cap, and coupons **with no expiry date were silently dropped**. The start-date and usage-limit rules were also skipped. The cart preview applied all of these rules, so the customer saw one price and was charged another. | CRITICAL | **Fixed + test** |
| F-03 | Payment retry created a Razorpay order for the **full total** even when part was already paid from the wallet, so the customer was charged twice for that part. | CRITICAL | **Fixed** |
| F-04 | User wallet credit and debit were read-modify-write. Outside a transaction, **10 of 10** concurrent ₹300 debits succeeded on a ₹1,000 wallet. | CRITICAL | **Fixed + test (fails on old code)** |
| F-05 | Admin return completion referenced an undeclared `refund` variable whenever escrow had been released, so the whole transaction threw and rolled back. | HIGH | **Fixed** |
| F-06 | After escrow release, partial returns clawed back **₹0** from the vendor because the code compared a stale commission record with itself. | HIGH | **Fixed** |
| F-07 | Vendor-side return completion always debited `onHoldBalance`, even after the earnings had moved to `walletBalance`. | HIGH | **Fixed** |
| F-08 | Package refund and COD amounts used `subtotal − discount + tax + shipping`, which **counts GST twice** for tax-inclusive products. This affected 5 places. | HIGH | **Fixed + test** |
| F-09 | Full cancellation of a mixed wallet + Razorpay order asked Razorpay to refund the full total (more than it captured), so the wallet share was never returned. | HIGH | **Fixed + test** |
| F-10 | Admin revenue, sales, finance summary and top products counted `payment_pending`, `payment_failed` and fully `returned` orders as revenue. | HIGH | **Fixed** |
| F-11 | Customer return refunds excluded the GST the customer paid, while cancellation refunds included it. | HIGH | **Fixed after business decision 1A** (§13C) |
| F-12 | `Order.subtotal` meant different things depending on the checkout path, so invoices and order pages subtracted the discount twice. | MEDIUM | **Fixed for new orders** |

**Overall:** I fixed the confirmed critical issues on the main checkout, payment and wallet paths. Many modules were only partly audited (§13). This is a deep audit of the money paths, not a line-by-line review of all ~900 source files.

---

## 2. Project Architecture

### Applications
| App | Path | Stack |
|---|---|---|
| Backend API | `backend/` | Node 24, Express 4, Mongoose 8 (MongoDB, needs a replica set for transactions), Socket.io, Razorpay, Firebase Admin (FCM), Cloudinary, Nodemailer |
| Frontend SPA | `frontend/` | React 18, Vite, Zustand, Recharts, Tailwind; deployed on Vercel (`vercel.json`) |

### Panels (frontend `src/modules/*`, backend `src/modules/*`)
| Panel | Frontend | Backend route prefix | Role |
|---|---|---|---|
| Customer storefront | `UserApp`, `Explore` | `/api/user`, `/api/customer`, `/api/gift-cards`, public `/api` | `customer` |
| Admin | `Admin`, `AdminApp` | `/api/admin`, `/api/admin/gift-cards` | `admin`/`superadmin` |
| Vendor (retail seller and service partner) | `Vendor` | `/api/vendor` | `vendor` |
| Wholesaler (B2B seller, separate account type) | `Wholesaler` | `/api/wholesaler` | `wholesaler` |
| Delivery rider | `Delivery` | `/api/delivery` | `delivery` |
| Fire-safety inspector | `Worker` | `/api/worker` | `worker` |
| Support / collaboration | (inside the panels above) | `src/modules/support` | mixed |

### Authentication and authorization
- JWT access token (15 min) and refresh token (7 days), `config/jwt.js`. `authenticate` → `authorize(role)` → `enforceAccountStatus`, which re-checks account state on **every** request, so a suspended account cannot keep using an old token.
- Vendor capabilities (`requireVendorCapability`) gate product and service actions. Wholesaler accounts are kept separate from retail vendors.

### Financial modules
| Concern | Location |
|---|---|
| Order pricing engine | `services/financial.service.js` (`calculateOrderFinancials`, new `getVendorGroupPayable`) |
| Checkout (live) | `modules/user/controllers/payment.controller.js` → `initializePayment` (COD, wallet, Razorpay) |
| Checkout (legacy) | `modules/user/controllers/order.controller.js` → `placeOrder` (`POST /api/user/orders`; the UI now uses `/payment/initialize` for every method; `orderStore.createOrder` still points at the legacy route) |
| Payment capture | `services/paymentProcessor.js` (webhook and direct verify share one idempotent processor) |
| Cancellation refunds | `services/cancellationRefundService.js`; admin has its own copy in `admin/controllers/order.controller.js` |
| Returns and exchanges | `admin/controllers/return.controller.js`, `vendor/controllers/return.controller.js`, `services/exchange*.js`, `services/reverseEngine.service.js` |
| Commission / escrow | `models/Commission.model.js`, `services/orderFinancialHelper.js`, `cron/escrowCron.js` |
| Vendor wallet / withdrawals | `vendor/controllers/wallet.controller.js`, `admin/controllers/escrow.controller.js`, `models/VendorWalletTransaction.model.js` |
| Customer wallet | `services/wallet.service.js`, `cron/walletCron.js`, `admin/controllers/customerWallet.controller.js` |
| Gift cards | `services/giftCard.service.js` (1,063 lines) |
| Delivery payouts / COD cash | `services/payoutCalculator.service.js`, `deliveryPayout.service.js`, `admin/controllers/delivery.controller.js`, `courierRemittance.controller.js` |
| Services marketplace | `customer/controllers/customerService.controller.js`, `serviceBookingFlow.service.js` |
| Reports | `admin/controllers/analytics.controller.js`, `report.controller.js`; `vendor/controllers/analytics.controller.js` |

### Background jobs (started in `server.js` with `setInterval`, every 24 h and once at boot)
1. `releaseEscrowPayments` (escrow → vendor wallet, 7 days after delivery)
2. `expirePromotionalBalances` (promo wallet credit expiry)
3. `expireOverdueGiftCards`
4. `initAssignmentScheduler` (delivery assignment)

### Integrations
Razorpay (orders, refunds, webhooks), Shiprocket and Delhivery (shipping, reverse pickups, webhooks), Firebase FCM, Cloudinary, SMTP.

---

## 3. Financial Audit

### 3.1 Pricing engine: `calculateOrderFinancials` (`financial.service.js`)
| Step | Formula in code | Verdict |
|---|---|---|
| Line subtotal | `price × qty`, rounded to 2 dp | Correct |
| Coupon cap | `min(coupon, originalSubtotal)` | Correct |
| Vendor coupon share | `coupon × vendorSubtotal / originalSubtotal`; the last vendor gets the remainder | Correct; reconciles exactly (tested) |
| Item coupon share | same method within each vendor | Correct |
| Tax, exclusive | `discountedLine × rate / 100` | Correct |
| Tax, inclusive | `base = discountedLine / (1 + rate)`, `tax = discountedLine − base` | Correct |
| Discount vs tax order | discount is applied **before** tax | Correct for GST (the transaction value is net of discount) |
| Commission | `base × commissionRate`; for inclusive items `base` excludes tax | Correct |
| Vendor earnings | `base − commission + tax` (GST passes through to the vendor) | **BUSINESS RULE CONFIRMATION REQUIRED**: assumes the vendor remits GST; shipping is never part of vendor earnings |
| Final line total | `discountedLine + (inclusive ? 0 : tax) + shippingShare` | Correct |
| `taxableAmount` | was `discountedSubtotal`; for inclusive items that **includes** GST | **Fixed**: now `Σ baseAmount` (GST taxable value) |
| Default tax rate | `item.taxRate !== undefined ? taxRate : 18` | OK; `null` becomes 0 (see F-14) |

### 3.2 Recomputations outside the engine (the source of most bugs)
| Location | Formula | Problem | Status |
|---|---|---|---|
| `cancellationRefundService.js` partial cancel | `subtotal − discount + tax + shipping` | double GST for inclusive items | **Fixed** → `getVendorGroupPayable` |
| `admin/controllers/order.controller.js` admin partial cancel | same | same | **Fixed** |
| `admin/controllers/courierRemittance.controller.js` `shipmentCodAmount` | same | wrong expected COD amount, so remittance shortfalls are mis-flagged | **Fixed** |
| `paymentProcessor.js` commission `vendorTotalPaidByCustomer` | same | wrong snapshot on Razorpay-paid orders | **Fixed** |
| `vendor/controllers/customer.controller.js` customer spend | same | inflated "customer spend" on the vendor panel | **Fixed** |
| `admin/controllers/return.controller.js` / vendor equivalent: commission recalculation after a partial return | tax recomputed as **exclusive** for every item | wrong `vendorTax` / `vendorTotalPaidByCustomer` for inclusive items after a partial return | **Open** (F-15) |
| `frontend/.../Admin/pages/orders/Invoice.jsx:83` | `subtotal + tax + shipping − discount` | double GST shown for inclusive items | **Open** (frontend, F-16) |
| `frontend/.../UserApp/pages/Checkout.jsx:294` | inclusive items show tax 0 | totals match the backend, but the tax line differs from the stored tax | **Open** (display only) |

### 3.3 Checkout paths compared
| Rule | Cart preview `/coupons/validate` | **Live** `/payment/initialize` (before fix) | Legacy `/user/orders` |
|---|---|---|---|
| Variant price | shown | **ignored (base price)** | applied |
| Variant stock (COD) | n/a | **not checked / not decremented** | checked + decremented |
| Coupon `maxDiscount` | applied | **not applied** | applied |
| Coupon with no `expiresAt` | valid | **silently dropped** | valid |
| Coupon `startsAt` / usage limit | checked | **not checked** | checked |
| `taxIncluded` | n/a | passed | **not passed** |
| `taxRate = 0` | n/a | 0% | **became 18%** (`|| 18`) |
| `Order.subtotal` stored | n/a | **discounted subtotal** | original subtotal |

After the fixes every row matches across paths.

### 3.4 Payments
- **Capture** (`processCapturedPayment`): atomic claim of a `created` attempt, so webhook and client verify cannot double-process. Stock, commissions, coupon use and status change are written in one transaction. Correct.
- **Retry** (`retryPayment`): charged `order.total` instead of `total − walletAmountUsed`. **Fixed (F-03).** The idempotent replay response had the same error. **Fixed.**
- **Capture after cancel:** the processor does not check that the order is still `payment_pending`. If a customer pays after the order was cancelled, the order comes back to life. **Open (F-17), suspected.**

### 3.5 Refunds
- Full cancellation: refund = `order.total`, capped at captured minus already refunded. Correct.
- Mixed wallet + gateway: **fixed (F-09)**. New `splitMixedRefund` sends to the gateway at most what it captured, and the rest goes back to the wallet.
- A `payment_pending` order cancelled after a partial wallet debit: the wallet share was never returned. **Fixed:** it is now released (reference `PENDING_ORDER_WALLET_RELEASE_<id>`, idempotent).
- Coupon slot "restored" on cancel of a `payment_pending` order that never used one. **Fixed.**
- Return refund = what the customer paid for the returned units, **GST included**, coupon share excluded, shipping excluded (decision 1A, §13C). It was `unitPrice × qty × (1 − vendorDiscountRatio)`, which left out GST.

### 3.6 Escrow and settlement
- Escrow is released per commission 7 days after delivery. COD orders wait for `isCashSettled`; active returns block release. There is an atomic claim lock, and the ledger entry is `VendorWalletTransaction`. Logic is sound.
- `handleOrderDeliveryBalances` writes `vi.deliveredAt` and `vi.escrowReleaseDate`, which **are not in `vendorItemGroupSchema`**, so Mongoose silently drops them. This causes no harm because `Commission.escrowReleaseDate` is the source of truth, but the fields are dead (F-18). The `isOnHoldBalanceAdded` guard is checked in memory, not atomically (F-19, suspected double credit if two delivery confirmations race).

### 3.7 Wallet
- **Fixed (F-04):** credit and debit are now a single `findOneAndUpdate` with a pipeline. The balance floor and lock check are in the filter, and amounts are rounded server-side with `$round: 2`.
- Promo expiry cron debits `min(balance, promoAmount)` even if the promo was already spent, so later refund money can be taken back. **BUSINESS RULE CONFIRMATION REQUIRED (F-20).**

### 3.8 Delivery payouts
- `|| 50 / || 5 / || 500` replaced a configured `0` with the default. Example: a "no free kilometres" setting paid ₹70 instead of ₹100. **Fixed (F-13).**
- Night and peak windows use `getHours()` in **server local time**. On a UTC server the windows shift by 5h30. **Open (F-21).**

---

## 4. Cross-Panel Consistency

| Metric | Admin | Vendor | Customer | Consistent? |
|---|---|---|---|---|
| "Revenue" | Σ `order.total` (gross: incl. GST, shipping) | Σ (`vendorItem.subtotal − discount`) (net product value) | n/a | **No, different definitions.** Both now exclude unpaid/failed orders. Labels should say "GMV (incl. GST & shipping)" vs "Net product sales" (F-22). |
| Order breakdown | `OrderDetail.jsx` falls back to `order.total × 0.95` when subtotal is missing | — | subtotal − discount + shipping + tax | Customer and invoice views now add up for new orders (F-12). Admin fallback is fabricated (F-23). |
| Package amount | courier remittance / admin cancel | vendor customer spend | refund | **Now one helper** (`getVendorGroupPayable`) |
| Vendor earnings | Commission `vendorNetEarnings` | wallet stats from Commission | — | Consistent (same source) |
| Revenue after partial refunds | still counted at full `total` | still counted | — | **No**: dashboards don't subtract partial refunds (F-24) |

Not verified: exported Excel/PDF reports against dashboards (no export code path was executed), and the wholesaler panel's figures.

---

## 5. Business Rule Audit

| Rule | Where | Verdict |
|---|---|---|
| Server-side pricing, never trust client price | checkout | Correct after F-01 |
| Coupon: dates, usage limit, minimum order, cap | `coupon.service.js` | Correct after F-02; now one implementation for the paths shown in §3.3 |
| Coupon usage counted at capture (online) / at creation (COD, wallet) | payment controller / processor | Correct |
| Stock reserved only after payment (online) | processor | Correct; stock failure after capture triggers an auto-refund |
| COD total rounded to whole rupee | `Order` pre-save + checkout | Implemented; vendor splits stay unrounded, so ≤ ₹0.50 is unallocated (F-25, LOW) |
| Escrow hold 7 days, COD needs cash settlement | escrow cron | Correct |
| Return refund includes GST, excludes shipping | `services/financial.service.js` `getReturnRefundForItem` | **Confirmed by business (1A) and implemented** |
| Prepaid (card/UPI) returns refunded to **wallet**, not the original source | both return controllers (`isWalletRefund`) | **CONFIRMATION REQUIRED (F-26)** |
| Vendor keeps GST in earnings | financial engine + service settlement | **Confirmed (decision A): commission excludes GST for products and services** |
| Platform keeps all shipping charges | financial engine | **CONFIRMATION REQUIRED** |
| Promo credit expiry may take non-promo money | wallet cron | **CONFIRMATION REQUIRED (F-20)** |
| Wholesale: no coupons, MOQ, approved buyer | `wholesale.service.js` | Implemented; not executed in this audit |

---

## 6. Database Integrity

| ID | Issue | Severity |
|---|---|---|
| D-1 | `UserWallet.balance` had no concurrency control (fixed in the service). The schema still has no `min: 0`; consider adding it as defence in depth. | — / LOW |
| D-2 | `vendorItemGroupSchema` lacks `deliveredAt`, `escrowReleaseDate`, `settlementStatus`, `releasedAt`, `walletCredit`, which the escrow cron and delivery helper write. They are silently discarded (F-18). | LOW |
| D-3 | `Order.subtotal` has mixed meaning in historical data (F-12). Orders created through `/payment/initialize` before this fix store the **discounted** subtotal. A read-only migration report is recommended before any back-fill. **No data was changed.** | MEDIUM |
| D-4 | `Order.taxableAmount` on historical tax-inclusive orders includes GST. | LOW |
| D-5 | Idempotency index on `{idempotencyScope, idempotencyKey}` is correct. The frontend checkout **never sends an idempotency key**, so double-submit protection is only the UI's `isPlacingOrder` flag (F-27). | MEDIUM |
| D-6 | `WalletTransaction.reference` is unique and sparse, which backs credit/debit dedupe. Good. | — |

---

## 7. API Audit

| ID | Endpoint / file | Issue | Severity | Status |
|---|---|---|---|---|
| A-1 | `POST /api/user/payment/initialize` | F-01, F-02, F-12, unguarded coupon usage increment | CRITICAL | Fixed |
| A-2 | `POST /api/user/payment/retry/:orderId` | F-03 | CRITICAL | Fixed |
| A-3 | Admin return status → `completed` | F-05, F-06 | HIGH | Fixed |
| A-4 | Vendor return status → `completed` | F-07 | HIGH | Fixed |
| A-5 | `POST /api/user/orders` (legacy) | 0% GST → 18%; tax-inclusive ignored | HIGH | Fixed |
| A-6 | `processCapturedPayment` | no status guard (F-17) | HIGH | Open |
| A-7 | Admin partial cancel duplicates `cancellationRefundService` logic | two refund implementations can drift (F-28) | MEDIUM | Open |
| A-8 | `apiLimiter` skips **all** `/api/admin` routes | admin login has its own `authLimiter`; other admin endpoints have no limit | LOW | Open |

---

## 8. Frontend Audit

| ID | File | Issue | Severity |
|---|---|---|---|
| UI-1 | `Admin/pages/orders/Invoice.jsx:83` | Recomputes the total with the double-GST formula when `finalTotal` is absent | MEDIUM |
| UI-2 | `Admin/pages/OrderDetail.jsx:156` | `order.subtotal ?? order.total * 0.95`: a fabricated subtotal | LOW |
| UI-3 | `UserApp/pages/Checkout.jsx:294` | Shows tax 0 for tax-inclusive items, while the stored order has the extracted GST | LOW |
| UI-4 | `UserApp/pages/Checkout.jsx:607` | No `x-idempotency-key`/`idempotencyKey` sent (F-27) | MEDIUM |
| UI-5 | `shared/store/orderStore.js:106` | `createOrder` still targets the legacy `/user/orders` endpoint | LOW |
| Build | `npm run build` | **Passes** (exit 0). Warnings: chunks > 1.2 MB; several stores both statically and dynamically imported | LOW |

Not verified: every page, modal and chart was **not** exercised in a browser. No Playwright run.

---

## 9. Security Audit

| ID | Finding | Severity |
|---|---|---|
| S-1 | **Six rider documents committed to git**, including two résumés with a real person's name (`backend/uploads/delivery-docs/*`), although `.gitignore` excludes `uploads/`. They stay in git history. Recommend `git rm --cached` and a history purge if the repo is or will be shared. **Not changed by me (needs owner decision).** | HIGH |
| S-2 | No `.env` or credential files are tracked. Only `.env.example` files. | PASS |
| S-3 | `enforceAccountStatus` re-validates account state per request; delivery docs are served only with HMAC-signed expiring tokens; Helmet, `express-mongo-sanitize` and CORS allow-list in production. | PASS (code review) |
| S-4 | Razorpay verify checks the signature, and order ownership is enforced. | PASS (code review) |
| S-5 | No rate limit on non-login admin routes (A-8). | LOW |
| S-6 | `assignment.test.js` initialises Firebase Admin with **real credentials** from `.env` when run. | LOW |

Not verified: dependency CVE scan (`npm audit` not run), file-upload MIME and size validation, and webhook secret handling for Shiprocket and Delhivery beyond the existing tests.

---

## 10. Test Results

All results are from this session on Node v24.19.0.

| Suite | Command | Result |
|---|---|---|
| Existing backend unit scripts (8) | `node src/**/…test.js` | **8/8 pass**. `assignment.test.js` prints "passed" and then hangs on open handles (it did this before my changes too) |
| Vitest suite | `npm test` | **Could not run**: `vitest` is not installed and `tests/setup/` (referenced by `vitest.config.js`) does not exist |
| **New** financial regression (pure functions + model stubs) | `npm run test:financial-audit` | **10/10 pass** |
| **New** wallet concurrency (real MongoDB 8.2 replica set, throwaway) | `npm run test:wallet-db` | **4/4 pass**; on the **original** `wallet.service.js`: **2 fail** (10 of 10 overlapping ₹300 debits succeeded on ₹1,000; balance ₹489.90 vs ledger ₹449.50) |
| **New** checkout end to end (real Express app + throwaway MongoDB, all `.env` keys blanked) | `npm run test:checkout-db` | **4/4 pass**; on the **original** `payment.controller.js`: **3 fail** (variant charged ₹1,000 instead of ₹2,500; oversell accepted; coupon dropped) |
| Frontend build | `npm run build` | Pass |
| Existing integration and e2e scripts in `tests/integration`, `tests/e2e`, `tests/verification` | — | **Not run**: they connect to the database in `.env`, which may be a shared or live database |

**Important:** `backend/.gitignore` ignores `**/tests/`, so **none of the backend test files (existing or new) are in version control.** The new npm scripts reference files that only exist locally. I recommend removing that ignore rule.

**Seven-way reconciliation (Phase 10):** I reconciled expected value, backend calculation and database record for checkout (DB tests), and checked the vendor package sum against the order total (unit test). Dashboard, report and export values were reconciled **by code review only**, not against data.

---

## 11. Bugs Found

| ID | Sev | Module / Panel | File : line (after fix) | Root cause | Actual → Expected | Impact | Fix | Test |
|---|---|---|---|---|---|---|---|---|
| F-01 | CRITICAL | Checkout / Customer | `user/controllers/payment.controller.js:174` | `price = product.price`; `variantKey` used only for the image | ₹1,000 charged for ₹2,500 variant → variant price | Under- or over-charging; variant oversell | Fixed | `checkoutPricing.db` ✔ |
| F-02 | CRITICAL | Checkout / Customer | `payment.controller.js:223` | Separate coupon logic; `expiresAt: {$gt: now}` excludes missing dates; no cap | Uncapped discount or dropped coupon → same as preview | Revenue loss / customer overcharge | Fixed (shared `validateCoupon`, `consumeCouponUsage`) | unit ✔ + DB ✔ |
| F-03 | CRITICAL | Payments / Customer | `payment.controller.js:1056` | Retry used `order.total` | total → total − walletAmountUsed | Double charge of the wallet share | Fixed | not automated (needs Razorpay mock) |
| F-04 | CRITICAL | Wallet / Customer | `services/wallet.service.js` | read → modify → `save()` | overspend / lost updates → atomic | Wallet money created or destroyed | Fixed | `walletAtomicity.db` ✔ |
| F-05 | HIGH | Returns / Admin | `admin/controllers/return.controller.js:600` | `refund` declared in inner blocks | ReferenceError → completes | Returns on released-escrow orders could not be completed | Fixed | code-path certain; not automated |
| F-06 | HIGH | Returns / Admin | same, ~line 604 | stale `commRecord` | clawback ₹0 → original − recalculated | Vendor keeps earnings for returned items | Fixed | not automated |
| F-07 | HIGH | Returns / Vendor | `vendor/controllers/return.controller.js:592` | always `onHoldBalance` | wrong bucket → `walletBalance` + ledger row | Vendor balances wrong | Fixed | not automated |
| F-08 | HIGH | Refunds, COD remittance, Vendor | `services/financial.service.js:244` (helper) + 5 call sites | duplicated formula | +GST over-refund → amount paid | Over-refunds, wrong COD expectation | Fixed | unit ✔ |
| F-09 | HIGH | Refunds | `services/cancellationRefundService.js:61` | refund via gateway only | gateway refund > captured → split | Customer not refunded the wallet share | Fixed (+ release of pending wallet debit, coupon slot fix) | unit ✔ (split) |
| F-10 | HIGH | Dashboard / Admin, Vendor | `admin/controllers/analytics.controller.js:10`, `vendor/controllers/analytics.controller.js:65` | `status ≠ cancelled` only | unpaid orders counted → excluded | Inflated revenue | Fixed | not automated |
| F-11 | HIGH | Returns / Customer | `user/controllers/order.controller.js` (return request) | price × qty × (1 − discount ratio) | GST not refunded | Customer under-refunded | **Fixed (decision 1A)** | unit ✔ |
| F-12 | MEDIUM | Orders / all panels | `payment.controller.js:268` | stored discounted subtotal | breakdown double-subtracts discount | Confusing invoices | Fixed (new orders) | DB ✔ |
| F-13 | MEDIUM | Delivery payout | `services/payoutCalculator.service.js` | `||` defaults | configured 0 ignored | Rider over/underpay | Fixed | unit ✔ |
| F-14 | MEDIUM | Checkout (legacy) | `user/controllers/order.controller.js:288,305` | `taxRate || 18`; no `taxIncluded` | 0% → 18%; inclusive taxed twice | Overcharge | Fixed | — |
| F-15 | MEDIUM | Returns | `admin/controllers/return.controller.js` (partial return recalculation) | tax always exclusive; kept items' GST dropped from vendor earnings | vendor over-clawed back on partial returns | **Fixed**: snapshot orders use the shared `recalculateKeptVendorFinancials` (same rule the vendor-side path already used) | unit ✔ |
| F-16 | MEDIUM | Admin invoice | `frontend/.../Invoice.jsx:83` | double-GST fallback | — | Display | Open | — |
| F-17 | HIGH | Payments | `services/paymentProcessor.js` | no status guard | cancelled order resurrected on late capture | Stock and escrow for a cancelled order; refund already issued | **Fixed in second pass (SV-02)** | `checkoutPricing.db` ✔ |
| F-18 | LOW | Orders | `services/orderFinancialHelper.js:21` | fields not in schema | silently dropped | None today | Open | — |
| F-19 | MEDIUM (suspected) | Escrow | `orderFinancialHelper.js:22` | in-memory guard | possible double `onHoldBalance` credit on concurrent delivery | Vendor over-credit | Open | — |
| F-20 | MEDIUM | Wallet cron | `cron/walletCron.js:43` | expiry ignores spend | takes refund money | Customer loss | **Decision required** | — |
| F-21 | LOW | Delivery payout | `payoutCalculator.service.js:176` | server-local hour | surcharge window shifted on UTC hosts | Rider pay | Open | — |
| F-22 | MEDIUM | Dashboards | admin vs vendor analytics | different revenue definitions | — | Confusion | Open (labelling) | — |
| F-23 | LOW | Admin order detail | `frontend/.../Admin/pages/OrderDetail.jsx:156` | fake fallback | — | Display | Open | — |
| F-24 | MEDIUM | Dashboards | admin analytics | partial refunds not netted | — | Overstated revenue | Open | — |
| F-25 | LOW | COD | checkout | rounding not allocated | ≤ ₹0.50 | Reconciliation noise | Open | — |
| F-26 | MEDIUM | Returns | both return controllers | prepaid returns went to the wallet | — | Policy | **Fixed (decision, §13D)** | `returnRefund.db` ✔ |
| F-27 | MEDIUM | Checkout | `Checkout.jsx:607` | no idempotency key | duplicate orders possible on retry/network replay | Duplicate charges | Open | — |
| F-28 | MEDIUM | Cancellation | `admin/controllers/order.controller.js` | duplicated refund engine | drift risk | Maintenance | Open | — |
| S-1 | HIGH | Repo | `backend/uploads/delivery-docs/*` | files tracked | PII in git | Privacy | **Decision required** | — |

---

## 12. Fixes Implemented

| File | Change |
|---|---|
| `backend/src/services/financial.service.js` | `taxableAmount = Σ baseAmount`; new `getVendorGroupPayable()` (uses item `finalLineTotal` snapshots, legacy fallback) |
| `backend/src/services/coupon.service.js` | new `consumeCouponUsage()` (conditional increment when a usage limit exists) |
| `backend/src/modules/user/controllers/payment.controller.js` | variant price and variant stock check; shared coupon validation; `subtotal = originalSubtotal`; COD variant stock decrement; guarded coupon usage; retry and replay charge only the gateway portion |
| `backend/src/modules/user/controllers/order.controller.js` | `taxRate ?? 18`; pass `taxIncluded` |
| `backend/src/services/cancellationRefundService.js` | package refund via helper; `splitMixedRefund`; wallet-share refunds; release of a pending order's wallet debit; no coupon restore for unpaid orders |
| `backend/src/modules/admin/controllers/return.controller.js` | fixed undeclared `refund`; fresh commission for clawback; per-vendor escrow detection; partial return no longer overwrites order `escrowStatus` |
| `backend/src/modules/vendor/controllers/return.controller.js` | clawback from `walletBalance` (with ledger entry) once escrow is released |
| `backend/src/services/wallet.service.js` | atomic credit and debit (pipeline update, balance floor and lock in filter, server-side rounding) |
| `backend/src/services/payoutCalculator.service.js` | configured zero values respected |
| `backend/src/modules/admin/controllers/analytics.controller.js` | revenue, sales, finance and top products exclude `payment_pending`, `payment_failed`, `returned`, `cancelled` |
| `backend/src/modules/vendor/controllers/analytics.controller.js` | same exclusion |
| `backend/src/modules/admin/controllers/courierRemittance.controller.js`, `admin/controllers/order.controller.js`, `services/paymentProcessor.js`, `vendor/controllers/customer.controller.js` | use `getVendorGroupPayable` |
| `backend/package.json` | scripts `test:financial-audit`, `test:wallet-db`, `test:checkout-db` |
| `backend/tests/unit/financialAudit.regression.test.mjs`, `walletAtomicity.db.test.mjs`, `checkoutPricing.db.test.mjs` | new regression tests (DB tests refuse to run unless `TEST_MONGO_URI` names a `*test*` database, and they blank all `.env` keys) |

**Verification evidence:** all modified modules load (`import` smoke test), 8/8 existing scripts pass, 18/18 new tests pass, and the DB tests fail on the original code as shown in §10. The frontend build passes.

**Not touched:** pre-existing uncommitted changes in `wholesalerE2E.js`, `notification.service.js`, `App.jsx`, `PrivacyPolicy.jsx`, `AuthShell.jsx`.

---

## 13. Remaining Risks

**Decisions required from the business:**
1. ~~F-11: should return refunds include the GST paid?~~ **Decided 1A (include GST), implemented.**
2. F-26: should prepaid returns go to the original payment source instead of the wallet?
3. F-20: should promo expiry be limited to unspent promo credit?
4. Should vendor earnings keep GST, and should the platform keep shipping, as the engine assumes today?
5. S-1: remove committed rider documents (and purge them from history)?
6. D-3: back-fill `Order.subtotal` / `taxableAmount` on historical orders? (I recommend a read-only report first.)

**Engineering follow-ups:** F-17 (late capture on a cancelled order → auto-refund), F-19 (atomic `isOnHoldBalanceAdded`), F-27 (send an idempotency key from checkout), F-28 (one cancellation engine), F-15/F-16/F-24, and un-ignoring `backend/tests/`.

**Partly audited or not audited:** gift cards (`giftCard.service.js`), the services marketplace (bookings, payouts), the wholesale/B2B order lifecycle, exchange price-delta handling, delivery cash settlement and rider withdrawals (reviewed only at a glance; the withdrawal state transitions looked atomic), the worker/inspection panel, support, notifications, every frontend page, and Excel/PDF exports.

---

## 13A. Service Booking Flow Audit (added 10 Nov 2026, second pass)

**Scope:** customer booking (`customer/controllers/customerService.controller.js`), pricing and schedule (`services/serviceBookingFlow.service.js`), online payment (`services/paymentProcessor.js`, `user/controllers/webhook.controller.js`), vendor lifecycle and settlement (`vendor/controllers/vendorBooking.controller.js`), and the customer, vendor and admin pages that display bookings.

**Context:** `PAYMENT_MODE` is not set in `.env`, so the platform runs **COD-only** today (`config/paymentConfig.js`). Every online-payment finding below (SV-01, SV-02, and F-03/F-09/F-17 above) is latent until online payments are switched on, but each would hit customers on day one.

### Flow traced
Quote (server-side, `computeServiceQuote`) → slot check (`assertBookableSlot`, IST) → daily capacity reservation (`ServiceCapacity`, atomic `$inc` with limit) → COD / wallet / Razorpay booking → capture (`processCapturedPayment`) → vendor `pending → confirmed → assigned → in_progress → completed` → settlement (Commission + vendor wallet + `VendorWalletTransaction`) or cancellation (refund + capacity release).

**Pricing formula** (correct, and the frontend shows the server quote rather than computing its own):
`subtotal = unitPrice × qty`; `tax = (subtotal + visitCharge) × taxRate%`; `total = subtotal + visitCharge + tax`.

### Findings

| ID | Sev | File | Problem | Status | Test |
|---|---|---|---|---|---|
| SV-01 | CRITICAL (latent) | `services/paymentProcessor.js` | Razorpay lets the customer retry inside the same checkout. The first failed try fires `payment.failed`, which marks the attempt `failed`. The processor accepted only `created` attempts, so the **successful retry's capture was ignored**: the customer was charged, and the booking (or product order) stayed failed with no refund. | **Fixed**: a `failed` attempt is claimable; the slot is re-reserved | `serviceFlow.db` ✔, `checkoutPricing.db` ✔ (both fail on old code) |
| SV-02 | HIGH (latent) | same | A capture arriving after cancellation either revived the cancelled booking or order (status forced to `confirmed`/`pending`, stock deducted again) or was silently dropped. **No refund in either case.** | **Fixed**: the processor confirms only an open, unpaid booking or order; anything else is auto-refunded (`UNEXPECTED_CAPTURE_REFUND_<paymentId>`, attempt status `captured_refunded`) | ✔ (fails on old code) |
| SV-03 | HIGH | `vendor/controllers/vendorBooking.controller.js` | The booking was marked `completed` + `settled` **before** the commission, wallet credit and ledger were written one by one. A failure part-way left a "settled" booking with no vendor payout and no retry path. The ledger's before/after came from a stale read. | **Fixed**: one transaction; on failure the booking reverts to `unsettled` | ✔ |
| SV-04 | MEDIUM | `customerService.controller.js`, `vendorBooking.controller.js` | The `payment.failed` webhook releases the capacity slot; a later cancellation released it **again**, freeing another customer's slot (overbooking). | **Fixed** | ✔ (fails on old code) |
| SV-05 | MEDIUM | `customerService.controller.js:325`, `serviceBookingFlow.service.js:184` | `dailyCapacity || 10`: a provider who set capacity to **0** (paused) still accepted 10 bookings/day, while the schedule screen showed "Fully booked". | **Fixed** (`?? 10` in both) | ✔ (fails on old code) |
| SV-06 | MEDIUM | `customerService.controller.js` cancel | Online-paid booking cancelled with no resolvable paid attempt: no refund was created, but the booking was marked `paymentStatus: refunded`. | **Fixed**: only marked refunded when a refund record exists; otherwise an error is logged for a manual refund | — |
| SV-07 | MEDIUM | `frontend/.../Vendor/pages/Dashboard.jsx` | Recent service bookings read `pricing.totalPrice`, `serviceTitle` and `contactDetails`, which don't exist, so every booking showed **₹0** and generic names. | **Fixed** | build ✔ |
| SV-08 | MEDIUM | `frontend/.../UserApp/pages/ServiceBookingDetailPage.jsx` | The breakdown omitted the visit charge, so Subtotal + GST ≠ Total. The refund banner always said "refunded to your SafeFire Wallet", even for card/UPI refunds. | **Fixed** | build ✔ |
| SV-09 | HIGH | `vendorBooking.controller.js` settlement | Service commission was charged on the **GST-inclusive total** (10% of ₹1,180 = ₹118), while products use the pre-tax base. | **Fixed after business decision A (12 Nov 2026)**: commission = rate × (total − GST), e.g. 10% of ₹1,000 = ₹100; the vendor keeps the GST (earnings ₹1,080), as with products. The commission record now also stores the base, GST and total paid. Applies to bookings completed from now on; already-settled bookings are unchanged. | `serviceFlow.db` ✔ |
| SV-10 | HIGH | same | Vendor earnings were released as soon as the vendor alone marked the job completed, with no customer confirmation. | **Fixed after business decision 2B**: completion requires the customer's code (§13C) | ✔ |
| SV-11 | MEDIUM | `customerService.controller.js` | Abandoned online bookings (never paid, never failed) hold a capacity slot forever; there is no expiry job. | **Fixed**: new `cron/serviceBookingCron.js` runs every 5 min and cancels online bookings unpaid after `SERVICE_PAYMENT_TIMEOUT_MINUTES` (default 30, see `.env.example`), releasing the slot. COD and wallet bookings are never touched; a payment arriving after expiry is auto-refunded (SV-02). | ✔ |
| SV-12 | LOW | same | `bookingId = SRV-<6 timestamp digits><3 random>` can collide; on a collision the COD path throws after reserving capacity and never releases it. | **Fixed**: new format `SRV-<6 digits>-<6 crypto-random base-36 chars>` (`generateServiceBookingId`); a clash retries up to 5 times; any failed insert releases the slot | ✔ (fails on old code) |
| SV-13 | MEDIUM | `serviceBookingFlow.service.js` | `CUSTOM_QUOTE` / `requiresQuote` services charge the **estimate** as the final online amount; there is no path to adjust it to the real quote. | **BUSINESS RULE CONFIRMATION REQUIRED** | — |
| SV-14 | LOW | `vendorBooking.controller.js` | A vendor can move a booking to `in_progress`/`completed` before the booking date. Because completion releases the payout, a job could be paid out before it could have happened. | **Fixed**: start/complete allowed only on or after the booking date (IST); confirming early is still allowed | ✔ (fails on old code) |
| SV-15 | LOW | customer cancel | Customers can cancel up to `assigned` with a full refund at any time; there is no cancellation window or fee. | **BUSINESS RULE CONFIRMATION REQUIRED** | — |

### Verified correct
- Server-side quote only; the client never sends a price.
- Pincode coverage and IST slot validation.
- Atomic daily capacity reservation.
- Vendor transitions guarded by a state machine plus an optimistic `status` filter.
- Online bookings can't advance until paid.
- Cancellation refund amounts are capped by what was already refunded.
- Wallet-paid bookings are refunded to the wallet.

### Tests added
`npm run test:service-db` (10 tests, real MongoDB replica set, Razorpay mock). **10/10 pass**. In the first pass, 6 tests existed and on the original code **5 fail** (the settlement test fails there as a knock-on because the booking never became paid). Two order-side late-capture tests were added to `test:checkout-db` (now 6/6).

---

## 13B. Whole-Project Error Sweep (third pass, 10 Nov 2026)

**Checks run**

| Check | Result |
|---|---|
| `node --check` on all 312 backend source files | 0 syntax errors |
| Load every backend module (269, excluding one-off scripts), all `.env` values blanked | 0 load errors |
| Undefined-variable scan (Babel AST, equivalent to ESLint `no-undef`) over backend + frontend | **4 real crash bugs found and fixed**; 1 remaining hit is the browser global `PopStateEvent` (not a bug) |
| Frontend production build | Pass |
| All test suites | Financial 10/10, checkout DB 7/7, service DB 10/10, wallet DB 4/4, existing scripts 8/8 (`assignment.test.js` passes then hangs on open handles, which predates these changes) |

No ESLint or TypeScript config exists in either app, so the scan above is the only static analysis.

**Bugs found and fixed in this pass**

| ID | Sev | File | Problem | Fix |
|---|---|---|---|---|
| UI-6 | HIGH | `frontend/.../UserApp/pages/Search.jsx:553` | `LazyImage` used but never imported, so the category filter grid crashed the search page | Import added |
| UI-7 | HIGH | `frontend/.../Vendor/pages/Dashboard.jsx:427` | `FiAlertCircle` not imported, so the vendor dashboard crashed whenever a service-partner application was **rejected** | Import added |
| UI-8 | MEDIUM | `frontend/.../Mobile/MobileCategoryIcons.jsx:274` | Fallback icon `IoShirtOutline` (left over from a clothing template) not imported, so any category without a mapped icon crashed the category bar | Falls back to the already-imported `FiPackage` |
| UI-9 | MEDIUM | `frontend/.../Mobile/AnimatedBanner.jsx:139` | Fallback image `watchImg` undefined, so any admin banner without an image crashed the home banner | Falls back to the bundled hero image |
| C-1 | MEDIUM | `services/cancellationRefundService.js` | Cancelling a `payment_failed` order **restored stock and a coupon slot it never took** (phantom stock). The wallet share of a failed wallet+UPI order was never returned, and customers could not cancel `payment_failed` orders at all. | Unpaid statuses (`payment_pending`, `payment_failed`) treated the same way: no stock or coupon restore, wallet share released; customer cancel allowed (API + order page button). Test ✔ |
| C-2 | LOW | `payment.controller.js` verify, `customerService.controller.js` verify | When the order or booking had been cancelled before payment completed, verify returned 200, so checkout said "Order placed" while the money was being refunded | Returns 409 with a "being refunded" message |

Also removed an unused `Coupon` import from `payment.controller.js`.

---

## 13C. Business Decisions Implemented (12 Nov 2026)

### 1A: Return refunds include GST
- **Rule:** refund = what the customer paid for the returned units, **GST included**, coupon share excluded, shipping not refunded. This now matches cancellation refunds.
- **Code:** `getReturnRefundForItem` in `services/financial.service.js`, used when the return request is created (`user/controllers/order.controller.js`). It uses the per-item checkout snapshot (`discountedSubtotal` plus `taxAmount` unless tax-inclusive). Legacy items without a snapshot fall back to `price × (1 − discount ratio)` plus GST at the item's rate.
- **Vendor side:** the vendor's earnings already contained the GST (earnings = base − commission + tax), so a full return claws back everything, GST included. For partial returns the admin completion path dropped the GST of the **kept** items from vendor earnings (F-15). It now uses the shared `recalculateKeptVendorFinancials`, which applies the same rule the vendor-side path already used. Net effect: clawback = returned units' refund − platform commission on them.
- **Example:** 1 of 2 units at ₹500 + 18% GST. Refund was ₹500, now **₹590**. Vendor clawback ₹540 (₹590 − ₹50 commission).
- **Scope:** applies to return requests created after deployment. Existing return requests keep the `refundAmount` stored when they were created.

### 2B: Customer code (OTP) required to complete a service
- When the vendor taps **Start Service** (`in_progress`), a 4-digit code is created and sent to the customer (notification and booking page). The vendor never sees it: it is stored `select: false` on `ServiceBooking.completionOtp`, and only the customer's booking-detail endpoint returns it, and only while the job is in progress.
- **Complete Service** asks the vendor for the code. Without the correct code the booking stays `in_progress` and **no payout or commission is created**.
- 5 wrong attempts: a new code is issued to the customer and the old one stops working. Jobs started before this release get a code issued the first time the vendor tries to complete.
- `completionVerifiedAt` records when the customer-confirmed completion happened.
- **Files:** `models/ServiceBooking.model.js`, `services/serviceBookingFlow.service.js` (code generation and comparison), `vendor/controllers/vendorBooking.controller.js`, `customer/controllers/customerService.controller.js`, `frontend/.../Vendor/components/Services/VendorServiceBookingModal.jsx` (code prompt), `frontend/.../Vendor/pages/services/VendorServiceBookings.jsx`, `frontend/.../UserApp/pages/ServiceBookingDetailPage.jsx` (code card).
- **Test mode:** `DELIVERY_OTP_TEST_MODE=true` (non-production only) makes the code `9999`, the same as delivery OTPs.

### Tests
- `test:financial-audit` **14/14** (4 new: GST-inclusive refund, refund with coupon, legacy items, partial-return clawback).
- `test:service-db` **12/12** (2 new: the code is hidden from the vendor and required to complete; lockout and new code after 5 wrong attempts).
- `test:checkout-db` 7/7, `test:wallet-db` 4/4, existing scripts 7/7 (`assignment.test.js` still hangs after passing, as before).
- Full sweep: 0 syntax errors, 269 modules load, undefined-variable scan clean (only `PopStateEvent`, a browser built-in), frontend build passes.

---

## 13D. Return Refund Destination (12 Nov 2026)

**Decision:** card/UPI orders are refunded to the same card/UPI (Razorpay); Cash on Delivery and wallet orders to the SafeFire wallet. This resolves F-26.

- **Before:** every non-COD order (card/UPI included) was refunded to the wallet, and COD customers had to pick wallet, bank transfer or UPI, which created manual payout work.
- **Now:** one shared service, `services/returnRefund.service.js`, used by both the admin and vendor return-completion paths. The Razorpay refund is recorded inside the transaction and sent only after commit. A wallet + UPI order refunds through Razorpay up to what it captured, and the rest goes to the wallet. If the original payment ID cannot be found, the refund is marked `failed` for manual handling and is never silently moved to the wallet.
- **Return form:** COD customers no longer choose a refund method or enter bank/UPI details (any sent are ignored by the backend). The form now tells every customer where the refund will go, and the order summary shows `Wallet Credit` or `Original Payment Method` accordingly.
- **Not changed:** exchange price-difference refunds (a cheaper replacement) still go to the wallet; they are outside this rule.
- **Existing data:** COD return requests already submitted with bank/UPI details are refunded to the wallet once they complete.
- **Tests:** `npm run test:return-db` 7/7 (UPI, card, COD, wallet, wallet+UPI split, no double refund, missing payment ID).

---

## 13E. Whole-Project Analysis: Remaining Bugs, Placeholders and Decisions (12 Nov 2026)

Analysis done 12 Nov 2026; **fixes applied the same day, see §13F** (statuses there supersede this section).

**Method**
- Loaded the real Express app, listed all 571 backend routes, and matched all 526 frontend API calls against them.
- Ran an AST scan for buttons with no action.
- Text-searched for placeholders, mock data and stubs.
- Read the modules not yet audited (gift cards, rider cash and payouts, finance report pages).

### A. Bugs (confirmed by reading the code)

| ID | Sev | Area | File | Problem | Impact |
|---|---|---|---|---|---|
| R-1 | HIGH | Rider COD cash | `services/deliveryPayout.service.js` (`processShipmentPayout`, `processDeliveryBoyPayout`) | Each delivered **package** adds the **whole order total** to the rider's `cashInHand`. Admin settlement (`admin/controllers/delivery.controller.js` `settleCash`) subtracts each order total once per rider. | One rider delivering a 2-vendor COD order is left with a phantom debt equal to the order total, which blocks withdrawals forever. Two riders on the same order are each told they hold the full total. Partially cancelled COD orders charge the rider for the cancelled package. |
| R-2 | HIGH | Rider COD cash | `admin/controllers/delivery.controller.js` (`getAllDeliveryBoys`, `getDeliveryBoyById`, `settleCash`) | "Cash in hand" shown to admin and the settlement amount are computed as Σ `order.total` of orders touched, not the rider's packages. Settlement marks the **whole order** `isCashSettled` even if another rider still holds cash for another package. | Admin collects the wrong amount. The COD escrow release for the other vendor can happen before their package's cash is handed over. |
| R-3 | HIGH | Rider pay | `deliveryPayout.service.js` `processDeliveryBoyPayout` (used by `admin/controllers/order.controller.js` and `delivery/controllers/order.controller.js`) | Hardcoded `₹50 + ₹5/km`; ignores the admin-configured `DeliveryRateConfig` that `processShipmentPayout` uses. | Two different rider pay formulas depending on which screen completes the delivery; rate changes by admin don't apply on this path. |
| P-1 | HIGH | Finance report | `frontend/.../Admin/pages/finance/ProfitLoss.jsx` | Revenue = Σ order totals (GMV). The discount is subtracted again although totals already exclude it. Vendor payouts are never subtracted. | "Net Profit" and "Profit Margin" are mostly vendor money. Platform profit should be commission (+ fees kept). |
| P-2 | HIGH | Tax report | `frontend/.../Admin/pages/finance/TaxReports.jsx` → `admin/controllers/report.controller.js` | Fetches sales with `status: 'all'`, so cancelled, unpaid and failed-payment orders count as GST collected. | GST liability overstated (risky if used for filing). |
| P-3 | MEDIUM | Vendor revenue | `frontend/.../Admin/pages/vendors/VendorAnalytics.jsx` vs `vendor/controllers/analytics.controller.js` | Admin shows vendor revenue as `subtotal` (before coupon); the vendor's own dashboard shows `subtotal − discount`. | The same vendor sees a different revenue figure than admin. |
| P-4 | MEDIUM | Vendor sales report | `frontend/.../Vendor/pages/reports/SalesReport.jsx` | `subtotal \|\| vendorEarnings` mixes two different metrics in one column. | Wrong totals when `subtotal` is missing. |
| U-1 | MEDIUM | Reviews | `frontend/src/shared/store/reviewsStore.js:189` | "Helpful" posts to `/user/reviews/:id/helpful`; the backend route is `POST /user/reviews/:id/vote` with `{ type: 'helpful' }`. | The Helpful button always fails silently; votes are never saved. |
| U-2 | MEDIUM | Storefront catalog | `frontend/.../UserApp/data/catalogData.js` | With no cached catalog (first visit, API failure), search suggestions, categories, daily deals and recommendations fall back to built-in **demo products** (`id: 1`, sample prices). The cache never expires. | New visitors can see products that can't be ordered; deleted products or old prices can linger. |

### B. Placeholder UI (looks clickable, does nothing)

| ID | Where | Element |
|---|---|---|
| PH-1 | `UserApp/components/Layout/DesktopFooter.jsx:157` | Newsletter **Subscribe** button: no handler, no form, no backend endpoint. |
| PH-2 | `shared/components/Cart/CartDrawer.jsx:275` | **Apply coupon** in the cart drawer: no handler (coupons work on the checkout page). |
| PH-3 | `UserApp/pages/ProductDetail.jsx:49` and `UserApp/pages/SimilarExplore.jsx:17` | Heart (wishlist) icon on similar-product cards: no handler; clicking opens the product instead. |
| PH-4 | `UserApp/pages/ProductDetail.jsx:975` | Mobile **Similar** floating button: no handler (the "Similar Products" link further down works). |
| PH-5 | `Admin/pages/customers/CustomerDetailPage.jsx:349` | **Edit** button in the customer's address table: no handler. |

**Dead code (not reachable, so no user impact):**
- `Admin/pages/Users.jsx` and `Admin/pages/settings/web/Languages.jsx` (not routed).
- `modules/Explore` (dummy data, unused).
- `adminService.updateSettings`, `sendPushNotification` and `sendCustomMessage` (call non-existent routes; unused).
- 8 vendor shipping zone/rate service functions (non-existent routes; unused).
- `UserApp/pages/ComingSoon.jsx` (imported, not rendered).
- Shiprocket `schedulePickup`/`trackShipment` stubs (never called).

### C. Verified OK in this pass
- All other 500+ frontend API calls match a backend route and method (including vendor/wholesaler dynamic prefixes and FCM token routes). All 10 admin settings screens save through the working `settingsStore`.
- Gift cards: purchase validates amount and recipient; redemption is atomic (balance check in the update filter, transaction, server-side rounding, expiry inside the update, audit trail).
- No hardcoded amounts or fake trends in any admin, vendor, wholesaler, rider or worker dashboard.

### D. Business decisions still open
1. **Rider pay formula:** should every delivery use the admin-configured rate table (R-3)? (Recommended: yes.)
2. **P&L definition:** platform profit = commission + shipping charged − courier/rider cost? Today no cost of delivery is recorded against shipping income.
3. **Partial refunds in revenue:** should dashboards net out partial refunds (F-24)?
4. **Promo credit expiry** (F-20) and **quote-based services charged at the estimate** (SV-13): still unanswered from earlier.
5. **Historical orders:** back-fill `Order.subtotal`/`taxableAmount` on orders placed before the fixes (D-3/D-4)? (Recommended: read-only report first.)

### E. Engineering items still open from earlier sections
F-19 (atomic `isOnHoldBalanceAdded`), F-21 (payout night/peak windows use server time zone), F-27 (checkout sends no idempotency key), F-28 (admin partial-cancel duplicates the cancellation engine), D-2 (fields written but not in the schema), S-1 (rider documents committed to git), and `backend/tests/` being git-ignored.

---

## 13F. Fixes for §13E (12 Nov 2026)

| ID | Status | What changed |
|---|---|---|
| R-1 | **Fixed** | New `getShipmentCodAmount` (`services/financial.service.js`): each COD package collects only its own share, rounded to the rupee; the last package absorbs rounding so packages add up to the order total; cancelled packages collect ₹0. Used by `processShipmentPayout` for the rider's cash-in-hand. |
| R-2 | **Fixed** | `admin/controllers/delivery.controller.js`: rider cash-in-hand (list, detail) and `settleCash` use the rider's own unsettled packages (`getRiderUnsettledCod`). Settlement marks exactly those packages settled; the order is marked cash-settled only when no live package still has cash outstanding. The rider app shows **"Cash to collect (this package)"** (`_shipment.codAmount`). Courier remittance expects the same per-package amount. |
| R-3 | **Fixed (was dead code)** | `processDeliveryBoyPayout` is not called anywhere; it now uses the admin rate table and per-package cash too, so it can't reintroduce the bug if reused. Live payouts already used the rate table. |
| C-3 (new) | **Fixed** | Courier COD: `codReceived.listener.js` wrote an invalid `escrowStatus: 'release_pending'` (schema rejects it; the save always failed) on an arbitrary vendor's commission, and the escrow cron only checked `order.isCashSettled`, which the courier path never sets, so **courier-delivered COD vendor earnings were never released**. The escrow cron now checks this vendor's package (`Shipment.isCashSettled`), and the listener no longer touches the commission. This also stops a second vendor's unsettled cash from blocking the first vendor. |
| P-1 | **Fixed** | Finance summary API now returns `commission` and `vendorPayouts`. The Profit & Loss page shows customer payments (GMV, with GST and coupon discounts shown for reference, not subtracted again), what is owed to vendors, and **Platform Revenue = commission + shipping charged**. Delivery costs are not deducted (no cost ledger; business decision 2 in §13E-D). |
| P-2 | **Fixed** | Tax report skips cancelled, unpaid, failed-payment and fully returned orders. |
| P-3, P-4 | **Fixed** | New `frontend/src/shared/utils/vendorFinance.js`, used by admin Vendor Analytics and the vendor Sales Report: net sales = subtotal − coupon share, cancelled packages and unpaid orders excluded (same as the vendor dashboard). The admin page now shows real vendor earnings instead of repeating revenue. Admin customer detail "Total spent" uses the same paid-order rule. |
| U-1 | **Fixed** | Review "Helpful" calls `POST /user/reviews/:id/vote { type: 'helpful' }`. |
| U-2 | **Fixed** | No demo-catalog fallback: an unloaded catalog shows nothing instead of fake products; an empty live catalog now clears the cache. |
| PH-1 | **Removed** | Footer newsletter form (no backend; building one would be a new feature). |
| PH-2 | **Wired** | Cart drawer "Apply coupon" closes the drawer and opens checkout, where coupons are applied. |
| PH-3 | **Wired** | Similar-product card hearts toggle the wishlist (`shared/components/Product/CompactWishlistButton.jsx`). |
| PH-4 | **Wired** | Mobile "Similar" button opens the similar-products page. |
| PH-5 | **Removed** | Admin customer-address "Edit" column (no admin address-update endpoint exists). |

**Tests:** new `npm run test:ridercod-db` (3: one rider/both packages, two riders with per-vendor escrow, courier-remitted COD release); **all 3 fail on the original code** (one rider held ₹3,540 for a ₹1,770 order; rider A was asked for ₹1,770 instead of ₹1,180; courier COD never released). 2 new unit tests for the per-package COD rule. Totals: unit 16/16; DB suites checkout 7, service 12, wallet 4, return 7, rider COD 3, all passing; existing scripts 7/7; frontend build passes.

**Existing data:** riders' stored `cashInHand` may already be inflated by past multi-vendor COD orders, and some courier COD commissions may be stuck in `held` with the old failed listener. **Run a read-only reconciliation against production before any correction**: compare each rider's `cashInHand` with the sum of `getShipmentCodAmount` over their unsettled delivered COD packages.

---

## 13G. Read-Only Production Reconciliation (12 Nov 2026)

**Status: tool built and verified; NOT yet run against production.** The run against the configured database was blocked by the session's permission policy (production reads), and the only credentials available are the app's own `MONGO_URI`, which are expected to be read-write. Per the safety rules, I stopped. **No production data was read or modified.**

### Tool
`backend/src/scripts/financialReconciliation.js` (`npm run reconcile:readonly -- --out <dir>`):
- **Read-only, enforced three ways:**
  - raw MongoDB driver only (no Mongoose models, so no index or collection creation);
  - every driver write method, `$out`/`$merge` and non-read commands throw;
  - refuses a database user with write privileges (checked with `connectionStatus`) or an unauthenticated connection, unless `--target-is-copy` declares a backup or sanitized copy.
- Takes the URI **only** from `RECON_MONGO_URI`, never from `.env`.
- Reuses the app's own rules: `getShipmentCodAmount`, `getVendorGroupPayable`, `getReturnRefundForItem`, and the order item snapshots.
- Outputs `report.md`, `discrepancies.json`, `discrepancies.csv` and `summary.json`. Each discrepancy lists severity, category (CONFIRMED / REVIEW / BUSINESS_DIFFERENCE), record ID, expected, actual, difference, root cause, recommendation and whether Finance approval is needed. **IDs and amounts only, no PII.** The output folder `backend/reconciliation-output/` is git-ignored.

### Coverage of the requested scope
| # | Scope | Check |
|---|---|---|
| 1 | Rider cash-in-hand vs unsettled packages | `cashInHand` vs Σ per-package COD of the rider's delivered, unsettled packages |
| 2 | Package COD vs rider settlements | each `CashSettlement.amount` vs Σ per-package COD of the packages linked to it |
| 3 | Courier COD remittances | `codAmountExpected` vs per-package COD; partial/disputed remittances |
| 4 | Held commissions | stuck after courier/rider settlement (C-3), held on cancelled orders/packages, delivered without release date, `failed` escrow |
| 5 | Released commissions | ESCROW_RELEASE ledger exists and matches net earnings; released on cancelled packages; released before package cash settled |
| 6 | Duplicates | commissions per order+vendor, settlements per commission, service settlements, wallet ledger references |
| 7 | Escrow vs lifecycle | order-level flag vs commissions; paid orders without commissions |
| 8 | Wallet ledgers | customer wallet vs ledger; vendor wallet vs ledger; vendor on-hold vs held commissions; rider wallet vs ledger |
| 9 | Historical order fields | total, subtotal (F-12 semantics flagged as BUSINESS_DIFFERENCE), taxableAmount, tax vs item snapshots |
| 10 | Refunds / cancellations / returns | over-refunds, gateway refunds above captured amount (F-09), paid cancellations without refund, unreturned wallet shares (C-1), double-GST package refunds (F-08), failed refunds, pre-1A return refunds |
| 11 | Cross-panel totals | GMV vs commission + vendor earnings + shipping; vendor net sales; per-order split check |
| 12 | Other effects of fixed bugs | coupon over-cap (F-02), retries charging the wallet share twice (F-03), ignored captures (SV-01), unsettled completed service bookings (SV-03), service refunds missing (SV-06), pre-decision service commission on GST |

### Verification (throwaway local database, not production)
`npm run test:recon-db` **3/3**:
- every planted discrepancy is found with exact amounts (for example, rider cash expected ₹1,180 vs stored ₹1,770);
- a clean order produces no findings;
- the **database hash is identical before and after**;
- all 6 write attempts are blocked;
- it refuses without `RECON_MONGO_URI` and refuses an unauthenticated target.

The privilege classifier is unit-tested against read, readWrite, Atlas-admin and other-database-writer users (`test:financial-audit` 17/17).

### Required to complete this phase
One of:
1. A **read-only database user** (MongoDB role `read` on the SafeFire database) set as `RECON_MONGO_URI`; or
2. A **restored backup or sanitized copy**, run with `--target-is-copy`.

Then run `npm run reconcile:readonly -- --out reconciliation-output/<date>` (the command needs permission to read that database in this environment).

### Deployment note
Deploying the fixed code is **not** neutral for existing data: the fixed escrow cron will, on its first run, release commissions held only because of C-3 (courier/rider-settled COD packages). Existing inflated rider `cashInHand` values (R-1) are **not** corrected by the new code. **Run the reconciliation and have Finance review it before deploying.**

---

## 14. Final Readiness Assessment

| Area | Status | Basis |
|---|---|---|
| Financial accuracy (checkout and pricing) | **PARTIAL** | Engine verified; critical checkout bugs fixed and tested; F-11 and F-17 fixed; historical-data and dashboard netting items remain (§13) |
| Financial consistency across panels | **PARTIAL** | Package amounts unified; revenue definitions and partial-refund netting still differ |
| Business rule correctness | **PARTIAL** | Several rules need confirmation (§13) |
| Backend reliability | **PARTIAL** | Wallet race fixed; F-17 and F-19 open |
| Frontend reliability | **NOT VERIFIED** | Build passes; pages not exercised |
| Database integrity | **PARTIAL** | Schema gaps D-2; historical subtotal semantics D-3 |
| API reliability | **PARTIAL** | Return completion crash fixed; duplicated cancellation logic |
| Security | **PARTIAL** | Auth design sound; PII committed (S-1); no dependency scan |
| Test coverage | **FAIL** | Main vitest suite cannot run; tests are git-ignored; new coverage limited to the paths fixed |
| Production readiness | **NOT VERIFIED** | No production or staging data or deployment config was inspected beyond the code |
