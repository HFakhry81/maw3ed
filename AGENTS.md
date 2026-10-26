# AGENTS.md

## Project snapshot

This repository is a mixed web app for Maw3ed: a Node.js HTTP server, static HTML pages, a Vite/React front end, and a custom booking/ops layer that supports local JSON data and PostgreSQL-backed storage when configured.

The best starting points for reliable changes are:

- [server.js](server.js) — server entry point and request handling
- [db.js](db.js) — database access and configuration
- [opsRoutes.js](opsRoutes.js) — booking and workspace API flows
- [opsStore.js](opsStore.js) and [opsWorkspace.js](opsWorkspace.js) — workspace state logic
- [workspaceOpsPg.js](workspaceOpsPg.js) — normalized PostgreSQL persistence for workspace operations
- [src/main.jsx](src/main.jsx) and [src/](src/) — React/Vite operations UI and components
- [activityTemplatesCatalog.js](activityTemplatesCatalog.js) — activity templates and starter catalogs
- [platformAdminRoutes.js](platformAdminRoutes.js) — platform admin features
- [docs/PROJECT_DOCUMENTATION_INDEX.md](docs/PROJECT_DOCUMENTATION_INDEX.md) — documentation map
- [docs/IMPLEMENTATION_EXECUTION_LOG.md](docs/IMPLEMENTATION_EXECUTION_LOG.md) — roadmap stage status and resume pointer
- [docs/ROADMAP_PROGRESS.json](docs/ROADMAP_PROGRESS.json) — machine-readable stage checklist synced with the execution log
- [docs/ARCHITECTURE_AND_SECURITY_BASELINE.md](docs/ARCHITECTURE_AND_SECURITY_BASELINE.md) — architecture and security baseline
- [docs/refresh-and-test.md](docs/refresh-and-test.md) — local workflow and validation commands
- [docs/PRODUCTION_READINESS_REPORT.md](docs/PRODUCTION_READINESS_REPORT.md) — current risk and readiness status
- [docs/WORKSPACE_CAPACITY_MODEL_EDUCATION_AND_VERTICALS.md](docs/WORKSPACE_CAPACITY_MODEL_EDUCATION_AND_VERTICALS.md) — education, group capacity, resources, and vertical booking modes
- [legacyAccess.js](legacyAccess.js) — Phase 1 barriers for legacy medical APIs, development-events, and uploads
- [workspaceEvents.js](workspaceEvents.js) — per-workspace append-only operational event log (JSONL; no DB migration)
- [runtimePosture.js](runtimePosture.js) — production auth/storage posture checks

## Development workflow

Use the repo scripts rather than inventing new commands:

- Install dependencies: npm install
- Start backend: npm run start or npm run dev:api
- Start front end: npm run dev
- Build frontend: npm run build
- Full project refresh: npm run update:all
- Smoke checks: npm run test:smoke
- Combined smoke, HTTP, and platform-admin checks: npm run test:all
- HTTP checks: npm run test:http
- Platform admin checks: npm run test:platform-admin
- Database setup and migrations: npm run migrate
- Operational backups: npm run ops:backup and npm run ops:restore

`npm run update:all` and backend update flows can migrate, seed, reset, and restore local operational data. Inspect [docs/refresh-and-test.md](docs/refresh-and-test.md) before running broad refresh/update scripts; prefer the narrow build or test command for routine validation. Multiple package-manager lockfiles are present, so do not regenerate or remove lockfiles without confirming the intended package-manager policy.

## Architecture and safety rules

- Treat the architecture doc as the source of truth, not older assumptions embedded in legacy routes.
- The app supports both local JSON fallback data and PostgreSQL-backed data; preserve both paths when modifying booking or workspace behavior.
- Never trust the browser-provided workspace ID as the final authority. Confirm the actual user, tenant membership, and permissions on the server.
- Production and authenticated flows should be treated as stricter than local prototype flows. Do not weaken auth or isolation while fixing legacy behavior.
- When a change touches booking, workspace isolation, platform admin, or security-sensitive routes, review the relevant docs before making the patch.
- The education/vertical capacity model is a target design, not implemented functionality: the current appointment schema does not provide group-session capacity, enrollments, attendance, or room resources. Do not imply these are supported because an `education` template exists; consult the capacity model and verify the code/migrations before changing that claim.

## Coding expectations

- Prefer small, targeted edits over broad refactors.
- Follow the existing server-style patterns in the current files instead of introducing a new framework or data layer.
- Keep legacy compatibility in mind when changing routes or data contracts.
- If a feature is incomplete or explicitly marked as legacy or risky in the docs, do not quietly treat it as ready for production.
- Add or update the relevant validation step after a fix; use the smallest smoke/test command that exercises the changed behavior.

## Useful conventions for AI agents

- Search for the existing route or helper before creating a new implementation.
- Keep tenant/workspace boundaries explicit in any data read or write.
- Preserve the distinction between public booking features and internal admin or platform features.
- Use the JSON and PostgreSQL code paths consistently, and avoid assumptions that a single data source is the only supported path.
- Frontend source lives under `src/`; root HTML pages and `dist/` have separate roles. Make UI changes in source files and let the build generate `dist/` rather than editing generated assets.
- When the repo behavior seems inconsistent, prefer the documented project intent and the current production-readiness guidance over old examples or ad hoc assumptions.

## Documentation-first guidance

If a task is ambiguous, start from the documentation index and the architecture baseline. The repo already contains the relevant product, operational, and security context; do not duplicate that context in code comments when a doc link suffices.
