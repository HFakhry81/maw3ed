const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

// Load .env safely
const envPath = path.join(root, ".env");
if (fs.existsSync(envPath)) {
  try {
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
  } catch (e) {}
}

async function main() {
  console.log("[INFO] Resetting operational data and state files...");

  // 1. Safe file cleanup
  const dataDir = path.join(root, "data");
  if (fs.existsSync(dataDir)) {
    const filesToReset = [
      "last-refresh-report.json",
      "ops-state.json",
      "active-session.json"
    ];

    for (const file of filesToReset) {
      const targetPath = path.join(dataDir, file);
      try {
        if (fs.existsSync(targetPath)) {
          fs.unlinkSync(targetPath);
          console.log(`[CLEAN] Removed state file: ${file}`);
        }
      } catch (err) {
        console.warn(`[WARN] Skipping file ${file}: ${err.message}`);
      }
    }
  }

  // 2. Dynamic require for PG to avoid script crashes
  const connectionString = process.env.DATABASE_URL;
  if (connectionString && !connectionString.includes("CHANGE_ME")) {
    try {
      const { Pool } = require("pg");
      const isLocal = connectionString.includes("localhost") || connectionString.includes("127.0.0.1");
      const pool = new Pool({
        connectionString,
        ssl: isLocal ? false : { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000
      });

      await pool.query(`
        DO $$ 
        BEGIN 
          IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'appointments') THEN
            TRUNCATE TABLE appointments CASCADE;
          END IF;
        END $$;
      `);
      await pool.end();
      console.log("[SUCCESS] Database operational tables cleaned.");
    } catch (dbErr) {
      console.warn(`[WARN] DB ops cleanup skipped gracefully: ${dbErr.message}`);
    }
  } else {
    console.log("[INFO] No valid DATABASE_URL found. Skipped DB ops cleanup.");
  }

  console.log("[SUCCESS] Operational data reset completed.");
}

main()
  .catch((err) => {
    console.warn("[WARN] Non-fatal error during ops data reset:", err.message);
  })
  .finally(() => {
    process.exit(0);
  });