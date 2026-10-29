# Sam-Harness Execution Journal

Living log of real code implementation against the swarm pack.

## 2026-10-29 — multi-purpose status machines + templates

### Done
- Anchored product truth: Maw3ed is multi-purpose (not clinic-only) with BookingType triad APPOINTMENT / RESOURCE_RENTAL / BATCH_SCHEDULE.
- Added `opsStatusMachines.js` (enums, transitions, bilingual catalog).
- Migration `015_ops_status_machines.sql` (appointment/resource/occurrence/attendance + rental_session_status).
- Migration `016_activity_templates_sauna_sports_gaming.sql`.
- Templates: `sauna`, `sports`, `gaming`; occupancy defaults on education/billiards/fitness seeds.
- Wired `opsStore.updateAppointmentStatus` + desk buckets; capacity resource bookable statuses; `GET /api/ops/status-catalog`.
- Specs/pack: OPERATIONAL_FLOWS doc, PRODUCT_SPEC, IMPLEMENTATION_BACKLOG, NEXT_SPRINT, TICKET_P0_STARTER.
- Sam-Harness `task.ts` / `task.md` / `project-spec.md` updated for swarm.
- Smoke: `scripts/smoke-ops-status-machines.js` PASS.

### Files changed
- `opsStatusMachines.js`
- `activityTemplatesCatalog.js`
- `opsStore.js`, `opsRoutes.js`, `capacityOps.js`, `capacityEngine.js`
- `src/jobTitles.js`
- `db/migrations/015_ops_status_machines.sql`
- `db/migrations/016_activity_templates_sauna_sports_gaming.sql`
- `scripts/smoke-ops-status-machines.js`
- `docs/OPERATIONAL_FLOWS_AND_STATUS_MACHINES.md`
- `docs/PRODUCT_AND_PLATFORM_SPEC.md`
- `docs/PROJECT_DOCUMENTATION_INDEX.md`
- `docs/sam-harness/*` (backlog, sprint, ticket, journal)
- Sam-Harness: `task.ts`, `task.md`, `task-architecture.md`, `docs/project-spec.md`

### Remaining
- Apply migrations 015/016 on Postgres deploy targets.
- Ticket 3 lifecycle: deepen QR → session for all three BookingTypes; rental live tab UI/API; final invoice settlement path; parent alert on BATCH absence.
- Reseed demo workspaces with new templates; UI labels for waitlisted/in_progress/paused/rental statuses.
- Reviewer follow-up after next code pass: [MATCH] flows vs OPERATIONAL_FLOWS for invoice close.

### Reviewer
[MATCH] Product framing and status/template seeds align with multi-purpose OPERATIONAL_FLOWS.
[NOT_MATCH] Full production lifecycle (QR delivery channels, live rental desk UX, invoice settlement automation) still incomplete — continue Ticket 3.

---
