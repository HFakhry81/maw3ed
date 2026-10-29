# Maw3ed Technical Production Document: Resource Orchestrator

**Version:** 1.0  
**Status:** Approved Strategy / Production Blueprint  
**Role:** Enterprise Architect  
**Core Philosophy:** Maw3ed is an **Operational Resource Orchestrator**, not a vertical-specific tool.

---

## 1. System Architecture (N-Tier)

### Tier 1: UI Layer (Frontend)
*   **Client Portal (Web/Mobile):** 
    *   Dynamic Booking Engine (UI adapts based on `BookingType`).
    *   Digital QR Wallet for check-ins.
    *   Payment Gateway Integration.
*   **Admin Dashboard (Web):** 
    *   Resource/Staff Management.
    *   Multi-tenant Calendar View (Drag-and-drop).
    *   Financial Analytics & Revenue Tracking.
*   **Staff App (Mobile/Tablet):** 
    *   High-speed QR Scanner for check-ins.
    *   Daily Schedule/Agenda view.

### Tier 2: API Layer (Gateway)
*   **Protocol:** REST/GraphQL (`/v1/`).
*   **Tenant Middleware:** Mandatory `X-Tenant-ID` header extraction. Validates tenant subscription status before routing.
*   **Auth Guard:** JWT validation with RBAC (Role-Based Access Control).
*   **Rate Limiting:** Per-tenant throttling to prevent noisy-neighbor syndrome.

### Tier 3: Business Layer (Core Logic)
*   **Booking Engine:** The "Brain." Implements `occupancy_mode` logic to calculate real-time availability.
*   **State Manager:** The FSM (Finite State Machine) controller that prevents illegal status transitions.
*   **Notification Service:** Event-driven triggers (Webhooks/SMS/Email) based on state changes (e.g., `CONFIRMED` $\rightarrow$ Send QR).

### Tier 4: Data Layer (Persistence)
*   **PostgreSQL:** Primary relational store. Every table implements `tenant_id` for logical isolation.
*   **Redis:** Distributed cache for "Hot Slots" (real-time availability) to prevent DB bottlenecks during high-traffic booking windows.
*   **S3/Blob Storage:** Storage for resource assets and generated PDF invoices.

---

## 2. The "Product Truth": Booking Logic

Availability is calculated based on the `BookingType` assigned to the service.

| BookingType | Occupancy Mode | Availability Logic | Example |
| :--- | :--- | :--- | :--- |
| **APPOINTMENT** | `exclusive` | $1 \text{ Slot} = 1 \text{ Client}$. Resource is locked. | Medical, Salon |
| **RESOURCE_RENTAL** | `rental` | $1 \text{ Slot} = 1 \text{ Client}$. Duration-based billing. | Padel Court, Studio |
| **BATCH_SCHEDULE** | `session_capacity` | $1 \text{ Slot} = N \text{ Clients}$. Available until capacity hit. | Yoga, Workshop |

**Calculation Formula:**
- **Exclusive/Rental:** $\text{Availability} = \text{Total Resources} - \text{Booked Slots}$
- **Session Capacity:** $\text{Availability} = (\text{Total Resources} \times \text{Capacity}) - \text{Booked Slots}$

---

## 3. Status Machines (FSM)

### A. Booking & Session Lifecycle
Strict linear progression to ensure financial integrity.

`PENDING` $\xrightarrow{\text{Payment/Admin}}$ `CONFIRMED` $\xrightarrow{\text{QR Scan}}$ `CHECKED_IN` $\xrightarrow{\text{Service End}}$ `COMPLETED` $\xrightarrow{\text{Billing}}$ `INVOICED`

*   **Illegal Transition Example:** `PENDING` $\rightarrow$ `COMPLETED` (Forbidden).
*   **Global Transition:** `ANY` $\rightarrow$ `CANCELLED`.

### B. Resource/Staff Status
`ACTIVE` $\leftrightarrow$ `SUSPENDED` $\leftrightarrow$ `OFFLINE`
*   **Active:** Visible in calendar.
*   **Suspended:** Hidden from calendar (Admin hold).
*   **Offline:** Temporary unavailability (Break/Maintenance).

### C. Attendance Status
`EXPECTED` $\rightarrow$ `PRESENT` $\rightarrow$ `NO_SHOW`
*   Triggered automatically during the `CHECKED_IN` phase.

---

## 4. End-to-End Lifecycle: QR $\rightarrow$ Session $\rightarrow$ Invoice

1.  **Configuration:** Admin creates **Service** $\rightarrow$ Links **Resource** $\rightarrow$ Sets **BookingType**.
2.  **Booking:** Client books slot $\rightarrow$ System checks `occupancy_mode` $\rightarrow$ Status: `PENDING`.
3.  **Validation:** Payment confirmed $\rightarrow$ Status: `CONFIRMED` $\rightarrow$ **System generates unique QR Code**.
4.  **Execution:** Client presents QR $\rightarrow$ Staff scans $\rightarrow$ Status: `CHECKED_IN` $\rightarrow$ Attendance: `PRESENT`.
5.  **Settlement:** Service ends $\rightarrow$ Status: `COMPLETED` $\rightarrow$ **Trigger Invoice Generation** $\rightarrow$ Status: `INVOICED`.

---

## 5. Security & Isolation

### Tenant Isolation (The Golden Rule)
*   **Logical Separation:** `tenant_id` column on every table.
*   **Query Enforcement:** Base Repository pattern. All queries are wrapped: 
    `SELECT * FROM bookings WHERE tenant_id = :current_tenant_id AND id = :id`.
*   **No Naked Queries:** Direct DB access without `tenant_id` is a critical security failure.

### Auth & RBAC
*   **Hierarchy:** `SuperAdmin` (UpNexa) $\rightarrow$ `TenantAdmin` (Owner) $\rightarrow$ `BranchManager` $\rightarrow$ `Staff`.
*   **Token Strategy:** Short-lived Access Token (15m) + Long-lived Refresh Token (7d).
*   **Revocation:** Redis-based blacklist for immediate session termination.

### Audit Trail
*   **Immutable Log:** Every state change is recorded: `(timestamp, user_id, action, entity_id, old_val, new_val)`.

---

## 6. Implementation Checklist (For Later Execution)

### Phase 1: Foundation (P0)
- [ ] Implement `