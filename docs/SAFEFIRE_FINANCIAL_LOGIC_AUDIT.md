# SafeFire: Financial Logic & Cross-Panel Consistency Audit

**Date:** 12 Nov 2026 · **Scope:** code, calculations, business rules and workflows (historical test data is out of scope) · **Branch:** `main`, uncommitted working tree

**Method**
- I read and traced the source code, then ran tests on a throwaway local MongoDB 8.2 replica set using the real Express app with Razorpay in mock mode.
- **No real database, payment gateway or courier was used; nothing was deployed or committed.**
- This document builds on `docs/JCT_SAFE_FIRE_FULL_PROJECT_AUDIT.md`, which records the earlier passes (§1–13G). Findings fixed there are referenced, not repeated.

**Status labels:** CRITICAL / HIGH / MEDIUM / LOW are defects. VERIFIED means the formula or flow was traced and is correct. NEEDS BUSINESS DECISION means the code is consistent but the rule itself needs an owner's decision.

---

## 1. Financial calculation inventory and canonical sources

### 1.1 Canonical sources (single place each value is computed)

| # | Canonical source | File | Computes | Used by |
|---|---|---|---|---|
| C1 | `calculateOrderFinancials` | `backend/src/services/financial.service.js` | line subtotal, coupon split (vendor → item), GST (inclusive/exclusive), shipping share, commission, vendor earnings, final total, taxable value | live checkout (`payment.controller.js`), legacy `placeOrder` |
| C2 | `validateCoupon` / `consumeCouponUsage` | `services/coupon.service.js` | coupon validity, cap, usage-limit consumption | cart preview, checkout |
| C3 | `calculateVendorShippingForGroups` | `services/vendorShipping.service.js` | shipping per vendor package | checkout, `/shipping/estimate`, legacy `placeOrder` |
| C4 | `getVendorGroupPayable` | `financial.service.js` | what the customer paid for one vendor package | package cancellation refunds (customer, vendor, admin), commission snapshot, vendor customer spend, vendor order views |
| C5 | `getShipmentCodAmount` | `financial.service.js` | COD cash for one package | rider cash-in-hand, rider app "cash to collect", admin cash settlement, courier COD remittance, reconciliation |
| C6 | `getReturnRefundForItem` | `financial.service.js` | return refund per unit (GST included, shipping excluded) | return request creation |
| C7 | `recalculateKeptVendorFinancials` | `financial.service.js` | vendor commission/earnings for kept units after a partial return | admin and vendor return completion |
| C8 | `splitMixedRefund` / `refundWalletShare` | `services/cancellationRefundService.js` | wallet vs gateway split of a refund | cancellation service, admin package cancellation, return refunds |
| C9 | `recordReturnRefund` / `executePendingGatewayRefund` | `services/returnRefund.service.js` | return refund destination (card/UPI → gateway; COD/wallet → wallet) | admin and vendor return completion |
| C10 | `processCapturedPayment` | `services/paymentProcessor.js` | capture → stock, commission, coupon use, status; refund of unexpected captures | payment verify, Razorpay webhook (orders, services, exchange upgrades) |
| C11 | `creditWallet` / `debitWallet` | `services/wallet.service.js` | customer wallet balance + ledger (atomic) | every wallet movement |
| C12 | `markVendorPackageDelivered` | `services/orderFinancialHelper.js` | package delivered → escrow start (release date, on-hold credit once, order roll-up) | shipment-delivered listener (rider/courier), admin/vendor status updates |
| C13 | `releaseEscrowPayments` | `cron/escrowCron.js` | escrow → vendor wallet (+ settlement + ledger) | daily cron |
| C14 | `computeServiceQuote` | `services/serviceBookingFlow.service.js` | service price: units × price + visit charge + GST | service quote, booking |
| C15 | service settlement | `vendor/controllers/vendorBooking.controller.js` | service commission (pre-GST base), vendor payout | service completion (customer code required) |
| C16 | `calculatePayout` | `services/payoutCalculator.service.js` | rider pay (rate table, IST night/peak) | rider payouts |
| C17 | `getOrderPriceBreakdown` *(new)* | `frontend/src/shared/utils/orderFinance.js` | order price lines that always add up to the charged total | customer order page, admin order page, admin invoice |
| C18 | `getVendorNetSales` / `isRevenueOrder` | `frontend/src/shared/utils/vendorFinance.js` | vendor net sales; paid-order filter | admin vendor analytics, vendor sales report, admin customer "total spent" |
| C19 | `calculateExchangeDifference` *(16 Nov: now live)* | `financial.service.js` | exchange difference, GST included, per-side GST rate, CGST/SGST/IGST split | exchange request creation (saved as `priceDelta`), upgrade payment, capture check, Admin/Vendor return screens |
| C20 | `resolveVendorCommissionRates` | `services/commission.service.js` | commission rate: vendor's own rate, else Admin default, else 503 | checkout (both entry points), service settlement, commission service |
| C21 | `getPayoutHoldDays` / `getConfiguredReturnWindowDays` | `services/settingsService.js` | return window = payout hold (days), null when not configured | delivery (release date), escrow cron, return requests, customer order detail |
| C22 | `getPayoutEligibility` *(new 16 Nov)* | `services/orderFinancialHelper.js` | payout status (held / eligible / processing / paid / …) from saved escrow state | vendor order detail, vendor wallet schedule |

