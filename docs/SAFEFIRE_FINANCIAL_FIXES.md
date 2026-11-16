# SafeFire: Financial Fixes

- **16 Nov 2026 pass:** approved business rules 1–3 (see the next section and `docs/SAFEFIRE_APPROVED_FINANCIAL_RULES.md`).
- **12 Nov 2026 pass:** FX-1…FX-16 (further below).

## 16 Nov 2026: approved financial rules

**What was already in place before this pass (12 Nov, kept unchanged)**
- Backend commission resolution without a 10% fallback (`resolveVendorCommissionRates`, `getDefaultCommissionRate` → 503).
- Backend payout hold from the return window (`getPayoutHoldDays`, release date set at delivery in `markVendorPackageDelivered`, escrow cron).
- The exchange dispatch gate (FX-5).
- The written-but-unused `calculateExchangeDifference`.

### AR-1 (HIGH): exchange charged without GST; multi-item exchanges kept only the last line
- **Before:**
  - `createReturnRequest` saved `(replacement price − original price) × qty` per item, overwriting the previous item each time. A ₹1,180 → ₹1,416 exchange charged **₹200 instead of ₹236**, and a two-item exchange saved only the second item's difference.
  - `calculateExchangeDifference` existed but nothing called it.
- **After:**
  - exchanged lines are collected, then priced **once** by `calculateExchangeDifference`, which uses the order-item snapshot for the original side and the replacement product's GST rate and inclusive setting;
  - the CGST/SGST/IGST split comes from the vendor and shipping-address states;
  - the result is saved as `exchangeDetails.priceDelta` plus the breakdown (`originalAmount`, `replacementAmount`, `taxableDifference`, `taxDifference`, `gstSplit`, `calculationLines`);
  - the COD-only refusal message now quotes the GST-inclusive amount.
- **Files:** `user/controllers/order.controller.js` (`createReturnRequest`), `models/ReturnRequest.model.js`.

### AR-2 (HIGH): exchange difference could be collected twice or for the wrong amount
- **Before:** any captured `EXCHANGE_UPGRADE` attempt set `priceDeltaStatus: 'collected'`, unconditionally. After a failed first try and a retry (new gateway order), a late capture of the first try was also accepted, so the **customer paid twice and nothing was refunded**. A capture after the exchange was rejected was also kept.
- **After:**
  - the upgrade attempt stores `amount` = the saved `priceDelta`;
  - on capture, the request moves `pending → collected` in one conditional update, only if the attempt amount equals the saved `priceDelta` and the request isn't rejected or completed;
  - every other capture is refunded through the existing `refundUnexpectedCapture` (status `captured_refunded` plus a `Refund` record);
  - the payment endpoint refuses rejected or completed exchanges and numbers retry attempts.
- **Files:** `services/paymentProcessor.js`, `user/controllers/payment.controller.js` (`exchangeUpgradePayment`), `models/PaymentAttempt.model.js` (`amount`, index on `relatedReturnId`).

### AR-3 (MEDIUM): duplicate return/exchange requests were not blocked
- **Before:**
  - the "one open request per package" check filtered on `originalShipmentId`, which `createReturnRequest` never saved, so for shipped orders it never matched and duplicates were created;
  - the check was a read followed by a create, so concurrent submissions also slipped through.
- **After:**
  - the check uses order + customer + vendor (one forward shipment per vendor is already enforced);
  - the create runs in a transaction that also writes the order document, so concurrent submissions conflict and the loser gets 409;
  - `originalShipmentId` is now saved.
- **File:** `user/controllers/order.controller.js`.

### AR-4 (MEDIUM, display): Admin and Vendor exchange screens show the GST breakdown
- Shows the saved original and replacement amounts and the taxable + GST split. Nothing is recalculated.
- **Files:** `frontend/src/shared/components/ExchangeGstBreakdown.jsx` (new), `Admin/pages/ReturnRequestDetail.jsx`, `Vendor/pages/returns/ReturnRequestDetail.jsx`.

