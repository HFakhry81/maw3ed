#!/usr/bin/env node
/**
 * Phase 7 — secrets posture, retention/redaction, metrics ownership, backup runbook drills.
 */
const fs = require("fs");
const path = require("path");
const {
  evaluateSecretsPosture,
  assertSecretsPosture,
  redactObject,
  isWeakSessionSecret
} = require("../secretsPosture");
const {
  incr,
  evaluateAlertStubs,
  resetMetrics,
  snapshot,
  ALERT_OWNERSHIP
} = require("../metricsAlerts");
const {
  getRetentionPolicy,
  purgeJsonlByAge,
  proposedOpsTargets
} = require("../dataRetention");
const outbox = require("../transactionalOutbox");
const { evaluateRuntimePosture } = require("../runtimePosture");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function main() {
  const checks = [];
  const root = path.join(__dirname, "..");
  const prevOutbox = process.env.MAW3ED_OUTBOX_FILE;
  const tmpOutbox = path.join(root, "data", `outbox-phase7-smoke-${process.pid}.jsonl`);
  const tmpRetention = path.join(root, "data", `retention-smoke-${process.pid}.jsonl`);
  process.env.MAW3ED_OUTBOX_FILE = tmpOutbox;
  resetMetrics();

  try {
    for (const file of [tmpOutbox, tmpRetention]) {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }

    assert(isWeakSessionSecret("development-only-verification-secret") === true, "default session secret weak");
    assert(isWeakSessionSecret("a-sufficiently-long-random-session-value") === false, "strong secret ok");

    const local = evaluateSecretsPosture({
      MAW3ED_ENV: "local",
      SESSION_SECRET: "development-only-verification-secret"
    });
    assert(local.ok === true, "local weak secret warns but ok");
    assert(local.warnings.includes("local_default_session_secret"), "local warning present");
    checks.push("secrets-local-warning");

    const prodBad = evaluateSecretsPosture({
      MAW3ED_ENV: "production",
      SESSION_SECRET: "changeme",
      MAW3ED_STORAGE: "postgres"
    });
    assert(prodBad.ok === false, "production rejects weak session secret");
    assert(prodBad.errors.includes("production_weak_or_missing_session_secret"), "weak secret error");
    checks.push("secrets-production-fail-closed");

    const prodOk = assertSecretsPosture({
      MAW3ED_ENV: "production",
      SESSION_SECRET: "production-grade-session-secret-value-32",
      CLERK_SECRET_KEY: "sk_test_example",
      DATABASE_URL: "postgresql://u:p@127.0.0.1:5432/maw3ed",
      MAW3ED_STORAGE: "postgres"
    });
    assert(prodOk.ok === true, "production strong secret passes");
    checks.push("secrets-production-ok");

    const redacted = redactObject({
      SESSION_SECRET: "super-secret-value",
      hello: "world",
      nested: { SENDGRID_API_KEY: "SG.xxx", ok: 1 }
    });
    assert(redacted.SESSION_SECRET === "[REDACTED]", "redact top-level secret");
    assert(redacted.nested.SENDGRID_API_KEY === "[REDACTED]", "redact nested secret");
    assert(redacted.hello === "world" && redacted.nested.ok === 1, "non-secrets preserved");
    checks.push("secrets-redaction");

    const composed = evaluateRuntimePosture(
      {
        MAW3ED_ENV: "production",
        SESSION_SECRET: "changeme",
        MAW3ED_STORAGE: "postgres",
        DATABASE_URL: "postgresql://u:p@127.0.0.1:5432/maw3ed"
      },
      { databaseConfigured: true }
    );
    assert(composed.ok === false, "runtime posture folds secrets errors in production");
    assert(composed.secrets && composed.secrets.ok === false, "runtime exposes secrets summary");
    checks.push("runtime-posture-secrets-fold");

    incr("http_requests", 1, { route: "/api/health" });
    outbox.enqueue({
      channel: "email",
      type: "phase7",
      idempotencyKey: `phase7-dead-${process.pid}`,
      payload: { to: "x@example.com" },
      maxAttempts: 1
    });
    const row = outbox.listPending()[0];
    outbox.markFailed(row.id, "forced");
    const alerts = evaluateAlertStubs({ outboxDeadThreshold: 1, outboxPendingThreshold: 9999 });
    assert(alerts.stub === true && alerts.vendor === null, "alerts are stubs");
    assert(alerts.findings.some((f) => f.id === "outbox_dead_letter"), "dead-letter alert fires");
    assert(alerts.findings[0].ownership?.ownerRole === "operations", "alert ownership present");
    assert(ALERT_OWNERSHIP.outbox_dead_letter.sink === "stub_only", "ownership catalog stub sink");
    assert(snapshot().some((m) => m.name === "outbox_dead"), "gauge collected");
    checks.push("metrics-alert-ownership");

    const policy = getRetentionPolicy({ MAW3ED_RETENTION_OUTBOX_DAYS: "7" });
    assert(policy.sources.transactionalOutbox.days === 7, "retention override via env");
    assert(proposedOpsTargets().status === "proposed_pending_owner_approval", "RPO/RTO not invented");
    assert(proposedOpsTargets().rpo_hours === null && proposedOpsTargets().rto_hours === null, "RPO/RTO null until owner");
    const oldTs = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    const newTs = new Date().toISOString();
    fs.writeFileSync(
      tmpRetention,
      `${JSON.stringify({ createdAt: oldTs, SESSION_SECRET: "should-redact", note: "old" })}\n` +
        `${JSON.stringify({ createdAt: newTs, note: "new", token: "abc" })}\n`,
      "utf8"
    );
    const purged = purgeJsonlByAge(tmpRetention, { retentionDays: 30, dryRun: false });
    assert(purged.removed === 1 && purged.kept === 1, "retention purge removes old rows");
    const kept = fs.readFileSync(tmpRetention, "utf8");
    assert(!kept.includes("should-redact"), "purge redacts secrets in kept rows");
    assert(kept.includes("[REDACTED]"), "redacted marker present");
    checks.push("retention-purge-redaction");

    const runbook = path.join(root, "docs", "OPS_BACKUP_RESTORE_RUNBOOK.md");
    assert(fs.existsSync(runbook), "backup restore runbook exists");
    const runbookText = fs.readFileSync(runbook, "utf8");
    assert(runbookText.includes("ops:pg-backup"), "runbook references ops:pg-backup");
    assert(runbookText.includes("ops:pg-restore"), "runbook references ops:pg-restore");
    assert(runbookText.includes("test:ops-pg-backup"), "runbook references smoke");
    assert(runbookText.includes("5432"), "runbook mentions Sam-PC port");
    assert(runbookText.includes("proposed_pending_owner_approval"), "runbook marks RPO pending");
    assert(runbookText.includes("retention-purge"), "runbook references retention purge");
    checks.push("backup-runbook-aligned");

    const privacy = path.join(root, "docs", "PRIVACY_REQUESTS_RUNBOOK.md");
    assert(fs.existsSync(privacy), "privacy requests runbook exists");
    assert(fs.readFileSync(privacy, "utf8").includes("ليس"), "privacy runbook is Arabic-capable template");
    checks.push("privacy-runbook-template");

    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    assert(pkg.scripts["ops:pg-backup"] && pkg.scripts["ops:pg-restore"], "package scripts for pg backup");
    assert(pkg.scripts["test:ops-pg-backup"], "package script for pg backup smoke");
    assert(pkg.scripts["test:phase7-ops"], "phase7 smoke script registered");
    assert(pkg.scripts["retention:purge"], "retention purge script registered");
    checks.push("package-backup-scripts");

    const pgBackup = require("./ops-pg-backup");
    assert(Array.isArray(pgBackup.OPS_PG_TABLES) && pgBackup.OPS_PG_TABLES.includes("workspace_ops_profiles"), "pg table inventory");
    assert(typeof pgBackup.restorePgOpsBackup === "function", "restorePgOpsBackup exported");
    const pgSmoke = fs.readFileSync(path.join(root, "scripts", "smoke-ops-pg-backup.js"), "utf8");
    assert(pgSmoke.includes("restore-refuses-without-target"), "pg restore safety covered in smoke-ops-pg-backup");
    assert(pgSmoke.includes("OPS_PG_TABLES") || pgSmoke.includes("table-inventory"), "pg inventory covered in smoke");
    checks.push("pg-restore-safety-coherent");

    const serverSrc = fs.readFileSync(path.join(root, "server.js"), "utf8");
    assert(serverSrc.includes("X-Frame-Options"), "server sets frame options");
    assert(serverSrc.includes("Content-Security-Policy"), "server sets CSP");
    assert(serverSrc.includes("requestId"), "server assigns request id");
    checks.push("app-security-headers-present");

    console.log(JSON.stringify({ ok: true, suite: "smoke-phase7-ops", checks }, null, 2));
  } finally {
    if (prevOutbox === undefined) delete process.env.MAW3ED_OUTBOX_FILE;
    else process.env.MAW3ED_OUTBOX_FILE = prevOutbox;
    for (const file of [tmpOutbox, tmpRetention]) {
      try {
        fs.unlinkSync(file);
      } catch {
        /* ignore */
      }
    }
    resetMetrics();
  }
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({ ok: false, suite: "smoke-phase7-ops", error: error.message }, null, 2));
  process.exit(1);
}
