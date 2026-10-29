Merge strategy-v1 with ALL rejection fixes into FULL strategy-v2.
Add section "Merged fixes from rejection-v1".
MUST-FIX:
1. أسباب الرفض / Rejection reason: **Incomplete Delivery Phases.** The strategy cuts off mid-sentence at "Phase 4", leaving the handoff and production completion plan undefined. This violates the requirement for a "concrete" strategy.
2. درجة الخطورة / Severity: Critical
3. طريقة الحل / How to fix: Complete the delivery phases (Phase 4 and beyond) ensuring they align with `PRODUCTION_COMPLETION_PLAN.md`.
4. Complete the delivery phases (Phase 4 and beyond) ensuring they align with `PRODUCTION_COMPLETION_PLAN.md`.
5. أسباب الرفض / Rejection reason: **Evidence Path Mismatch (Hallucination).** The strategy cites `ceo-draft.md` for the `BookingType` triad. This file is **not** in the provided Evidence Pack. The evidence pack contains `docs/Sam-Harness no.1/ceo-draft.md`, but not a root-level `ceo-draft.md`.
6. درجة الخطورة / Severity: High
7. طريقة الحل / How to fix: Correct the citation to the exact path found in the evidence pack (e.g., `docs/Sam-Harness no.1/ceo-draft.md`) or remove the citation if the content is not present in that specific file.
8. Correct the citation to the exact path found in the evidence pack (e.g., `docs/Sam-Harness no.1/ceo-draft.md`) or remove the citation if the content is not present in that specific file.
9. أسباب الرفض / Rejection reason: **Missing Token Lifecycle Detail.** While the strategy mentions "Short-lived Access Token" and "Refresh Token," it fails to define the *lifecycle* (rotation, renewal flow, or expiration handling) as required by the prompt's "missing token lifecycle" rejection criteria. It is a summary, not a concrete lifecycle specification.
10. درجة الخطورة / Severity: Medium
11. طريقة الحل / How to fix: Detail the token rotation mechanism and the specific trigger for refresh token usage.
12. Detail the token rotation mechanism and the specific trigger for refresh token usage.
13. *FIX 1:** Complete the "Delivery phases" section through to final handoff.
14. *FIX 2:** Audit all citations against the Evidence Pack; replace `ceo-draft.md` with the correct path from the `Sam-Harness` subdirectories.

PRIOR STRATEGY:
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

REJECTION:
# Audit v1/5
Result: [REJECTED]

[REJECTED]

### Issue 1
- أسباب الرفض / Rejection reason: **Incomplete Delivery Phases.** The strategy cuts off mid-sentence at "Phase 4", leaving the handoff and production completion plan undefined. This violates the requirement for a "concrete" strategy.
- درجة الخطورة / Severity: Critical
- طريقة الحل / How to fix: Complete the delivery phases (Phase 4 and beyond) ensuring they align with `PRODUCTION_COMPLETION_PLAN.md`.

### Issue 2
- أسباب الرفض / Rejection reason: **Evidence Path Mismatch (Hallucination).** The strategy cites `ceo-draft.md` for the `BookingType` triad. This file is **not** in the provided Evidence Pack. The evidence pack contains `docs/Sam-Harness no.1/ceo-draft.md`, but not a root-level `ceo-draft.md`.
- درجة الخطورة / Severity: High
- طريقة الحل / How to fix: Correct the citation to the exact path found in the evidence pack (e.g., `docs/Sam-Harness no.1/ceo-draft.md`) or remove the citation if the content is not present in that specific file.

### Issue 3
- أسباب الرفض / Rejection reason: **Missing Token Lifecycle Detail.** While the strategy mentions "Short-lived Access Token" and "Refresh Token," it fails to define the *lifecycle* (rotation, renewal flow, or expiration handling) as required by the prompt's "missing token lifecycle" rejection criteria. It is a summary, not a concrete lifecycle specification.
- درجة الخطورة / Severity: Medium
- طريقة الحل / How to fix: Detail the token rotation mechanism and the specific trigger for refresh token usage.

---

