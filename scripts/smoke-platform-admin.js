#!/usr/bin/env node
/**
 * Smoke checks for platform admin governance (requires Postgres).
 * Usage: node scripts/smoke-platform-admin.js
 */
require("./load-env");
const { query, databaseConfigured, pool } = require("../db");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  if (!databaseConfigured) {
    console.log(JSON.stringify({ ok: true, skipped: true, reason: "postgres not configured" }, null, 2));
    return;
  }

  const client = await pool.connect();
  let transactionStarted = false;
  try {
    await client.query("BEGIN");
    transactionStarted = true;
    const runQuery = (text, params) => client.query(text, params);

    // Keep this integration smoke read-only, including its trigger and confirmation checks.
    const tables = await runQuery(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])`,
      [["billing_transactions", "subscription_invoices", "platform_settlements", "admin_action_confirmations"]]
    );
    assert(tables.rows.length === 4, "missing governance tables — run npm run migrate");

    const cols = await runQuery(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'app_users' AND column_name = 'platform_role'`
    );
    assert(cols.rows[0], "app_users.platform_role missing");

    const auditCols = await runQuery(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'platform_audit_events'
         AND column_name = ANY($1::text[])`,
      [["old_value", "new_value", "ip_address"]]
    );
    assert(auditCols.rows.length === 3, "audit enrichment columns missing");

    const auditId = `audit_smoke_${Date.now()}`;
    await runQuery(
      `INSERT INTO platform_audit_events (id, actor_user_id, action, target_type, target_id, details)
       VALUES ($1, NULL, 'smoke_insert', 'smoke', '1', '{}'::jsonb)`,
      [auditId]
    );
    await runQuery("SAVEPOINT before_audit_update");
    let blocked = false;
    try {
      await runQuery(`UPDATE platform_audit_events SET action = 'tampered' WHERE id = $1`, [auditId]);
    } catch (error) {
      await runQuery("ROLLBACK TO SAVEPOINT before_audit_update");
      blocked = /immutable/i.test(error.message);
    }
    assert(blocked, "audit update should be blocked by immutability trigger");

    const users = await runQuery(
      `SELECT id FROM app_users WHERE is_platform_admin = TRUE OR platform_role IS NOT NULL LIMIT 1`
    );
    if (users.rows[0]) {
      const adminId = users.rows[0].id;
      const confirmId = `confirm_smoke_${Date.now()}`;
      await runQuery(
        `INSERT INTO admin_action_confirmations (id, admin_id, action, target_id, challenge, expires_at)
         VALUES ($1, $2, 'smoke_action', 'target-1', 'CONFIRM', NOW() + INTERVAL '5 minutes')`,
        [confirmId, adminId]
      );
      const row = (await runQuery(`SELECT * FROM admin_action_confirmations WHERE id = $1`, [confirmId])).rows[0];
      assert(row && row.challenge === "CONFIRM", "confirmation insert failed");
      await runQuery(`UPDATE admin_action_confirmations SET consumed_at = NOW() WHERE id = $1`, [confirmId]);
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          suite: "smoke-platform-admin",
          tables: tables.rows.map((r) => r.table_name),
          auditImmutable: true,
          changesRolledBack: true
        },
        null,
        2
      )
    );
  } finally {
    if (transactionStarted) await client.query("ROLLBACK").catch(() => {});
    client.release();
  }
}

main()
  .catch((error) => {
    console.error(JSON.stringify({ ok: false, suite: "smoke-platform-admin", error: error.message }, null, 2));
    process.exit(1);
  })
  .finally(async () => {
    try {
      if (pool) await pool.end();
    } catch {
      /* ignore */
    }
  });
