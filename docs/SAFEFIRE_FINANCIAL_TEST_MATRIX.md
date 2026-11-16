# SafeFire: Financial Test Matrix

**Environment:** Node 24.19; throwaway local MongoDB 8.2 single-node replica set; real Express app; Razorpay mock mode (`NODE_ENV=test` / `RAZORPAY_MOCK=true`); all `.env` values blanked in DB suites.

**How to run:**
- Unit: `npm run test:financial-audit` (no DB).
- DB suites: `TEST_MONGO_URI="mongodb://127.0.0.1:27999/<name>_test?replicaSet=rs0" npm run test:<suite>-db`. The suites refuse any database whose name lacks "test".

## Latest run: 16 Nov 2026 (approved rules 1–3)

**Environment:** same as below (throwaway local MongoDB 8.2.6 replica set on port 27999, data in a temporary folder, shut down afterwards; Razorpay mock; `.env` values blanked in all DB suites).

**Baseline before any change this pass:** 60 pass / **2 fail** of 62. The failures were `deliveryEscrow.db` #1 and #2: the suite never configured a return window, and after the 7-day fallback was removed (12 Nov) delivery correctly set no release date. The fixture was fixed (it now configures `orders.returnWindow = 7`); the production code was not changed.

| Suite | Command | Tests | 16 Nov result | New this pass |
|---|---|---|---|---|
| Approved rules (unit, no DB) | `test:approved-rules` | 12 | 12 pass | yes |
| Exchange GST (DB, real endpoints) | `test:exchange-gst-db` | 11 | 11 pass | yes |
| Commission configuration (DB, real checkout + settings API) | `test:commission-db` | 6 | 6 pass | yes |
| Payout hold = return window (DB, real delivery helper + cron + APIs) | `test:payout-hold-db` | 9 | 9 pass | yes |
| Financial unit regression | `test:financial-audit` | 18 | 18 pass | — |
| Delivery → escrow (DB) | `test:delivery-escrow-db` | 3 | 3 pass (fixture fixed) | — |
| Rider COD, reconciliation, finance flows, wallet, return, service, checkout (DB) | `test:*-db` | 41 | 41 pass | — |
| Existing scripts | `npm run test:<name>` | 8 | 7 exit 0; `assignment.test.js` prints "passed" then hangs (pre-existing; it initialises Firebase Admin from `.env` but makes no DB calls) | — |
| Frontend production build | `npm run build` | — | pass | — |
| Backend syntax / module load | `node --check` on 320 files; import `app.js` | — | 0 errors; app module graph loads | — |

**16 Nov totals: 100 automated financial tests executed, 100 passed, 0 failed.** 38 were added in this pass.

**Timing note:** `deliveryEscrow.db` #1 failed once on a cold start (the first test took 18 s against an 8 s wait) and passed on every later run (3 consecutive runs plus the final full run).

**Not executed in this pass**
- The new tests were **not** run against the pre-change code. The defects they cover were shown by code reading: the old formula saves ₹200 where the test expects ₹236; the old duplicate filter used a field that was never saved; the old capture handler marked `collected` unconditionally. The `deliveryEscrow` baseline above is the only "before" run.
- Vitest suite, integration/e2e/verification scripts (they use the `.env` database), Razorpay sandbox, browser end-to-end.
- Frontend type check: not applicable (JavaScript project, no `tsconfig` or lint/type-check script).

### Approved-rule scenario coverage (16 Nov)

