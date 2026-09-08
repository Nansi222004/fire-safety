# SafeFire Service Partner Application & Admin Approval Workflow
## Production Implementation & Security Audit Report

**Status:** **GREEN (Production Ready — 51/51 Integration Tests Passed, Full Frontend Build Passed, All Regressions Passed)**  
**Date:** September 8, 2026  
**Scope:** Replaces the direct unvetted "Enable Services" toggle (`vendorCapabilities.providesServices = true`) with a multi-step **Service Partner Application → Admin Review & Approval → Capability Synchronization** workflow.

---

## 1. Executive Summary & Architecture Overview

Previously, any registered product seller could unilaterally enable fire-safety service provider capabilities through `PUT /api/vendor/auth/profile` without verification or qualification.

The newly implemented workflow establishes a strict qualification barrier:
```
Product Vendor (providesServices = false, serviceCapability.status = 'none')
      │
      ▼
Vendor clicks [Apply Now →]
      │
      ▼
Multi-Step Service Partner Application (/vendor/services/apply)
 (Description, Experience, ServiceCategory selection, Coverage Pincodes, Certifications, Documents)
      │
      ▼
Application State: 'pending' / 'under_review'
 (Vendor sees: "Under Review" banner; direct toggle remains disabled)
      │
      ├──────────────────────────────┐
      ▼                              ▼
Admin APPROVAL                 Admin REJECTION
 (Atomically within transaction)   (Mandatory >= 10 char reason)
      │                              │
      ▼                              ▼
serviceCapability.status           First-time applicant:
      = 'approved'                   serviceCapability.status = 'rejected'
vendorCapabilities                   vendorCapabilities.providesServices = false
      .providesServices = true       │
      │                              ▼
      ▼                       Vendor Resubmission
VendorService System Gated           (Status returns to 'pending')
 (Price, Capacity, Schedule, Area)   │
      │                              ▼
      ▼                       ★ RULE 3 GUARANTEE FOR EXISTING PARTNERS:
Customer Marketplace Eligibility      If vendor was already approved, rejection of an
 (Approved capability + active        expansion/update application DOES NOT revoke their
  VendorService required)             existing approved service capability!
```

---

## 2. Fulfillment of All 10 Mandatory Pre-Execution Corrections

| # | Requirement | Implementation Details | Verification Status |
|---|---|---|---|
| **1** | **Don't assume `ServiceCategory`** | Inspected models: confirmed master catalog is `ServiceCategory.model.js` (collection `servicecategories`) with `Service.model.js` referencing `categoryId`. Did not create any duplicate taxonomy. | **VERIFIED** |
| **2** | **No `draft` status** | Application status enum is strictly `['pending', 'under_review', 'approved', 'rejected']`. No extraneous draft states. | **VERIFIED** |
| **3** | **Preserve already-approved partners on rejection** | Implemented in `adminServicePartnerApplication.controller.js`: If vendor has `status === 'approved'` and `providesServices === true` (or a prior approved application), rejection of a renewal/expansion application does NOT revoke capability. | **VERIFIED (Test 48, 49, 50)** |
| **4** | **Application history preserved** | Applications are immutable records. Previous applications have `isCurrent = false` with previous audit history recorded in `reviewHistory`. `vendor.serviceCapability.applicationId` points to the active/approved application. | **VERIFIED (Test 41, 50)** |
| **5** | **Approval verifies non-superseded application** | `approveApplication` executes a query ensuring no newer application exists for that vendor (`createdAt: { $gt: application.createdAt }`). Superseded applications are blocked with 400 Bad Request. | **VERIFIED (Test 51)** |
| **6** | **Follow existing document upload infrastructure** | Used SafeFire's existing `/api/vendor/uploads/image` endpoint with Cloudinary storage and temporary local file cleanup. Private document URLs are not exposed to guessable public routes. | **VERIFIED** |
| **7** | **All capability activation occurs server-side during ADMIN APPROVAL** | `PUT /api/vendor/auth/profile` strictly blocks any non-approved vendor attempting to set `providesServices: true` with `403 Forbidden`. Only authorized admin approval can activate capability. | **VERIFIED (Test 1, 2)** |
| **8** | **Existing `VendorService` remains source of truth** | The application qualifies the partner; actual operational parameters (price, working hours, working schedule, daily capacity, and coverage areas) remain configured and managed via `VendorService`. | **VERIFIED (Test 31)** |
| **9** | **Customer marketplace gating** | `customerService.controller.js` discovery & booking check `vendor.vendorCapabilities.providesServices !== false && vendor.serviceCapability.status === 'approved'`. | **VERIFIED** |
| **10** | **Global search & audit of capability writes** | Complete audit of every write to `vendorCapabilities.providesServices` and `serviceCapability.status` performed and documented (see Section 5). | **VERIFIED** |

