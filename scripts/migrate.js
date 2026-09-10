const fs = require("fs");
const path = require("path");
const { pool } = require("../db");

async function main() {
  const migration = fs.readFileSync(path.join(__dirname, "..", "db", "migrations", "001_initial.sql"), "utf8");
  await pool.query(migration);
  console.log("Maw3ed migration 001 applied.");
  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});