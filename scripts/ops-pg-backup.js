#!/usr/bin/env node
/**
 * PostgreSQL backup / restore for Maw3ed operational tables.
 *
 * Scope (data only):
 *   - workspace_ops_* (profiles + child tables from migration 010+)
 *   - workspace_staff_links (migration 012)
 *
 * Safety:
 *   - Backup never mutates the database.
 *   - Restore requires an explicit --restore=<dir> (or --restore-latest with a
 *     prior ops:pg-backup). It will not truncate/wipe without that target.
 *   - Optional --workspace=<id> scopes dump/restore to one tenant.
 *
 * Prefer pg_dump/pg_restore when available; fall back to SQL INSERT export via `pg`.
 *
 * Usage:
 *   node scripts/ops-pg-backup.js --backup [--workspace=id] [--out=dir]
 *   node scripts/ops-pg-backup.js --restore=data/backups/pg-ops/<stamp>
 *   node scripts/ops-pg-backup.js --restore-latest
 *   node scripts/ops-pg-backup.js --list
 *   node scripts/ops-pg-backup.js --tables
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const backupsRoot = path.join(root, "data", "backups", "pg-ops");
const latestPointerPath = path.join(backupsRoot, "latest.json");

/** Child tables first for DELETE; profiles last. Dump order reverses for INSERT. */
const WORKSPACE_OPS_CHILD_TABLES = [
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
  "workspace_ops_social_links"
];

const OPS_PG_TABLES = [
  "workspace_ops_profiles",
  ...WORKSPACE_OPS_CHILD_TABLES,
  "workspace_staff_links"
];

function stampNow() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function rel(p) {
  return path.relative(root, p);
}

function parseArgs(argv) {
  const args = {
    backup: false,
    restore: null,
    restoreLatest: false,
    list: false,
    tables: false,
    workspace: null,
    out: null,
    json: false,
    reason: "manual"
  };
  for (const item of argv) {
    if (item === "--backup") args.backup = true;
    else if (item === "--restore-latest") args.restoreLatest = true;
    else if (item === "--list") args.list = true;
    else if (item === "--tables") args.tables = true;
    else if (item === "--json") args.json = true;
    else if (item.startsWith("--restore=")) args.restore = item.slice("--restore=".length);
    else if (item.startsWith("--workspace=")) args.workspace = item.slice("--workspace=".length);
    else if (item.startsWith("--out=")) args.out = item.slice("--out=".length);
    else if (item.startsWith("--reason=")) args.reason = item.slice("--reason=".length);
  }
  return args;
}

function requireDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url || url.includes("CHANGE_ME")) {
    throw new Error(
      "DATABASE_URL is required for PG ops backup/restore (set MAW3ED_STORAGE=postgres too)."
    );
  }
  return url;
}

function hasBinary(name) {
  const result = spawnSync(name, ["--version"], { encoding: "utf8" });
  return result.status === 0;
}

