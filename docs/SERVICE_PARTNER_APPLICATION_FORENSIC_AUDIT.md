# SafeFire — Service Partner Application & Admin Approval Forensic Audit

## 1. Executive Summary

This forensic audit analyzes the end-to-end flow of vendor capabilities in SafeFire, specifically focusing on the transition of a **Product Vendor (Approved Seller)** into an **Approved Service Partner (Hybrid Vendor)**.

### Core Finding
Currently, the **"Enable Services →"** button on the Vendor Dashboard executes an immediate, unvalidated mutation:
```
Vendor Dashboard → PUT /api/vendor/auth/profile → Vendor.vendorCapabilities.providesServices = true
```
This bypasses any business vetting, documentation, or admin approval. The goal of this engineering initiative is to introduce a formal:
```
Service Partner Application → Admin Review & Approval → Capability Synchronization
```
while keeping the downstream **VendorService** catalog configuration and **Customer Service Marketplace** completely functional and untouched.

---

## 2. Current Flow vs. Target Architecture

```mermaid
flowchart TD
    subgraph Current Flow (Direct Toggle)
        D1[Vendor Dashboard] -->|Click 'Enable Services'| P1[PUT /api/vendor/auth/profile]
        P1 -->|Direct DB Update| DB1[vendorCapabilities.providesServices = true]
        DB1 --> S1[Vendor gets instant access to service routes]
    end

    subgraph Target Architecture (Vetted Workflow)
        D2[Vendor Dashboard] -->|Click 'Enable Services'| APP[Service Partner Application Form]
        APP -->|POST /api/vendor/service-partner-applications| SUB[Application: status = pending]
        SUB --> V_PEND[Vendor: serviceCapability.status = pending<br/>providesServices = false]
        SUB --> ADM[Admin Portal: Service Partner Applications]
        ADM -->|Review & Action| DEC{Admin Decision}
        DEC -->|Approve (Atomic Session)| APP_OK[Application: status = approved<br/>Vendor: serviceCapability.status = approved<br/>vendorCapabilities.providesServices = true]
        DEC -->|Reject (With Reason)| REJ[Application: status = rejected<br/>Vendor: serviceCapability.status = rejected<br/>rejectionReason = reason]
        REJ --> EDIT[Vendor updates and resubmits]
        APP_OK --> CFG[Vendor configures VendorService master items]
        CFG --> MKT[Customer Service Marketplace Discovery & Booking]
    end
```

---

## 3. Files Involved in the Current Capability & Service Architecture

### Frontend
1. `frontend/src/modules/Vendor/pages/Dashboard.jsx`:
   - Renders Marketplace Capabilities cards (Products & Services).
   - Lines 383–389: Direct button `<button onClick={() => handleEnableCapability('providesServices')}>Enable Services →</button>`.
   - Lines 189–201: `handleEnableCapability` issues `PUT /api/vendor/auth/profile`.
2. `frontend/src/modules/Vendor/pages/settings/ProfileSettings.jsx`:
   - Lines 333–344: Renders direct toggle switch for `providesServices`.
   - Lines 68–96: `executeCapabilityChange` sends `PUT /api/vendor/auth/profile`.
3. `frontend/src/modules/Vendor/components/CapabilityAccessRequired.jsx`:
   - Intercepts unauthorized navigation to `/vendor/services/*`.
   - Lines 24–48: Contains button `"Enable Service Capability"` that directly sets `providesServices: true`.
4. `frontend/src/modules/Vendor/components/VendorProtectedRoute.jsx`:
   - Lines 42–51: Checks `requiredCapability === 'services'`. If `!providesServices`, renders `CapabilityAccessRequired`.
5. `frontend/src/modules/Vendor/utils/vendorCapabilities.js`:
   - Computes `isProductOnly`, `isServiceOnly`, `isHybrid`, and badge text (`APPROVED SELLER`, `SERVICE PARTNER`, `VERIFIED PARTNER`).
   - Filters sidebar menus (`PRODUCT_MENU_TITLES` vs. `SERVICE_MENU_TITLES`).
6. `frontend/src/modules/Vendor/pages/services/AvailableServices.jsx`:
   - Displays platform master services available for an approved service vendor to add to their offerings.
7. `frontend/src/modules/Vendor/components/ServiceConfigModal.jsx`:
   - Modal for configuring individual `VendorService` parameters (price, 6-digit pincodes, working schedule, capacity).
8. `frontend/src/modules/Admin/pages/vendors/VendorDetail.jsx`:
   - Lines 690–726: Displays read-only badges for vendor capabilities.

### Backend
1. `backend/src/models/Vendor.model.js`:
   - Lines 42–45: Contains raw boolean flags `vendorCapabilities: { sellsProducts, providesServices }`.