**FIX 1:** Complete the "Delivery phases" section through to final handoff.
**FIX 2:** Audit all citations against the Evidence Pack; replace `ceo-draft.md` with the correct path from the `Sam-Harness` subdirectories.
**FIX 3:** Expand the "Token Lifecycle" section to include the actual flow of token renewal and expiration.

EVIDENCE:
# Evidence pack (local scout)

Target: `E:\UpNexa.com\maw3ed`
Scanned: 2026-10-29T11:06:01.308Z
Hits: 60

Auditor MUST cite these paths (or mark "not found") — do not invent frameworks.

- `docs/admin-dashboard.md` — tenant/workspace isolation signals (content)
- `docs/ARCHITECTURE_AND_SECURITY_BASELINE.md` — tenant/workspace isolation signals (content)
- `docs/BOOKING_PORTAL_HOSTING_DOMAIN.md` — tenant/workspace isolation signals (content)
- `docs/DEPARTMENT_DESK.md` — tenant/workspace isolation signals (content)
- `docs/DEVELOPMENT_LOG.md` — schema/migration artifact (content)
- `docs/GO_NO_GO_CHECKLIST.md` — QR/check-in signals (content)
- `docs/IMPLEMENTATION_EXECUTION_LOG.md` — booking/occupancy signals (content)
- `docs/IMPLEMENTATION_ROADMAP.md` — booking/occupancy signals (content)
- `docs/INCOMPLETE_LOGIC.md` — QR/check-in signals (content)
- `docs/MEDICAL_DEMO_SEED.md` — tenant/workspace isolation signals (content)
- `docs/OPERATIONAL_FLOWS_AND_STATUS_MACHINES.md` — booking/occupancy signals (content)
- `docs/OPS_BACKUP_RESTORE_RUNBOOK.md` — tenant/workspace isolation signals (content)
- `docs/PHASE_0_API_INVENTORY_AND_DECISIONS.md` — tenant/workspace isolation signals (content)
- `docs/PLATFORM_GOVERNANCE.md` — booking/occupancy signals (content)
- `docs/PRE_LAUNCH_ACCEPTANCE_CHECKLIST.md` — QR/check-in signals (content)
- `docs/PRIVACY_REQUESTS_RUNBOOK.md` — tenant/workspace isolation signals (content)
- `docs/PRODUCTION_COMPLETION_PLAN.md` — booking/occupancy signals (content)
- `docs/PRODUCTION_READINESS_REPORT.md` — tenant/workspace isolation signals (content)
- `docs/PRODUCT_AND_PLATFORM_SPEC.md` — booking/occupancy signals (content)
- `docs/PROJECT_DOCUMENTATION_INDEX.md` — booking/occupancy signals (content)
- `docs/public-booking-page.md` — tenant/workspace isolation signals (content)
- `docs/REFERENCE_PLATFORM_BENCHMARK.md` — tenant/workspace isolation signals (content)
- `docs/refresh-and-test.md` — booking/occupancy signals (content)
- `docs/sam-harness/audit-history.md` — booking/occupancy signals (content)
- `docs/sam-harness/audit-report.md` — booking/occupancy signals (content)
- `docs/sam-harness/CODE_VS_PLAN_GAP_MATRIX.md` — tenant/workspace isolation signals (content)
- `docs/sam-harness/EXECUTION_JOURNAL.md` — booking/occupancy signals (content)
- `docs/sam-harness/IMPLEMENTATION_BACKLOG.md` — tenant/workspace isolation signals (content)
- `docs/sam-harness/marketing-campaign.md` — QR/check-in signals (content)
- `docs/sam-harness/NEXT_SPRINT.md` — tenant/workspace isolation signals (content)
- `docs/sam-harness/PACK_HANDOFF.md` — RBAC/auth signals (content)
- `docs/sam-harness/TICKET_P0_STARTER.md` — tenant/workspace isolation signals (content)
- `docs/Sam-Harness no.1/audit-attempt-1.md` — booking/occupancy signals (content)
- `docs/Sam-Harness no.1/audit-attempt-2.md` — booking/occupancy signals (content)
- `docs/Sam-Harness no.1/audit-attempt-3.md` — booking/occupancy signals (content)
- `docs/Sam-Harness no.1/au
...(truncated)