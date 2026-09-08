# SafeFire — Controlled Real Razorpay UPI Refund Verification Runbook

## Objective
To execute a controlled, real-world end-to-end verification of a small amount (₹1 or ₹10) via Razorpay UPI, trigger cancellation, and confirm that the money reverses to the customer's original UPI/bank account without touching SafeFire UserWallet.

---

## Pre-Requisites

1. **Razorpay Mode:**
   - **Sandbox / Test Mode (`rzp_test_...`):** Validates the real Razorpay API endpoints and webhook lifecycle without debiting bank accounts.
   - **Live Production Mode (`rzp_live_...`):** Validates real-money debits and credits against a live bank account via UPI Apps (Google Pay, PhonePe, Paytm, BHIM).
2. **Environment Variable:**
   Ensure `RAZORPAY_MOCK` is **not** set to `'true'` in `.env` during this test so the backend makes real HTTP calls to `api.razorpay.com`.

---

## Step-by-Step Execution Procedure

### Step 1: Create a ₹1 or ₹10 Test Product / Order
- Open the SafeFire frontend or make an API request to checkout a ₹1/₹10 test item.
- Select payment method: **Razorpay (Online Payment)**.

### Step 2: Pay via UPI
- In the Razorpay modal, select **UPI** (QR code or VPA).
- Complete payment authorization on the mobile UPI app.
- Confirm payment captured:
  - `PaymentAttempt.status` = `'paid'`
  - `PaymentAttempt.razorpayPaymentId` exists (`pay_...`)
  - `Order.status` = `'processing'` / `'pending'`
  - `Order.paymentStatus` = `'paid'`

### Step 3: Trigger Cancellation
- In the SafeFire User App, navigate to **My Orders** > select the test order > click **Cancel Order** (or cancel via Admin Portal).
- SafeFire executes `cancellationRefundService.js`:
  1. Verifies `PaymentAttempt` and refundable amount server-side.
  2. Commits internal MongoDB transaction with unique reference `ORDER_CANCEL_REFUND_<orderId>`.
  3. Invokes `processRazorpayRefund({ paymentId: 'pay_...', amountInRupees: 1 })`.
  4. Stores `Refund.razorpayRefundId` (`rfnd_...`).

### Step 4: Verification Checklist

Execute the following checks to confirm the transition from **YELLOW** to **GREEN**:

| # | Check Point | Where to Check | Expected Result | Pass / Fail |
| :-: | :--- | :--- | :--- | :-: |
| **1** | Original Razorpay payment | Razorpay Dashboard > Payments | Status: `Captured`, Method: `UPI` | [ ] |
| **2** | Razorpay Refund API call | SafeFire Backend Logs | `POST https://api.razorpay.com/v1/payments/<paymentId>/refund` returns HTTP 200/201 | [ ] |
| **3** | Refund Record in Database | MongoDB `refunds` collection | `status: 'completed'` (or `'processing'`), `method: 'razorpay'`, `razorpayRefundId: 'rfnd_...'` | [ ] |
| **4** | Refund Amount Accuracy | MongoDB `refunds` / Dashboard | Exactly ₹1 (or ₹10), matching cancellation | [ ] |
| **5** | SafeFire UserWallet Balance | MongoDB `userwallets` collection | **₹0 change (Balance remains unaffected)** | [ ] |
| **6** | Order Payment Status | SafeFire DB `orders` | `paymentStatus: 'refunded'` | [ ] |
| **7** | Customer Notification | SafeFire Bell Icon / DB | "Refund initiated to your original payment method. Your bank/UPI provider may take additional time to credit the amount." | [ ] |
| **8** | Razorpay Dashboard Visibility | Razorpay Dashboard > Refunds | Refund record visible with status `Processed` | [ ] |
| **9** | Customer Bank / UPI Credit | Customer Bank Statement / SMS | Reversal SMS / Bank alert received from issuing bank | [ ] |

---

## Database Quick-Check Script

Run this command in the backend directory to inspect the state of the order, refund, and wallet immediately after cancellation:

```bash
node -e "
import('mongoose').then(async (m) => {
  await m.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/safefire');
  const orderId = process.argv[1];
  const order = await m.connection.collection('orders').findOne({ orderId });
  if (!order) return console.log('Order not found');
  const refund = await m.connection.collection('refunds').findOne({ orderId: order._id });
  const wallet = await m.connection.collection('userwallets').findOne({ userId: order.userId });
  console.log('--- TEST VERIFICATION SUMMARY ---');
  console.log('Order Status:', order.status, '| Payment Status:', order.paymentStatus);
  console.log('Refund ID:', refund?.razorpayRefundId, '| Status:', refund?.status, '| Amount:', refund?.amount);
  console.log('UserWallet Balance:', wallet?.balance || 0, '(Must be 0 change)');
  process.exit(0);
});
" <SAFEFIRE_ORDER_ID>
```
