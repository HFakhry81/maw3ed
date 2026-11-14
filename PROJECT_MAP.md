# PROJECT_MAP.md - Maw3ed Platform Architecture

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Backend** | Node.js, Express.js |
| **Database** | PostgreSQL (via Prisma ORM) |
| **Authentication** | Clerk (multi-tenant SaaS) |
| **Billing** | Whop (subscription management) |
| **Frontend** | React (assumed, based on structure) |
| **ORM** | Prisma |
| **Queue/Worker** | Bull (Redis-based job queue) |
| **Email** | Nodemailer (assumed) |

---

## Directory Structure

```
maw3ed/
├── db/
│   ├── migrations/          # SQL migration files (001-008)
│   ├── prisma/             # Prisma schema & client
│   └── seed/               # Seed data scripts
├── src/
│   ├── config/             # Configuration files
│   ├── controllers/        # Route handlers
│   ├── middleware/         # Auth, validation, error handling
│   ├── models/             # Database models (if not using Prisma directly)
│   ├── routes/             # API route definitions
│   ├── services/           # Business logic layer
│   ├── utils/              # Helper functions
│   └── workers/            # Background job processors
├── tests/                  # Test suites
├── scripts/                # Utility scripts
└── server.js              # Entry point
```

---

## Core Entities & Relationships

### Multi-Tenant Hierarchy

```
User (app_users)
    └── Workspace (SaaS tenant, subscription)
            └── Organization (business unit within workspace)
                    ├── Departments
                    ├── Staff (doctors/providers)
                    ├── Services
                    ├── Customers (patients)
                    ├── Appointments
                    ├── Payments
                    └── Bookings
```

### Key Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `app_users` | Platform users (Clerk-authenticated) | clerk_user_id, is_platform_admin |
| `workspaces` | SaaS tenants with subscriptions | owner_user_id, activity_type, currency |
| `workspace_members` | User-workspace membership | role (owner/admin/manager/staff/viewer) |
| `workspace_subscriptions` | Active subscriptions | plan_key, provider (whop), status |
| `plan_catalog` | Available subscription tiers | free/pro/ultimate plans |
| `organizations` | Business units within workspace | workspace_id, activity_type, locale |
| `departments` | Service categories/locations | organization_id, name, type |
| `doctors` | Service providers | organization_id, department_id |
| `services` | Bookable services | organization_id, duration_minutes, pricing |
| `patients` | Customers/clients | organization_id, category_id |
| `appointments` | Bookings/reservations | organization_id, patient_id, doctor_id, service_id |
| `payments` | Financial transactions | organization_id, appointment_id, amount |
| `working_hours` | Availability schedules | organization_id, weekday, opens_at, closes_at |
| `slot_holds` | Temporary booking reservations | hold_key, expires_at |
| `activity_templates` | Industry-specific defaults | activity_type, labels, defaults |

---

## Architecture Rules

### 1. Multi-Tenancy
- **Workspace Level**: SaaS subscription boundary (billed entity)
- **Organization Level**: Business unit (can have multiple per workspace)
- All queries must filter by `organization_id` or `workspace_id`
- Cross-tenant access must be explicitly validated

### 2. Authentication & Authorization
- Clerk handles user authentication
- Role-based access control (RBAC): owner > admin > manager > staff > viewer
- Platform admins bypass tenant restrictions

### 3. Booking Flow
1. Check working hours & availability
2. Create slot hold (temporary reservation, expires in N minutes)
3. Confirm appointment (converts hold to booking)
4. Update usage counters for billing

### 4. Financial Integrity
- Use `NUMERIC(12,2)` for all monetary values
- Never use floating-point arithmetic for money
- Track payment_status separately from appointment status
- Support partial payments

### 5. Activity Types
- 18+ industry templates (medical, salon, fitness, etc.)
- Each has localized labels (Arabic/English)
- Labels dynamically rename UI terms (e.g., "patients" → "students")

---

## Critical Business Logic Locations

| Feature | Backend Files | Frontend Files |
|---------|---------------|----------------|
| Auth | `middleware/auth.js` | `hooks/useAuth.ts` |
| Booking | `services/bookingService.js` | `pages/booking/*` |
| Payments | `services/paymentService.js` | `pages/payments/*` |
| Availability | `services/availabilityService.js` | `components/Calendar/*` |
| Subscription | `services/subscriptionService.js` | `pages/settings/billing` |

---

## Known Architectural Concerns

1. **Slot Holds**: Uses `slot_holds` table for multi-worker safe temporary reservations
2. **Usage Tracking**: `usage_counters` table tracks monthly limits per workspace
3. **Localization**: Labels stored in JSONB, activity templates provide defaults
4. **Billing Integration**: Whop handles subscriptions, platform tracks usage

---

*Generated by Security Auditor - Ready for Phase 2 Audit*