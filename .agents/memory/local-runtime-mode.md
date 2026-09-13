---
name: Local runtime mode
description: How Maw3ed runs without forcing a database in local and VPS environments
---

The application defaults to local in-memory data backed by the checked-in sample JSON, so local and VPS startup do not require PostgreSQL. PostgreSQL remains an explicit opt-in through `MAW3ED_STORAGE=postgres` plus `DATABASE_URL`.

**Why:** The imported project had an available database variable but no applied schema, while the product requirement prioritizes a portable local/VPS runtime without adding infrastructure.

**How to apply:** Preserve the default local mode when changing dashboard API behavior; only rely on SQL-backed paths when PostgreSQL mode is explicitly enabled.