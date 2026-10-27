#!/usr/bin/env node
/**
 * Phase 2 closeout smoke: PG workspace_ops_* (+ staff links) backup→restore,
 * JSON↔PG compare, and optional migrate-twice proof against ephemeral/local Postgres.
 *
 * Without DATABASE_URL + MAW3ED_STORAGE=postgres:
 *   - Still validates table inventory / script load
 *   - Exits 0 with skipped:true and a clear message (CI-safe)
 *
 * With Postgres available:
 *   - Seeds a disposable workspace into workspace_ops_*
 *   - Backs up, mutates, restores, compares JSON↔PG (ok=true)
 *   - Optionally proves migrate twice when --migrate-twice is set or
 *     MAW3ED_SMOKE_MIGRATE_TWICE=1
 */
const fs = require("fs");
const path = require("path");
const {
  OPS_PG_TABLES,
  createPgOpsBackup,
  restorePgOpsBackup,
  backupsRoot
} = require("./ops-pg-backup");
const { compareStores, auditStore, entityCounts } = require("../opsIntegrity");
const { buildFixtureStore } = require("./audit-ops-integrity");
const {
  listMigrationFiles,
  applyPendingMigrations,
  MIGRATIONS_DIR
} = require("./migrate");

const root = path.join(__dirname, "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function postgresReady() {
  return (
    process.env.MAW3ED_STORAGE === "postgres" &&
    Boolean(process.env.DATABASE_URL) &&
    !String(process.env.DATABASE_URL).includes("CHANGE_ME")
  );
}

function cleanupSession(stamp) {
  const sessionDir = path.join(backupsRoot, stamp);
  if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true, force: true });
}

async function ensureWorkspaceRow(client, workspaceId, slug) {
  const userId = `user-${workspaceId}`;
  await client.query(
    `INSERT INTO app_users (id, email, display_name, status)
     VALUES ($1, $2, $3, 'active')
     ON CONFLICT (id) DO NOTHING`,
    [userId, `${workspaceId}@example.test`, "PG Ops Smoke"]
  );
  await client.query(
    `INSERT INTO workspaces (id, owner_user_id, name, slug, status)
     VALUES ($1, $2, $3, $4, 'active')
     ON CONFLICT (id) DO NOTHING`,
    [workspaceId, userId, `WS ${workspaceId}`, slug]
  );
}

function buildPgDrillStore(slug) {
  const fixture = buildFixtureStore();
  fixture.bookingPage = {
    ...(fixture.bookingPage || {}),
    slug,
    businessName: "PG Ops Smoke",
    timezone: "Africa/Cairo",
    onlineBookingEnabled: true,
    locale: "ar"
  };
  fixture.workingHours = fixture.workingHours || [];
  fixture.closedDays = fixture.closedDays || [];
  fixture.specificDays = fixture.specificDays || [];
  fixture.expenses = fixture.expenses || [];
  fixture.medicalDepartments = fixture.medicalDepartments || [];
  fixture.appointments = (fixture.appointments || []).map((row) => ({
    ...row,
    date: row.date || "2099-01-15",
    time: row.time || "10:00",
    customerName: row.customerName || "علي حسن",
    staffName: row.staffName || "د. سارة",
    serviceName: row.serviceName || "كشف",
    status: row.status || "confirmed",
    // saveStore persists visitLog (not legacy visits)
    visitLog: row.visitLog || [
      {
        id: "visit-1",
        at: "2099-01-15T10:05:00.000Z",
        type: "check_in",
        staffId: "staff-1",
        staffName: "د. سارة"
      }
    ]
  }));
  return fixture;
}

async function runMigrateTwice(pool) {
  const client = await pool.connect();
  try {
    const first = await applyPendingMigrations(client, { migrationsDir: MIGRATIONS_DIR });
    const second = await applyPendingMigrations(client, { migrationsDir: MIGRATIONS_DIR });
    const files = listMigrationFiles(MIGRATIONS_DIR);
    assert(files.includes("011_workspace_ops_composite_fks.sql"), "011 must exist");
    assert(files.includes("012_workspace_staff_links.sql"), "012 must exist");
    assert(second.pending === 0, "second migrate must have 0 pending");
    assert(second.applied === 0, "second migrate must apply 0 files");
    const ledger = await client.query(
      "SELECT filename FROM schema_migrations WHERE filename = ANY($1::text[]) ORDER BY filename",
      [["011_workspace_ops_composite_fks.sql", "012_workspace_staff_links.sql"]]
    );
    assert(ledger.rows.length === 2, "schema_migrations must record 011 and 012");
    return {
      ok: true,
      firstApplied: first.applied,
      secondPending: second.pending,
      secondApplied: second.applied,
      ledger: ledger.rows.map((row) => row.filename)
    };
  } finally {
    client.release();
  }
}