### AR-5 (MEDIUM): fabricated 10% / 0% commission on Admin and Vendor screens
- **Before:**
  - Admin settings showed `defaultCommissionRate || 10`: an unset default showed as 10%, and a saved 0% also showed as 10%. The input max was 50, while the backend allows 100;
  - the Vendor order page estimated commission and earnings at `commissionRate || 10` when no record was loaded;
  - Admin vendor pages showed an unset effective rate as 0.0%.
- **After:**
  - Admin settings show "Not configured" when unset and validate 0–100 like the backend; a configured default can't be blanked;
  - the Vendor order page shows the saved commission, rate and earnings (`vendorFinancials.commissionRate` added to the API), or "Not available";
  - Admin vendor pages use `formatCommissionRate` ("Not configured" or "x% (default)").
- **Files:** `Admin/pages/settings/GeneralSettings.jsx`, `Vendor/pages/orders/OrderDetail.jsx`, `vendor/controllers/order.controller.js`, `frontend/src/shared/utils/vendorFinance.js`, `Admin/pages/vendors/{CommissionRates,ManageVendors,VendorDetail}.jsx`.

### AR-6 (HIGH): hidden 7-day return window saved by the frontend; no Admin field for it
- **Before:**
  - the frontend settings store defaulted `orders.returnWindow: 7`, and saving Order settings merged that default in. On a system that had never saved `orders`, the first save **silently set a 7-day window** that no field showed;
  - Admin had no input for the return window at all.
- **After:**
  - the default is removed;
  - Admin → Settings → Orders has a *Return Window (Days)* field, validated 0–365 like the backend, and it explains that the window also sets the vendor payout hold.
- **Files:** `frontend/src/shared/store/settingsStore.js`, `Admin/pages/settings/OrdersCustomersSettings.jsx`.

### AR-7 (MEDIUM, display): customer "7-Day Return Policy" was hardcoded
- **Before:** the customer order page computed expiry as delivery + 7 days and showed "7-Day Return Policy", whatever the setting.
- **After:**
  - `getOrderDetail` returns `returnWindow { days, configured, expiresAt, expired }` from the Admin setting;
  - the page shows it, with "Return window not available" when unset, and hides the return button when closed.
- **Files:** `user/controllers/order.controller.js` (`getOrderDetail`), `UserApp/pages/OrderDetail.jsx`.

### AR-8 (MEDIUM, display): vendor payout status/date
- **Before:**
  - the wallet schedule fell back to the order-level `escrowReleaseDate`, which the escrow cron never uses;
  - it showed "Releases in null days" when there was no date;
  - the order page showed no payout state.
- **After:** a canonical `getPayoutEligibility` (held / eligible / processing / paid / cancelled / refunded / failed, with a reason such as `return_window_not_configured`) drives `vendorFinancials.payout` and `expectedReleases[].payoutStatus`. It uses the commission's saved date only.
- **Files:** `services/orderFinancialHelper.js`, `vendor/controllers/{order,wallet}.controller.js`, `Vendor/pages/orders/OrderDetail.jsx`, `Vendor/pages/WalletHistory.jsx`.

### AR-9 (test fixture): `deliveryEscrow.db` #1/#2 failing since 12 Nov
- The suite never configured a return window. After the 7-day fallback was removed, delivery correctly set no release date and the tests failed. The fixture now configures `orders.returnWindow = 7` the way Admin does. **No production fallback was added.**

### Tests added and results (executed 16 Nov 2026)
- **New suites** (38 tests): `approvedRules.test.mjs` (12), `exchangeGst.db.test.mjs` (11), `commissionConfig.db.test.mjs` (6), `payoutHold.db.test.mjs` (9). npm scripts: `test:approved-rules`, `test:exchange-gst-db`, `test:commission-db`, `test:payout-hold-db`.
- **Full run: 100/100 pass.** The pass is 13 suites; before this pass's changes the baseline was 60/62, with the 2 failures caused by the AR-9 fixture.
- **Other checks:** 7/8 existing scripts exit 0 (`assignment.test.js` passes then hangs, as before). The frontend build passes. Backend `node --check`: 0 errors in 320 files. The app module graph loads.
- **Not done:** the new tests were not run against the pre-change code. Details are in the test matrix.

