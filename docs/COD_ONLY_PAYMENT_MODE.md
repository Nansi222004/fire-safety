# SAFEFIRE — COD-ONLY PAYMENT MODE SPECIFICATION & RUNBOOK

## 1. Executive Summary & Objective
SafeFire has transitioned temporarily to a **Cash on Delivery (COD) Only** operating mode across the marketplace for both physical products and home/commercial fire safety services. 

Under this architecture:
- **Zero Razorpay Deletion:** No Razorpay SDK, webhook, or signature code has been deleted or broadly commented out.
- **Backend-Enforced Feature Gate:** Setting `PAYMENT_MODE=COD_ONLY` in `.env` blocks all online payment initiation and retry requests at the API layer with HTTP 400.
- **Seamless Future Reactivation:** Setting `PAYMENT_MODE=ONLINE_ENABLED` re-enables full Razorpay checkout and online payments without requiring any code deployment or refactoring.
- **Financial Hardening Preserved:** Cancellation idempotency, escrow clawback, vendor commission settlement, COD cash remittance, and ₹0 refund rules for COD cancellations remain 100% active and verified.

---

## 2. Central Configuration (`paymentConfig.js`)
File: `backend/src/config/paymentConfig.js`

```javascript
export const PAYMENT_MODES = Object.freeze({
    COD_ONLY: 'COD_ONLY',
    ONLINE_ENABLED: 'ONLINE_ENABLED',
});

export const getPaymentMode = () => {
    return process.env.PAYMENT_MODE === PAYMENT_MODES.ONLINE_ENABLED
        ? PAYMENT_MODES.ONLINE_ENABLED
        : PAYMENT_MODES.COD_ONLY;
};

export const isCodOnlyMode = () => getPaymentMode() === PAYMENT_MODES.COD_ONLY;
export const isOnlinePaymentEnabled = () => getPaymentMode() === PAYMENT_MODES.ONLINE_ENABLED;
```

### Environment Variable Control:
- Default (if `PAYMENT_MODE` is unset or `'COD_ONLY'`): System operates strictly in `COD_ONLY` mode.
- Future Reactivation: Set `PAYMENT_MODE=ONLINE_ENABLED` in `backend/.env`.

---

## 3. Architecture & Enforcement Points

### A. Public Settings API (`GET /api/settings/checkout`)
The public checkout settings endpoint queries `isCodOnlyMode()` and overrides payment capabilities dynamically:
```json
{
  "payment": {
    "cod": true,
    "razorpay": false,
    "wallet": false,
    "upi": false,
    "paymentMode": "COD_ONLY"
  }
}
```

### B. Product Payment Initialization (`POST /api/user/payment/initialize`)
- Direct guard verifies `isCodOnlyMode()`. If `paymentMethod !== 'cod' && paymentMethod !== 'cash'`, returns HTTP 400:
  `"Online payments are temporarily disabled. Cash on Delivery is the only supported payment method."`
- Valid COD requests generate an order immediately in MongoDB with `paymentStatus: 'pending'` and return `{ orderId, paymentStatus: 'pending', razorpayOrderId: null }`.

### C. Standard Order Placement (`POST /api/user/orders`)
- Evaluates `isCodOnlyMode()`. Rejecting any non-COD/cash method at the API layer before stock validation or transaction initialization.

### D. Online Payment Retry (`POST /api/user/payment/retry/:orderId`)
- Guarded: returns HTTP 400 with `"Online payment retry is disabled during COD-only mode."`

### E. Exchange Upgrade Price Difference (`POST /api/user/payment/exchange-upgrade/:returnRequestId`)
- **Safety Rule #5:** If a customer requests an exchange where the replacement product costs more than the original product (e.g. ₹1,500 vs ₹1,000, priceDelta = ₹500), the system does **not** silently convert the delta into arbitrary COD or unverified credits.
- The action is safely blocked with a clear customer error message:
  `"Online payment is temporarily disabled. Exchange price-difference upgrades cannot be completed online during the COD-only phase. Please contact customer support or request a standard return."`

### F. Service Bookings (`POST /api/customer/services/book`)
- In `createBooking`, if `isCodOnlyMode()` is active and `paymentMethod !== 'cod'`:
  - Daily capacity reservation is rolled back atomically.
  - Returns HTTP 400: `"Online payments are temporarily disabled for service bookings. Please select Pay On Service (Cash on Delivery)."`