async function runBackupRestoreDrill(pool) {
  const workspaceOpsPg = require("../workspaceOpsPg");
  const workspaceId = `pg-ops-smoke-${process.pid}`;
  const slug = `pg-ops-smoke-${process.pid}`;
  const stamp = `pg-ops-smoke-${Date.now()}`;
  const fixture = buildPgDrillStore(slug);

  const client = await pool.connect();
  try {
    await ensureWorkspaceRow(client, workspaceId, slug);
    await workspaceOpsPg.saveStore(client, workspaceId, fixture);
    const emptyFactory = () => ({
      customerCategories: [],
      customers: [],
      staff: [],
      serviceCategories: [],
      services: [],
      workingHours: [],
      closedDays: [],
      specificDays: [],
      expenses: [],
      appointments: [],
      medicalDepartments: [],
      bookingPage: {},
      calendarPreferences: {},
      notifications: {},
      activityLabels: {},
      activityLabelsI18n: null
    });
    const loaded = await workspaceOpsPg.loadStore(client, workspaceId, emptyFactory);
    const beforeCompare = compareStores(fixture, loaded, {
      leftLabel: "fixture",
      rightLabel: "pg-before"
    });
    assert(beforeCompare.ok, `pre-backup JSON↔PG mismatch: ${JSON.stringify(beforeCompare.diffs)}`);
    assert(auditStore(loaded).ok, "loaded PG store must pass orphan audit");
  } finally {
    client.release();
  }

  try {
    const backup = await createPgOpsBackup({
      workspace: workspaceId,
      out: stamp,
      reason: "smoke-ops-pg-backup",
      updateLatest: false
    });
    assert(backup.ok, "backup must succeed");
    assert(backup.format === "sql-inserts", "scoped backup uses SQL export");

    // Mutate: wipe ops tables for this workspace
    const wipeClient = await pool.connect();
    try {
      await wipeClient.query("BEGIN");
      for (const table of [
        "workspace_ops_appointment_visit_meta",
        "workspace_ops_appointment_visits",
        "workspace_ops_appointment_line_items",
        "workspace_ops_appointments",
        "workspace_ops_expenses",
        "workspace_ops_specific_days",
        "workspace_ops_closed_days",
        "workspace_ops_working_hours",
        "workspace_ops_service_providers",
        "workspace_ops_services",
        "workspace_ops_staff_specific_days",
        "workspace_ops_staff_closed_days",
        "workspace_ops_staff_working_hours",
        "workspace_ops_staff",
        "workspace_ops_service_categories",
        "workspace_ops_customers",
        "workspace_ops_customer_categories",
        "workspace_ops_medical_departments",
        "workspace_ops_activity_labels",
        "workspace_ops_social_links",
        "workspace_staff_links",
        "workspace_ops_profiles"
      ]) {
        const exists = await wipeClient.query("SELECT to_regclass($1) AS reg", [table]);
        if (exists.rows[0]?.reg) {
          await wipeClient.query(`DELETE FROM ${table} WHERE workspace_id = $1`, [workspaceId]);
        }
      }
      await wipeClient.query("COMMIT");
    } catch (error) {
      await wipeClient.query("ROLLBACK");
      throw error;
    } finally {
      wipeClient.release();
    }

    const afterWipe = await pool.connect();
    try {
      const has = await workspaceOpsPg.hasProfile(afterWipe, workspaceId);
      assert(!has, "profile must be gone after wipe");
    } finally {
      afterWipe.release();
    }

    const restored = await restorePgOpsBackup(path.join(backupsRoot, stamp), {
      workspace: workspaceId
    });
    assert(restored.ok, "restore must succeed");

    const verify = await pool.connect();
    try {
      const emptyFactory = () => ({
        customerCategories: [],
        customers: [],
        staff: [],
        serviceCategories: [],
        services: [],
        workingHours: [],
        closedDays: [],
        specificDays: [],
        expenses: [],
        appointments: [],
        medicalDepartments: [],
        bookingPage: {},
        calendarPreferences: {},
        notifications: {},
        activityLabels: {},
        activityLabelsI18n: null
      });
      const after = await workspaceOpsPg.loadStore(verify, workspaceId, emptyFactory);
      const audit = auditStore(after);
      assert(audit.ok, `restored store orphans: ${JSON.stringify(audit.orphans)}`);
      const comparison = compareStores(fixture, after, {
        leftLabel: "fixture-json",
        rightLabel: "pg-restored"
      });
      assert(
        comparison.ok,
        `JSON↔PG compare after restore failed: ${JSON.stringify(comparison.diffs)}`
      );
      return {
        ok: true,
        workspaceId,
        stamp,
        counts: entityCounts(after),
        backupPath: backup.path,
        compareOk: true
      };
    } finally {
      verify.release();
    }
  } finally {
    cleanupSession(stamp);
    const cleanup = await pool.connect();
    try {
      await cleanup.query("DELETE FROM workspace_staff_links WHERE workspace_id = $1", [
        workspaceId
      ]).catch(() => {});
      await cleanup.query("DELETE FROM workspace_ops_profiles WHERE workspace_id = $1", [
        workspaceId
      ]).catch(() => {});
      await cleanup.query("DELETE FROM workspaces WHERE id = $1", [workspaceId]).catch(() => {});
    } finally {
      cleanup.release();
    }
  }
}