| Scenario | Expected | Test | Status |
|---|---|---|---|
| ₹1,180 → ₹1,416 exchange | ₹236 saved and charged | unit; exchange-gst #1, #8 | ✔ |
| Different GST rates | each side's own rate (12% → 18%: ₹296) | unit; exchange-gst #3 | ✔ |
| GST inclusive / exclusive / mixed | inclusive not taxed again | unit ×2; exchange-gst #4 | ✔ |
| CGST/SGST vs IGST vs unknown state | 18+18 / 36 IGST / no split invented | unit; exchange-gst #1, #2 | ✔ |
| Cheaper replacement | negative delta, capped at amount paid; no upgrade payment | unit; exchange-gst #6 | ✔ |
| Multiple items and quantities | one combined difference (previously last line only) | unit; exchange-gst #5 | ✔ |
| Rounding | matches checkout; CGST+SGST = GST | unit | ✔ |
| Duplicate / concurrent exchange requests | 409; exactly one created | exchange-gst #7 | ✔ |
| Persisted amount = charged amount | gateway order = `priceDelta`; attempt reused | exchange-gst #8 | ✔ |
| Dispatch blocked until paid | 402, then allowed after capture | exchange-gst #8; flows #1 | ✔ |
| Failed payment then retry; late capture of the failed try | collected once; late capture refunded | exchange-gst #9 | ✔ |
| Capture amount mismatch / rejected exchange | refunded, stays pending | exchange-gst #10, #11 | ✔ |
| Admin default 5 / 10 / 15% | exact rate and amount on order | commission #1 | ✔ |
| Vendor override vs default | own rate wins | commission #2 | ✔ |
| Default missing | checkout 503, no order; own-rate vendors unaffected | commission #3 | ✔ |
| New vendor | stores no rate; follows default | commission #4 | ✔ |
| Invalid commission / return window settings | 400, previous value kept | commission #5; unit ×2 | ✔ |
| Default changed after order | order, Commission and vendor API keep the old rate | commission #6 | ✔ |
| Refund reversal | scales saved commission, not the new rate | commission #6 | ✔ |
| Return window 3 / 7 / 10 days | release = delivery + window | payout-hold #1 | ✔ |
| Return window missing | held, no date, nothing released; date derived once configured | payout-hold #2 | ✔ |
| Window changed after delivery | existing date unchanged, not released early; new deliveries use new window | payout-hold #3 | ✔ |
| Open return | blocks release until closed | payout-hold #4 | ✔ |
| Partial return | only kept earnings released | payout-hold #5 | ✔ |
| Multi-vendor | only delivered package dated and paid | payout-hold #6 | ✔ |
| Concurrent cron (two instances) and repeated runs | one credit, one ledger entry, one settlement | payout-hold #7 | ✔ |
| COD / courier remittance | held until package cash settled | payout-hold #8; ridercod #3 | ✔ |
| Vendor and customer display = backend | payout status/date and return window match saved values | payout-hold #9 | ✔ |
| Wholesale GST invoices | — | none | **not implemented (blocked)** |

---

## Earlier run: 12 Nov 2026

"Fails on old code" means the test was also run against the original files and failed, proving it detects the defect.

## Suites

| Suite | Command | Tests | Result | Fails on old code |
|---|---|---|---|---|
| Financial unit regression | `test:financial-audit` | 18 | 18 pass (also under `TZ=UTC`) | partly (engine-level tests are spec tests) |
| Checkout pricing (DB) | `test:checkout-db` | 7 | 7 pass | 3 demonstrated (variant price, variant stock, coupon); the late-capture and failed-order-cancel tests were not re-run against old code |
| Service flow (DB) | `test:service-db` | 12 | 12 pass | 8 demonstrated (capture after failure, capture after cancel, double slot release, zero capacity, early start, ID clash, failed insert, settlement knock-on); completion-code tests not run against old code |
| Wallet atomicity (DB) | `test:wallet-db` | 4 | 4 pass | yes (2 concurrency tests) |
| Return refund routing (DB) | `test:return-db` | 7 | 7 pass | n/a (new service) |
| Rider COD (DB) | `test:ridercod-db` | 3 | 3 pass | yes (3/3) |
| Read-only reconciliation (DB) | `test:recon-db` | 3 | 3 pass | n/a (new tool) |
| Delivery → escrow (DB) | `test:delivery-escrow-db` | 3 | 3 pass | yes (3/3) |
| Finance flows (DB) | `test:flows-db` | 5 | 5 pass | yes (5/5) |
| Existing scripts | `node src/**/…test.js` | 8 | 7 exit 0; `assignment.test.js` passes then hangs (pre-existing) | — |
| Vitest suite | `npm test` | — | **not executed** (`vitest` not installed, `tests/setup` missing) | — |
| Integration scripts (`tests/integration`, `tests/e2e`, `tests/verification`) | — | — | **not executed** (they use the `.env` database) | — |
| Frontend build | `npm run build` | — | pass | — |