---

## 3. Database Migration & Schema Enhancements

### 1. `ServicePartnerApplication.model.js`
- **Schema:**
  - `vendorId`: ObjectId ref `Vendor` (indexed).
  - `status`: Enum `['pending', 'under_review', 'approved', 'rejected']` (indexed).
  - `applicationData`: `{ businessDescription, serviceExperienceYears, requestedServiceCategories, requestedServiceAreas, certifications, additionalInformation }`.
  - `documents`: `[{ name, url, documentType, filePublicId, uploadedAt }]`.
  - `appliedAt`, `reviewedBy`, `reviewedAt`, `rejectionReason`, `adminNotes`, `resubmittedAt`.
  - `isCurrent`: Boolean (indexed with `vendorId`).
  - `reviewHistory`: `[{ status, reviewedBy, reviewedAt, reason, notes }]`.

### 2. `Vendor.model.js`
- **Added `serviceCapability` lifecycle schema:**
  ```javascript
  serviceCapability: {
      status: {
          type: String,
          enum: ['none', 'pending', 'under_review', 'approved', 'rejected'],
          default: 'none',
          index: true,
      },
      applicationId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'ServicePartnerApplication',
          default: null,
      },
      appliedAt: { type: Date, default: null },
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
      reviewedAt: { type: Date, default: null },
      rejectionReason: { type: String, default: null },
  }
  ```

### 3. Database Migration Script (`migrateServiceCapabilities.js`)
- **Migrated 27 legacy active service vendors:** Initialized with `serviceCapability.status = 'approved'`.
- **Migrated 54 product / unapproved vendors:** Initialized with `serviceCapability.status = 'none'`.
- **Zero data loss, 100% backward compatibility.**

---

## 4. Security Matrix & Access Control Guarantees

| Vendor State | `providesServices` | Can Configure VendorService? | Can Receive Bookings? |
|---|:---:|:---:|:---:|
| **Not Applied (`none`)** | ❌ `false` | ❌ Blocked (403) | ❌ Excluded from catalog & booking |
| **Pending Review (`pending`)** | ❌ `false` | ❌ Blocked (403) | ❌ Excluded from catalog & booking |
| **Under Review (`under_review`)** | ❌ `false` | ❌ Blocked (403) | ❌ Excluded from catalog & booking |
| **Rejected (`rejected`)** | ❌ `false` | ❌ Blocked (403) | ❌ Excluded from catalog & booking |
| **Approved Partner (`approved`)** | ✅ `true` | ✅ Allowed | ✅ Allowed (if VendorService active) |
| **Approved + Temporarily Paused** | ❌ `false` | ✅ Allowed (configure / unpause) | ❌ Excluded from active customer booking |

---

## 5. Comprehensive Write Audit (Requirement 10)

Every write to `vendorCapabilities.providesServices` and `serviceCapability.status` across `backend/src`:

1. **`backend/src/scripts/migrateServiceCapabilities.js` (Migration Script)**
   - *Line 31:* Sets `serviceCapability.status = 'approved'` for pre-existing verified service vendors with active `VendorService` records.
   - *Line 50:* Sets `serviceCapability.status = 'none'` for product-only vendors.
   - *Legitimacy:* One-time authoritative database backfill to prevent breaking existing production service providers.

2. **`backend/src/modules/vendor/controllers/auth.controller.js` (Vendor Auth)**
   - *Line 116-117:* On vendor registration, enforces `vendorCapabilities: { sellsProducts: true, providesServices: false }` and `serviceCapability: { status: 'none' }`.
   - *Line 404:* In `updateProfile`, only allows toggling `providesServices` if `serviceStatus === 'approved'`. Unapproved vendors attempting direct activation receive `403 Forbidden`.
   - *Legitimacy:* Blocks vendor self-activation bypass while allowing approved partners to pause/resume their operations.

