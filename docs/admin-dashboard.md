# لوحة تحكم الإدارة — موعد (Maw3ed)

**Role:** Command Center / Micro-ERP OS for owners, managers, reception, and providers.  
**Brand:** موعد / Maw3ed · UpNexa-eg.com. SetTime = UX reference only.

> **ملاحظة:** لوحة **مسؤولي المنصة** (Super Admin) منفصلة على `/admin.html` وتتطلب Postgres + دور `platform_role`. هذه الوثيقة تصف لوحة تشغيل المنشأة (tenant ops).

## Core idea

Operational transparency + real-time control: break silos between bookings, staff, CRM, finance, and marketing; turn data into decisions via KPIs; adapt UI by role (owner / reception / provider).

## Sidebar modules (MVP → Growth)

| Module | MVP | Notes |
| --- | --- | --- |
| Overview / KPIs | MVP | Today’s appointments, revenue proxy, attendance/completion counts |
| Calendar | MVP | Day/week views; status colors; manual create + payment method |
| Services & categories | MVP | Duration, price, buffer, providers, public visibility |
| Staff | MVP | Active providers linked to services |
| Schedule | MVP | Working hours, closed days, overrides |
| CRM & segments | MVP | Customers + VIP / عادي / جديد; phone upsert from public booking |
| Booking page | MVP | White-label slug + online toggle |
| Expenses / light finance | MVP | Expense ledger + stats summary |
| Notifications | MVP | Email toggles; WhatsApp/SMS teaser (Pro) |
| Preferences | MVP | Calendar display prefs |
| Payments / Marketing / Integrations | Growth | Teaser UI + lock → upgrade |
| RBAC hard gates | Later | Soft role chip in MVP; Nest JWT/RBAC target |

## Architecture (now vs target)

```
Now:  React SPA  →  Node opsRoutes  →  opsStore JSON (+ Postgres orgs)
Later: React SPA  →  Nest modular monolith  →  Postgres RLS + Redis
```

Practices in this slice:

- **Error Boundaries** around main content so one widget cannot white-screen the shell  
- **Optimistic UI** for appointment status flips when API exists  
- **Feature gating / upgrade CTA** for Growth modules and Free soft limits  
- **Concurrency:** appointment collision `409` + public soft holds (3 min); row locks later  
- **Pagination / virtualization / TanStack Query:** later when lists grow  

## Related

- [`public-booking-page.md`](public-booking-page.md) · [`architecture-spec.md`](architecture-spec.md) · [`build-plan.md`](build-plan.md) · [`platform-capabilities.md`](platform-capabilities.md)
