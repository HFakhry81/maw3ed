const fs = require("fs");
const path = require("path");
require("./load-env");

const root = path.join(__dirname, "..");

async function main() {
  console.log("[INFO] Resetting operational data and state files...");

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

  try {
    require("../opsStore").resetOpsData();
    console.log("[SUCCESS] Local ops store reset.");
  } catch (err) {
    console.warn(`[WARN] Ops store reset skipped: ${err.message}`);
  }

  const connectionString = process.env.DATABASE_URL;
  if (process.env.MAW3ED_STORAGE === "postgres" && connectionString && !connectionString.includes("CHANGE_ME")) {
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
          IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'slot_holds') THEN
            TRUNCATE TABLE slot_holds;
          END IF;
        END $$;
      `);
      await pool.end();
      console.log("[SUCCESS] Database operational tables cleaned.");
    } catch (dbErr) {
      console.warn(`[WARN] DB ops cleanup skipped gracefully: ${dbErr.message}`);
    }
  } else {
    console.log("[INFO] Postgres cleanup skipped (local storage or no DATABASE_URL).");
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
