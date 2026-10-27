/**
 * Transactional outbox delivery worker (Phase 6).
 * Drains pending rows with bounded retries; feature stays off unless enabled.
 *
 * Enable: MAW3ED_OUTBOX_WORKER=1  (or invoke processBatch({ force: true }) from CLI/tests)
 * Email adapter defaults to sandbox when MAW3ED_EMAIL_MODE=outbox.
 */
const outbox = require("./transactionalOutbox");
const adapters = require("./providerAdapters");

function isWorkerEnabled(env = process.env) {
  return env.MAW3ED_OUTBOX_WORKER === "1" || env.MAW3ED_OUTBOX_WORKER === "true";
}

function workerStatus(env = process.env) {
  const summary = outbox.summarize();
  return {
    enabled: isWorkerEnabled(env),
    emailAdapter: adapters.resolveEmailAdapterMode(env),
    smsEnabled: env.MAW3ED_SMS_ENABLED === "1",
    whatsappEnabled: env.MAW3ED_WHATSAPP_ENABLED === "1",
    outbox: summary
  };
}

/**
 * Process up to `limit` pending rows once.
 * Returns per-row results; does not throw on individual delivery failures.
 */
async function processBatch({
  limit = 25,
  force = false,
  env = process.env,
  now = Date.now(),
  deliver = adapters.deliverOutboxRow
} = {}) {
  if (!force && !isWorkerEnabled(env)) {
    return {
      skipped: true,
      reason: "worker_disabled",
      hint: "Set MAW3ED_OUTBOX_WORKER=1 to enable delivery",
      processed: 0,
      results: []
    };
  }

  const pending = outbox.listPending({ now, limit });
  const results = [];
  for (const row of pending) {
    // Idempotency: already-delivered rows never appear in listPending.
    // Re-delivery of the same outbox id after markDelivered is a no-op at enqueue time via idempotencyKey.
    try {
      const delivery = await deliver(row, env);
      const updated = outbox.markDelivered(row.id, {
        adapter: delivery.adapter || row.channel,
        ...delivery
      });
      results.push({
        id: row.id,
        channel: row.channel,
        status: "delivered",
        attempts: updated?.attempts,
        delivery
      });
    } catch (error) {
      const updated = outbox.markFailed(row.id, error.message || String(error));
      results.push({
        id: row.id,
        channel: row.channel,
        status: updated?.status || "pending",
        attempts: updated?.attempts,
        error: error.message,
        code: error.code || null
      });
    }
  }

  return {
    skipped: false,
    processed: results.length,
    delivered: results.filter((row) => row.status === "delivered").length,
    failed: results.filter((row) => row.status === "pending").length,
    dead: results.filter((row) => row.status === "dead").length,
    results,
    outbox: outbox.summarize()
  };
}

async function processUntilIdle({
  maxBatches = 10,
  limit = 25,
  force = false,
  env = process.env
} = {}) {
  const batches = [];
  for (let i = 0; i < maxBatches; i += 1) {
    const batch = await processBatch({ limit, force, env });
    batches.push(batch);
    if (batch.skipped || batch.processed === 0) break;
  }
  return { batches, outbox: outbox.summarize() };
}

module.exports = {
  isWorkerEnabled,
  workerStatus,
  processBatch,
  processUntilIdle
};
