# IMPLEMENTATION_BACKLOG.md

**Project:** Maw3ed  
**Status:** Production Completion Phase  
**Focus:** Transition from "Booking Skeleton" to "Operations Platform"

---

## 🔴 P0: Critical Infrastructure & Core Logic
*These tickets must be completed to establish the "Product Truth" and security baseline. No other features should be built until these are merged.*

### [M-1009] Multi-Tenant Data Isolation
- **Why:** To prevent data leakage between different businesses (Tenants). Without this, the system is a single-tenant app and cannot be sold as a SaaS.
- **Files likely touched:** 
    - `E:\UpNexa.com\maw3ed\src\middleware\tenant.middleware.ts` (New)
    - `E:\UpNexa.com\maw3ed\src\database\schema.ts`
    - `E:\UpNexa.com\maw3ed\src\repositories\base.repository.ts`
- **Acceptance Criteria:**
    - Every table (except global config) has a `tenant_id`.
    - Middleware extracts `tenant_id` from request header/JWT.
    - All DB queries automatically append `WHERE tenant_id = current_tenant`.
- **Suggested First Patch:** Create a `TenantContext` provider and a global middleware that rejects requests missing a valid `X-Tenant-ID` header.

### [M-1010] Hierarchical RBAC (Tenant $\rightarrow$ Branch $\rightarrow$ Role)
- **Why:** To ensure a Branch Manager cannot access another branch's data, and a Staff member cannot change system settings.
- **Files likely touched:**
    - `E:\UpNexa.com\maw3ed\src\auth\roles.ts`
    - `E:\UpNexa.com\maw3ed\src\middleware\auth.middleware.ts`
    - `E:\UpNexa.com\maw3ed\src\database\schema.ts`
- **Acceptance Criteria:**
    - Implementation of roles: `SUPER_ADMIN`, `TENANT_ADMIN`, `BRANCH_MANAGER`, `STAFF`.
    - Access control decorators (e.g., `@RequireRole('BRANCH_MANAGER')`) on controllers.
    - Validation that user belongs to the `branch_id` they are attempting to modify.
- **Suggested First Patch:** Define the `Role` enum and update the `User` schema to include `role` and `branch_id`.

### [M-1001/1002] Multi-Purpose Framing & BookingType Triad
- **Why:** To move away from "clinic-only" logic. The system must support Exclusive (1:1), Rental (Resource), and Capacity (1:N) modes.
- **Files likely touched:**
    - `E:\UpNexa.com\maw3ed\src\bookings\booking.entity.ts`
    - `E:\UpNexa.com\maw3ed\src\bookings\booking.service.ts`
    - `E:\UpNexa.com\maw3ed\src\constants\booking-types.ts` (New)
- **Acceptance Criteria:**
    - `BookingType` enum implemented: `EXCLUSIVE`, `RENTAL`, `CAPACITY`.
    - Booking logic prevents over-booking based on type (e.g., `RENTAL` blocks the room; `CAPACITY` checks against `max_participants`).
    - `Purpose` field added to bookings to categorize the vertical (e.g., "Consultation", "Studio Hire").
- **Suggested First Patch:** Update `Booking` entity with `bookingType` and `purpose` fields; implement a basic validation check in `createBooking`.

### [M-1006] Session & Attendance Entity
- **Why:** A "Booking" is an intent; a "Session" is a reality. We need to track when a client actually arrived to trigger billing.
- **Files likely touched:**
    - `E:\UpNexa.com\maw3ed\src\sessions\session.entity.ts` (New)
    - `E:\UpNexa.com\maw3ed\src\sessions\session.service.ts` (New)
    - `E:\UpNexa.com\maw3ed\src\bookings\booking.service.ts`
- **Acceptance Criteria:**
    - `Session` entity created, linked to `BookingID`.
    - Ability to "Convert Booking to Session" upon check-in.
    - Tracking of `actual_start_time` and `actual_end_time`.
- **Suggested First Patch:** Create the `Session` database table and a service method `startSession(bookingId)`.

### [M-1003] Operational Status Machine
- **Why:** To prevent illegal state transitions (e.g., you cannot "Invoice" a booking that was "Cancelled").
- **Files likely touched:**
    - `E:\UpNexa.com\maw3ed\src\bookings\booking.status.ts` (New)
    - `E:\UpNexa.com\maw3ed\src\bookings\booking.service.ts`
- **Acceptance Criteria:**
    - Formal state machine: `PENDING` $\rightarrow$ `CONFIRMED` $\rightarrow$ `CHECKED_IN` $\rightarrow$ `COMPLETED` $\rightarrow$ `INVOICED`.
    - Logic to block invalid transitions.
    - Automatic status update to `COMPLETED` when a `Session` ends.
- **Suggested First Patch:** Implement a `transitionStatus(bookingId, newStatus)` method with a switch-case validation map.

---

## 🟡 P1: Operational Bridge & Revenue
*These tickets enable the business to make money and manage staff.*

### [M-1005] QR Generation & Check-in Endpoint
- **Why:** To automate the transition from `Booking` $\rightarrow$ `Session`.
- **Files likely touched:**
    - `E:\UpNexa.com\maw3ed\src\bookings\qr.service.ts` (New)
    - `E:\UpNexa.com\maw3ed\src\bookings\booking.controller.ts`
- **Acceptance Criteria:**
    - Endpoint to generate a unique signed token/