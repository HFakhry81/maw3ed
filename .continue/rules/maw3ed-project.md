---
name: Maw3ed project auditor and fixer
description: Audit and implement focused fixes for the Maw3ed appointment platform.
alwaysApply: true
---

# Maw3ed project rules for Continue

## Understand the real codebase
- Start with `package.json` and the files directly related to the task. Treat `PROJECT_MAP.md` and other generated notes as hints only; verify their claims against source code and installed dependencies.
- This repository is a Node.js application with a Vite/React web app, PostgreSQL access through `pg`, Clerk authentication, and Whop billing. Backend modules and `server.js` are primarily at the repository root; also inspect `src/`, `db/`, `mobile/`, and `scripts/` when relevant.
- Do not assume frameworks, directories, or architecture that are not present in the current source.

## Implement, do not stop at recommendations
- For audit-only requests, report evidence and prioritized findings. When asked to fix findings or continue with recommendations, edit the code directly; do not return only a plan or suggested snippets.
- Make the smallest complete change, preserve existing user changes, and follow existing helpers and patterns.
- For a list of findings, fix the highest-priority actionable item first, verify it, then continue to the next item unless the user limits scope. Do not create commits unless explicitly asked.
- Inspect only the relevant feature slice; for large files, read focused sections rather than the whole project.

## Maw3ed correctness and safety
- Enforce authentication, role checks, and workspace/organization ownership on the server for every tenant-scoped operation. Never trust a tenant ID or role supplied only by the client.
- Preserve booking atomicity, capacity rules, slot-hold expiry, and timezone behavior. Reuse existing booking/capacity modules and transactions instead of adding a competing path.
- Preserve payment precision, idempotency, webhook verification, and outbox delivery guarantees where those flows are involved.
- Use parameterized database queries and existing validation/error-handling conventions. Never expose secrets or weaken security controls to make a test pass.
- Do not run migration, seed, reset, restore, purge, or other data-changing operational scripts without explicit user approval.

## Verification
- Read `package.json` and choose the narrowest existing `npm run test:...` script that covers the change. Add or update a focused regression test when behavior changes.
- Run `npm run build` when relevant. Do not claim a check passed unless it actually completed successfully; report skipped checks and environmental blockers.
- Finish with a concise summary of changed files, behavior, checks run, and any remaining risk.
