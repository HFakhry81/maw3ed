# TICKET_P0_STARTER.md

## 🎫 Ticket [M-1009]: Multi-Tenant Isolation Framework

**Priority:** 🔴 P0 (Blocker)  
**Status:** To Do  
**Component:** Infrastructure / Database / Middleware  
**Objective:** Transition the system from a single-tenant prototype to a multi-tenant architecture where data is strictly isolated by `tenant_id`.

---

### 📖 Context
Currently, the application operates as a single-tenant system. To scale as a Resource Orchestrator, we must ensure that Business Owner A cannot see or modify data belonging to Business Owner B. This requires a systemic "Tenant Context" that permeates every layer of the application, from the HTTP request to the database query.

### 🎯 Acceptance Criteria

#### 1. Database Schema Migration
- [ ] All primary entities (Users, Bookings, Services, Staff, Resources, etc.) must have a `tenant_id` column of type `UUID`.
- [ ] `tenant_id` must be indexed for performance.
- [ ] A `Tenants` table must be created to manage tenant metadata (name, status, subscription level).

#### 2. Tenant Context Provider
- [ ] Implement a mechanism using `AsyncLocalStorage` (Node.js) to store the `tenant_id` for the duration of an asynchronous request lifecycle.
- [ ] Create a utility `TenantContext.getTenantId()` to retrieve the ID from anywhere in the business logic without passing it as a function argument.

#### 3. Tenant Middleware
- [ ] Implement a global middleware that:
    - Extracts `X-Tenant-ID` from the request headers.
    - Validates that the tenant exists and is active in the `Tenants` table.
    - Sets the `tenant_id` into the `AsyncLocalStorage` context.
    - Returns a `403 Forbidden` or `401 Unauthorized` if the tenant ID is missing or invalid.

#### 4. Global Query Interceptor
- [ ] Implement a repository-level or ORM-level interceptor (e.g., Prisma Middleware, TypeORM Subscriber, or a BaseRepository wrapper).
- [ ] **Requirement:** Every `SELECT`, `UPDATE`, and `DELETE` query must automatically append `WHERE tenant_id = current_tenant_id`.
- [ ] **Requirement:** Every `INSERT` must automatically assign the `tenant_id` from the current context.

---

### 🛠 Technical Implementation Notes

- **Security Warning:** Do not rely on the client to send the `tenant_id` for sensitive operations without verifying the user's membership to that tenant (JWT claim verification).
- **Performance:** Ensure that composite indexes are created on `(tenant_id, id)` for primary lookups to avoid full table scans.
- **Edge Case:** Define how "Super Admins" (Maw3ed platform owners) bypass the tenant filter to perform cross-tenant analytics.

### 🧪 Testing Strategy
- **Isolation Test:** Create two tenants. Attempt to fetch a Booking ID belonging to Tenant A while authenticated as Tenant B. The system must return `404 Not Found` (to avoid leaking existence) or `403 Forbidden`.
- **Leakage Test:** Verify that a `SELECT * FROM Bookings` call without an explicit filter only returns records for the active tenant in the context.
- **Context Test:** Verify that concurrent requests for different tenants do not "bleed" into each other (Race condition check for `AsyncLocalStorage`).

---

### 🔗 Dependencies
- **Blocks:** All subsequent P1 and P2 features.
- **Requires:** Database migration tool (e.g., Prisma Migrate, Knex, Liquibase).