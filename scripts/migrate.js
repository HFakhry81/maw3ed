const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const { loaded } = require("./load-env");

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (loaded.mode === "local" && process.env.MAW3ED_STORAGE !== "postgres") {
    console.log("[INFO] Local mode without Postgres — migrate skipped.");
    process.exit(0);
  }

  if (!connectionString || connectionString.includes("CHANGE_ME")) {
    console.error("\n[ERROR] DATABASE_URL is missing or invalid for this environment.\n");
    process.exit(1);
  }

  const pool = new Pool({ connectionString });
  const migrationsDir = path.join(__dirname, "../db/migrations");

  try {
    if (!fs.existsSync(migrationsDir)) {
      console.error(`[ERROR] Migrations directory not found at: ${migrationsDir}`);
      process.exit(1);
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    if (files.length === 0) {
      console.log("[WARN] No .sql migration files found in db/migrations");
      process.exit(0);
    }

    console.log(`[INFO] Found ${files.length} migration file(s). Executing in order...`);

    const client = await pool.connect();
    try {
      for (const file of files) {
        const filePath = path.join(migrationsDir, file);
        console.log(`[EXEC] Running migration: ${file}`);
        const sql = fs.readFileSync(filePath, "utf8");

        await client.query("BEGIN;");
        await client.query(sql);
        await client.query("COMMIT;");

        console.log(`[SUCCESS] Completed: ${file}`);
      }
      console.log("\n[SUCCESS] All database migrations applied successfully!");
    } catch (err) {
      await client.query("ROLLBACK;");
      throw err;
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

main().catch((err) => {
  console.error("[FATAL ERROR]", err.message);
  process.exit(1);
});