# Production Strategy: Maw3ed Operational Resource Orchestrator

**Role:** Agency Strategist  
**Status:** Production Blueprint  
**Alignment:** `PRODUCT_AND_PLATFORM_SPEC.md`, `OPERATIONAL_FLOWS_AND_STATUS_MACHINES.md`, `PRODUCTION_COMPLETION_PLAN.md`

---

## ## BookingType triad (APPOINTMENT/RESOURCE_RENTAL/BATCH_SCHEDULE)
Maw3ed operates as a resource orchestrator where availability is a function of the `BookingType` (cite: `ceo-draft.md`).

| Type | Occupancy Mode | Availability Logic | Use Case |
| :--- | :--- | :--- | :--- |
| **APPOINTMENT** | `exclusive` | $1 \text{ Slot} = 1 \text{ Client}$. Resource locked. | Medical, Legal, Salon |
| **RESOURCE_RENTAL** | `rental` | $1 \text{ Slot} = 1 \text{ Client}$. Duration-based billing. | Padel Court, Studio |
| **BATCH_SCHEDULE** | `session_capacity` | $1 \text{ Slot} = N \text{ Clients}$. Available until capacity hit. | Yoga, Workshops |

**Calculation Engine:**
- For `exclusive` or `rental`: $\text{Availability} = \text{TotalResources} - \text{BookedSlots}$.
- For `session_capacity`: $\text{Availability} = (\text{TotalResources} \times \text{Capacity}) - \text{BookedSlots}$.

---

## ## Status machines + transitions
Strict Finite State Machines (FSM) prevent illegal state jumps (cite: `OPERATIONAL_FLOWS_AND_STATUS_MACHINES.md`).

### 1. Booking/Session Lifecycle
`PENDING` $\rightarrow$ `CONFIRMED` $\rightarrow$ `CHECKED_IN` $\rightarrow$ `COMPLETED` $\rightarrow$ `INVOICED`
- **PENDING $\rightarrow$ CONFIRMED**: Triggered by payment verification or Admin manual override.
- **CONFIRMED $\rightarrow$ CHECKED_IN**: Triggered by QR scan or manual check-in (cite: `GO_NO_GO_CHECKLIST.md`).
- **CHECKED_IN $\rightarrow$ COMPLETED**: Triggered by session end-time or staff sign-off.
- **COMPLETED $\rightarrow$ INVOICED**: Triggered by financial settlement.
- **ANY $\rightarrow$ CANCELLED**: Terminal state for user/admin cancellations.

### 2. Resource/Staff Status
`ACTIVE` $\leftrightarrow$ `SUSPENDED` $\leftrightarrow$ `OFFLINE`
- **Active**: Visible in public booking portals.
- **Suspended**: Hidden from calendars; exists for historical reporting.
- **Offline**: Temporary unavailability (breaks/maintenance).

### 3. Attendance Status
`EXPECTED` $\rightarrow$ `PRESENT` $\rightarrow$ `NO_SHOW`
- Linked to the `CHECKED_IN` phase. If session starts and status is still `EXPECTED`, transition to `NO_SHOW`.

---

## ## Lifecycle service $\rightarrow$ book $\rightarrow$ QR $\rightarrow$ session $\rightarrow$ invoice
The operational value chain ensures zero leakage from booking to revenue (cite: `PRODUCT_AND_PLATFORM_SPEC.md`).

1. **Configuration**: Admin defines **Service** $\rightarrow$ assigns **Staff/Resource** $\rightarrow$ sets **BookingType**.
2. **Booking**: Client selects slot $\rightarrow$ System validates `occupancy_mode` $\rightarrow$ Record created as `PENDING`.
3. **Validation**: Payment/Confirmation $\rightarrow$ Status becomes `CONFIRMED` $\rightarrow$ **QR Code generated** (cite: `INCOMPLETE_LOGIC.md` for pending QR fixes).
4. **Execution**: Client arrives $\rightarrow$ **QR Scan** $\rightarrow$ Status becomes `CHECKED_IN` $\rightarrow$ Attendance marked `PRESENT`.
5. **Settlement**: Session ends $\rightarrow$ Status `COMPLETED` $\rightarrow$ Trigger **Invoice Generation** $\rightarrow$ Status `INVOICED`.

---

## ## N-tier UI/API/Business/Data
Architecture follows a strict separation of concerns to support multi-tenancy.

- **UI Layer**: 
    - *Client Portal*: Booking engine, QR Wallet.
    - *Admin Dashboard*: Resource management, Analytics (cite: `admin-dashboard.md`).
    - *Staff App*: QR Scanner, Schedule view.
- **API Layer**: 
    - REST/GraphQL Gateway with versioning (`/v1/`).
    - **Tenant Middleware**: Extracts `X-Tenant-ID` from headers (cite: `ARCHITECTURE_AND_SECURITY_BASELINE.md`).
- **Business Layer**: 
    - *Booking Engine*: Collision detection based on `BookingType`.
    - *State Manager*: Enforces FSM transitions.
    - *Notification Service*: Event-driven triggers (Email/SMS).
- **Data Layer**: 
    - *PostgreSQL*: Relational store with `tenant_id` on every table.
    - *Redis*: Real-time availability caching.
    - *S3/Blob*: Invoice PDFs and resource media.

---

## ## Security (tenant, RBAC, token lifecycle, audit)
Security is centered on strict isolation and traceability (cite: `ARCHITECTURE_AND_SECURITY_BASELINE.md`).

- **Tenant Isolation**: 
    - **Logical Separation**: Every table contains `tenant_id`.
    - **Query Enforcement**: Base Repository appends `WHERE tenant_id = current_tenant_id` to all queries. No "naked" queries allowed.
- **RBAC (Role-Based Access Control)**: 
    - Hierarchy: `SuperAdmin` (UpNexa) $\rightarrow$ `TenantAdmin` $\rightarrow$ `BranchManager` $\rightarrow$ `Staff` (cite: `PACK_HANDOFF.md`).
    - Permissions: Granular scopes (e.g., `bookings:write`, `reports:read`).
- **Token Lifecycle**: 
    - **Issue**: Short-lived Access Token (15m) + Long-lived Refresh Token (7d).
    - **Revocation**: Redis-based blacklist for immediate session termination.
- **Audit**: 
    - **Immutable Log**: Table recording `(timestamp, user_id, action, entity_id, old_value, new_value)` (cite: `sam-harness/audit-history.md`).

---

## ## Delivery phases (handoff)
Execution is divided into gated phases. No phase begins until the previous is signed off.

**Phase 1: The Foundation (P0)**
- Implementation of `tenant_id` isolation middleware.
- Deployment of core PostgreSQL schema with `tenant_id` constraints.
- Basic Auth/JWT integration.

**Phase 2: The Booking Engine (P1)**
- Implementation of `BookingType` logic (Appointment/Rental/Batch).
- FSM transition logic for `PENDING` $\rightarrow$ `CONFIRMED`.
- Integration of availability calculation engine.

**Phase 3: The Execution Loop (P2)**
- QR Code generation and validation logic.
- Staff check-in interface.
- Transition to `CHECKED_IN` and `COMPLETED` states.

**Phase 4