### Not changed (decisions pending)
- Wholesale/B2B GST invoices (seller of record).
- Category-level commission.
- Static policy texts that mention 7 days.

All changes are uncommitted in the working tree. Each fix has a regression test that **fails on the original code and passes with the fix**, except where marked "display" (verified by build plus the shared-helper unit logic).

Earlier fixes (F-01…F-28, SV-*, R-*, C-*, UI-*, P-*, U-*) are recorded in `docs/JCT_SAFE_FIRE_FULL_PROJECT_AUDIT.md` §12–13F.

## Fixes

### FX-1 (CRITICAL): rider/courier deliveries never started vendor escrow
- **Before:** Rider OTP delivery and Shiprocket/Delhivery webhooks updated only the Shipment. The Order package was never stored as `delivered`, the commission never got a release date, and on-hold was never credited, so **the escrow cron never paid these vendors.**
- **After:** a new canonical `markVendorPackageDelivered` (`services/orderFinancialHelper.js`), run from the shipment-delivered listener for forward shipments:
  - atomically marks the package delivered and claims the one-time on-hold credit;
  - sets `escrowReleaseDate = delivered + 7 days` and credits on-hold;
  - rolls the order up to `delivered` or `partially_delivered`.
- **Files:** `services/orderFinancialHelper.js`, `events/listeners/shipmentDelivered.listener.js`.
- **Test:** `deliveryEscrow.db` #1 (real rider endpoint → listener → cron pays the vendor).

### FX-2 (HIGH): wrong vendor on the delivered event
- **Before:** `vendorId: order.vendorItems[0].vendorId`. **After:** `shipment.vendorId`.
- **File:** `delivery/controllers/order.controller.js`. **Test:** `deliveryEscrow.db` #2.

### FX-3 (HIGH): invalid escrow write killed delivered notifications
- Removed the `escrowStatus: 'release_pending'` write (rejected by the schema, picked an arbitrary vendor). Notifications now run.
- **File:** `shipmentDelivered.listener.js`. **Test:** covered by `deliveryEscrow.db` #1/#2 (listener completes).

### FX-4 (MEDIUM): on-hold double credit race (F-19)
- **Before:** in-memory flag. **After:** flag claimed in the same atomic update that marks the package delivered; `handleOrderDeliveryBalances` delegates to it.
- **Test:** `deliveryEscrow.db` #3 (5 concurrent confirmations → credited once).

### FX-5 (HIGH): upgrade exchanges dispatched without payment
- **Before:** nothing checked `priceDeltaStatus`.
- **After:** `markReplacementReady` and `completeExchange` require the difference to be `collected`/`waived` (HTTP 402 otherwise). Creating an upgrade exchange in COD-only mode is refused with a clear message.
- **Files:** `services/exchangeWorkflow.service.js`, `user/controllers/order.controller.js`. **Test:** `financeFlows.db` #1.

### FX-6, FX-7, FX-8 (HIGH/HIGH/MEDIUM): admin package cancellation
- **Before:**
  - wallet-paid orders were refunded **₹0**;
  - wallet + UPI orders asked Razorpay for more than it captured;
  - variant stock wasn't restored;
  - unpaid orders got phantom stock.
- **After:**
  - refunds route through the shared `splitMixedRefund`/`refundWalletShare`;
  - a missing payment ID is recorded as a `failed` refund for manual handling, never silently moved to the wallet;
  - variant-aware stock restore, skipped for unpaid orders.
- **Files:** `admin/controllers/order.controller.js`, `services/cancellationRefundService.js` (export). **Tests:** `financeFlows.db` #2, #3.

### FX-9, FX-10 (MEDIUM): refund webhooks
- **Before:**
  - full/partial status was decided by a single refund;
  - return requests never moved off "pending";
  - the service `refundStatus: 'failed'` value wasn't allowed by the schema.
