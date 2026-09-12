const { Client } = require("pg");

async function main() {
  const client = new Client({
    host: "127.0.0.1",
    port: 5433,
    user: "postgres",
    password: "123456",
    database: "postgres"
  });

  await client.connect();
  console.log("Connected to PostgreSQL on port 5433");

  const res = await client.query("SELECT 1 FROM pg_database WHERE datname = 'maw3ed'");
  if (res.rowCount === 0) {
    await client.query("CREATE DATABASE maw3ed");
    console.log("Created database: maw3ed");
  } else {
    console.log("Database maw3ed already exists.");
  }

  await client.query("ALTER USER postgres WITH PASSWORD '123456'");
  console.log("Superuser postgres password set to: 123456");

  await client.end();
}

main().catch(console.error);
