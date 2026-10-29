# Maw3ed Production Completion Technical Document
**Document Version:** 1.0 (Production Readiness Framework)
**Project Code:** `M-1000` Series
**Architecture Pattern:** N-Tier / Multi-Tenant / Multi-Purpose

---

## 1. High-Level Architecture (N-Tier)

Maw3ed is designed as a multi-purpose booking and operations platform. It avoids "clinic-only" framing to support medical, beauty, sports, and educational verticals.

### UI Layer (Frontend)
- **Client Portal:** Booking interface, QR code display, Invoice viewing.
- **Admin Dashboard:** Resource management, Staff-Branch mapping, Capacity planning.
- **Staff App:** Check-in scanner, Attendance marking, Schedule view.

### API Controller Layer (REST)
- **BookingController:** Handles the `BookingType` triad logic.
- **CheckinController:** Manages QR validation and session initiation.
- **InvoiceController:** Triggers billing based on session completion.
- **TenantController:** Handles context switching and isolation.

### Business Logic Layer (Service)
- **BookingService:** Orchestrates occupancy modes (exclusive vs. rental vs. capacity).
- **AttendanceService:** Bridges the gap between a "Booking" and a "Session."
- **BillingService:** Calculates final costs based on resource usage and templates.
- **RBACService:** Validates permissions across Tenant $\rightarrow$ Branch $\rightarrow$ Role.

### Data Layer (Persistence)
- **Database:** PostgreSQL/MySQL with Tenant ID partitioning.
- **Cache:** Redis for session-based QR validation.
- **Storage:** S3/Local for invoice PDFs and staff documentation.

---

## 2. Data Schema & Booking Triad

The core of Maw3ed is the `BookingType` which dictates the `occupancy_mode`.

| BookingType | Occupancy Mode | Logic | Example |
| :--- | :--- | :--- | :--- |
| **APPOINTMENT** | `exclusive` | 1 Staff : 1 Client | Medical, Salon |
| **RESOURCE_RENTAL** | `rental` | 1 Resource : 1 Client | Billiards, Gaming Pod |
| **BATCH_SCHEDULE** | `session_capacity` | 1 Staff : N Clients | Yoga Class, School |

### Key Entities
- **Tenant:** `tenant_id (PK)`, `domain`, `config_json`.
- **Branch:** `branch_id (PK)`, `tenant_id (FK)`, `status (ACTIVE/SUSPENDED)`.
- **Staff:** `staff_id (PK)`, `branch_id (FK)`, `status (ACTIVE/SUSPENDED)`.
- **Booking:** `booking_id (PK)`, `type (ENUM)`, `status (ENUM)`, `resource_id`, `client_id`.
- **Session:** `session_id (PK)`, `booking_id (FK)`, `checkin_time`, `checkout_time`.
- **Invoice:** `invoice_id (PK)`, `session_id (FK)`, `amount`, `payment_status`.

---

## 3. Status Machines

### A. APPOINTMENT / RESOURCE_RENTAL
`PENDING` $\rightarrow$ `CONFIRMED` $\rightarrow$ `CHECKED_IN` $\rightarrow$ `COMPLETED` $\rightarrow$ `INVOICED` $\rightarrow$ `PAID`
*(Cancellation can occur at any stage before CHECKED_IN)*

### B. BATCH_SCHEDULE
`SCHEDULED` $\rightarrow$ `OPEN_FOR_REGISTRATION` $\rightarrow$ `FULL` $\rightarrow$ `IN_PROGRESS` $\rightarrow$ `CLOSED` $\rightarrow$ `INVOICED`

### C. STAFF-BRANCH STATUS
`ACTIVE` $\leftrightarrow$ `SUSPENDED`
*(Suspension triggers an immediate block on new bookings for that staff member across all linked branches).*

---

## 4. The Lifecycle: QR $\rightarrow$ Session $\rightarrow$ Invoice

This is the critical operational path for production completion.

1. **QR Generation:** Upon `CONFIRMED` booking, a unique signed JWT/Hash is generated.
2. **Check-in (The Trigger):** 
   - Staff scans QR $\rightarrow$ `QRCheckin.java` validates Tenant/Branch context.
   - System converts `Booking` $\rightarrow$ `Session`.
   - Status updates to `CHECKED_IN`.
3. **Attendance Tracking:** 
   - `SessionAttendance.java` logs the actual start/end time.
   - For `BATCH_SCHEDULE`, multiple QR scans link to one `SessionID`.
4. **Invoice Generation:**
   - Upon `Session` closure $\rightarrow$ `InvoiceManager.java` fetches the price template.
   - Calculates: `(Base Price * Duration) + Add-ons`.
   - Generates PDF $\rightarrow$ Marks Booking as `INVOICED`.

---

## 5. Security & Isolation

- **Tenant Isolation:** Every query must include `WHERE tenant_id = ?`. Implemented via Hibernate Filters or Interceptors in `TenantIsolation.java`.
- **RBAC:** Roles (SuperAdmin, BranchManager, Staff, Client) enforced via `@PreAuthorize` or custom security interceptors in `RoleBasedAccessControl.java`.
- **QR Integrity:** QR codes must be time-bound and cryptographically signed to prevent spoofing.

---

## 6. Gap Analysis: Plan vs. Current State

| Feature | Plan Requirement | Typical Current State (Maw3ed) | Gap Status |
| :--- | :--- | :--- | :--- |
| **Booking Triad** | 3 distinct occupancy modes | Often defaults to 1:1 (Clinic style) | 🔴 High Gap |
| **OpsStore** | Centralized resource config | Fragmented in templates | 🟡 Partial |
| **Capacity** | Dynamic batch limits | Static slots | 🟡 Partial |
| **Migrations** | Tenant-aware schema updates | Manual/Global scripts | 🔴 High Gap |
| **Lifecycle** | QR $\rightarrow$ Session $\rightarrow$ Invoice | Booking $\rightarrow$ Invoice (skips session) | 🔴 High Gap |

---

## 7. Implementation Checklist (For Later Execution)

### Phase 1: Core Framework (P0)
- [ ] Implement `BookingType` Enum and `occupancy_mode` logic.
- [ ] Setup `TenantIsolation` interceptor for all DB queries