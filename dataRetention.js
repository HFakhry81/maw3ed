/**
 * Operational data retention helpers (Phase 7).
 *
 * Technical defaults only — RPO/RTO/SLA numbers are NOT product-approved.
 * Owner must sign proposed targets in OPS_BACKUP_RESTORE_RUNBOOK before treating
 * them as production commitments.
 */
const fs = require("fs");
const path = require("path");
const { redactObject } = require("./secretsPosture");

const DEFAULT_RETENTION_DAYS = {
  transactionalOutbox: 30,
  emailOutbox: 30,
  webhookLedger: 90,
  providerSandboxLog: 14,
  developmentEvents: 14,
  workspaceEvents: 90
};

function proposedOpsTargets() {
  return {
    status: "proposed_pending_owner_approval",
    rpo_hours: null,
    rto_hours: null,
    note: "Do not invent SLA. Fill after owner measurement on Sam-PC / production-like host.",
    ownerRole: "product_owner",
    opsRole: "operations",
    securityRole: "security"
  };
}

function getRetentionPolicy(env = process.env) {
  const readDays = (key, fallback) => {
    const raw = env[key];
    if (raw === undefined || raw === null || String(raw).trim() === "") return fallback;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  return {
    unit: "days",
    sources: {
      transactionalOutbox: {
        days: readDays("MAW3ED_RETENTION_OUTBOX_DAYS", DEFAULT_RETENTION_DAYS.transactionalOutbox),
        fileEnv: "MAW3ED_OUTBOX_FILE",
        defaultPath: "data/transactional-outbox.jsonl"
      },
      emailOutbox: {
        days: readDays("MAW3ED_RETENTION_EMAIL_OUTBOX_DAYS", DEFAULT_RETENTION_DAYS.emailOutbox),
        defaultPath: "data/email-outbox.jsonl"
      },
      webhookLedger: {
        days: readDays("MAW3ED_RETENTION_WEBHOOK_LEDGER_DAYS", DEFAULT_RETENTION_DAYS.webhookLedger),
        fileEnv: "MAW3ED_WEBHOOK_LEDGER_FILE",
        defaultPath: "data/webhook-sandbox-ledger.jsonl"
      },
      providerSandboxLog: {
        days: readDays("MAW3ED_RETENTION_PROVIDER_SANDBOX_DAYS", DEFAULT_RETENTION_DAYS.providerSandboxLog),
        fileEnv: "MAW3ED_PROVIDER_SANDBOX_LOG",
        defaultPath: "data/provider-sandbox-deliveries.jsonl"
      }
    },
    proposedOpsTargets: proposedOpsTargets(),
    redaction: "purge keeps structure; secretsPosture.redactObject for log export"
  };
}

function parseJsonlTimestamp(row) {
  const candidates = [row.createdAt, row.receivedAt, row.deliveredAt, row.updatedAt];
  for (const value of candidates) {
    if (!value) continue;
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) return ms;
  }
  return null;
}

/**
 * Purge JSONL rows older than retentionDays. Writes a new file; never logs row payloads.
 */
function purgeJsonlByAge(filePath, { retentionDays, now = Date.now(), dryRun = false } = {}) {
  const days = Number(retentionDays);
  if (!Number.isFinite(days) || days < 0) {
    throw new Error("retentionDays must be a non-negative number");
  }
  if (!fs.existsSync(filePath)) {
    return { ok: true, filePath, existed: false, kept: 0, removed: 0, dryRun };
  }
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  const lines = fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean);
  const keptLines = [];
  let removed = 0;
  let kept = 0;
  for (const line of lines) {
    let row = null;
    try {
      row = JSON.parse(line);
    } catch {
      keptLines.push(line);
      kept += 1;
      continue;
    }
    const ts = parseJsonlTimestamp(row);
    if (ts !== null && ts < cutoff) {
      removed += 1;
      continue;
    }
    keptLines.push(JSON.stringify(redactObject(row)));
    kept += 1;
  }
  if (!dryRun) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, keptLines.length ? `${keptLines.join("\n")}\n` : "", "utf8");
  }
  return { ok: true, filePath, existed: true, kept, removed, dryRun, cutoff: new Date(cutoff).toISOString() };
}

function resolveRetentionFiles(env = process.env, root = path.join(__dirname)) {
  const policy = getRetentionPolicy(env);
  const files = [];
  for (const [name, spec] of Object.entries(policy.sources)) {
    const override = spec.fileEnv ? env[spec.fileEnv] : null;
    const filePath = override || path.join(root, spec.defaultPath);
    files.push({ name, filePath, days: spec.days });
  }
  return { policy, files };
}

function purgeOperationalLogs({ env = process.env, root = path.join(__dirname), dryRun = false, now = Date.now() } = {}) {
  const { policy, files } = resolveRetentionFiles(env, root);
  const results = files.map((file) => ({
    name: file.name,
    ...purgeJsonlByAge(file.filePath, { retentionDays: file.days, now, dryRun })
  }));
  return { ok: true, dryRun, policySummary: { sources: policy.sources, proposedOpsTargets: policy.proposedOpsTargets }, results };
}

module.exports = {
  DEFAULT_RETENTION_DAYS,
  proposedOpsTargets,
  getRetentionPolicy,
  purgeJsonlByAge,
  resolveRetentionFiles,
  purgeOperationalLogs
};
