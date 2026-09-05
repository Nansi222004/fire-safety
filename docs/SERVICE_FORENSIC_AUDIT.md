# SAFEFIRE SERVICE MARKETPLACE — COMPREHENSIVE FORENSIC DISCOVERY AUDIT REPORT

**Audit Date:** September 5, 2026  
**Auditor:** Antigravity AI Engineering & Security Discovery Engine  
**Audit Scope:** Complete SafeFire Service Marketplace Architecture, Codebase & Data Model (Read-Only Discovery)  
**Deliverable Path:** `docs/SERVICE_FORENSIC_AUDIT.md`  

---

## 1. Executive Summary

A comprehensive, read-only architectural and static source code forensic audit was performed on the SafeFire Service Marketplace. The audit evaluated the customer, vendor, and admin flows across frontend applications, state stores, API clients, backend Express routing, authorization middlewares, controller logic, MongoDB models, background jobs, and notification pipelines.

### Key Takeaways

1. **Service Marketplace Foundation is Functional but Disconnected in Financial & Gateway Layers:**
   - The master service catalog taxonomy (Admin), vendor service enrollment/configuration (Vendor), and customer service browsing/booking wizard (Customer) are solidly structured and connected end-to-end.
   - **Critical Financial Disconnect (P0):** The service booking checkout (`customerService.controller.js` `createBooking`) immediately marks non-COD bookings as `paymentStatus: 'paid'` without generating a Razorpay Order ID, verifying a Razorpay cryptographic signature, or deducting from a customer wallet.
   - **Commissions & Payouts Disconnect (P1):** The marketplace financial pipeline (`Commission.model.js`, `VendorWalletTransaction.model.js`, `escrowCron.js`, and `order.controller.js` `getEarnings`) strictly filters and references `orderId` (product orders). Completing a service booking generates zero commission records, credits zero funds to vendor wallets, and does not appear in vendor earnings or admin settlement queues.

2. **Strict Vendor Capability Guarding:**
   - Vendor capabilities (`vendorCapabilities: { sellsProducts, providesServices }`) are cleanly enforced at the routing level via `requireVendorCapability('services')` and at the UI route level via `VendorProtectedRoute requiredCapability="services"`.

3. **Serviceability, Working Hours & Capacity Backend Logic:**
   - Pincode serviceability, working hours window, and daily capacity are validated server-side during booking creation. However, edge-case bypasses exist for day-of-week checks and concurrency race conditions on daily capacity slots.

---

## 2. Complete Service Feature Inventory

