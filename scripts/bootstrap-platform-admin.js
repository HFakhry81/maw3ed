#!/usr/bin/env node
require("./load-env");

const crypto = require("crypto");
const { databaseConfigured, pool } = require("../db");

const bootstrapClerkUserId = String(process.env.MAW3ED_BOOTSTRAP_PLATFORM_ADMIN_CLERK_ID || "").trim();
const operator = String(process.env.MAW3ED_BOOTSTRAP_OPERATOR || "").trim();
const reason = String(process.env.MAW3ED_BOOTSTRAP_REASON || "").trim();

async function main() {
  if (process.env.MAW3ED_ENV !== "production") {
    throw new Error("Platform-admin bootstrap is allowed only with MAW3ED_ENV=production");
  }
  if (!databaseConfigured || !pool) {
    throw new Error("Platform-admin bootstrap requires configured PostgreSQL");
  }
  if (!bootstrapClerkUserId || !operator || !reason) {
    throw new Error("Set MAW3ED_BOOTSTRAP_PLATFORM_ADMIN_CLERK_ID, MAW3ED_BOOTSTRAP_OPERATOR, and MAW3ED_BOOTSTRAP_REASON");
  }
  if (operator.length > 200 || reason.length > 500) {
    throw new Error("Bootstrap operator or reason is too long");
  }

  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query("BEGIN");
    transactionOpen = true;
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["maw3ed-platform-admin-bootstrap"]);
    await client.query("LOCK TABLE app_users IN SHARE ROW EXCLUSIVE MODE");

    const existingAdmin = await client.query(
      "SELECT id FROM app_users WHERE platform_role IS NOT NULL OR is_platform_admin = TRUE LIMIT 1"
    );
    if (existingAdmin.rows[0]) {
      throw new Error("A platform administrator already exists; bootstrap is one-time and cannot replace one");
    }

    const user = (
      await client.query(
        "SELECT id, status FROM app_users WHERE clerk_user_id = $1 FOR UPDATE",
        [bootstrapClerkUserId]
      )
    ).rows[0];
    if (!user || user.status !== "active") {
      throw new Error("The specified Clerk user must already exist and be active");
    }

    const updated = await client.query(
      `UPDATE app_users
       SET platform_role = 'super_admin', updated_at = NOW()
       WHERE id = $1 AND platform_role IS NULL AND is_platform_admin = FALSE
       RETURNING id`,
      [user.id]
    );
    if (!updated.rows[0]) throw new Error("The selected user could not be promoted safely");

    await client.query(
      `INSERT INTO platform_audit_events
        (id, actor_user_id, action, target_type, target_id, details, old_value, new_value, ip_address)
       VALUES ($1, NULL, 'platform_admin_bootstrapped', 'user', $2, $3::jsonb, $4::jsonb, $5::jsonb, NULL)`,
      [
        `bootstrap_${crypto.randomUUID()}`,
        user.id,
        JSON.stringify({ operator, reason, method: "one-time-production-script" }),
        JSON.stringify({ platform_role: null }),
        JSON.stringify({ platform_role: "super_admin" })
      ]
    );

    await client.query("COMMIT");
    transactionOpen = false;
    console.log(JSON.stringify({ ok: true, action: "platform_admin_bootstrapped", userId: user.id }));
  } catch (error) {
    if (transactionOpen) await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }));
  process.exitCode = 1;
});
