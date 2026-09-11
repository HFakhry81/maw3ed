const fs = require("fs");
const path = require("path");
const { pool } = require("../db");

async function main() {
  const directory = path.join(__dirname, "..", "db", "migrations");
  const files = fs.readdirSync(directory).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    await pool.query(fs.readFileSync(path.join(directory, file), "utf8"));
    console.log(`Maw3ed migration ${file} applied.`);
  }
  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});