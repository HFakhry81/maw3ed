const fs = require("fs");
const path = require("path");

// Lazy-load pg / load-env only when applying against a live database so
// integrity smokes can import planning helpers without node_modules/pg.

const MIGRATIONS_DIR = path.join(__dirname, "../db/migrations");
const SCHEMA_MIGRATIONS_DDL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checksum TEXT
);
`;

function listMigrationFiles(migrationsDir = MIGRATIONS_DIR) {
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found at: ${migrationsDir}`);
  }
  return fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

function readMigrationFile(migrationsDir, filename) {
  const filePath = path.join(migrationsDir, filename);
  const sql = fs.readFileSync(filePath, "utf8");
  return { filename, filePath, sql };
}

function checksum(sql) {
  let hash = 0;
  for (let i = 0; i < sql.length; i += 1) {
    hash = (hash * 31 + sql.charCodeAt(i)) >>> 0;
  }
  return `fnv1a32:${hash.toString(16)}`;
}

function planMigrations(files, appliedSet) {
  const applied = appliedSet instanceof Set ? appliedSet : new Set(appliedSet || []);
  const pending = [];
  const skipped = [];
  for (const filename of files) {
    if (applied.has(filename)) skipped.push(filename);
    else pending.push(filename);
  }
  return { pending, skipped };
}

async function ensureSchemaMigrationsTable(client) {
  await client.query(SCHEMA_MIGRATIONS_DDL);
}

async function loadAppliedMigrations(client) {
  const result = await client.query("SELECT filename FROM schema_migrations ORDER BY filename");
  return new Set(result.rows.map((row) => row.filename));
}

async function applyPendingMigrations(client, options = {}) {
  const migrationsDir = options.migrationsDir || MIGRATIONS_DIR;
  const dryRun = Boolean(options.dryRun);
  const files = listMigrationFiles(migrationsDir);

  await ensureSchemaMigrationsTable(client);
  const applied = await loadAppliedMigrations(client);
  const { pending, skipped } = planMigrations(files, applied);

  const appliedNow = [];
  for (const filename of pending) {
    const { sql } = readMigrationFile(migrationsDir, filename);
    const sum = checksum(sql);
    if (dryRun) {
      console.log(`[DRY-RUN] Would apply: ${filename}`);
      appliedNow.push({ filename, checksum: sum, dryRun: true });
      continue;
    }

    console.log(`[EXEC] Running migration: ${filename}`);
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2) ON CONFLICT (filename) DO NOTHING",
        [filename, sum]
      );
      await client.query("COMMIT");
      console.log(`[SUCCESS] Completed: ${filename}`);
      appliedNow.push({ filename, checksum: sum, dryRun: false });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }

  return {
    ok: true,
    total: files.length,
    skipped: skipped.length,
    pending: pending.length,
    applied: appliedNow.length,
    skippedFiles: skipped,
    pendingFiles: pending,
    appliedNow,
    dryRun
  };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const { loaded } = require("./load-env");
  const connectionString = process.env.DATABASE_URL;

  if (loaded.mode === "local" && process.env.MAW3ED_STORAGE !== "postgres") {
    console.log("[INFO] Local mode without Postgres — migrate skipped.");
    process.exit(0);
  }

  if (!connectionString || connectionString.includes("CHANGE_ME")) {
    console.error("\n[ERROR] DATABASE_URL is missing or invalid for this environment.\n");
    process.exit(1);
  }

  let Pool;
  try {
    ({ Pool } = require("pg"));
  } catch (error) {
    console.error("[ERROR] Package `pg` is required to run migrations:", error.message);
    process.exit(1);
  }

  const pool = new Pool({ connectionString });
  try {
    const files = listMigrationFiles();
    if (files.length === 0) {
      console.log("[WARN] No .sql migration files found in db/migrations");
      process.exit(0);
    }

    console.log(`[INFO] Found ${files.length} migration file(s). Ledger-aware apply...`);
    const client = await pool.connect();
    try {
      const result = await applyPendingMigrations(client, { dryRun });
      if (dryRun) {
        console.log(
          `\n[SUCCESS] Dry-run complete. pending=${result.pending} skipped=${result.skipped}`
        );
      } else if (result.applied === 0) {
        console.log("\n[SUCCESS] No pending migrations — schema already up to date.");
      } else {
        console.log(
          `\n[SUCCESS] Applied ${result.applied} migration(s); skipped ${result.skipped} already recorded.`
        );
      }
      if (process.argv.includes("--json")) {
        console.log(JSON.stringify(result, null, 2));
      }
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("[ERROR] Migration execution failed:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("[FATAL ERROR]", err.message);
    process.exit(1);
  });
}

module.exports = {
  MIGRATIONS_DIR,
  SCHEMA_MIGRATIONS_DDL,
  listMigrationFiles,
  readMigrationFile,
  checksum,
  planMigrations,
  ensureSchemaMigrationsTable,
  loadAppliedMigrations,
  applyPendingMigrations
};
