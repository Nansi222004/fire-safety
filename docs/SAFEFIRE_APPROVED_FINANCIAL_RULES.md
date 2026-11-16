# SafeFire: Approved Financial Rules

**Read this before changing any code that moves or displays money.** Every rule below has one canonical implementation. Reuse it; do not write a second formula, and do not add a hardcoded fallback value. Where Admin has not configured a value, the code **fails clearly or keeps money held**. It never guesses.

Last updated: 16 Nov 2026.

## How to use this document
- Each rule lists its **canonical source** (the only place the value is computed) and its **configuration** (where Admin sets it).
- "Snapshot" means the value is saved on the order, commission or request when the event happens, and later setting changes never rewrite it.
- Tests that lock each rule are listed. Run them before merging any change to the files named.

---

## Rule 1: Exchange price difference includes the GST difference

**Status:** approved; implemented and tested (16 Nov 2026).

**Rule**
- The amount a customer pays (or is refunded) for an exchange is the **difference between the GST-inclusive totals** of the replacement and the original units:
  - original = the exchanged units **as bought**: the order item's own price, GST rate and inclusive/exclusive snapshot, less the coupon share they got;
  - replacement = the same quantity of the new variant at its **current** price, with the **replacement product's** GST rate and inclusive/exclusive setting, less the same coupon share.
- Example: ₹1,000 + 18% (₹1,180) exchanged for ₹1,200 + 18% (₹1,416) → **₹236**, not ₹200.
- Each side uses its own GST rate. The original rate is never applied to the difference.
- Shipping is not part of an exchange difference.
- A cheaper replacement gives a negative difference: a refund, never more than the customer paid for those units.
- The GST part of the difference is split CGST + SGST (same state) or IGST (different states), using the vendor's address state and the shipping address state. If either state can't be identified, the split is `undetermined`: no split is invented.

**Canonical source**
- `calculateExchangeDifference` in `backend/src/services/financial.service.js`. It prices both sides with `calculateOrderFinancials` (the checkout engine), so rounding matches checkout.
- `splitGst` and `stateCodeFromName` in `backend/src/services/gst.service.js`.

**Where it is applied**
- `createReturnRequest` (`user/controllers/order.controller.js`) calls it **once for all exchanged lines** and saves the result on the request: `exchangeDetails.priceDelta`, `originalAmount`, `replacementAmount`, `taxableDifference`, `taxDifference`, `gstSplit` and `calculationLines`.
- `priceDelta` is the **only** amount used afterwards:
  - `exchangeUpgradePayment` (`user/controllers/payment.controller.js`) creates the gateway order for exactly `priceDelta` and records it as `PaymentAttempt.amount`;
  - `processCapturedPayment` (`services/paymentProcessor.js`) marks the difference `collected` **once**, only if the captured attempt's amount equals the saved `priceDelta` and the request is still open. Any other capture (duplicate, late capture of a failed try, mismatched amount, rejected or completed request) is refunded automatically through `refundUnexpectedCapture`;
  - `markReplacementReady` / `completeExchange` (`services/exchangeWorkflow.service.js`) refuse with HTTP 402 until the difference is `collected` or `waived`;
  - Admin and Vendor return screens display the saved values (`frontend/src/shared/components/ExchangeGstBreakdown.jsx`) and never recalculate them.
- One open return or exchange per vendor package: concurrent submissions are serialised in a transaction (`createReturnRequest`).

**Do not**
- compute `(new price − old price) × qty` anywhere;
- charge or display an exchange amount that isn't `exchangeDetails.priceDelta`.

**Tests:** `tests/unit/approvedRules.test.mjs` (exchange cases), `tests/unit/exchangeGst.db.test.mjs` (end to end), `tests/unit/financeFlows.db.test.mjs` #1 (dispatch gate).

---

## Rule 2: Commission is set by Admin, never hardcoded

**Status:** approved; implemented and tested (backend 12 Nov, frontend and tests 16 Nov 2026).

**Rule**
- A vendor's commission rate is:
  1. the vendor's own Admin-set rate (`Vendor.commissionRate`, percent 0–100), when present;
  2. otherwise the Admin-configured platform default (`Settings general.defaultCommissionRate`, percent 0–100).
- If neither exists, the action that needs a rate (checkout, service booking settlement) **fails with HTTP 503** and a clear message. There is no 10% fallback.
- New vendors are created with `commissionRate: null`, so they follow the platform default.
- The rate in force is **snapshotted** on each order (`vendorItems[].commissionRate`, per-item `commissionAmount`) and on the `Commission` record at checkout. Changing the default or a vendor's rate affects **only new orders**.
- Refund and return reversals scale the **saved** commission (`recalculateKeptVendorFinancials`); they never re-apply a current rate. Full returns cancel the commission.
- Commission base: the pre-GST taxable value after coupon. Vendor earnings = base − commission + GST of the vendor's items.
- **Category-specific commission does not exist** and is not part of this rule. It needs a separate business decision (who sets it, and precedence over vendor rates) before it is built.

**Canonical source**
- `resolveVendorCommissionRates` and `getCommissionRateSource` in `backend/src/services/commission.service.js`.
- `getDefaultCommissionRate` (throws 503), `getConfiguredDefaultCommissionRate` (returns null) and `assertValidCommissionPercent` (400 on invalid input) in `backend/src/services/settingsService.js`.

