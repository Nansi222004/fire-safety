# Delivery App switch and Seller Delivery

Status: implemented (November 2026), not yet deployed.

## Delivery methods

| Method | `deliveryMethod` | `providerId` | Who delivers | Delivery confirmed by |
|---|---|---|---|---|
| Shiprocket | `SHIPROCKET` | `shiprocket` | Shiprocket courier | Courier webhook (`COURIER_WEBHOOK`) |
| SafeFire Delivery App | `INTERNAL` | `own_fleet` | SafeFire rider | Customer OTP entered by rider (`RIDER_OTP`) |
| Seller Delivery | `SELLER_DELIVERY` | `seller_delivery` | Courier arranged by the seller | Customer OTP entered by seller (`CUSTOMER_OTP`), or Admin override (`ADMIN_OVERRIDE`) |

A Seller Delivery shipment is identified only when **both** fields match. Nothing is inferred from missing data.

## Admin settings (`Settings` key `shipping`)

| Field | Default when never saved | Effect |
|---|---|---|
| `deliveryAppEnabled` | `true` | When `false`: no new rider assignment (manual, automatic, retry sweep, return pickup, exchange replacement); sellers cannot pick Manual Delivery; Shiprocket failures are not sent to riders. Riders already holding a package finish it (accept, pickup OTP, delivery OTP, payout, cash settlement). Admin may still reassign a shipment that already has a rider. The scheduler stops expiring riders' pending offers. |
| `sellerDeliveryEnabled` | `false` | When `true`: Seller Delivery is offered for forward, prepaid customer-order packages. |

Settings → Payment & Shipping → Shipping → Delivery Methods. Saves are validated (booleans only) and written to the audit log (`UPDATE_SETTINGS`). A save that omits the fields keeps the stored values.

| Delivery App | Seller Delivery | Methods offered for a normal prepaid package |
|---|---|---|
| ON | OFF | Shiprocket, Manual Delivery |
| ON | ON | Shiprocket, Manual Delivery, Seller Delivery |
| OFF | OFF | Shiprocket |
| OFF | ON | Shiprocket, Seller Delivery |

Wholesale and overweight packages never get Shiprocket. With the Delivery App off and Seller Delivery off, they have **no** method. The seller sees the reason and Admin must resolve the package: turn a switch on, or cancel and refund through the existing flow. COD orders never get Seller Delivery.

The backend works out the effective methods (`resolveEffectiveDeliveryMethods` in `deliveryRouting.service.js`) and returns them to the seller UI as `effectiveAllowedDeliveryMethods`, together with `unavailableDeliveryMethods` (with reasons) and `noDeliveryMethodReason`. Stored `allowedDeliveryMethods` is never rewritten to add Seller Delivery.

## Shiprocket failure

- **Delivery App ON:** unchanged. The package falls back to INTERNAL (`SHIPROCKET_CREATION_FAILED`).
- **Delivery App OFF:** the package returns to "awaiting delivery method" (`providerId: pending_selection`, Shiprocket removed from its allowed methods, shipment `confirmed`, seller package back to `processing`). The failure reason is saved, and the seller and Admins are notified. Payment and financial snapshots are not touched.

## Seller Delivery flow (vendor API)

All routes need vendor authentication. Ownership is checked against both the order and the shipment, and another vendor gets a 404.

1. `PATCH /api/vendor/orders/:id/shipments/:shipmentId/delivery-method` `{ method: "SELLER_DELIVERY" }`, while the package is `processing`.
2. `PATCH /api/vendor/orders/:id/status` `{ status: "ready_for_pickup" }`. This books nothing (no Shiprocket order, no rider).
3. `POST …/seller-delivery/ship` `{ courierName, trackingNumber, trackingUrl?, deliveryPersonName?, deliveryPersonPhone? }` moves `ready_for_pickup` to `shipped` in one atomic update. The generic status API cannot mark Seller Delivery shipped.
4. `PATCH …/seller-delivery/tracking`. Allowed while the package is `shipped` or `out_for_delivery`. Every change is recorded in `sellerDelivery.trackingUpdates`.
5. `POST …/seller-delivery/send-otp` moves the package to `out_for_delivery` and creates the customer OTP (hashed, 10-minute expiry, 60-second resend cooldown). The code is shown **only** on the customer's order tracking page. It never appears in notifications, emails or seller responses.
6. `POST …/seller-delivery/confirm` `{ otp }` runs verification and the move to delivered as one conditional update (5 attempts per code). It emits `SHIPMENT_DELIVERED` exactly once.

Seller tracking numbers are stored in `sellerDelivery.*`, never in `awbCode`, `courierName`, `trackingUrl` or `Order.trackingNumber`. Courier webhooks ignore Seller Delivery shipments.

## Admin

- Order list filters: `deliveryMethod=SHIPROCKET|INTERNAL|SELLER_DELIVERY`, `awaitingDeliveryMethod=true`, `trackingNumber=` (searches seller tracking numbers and courier AWBs).
- The order detail shows normalized tracking, seller tracking history, delivery confirmation, and why a package has no method.
- Delivery override (Seller Delivery only): `POST /api/admin/orders/:id/shipments/:shipmentId/confirm-delivery` `{ reason (≥10 chars), proofReference (≥3 chars) }`. It is audited as `ADMIN_DELIVERY_OVERRIDE`. A bulk order status change to `delivered` is refused while a Seller Delivery package is still open.

## Finance

- Seller Delivery uses the existing `SHIPMENT_DELIVERED` listener, so the package is marked delivered and the commission's release date is set to delivery + return window. Commission snapshots are unchanged.
- There is no rider payout and no rider COD entry. The listener reads the provider from the stored shipment, and `processShipmentPayout` refuses non-`own_fleet` shipments.
- **Seller-collected COD is out of scope.** Seller Delivery is blocked for COD/cash orders when a method is selected, shipped, confirmed and overridden. It is also excluded from courier COD remittance. Supporting it needs an approved settlement, commission, GST/TDS and reconciliation design.

## Tests

- `npm run test:delivery-methods`: pure rules (no database).
- `TEST_MONGO_URI=mongodb://127.0.0.1:27999/<name>_test?replicaSet=rs0 npm run test:seller-delivery-db`: end to end against a throwaway replica set.
