# NEXT_SPRINT.md

## 🎯 Sprint Goal
**Transition from Single-Tenant Prototype to Multi-Tenant Resource Orchestrator.**
The primary focus is establishing the architectural foundation (Multi-tenancy) and the core booking logic (BookingType Triad) to support diverse resource modes.

---

## 🚀 High Priority Tasks (P0)

### 🏗️ Foundation: Multi-Tenancy [M-1009]
- [ ] **Database Migration:** Add `tenant_id` to all core tables (Users, Appointments, Services, Staff).
- [ ] **Tenant Middleware:** Implement `X-Tenant-ID` header validation.
- [ ] **Context Management:** Implement `AsyncLocalStorage` to propagate `tenant_id` across services and repositories for strict data isolation.

### ⚙️ Core Logic: BookingType Triad [M-1010]
- [ ] **Schema Update:** Introduce `occupancy_mode` (Exclusive, Rental, Capacity) to Resource/Service models.
- [ ] **Capacity Engine:** Implement logic to calculate available slots: `(TotalResources * Capacity) - BookedSlots`.
- [ ] **Booking Logic:** Refactor booking service to handle `RESOURCE_RENTAL` and `BATCH_SCHEDULE` instead of just 1:1 appointments.

---

## 🛠️ Secondary Objectives (P1)

### 🔄 Lifecycle & Validation [M-1011]
- [ ] **FSM Implementation:** Implement a Finite State Machine for booking statuses to prevent illegal transitions (e.g., `PENDING` $\rightarrow$ `COMPLETED` without `CONFIRMED`).

### 🎫 Access Control [M-1012, M-1013]
- [ ] **QR Generation:** Create logic to generate unique session tokens/QR codes upon `CONFIRMED` status.
- [ ] **Check-in Endpoint:** Create the `CHECKED_IN` transition endpoint for QR scanner integration.

---

## 📉 Success Metrics
- [ ] All database queries are filtered by `tenant_id`.
- [ ] System can successfully book a "Batch" session with multiple participants.
- [ ] System prevents overbooking based on defined resource capacity.