**Configuration**
- Admin → Settings → General → Vendors → *Default Commission Rate (%)* (`frontend/.../Admin/pages/settings/GeneralSettings.jsx`).
- Per vendor: Admin → Vendors → vendor → Commission (`commissionRate`, sent as a fraction 0–1 and stored as a percent; `null` = follow the default).

**Display**
- Admin vendor screens show the effective rate, or **"Not configured"** (`formatCommissionRate` in `frontend/src/shared/utils/vendorFinance.js`).
- Vendor order screens show the saved commission, rate and earnings from `vendorFinancials`, or "Not available". They never estimate.

**Do not:** write `commissionRate || 10`, `?? 10`, `|| 0.1` or any default rate in backend or frontend code.

**Tests:** `tests/unit/commissionConfig.db.test.mjs`, `tests/unit/approvedRules.test.mjs` (validation).

---

## Rule 3: Vendor payout hold = the configured return window

**Status:** approved; implemented and tested (backend 12 Nov, display and tests 16 Nov 2026).

**Rule**
- When a vendor's package is delivered, its payout becomes eligible on **delivery date + return window (days)**.
- The return window is the Admin setting `Settings orders.returnWindow`, falling back to `general.returnWindow`. It must be a whole number of days from 0 to 365.
- The date is **snapshotted at delivery** on the commission (`Commission.escrowReleaseDate`). Changing the window later affects only packages delivered afterwards. Existing dates are never moved, so held funds are never released early.
- If the window is **not configured**:
  - delivery still credits on-hold, but no release date is set and the funds stay held;
  - customer returns are refused;
  - once Admin configures the window, the escrow run fills in the date from the delivery date for those packages.
- Eligibility is **not** immediate payout. The daily escrow run pays an eligible commission only if:
  - for COD: that package's cash is settled (by the rider or by courier remittance);
  - there is no open return or exchange for that vendor and order;
  - the vendor's on-hold balance covers the amount.
- Each commission is released once:
  - a database claim lock (`escrowStatus held → processing`) protects multi-server runs;
  - an in-process guard prevents overlapping runs;
  - a unique ledger reference (`ESCROW_RELEASE_<order>_<vendor>_<commission>`) is written with each release.

**Canonical source**
- `getPayoutHoldDays` / `getConfiguredReturnWindowDays` / `getReturnWindowDays` (throws 503) / `assertValidReturnWindowDays` in `backend/src/services/settingsService.js`.
- `markVendorPackageDelivered` in `backend/src/services/orderFinancialHelper.js`: sets the release date at delivery.
- `releaseEscrowPayments` in `backend/src/cron/escrowCron.js`: pays out.
- `getPayoutEligibility` in `backend/src/services/orderFinancialHelper.js`: the **only** source of the payout status shown to people. Statuses: held, eligible, processing, paid, cancelled, refunded, failed.

**Configuration**
- Admin → Settings → Orders & Customers → *Return Window (Days)* (`OrdersCustomersSettings.jsx`).

**Display**
- Vendor order detail: `vendorFinancials.payout`.
- Vendor wallet: `expectedReleases[].payoutStatus` / `releaseDate`.
- Admin order detail: commission release date.
- Customer order detail: `returnWindow { days, configured, expiresAt, expired }` from `getOrderDetail`.
- No screen computes its own date.

**Do not:** use `7 * 24 * 60 * 60 * 1000`, "7 days" or any fixed hold in payout or return logic, or recompute an existing package's date from the current setting.

**Tests:** `tests/unit/payoutHold.db.test.mjs`, `tests/unit/deliveryEscrow.db.test.mjs`, `tests/unit/riderCod.db.test.mjs`, `tests/unit/approvedRules.test.mjs`.

---

## Rule 4: Wholesale/B2B GST invoices

**Status:** approved as a requirement; **NOT IMPLEMENTED, blocked on a business decision.**

**Blocking decision:** who is the legal **seller of record** on a wholesale sale: each vendor (under its own GSTIN) or SafeFire. Until that is decided, the following can't be designed: invoice numbering series (per seller and financial year), GSTIN ownership, multi-vendor invoice structure, credit notes.

**What exists**
- Order-level `invoiceNumber = INV-<orderId>`. This is not per seller and not a financial-year sequence, so it is not a GST tax invoice.
- GST helpers in `gst.service.js` (GSTIN validation, state codes, CGST/SGST/IGST split, financial-year label) are ready to reuse.

**Do not**
- print SafeFire's GSTIN on vendor sales;
- invent seller details;
- label the current order invoice a "Tax Invoice" for B2B buyers.

---

## Earlier approved rules (still in force)
- **Return refund** = what the customer paid for the returned units, GST included, coupon share excluded, shipping excluded (`getReturnRefundForItem`).
- **Refund destination:** card/UPI → original method via Razorpay; COD/wallet → SafeFire wallet (`returnRefund.service.js`).
- **Mixed wallet + gateway refunds:** never ask the gateway for more than it captured (`splitMixedRefund`).
- **COD per package:** each package collects only its own share (`getShipmentCodAmount`).
- **Package payable:** the sum of line totals, never `subtotal − discount + tax + shipping` for tax-inclusive items (`getVendorGroupPayable`).