async function main() {
  const checks = [];
  assert(OPS_PG_TABLES.includes("workspace_ops_profiles"), "profiles table listed");
  assert(OPS_PG_TABLES.includes("workspace_ops_appointments"), "appointments table listed");
  assert(OPS_PG_TABLES.includes("workspace_staff_links"), "staff links table listed");
  assert(
    OPS_PG_TABLES.every((name) => /^workspace_(ops_|staff_links)/.test(name)),
    "only ops/staff-link tables in backup scope"
  );
  checks.push("table-inventory");

  // Script must refuse restore without target (unit-level)
  let refused = false;
  try {
    process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://invalid";
    await restorePgOpsBackup(null);
  } catch (error) {
    refused = /explicit|refused|required/i.test(String(error.message || error));
  }
  assert(refused, "restore without target must refuse");
  checks.push("restore-refuses-without-target");

  if (!postgresReady()) {
    const result = {
      ok: true,
      suite: "smoke-ops-pg-backup",
      skipped: true,
      reason:
        "No live Postgres (set MAW3ED_STORAGE=postgres and DATABASE_URL). Table inventory + restore-safety checks still passed.",
      checks,
      ownerHint:
        "On Sam-PC: MAW3ED_STORAGE=postgres DATABASE_URL=postgresql://...@127.0.0.1:5433/maw3ed npm run test:ops-pg-backup"
    };
    console.log(JSON.stringify(result));
    return;
  }

  // db.js caches pool at require-time — set env before requiring
  const { Pool } = require("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // Monkey-patch workspaceOpsPg's db pool by ensuring env matches before require
  process.env.MAW3ED_STORAGE = "postgres";
  // Clear cached modules that captured empty pool
  delete require.cache[require.resolve("../db")];
  delete require.cache[require.resolve("../workspaceOpsPg")];

  const wantMigrateTwice =
    process.argv.includes("--migrate-twice") ||
    process.env.MAW3ED_SMOKE_MIGRATE_TWICE === "1";

  let migrateTwice = null;
  if (wantMigrateTwice) {
    migrateTwice = await runMigrateTwice(pool);
    checks.push("migrate-twice");
  }

  const drill = await runBackupRestoreDrill(pool);
  checks.push("pg-backup-restore-compare");

  await pool.end();

  const result = {
    ok: true,
    suite: "smoke-ops-pg-backup",
    skipped: false,
    checks,
    migrateTwice,
    drill: {
      workspaceId: drill.workspaceId,
      compareOk: drill.compareOk,
      counts: drill.counts
    }
  };
  console.log(JSON.stringify(result));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(
      JSON.stringify({
        ok: false,
        suite: "smoke-ops-pg-backup",
        error: String(error.message || error),
        stack: error.stack
      })
    );
    process.exit(1);
  });
}
