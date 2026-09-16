let Pool = null;
try {
  ({ Pool } = require("pg"));
} catch {
  Pool = null;
}

const databaseConfigured =
  process.env.MAW3ED_STORAGE === "postgres" &&
  Boolean(process.env.DATABASE_URL) &&
  Boolean(Pool);

const pool = databaseConfigured
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined
    })
  : null;

if (process.env.MAW3ED_STORAGE === "postgres" && process.env.DATABASE_URL && !Pool) {
  console.warn("[db] pg package missing or broken — falling back to local-memory storage");
}

module.exports = {
  pool,
  databaseConfigured,
  query: (text, params) => {
    if (!pool) return Promise.reject(new Error("DATABASE_URL is not configured; Maw3ed is running in local mode"));
    return pool.query(text, params);
  }
};