- When `paymentMethod: 'cod'`:
  - `ServiceBooking` is created with `paymentMethod: 'cod'`, `paymentStatus: 'pending'`, `status: 'pending'`.
  - **Safety Rule #11:** The booking is **not** marked as paid merely because it is COD. It remains `pending` until on-site completion.

---

## 4. Service COD Financial Flow & Settlement Lifecycle

```
Customer creates COD Service Booking
      │
      ▼
ServiceBooking created: paymentMethod='cod', paymentStatus='pending', status='pending'
Daily Capacity incremented (+1)
      │
      ▼
Vendor confirms & advances: 'confirmed' → 'in_progress'
      │
      ▼
Service delivered on site: Customer pays ₹800 in cash to Vendor
      │
      ▼
Vendor marks status = 'completed'
      │
      ▼
1. paymentStatus transitions: 'pending' → 'paid'
2. Platform commission (e.g. 10% = ₹80) deducted from Vendor Wallet
3. VendorWalletTransaction created: type='SERVICE_SETTLEMENT', amount=-80
4. Vendor receives confirmation notification
```

### Cancellation of COD Service Booking:
- Customer or Vendor cancels booking.
- Daily capacity slot is released (`bookedCount: -1`).
- Since `paymentStatus === 'pending'`, `refundAmount` is `0`.
- **Zero Razorpay refund calls**, **zero artificial wallet credits**.

---

## 5. Normal Product COD Cancellation Flow
- Customer or Admin cancels a COD order.
- In `processCancellationRefund`:
  - Since `order.paymentStatus !== 'paid'` (it is `'pending'`), `refundAmount = 0`.
  - No Refund document is created.
  - No Razorpay API calls are dispatched.
  - No fake UserWallet balance is added.
  - Inventory stock is restored safely.

---

## 6. Frontend Behavior & Adaptations

### Checkout Page (`frontend/src/modules/UserApp/pages/Checkout.jsx`):
- `formData.paymentMethod` initializes to `"cod"`.
- Payment method list defaults to Cash on Delivery.
- Displays an informative amber banner:
  *"🚚 Cash on Delivery Phase: SafeFire is currently operating in Cash on Delivery mode. You will pay in cash upon receiving your order."*
- Wallet balance application is hidden when wallet checkout is inactive.
- Form submission bypasses Razorpay modal completely, placing the COD order directly and navigating to `/order-confirmation/:orderId`.

### Service Booking Wizard (`frontend/src/modules/UserApp/components/ServiceBookingWizard.jsx`):
- In Step 5 (Payment): fetches `/settings/checkout`.
- In `COD_ONLY` mode, hides the "UPI / Online" button and renders a clean, full-width "Pay On Service" (Cash / On-site UPI) selection with clear operational guidance.

---

## 7. How to Switch Modes

### To Reactivate Online Payments (Razorpay + UPI + Cards + COD):
1. Open `backend/.env`.
2. Add or update:
   ```env
   PAYMENT_MODE=ONLINE_ENABLED
   ```
3. Restart backend or let nodemon reload.
4. All Razorpay payment gateways, UPI handlers, retry endpoints, and exchange upgrades will immediately become available with zero code modifications.

### To Return to COD-Only Mode:
1. Open `backend/.env`.
2. Set:
   ```env
   PAYMENT_MODE=COD_ONLY
   ```
3. Backend immediately rejects online initiations and frontend seamlessly presents COD checkout.

---

## 8. Automated Verification & Test Coverage
- **Integration Test Suite:** `backend/tests/integration/testCodOnlyPaymentMode.mjs`
  - **13 of 13 tests passed (100% GREEN)**
- **Razorpay Preservation Suite:** `backend/tests/integration/testRazorpayCancellationRefund.mjs`
  - **40 of 40 tests passed (100% GREEN in mock mode)**
- **Service Flow Suite:** `backend/tests/integration/testServiceFlow.js`
  - **All checks passed (GREEN)**
- **Notification Suite:** `backend/tests/integration/testNotification.js`
  - **Passed (GREEN)**
- **Frontend Production Bundle:** `npm --prefix frontend run build`
  - **Built successfully with 0 errors (`vite v5.4.21`)**
