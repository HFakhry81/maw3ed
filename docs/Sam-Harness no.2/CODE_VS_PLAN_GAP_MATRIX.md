# CODE_VS_PLAN_GAP_MATRIX.md

**Project:** Maw3ed  
**Analysis Date:** 2024-05-22  
**Scope:** Comparison between the "Resource Orchestrator" Production Blueprint and the current codebase located at `E:\UpNexa.com\maw3ed`.

## ⚠️ Executive Summary
The current codebase is a **foundational prototype** primarily focused on basic CRUD for appointments. It lacks the architectural "Product Truth" required for a multi-purpose SaaS. The most critical gaps are **Multi-Tenancy (P0)** and the **BookingType Logic (P0)**. The system currently operates as a single-tenant application with a fixed "appointment" mindset, failing to support `RESOURCE_RENTAL` or `BATCH_SCHEDULE` modes.

---

## 📊 Gap Matrix

| Requirement | Evidence in current code (path or "not found") | Gap | Severity | Ticket hint |
| :--- | :--- | :--- | :--- | :--- |
| **Multi-Tenant Isolation** | Not found | No `tenant_id` in tables; no middleware to isolate data by business owner. | **P0** | [M-1009] |
| **BookingType Triad** | Not found | Logic is hardcoded for 1:1 appointments. No `occupancy_mode` (exclusive/rental/capacity). | **P0** | [M-1010] |
| **FSM: Booking Lifecycle** | `src/services/booking.service.ts` (Partial) | Basic status exists, but no strict Finite State Machine to prevent illegal transitions (e.g., `PENDING` $\rightarrow$ `COMPLETED`). | **P1** | [M-1011] |
| **QR Code Generation** | Not found | No logic to generate unique session tokens or QR codes upon `CONFIRMED` status. | **P1** | [M-1012] |
| **QR Scanner / Check-in** | Not found | No endpoint or logic to handle `CHECKED_IN` transition via QR scan. | **P1** | [M-1013] |
| **Resource Capacity Logic** | Not found | No calculation for `(TotalResources * Capacity) - BookedSlots` for batch sessions. | **P0** | [M-1010] |
| **Staff/Branch Status** | `src/models/staff.model.ts` (Partial) | Basic active/inactive flags exist, but no `SUSPENDED` or `OFFLINE` state management. | **P2** | [M-1014] |
| **Financial Settlement** | Not found | No link between `COMPLETED` session $\rightarrow$ `INVOICED` status. | **P1** | [M-1015] |
| **Tenant Middleware** | Not found | No `X-Tenant-ID` header validation or `AsyncLocalStorage` for tenant context. | **P0** | [M-1009] |
| **Resource-Service Mapping** | `src/models/service.model.ts` | Basic mapping exists, but doesn't support multi-resource requirements for a single booking. | **P2** | [M-1016] |

---

## 🛠 Gap Analysis Detail

### 1. The Multi-Tenancy Void (P0)
The current code assumes a single global instance. In a SaaS model, a query like `SELECT * FROM Bookings` would leak data across all clients. 
- **Required:** Every table must have `tenant_id`.
- **Required:** A global interceptor to inject `WHERE tenant_id = current_tenant`.

### 2. The "Clinic-Only" Logic Trap (P0)
The code currently treats every booking as a "slot." It cannot handle:
- **Rental:** A Padel court booked for 2 hours (Duration-based).
- **Batch:** A Yoga class with 20 available spots (Capacity-based).
- **Current State:** Only supports "Appointment" (Exclusive).

### 3. The Lifecycle Break (P1)
The flow from **Booking $\rightarrow$ Attendance $\rightarrow$ Invoice** is broken. 
- There is no mechanism to prove a client actually arrived (QR/Check-in).
- There is no trigger to move a booking to "Invoiced" once the service is marked "Completed."

---

## 🚩 Critical Path for Next Sprint
To align the code with the Plan, the following sequence is mandatory:
1. **Infrastructure:** Implement `tenant_id` and Middleware $\rightarrow$ **[M-1009]**
2. **Core Logic:** Implement `BookingType` and `occupancy_mode` $\rightarrow$ **[M-1010]**
3. **Operational Flow:** Implement QR $\rightarrow$ Check-in $\rightarrow$ Invoice $\rightarrow$ **[M-1012, M-1013, M-1015]**