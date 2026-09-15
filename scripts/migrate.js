const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

// Load .env automatically
const envPath = path.join(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  envContent.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const [key, ...val] = trimmed.split("=");
      if (key && val.length > 0) {
        process.env[key.trim()] = val.join("=").trim();
      }
    }
  });
}

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString || connectionString.includes("CHANGE_ME")) {
    console.error("\n[ERROR] DATABASE_URL is missing or invalid in .env file.\n");
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
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[FATAL ERROR]", err.message);
  process.exit(1);
});