2. `backend/src/modules/vendor/controllers/auth.controller.js`:
   - Lines 370–397: `updateProfile` allows direct updates to `vendorCapabilities.providesServices`.
3. `backend/src/middlewares/authorize.js`:
   - Lines 42–51: Populates `req.vendorCapabilities` from `Vendor.model`.
   - Lines 82–111: `requireVendorCapability(capability)` middleware blocks access if capability flag is false.
4. `backend/src/modules/vendor/routes/vendor.routes.js`:
   - Lines 56–57: Configures `productCapAuth` and `serviceCapAuth`.
   - Lines 178–197: Protects service catalog, booking, and custom request endpoints with `serviceCapAuth`.
5. `backend/src/models/VendorService.model.js`:
   - Schema defining actual active service offerings: `vendorId`, `serviceId`, `price`, `serviceAreas`, `workingSchedule`, `dailyCapacity`, `isActive`.
6. `backend/src/modules/vendor/controllers/vendorService.controller.js`:
   - Manages individual `VendorService` CRUD and activation.
7. `backend/src/models/ServiceRequest.model.js`:
   - Existing model used when a vendor requests a brand-new service item in the platform master catalog. (NOT for vendor qualification).
8. `backend/src/modules/customer/controllers/customerService.controller.js`:
   - Lines 140 & 246: Checks `vendorCapabilities.providesServices !== false` before displaying services or accepting customer bookings.
9. `backend/src/services/notification.service.js`:
   - Multi-channel notification pipeline (MongoDB, Socket.IO, Firebase FCM) for users, vendors, and admins.

---

## 4. Existing Data Models

### 4.1 Vendor Model (`backend/src/models/Vendor.model.js`)
Currently holds:
```javascript
vendorCapabilities: {
    sellsProducts: { type: Boolean, default: true },
    providesServices: { type: Boolean, default: false }
}
```
*Missing:* No lifecycle status for service qualification, no application link, and no review timestamp or reviewer reference.

### 4.2 VendorService Model (`backend/src/models/VendorService.model.js`)
The authoritative source of truth for **what services an approved vendor offers**:
* `vendorId`: Ref `Vendor`
* `serviceId`: Ref `Service` (Master catalog)
* `isActive`: Boolean
* `price`: Number
* `serviceAreas`: Array of 6-digit postal pincodes
* `workingSchedule`: Mon-Sun time windows
* `dailyCapacity`: Max appointments per day
* *Architecture Rule:* We must **NOT** duplicate this schema into the application model.

### 4.3 ServiceRequest Model (`backend/src/models/ServiceRequest.model.js`)
Handles requests for new catalog services (e.g. "Industrial CO2 Flooding System Maintenance"). It is **not** an application for vendor capability.

---

## 5. Existing Capability Guards & API Endpoints

### 5.1 Route & Middleware Protection
* `requireVendorCapability('services')` checks:
  ```javascript
  if (caps.providesServices !== true) {
      return next(new ApiError(403, 'Service provider capability is required to perform this action.'));
  }
  ```
* Applied to:
  - `GET /api/vendor/services/available`
  - `GET /api/vendor/services`
  - `POST /api/vendor/services/:serviceId/enable`
  - `PUT /api/vendor/services/:id`
  - `GET /api/vendor/service-bookings`
  - `PATCH /api/vendor/service-bookings/:id/status`

### 5.2 Customer Marketplace Protection
* `GET /api/customer/services/:slug/providers`:
  Verifies provider's `vendorCapabilities.providesServices !== false`.
* `POST /api/customer/services/book`:
  Rejects booking if vendor is not authorized to provide services.

---

## 6. Risks & Mitigation Plan

| Risk | Impact | Forensic Mitigation |
| :--- | :--- | :--- |
| **Direct API Bypass** | An unapproved vendor sends `PUT /api/vendor/auth/profile` with `vendorCapabilities.providesServices: true` | Block self-enabling in `auth.controller.js`. Return `400/403` instructing the vendor to apply through the official application endpoint. |
| **Legacy Vendor Lockout** | Existing active service vendors (`providesServices: true`) in MongoDB suddenly get blocked | Run a safe migration script to set `serviceCapability.status = 'approved'` on all existing service vendors before enforcing the lifecycle check. |
| **Duplicate Service Configuration** | Re-creating fields like price, working schedule, and capacity in the application model | Separate qualification ("Is the vendor qualified?") from configuration ("What services do they offer?"). Keep `VendorService` as the single source of truth. |
| **Race Conditions in Approval** | Multiple admins approving/rejecting simultaneously or duplicate notifications | Use MongoDB atomic session / transactional updates with strict state pre-conditions (`status: { $in: ['pending', 'under_review'] }`). |
| **Product Capability Regression** | Disabling or breaking `sellsProducts` when modifying capabilities | `sellsProducts` logic is kept completely independent and untouched. |