function writeMeta(sessionDir, meta) {
  fs.writeFileSync(path.join(sessionDir, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
}

function updateLatest(meta) {
  ensureDir(backupsRoot);
  fs.writeFileSync(latestPointerPath, `${JSON.stringify(meta, null, 2)}\n`);
}

function listSessions() {
  if (!fs.existsSync(backupsRoot)) return [];
  return fs
    .readdirSync(backupsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const metaPath = path.join(backupsRoot, entry.name, "meta.json");
      let meta = { stamp: entry.name };
      if (fs.existsSync(metaPath)) {
        try {
          meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
        } catch {
          /* ignore */
        }
      }
      return meta;
    })
    .sort((a, b) => String(b.stamp || "").localeCompare(String(a.stamp || "")));
}

async function withPgClient(fn) {
  const { Pool } = require("pg");
  const pool = new Pool({ connectionString: requireDatabaseUrl() });
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
    await pool.end();
  }
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (value instanceof Date) return `'${value.toISOString().replace(/'/g, "''")}'`;
  if (typeof value === "object") {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function exportTableSql(client, table, workspaceId) {
  const hasWorkspace =
    table.startsWith("workspace_ops_") || table === "workspace_staff_links";
  let result;
  if (workspaceId && hasWorkspace) {
    result = await client.query(`SELECT * FROM ${table} WHERE workspace_id = $1`, [workspaceId]);
  } else {
    result = await client.query(`SELECT * FROM ${table}`);
  }
  const rows = result.rows;
  const lines = [`-- table: ${table} rows=${rows.length}`];
  for (const row of rows) {
    const cols = Object.keys(row);
    if (!cols.length) continue;
    const values = cols.map((col) => sqlLiteral(row[col]));
    lines.push(
      `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${values.join(", ")});`
    );
  }
  return { table, rowCount: rows.length, sql: `${lines.join("\n")}\n` };
}

async function backupSqlExport(options = {}) {
  const stamp = options.stamp || stampNow();
  const sessionDir = path.isAbsolute(options.out || "")
    ? options.out
    : path.join(backupsRoot, options.out || stamp);
  ensureDir(sessionDir);
  const sqlDir = path.join(sessionDir, "sql");
  ensureDir(sqlDir);

  const tableStats = await withPgClient(async (client) => {
    const stats = [];
    // Dump parents before children for INSERT-friendly restores.
    const dumpOrder = [
      "workspace_ops_profiles",
      ...[...WORKSPACE_OPS_CHILD_TABLES].reverse(),
      "workspace_staff_links"
    ];
    for (const table of dumpOrder) {
      const exists = await client.query("SELECT to_regclass($1) AS reg", [table]);
      if (!exists.rows[0]?.reg) {
        stats.push({ table, rowCount: 0, skipped: true });
        continue;
      }
      const exported = await exportTableSql(client, table, options.workspace || null);
      fs.writeFileSync(path.join(sqlDir, `${table}.sql`), exported.sql, "utf8");
      stats.push({ table, rowCount: exported.rowCount, skipped: false });
    }
    return stats;
  });

  const meta = {
    name: "maw3ed-pg-ops",
    format: "sql-inserts",
    reason: options.reason || "manual",
    createdAt: new Date().toISOString(),
    stamp: path.basename(sessionDir),
    workspaceId: options.workspace || null,
    tables: OPS_PG_TABLES,
    tableStats,
    path: rel(sessionDir),
    method: "node-pg"
  };
  writeMeta(sessionDir, meta);
  if (options.updateLatest !== false) updateLatest(meta);
  return { ok: true, ...meta };
}

function backupWithPgDump(options = {}) {
  const stamp = options.stamp || stampNow();
  const sessionDir = path.isAbsolute(options.out || "")
    ? options.out
    : path.join(backupsRoot, options.out || stamp);
  ensureDir(sessionDir);
  const dumpFile = path.join(sessionDir, "ops.dump");
  const url = requireDatabaseUrl();

  const args = [
    "--dbname",
    url,
    "--format=custom",
    "--no-owner",
    "--no-acl",
    "--data-only",
    "--file",
    dumpFile
  ];
  for (const table of OPS_PG_TABLES) {
    args.push("--table", table);
  }
  if (options.workspace) {
    // pg_dump cannot filter by column; fall back to SQL export for scoped backup.
    return null;
  }

  const result = spawnSync("pg_dump", args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`pg_dump failed: ${result.stderr || result.stdout || "unknown error"}`);
  }

  const meta = {
    name: "maw3ed-pg-ops",
    format: "pg_dump-custom",
    reason: options.reason || "manual",
    createdAt: new Date().toISOString(),
    stamp: path.basename(sessionDir),
    workspaceId: null,
    tables: OPS_PG_TABLES,
    dumpFile: rel(dumpFile),
    path: rel(sessionDir),
    method: "pg_dump"
  };
  writeMeta(sessionDir, meta);
  if (options.updateLatest !== false) updateLatest(meta);
  return { ok: true, ...meta };
}

async function createPgOpsBackup(options = {}) {
  requireDatabaseUrl();
  if (!options.workspace && hasBinary("pg_dump")) {
    try {
      const dumped = backupWithPgDump(options);
      if (dumped) return dumped;
    } catch (error) {
      console.warn(`[WARN] pg_dump path failed (${error.message}); falling back to SQL export`);
    }
  }
  return backupSqlExport(options);
}

async function clearOpsTables(client, workspaceId) {
  // Children first, then profiles, then staff links (links FK to staff).
  const deleteOrder = [
    ...WORKSPACE_OPS_CHILD_TABLES,
    "workspace_staff_links",
    "workspace_ops_profiles"
  ];
  for (const table of deleteOrder) {
    const exists = await client.query("SELECT to_regclass($1) AS reg", [table]);
    if (!exists.rows[0]?.reg) continue;
    if (workspaceId) {
      await client.query(`DELETE FROM ${table} WHERE workspace_id = $1`, [workspaceId]);
    } else {
      await client.query(`DELETE FROM ${table}`);
    }
  }
}

async function restoreFromSqlDir(sessionDir, options = {}) {
  const sqlDir = path.join(sessionDir, "sql");
  if (!fs.existsSync(sqlDir)) {
    throw new Error(`SQL restore directory missing: ${rel(sqlDir)}`);
  }
  const metaPath = path.join(sessionDir, "meta.json");
  const meta = fs.existsSync(metaPath)
    ? JSON.parse(fs.readFileSync(metaPath, "utf8"))
    : {};
  const workspaceId = options.workspace || meta.workspaceId || null;

  await withPgClient(async (client) => {
    await client.query("BEGIN");
    try {
      await clearOpsTables(client, workspaceId);
      const dumpOrder = [
        "workspace_ops_profiles",
        ...[...WORKSPACE_OPS_CHILD_TABLES].reverse(),
        "workspace_staff_links"
      ];
      for (const table of dumpOrder) {
        const filePath = path.join(sqlDir, `${table}.sql`);
        if (!fs.existsSync(filePath)) continue;
        const sql = fs.readFileSync(filePath, "utf8");
        if (sql.trim()) await client.query(sql);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });

  return {
    ok: true,
    method: "sql-inserts",
    path: rel(sessionDir),
    workspaceId
  };
}

async function restoreFromPgDump(sessionDir, options = {}) {
  const dumpFile = path.join(sessionDir, "ops.dump");
  if (!fs.existsSync(dumpFile)) {
    throw new Error(`pg_restore dump missing: ${rel(dumpFile)}`);
  }
  if (!hasBinary("pg_restore")) {
    throw new Error("pg_restore binary not available");
  }
  const url = requireDatabaseUrl();
  // Wipe scoped tables first, then restore data-only dump.
  await withPgClient(async (client) => {
    await client.query("BEGIN");
    try {
      await clearOpsTables(client, options.workspace || null);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });

  const args = [
    "--dbname",
    url,
    "--data-only",
    "--no-owner",
    "--no-acl",
    "--exit-on-error",
    dumpFile
  ];
  const result = spawnSync("pg_restore", args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`pg_restore failed: ${result.stderr || result.stdout || "unknown error"}`);
  }
  return { ok: true, method: "pg_restore", path: rel(sessionDir) };
}

async function restorePgOpsBackup(target, options = {}) {
  requireDatabaseUrl();
  if (!target) {
    throw new Error("Restore refused: pass --restore=<session-dir> or --restore-latest (explicit target required).");
  }

  let sessionDir = target;
  if (target === "latest" || options.fromLatest) {
    if (!fs.existsSync(latestPointerPath)) {
      throw new Error("No latest PG ops backup pointer found. Run --backup first.");
    }
    const latest = JSON.parse(fs.readFileSync(latestPointerPath, "utf8"));
    sessionDir = path.isAbsolute(latest.path)
      ? latest.path
      : path.join(root, latest.path);
  } else if (!path.isAbsolute(sessionDir)) {
    const asRepo = path.join(root, sessionDir);
    const asStamp = path.join(backupsRoot, sessionDir);
    if (fs.existsSync(asRepo)) sessionDir = asRepo;
    else if (fs.existsSync(asStamp)) sessionDir = asStamp;
    else sessionDir = asRepo;
  }

  if (!fs.existsSync(sessionDir)) {
    throw new Error(`Restore target not found: ${sessionDir}`);
  }

  const metaPath = path.join(sessionDir, "meta.json");
  const meta = fs.existsSync(metaPath)
    ? JSON.parse(fs.readFileSync(metaPath, "utf8"))
    : {};
  if (meta.format === "pg_dump-custom" || fs.existsSync(path.join(sessionDir, "ops.dump"))) {
    return restoreFromPgDump(sessionDir, options);
  }
  return restoreFromSqlDir(sessionDir, options);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.tables) {
    const payload = { ok: true, tables: OPS_PG_TABLES };
    console.log(args.json ? JSON.stringify(payload, null, 2) : OPS_PG_TABLES.join("\n"));
    return;
  }

  if (args.list) {
    const sessions = listSessions();
    if (args.json) console.log(JSON.stringify({ ok: true, sessions }, null, 2));
    else {
      if (!sessions.length) console.log("[LIST] no pg-ops backups yet");
      for (const session of sessions) {
        console.log(
          `[LIST] ${session.stamp} format=${session.format || "?"} tables=${(session.tables || []).length} path=${session.path || ""}`
        );
      }
    }
    return;
  }

  if (args.backup) {
    // load-env so local .env can supply DATABASE_URL when not exported
    try {
      require("./load-env").loadEnv();
    } catch {
      /* optional */
    }
    process.env.MAW3ED_STORAGE = process.env.MAW3ED_STORAGE || "postgres";
    const result = await createPgOpsBackup({
      workspace: args.workspace,
      out: args.out,
      reason: args.reason
    });
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(
        `[BACKUP] ok format=${result.format} method=${result.method} path=${result.path}`
      );
      for (const stat of result.tableStats || []) {
        if (stat.skipped) console.log(`  - ${stat.table}: skipped (missing)`);
        else console.log(`  - ${stat.table}: ${stat.rowCount} row(s)`);
      }
    }
    return;
  }

  if (args.restore || args.restoreLatest) {
    try {
      require("./load-env").loadEnv();
    } catch {
      /* optional */
    }
    process.env.MAW3ED_STORAGE = process.env.MAW3ED_STORAGE || "postgres";
    const result = await restorePgOpsBackup(args.restore || "latest", {
      fromLatest: args.restoreLatest,
      workspace: args.workspace
    });
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else console.log(`[RESTORE] ok method=${result.method} path=${result.path}`);
    return;
  }

  console.error(`Usage:
  node scripts/ops-pg-backup.js --backup [--workspace=id] [--out=stamp] [--json]
  node scripts/ops-pg-backup.js --restore=data/backups/pg-ops/<stamp>
  node scripts/ops-pg-backup.js --restore-latest
  node scripts/ops-pg-backup.js --list
  node scripts/ops-pg-backup.js --tables`);
  process.exit(1);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[ERROR] ${error.message || error}`);
    process.exit(1);
  });
}

module.exports = {
  OPS_PG_TABLES,
  WORKSPACE_OPS_CHILD_TABLES,
  backupsRoot,
  createPgOpsBackup,
  restorePgOpsBackup,
  listSessions,
  hasBinary
};
