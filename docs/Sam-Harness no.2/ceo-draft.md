# Maw3ed Production Strategy: Multi-Purpose Booking & Ops SaaS

**Role:** Enterprise Architect, UpNexa / Maw3ed  
**Scope:** Production-ready architectural blueprint for a multi-vertical SaaS.

---

## 1. Product Truth & BookingType
Maw3ed is not a clinic system; it is an **Operational Resource Orchestrator**. The core logic is driven by the `BookingType` enum, which dictates how the system calculates availability and handles occupancy.

| BookingType | occupancy_mode | Logic | Examples |
| :--- | :--- | :--- | :--- |
| **APPOINTMENT** | `exclusive` | 1 Slot = 1 Client. Resource is locked entirely. | Medical, Hair Salon, Legal Consult |
| **RESOURCE_RENTAL** | `rental` | 1 Slot = 1 Client. Focus on duration/hourly billing. | Padel Court, Gaming Room, Studio |
| **BATCH_SCHEDULE** | `session_capacity` | 1 Slot = N Clients. Resource is available until capacity is hit. | Yoga Class, Workshop, School Lecture |

**Mapping Rule:** 
- If `exclusive` or `rental` $\rightarrow$ `Availability = TotalResources - BookedSlots`.
- If `session_capacity` $\rightarrow$ `Availability = (TotalResources * Capacity) - BookedSlots`.

---

## 2. Status Machines
To prevent illegal state transitions, the system implements strict Finite State Machines (FSM).

### A. Booking/Session Lifecycle
`PENDING` $\rightarrow$ `CONFIRMED` $\rightarrow$ `CHECKED_IN` $\rightarrow$ `COMPLETED` $\rightarrow$ `INVOICED`
- **Allowed Transitions:**
    - `PENDING` $\rightarrow$ `CONFIRMED` (Payment verified or Admin approval)
    - `CONFIRMED` $\rightarrow$ `CHECKED_IN` (QR Scan/Manual check-in)
    - `CHECKED_IN` $\rightarrow$ `COMPLETED` (Service delivery finished)
    - `COMPLETED` $\rightarrow$ `INVOICED` (Financial settlement)
    - `ANY` $\rightarrow$ `CANCELLED` (User/Admin action)

### B. Resource/Staff Status
`ACTIVE` $\leftrightarrow$ `SUSPENDED` $\leftrightarrow$ `OFFLINE`
- **Active:** Available for booking.
- **Suspended:** Exists in DB, but removed from availability calendars (e.g., disciplinary or admin hold).
- **Offline:** Temporary unavailability (e.g., break, maintenance).

### C. Attendance Status
`EXPECTED` $\rightarrow$ `PRESENT` $\rightarrow$ `NO_SHOW`
- Triggered during the `CHECKED_IN` phase of the Booking lifecycle.

---

## 3. End-to-End Lifecycle
The operational flow follows a linear value chain to ensure no "leaks" between booking and revenue.

1. **Configuration:** Admin defines **Service** $\rightarrow$ assigns **Staff/Resource** $\rightarrow$ sets **BookingType** (e.g., "Yoga Class" $\rightarrow$ "Studio A" $\rightarrow$ `BATCH_SCHEDULE`).
2. **Booking:** Client selects slot $\rightarrow$ System validates `occupancy_mode` $\rightarrow$ Record created as `PENDING`.
3. **Validation:** Payment/Confirmation $\rightarrow$ Status becomes `CONFIRMED` $\rightarrow$ **QR Code generated** and sent to client.
4. **Execution:** Client arrives $\rightarrow$ **QR Scan** $\rightarrow$ Status becomes `CHECKED_IN` $\rightarrow$ Attendance marked `PRESENT`.
5. **Settlement:** Session ends $\rightarrow$ Status `COMPLETED` $\rightarrow$ Trigger **Invoice Generation** $\rightarrow$ Status `INVOICED`.

---

## 4. N-Tier Sketch

### UI Layer (Frontend)
- **Client Portal:** Booking engine, QR Wallet, Payment gateway.
- **Admin Dashboard:** Resource management, Calendar view, Analytics.
- **Staff App:** Check-in scanner, Schedule management.

### API Layer (Gateway)
- **REST/GraphQL Endpoints:** Versioned APIs (`/v1/`).
- **Tenant Middleware:** Extracts `X-Tenant-ID` and validates subscription.
- **Auth Guard:** JWT validation and RBAC check.

### Business Layer (Core Logic)
- **Booking Engine:** Handles the `BookingType` logic and collision detection.
- **State Manager:** Enforces the Status Machine transitions.
- **Notification Service:** Triggers emails/SMS/Push based on state changes.

### Data Layer (Persistence)
- **PostgreSQL:** Relational data with `tenant_id` on every table.
- **Redis:** Caching for real-time availability slots.
- **S3/Blob:** Storage for resource images and digital invoices.

---

## 5. Security

### Tenant Isolation
- **Logical Separation:** Every table contains a `tenant_id`.
- **Query Enforcement:** The Base Repository automatically appends `WHERE tenant_id = current_tenant_id` to all queries. No "naked" queries allowed.

### Auth & RBAC
- **Identity:** JWT-based authentication.
- **Hierarchy:** `SuperAdmin` (UpNexa) $\rightarrow$ `TenantAdmin` (Business Owner) $\rightarrow$ `BranchManager` $\rightarrow$ `Staff`.
- **Permissions:** Granular permissions (e.g., `bookings:write`, `reports:read`).

### Token Lifecycle
- **Issue:** Short-lived Access Token (15m) + Long-lived Refresh Token (7d).
- **Expire:** Automatic expiration via JWT `exp` claim.
- **Revoke:** Blacklist store in Redis for immediate logout/security breach response.

### Audit & Protection
- **Audit Log:** Immutable table recording `(timestamp, user_id, action, entity_id, old_value, new_value)`.
- **Data Protection:** AES-256 encryption for sensitive PII; TLS 1.3 for all transit.

---

## 6. Delivery Phases (Handoff)

This strategy serves as the architectural anchor. Execution is divided into the following phases:

**Phase 1: The Foundation (P0)**
- Implementation of `tenant_id` isolation middleware.
- Deployment of the `BookingType` Enum and `occupancy_mode` logic.
- Setup of the Base Repository for automatic tenant filtering.

**Phase 2: The Operational Bridge (P1)**
- Implementation of the Status Machine (FSM) for Bookings.
- Development of the QR Generation and Check-in endpoint.
- Integration of the `Session` $\rightarrow$ `Attendance` $\rightarrow$ `Invoice` trigger.

**Phase 3: Scaling & UX (P2)**
- Multi-branch management logic.
- Advanced RBAC roles.
- Reporting dashboards based on the completed lifecycle data.

**Phase 4: Ecosystem Integration (P3)**
- External payment gateway hooks.
- Third-party notification providers (WhatsApp/SMS).
- Public API for enterprise clients.