**Total canonical sources: 22** (20 backend, 2 frontend display helpers). The approved rules built on C19–C22 are listed in `docs/SAFEFIRE_APPROVED_FINANCIAL_RULES.md`.

### 1.2 Formula-by-formula audit

| # | Calculation | Formula in code (canonical) | Verdict |
|---|---|---|---|
| 1 | Line subtotal | `price × qty`, 2 dp | VERIFIED |
| 2 | Retail price | server-side product price; variant price when a variant is chosen | VERIFIED (variant fix F-01) |
| 3 | Wholesale price | `product.wholesale.price`, MOQ enforced, buyer ≠ seller, approved seller | VERIFIED |
| 4 | Coupon validation | dates, usage limit, minimum order, % cap | VERIFIED (F-02) |
| 5 | Coupon amount | `min(coupon, subtotal)`; % coupons capped by `maxDiscount` | VERIFIED |
| 6 | Coupon split | pro rata by vendor subtotal, then by item; last absorbs rounding | VERIFIED (reconciles exactly, tested) |
| 7 | Free-ship coupon | shipping 0 for all packages; discount 0 | VERIFIED |
| 8 | Shipping | per vendor: 0 if vendor pre-coupon subtotal ≥ threshold, else platform rate (express ×2) | VERIFIED. Threshold rule: NEEDS BUSINESS DECISION (BD-4) |
| 9 | GST, exclusive | `(line − coupon share) × rate` | VERIFIED |
| 10 | GST, inclusive | `base = discounted / (1+rate)`, `tax = discounted − base` | VERIFIED |
| 11 | 0% GST | kept at 0 (`?? 18` only when unset) | VERIFIED (F-14) |
| 12 | Discount vs tax order | discount before tax | VERIFIED (GST transaction value is net of discount) |
| 13 | Line total | `discounted + (inclusive ? 0 : tax) + shipping share` | VERIFIED |
| 14 | Order total | Σ line totals; COD rounded to the rupee | VERIFIED |
| 15 | Taxable value | Σ base amounts | VERIFIED (D-4 fix) |
| 16 | COD / extra charges | none implemented (no COD fee, no handling fee) | VERIFIED as absent. Confirm intended (BD-12) |
| 17 | Commission rate selection | `vendor.commissionRate` else platform default; snapshotted per order | VERIFIED. Platform default effectively unused (BD-2) |
| 18 | Commission base | pre-GST, after coupon share; shipping excluded | VERIFIED (products and, after decision A, services) |
| 19 | Vendor earnings | `base − commission + GST` (vendor remits GST) | VERIFIED (confirmed decision A) |
| 20 | Platform revenue | commission + shipping charged | VERIFIED (P&L, §13F) |
| 21 | Package payable | Σ item `finalLineTotal` (legacy: subtotal − discount + tax + shipping) | VERIFIED |
| 22 | COD per package | rounded package payable; last package absorbs rounding; cancelled = 0 | VERIFIED |
| 23 | Full cancel refund | `order.total`, capped by captured − already refunded; wallet/gateway split | VERIFIED |
| 24 | Package cancel refund | package payable, same cap and split | VERIFIED (admin path fixed this pass) |
| 25 | Return refund | paid per unit incl. GST, coupon share excluded, shipping excluded | VERIFIED (decision 1A) |
| 26 | Return refund destination | card/UPI → same source; COD/wallet → wallet | VERIFIED (decision §13D) |
| 27 | Return commission reversal | kept units' snapshot share; clawback = original − kept earnings | VERIFIED |
| 28 | Exchange price difference | `(new unit price − old unit price) × qty` | **NEEDS BUSINESS DECISION (BD-1)**: excludes GST and coupon share |
| 29 | Exchange upgrade collection | must be `collected` before dispatch | VERIFIED (fixed this pass) |
| 30 | Escrow start | package delivered → release date = delivered + 7 days, on-hold credited once | VERIFIED (fixed this pass, CRITICAL) |
| 31 | Escrow release | due date passed, no active return, COD package cash settled, on-hold ≥ earnings | VERIFIED |
| 32 | Vendor withdrawal | atomic `walletBalance ≥ amount` hold; reject → refund to wallet | VERIFIED |
| 33 | Customer wallet | atomic credit/debit, floor in filter, server rounding, reference dedupe | VERIFIED (F-04) |
| 34 | Promo expiry | debits `min(balance, promo)` | NEEDS BUSINESS DECISION (F-20) |
| 35 | Service quote | `units × price + visit charge`, GST on both | VERIFIED |
| 36 | Service commission | pre-GST × rate | VERIFIED (decision A) |
| 37 | Service payout | atomic, after customer completion code | VERIFIED (decision 2B) |
| 38 | Rider pay | base + max(0, km − free km) × rate + night/peak/rain, capped; IST hours | VERIFIED (F-13, F-21) |
| 39 | Rider cash-in-hand | Σ COD package amounts collected − settled | VERIFIED (R-1/R-2) |
| 40 | Courier COD remittance | expected = package COD; received split pro rata | VERIFIED |
| 41 | Admin revenue / sales / top products | Σ total over paid, non-cancelled, non-returned orders | VERIFIED. Partial refunds not netted (BD-5) |
| 42 | Vendor revenue | Σ (subtotal − coupon share) over paid orders, live packages | VERIFIED (same on admin and vendor) |
| 43 | Tax report | Σ order tax over paid, kept orders | VERIFIED (P-2) |
| 44 | Order price display | `getOrderPriceBreakdown` | VERIFIED (fixed this pass) |
| 45 | Checkout display | server estimate; fallback mirrors C3 | VERIFIED (fallback fixed this pass) |

