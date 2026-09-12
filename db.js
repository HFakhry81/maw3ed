try { require("dotenv").config(); } catch {}
const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to run Maw3ed");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined
});

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params)
};