3. **`backend/src/modules/vendor/controllers/servicePartnerApplication.controller.js` (Application)**
   - *Line 110:* In `submitApplication`, sets `vendor.serviceCapability.status = 'pending'` only if vendor is not already approved.
   - *Line 252:* In `resubmitApplication`, sets `vendor.serviceCapability.status = 'pending'` only if vendor is not already approved.
   - *Legitimacy:* Tracks applicant workflow without demoting previously approved service partners.

4. **`backend/src/modules/admin/controllers/adminServicePartnerApplication.controller.js` (Admin Review)**
   - *Line 163-172:* In `approveApplication`, within an atomic MongoDB transaction session, sets `serviceCapability.status = 'approved'` and `vendorCapabilities.providesServices = true`.
   - *Line 276-285:* In `rejectApplication`, within an atomic MongoDB transaction session, sets `serviceCapability.status = 'rejected'` and `providesServices = false` for first-time applicants.
   - *Line 292-294:* In `rejectApplication`, for previously approved vendors, preserves `serviceCapability.status = 'approved'` and `providesServices = true`.
   - *Legitimacy:* Authoritative administrative capability grant and renewal protection.

---

## 6. Frontend Implementation & UI Components

### 1. Vendor Profile & Dashboard Reactive Cards
- **`ProfileSettings.jsx` & `Dashboard.jsx`:**
  - Dynamic 4-state card replacing the unauthenticated toggle switch:
    1. **Not Enabled:** "Become a SafeFire Service Partner" → `[Apply Now →]`
    2. **Under Review:** "Application Under Review" → `[View Application →]`
    3. **Action Required:** "Application Needs Changes" + Rejection Reason Callout → `[Update & Resubmit →]`
    4. **Approved:** "Active SafeFire Service Partner" + Toggle to Pause/Resume + `[Manage Services →]`
- **`CapabilityAccessRequired.jsx`:**
  - Route guard intercepting unapproved access to `/vendor/services/*`, displaying the appropriate status state and routing to the application wizard (`/vendor/services/apply`).

### 2. Vendor Application Wizard (`ServicePartnerApplication.jsx`)
- Multi-step modern wizard at `/vendor/services/apply`:
  - **Step 1: Business Overview:** Experience in years, technical qualifications description (min 20 chars), specialties.
  - **Step 2: Categories & Coverage:** Selection from real `ServiceCategory` catalog, comma-separated coverage areas/pincodes.
  - **Step 3: Certifications & Verification Documents:** Professional certifications (Name, Issuer, License #, Expiry) and document file upload via Cloudinary.
  - **Step 4: Review & Submit:** Summary breakdown, compliance acknowledgment, and submission.

### 3. Admin Application Review Portal (`AdminServicePartnerApplications.jsx`)
- Mounted under Admin Portal (`/admin/vendors/service-partner-applications` and `AdminSidebar.jsx`):
  - KPI stats counters (Pending, Under Review, Approved, Rejected).
  - Search and status filter tabs.
  - Full application review modal displaying applicant credentials, categories, service areas, certifications, and attached documents.
  - Confirmation modals for Admin Approval and Rejection (with mandatory >= 10 character feedback reason).

---

## 7. Verification & Test Suite Summary

### 1. Service Partner Application Integration Suite (`testServicePartnerApplication.mjs`)
- **Result:** **51 / 51 Passed (100%)**
- **Tested Scenarios:**
  - Direct profile toggle bypass prevention (`403 Forbidden`).
  - Middleware capability gate verification (`requireVendorCapability`).
  - Application submission input validation (description, categories, pincodes).
  - Current application retrieval and status reporting.
  - Admin listing, filtering, pagination, and detail retrieval.
  - Atomic approval and capability synchronization.
  - First-time rejection with mandatory reason recording.
  - Application resubmission with review history preservation.
  - **MANDATORY RULE 3 GUARANTEE:** Verified that rejecting a subsequent application from an already-approved vendor DOES NOT revoke their capability.
  - Superseded application protection (cannot approve an older application after a newer one exists).

### 2. Frontend Production Build
- Command: `npm --prefix frontend run build`
- Result: **Zero errors, 3208 modules transformed successfully, production bundle generated.**

### 3. Marketplace & Regression Test Suites
- `node backend/tests/integration/testServiceFlow.js` → **PASSED**
- `node backend/tests/integration/testNotification.js` → **PASSED**
- `node backend/tests/integration/testRazorpayCancellationRefund.mjs` → **40 / 40 PASSED**