**Total calculations audited: 45.**

---

## 2. Cross-panel consistency matrix

| Metric | Canonical source | Customer | Vendor | Wholesaler | Admin | Rider | Reports |
|---|---|---|---|---|---|---|---|
| Order total | C1 → `Order.total` | `order.total` + C17 breakdown | package payable (C4) | package subtotal | `order.total` + C17 breakdown, invoice C17 | package COD (C5) | Σ total, paid orders |
| GST | C1 item `taxAmount` | C17 (added vs included) | commission `vendorTax` | n/a | C17; tax report Σ `order.tax` (paid) | n/a | tax report |
| Vendor earnings | C1 → Commission `vendorNetEarnings` (C7 after returns) | n/a | commission snapshot; summary Σ `vendorEarnings` | wallet / on-hold | P&L "owed to vendors", vendor analytics | n/a | P&L |
| Commission | C1 → Commission `commissionAmount` | n/a | commission snapshot | n/a | P&L commission | n/a | P&L |
| Refund | C4/C6/C8/C9 → `Refund` | refund banner, order summary label | clawback ledger | n/a | refund records | n/a | — |
| COD amount | C5 | total (single vendor) | n/a | n/a | rider cash, settlement, courier remittance | "cash to collect (this package)" | reconciliation |
| Settlement | C13 → Settlement + `VendorWalletTransaction` | n/a | wallet history | wallet | escrow dashboard | rider ledger | — |
| Wallet balance | C11 | wallet page | `walletBalance` / `onHoldBalance` | same | admin wallet tools | wallet + cash | — |

**Verified consistent after the fixes.** All panels read the stored snapshots above. No panel recomputes commission or earnings independently.

