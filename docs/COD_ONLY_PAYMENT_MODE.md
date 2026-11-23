# SafeFire — Payment Methods: Admin Switches, COD and Online Payments (Runbook)

> This file used to describe a `.env`-only "COD-only mode". Payment methods are now controlled by **Admin switches**.
> `PAYMENT_MODE` in `.env` is only the starting default until an Admin saves the payment settings (see §3).

## 1. Summary

- An Admin turns **Cash on Delivery**, **Online Payments (Razorpay)**, **Card**, **UPI** and **SafeFire Wallet** on or off
  from the Admin panel. No code change, deploy or restart is needed.
- Turning COD **off** stops **new** COD orders and bookings only. COD code, data and every COD workflow for existing
  orders (rider cash, courier remittance, settlement, cancellations, returns) stay in place and keep working.
  COD can be switched back on at any time.
- The backend enforces the switches on every endpoint that creates an order or booking, so hiding a method in the
  storefront is not the only protection.

## 2. Where the switches are

**Admin → Settings → Payment & Shipping → Payment Methods**
(`/admin/settings/payment-shipping`, `frontend/src/modules/Admin/pages/settings/PaymentShippingSettings.jsx`)

| Switch | Stored as (`Settings` key `payment`) | Effect on new orders / bookings |
|---|---|---|
| **Online Payments (Razorpay)** — master switch | `onlineEnabled` | Off: no Card or UPI payments anywhere (checkout, wholesale, service bookings, payment retry, exchange price-difference payments). |
| **Cash on Delivery (COD)** | `codEnabled` | Off: no COD product orders, no COD wholesale orders, no "Pay on Service" bookings. |
| **Credit/Debit Card** | `cardEnabled` | Only takes effect while Online Payments is on (the checkbox is greyed out otherwise). |
| **UPI** | `upiEnabled` | Only takes effect while Online Payments is on (greyed out otherwise). |
| **SafeFire Wallet** | `walletEnabled` | Off: wallet cannot pay an order or booking, fully or partly. |

Rules applied when saving (frontend and backend, `PUT /api/admin/settings/payment`):

- At least one way to pay the full amount must stay on: **COD**, or **Online Payments with Card or UPI**. Otherwise the
  save is refused with *"Keep at least one payment method on: Cash on Delivery, or Online Payments with Card or UPI enabled."*
- The Wallet alone does not count (customers without a balance could not order).
- Switch values must be `true`/`false`; anything else is refused.
- Only Admins can change these settings.

The page also shows: *"Changes apply to new orders and bookings only. Existing Cash on Delivery orders, collections and
settlements are not affected."*

## 3. Defaults and how `.env` relates to the Admin switches

The effective settings are computed by `resolvePaymentSettings` in `backend/src/services/settingsService.js`:

| Setting | When the Admin has **never saved** it | After the Admin saves |
|---|---|---|
| Online Payments | Follows `PAYMENT_MODE` in `backend/.env`: `ONLINE_ENABLED` → on; unset or anything else → **off** | The saved Admin value, regardless of `PAYMENT_MODE` |
| COD, Card, UPI, Wallet | On (a missing value means on) | The saved Admin value |

So, on a server where `PAYMENT_MODE` is unset and nobody has saved the payment page yet, the shop behaves exactly as
the old COD-only mode: **COD on, Wallet on, Card/UPI off**. While the Online switch has never been saved, the Admin page
shows a note: *"Not saved yet — currently following the server default (on/off). Saving this page stores your choice."*
Saving the page stores every switch explicitly, and from then on the Admin choice wins over `.env`.

Which Razorpay account is used (test or live) is a separate server setting: `RAZORPAY_LIVE=true|false` with the
`RAZORPAY_TEST_*` / `RAZORPAY_LIVE_*` keys in `backend/.env` (`backend/src/config/razorpayConfig.js`). The backend logs
`[Razorpay] Using TEST keys` or `Using LIVE keys` at startup.

## 4. What the backend enforces

Every new-order entry point checks the switches through `isPaymentMethodEnabled` / `isOnlinePaymentActive`
(`backend/src/services/settingsService.js`). A disabled or missing method is refused with HTTP 400 before any order,
booking, stock deduction or Razorpay order is created.

| Entry point | Endpoint | Behaviour |
|---|---|---|
| Product checkout | `POST /api/user/payment/initialize` | Method must be enabled. `cash` is treated as `cod`; method names are case-insensitive (`COD`, `Cash` are refused too when COD is off). Missing method → *"Please choose a payment method."* Wallet used together with card/UPI also needs the Wallet switch on. |
| Wholesale (B2B) | same endpoint with `orderType: 'b2b'` | Same checks as product checkout, before any wholesale checks. Supports online payment and COD. |
| Legacy order endpoint | `POST /api/user/orders` | Same method check. Non-COD methods are handed to `initializePayment`, so card/UPI orders always get a Razorpay order (this endpoint can no longer create an unpaid card/UPI order). |
| Service booking | `POST /api/customer/bookings` | A method must be chosen (there is no COD default). `cod`/`cash` = Pay on Service, needs COD on. `online`/`upi`/`card` = pay now via Razorpay, needs Online Payments on (stored as `upi`). `wallet` needs Wallet on. Checked before any capacity slot is reserved. |
| Payment retry | `POST /api/user/payment/retry/:orderId` | Needs Online Payments on, and the order's method still enabled. |
| Exchange price difference | `POST /api/user/payment/exchange-upgrade/:returnRequestId` (and exchange requests with a higher price) | Needs Online Payments on. |