| Layer | Component / File Path | Purpose / Description | Connectivity Status |
| :--- | :--- | :--- | :--- |
| **User Pages** | [`frontend/src/modules/UserApp/pages/ServicesPage.jsx`](file:///d:/Appzeto_Projects/safe-fire/frontend/src/modules/UserApp/pages/ServicesPage.jsx) | Customer service catalog browsing, category filtering, search, and dynamic card display | 🟢 FULLY CONNECTED |
| **User Pages** | [`frontend/src/modules/UserApp/pages/ServiceDetailPage.jsx`](file:///d:/Appzeto_Projects/safe-fire/frontend/src/modules/UserApp/pages/ServiceDetailPage.jsx) | Single service presentation, vendor pricing, pincode check, and dynamic booking trigger | 🟢 FULLY CONNECTED |
| **User Pages** | [`frontend/src/modules/UserApp/pages/ServiceBookingSuccessPage.jsx`](file:///d:/Appzeto_Projects/safe-fire/frontend/src/modules/UserApp/pages/ServiceBookingSuccessPage.jsx) | Booking confirmation screen displaying booking ID, slot details, and action links | 🟢 FULLY CONNECTED |
| **User Pages** | [`frontend/src/modules/UserApp/pages/MyServiceBookingsPage.jsx`](file:///d:/Appzeto_Projects/safe-fire/frontend/src/modules/UserApp/pages/MyServiceBookingsPage.jsx) | Customer booking management, status tracking, filters, and cancellation modal | 🟢 FULLY CONNECTED |
| **User Components** | [`frontend/src/modules/UserApp/components/ServiceBookingWizard.jsx`](file:///d:/Appzeto_Projects/safe-fire/frontend/src/modules/UserApp/components/ServiceBookingWizard.jsx) | Multi-step booking wizard (Vendor Selection, Date/Slot & Working Hours, Service Address, Payment) | 🟡 PARTIALLY CONNECTED (Payment Gateway Mocked) |
| **User Services** | [`frontend/src/modules/UserApp/services/customerServiceApi.js`](file:///d:/Appzeto_Projects/safe-fire/frontend/src/modules/UserApp/services/customerServiceApi.js) | Axios API client for customer service endpoints (`/api/customer/services/*`, `/api/customer/bookings/*`) | 🟢 FULLY CONNECTED |
| **Vendor Pages** | [`frontend/src/modules/Vendor/pages/services/AvailableServices.jsx`](file:///d:/Appzeto_Projects/safe-fire/frontend/src/modules/Vendor/pages/services/AvailableServices.jsx) | Vendor catalog discovery; enables services from admin catalog | 🟢 FULLY CONNECTED |
| **Vendor Pages** | [`frontend/src/modules/Vendor/pages/services/MyVendorServices.jsx`](file:///d:/Appzeto_Projects/safe-fire/frontend/src/modules/Vendor/pages/services/MyVendorServices.jsx) | Vendor active service list, pricing configuration, service areas, capacity, status toggling | 🟢 FULLY CONNECTED |
| **Vendor Pages** | [`frontend/src/modules/Vendor/pages/services/RequestService.jsx`](file:///d:/Appzeto_Projects/safe-fire/frontend/src/modules/Vendor/pages/services/RequestService.jsx) | Vendor submission form to propose new service catalog additions to Admin | 🟢 FULLY CONNECTED |
| **Vendor Pages** | [`frontend/src/modules/Vendor/pages/services/VendorServiceBookings.jsx`](file:///d:/Appzeto_Projects/safe-fire/frontend/src/modules/Vendor/pages/services/VendorServiceBookings.jsx) | Vendor booking management dashboard, status progression modal, filters | 🟢 FULLY CONNECTED |
| **Vendor Pages** | [`frontend/src/modules/Vendor/pages/services/VendorServiceRequests.jsx`](file:///d:/Appzeto_Projects/safe-fire/frontend/src/modules/Vendor/pages/services/VendorServiceRequests.jsx) | Vendor history of requested service categories/catalogs with admin feedback/status | 🟢 FULLY CONNECTED |
| **Vendor Components** | [`frontend/src/modules/Vendor/components/Services/VendorServiceConfigModal.jsx`](file:///d:/Appzeto_Projects/safe-fire/frontend/src/modules/Vendor/components/Services/VendorServiceConfigModal.jsx) | Modal to configure base price, variant prices, service pincodes, daily capacity, working hours | 🟢 FULLY CONNECTED |
| **Vendor Components** | [`frontend/src/modules/Vendor/components/Services/VendorServiceBookingModal.jsx`](file:///d:/Appzeto_Projects/safe-fire/frontend/src/modules/Vendor/components/Services/VendorServiceBookingModal.jsx) | Modal to view booking details and perform status transitions (`confirmed`, `in_progress`, etc.) | 🟢 FULLY CONNECTED |
| **Vendor Services** | [`frontend/src/modules/Vendor/services/vendorService.js`](file:///d:/Appzeto_Projects/safe-fire/frontend/src/modules/Vendor/services/vendorService.js) | Axios API client for vendor service operations (`/api/vendor/services/*`, `/api/vendor/service-bookings/*`) | 🟢 FULLY CONNECTED |
| **Vendor Stores** | [`frontend/src/shared/store/vendorServiceStore.js`](file:///d:/Appzeto_Projects/safe-fire/frontend/src/shared/store/vendorServiceStore.js) | Zustand state store for vendor service catalog & store configurations | 🟢 FULLY CONNECTED |
| **Admin Pages** | [`frontend/src/modules/Admin/pages/services/ServiceCategories.jsx`](file:///d:/Appzeto_Projects/safe-fire/frontend/src/modules/Admin/pages/services/ServiceCategories.jsx) | Admin service category taxonomy management (CRUD, icons, active status) | 🟢 FULLY CONNECTED |
| **Admin Pages** | [`frontend/src/modules/Admin/pages/services/ServicesMaster.jsx`](file:///d:/Appzeto_Projects/safe-fire/frontend/src/modules/Admin/pages/services/ServicesMaster.jsx) | Admin master service catalog management (CRUD, pricing type, booking type, dynamic fields) | 🟢 FULLY CONNECTED |
| **Admin Pages** | [`frontend/src/modules/Admin/pages/services/AdminServiceRequests.jsx`](file:///d:/Appzeto_Projects/safe-fire/frontend/src/modules/Admin/pages/services/AdminServiceRequests.jsx) | Admin approval/rejection queue for vendor service requests | 🟢 FULLY CONNECTED |
| **Admin Pages** | [`frontend/src/modules/Admin/pages/services/AdminServiceBookings.jsx`](file:///d:/Appzeto_Projects/safe-fire/frontend/src/modules/Admin/pages/services/AdminServiceBookings.jsx) | Admin read-only audit log for all system service bookings | 🟢 FULLY CONNECTED |
| **Admin Services** | [`frontend/src/modules/Admin/services/adminService.js`](file:///d:/Appzeto_Projects/safe-fire/frontend/src/modules/Admin/services/adminService.js) | Axios API client for admin service master operations | 🟢 FULLY CONNECTED |
| **Admin Stores** | [`frontend/src/shared/store/serviceStore.js`](file:///d:/Appzeto_Projects/safe-fire/frontend/src/shared/store/serviceStore.js) | Zustand state store for admin master services | 🟢 FULLY CONNECTED |
| **Admin Stores** | [`frontend/src/shared/store/serviceCategoryStore.js`](file:///d:/Appzeto_Projects/safe-fire/frontend/src/shared/store/serviceCategoryStore.js) | Zustand state store for admin service categories | 🟢 FULLY CONNECTED |
| **Backend Routes** | [`backend/src/modules/customer/routes/customerService.routes.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/customer/routes/customerService.routes.js) | Customer service routing (`/services`, `/services/:slug`, `/bookings`, `/bookings/:id/cancel`) | 🟢 FULLY CONNECTED |
| **Backend Routes** | [`backend/src/modules/vendor/routes/vendor.routes.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/vendor/routes/vendor.routes.js) | Vendor service routing (`/services/*`, `/service-requests/*`, `/service-bookings/*`) | 🟢 FULLY CONNECTED |
| **Backend Routes** | [`backend/src/modules/admin/routes/admin.routes.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/admin/routes/admin.routes.js) | Admin service routing (`/service-categories/*`, `/services/*`, `/service-requests/*`, `/service-bookings/*`) | 🟢 FULLY CONNECTED |
| **Backend Controllers**| [`backend/src/modules/customer/controllers/customerService.controller.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/customer/controllers/customerService.controller.js) | Customer catalog retrieval, serviceability check, booking creation, booking cancellation | 🟡 PARTIALLY CONNECTED |
| **Backend Controllers**| [`backend/src/modules/vendor/controllers/vendorService.controller.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/vendor/controllers/vendorService.controller.js) | Vendor service enablement, configuration update, status toggles, deletion | 🟢 FULLY CONNECTED |
| **Backend Controllers**| [`backend/src/modules/vendor/controllers/vendorBooking.controller.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/vendor/controllers/vendorBooking.controller.js) | Vendor booking retrieval and status progression (`confirmed`, `in_progress`, `completed`, `cancelled`) | 🟢 FULLY CONNECTED |
| **Backend Controllers**| [`backend/src/modules/vendor/controllers/serviceRequest.controller.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/vendor/controllers/serviceRequest.controller.js) | Vendor service catalog proposal submission and tracking | 🟢 FULLY CONNECTED |
| **Backend Controllers**| [`backend/src/modules/admin/controllers/serviceCategory.controller.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/admin/controllers/serviceCategory.controller.js) | Admin service category CRUD | 🟢 FULLY CONNECTED |
| **Backend Controllers**| [`backend/src/modules/admin/controllers/service.controller.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/admin/controllers/service.controller.js) | Admin master service CRUD and activation | 🟢 FULLY CONNECTED |
| **Backend Controllers**| [`backend/src/modules/admin/controllers/adminServiceRequest.controller.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/admin/controllers/adminServiceRequest.controller.js) | Admin review, approval, and rejection of vendor service requests | 🟢 FULLY CONNECTED |
| **Backend Controllers**| [`backend/src/modules/admin/controllers/adminBooking.controller.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/admin/controllers/adminBooking.controller.js) | Admin service booking audit listing and status overrides | 🟢 FULLY CONNECTED |
| **Backend Middlewares**| [`backend/src/middlewares/authorize.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/middlewares/authorize.js) | Vendor capability validator (`requireVendorCapability('services')`) | 🟢 FULLY CONNECTED |
| **Backend Models** | [`backend/src/models/ServiceCategory.model.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/models/ServiceCategory.model.js) | Service category schema (`name`, `slug`, `icon`, `image`, `order`, `isActive`) | 🟢 FULLY CONNECTED |
| **Backend Models** | [`backend/src/models/Service.model.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/models/Service.model.js) | Master service catalog schema (`name`, `slug`, `category`, `pricingType`, `bookingType`, `serviceFields`) | 🟢 FULLY CONNECTED |
| **Backend Models** | [`backend/src/models/VendorService.model.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/models/VendorService.model.js) | Vendor service enablement (`vendorId`, `serviceId`, `price`, `serviceAreas`, `dailyCapacity`, `workingHours`) | 🟢 FULLY CONNECTED |
| **Backend Models** | [`backend/src/models/ServiceBooking.model.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/models/ServiceBooking.model.js) | Service booking record (`bookingId`, `userId`, `vendorId`, `vendorServiceId`, `pricing`, `status`, `timeSlot`) | 🟢 FULLY CONNECTED |
| **Backend Models** | [`backend/src/models/ServiceRequest.model.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/models/ServiceRequest.model.js) | Vendor service catalog requests (`vendorId`, `serviceName`, `status: pending|approved|rejected`) | 🟢 FULLY CONNECTED |
| **Payment Gateway** | Razorpay Gateway Client | Online card/UPI payment processing for service bookings | 🔴 BROKEN / DISCONNECTED |
| **Financial Ledger** | [`backend/src/models/Commission.model.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/models/Commission.model.js) | Platform commission tracking on completed transactions | 🔴 DISCONNECTED (Product only) |
| **Vendor Wallet** | [`backend/src/models/VendorWalletTransaction.model.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/models/VendorWalletTransaction.model.js) | Vendor escrow, wallet credit, and payout tracking | 🔴 DISCONNECTED (Product only) |
| **Reviews & Ratings** | [`backend/src/models/Review.model.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/models/Review.model.js) | Customer reviews and vendor service rating aggregation | 🔴 NOT IMPLEMENTED |

---

## 3. Customer Service Flow

```
[Service Listing] (ServicesPage.jsx)
       │
       ▼
[Service Detail] (ServiceDetailPage.jsx)
       │
       ▼
[Pincode & Serviceability Check] (/api/customer/services/check-serviceability)
       │
       ▼
[Select Vendor & Variants] (ServiceBookingWizard.jsx - Step 1)
       │
       ▼
[Select Date & Time Slot] (ServiceBookingWizard.jsx - Step 2)
       │
       ▼
[Enter Service Address] (ServiceBookingWizard.jsx - Step 3)
       │
       ▼
[Select Payment Method] (ServiceBookingWizard.jsx - Step 4)
       │
       ▼
[Create Service Booking] (POST /api/customer/bookings)
       │
       ▼
[Booking Confirmation Page] (ServiceBookingSuccessPage.jsx)
       │
       ▼
[Booking Management & Status Tracking] (MyServiceBookingsPage.jsx)
       │
       ▼
[Customer Cancellation] (PATCH /api/customer/bookings/:id/cancel)
```

### Detailed Trace for Every Step in Customer Flow

| Step | Frontend File | API Endpoint | Method | Backend Controller & Method | Models / Collections | Response Shape | Auth | Authz |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Service Listing** | [`ServicesPage.jsx`](file:///d:/Appzeto_Projects/safe-fire/frontend/src/modules/UserApp/pages/ServicesPage.jsx#L1-L150) | `/api/customer/services` | `GET` | [`customerService.controller.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/customer/controllers/customerService.controller.js#L14-L63) `listServices` | `Service`, `ServiceCategory` | `{ success: true, data: { services: [...], categories: [...], pagination: {...} } }` | Public | None |
| **2. Service Detail** | [`ServiceDetailPage.jsx`](file:///d:/Appzeto_Projects/safe-fire/frontend/src/modules/UserApp/pages/ServiceDetailPage.jsx#L1-L180) | `/api/customer/services/:slug` | `GET` | [`customerService.controller.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/customer/controllers/customerService.controller.js#L68-L125) `getServiceBySlug` | `Service`, `VendorService`, `Vendor` | `{ success: true, data: { service: {...}, vendors: [...] } }` | Public | None |
| **3. Pincode Check** | [`ServiceDetailPage.jsx`](file:///d:/Appzeto_Projects/safe-fire/frontend/src/modules/UserApp/pages/ServiceDetailPage.jsx#L85-L115) | `/api/customer/services/check-serviceability` | `POST` | [`customerService.controller.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/customer/controllers/customerService.controller.js#L130-L168) `checkServiceability` | `Service`, `VendorService`, `Vendor` | `{ success: true, data: { serviceable: Boolean, vendors: [...] } }` | Public | None |
| **4. Booking Wizard** | [`ServiceBookingWizard.jsx`](file:///d:/Appzeto_Projects/safe-fire/frontend/src/modules/UserApp/components/ServiceBookingWizard.jsx#L1-L320) | None (Local Multi-step Form State) | N/A | N/A | N/A | Local React State | User Auth required to submit | Role `user` |
| **5. Create Booking** | [`ServiceBookingWizard.jsx`](file:///d:/Appzeto_Projects/safe-fire/frontend/src/modules/UserApp/components/ServiceBookingWizard.jsx#L190-L240) | `/api/customer/bookings` | `POST` | [`customerService.controller.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/customer/controllers/customerService.controller.js#L173-L270) `createBooking` | `Service`, `VendorService`, `Vendor`, `ServiceBooking`, `Notification` | `{ success: true, message: '...', data: { booking: {...} } }` | Required | Role `user` |
| **6. Confirmation** | [`ServiceBookingSuccessPage.jsx`](file:///d:/Appzeto_Projects/safe-fire/frontend/src/modules/UserApp/pages/ServiceBookingSuccessPage.jsx#L1-L90) | None (Reads state from Router/Store) | N/A | N/A | `ServiceBooking` | UI View | Required | Role `user` |
| **7. My Bookings** | [`MyServiceBookingsPage.jsx`](file:///d:/Appzeto_Projects/safe-fire/frontend/src/modules/UserApp/pages/MyServiceBookingsPage.jsx#L1-L220) | `/api/customer/bookings` | `GET` | [`customerService.controller.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/customer/controllers/customerService.controller.js#L275-L300) `getMyBookings` | `ServiceBooking`, `Service`, `Vendor` | `{ success: true, data: { bookings: [...], pagination: {...} } }` | Required | Role `user` |
| **8. Booking Detail** | [`MyServiceBookingsPage.jsx`](file:///d:/Appzeto_Projects/safe-fire/frontend/src/modules/UserApp/pages/MyServiceBookingsPage.jsx#L140-L195) | `/api/customer/bookings/:id` | `GET` | [`customerService.controller.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/customer/controllers/customerService.controller.js#L305-L325) `getBookingById` | `ServiceBooking`, `Service`, `Vendor` | `{ success: true, data: { booking: {...} } }` | Required | Role `user` (Owns booking) |
| **9. Cancellation** | [`MyServiceBookingsPage.jsx`](file:///d:/Appzeto_Projects/safe-fire/frontend/src/modules/UserApp/pages/MyServiceBookingsPage.jsx#L100-L135) | `/api/customer/bookings/:id/cancel` | `PATCH` | [`customerService.controller.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/customer/controllers/customerService.controller.js#L330-L375) `cancelBooking` | `ServiceBooking`, `Notification` | `{ success: true, message: '...', data: { booking: {...} } }` | Required | Role `user` (Owns booking) |
| **10. Reviews/Rating**| Not implemented in UI | N/A | N/A | Not implemented | N/A | N/A | N/A | N/A |

---

## 4. Vendor Service Flow

### Vendor Capability Matrix

SafeFire vendors possess a boolean capabilities structure in [`Vendor.model.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/models/Vendor.model.js#L34-L44):
```javascript
vendorCapabilities: {
  sellsProducts: { type: Boolean, default: true },
  providesServices: { type: Boolean, default: false }
}
```

Backend middleware [`authorize.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/middlewares/authorize.js#L80-L105) (`requireVendorCapability('services')`) enforces this capability on all vendor service endpoints.

| Feature / Action | Product-Only Vendor (`sellsProducts: true, providesServices: false`) | Service-Only Vendor (`sellsProducts: false, providesServices: true`) | Product + Service Vendor (`sellsProducts: true, providesServices: true`) |
| :--- | :--- | :--- | :--- |
| **Vendor Login & Portal Access** | 🟢 Allowed | 🟢 Allowed | 🟢 Allowed |
| **Product Management & Inventory** | 🟢 Allowed | 🔴 Blocked (`requireVendorCapability('products')`) | 🟢 Allowed |
| **Product Order Fulfillment** | 🟢 Allowed | 🔴 Blocked | 🟢 Allowed |
| **Access `/vendor/services/*` UI** | 🔴 Blocked (Redirected to `/vendor/dashboard`) | 🟢 Allowed | 🟢 Allowed |
| **Browse Master Service Catalog** | 🔴 403 Forbidden | 🟢 Allowed (`GET /api/vendor/services/available`) | 🟢 Allowed |
| **Enable & Configure Store Service**| 🔴 403 Forbidden | 🟢 Allowed (`POST /api/vendor/services`) | 🟢 Allowed |
| **Set Service Pincodes & Hours** | 🔴 403 Forbidden | 🟢 Allowed (`PUT /api/vendor/services/:id`) | 🟢 Allowed |
| **Request New Service Catalog** | 🔴 403 Forbidden | 🟢 Allowed (`POST /api/vendor/service-requests`) | 🟢 Allowed |
| **Receive & Manage Service Bookings**| 🔴 403 Forbidden | 🟢 Allowed (`GET /api/vendor/service-bookings`) | 🟢 Allowed |
| **Transition Booking Status** | 🔴 403 Forbidden | 🟢 Allowed (`PATCH /api/vendor/service-bookings/:id/status`) | 🟢 Allowed |
| **Vendor Wallet / Payouts** | 🟢 Connected to Product Orders | 🔴 Zero Service Credits Generated | 🟡 Product Credits Only |

### Detailed Trace for Vendor Service Lifecycle

```
[Vendor Registration / Admin Capability Approval]
       │
       ▼
[Discover Available Services] (AvailableServices.jsx -> GET /api/vendor/services/available)
       │
       ▼
[Enable Service for Vendor Store] (POST /api/vendor/services)
       │
       ▼
[Configure Pricing, Pincodes, Hours & Capacity] (VendorServiceConfigModal.jsx -> PUT /api/vendor/services/:id)
       │
       ▼
[Toggle Active / Inactive Status] (PATCH /api/vendor/services/:id/status)
       │
       ▼
[Receive New Booking Notification] (Socket.IO 'newServiceBooking' + In-App Notification)
       │
       ▼
[Manage & Accept / Advance Booking] (VendorServiceBookings.jsx -> PATCH /api/vendor/service-bookings/:id/status)
       │
       ▼
[Mark Service Completed] (status: 'completed')
```

---

## 5. Admin Service Flow

### Admin Screens & Connectivity Classification

| Admin Screen | File Path | API Endpoints Called | Status | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Service Categories** | [`ServiceCategories.jsx`](file:///d:/Appzeto_Projects/safe-fire/frontend/src/modules/Admin/pages/services/ServiceCategories.jsx) | `GET, POST, PUT, DELETE, PATCH /api/admin/service-categories` | 🟢 FULLY CONNECTED | Full CRUD with icon, order, and toggle status |
| **Services Master** | [`ServicesMaster.jsx`](file:///d:/Appzeto_Projects/safe-fire/frontend/src/modules/Admin/pages/services/ServicesMaster.jsx) | `GET, POST, PUT, DELETE, PATCH /api/admin/services` | 🟢 FULLY CONNECTED | Full master catalog management with dynamic fields & pricing types |
| **Admin Service Requests** | [`AdminServiceRequests.jsx`](file:///d:/Appzeto_Projects/safe-fire/frontend/src/modules/Admin/pages/services/AdminServiceRequests.jsx) | `GET /api/admin/service-requests`, `PATCH /api/admin/service-requests/:id/review` | 🟢 FULLY CONNECTED | Approves/rejects vendor service proposals with rejection reason |
| **Admin Service Bookings** | [`AdminServiceBookings.jsx`](file:///d:/Appzeto_Projects/safe-fire/frontend/src/modules/Admin/pages/services/AdminServiceBookings.jsx) | `GET /api/admin/service-bookings`, `PATCH /api/admin/service-bookings/:id/status` | 🟢 FULLY CONNECTED | Read audit log for all system bookings with emergency status overrides |
| **Service Pricing & Commissions** | None (Dedicated Service Commission Screen does not exist) | None | ⚫ DEAD / UNUSED | Product commission screen exists, but does not handle services |
| **Service Payouts / Reports** | None (Dedicated Service Payout reports do not exist) | None | ⚫ DEAD / UNUSED | Vendor payouts only aggregate product order escrow |

---

## 6. Service Booking State Machine

### State Enums

From [`backend/src/models/ServiceBooking.model.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/models/ServiceBooking.model.js#L54-L63):
```javascript
status: {
  type: String,
  enum: ['pending', 'confirmed', 'assigned', 'in_progress', 'completed', 'cancelled'],
  default: 'pending'
}
```

### State Transition Matrix

| From Status | Allowed Next Statuses | Who Can Trigger | Validation Prerequisites | Database Changes | Dispatched Notifications | Financial Effects |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`pending`** | `confirmed` | Vendor, Admin | Booking belongs to vendor | `status = 'confirmed'`, appends `statusHistory` | User Notification (`status: 'confirmed'`) | None |
| **`pending`** | `cancelled` | Vendor, Customer, Admin | Vendor must provide `cancellationReason` | `status = 'cancelled'`, sets `cancelledBy`, `cancellationReason` | Vendor / User Notification | If online payment was made: None (No auto-refund) |
| **`confirmed`** | `assigned` | Admin (Manual) | Valid status update | `status = 'assigned'`, appends `statusHistory` | User Notification | None |
| **`confirmed`** | `in_progress` | Vendor, Admin | Booking belongs to vendor | `status = 'in_progress'`, appends `statusHistory` | User Notification (`status: 'in_progress'`) | None |
| **`confirmed`** | `cancelled` | Vendor, Customer, Admin | Vendor or Customer cancellation | `status = 'cancelled'`, sets `cancelledBy`, `cancellationReason` | Vendor / User Notification | No auto-refund |
| **`assigned`** | `in_progress` | Vendor, Admin | Status progression | `status = 'in_progress'`, appends `statusHistory` | User Notification | None |
| **`assigned`** | `cancelled` | Customer, Admin | Allowed cancellation window | `status = 'cancelled'`, sets `cancelledBy`, `cancellationReason` | Vendor / User Notification | No auto-refund |
| **`in_progress`** | `completed` | Vendor, Admin | Booking belongs to vendor | `status = 'completed'`, appends `statusHistory` | User Notification (`status: 'completed'`) | **GAP:** No Vendor Wallet Credit or Commission |
| **`in_progress`** | `cancelled` | Customer, Admin | Customer emergency cancel | `status = 'cancelled'`, sets `cancelledBy`, `cancellationReason` | Vendor / User Notification | No auto-refund |
| **`completed`** | *(None - Terminal)* | N/A | Terminal State | No further transitions allowed | None | Terminal |
| **`cancelled`** | *(None - Terminal)* | N/A | Terminal State | No further transitions allowed | None | Terminal |

---

## 7. Pincode / Serviceability

### Implementation Mechanics

1. **Storage:** Stored as an array of trimmed uppercase string pincodes in [`VendorService.model.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/models/VendorService.model.js#L39-L44):
   ```javascript
   serviceAreas: [{ type: String, trim: true }]
   ```
2. **Frontend Check:** [`ServiceDetailPage.jsx`](file:///d:/Appzeto_Projects/safe-fire/frontend/src/modules/UserApp/pages/ServiceDetailPage.jsx#L90-L115) sends a 6-digit pincode to `POST /api/customer/services/check-serviceability`.
3. **Backend Serviceability Check:** [`customerService.controller.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/customer/controllers/customerService.controller.js#L130-L168) finds all `VendorService` records where `serviceAreas: cleanPincode` and `isActive: true`, populated with active/approved vendors with `vendorCapabilities.providesServices: true`.
4. **Hard Validation on Booking Creation:** In [`customerService.controller.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/customer/controllers/customerService.controller.js#L215-L225):
   ```javascript
   const isServiceable = vendorService.serviceAreas.some(
     area => area.trim() === cleanPincode
   );
   if (!isServiceable) {
     return res.status(400).json({
       success: false,
       message: `Vendor does not provide service to pincode ${cleanPincode}`
     });
   }
   ```
5. **Direct API Bypass Assessment:** 🟢 **Immune to API Bypass.** If a malicious actor sends an arbitrary pincode to `POST /api/customer/bookings`, the controller strictly validates that the pincode exists in `vendorService.serviceAreas`.

---

## 8. Working Hours

### Implementation Mechanics

1. **Storage:** Stored in [`VendorService.model.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/models/VendorService.model.js#L46-L50):
   ```javascript
   workingHours: {
     start: { type: String, default: '09:00' },
     end: { type: String, default: '18:00' }
   }
   ```
2. **Backend Validation:** In [`customerService.controller.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/customer/controllers/customerService.controller.js#L230-L250):
   - Compares the slot start hour/minute against `vendorService.workingHours.start` and `end`.
   - Rejects with `400` if the slot falls outside `workingHours`.
3. **Vulnerabilities / Edge Cases Found:**
   - **No Day-of-Week Configuration:** Vendors cannot configure closed days (e.g. Sundays or holidays). The system assumes vendors work 7 days a week.
   - **Timezone Assumption:** Backend parses time slot strings assuming local/server time without explicit UTC/IST conversion.
   - **Past Time Slots on Same-Day Bookings:** If a booking is created for today's date, the backend validates that `bookingDate >= startOfToday`, but does not strictly validate that the `timeSlot` is in the future relative to `Date.now()`.

---

## 9. Daily Capacity

### Implementation Mechanics

1. **Storage:** Stored in [`VendorService.model.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/models/VendorService.model.js#L52-L55):
   ```javascript
   dailyCapacity: { type: Number, default: 10, min: 1 }
   ```
2. **Backend Counting & Scoping:**
   - Scoped strictly by: `vendorId` + `vendorServiceId` + `bookingDate` (start of day `00:00:00.000` to end of day `23:59:59.999`).
   - Active statuses counted: `['pending', 'confirmed', 'assigned', 'in_progress']`.
3. **Cancellation & Rejection Slot Release:**
   - When a booking is marked `cancelled`, it is automatically excluded from the active capacity query (`$in: ['pending', 'confirmed', 'assigned', 'in_progress']`), immediately releasing the slot for new customers.
4. **Concurrency / Race Condition Vulnerability:**
   - The capacity check in [`customerService.controller.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/customer/controllers/customerService.controller.js#L245-L255) uses a read-then-write pattern (`ServiceBooking.countDocuments(...)` followed by `ServiceBooking.create(...)`) without a MongoDB transaction or atomic version increment on `VendorService`. Concurrent requests for the last remaining slot on the same day can exceed `dailyCapacity`.

---

## 10. Payment Flow

### Forensic Trace of Service Payment

```
[Customer Selects Payment Method] ('cod', 'card', 'upi', 'netbanking', 'wallet')
                       │
                       ▼
         [Frontend Sends POST /api/customer/bookings]
                       │
                       ▼
  [Backend Executes customerService.controller.js createBooking]
                       │
         ┌─────────────┴─────────────┐
         ▼                           ▼
[paymentMethod === 'cod']   [paymentMethod !== 'cod']
         │                           │
         ▼                           ▼
[paymentStatus = 'pending']  [paymentStatus = 'paid']  <-- 🔴 FAKE INSTANT PAYMENT!
```

### Critical Findings

1. **Razorpay Disconnect (P0):**
   - In [`customerService.controller.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/customer/controllers/customerService.controller.js#L260):
     ```javascript
     paymentStatus: paymentMethod === 'cod' ? 'pending' : 'paid'
     ```
   - For all online payment options (`'card'`, `'upi'`, `'netbanking'`, `'wallet'`), the system marks the booking `paymentStatus = 'paid'` immediately without creating a Razorpay Order, without opening Razorpay Checkout Modal, and without cryptographic webhook/signature verification.
2. **Wallet Disconnect (P0):**
   - If `'wallet'` is selected, customer wallet balance is neither checked nor debited.
3. **Refund Disconnect (P1):**
   - When a booking with `paymentStatus = 'paid'` is cancelled, no refund initiation occurs (no Razorpay refund API call and no customer wallet credit).

---

## 11. Financial Flow, Commissions & Payouts

### Model & Ledger Review

1. **Commissions Schema:** [`backend/src/models/Commission.model.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/models/Commission.model.js#L7-L12)
   ```javascript
   orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true }
   ```
   *Strictly references `Order`. It cannot store a `ServiceBooking` reference.*
2. **Vendor Wallet Transactions:** [`backend/src/models/VendorWalletTransaction.model.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/models/VendorWalletTransaction.model.js#L8-L15)
   ```javascript
   type: { type: String, enum: ['order_settlement', 'withdrawal', 'refund_deduction', 'adjustment'] }
   ```
   *No `service_settlement` transaction type exists.*
3. **Escrow Release Job:** [`backend/src/jobs/escrowCron.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/jobs/escrowCron.js#L25-L60)
   *Only polls the `Order` collection for orders delivered past the return window.*
4. **Vendor Earnings API:** [`backend/src/modules/vendor/controllers/order.controller.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/vendor/controllers/order.controller.js#L240-L280) `getEarnings`
   *Aggregates order items from `Order.find({ 'items.vendorId': vendorId })`. Service bookings are completely omitted.*

---

## 12. Notification Matrix

| Event | Calling Function | DB Notification Created? | `recipientType` | `recipientId` | Socket.IO Room | Push Notification |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **New Service Booking Created** | `createBooking` ([customerService.controller.js:255](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/customer/controllers/customerService.controller.js#L255)) | 🟢 Yes | `'vendor'` | `vendor._id` | `vendor_<id>` (`newServiceBooking`) | 🟢 Dispatched via `createNotification` |
| **Customer Cancels Booking** | `cancelBooking` ([customerService.controller.js:360](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/customer/controllers/customerService.controller.js#L360)) | 🟢 Yes | `'vendor'` | `booking.vendorId` | `vendor_<id>` (`serviceBookingCancelled`) | 🟢 Dispatched via `createNotification` |
| **Vendor Updates Booking Status** | `updateBookingStatus` ([vendorBooking.controller.js:90](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/vendor/controllers/vendorBooking.controller.js#L90)) | 🟢 Yes | `'user'` | `booking.userId` | `user_<id>` (`serviceBookingStatusUpdated`) | 🟢 Dispatched via `createNotification` |
| **Admin Reviews Vendor Request** | `reviewServiceRequest` ([adminServiceRequest.controller.js:65](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/admin/controllers/adminServiceRequest.controller.js#L65)) | 🟢 Yes | `'vendor'` | `serviceRequest.vendorId` | In-App / DB | 🟢 Dispatched via `createNotification` |

---

## 13. Reviews / Ratings

### Forensic Findings

1. **Review Model:** [`backend/src/models/Review.model.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/models/Review.model.js#L6-L12)
   ```javascript
   productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true }
   ```
2. **Absence of Service Review Mechanism:**
   - No `serviceId` or `vendorServiceId` or `bookingId` field exists in `Review.model.js`.
   - No customer API endpoint exists to rate or review a completed service booking.
   - The rating displayed on vendor service cards in the customer UI is the vendor's global product store rating (`vendor.rating`), not a service-specific rating.

---

## 14. Cancellation / Refund Matrix

| Trigger | Booking Status Window | Refund Amount | Vendor Ledger Impact | Platform Commission Impact |
| :--- | :--- | :--- | :--- | :--- |
| **Customer Cancels Booking** | `pending`, `confirmed`, `assigned`, `in_progress` | 🔴 ₹0 (No refund processed even if `paymentStatus === 'paid'`) | None | None |
| **Vendor Rejects / Cancels** | `pending`, `confirmed`, `in_progress` | 🔴 ₹0 (No refund processed) | None | None |
| **Admin Cancels Booking** | Any non-terminal status | 🔴 ₹0 (No refund processed) | None | None |

---

## 15. Authorization & Security Findings

| Vector / Check | Implementation File & Line | Security Assessment | Vulnerability Status |
| :--- | :--- | :--- | :--- |
| **Customer Booking Access** | [`customerService.controller.js:310`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/customer/controllers/customerService.controller.js#L310) `getBookingById` | Enforces `{ _id: id, userId: req.user._id }` | 🟢 SECURE |
| **Customer Booking Cancellation** | [`customerService.controller.js:335`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/customer/controllers/customerService.controller.js#L335) `cancelBooking` | Enforces `{ _id: id, userId: req.user._id }` | 🟢 SECURE |
| **Vendor Booking Access** | [`vendorBooking.controller.js:20`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/vendor/controllers/vendorBooking.controller.js#L20) `getVendorBookings` | Scopes queries by `vendorId: req.vendor._id` | 🟢 SECURE |
| **Vendor Service Manipulation** | [`vendorService.controller.js:80`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/vendor/controllers/vendorService.controller.js#L80) `updateVendorService` | Enforces `{ _id: id, vendorId: req.vendor._id }` | 🟢 SECURE |
| **Vendor Capability Guarding** | [`authorize.js:85`](file:///d:/Appzeto_Projects/safe-fire/backend/src/middlewares/authorize.js#L85) `requireVendorCapability` | Blocks product-only vendors from service APIs with HTTP 403 | 🟢 SECURE |
| **Service Price Tampering** | [`customerService.controller.js:235`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/customer/controllers/customerService.controller.js#L235) `createBooking` | Pricing is computed server-side from `VendorService.price` / `variantPrices` | 🟢 SECURE (Frontend cannot submit custom price) |
| **Pincode Spoofing / Bypass** | [`customerService.controller.js:220`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/customer/controllers/customerService.controller.js#L220) `createBooking` | Backend validates pincode against `vendorService.serviceAreas` | 🟢 SECURE |
| **Capacity Race Condition** | [`customerService.controller.js:245`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/customer/controllers/customerService.controller.js#L245) `createBooking` | Non-atomic check-then-insert | 🟡 VULNERABLE to concurrent overbooking |
| **Online Payment Bypass** | [`customerService.controller.js:260`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/customer/controllers/customerService.controller.js#L260) `createBooking` | Unconditionally marks `paid` for non-COD | 🔴 HIGH RISK / BROKEN GATEWAY |

---

## 16. Frontend ↔ Backend Connectivity Matrix

```
[UI Component] ──> [Zustand Store / Axios Service] ──> [Express Route] ──> [Middleware] ──> [Controller] ──> [Mongoose Model] ──> [MongoDB]
```

| Domain | UI Page / Component | Client Service / Store | API Route | Controller Action | Model / DB | Classification |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Customer Catalog** | `ServicesPage.jsx` | `customerServiceApi.getServices` | `GET /api/customer/services` | `listServices` | `Service`, `ServiceCategory` | 🟢 FULLY CONNECTED |
| **Customer Detail** | `ServiceDetailPage.jsx` | `customerServiceApi.getServiceBySlug` | `GET /api/customer/services/:slug` | `getServiceBySlug` | `Service`, `VendorService`, `Vendor` | 🟢 FULLY CONNECTED |
| **Customer Serviceability** | `ServiceDetailPage.jsx` | `customerServiceApi.checkServiceability` | `POST /api/customer/services/check-serviceability` | `checkServiceability` | `VendorService` | 🟢 FULLY CONNECTED |
| **Customer Booking** | `ServiceBookingWizard.jsx` | `customerServiceApi.createBooking` | `POST /api/customer/bookings` | `createBooking` | `ServiceBooking` | 🟡 PARTIALLY CONNECTED (Online payment gateway disconnected) |
| **Customer My Bookings** | `MyServiceBookingsPage.jsx` | `customerServiceApi.getMyBookings` | `GET /api/customer/bookings` | `getMyBookings` | `ServiceBooking` | 🟢 FULLY CONNECTED |
| **Customer Cancel** | `MyServiceBookingsPage.jsx` | `customerServiceApi.cancelBooking` | `PATCH /api/customer/bookings/:id/cancel` | `cancelBooking` | `ServiceBooking` | 🟢 FULLY CONNECTED |
| **Vendor Available** | `AvailableServices.jsx` | `useVendorServiceStore.fetchAvailableServices` | `GET /api/vendor/services/available` | `getAvailableServices` | `Service` | 🟢 FULLY CONNECTED |
| **Vendor My Services** | `MyVendorServices.jsx` | `useVendorServiceStore.fetchMyServices` | `GET /api/vendor/services/my-services` | `getMyVendorServices` | `VendorService` | 🟢 FULLY CONNECTED |
| **Vendor Enable Service** | `AvailableServices.jsx` | `useVendorServiceStore.enableService` | `POST /api/vendor/services` | `enableService` | `VendorService` | 🟢 FULLY CONNECTED |
| **Vendor Config Service**| `VendorServiceConfigModal.jsx`| `useVendorServiceStore.updateServiceConfig` | `PUT /api/vendor/services/:id` | `updateVendorService` | `VendorService` | 🟢 FULLY CONNECTED |
| **Vendor Toggle Status** | `MyVendorServices.jsx` | `useVendorServiceStore.toggleStatus` | `PATCH /api/vendor/services/:id/status` | `toggleVendorServiceStatus` | `VendorService` | 🟢 FULLY CONNECTED |
| **Vendor Disable Service**| `MyVendorServices.jsx` | `useVendorServiceStore.disableService` | `DELETE /api/vendor/services/:id` | `deleteVendorService` | `VendorService` | 🟢 FULLY CONNECTED |
| **Vendor Request Catalog**| `RequestService.jsx` | `vendorService.createServiceRequest` | `POST /api/vendor/service-requests` | `createServiceRequest` | `ServiceRequest` | 🟢 FULLY CONNECTED |
| **Vendor Request History**| `VendorServiceRequests.jsx` | `vendorService.getMyServiceRequests` | `GET /api/vendor/service-requests/my-requests` | `getMyServiceRequests` | `ServiceRequest` | 🟢 FULLY CONNECTED |
| **Vendor Bookings List** | `VendorServiceBookings.jsx` | `vendorService.getVendorBookings` | `GET /api/vendor/service-bookings` | `getVendorBookings` | `ServiceBooking` | 🟢 FULLY CONNECTED |
| **Vendor Update Status** | `VendorServiceBookingModal.jsx`| `vendorService.updateBookingStatus` | `PATCH /api/vendor/service-bookings/:id/status` | `updateBookingStatus` | `ServiceBooking` | 🟢 FULLY CONNECTED |
| **Admin Categories CRUD**| `ServiceCategories.jsx` | `useServiceCategoryStore` | `/api/admin/service-categories/*` | `serviceCategory.controller.js` | `ServiceCategory` | 🟢 FULLY CONNECTED |
| **Admin Master CRUD** | `ServicesMaster.jsx` | `useServiceStore` | `/api/admin/services/*` | `service.controller.js` | `Service` | 🟢 FULLY CONNECTED |
| **Admin Request Review** | `AdminServiceRequests.jsx` | `adminService.reviewServiceRequest` | `PATCH /api/admin/service-requests/:id/review` | `reviewServiceRequest` | `ServiceRequest`, `Service` | 🟢 FULLY CONNECTED |
| **Admin Bookings Audit** | `AdminServiceBookings.jsx` | `adminService.getAllBookings` | `GET /api/admin/service-bookings` | `getAllBookings` | `ServiceBooking` | 🟢 FULLY CONNECTED |
| **Admin Status Override**| `AdminServiceBookings.jsx` | `adminService.updateBookingStatus` | `PATCH /api/admin/service-bookings/:id/status` | `updateBookingStatus` | `ServiceBooking` | 🟢 FULLY CONNECTED |

---

## 17. Database Model Inventory

### 1. `ServiceCategory`
- **Collection:** `servicecategories`
- **File:** [`backend/src/models/ServiceCategory.model.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/models/ServiceCategory.model.js)
- **Key Fields:** `name` (String, unique), `slug` (String, unique), `description` (String), `icon` (String), `image` (String), `order` (Number), `isActive` (Boolean)
- **Indexes:** `{ slug: 1 }`, `{ order: 1 }`

### 2. `Service`
- **Collection:** `services`
- **File:** [`backend/src/models/Service.model.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/models/Service.model.js)
- **Key Fields:** `name` (String), `slug` (String, unique), `category` (ObjectId -> `ServiceCategory` or String), `description` (String), `basePrice` (Number), `pricingType` (`fixed`, `hourly`, `custom`), `bookingType` (`slot`, `direct`, `consultation`), `serviceSettings` (Object), `serviceFields` (Array), `isActive` (Boolean)
- **Indexes:** `{ slug: 1 }`, `{ category: 1 }`, `{ isActive: 1 }`

### 3. `VendorService`
- **Collection:** `vendorservices`
- **File:** [`backend/src/models/VendorService.model.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/models/VendorService.model.js)
- **Key Fields:** `vendorId` (ObjectId -> `Vendor`), `serviceId` (ObjectId -> `Service`), `price` (Number), `variantPrices` (Array), `serviceAreas` ([String] pincodes), `workingHours` (`start`, `end`), `dailyCapacity` (Number), `isActive` (Boolean)
- **Indexes:** Compound Unique `{ vendorId: 1, serviceId: 1 }`

### 4. `ServiceBooking`
- **Collection:** `servicebookings`
- **File:** [`backend/src/models/ServiceBooking.model.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/models/ServiceBooking.model.js)
- **Key Fields:** `bookingId` (String, unique `SRV-...`), `userId` (ObjectId -> `User`), `vendorId` (ObjectId -> `Vendor`), `vendorServiceId` (ObjectId -> `VendorService`), `serviceId` (ObjectId -> `Service`), `pincode` (String), `serviceAddress` (Object), `bookingDate` (Date), `timeSlot` (`start`, `end`), `pricing` (`basePrice`, `variantPrice`, `totalPrice`), `paymentMethod` (`cod`, `card`, `upi`, `netbanking`, `wallet`), `paymentStatus` (`pending`, `paid`, `failed`, `refunded`), `status` (`pending`, `confirmed`, `assigned`, `in_progress`, `completed`, `cancelled`), `statusHistory` (Array)
- **Indexes:** `{ bookingId: 1 }`, `{ userId: 1 }`, `{ vendorId: 1 }`, `{ status: 1 }`, `{ bookingDate: 1 }`

### 5. `ServiceRequest`
- **Collection:** `servicerequests`
- **File:** [`backend/src/models/ServiceRequest.model.js`](file:///d:/Appzeto_Projects/safe-fire/backend/src/models/ServiceRequest.model.js)
- **Key Fields:** `vendorId` (ObjectId -> `Vendor`), `serviceName` (String), `categoryName` (String), `description` (String), `proposedBasePrice` (Number), `status` (`pending`, `approved`, `rejected`), `adminFeedback` (String), `reviewedBy` (ObjectId -> `User`)
- **Indexes:** `{ vendorId: 1 }`, `{ status: 1 }`

---

## 18. Existing Test Coverage

### Test Inventory Assessment

| Test File | Type | What is Actually Tested | What is NOT Tested |
| :--- | :--- | :--- | :--- |
| [`testCapabilityMiddleware.js`](file:///d:/Appzeto_Projects/safe-fire/backend/tests/unit/testCapabilityMiddleware.js) | Unit | Vendor `vendorCapabilities.providesServices` boolean gate | Request mocking, HTTP status codes, edge cases |
| [`testServiceFlow.js`](file:///d:/Appzeto_Projects/safe-fire/backend/tests/integration/testServiceFlow.js) | Integration (Draft) | Connects to MongoDB, finds/creates Vendor, finds/creates Service | Does NOT create bookings, does NOT test capacity, does NOT test status transitions |

**Findings:**
- Unit Test Coverage for Services: **< 10%**
- Integration / E2E Test Coverage for Services: **0% automated execution in CI**

---

## 19. Static / Mock / Fallback Data Findings

- **Frontend Search:** Audited `ServicesPage.jsx`, `ServiceDetailPage.jsx`, `ServiceBookingWizard.jsx`, and Zustand stores.
- **Result:** 🟢 **No static mock arrays found.** All catalog listings, service detail pages, vendor options, and booking histories dynamically fetch data from MongoDB via `/api/customer/*`, `/api/vendor/*`, and `/api/admin/*`.

---

## 20. Broken & Partial Features Summary

1. **Razorpay Online Payment for Services:** Broken / Bypassed. Non-COD bookings automatically flagged `paymentStatus = 'paid'` without hitting Razorpay gateway.
2. **Customer Wallet Deductions for Services:** Non-functional. Selecting `'wallet'` flags `paymentStatus = 'paid'` without balance check or ledger debit.
3. **Vendor Wallet Credits & Escrow on Service Completion:** Missing. Service bookings do not generate `Commission` records or vendor wallet transactions.
4. **Service-Specific Customer Reviews & Ratings:** Not implemented. `Review.model.js` is strictly tied to `Product`.
5. **Vendor Closed Days & Holiday Calendar:** Not supported. The system assumes a 7-day work week.
6. **Cancellation Auto-Refund for Services:** Missing. Online paid cancellations do not trigger refund events.

---

## 21. Risk Classification

### Priority P0: Critical / Money / Security / Booking Corruption

1. **P0-1: Online Service Payments Bypass Gateway & Mark as Paid**  
   - **Location:** [`backend/src/modules/customer/controllers/customerService.controller.js:260`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/customer/controllers/customerService.controller.js#L260)  
   - **Risk:** Customers can book services with `'card'`, `'upi'`, `'netbanking'`, or `'wallet'` and have the booking confirmed as `paid` without paying any money.  
   - **Classification:** **CONFIRMED**

### Priority P1: Major Functionality Broken

2. **P1-1: Completed Service Bookings Do Not Credit Vendor Wallets or Generate Platform Commission**  
   - **Location:** [`backend/src/modules/vendor/controllers/vendorBooking.controller.js:80`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/vendor/controllers/vendorBooking.controller.js#L80), [`backend/src/models/Commission.model.js:8`](file:///d:/Appzeto_Projects/safe-fire/backend/src/models/Commission.model.js#L8)  
   - **Risk:** Vendors provide services but their balance in SafeFire vendor wallet remains ₹0, and platform records ₹0 commission.  
   - **Classification:** **CONFIRMED**

3. **P1-2: Service Cancellations Do Not Initiate Customer Refund**  
   - **Location:** [`backend/src/modules/customer/controllers/customerService.controller.js:350`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/customer/controllers/customerService.controller.js#L350)  
   - **Risk:** Paid bookings that are cancelled do not credit money back to user wallet or trigger Razorpay refund.  
   - **Classification:** **CONFIRMED**

### Priority P2: Important But Non-Blocking

4. **P2-1: Lack of Atomic Concurrency Lock on Daily Capacity**  
   - **Location:** [`backend/src/modules/customer/controllers/customerService.controller.js:245-255`](file:///d:/Appzeto_Projects/safe-fire/backend/src/modules/customer/controllers/customerService.controller.js#L245-L255)  
   - **Risk:** High concurrent requests for the same date could exceed vendor's `dailyCapacity`.  
   - **Classification:** **CONFIRMED**

5. **P2-2: Missing Service Reviews & Rating Model**  
   - **Location:** [`backend/src/models/Review.model.js:8`](file:///d:/Appzeto_Projects/safe-fire/backend/src/models/Review.model.js#L8)  
   - **Risk:** Customers cannot leave feedback on completed services; UI displays vendor product rating instead.  
   - **Classification:** **CONFIRMED**

### Priority P3: Minor / Polish

6. **P3-1: Vendor Weekly Working Days & Schedule Configuration**  
   - **Location:** [`backend/src/models/VendorService.model.js:46-50`](file:///d:/Appzeto_Projects/safe-fire/backend/src/models/VendorService.model.js#L46-L50)  
   - **Risk:** Vendors cannot mark specific days of the week (e.g. Sunday) as closed.  
   - **Classification:** **CONFIRMED**

---

## SERVICE AUDIT VERDICT

```
==================================================
           SAFEFIRE SERVICE AUDIT VERDICT
==================================================

Total Features Audited: 21

🟢 Fully Connected:     16
🟡 Partially Connected:  2  (Booking Wizard payment step, Customer Controller payment assignment)
🔴 Broken:               3  (Razorpay Gateway connection, Vendor Commission/Wallet Credit, Refund pipeline)
🟣 Static / Mock:        0  (All UI data is dynamically sourced from MongoDB)
⚫ Dead / Unused:        0  (All configured routes and pages have active handlers)

Risk Breakdown:
P0 (Critical / Gateway):   1
P1 (Major Financial Flow): 2
P2 (Important / Features): 2
P3 (Minor / Polish):       1

==================================================
```