**Duplicated calculations found** (all now routed to a canonical source):
1. package payable recomputed in 6 places (C4);
2. COD amount in 4 places (C5);
3. admin package cancellation refund logic duplicating C8;
4. vendor order list/detail payable fallback;
5. checkout shipping fallback duplicating C3;
6. order price breakdown in 3 screens (C17);
7. vendor net sales in 3 screens (C18);
8. coupon validation in 2 places (C2);
9. "delivered" derived on read in 4 controllers but never persisted (C12).

**Total: 9 duplication groups.**

**Cross-panel inconsistencies found: 11**:
- admin vs vendor revenue (P-3);
- vendor sales report metric mix (P-4);
- customer/admin/invoice breakdown not adding up (fixed this pass);
- vendor dashboard service bookings ₹0 (SV-7);
- customer service breakdown missing visit charge (SV-8);
- rider "total" vs package cash (R-2);
- P&L vs real platform revenue (P-1);
- tax report including unpaid orders (P-2);
- dashboards counting unpaid orders (F-10);
- admin customer "total spent" counting unpaid orders;
- wholesaler revenue ₹0 for rider/courier deliveries (fixed by C12).

Remaining by design: **admin revenue = GMV (incl. GST and shipping)** and **vendor revenue = net product sales**. They are different metrics; label them accordingly (F-22).

---

## 3. End-to-end flow audit

| Flow | Path traced | Financial side effects | Idempotency / concurrency | Result |
|---|---|---|---|---|
| **1. Online order** | Checkout → `POST /user/payment/initialize` → C1 → Order (`payment_pending`) + PaymentAttempt + Razorpay order → `POST /payment/verify` or webhook → C10 (stock, Commission, coupon, `pending`/`paid`) → shipment delivered → C12 → C13 | wallet share debited at init (C11); capture creates commissions; escrow starts at delivery | atomic attempt claim (`created`/`failed`); capture after cancel → auto-refund; webhook events deduplicated (`WebhookEvent`); checkout idempotency key | VERIFIED in tests with mocked Razorpay. **Not run against Razorpay test mode** |
| **2. COD order** | initialize (COD) → transaction: Order, stock (incl. variant), commissions, coupon use, shipments → rider OTP delivery → C12 + rider cash (C5) → admin cash settlement → C13 | rider cash per package; per-vendor escrow after its package cash is settled | idempotency key + unique index; atomic stock | VERIFIED |
| **3. Return & refund** | return request (C6) → approve → pickup → complete (admin/vendor) → C7 + C9 → refund webhook | refund to source/wallet; commission recalculated; clawback from on-hold or wallet | refund reference unique; webhook dedupe; cumulative cap | VERIFIED. Gateway refund via mock only |
| **4. Exchange** | request (price delta) → approve → pickup → replacement preparing → **ready (gate: delta paid)** → out for delivery → complete; downgrade → wallet credit | upgrade paid via EXCHANGE_UPGRADE attempt; downgrade refund to wallet | delta paid before dispatch (fixed); reference-deduped wallet credit | VERIFIED for gating. **Delta formula: BD-1**; upgrade money not reflected in vendor earnings (BD-11) |
| **5. Vendor settlement** | delivery → C12 → cron C13 (eligibility: release date, no active return, COD cash settled, on-hold ≥ earnings) → wallet + Settlement + ledger → withdrawal → admin approve/reject | wallet credit, on-hold debit, ledger | atomic claim lock; ledger reference unique | VERIFIED (end-to-end test: delivery → cron → wallet) |
| **6. Service booking** | quote (C14) → booking (capacity reserved) → payment → vendor start (customer code issued) → complete with code → C15 (transaction) / cancel → refund + capacity release; unpaid online bookings expire | commission pre-GST; payout immediately after customer confirmation | slot reservation atomic; capture after cancel refunded; settlement atomic | VERIFIED |

---

## 4. Defects found in this pass

