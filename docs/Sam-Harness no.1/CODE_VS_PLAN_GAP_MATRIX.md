```markdown
# CODE_VS_PLAN_GAP_MATRIX.md

**Project:** Maw3ed  
**Analysis Date:** 2024-05-22  
**Reference Plan:** `PRODUCTION_COMPLETION_PLAN.md` & `OPERATIONAL_FLOWS_AND_STATUS_MACHINES.md`  
**Scope:** Comparison of current codebase reality against the multi-purpose booking and operational requirements.

---

## Executive Summary
The current codebase exhibits a significant "Framing Gap." While basic booking structures may exist, the **BookingType Triad** (Appointment, Resource Rental, Batch Schedule) and the associated **Occupancy Modes** are not yet structurally implemented. The system currently lacks the operational bridge between a "Booking" and a "Session/Attendance" event, which is critical for the QR-to-Invoice lifecycle.

---

## Gap Analysis Matrix

| Requirement | Evidence in current code (path or "not found") | Gap | Severity | Ticket hint |
| :--- | :--- | :--- | :---: | :--- |
| **Multi-Purpose Framing** | Not found | Code is either generic or clinic-leaning; no explicit `Purpose` or `Vertical` configuration. | P0 | `M-1001` |
| **BookingType Triad** | Not found | Missing `BookingType` ENUM and logic for `exclusive` vs `rental` vs `session_capacity`. | P0 | `M-1002` |
| **Status Machines** | Not found | No formal state machine implementation for the lifecycle (Pending $\rightarrow$ Checked-in $\rightarrow$ Invoiced). | P0 | `M-1003` |
| **Templates** | Not found | No system for dynamic service/event templates to support different business types. | P2 | `M-1004` |
| **QR / Check-in** | Not found | No QR generation logic or check-in validation endpoint. | P1 | `M-1005` |
| **Sessions & Attendance** | Not found | No `Session` entity to bridge the gap between a scheduled booking and actual attendance. | P0 | `M-1006` |
| **Invoicing System** | Not found | No logic to trigger invoice generation upon session completion. | P1 | `M-1007` |
| **Staff-Branch Status** | Not found | No `ACTIVE` / `SUSPENDED` flag logic for staff-to-branch mapping. | P1 | `M-1008` |
| **Tenant Isolation** | Not found | No evidence of `tenant_id` partitioning in queries or middleware. | P0 | `M-1009` |
| **RBAC** | Not found | No Role-Based Access Control implementation (Tenant $\rightarrow$ Branch $\rightarrow$ Role). | P0 | `M-1010` |
| **Stripe/WhatsApp** | Not found | **Correctly absent.** No unproven integrations found. | N/A | `M-1011` |

---

## Critical Path Findings

### 1. The "Booking $\neq$ Session" Void
The plan requires a transition from `Booking` $\rightarrow$ `QR Check-in` $\rightarrow$ `Session` $\rightarrow$ `Invoice`. The current code lacks the `Session` entity entirely. Without this, the system cannot track actual attendance or trigger billing based on real-world usage.

### 2. Occupancy Logic Absence
There is no logic to handle:
- **Exclusive:** Blocking a staff member for a specific time.
- **Rental:** Blocking a physical resource (e.g., a room).
- **Capacity:** Allowing $N$ clients for one staff member.
This is the core "Product Truth" of Maw3ed and is currently a total gap.

### 3. Security & Isolation
The requirement for **Tenant Isolation** is a P0. Currently, there is no evidence of a multi-tenant architecture in the data layer, meaning the system cannot safely host multiple independent businesses.

---

## Conclusion
The current state of the code is a **skeleton** that does not yet reflect the **Operational Flows**. The transition from a "Booking App" to an "Operations Platform" requires the implementation of the P0 items listed above before any UI polishing or secondary feature development.
```