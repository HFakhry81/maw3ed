/**
 * Metrics / alert stubs (Phase 7).
 * In-process counters only — no external APM vendor claimed.
 * Alert rules evaluate thresholds and return structured findings with ownership.
 */
const outbox = require("./transactionalOutbox");

const ALERT_OWNERSHIP = {
  outbox_dead_letter: {
    ownerRole: "operations",
    escalateTo: "engineering",
    sink: "stub_only",
    action: "Inspect transactional outbox dead rows; re-drive or discard; check provider adapters"
  },
  outbox_pending_backlog: {
    ownerRole: "operations",
    escalateTo: "engineering",
    sink: "stub_only",
    action: "Enable MAW3ED_OUTBOX_WORKER=1 or run npm run outbox:worker -- --force; check delivery failures"
  },
  secrets_posture_failed: {
    ownerRole: "security",
    escalateTo: "product_owner",
    sink: "stub_only",
    action: "Rotate weak/missing SESSION_SECRET and review secretsPosture inventory (values never logged)"
  }
};

const counters = new Map();

function incr(name, by = 1, labels = {}) {
  const key = `${name}|${JSON.stringify(labels || {})}`;
  const current = counters.get(key) || { name, labels, value: 0 };
  current.value += Number(by) || 0;
  counters.set(key, current);
  return current.value;
}

function setGauge(name, value, labels = {}) {
  const key = `${name}|${JSON.stringify(labels || {})}`;
  counters.set(key, { name, labels, value: Number(value) || 0 });
  return Number(value) || 0;
}

function snapshot() {
  return Array.from(counters.values()).map((row) => ({ ...row }));
}

function resetMetrics() {
  counters.clear();
}

function collectRuntimeGauges({ now = Date.now() } = {}) {
  const summary = outbox.summarize();
  setGauge("outbox_total", summary.total);
  setGauge("outbox_pending", summary.byStatus.pending || 0);
  setGauge("outbox_delivered", summary.byStatus.delivered || 0);
  setGauge("outbox_dead", summary.byStatus.dead || 0);
  setGauge("process_uptime_ms", now - (collectRuntimeGauges._startedAt || now));
  return summary;
}

collectRuntimeGauges._startedAt = Date.now();

/**
 * Evaluate alert stubs. Does not page anyone — returns findings for ops/UI/logs.
 */
function evaluateAlertStubs({
  outboxDeadThreshold = 1,
  outboxPendingThreshold = 100,
  now = Date.now()
} = {}) {
  collectRuntimeGauges({ now });
  const summary = outbox.summarize();
  const findings = [];

  const dead = summary.byStatus.dead || 0;
  if (dead >= outboxDeadThreshold) {
    findings.push({
      id: "outbox_dead_letter",
      severity: "warning",
      message: `Transactional outbox has ${dead} dead letter row(s)`,
      metric: "outbox_dead",
      value: dead,
      threshold: outboxDeadThreshold,
      ownership: ALERT_OWNERSHIP.outbox_dead_letter
    });
  }

  const pending = summary.byStatus.pending || 0;
  if (pending >= outboxPendingThreshold) {
    findings.push({
      id: "outbox_pending_backlog",
      severity: "warning",
      message: `Transactional outbox pending backlog is ${pending}`,
      metric: "outbox_pending",
      value: pending,
      threshold: outboxPendingThreshold,
      ownership: ALERT_OWNERSHIP.outbox_pending_backlog
    });
  }

  return {
    ok: findings.every((row) => row.severity !== "critical"),
    stub: true,
    vendor: null,
    note: "Alert stubs only — wire PagerDuty/Slack/email later; ownership roles are documented templates",
    ownershipCatalog: ALERT_OWNERSHIP,
    findings,
    metrics: snapshot()
  };
}

module.exports = {
  ALERT_OWNERSHIP,
  incr,
  setGauge,
  snapshot,
  resetMetrics,
  collectRuntimeGauges,
  evaluateAlertStubs
};