| ID | Sev | File / function | Root cause | Impact | Status |
|---|---|---|---|---|---|
| FX-1 | **CRITICAL** | `events/listeners/shipmentDelivered.listener.js`, `delivery/controllers/order.controller.js`, courier webhooks | Rider OTP and courier deliveries update only the Shipment. "Delivered" was derived on read and never stored, so no escrow release date or on-hold credit was ever set | **Vendors were never paid for rider- or courier-delivered orders**; wholesaler revenue ₹0; reviews/returns relying on stored status affected | Fixed (C12) + test |
| FX-2 | HIGH | `delivery/controllers/order.controller.js` | Delivered event sent `vendorItems[0].vendorId` | Wrong vendor on multi-vendor orders | Fixed |
| FX-3 | HIGH | `shipmentDelivered.listener.js` | Wrote `escrowStatus: 'release_pending'` (invalid enum) on an arbitrary vendor's commission; the throw skipped the delivered notifications | No "Order delivered" notifications for prepaid orders | Fixed |
| FX-4 | MEDIUM | `services/orderFinancialHelper.js` (F-19) | In-memory once-only guard | Concurrent confirmations could double-credit on-hold | Fixed (atomic) + test |
| FX-5 | HIGH | `services/exchangeWorkflow.service.js` | No check that the upgrade difference was paid | Pricier replacement shipped free (always, in COD-only mode) | Fixed + creation blocked in COD-only + test |
| FX-6 | HIGH | `admin/controllers/order.controller.js` `adminOverrideCancelVendorItem` | Treated every non-COD order as Razorpay-paid | Wallet-paid package cancellations refunded ₹0 | Fixed + test |
| FX-7 | HIGH | same | No wallet/gateway split | Gateway asked for more than captured; wallet share lost | Fixed + test |
| FX-8 | MEDIUM | same | Stock restore ignored the variant bucket and unpaid orders | Variant stock lost; phantom stock | Fixed |
| FX-9 | MEDIUM | `user/controllers/webhook.controller.js` `handleRefundProcessed` | Full/partial decided by one refund | Multi-part refunds stuck as "partially_refunded" | Fixed + test |
| FX-10 | MEDIUM | same + `ServiceBooking.model.js` | Return `refundStatus` never updated by webhooks; booking `refundStatus: 'failed'` not in enum | Card/UPI return refunds always shown pending | Fixed + test |
| FX-11 | MEDIUM | `payment.controller.js` COD branch, `Checkout.jsx` (F-27) | COD ignored the idempotency key; checkout sent none | Duplicate COD orders on retry/double tap | Fixed (+ race returns existing order) |
| FX-12 | MEDIUM | `payoutCalculator.service.js` (F-21) | Server-local hour | Night/peak surcharges shifted 5h30 on UTC hosts | Fixed (IST) + test |
| FX-13 | LOW | `Checkout.jsx` `calculateShippingFallback` | Whole-cart threshold; invented ₹50/₹100 | Wrong preview when estimate fails | Fixed |
| FX-14 | MEDIUM | `UserApp/pages/OrderDetail.jsx`, `Admin/pages/OrderDetail.jsx`, `Admin/pages/orders/Invoice.jsx` | Lines from stored fields; tax-inclusive GST shown as added; legacy discounted subtotal; fabricated 95%/5% split | Breakdown didn't add up to the total | Fixed (C17) |
| FX-15 | LOW | `vendor/controllers/order.controller.js` | Payable fallback added GST twice | Vendor "customer paid" wrong on legacy rows | Fixed |
| FX-16 | LOW | `Commission.model.js` | `escrowStatus: 'cancelled'` written but not allowed | Latent validation failures | Fixed |

Earlier passes found and fixed 50+ further defects (F-01…F-28, SV-01…SV-15, R-1…R-3, C-1…C-3, UI-1…UI-9, P-1…P-4, U-1, U-2); see the project audit document.

---

## 5. Business decisions required

