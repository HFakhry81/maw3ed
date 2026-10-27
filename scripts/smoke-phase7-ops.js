#!/usr/bin/env node
/**
 * Phase 7 package 1 — secrets posture, metrics/alert stubs, backup runbook alignment.
 */
const fs = require("fs");
const path = require("path");
const {
  evaluateSecretsPosture,
  assertSecretsPosture,
  redactObject,
  isWeakSessionSecret
} = require("../secretsPosture");
const { incr, evaluateAlertStubs, resetMetrics, snapshot } = require("../metricsAlerts");
const outbox = require("../transactionalOutbox");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function main() {
  const checks = [];
  const root = path.join(__dirname, "..");
  const prevOutbox = process.env.MAW3ED_OUTBOX_FILE;
  const tmpOutbox = path.join(root, "data", `outbox-phase7-smoke-${process.pid}.jsonl`);
  process.env.MAW3ED_OUTBOX_FILE = tmpOutbox;
  resetMetrics();

  try {
    if (fs.existsSync(tmpOutbox)) fs.unlinkSync(tmpOutbox);

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
    assert(snapshot().some((m) => m.name === "outbox_dead"), "gauge collected");
    checks.push("metrics-alert-stubs");

    const runbook = path.join(root, "docs", "OPS_BACKUP_RESTORE_RUNBOOK.md");
    assert(fs.existsSync(runbook), "backup restore runbook exists");
    const runbookText = fs.readFileSync(runbook, "utf8");
    assert(runbookText.includes("ops:pg-backup"), "runbook references ops:pg-backup");
    assert(runbookText.includes("ops:pg-restore"), "runbook references ops:pg-restore");
    assert(runbookText.includes("test:ops-pg-backup"), "runbook references smoke");
    checks.push("backup-runbook-aligned");

    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    assert(pkg.scripts["ops:pg-backup"] && pkg.scripts["ops:pg-restore"], "package scripts for pg backup");
    assert(pkg.scripts["test:ops-pg-backup"], "package script for pg backup smoke");
    assert(pkg.scripts["test:phase7-ops"], "phase7 smoke script registered");
    checks.push("package-backup-scripts");

    console.log(JSON.stringify({ ok: true, suite: "smoke-phase7-ops", checks }, null, 2));
  } finally {
    if (prevOutbox === undefined) delete process.env.MAW3ED_OUTBOX_FILE;
    else process.env.MAW3ED_OUTBOX_FILE = prevOutbox;
    try {
      fs.unlinkSync(tmpOutbox);
    } catch {
      /* ignore */
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