- **After:**
  - status uses the cumulative completed refunds;
  - the return `refundStatus` becomes `processed`/`failed`;
  - the schema allows `failed`.
- **Files:** `user/controllers/webhook.controller.js`, `models/ServiceBooking.model.js`. **Tests:** `financeFlows.db` #4 (incl. duplicate webhook → processed once), #5.

### FX-11 (MEDIUM): duplicate COD orders (F-27)
- **Before:** the COD branch ignored the idempotency key and checkout sent none.
- **After:**
  - checkout sends one key per order attempt, renewed when cart, payment method, address or coupon change;
  - COD orders store the key;
  - a concurrent duplicate hits the unique index and returns the existing order.
- **Files:** `user/controllers/payment.controller.js`, `frontend/.../UserApp/pages/Checkout.jsx`.
- **Test:** backend guard covered by the unique index and the replay path; **no automated concurrent HTTP test** (see test matrix).

### FX-12 (MEDIUM): rider surcharge windows in server time (F-21)
- The hour is now computed in IST. **File:** `services/payoutCalculator.service.js`. **Test:** unit (run under `TZ=UTC`).

### FX-13 (LOW, display): checkout shipping fallback
- Now mirrors the backend rule (per vendor, platform rate, ₹0 means free). **File:** `Checkout.jsx`.

### FX-14 (MEDIUM, display): order price breakdown
- **Before:** tax-inclusive GST was shown as added; legacy orders showed the discount twice; admin invented a 95%/5% split.
- **After:** shared `getOrderPriceBreakdown`. Lines (subtotal − discount + GST added + shipping + rounding) always equal the charged total, and included GST is shown separately.
- **Files:** `frontend/src/shared/utils/orderFinance.js` (new), `UserApp/pages/OrderDetail.jsx`, `Admin/pages/OrderDetail.jsx`, `Admin/pages/orders/Invoice.jsx`.

### FX-15 (LOW): vendor order views payable fallback
- Uses `getVendorGroupPayable`. **File:** `vendor/controllers/order.controller.js`.

### FX-16 (LOW): Commission `escrowStatus: 'cancelled'` not allowed by the schema
- Added to the enum. **File:** `models/Commission.model.js`.

## Tests added in this pass
- `tests/unit/deliveryEscrow.db.test.mjs`: 3 tests (`npm run test:delivery-escrow-db`).
- `tests/unit/financeFlows.db.test.mjs`: 5 tests (`npm run test:flows-db`).
- `tests/unit/financialAudit.regression.test.mjs`: +1 (IST surcharge).

## Verification results (executed 12 Nov 2026)
- **New tests fail on the original code:**
  - `deliveryEscrow.db` 3/3 fail;
  - `financeFlows.db` 5/5 fail (with the original `exchangeWorkflow`, admin order controller and webhook controller).
- **All suites pass with the fixes:**
  - unit 18/18 (under `TZ=UTC`);
  - checkout 7, service 12, wallet 4, return 7, rider COD 3, reconciliation 3, delivery-escrow 3, flows 5;
  - existing scripts 7/7.
- **Static checks:** 0 syntax errors (all backend files), 270 modules load, undefined-variable scan clean (only the browser built-in `PopStateEvent`), frontend production build passes, frontend→backend route check unchanged (25 unmatched are dead code or dynamic-prefix false positives).

## Remaining risks
- Razorpay and courier integrations verified only with mocks.
- Business decisions BD-1…BD-12 (see the audit document).
- `backend/tests/` is git-ignored, so these tests are not in version control or CI.
- The legacy `POST /api/user/orders` checkout route is still reachable (the UI no longer uses it); consider disabling it so pricing has one entry point.
- Existing data: orders delivered by riders/couriers before this fix never started escrow. After deployment those packages stay "not delivered" in the Order until reconciled (the reconciliation tool in §13G of the project audit lists them as held commissions without a release date).