| ID | Question | Current behaviour | Recommendation |
|---|---|---|---|
| BD-1 | Exchange price difference: include GST and coupon share? | **DECIDED & IMPLEMENTED (16 Nov):** GST-inclusive difference, coupon share applied to both sides | Approved Rule 1 |
| BD-2 | Platform default commission: should it apply to vendors without a custom rate? | **DECIDED & IMPLEMENTED:** Admin default applies; no 10% fallback; 503 when unset | Approved Rule 2. Category-level commission still undecided |
| BD-3 | Escrow hold vs return window | **DECIDED & IMPLEMENTED:** hold = configured return window (no extra buffer), fixed at delivery | Approved Rule 3 |
| BD-4 | Free-shipping threshold per vendor or per cart? Before or after coupon? | per vendor, pre-coupon | Confirm (multi-vendor carts above the threshold still pay per package) |
| BD-5 | Net partial refunds out of revenue dashboards? | not netted | Net completed refunds |
| BD-6 | Platform profit: deduct rider/courier delivery cost? | no cost ledger | Add a delivery-cost ledger if P&L must show profit |
| BD-7 | Promo expiry may take refund money (F-20) | `min(balance, promo)` | Expire only unspent promo |
| BD-8 | Quote-based services charged at the estimate (SV-13) | estimate is final | Add a final-quote adjustment step |
| BD-9 | Service cancellation window/fee (SV-15) | full refund until started | Define policy |
| BD-10 | B2B tax invoices (buyer GSTIN, place of supply) | **APPROVED AS REQUIREMENT, NOT IMPLEMENTED:** blocked on the seller-of-record decision (vendor vs SafeFire) | Decide seller of record, then design numbering, credit notes, multi-vendor invoices |
| BD-13 | Category-specific commission | does not exist | Decide whether it is wanted and its precedence over vendor rates |
| BD-14 | Customer-facing policy text says "7 days" (`Admin/pages/policies/RefundPolicy.jsx` default template, `UserApp/pages/PolicyPage.jsx` damaged-goods guarantee) | static text, not linked to the setting | Legal/content owner to align wording with the configured window |
| BD-11 | Upgrade-exchange money: vendor earnings/commission? | collected by platform, not added to vendor earnings | Decide split |
| BD-12 | COD fee / courier COD fees | none charged; courier fees not tracked | Confirm none intended; track courier fees for P&L |

---

## 6. Final readiness assessment

| Area | Status | Basis |
|---|---|---|
| Checkout pricing (retail, wholesale, coupons, GST, shipping) | **PASS (code)** | Canonical engine; unit + end-to-end tests |
| COD orders, rider cash, settlement | **PASS (code)** | End-to-end tests incl. multi-vendor and concurrency |
| Vendor escrow & settlement | **PASS (code)** after FX-1 | Delivery → cron → wallet tested |
| Refunds & returns | **PASS (code)** | Destination, split, webhook, dedupe tested; gateway mocked |
| Exchanges | **PASS (code)** for the amount (16 Nov) | GST-inclusive difference saved once, charged exactly, collected once, dispatch gated; BD-11 (vendor share of upgrade money) still open |
| Commission configuration | **PASS (code)** (16 Nov) | Admin default / vendor override / 503 when unset; snapshots preserved; frontend fallbacks removed |
| Payout hold = return window | **PASS (code)** (16 Nov) | Configured window, snapshot at delivery, blocking and idempotency tested; canonical status shown to vendors |
| Wholesale/B2B GST invoices | **NOT IMPLEMENTED** | Blocked on the seller-of-record decision (BD-10) |
| Customer wallet | **PASS (code)** | Concurrency tested on real MongoDB |
| Services | **PASS (code)** | Quote, capture, completion code, settlement, expiry tested |
| Online payments (Razorpay) | **NOT VERIFIED** | Mock only; COD-only mode in production config |
| Courier integrations | **NOT VERIFIED** | Webhook logic unit-tested; no sandbox run |
| Reports & dashboards | **PARTIAL** | Definitions fixed; BD-5/BD-6 open; exports not exercised |
| Cross-panel consistency | **PASS (code)** | Matrix §2 |
| Real-customer financial readiness | **NOT READY** | See below |

**Why not ready for real customers yet:**
1. Online payments and refunds have never run against Razorpay's test mode.
2. BD-1, BD-2 and BD-3 are now decided and implemented (16 Nov). BD-10 (B2B tax invoices) is still open, so **wholesale sales to GST-registered buyers can't get a valid tax invoice yet**.
   - **Go-live configuration requirement:** Admin must set both the *Default Commission Rate* and the *Return Window* before launch. Without them, checkout for vendors without their own rate returns 503, returns are refused, and vendor payouts stay held. This is deliberate (no hardcoded fallbacks).
3. The backend test folder is git-ignored, so none of these tests run in CI.
4. Pages were never exercised in a browser end to end.
5. Historical-data reconciliation was out of scope here; it is still recommended before go-live (§13G of the project audit).