---

## 7. Forensic Implementation Plan

### Phase 1: Database & Model Layer
1. Create `ServicePartnerApplication.model.js` with:
   - `vendorId`: Ref `Vendor` (indexed)
   - `status`: `'draft' | 'pending' | 'under_review' | 'approved' | 'rejected'`
   - `applicationData`: business description, experience years, requested categories, requested pincodes, certifications, additional info
   - `documents`: array of verification files
   - `reviewedBy`, `reviewedAt`, `rejectionReason`, `adminNotes`, `resubmittedAt`
   - Review history audit trail
2. Update `Vendor.model.js` to add:
   ```javascript
   serviceCapability: {
       status: { type: String, enum: ['none', 'pending', 'under_review', 'approved', 'rejected'], default: 'none', index: true },
       applicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'ServicePartnerApplication', default: null },
       appliedAt: { type: Date, default: null },
       reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
       reviewedAt: { type: Date, default: null },
       rejectionReason: { type: String, default: null }
   }
   ```
3. Run one-time migration for existing vendors:
   - If `vendorCapabilities.providesServices === true` -> set `serviceCapability.status = 'approved'`.
   - If `vendorCapabilities.providesServices === false` -> set `serviceCapability.status = 'none'`.

### Phase 2: Backend Security Hardening & New APIs
1. **Prevent Old Toggle:**
   In `auth.controller.js` (`updateProfile`), if `req.body.vendorCapabilities?.providesServices === true` is submitted by a vendor whose `serviceCapability.status !== 'approved'`, reject with `403 Forbidden: Service capability requires an approved Service Partner Application`.
2. **Vendor Application Controller & Routes:**
   - `POST /api/vendor/service-partner-applications`: Submit new application. Sets application status to `'pending'` and vendor `serviceCapability.status = 'pending'`.
   - `GET /api/vendor/service-partner-applications/current`: Get vendor's current application and status.
   - `PUT /api/vendor/service-partner-applications/resubmit`: Resubmit a rejected application with updated details.
3. **Admin Application Controller & Routes:**
   - `GET /api/admin/service-partner-applications`: List applications (with status/search filters and pagination).
   - `GET /api/admin/service-partner-applications/:id`: Application detail view.
   - `POST /api/admin/service-partner-applications/:id/approve`: Atomic approval. Updates application to `'approved'`, vendor `serviceCapability.status = 'approved'`, and `vendorCapabilities.providesServices = true`.
   - `POST /api/admin/service-partner-applications/:id/reject`: Atomic rejection. Requires `rejectionReason`. Updates application to `'rejected'` and vendor `serviceCapability.status = 'rejected'`.
4. **Notifications & Audit:**
   - Trigger vendor and admin notifications via `notification.service.js` upon submission, approval, and rejection.

### Phase 3: Frontend Vendor Experience
1. **Dashboard (`Dashboard.jsx`):**
   - Replace direct capability toggle.
   - Status `none`: Display *"Fire Safety Services: Not Enabled"* with `[Apply to Become Service Partner →]`.
   - Status `pending` / `under_review`: Display *"Fire Safety Services: Under Review"* with badge and `[View Application]`.
   - Status `rejected`: Display *"Fire Safety Services: Application Requires Changes"* with rejection reason and `[Update & Resubmit →]`.
   - Status `approved`: Display *"Fire Safety Services: Active"* with `[Manage Services →]`.
2. **Application Wizard / Page (`ServicePartnerApplication.jsx`):**
   - Step 1: Business profile & fire safety experience years.
   - Step 2: Requested service categories from master catalog.
   - Step 3: Target service area coverage (pincodes).
   - Step 4: Certifications & optional qualification documents.
   - Step 5: Review & declaration submission.
3. **Settings & Interceptors:**
   - Update `ProfileSettings.jsx` to disable unauthorized self-toggling.
   - Update `CapabilityAccessRequired.jsx` to route to application wizard.
   - Update `vendorCapabilities.js` badge logic to require `serviceCapability.status === 'approved'`.

### Phase 4: Frontend Admin Experience
1. Create `AdminServicePartnerApplications.jsx` under Admin Vendors navigation.
2. Provide list view, status filters (`All`, `Pending`, `Approved`, `Rejected`), and detail inspection modal/page.
3. Add modal for approval confirmation and rejection with mandatory reason text.

### Phase 5: Verification & Automated Tests
1. Create `backend/tests/integration/testServicePartnerApplication.mjs` covering all 50 required test scenarios.
2. Run full regression suite (`testServiceFlow.js`, `testNotification.js`, `testCancellationFinancialHardening.mjs`, `testRazorpayCancellationRefund.mjs`).
3. Run `npm --prefix frontend run build` to guarantee 0 build regressions.
