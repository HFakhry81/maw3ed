# IMPLEMENTATION_BACKLOG.md

## 🚀 Project: Maw3ed - Resource Orchestrator Alignment
**Status:** Draft  
**Source:** `CODE_VS_PLAN_GAP_MATRIX.md`  
**Objective:** Transition from a single-tenant appointment prototype to a multi-tenant, multi-purpose Resource Orchestrator.

---

## 🔴 Priority 0: Critical Infrastructure & Core Logic
*These items are blockers. No other feature development should proceed until the data isolation and booking modes are established.*

### [M-1009] Multi-Tenant Isolation Framework
**Goal:** Ensure data privacy and isolation between different business owners (tenants).
- [ ] **Database Schema Migration:** Add `tenant_id` (UUID) to all primary tables (Users, Bookings, Services, Staff, etc.).
- [ ] **Tenant Context Provider:** Implement `AsyncLocalStorage` to store the current `tenant_id` for the duration of the request lifecycle.
- [ ] **Tenant Middleware:** Create a middleware to extract `X-Tenant-ID` from request headers and validate it against the tenant registry.
- [ ] **Global Query Interceptor:** Implement a repository-level or ORM-level interceptor to automatically append `WHERE tenant_id = current_tenant` to all queries.

### [M-1010] BookingType Triad & Capacity Logic
**Goal:** Move beyond "1:1 appointments" to support Rentals and Batch sessions.
- [ ] **Schema Update:** Add `occupancy_mode` (`EXCLUSIVE`, `RENTAL`, `CAPACITY`) to the Resource/Service models.
- [ ] **Booking Logic Overhaul:**
    - **Exclusive:** 1 Resource $\rightarrow$ 1 Client (Standard Appointment).
    - **Rental:** 1 Resource $\rightarrow$ 1 Client $\rightarrow$ Duration-based (e.g., Padel Court).
    - **Capacity:** 1 Resource $\rightarrow$ N Clients (e.g., Yoga Class).
- [ ] **Availability Engine:** Implement the calculation: `(TotalResources * Capacity) - BookedSlots` to determine real-time availability for batch sessions.

---

## 🟡 Priority 1: Operational Lifecycle & Revenue Flow
*These items bridge the gap between a "booking" and a "completed business transaction."*

### [M-1011] FSM: Booking Lifecycle Enforcement
**Goal:** Prevent illegal state transitions (e.g., moving a `CANCELLED` booking to `COMPLETED`).
- [ ] **State Machine Definition:** Define a strict transition map (e.g., `PENDING` $\rightarrow$ `CONFIRMED` $\rightarrow$ `CHECKED_IN` $\rightarrow$ `COMPLETED`).
- [ ] **Validation Layer:** Implement a service-level guard that throws an error if a requested status change violates the FSM.

### [M-1012] QR Code Generation System
**Goal:** Provide a digital token for client verification.
- [ ] **Token Generation:** Create a secure, short-lived unique session token upon booking status changing to `CONFIRMED`.
- [ ] **QR Integration:** Implement a utility to generate a QR code image/string containing the session token.

### [M-1013] QR Scanner & Check-in Logic
**Goal:** Automate the transition from "Confirmed" to "Attending."
- [ ] **Check-in Endpoint:** Create a protected endpoint that accepts a QR token and validates it against the booking.
- [ ] **State Transition:** Automatically trigger the transition to `CHECKED_IN` status upon successful scan.

### [M-1015] Financial Settlement Trigger
**Goal:** Close the loop between service delivery and invoicing.
- [ ] **Invoice Trigger:** Implement a hook that triggers the creation of an `INVOICE` record immediately when a booking status moves to `COMPLETED`.
- [ ] **Status Mapping:** Link `COMPLETED` session $\rightarrow$ `INVOICED` status.

---

## 🔵 Priority 2: Refinements & Edge Cases
*Enhancements to improve operational robustness.*

### [M-1014] Advanced Staff/Branch State Management
- [ ] Expand `staff.model.ts` to include `SUSPENDED` and `OFFLINE` states.
- [ ] Update availability logic to exclude `OFFLINE` staff from the booking engine.

### [M-1016] Multi-Resource Mapping
- [ ] Update `service.model.ts` to allow a single booking to require multiple resources (e.g., a "Treatment" requiring both a "Specialist" and a "Massage Room").