# TICKET_P0_STARTER.md

## 🎫 [M-1009] Multi-Tenant Data Isolation

### 📌 Overview
**Priority:** P0 (Critical)  
**Status:** Ready for Implementation  
**Objective:** Transform the application from a single-tenant architecture to a multi-tenant SaaS model. This ensures that data belonging to one business (Tenant) is logically isolated and inaccessible to any other business, preventing catastrophic data leakage.

---

### 🎯 Business Value
Without multi-tenancy, the system cannot be scaled as a product. This ticket establishes the "Product Truth"—the fundamental rule that every piece of data in the system belongs to a specific owner.

---

### 🛠 Technical Specification

#### 1. Database Schema Changes
- **Global Tables:** Identify tables that remain global (e.g., `SystemConfig`, `PlanTypes`).
- **Tenant Tables:** Every other entity (Users, Bookings, Branches, etc.) must be updated to include a `tenant_id` column.
- **Indexing:** Add a composite index on `(tenant_id, id)` for all primary entities to ensure query performance.

#### 2. Request Context (The "Tenant Bridge")
- **Middleware:** Implement a `tenant.middleware.ts` that:
    - Intercepts every incoming request.
    - Extracts the `tenant_id` from the `X-Tenant-ID` header or the decoded JWT payload.
    - Validates that the tenant exists and is active.
    - Stores the `tenant_id` in an asynchronous local storage (e.g., `AsyncLocalStorage` in Node.js) to make it accessible throughout the request lifecycle without passing it as a function argument.

#### 3. Data Access Layer (The "Safety Net")
- **Base Repository:** Modify `base.repository.ts` to automatically inject the `tenant_id` into all `SELECT`, `UPDATE`, and `DELETE` queries.
- **Constraint:** No query should be allowed to execute against a tenant-owned table without a `WHERE tenant_id = ...` clause.

---

### ✅ Acceptance Criteria
- [ ] **Schema Update:** All relevant tables in the database have a `tenant_id` column.
- [ ] **Middleware Enforcement:** Requests missing a valid tenant identifier are rejected with a `403 Forbidden` or `400 Bad Request`.
- [ ] **Isolation Proof:** A request authenticated for `Tenant_A` cannot retrieve or modify a record belonging to `Tenant_B`, even if the record's primary ID is known.
- [ ] **Context Availability:** The `tenant_id` is accessible in the Service layer without being explicitly passed through every method signature.

---

### 🚀 Suggested Implementation Path (The "First Patch")
1. **Step 1:** Create a `TenantContext` utility using `AsyncLocalStorage`.
2. **Step 2:** Implement the `tenant.middleware.ts` to populate this context from the `X-Tenant-ID` header.
3. **Step 3:** Update the `User` and `Branch` tables to include `tenant_id` and migrate existing data to a default "Seed Tenant".
4. **Step 4:** Update the Base Repository to append the tenant filter to all queries.

---

### 📂 Files to Touch
- `src/middleware/tenant.middleware.ts` (New)
- `src/database/schema.ts`
- `src/repositories/base.repository.ts`
- `src/context/tenant.context.ts` (New)