**Totals:** 62 automated financial tests written across the audit passes, **62 executed, 62 passed, 0 failed**. 9 were added in this pass.

## Scenario coverage

| Scenario | Expected | Test | Status |
|---|---|---|---|
| Multi-vendor coupon allocation | vendor shares sum to coupon; package totals sum to order total | unit "coupon split…" | ✔ |
| GST inclusive / exclusive / 0% | inclusive backed out; exclusive added; 0% stays 0 | unit ×3; checkout #4 | ✔ |
| Variant pricing & stock | variant price charged; variant oversell refused | checkout #1, #2 | ✔ |
| Coupon cap / no-expiry / usage limit | cap applied; no-expiry valid; conditional consume | unit ×2; checkout #3 | ✔ |
| Commission & vendor earnings | pre-GST base; earnings = base − commission + GST | unit (partial return), service #3 | ✔ |
| Package payable (no double GST) | Σ line totals | unit ×2 | ✔ |
| COD per package | own share; rounding to last; cancelled 0 | unit ×2 | ✔ |
| Rider cash & settlement | one rider = total once; two riders own share | ridercod #1, #2 | ✔ |
| Courier COD remittance release | vendor released when package cash settled | ridercod #3 | ✔ |
| Delivery → escrow → payout | release date set; on-hold once; cron pays vendor | delivery-escrow #1 | ✔ |
| Multi-vendor delivery | only the delivered vendor starts escrow; order partially delivered | delivery-escrow #2 | ✔ |
| Concurrent delivery confirmations | on-hold credited once | delivery-escrow #3 | ✔ |
| Return refund amount | GST included; coupon share excluded | unit ×3 | ✔ |
| Return refund destination | UPI/card → gateway; COD/wallet → wallet; split; dedupe; missing payment id flagged | return #1–#7 | ✔ |
| Partial return commission reversal | kept units keep GST in earnings | unit | ✔ |
| Full/partial cancellation, mixed payment | gateway ≤ captured, rest to wallet | unit (split); flows #2, #3 | ✔ |
| Failed payment then success (same Razorpay order) | capture accepted | checkout #5; service #2 | ✔ |
| Capture after cancellation | auto-refunded; order not revived | checkout #6; service #4 | ✔ |
| Cancel payment-failed order | wallet share returned; no phantom stock | checkout #7 | ✔ |
| Wallet concurrency | no overspend; balance = ledger | wallet #1, #2 | ✔ |
| Duplicate wallet credit | applied once | wallet #4 | ✔ |
| Duplicate webhook | processed once | flows #4 | ✔ |
| Refund webhook status | refunded only when cumulative ≥ total; return updated; failure flagged | flows #4, #5 | ✔ |
| Exchange upgrade gate | blocked until paid; downgrades unaffected | flows #1 | ✔ |
| Service: completion code, settlement, expiry, capacity | code required; atomic settlement; expiry releases slot | service #3, #5–#12 | ✔ |
| Rider pay config zeros / IST windows | 0 honoured; IST night window | unit ×2 | ✔ |
| Reconciliation read-only | finds planted issues; DB unchanged; refuses writers | recon #1–#3; unit | ✔ |

## Not covered (gaps)

| Gap | Why | Risk |
|---|---|---|
| Razorpay test-mode run (real orders, refunds, webhooks) | no credentials/sandbox in this environment | HIGH: online payments unverified end to end |
| Shiprocket/Delhivery sandbox webhooks | same | MEDIUM |
| Concurrent duplicate COD checkout over HTTP | not automated (unique index + replay code reviewed) | LOW |
| Exchange upgrade payment capture → `collected` | **covered 16 Nov** by `exchangeGst.db` #8–#11 (mock gateway) | LOW |
| Exchange tests against pre-change code | not re-run against the old files | LOW |
| Admin settings pages and vendor screens in a browser | build passes; not clicked through | MEDIUM |
| Vendor withdrawal approve/reject, rider withdrawal | code reviewed only | MEDIUM |
| Gift card purchase/redeem | code reviewed only | LOW |
| Admin report exports (Excel/PDF) | not exercised | LOW |
| Browser end-to-end (Playwright) of every panel | not run | MEDIUM |
| Tests in CI | `backend/tests/` git-ignored | HIGH (no regression protection) |