The storefront reads the same resolved settings from `GET /api/settings/checkout` (`payment.cod`, `razorpay`, `upi`,
`wallet`, `onlineEnabled`, `paymentMode`). That endpoint reads the database directly, so a change shows on the next page
load. Order endpoints cache settings for up to 10 seconds (the cache is cleared when the Admin saves), so a request from
an old, already-open page is still checked against the current switches.

## 5. What customers see

| Screen | Behaviour |
|---|---|
| Checkout (`Checkout.jsx`) | Shows only enabled methods (COD, SafeFire Wallet, Card, UPI). Nothing is pre-selected as COD; if settings cannot load, an error with **Retry** is shown instead of falling back to COD. The wallet is selectable only when the balance covers the total. |
| Service booking wizard (`ServiceBookingWizard.jsx`) and service detail page (`ServiceDetailPage.jsx`) | Show only enabled methods. "Pay Online Now" is preferred when available; "Pay On Service" appears only while COD is on. |
| Wholesale (`Wholesale.jsx`) | Offers "Pay Online (Card / UPI)" and/or "Cash on Delivery" per the switches; online orders open Razorpay and are confirmed via `POST /api/user/payment/verify`. |
| Product page (`ProductDetail.jsx`) | "Cash on Delivery available" is shown only when COD is on **and** the product allows COD (`codAllowed`). |

Order history, order details, invoices and confirmation screens still show the payment method of existing COD orders.

## 6. Existing COD orders after COD is switched off

Switching COD off **does not** change or remove anything for orders that were already placed with COD. These keep
working exactly as before because they are driven by the order's own `paymentMethod`, not by the COD switch:

- Viewing COD orders (customer, vendor, Admin) and their invoices.
- Cancelling an unpaid COD order (no money to refund; no Razorpay call).
- Rider cash collection, rider cash-in-hand limits, and Admin cash settlement
  (`POST /api/admin/delivery-boys/:id/settle-cash`, Admin → Cash Collection).
- Courier COD remittance (`GET /api/admin/courier-remittances/pending`, `POST /api/admin/courier-remittances/settle`,
  Admin → Courier Settlements) and the `COD_RECEIVED` notification.
- Escrow: a COD vendor's earnings stay held until that package's cash is settled (`backend/src/cron/escrowCron.js`).
- Returns of COD orders are refunded to the SafeFire Wallet (`backend/src/services/returnRefund.service.js`).
- COD service bookings already placed: completing them still marks them paid and deducts the platform commission from
  the vendor wallet.
- Finance reports and `backend/src/scripts/financialReconciliation.js`.

Do **not** delete or comment out COD models, enums, routes, settlement screens or records. They are needed for these
orders and for turning COD back on.

## 7. Turning COD off / on again

**Off** (recommended order):
1. Turn **Online Payments** on (Card and/or UPI ticked) and save.
2. Test online payments in Razorpay **test** mode (§8).
3. Untick **Cash on Delivery** and save. Reload the storefront: COD is gone from checkout, wholesale, both
   service-booking screens and the product badge.

**On again:** tick **Cash on Delivery** and save. COD reappears on the next page load; no code change or deploy needed.

## 8. Testing payments with Razorpay test mode

1. In `backend/.env`: `RAZORPAY_LIVE=false` with the `RAZORPAY_TEST_KEY_ID`, `RAZORPAY_TEST_KEY_SECRET` and
   `RAZORPAY_TEST_WEBHOOK_SECRET` from the Razorpay Dashboard in **Test Mode**. Do not set `RAZORPAY_MOCK=true` (that skips
   Razorpay entirely). Restart and check the log says `Using TEST keys`.
2. Turn Online Payments on in the Admin panel.
3. Pay with the test cards / UPI IDs from Razorpay's test-mode documentation — no real money moves.
4. Check: the order becomes **paid** only after the payment is verified (browser verify or `payment.captured` webhook);
   a cancelled or failed payment leaves it unpaid; cancelling a paid order creates a Razorpay refund.
5. For webhooks, the test-mode webhook in the Razorpay Dashboard must point to `https://<backend>/api/webhook/razorpay`
   with the same secret as `RAZORPAY_TEST_WEBHOOK_SECRET`, and send `payment.captured`, `payment.failed`,
   `refund.processed`, `refund.failed`.

Unpaid online orders: a background job cancels online product orders still unpaid after `ORDER_PAYMENT_TIMEOUT_MINUTES`
(default 60) and returns any wallet share; before cancelling it asks Razorpay whether a payment was captured and completes
the order instead if so (`backend/src/cron/orderPaymentExpiryCron.js`). Unpaid online service bookings are released after
`SERVICE_PAYMENT_TIMEOUT_MINUTES` (default 30).

## 9. Automated checks

Backend DB tests (throwaway MongoDB only — see the testing notes; never against the `.env` database):

- `npm run test:payment-switches-db` — switches, Admin save rules, enforcement on every entry point, historical COD order.
- `npm run test:order-expiry-db` — unpaid online order cleanup.
- Existing financial suites (`test:checkout-db`, `test:service-db`, `test:ridercod-db`, `test:return-db`, …).

Run with e.g. `TEST_MONGO_URI="mongodb://127.0.0.1:27999/safefire_<name>_test?replicaSet=rs0" npm run test:payment-switches-db`.
