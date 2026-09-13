const { Pool } = require("pg");

const databaseConfigured = process.env.MAW3ED_STORAGE === "postgres" && Boolean(process.env.DATABASE_URL);

const pool = databaseConfigured ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined
}) : null;

module.exports = {
  pool,
  databaseConfigured,
  query: (text, params) => {
    if (!pool) return Promise.reject(new Error("DATABASE_URL is not configured; Maw3ed is running in local mode"));
    return pool.query(text, params);
  }
};