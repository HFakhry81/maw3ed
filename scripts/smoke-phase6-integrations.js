#!/usr/bin/env node
/**
 * Phase 6 — outbox + delivery worker + provider adapters + billing sandbox acceptance.
 */
const fs = require("fs");
const path = require("path");
const outbox = require("../transactionalOutbox");
const webhooks = require("../webhookSandbox");
const { getIntegrationCapabilities, getCheckoutHttpStatus } = require("../billingCapabilities");
const { deliverHtmlEmail } = require("../email");
const { processBatch, workerStatus } = require("../outboxDeliveryWorker");
const adapters = require("../providerAdapters");
const { runBillingSandboxAcceptance } = require("../billingSandboxAcceptance");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const checks = [];
  const prev = {
    emailMode: process.env.MAW3ED_EMAIL_MODE,
    outbox: process.env.MAW3ED_OUTBOX_FILE,
    ledger: process.env.MAW3ED_WEBHOOK_LEDGER_FILE,
    sandboxLog: process.env.MAW3ED_PROVIDER_SANDBOX_LOG,
    worker: process.env.MAW3ED_OUTBOX_WORKER,
    emailAdapter: process.env.MAW3ED_EMAIL_ADAPTER
  };
  const tmpOutbox = path.join(__dirname, "..", "data", `outbox-smoke-${process.pid}.jsonl`);
  const tmpLedger = path.join(__dirname, "..", "data", `webhook-ledger-smoke-${process.pid}.jsonl`);
  const tmpSandbox = path.join(__dirname, "..", "data", `provider-sandbox-smoke-${process.pid}.jsonl`);
  process.env.MAW3ED_EMAIL_MODE = "outbox";
  process.env.MAW3ED_OUTBOX_FILE = tmpOutbox;
  process.env.MAW3ED_WEBHOOK_LEDGER_FILE = tmpLedger;
  process.env.MAW3ED_PROVIDER_SANDBOX_LOG = tmpSandbox;
  delete process.env.MAW3ED_OUTBOX_WORKER;
  process.env.MAW3ED_EMAIL_ADAPTER = "sandbox";

  try {
    for (const file of [tmpOutbox, tmpLedger, tmpSandbox]) {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }

    const first = outbox.enqueue({
      channel: "email",
      type: "smoke",
      idempotencyKey: `smoke-${process.pid}`,
      payload: { to: "a@example.com", subject: "hi", html: "<p>hi</p>" }
    });
    assert(first.created === true, "first enqueue creates");
    const replay = outbox.enqueue({
      channel: "email",
      type: "smoke",
      idempotencyKey: `smoke-${process.pid}`,
      payload: { to: "a@example.com", subject: "hi", html: "<p>hi</p>" }
    });
    assert(replay.created === false && replay.row.id === first.row.id, "idempotent enqueue");
    checks.push("outbox-idempotency");

    const pending = outbox.listPending();
    assert(pending.some((row) => row.id === first.row.id), "pending lists new row");
    const delivered = outbox.markDelivered(first.row.id, { mode: "smoke" });
    assert(delivered.status === "delivered", "mark delivered");
    assert(!outbox.listPending().some((row) => row.id === first.row.id), "delivered leaves pending");
    checks.push("outbox-delivery-lifecycle");

    const emailResult = await deliverHtmlEmail({
      to: "smoke@example.com",
      subject: "phase6",
      html: "<p>hi</p>",
      type: "phase6-smoke",
      idempotencyKey: `email-smoke-${process.pid}`
    });
    assert(emailResult.mode === "development-outbox", "email uses outbox mode");
    const emailReplay = await deliverHtmlEmail({
      to: "smoke@example.com",
      subject: "phase6",
      html: "<p>hi</p>",
      type: "phase6-smoke",
      idempotencyKey: `email-smoke-${process.pid}`
    });
    assert(emailReplay.idempotentReplay === true, "email outbox idempotent");
    checks.push("email-outbox-bridge");

    const caps = getIntegrationCapabilities({ MAW3ED_EMAIL_MODE: "outbox" });
    assert(caps.billing.hostedCheckout === false, "checkout disabled");
    assert(caps.billing.providers.whop.checkout === false, "whop checkout off");
    assert(caps.messaging.sms.enabled === false, "sms not claimed");
    assert(caps.messaging.whatsapp.enabled === false, "whatsapp not claimed");
    assert(caps.webhooks.sandbox === true, "webhook sandbox advertised");
    assert(getCheckoutHttpStatus(caps) === 410, "checkout HTTP gate is 410");
    assert(caps.messaging.deliveryWorker.available === true, "delivery worker advertised");
    assert(caps.messaging.deliveryWorker.enabled === false, "worker off by default");
    checks.push("billing-capability-flags");

    const provider = "whop";
    const body = JSON.stringify({
      eventId: `evt-${process.pid}`,
      eventType: "subscription.updated",
      amount: 10,
      currency: "USD",
      status: "active",
      workspaceId: "ws-smoke"
    });
    const signature = webhooks.signBody(body, provider);
    const accepted = webhooks.handleSandboxWebhook({
      provider,
      rawBody: body,
      signatureHeader: `sha256=${signature}`,
      eventId: `evt-${process.pid}`,
      eventType: "subscription.updated",
      payload: JSON.parse(body)
    });
    assert(accepted.accepted === true && accepted.replayed === false, "webhook accepted");
    assert(accepted.activatesSubscription === false, "webhook does not activate subscription");
    const replayed = webhooks.handleSandboxWebhook({
      provider,
      rawBody: body,
      signatureHeader: signature,
      eventId: `evt-${process.pid}`,
      eventType: "subscription.updated",
      payload: JSON.parse(body)
    });
    assert(replayed.replayed === true, "webhook replay safe");
    let badSig = null;
    try {
      webhooks.handleSandboxWebhook({
        provider,
        rawBody: body,
        signatureHeader: "deadbeef",
        eventId: `evt-bad-${process.pid}`,
        eventType: "x",
        payload: { eventId: `evt-bad-${process.pid}` }
      });
    } catch (error) {
      badSig = error;
    }
    assert(badSig?.statusCode === 401, "bad signature rejected");
    checks.push("webhook-sandbox-signature-replay");

    // Delivery worker: disabled without force/env
    const skipped = await processBatch({ limit: 5, force: false, env: { ...process.env, MAW3ED_OUTBOX_WORKER: "0" } });
    assert(skipped.skipped === true && skipped.reason === "worker_disabled", "worker disabled by default");
    checks.push("delivery-worker-gated");

    const workerEmail = outbox.enqueue({
      channel: "email",
      type: "worker-smoke",
      idempotencyKey: `worker-email-${process.pid}`,
      payload: { to: "worker@example.com", subject: "worker", html: "<p>w</p>" }
    });
    const drained = await processBatch({
      force: true,
      limit: 20,
      env: process.env
    });
    assert(drained.skipped === false, "forced worker runs");
    assert(drained.results.some((row) => row.id === workerEmail.row.id && row.status === "delivered"), "email sandbox delivered");
    assert(fs.existsSync(tmpSandbox), "sandbox delivery log written");
    checks.push("delivery-worker-email-sandbox");

    const smsRow = outbox.enqueue({
      channel: "sms",
      type: "sms-smoke",
      idempotencyKey: `sms-${process.pid}`,
      payload: { to: "+10000000000", body: "nope" },
      maxAttempts: 2
    });
    const smsFail = await processBatch({ force: true, env: process.env });
    const smsResult = smsFail.results.find((row) => row.id === smsRow.row.id);
    assert(smsResult?.status === "pending" && smsResult.code === "PROVIDER_DISABLED", "sms stub refuses and retries");
    const smsRetry = await processBatch({
      force: true,
      env: process.env,
      now: Date.now() + 60 * 60 * 1000
    });
    const smsDead = smsRetry.results.find((row) => row.id === smsRow.row.id);
    assert(smsDead?.status === "dead", "sms exhausts to dead letter");
    checks.push("delivery-worker-retry-dead-letter");

    let waError = null;
    try {
      await adapters.deliverWhatsApp({ channel: "whatsapp", payload: {} }, process.env);
    } catch (error) {
      waError = error;
    }
    assert(waError?.code === "PROVIDER_DISABLED", "whatsapp stub gated off");
    checks.push("whatsapp-capability-gated");

    const acceptance = runBillingSandboxAcceptance({ pid: process.pid });
    assert(acceptance.ok === true && acceptance.hostedCheckoutEnabled === false, "billing sandbox acceptance");
    checks.push(...acceptance.checks.map((name) => `accept:${name}`));

    const status = workerStatus({ ...process.env, MAW3ED_OUTBOX_WORKER: "0" });
    assert(status.enabled === false && status.emailAdapter === "sandbox", "worker status reports sandbox adapter");
    checks.push("worker-status");

    console.log(JSON.stringify({ ok: true, suite: "smoke-phase6-integrations", checks }, null, 2));
  } finally {
    const restore = (key, value) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    };
    restore("MAW3ED_EMAIL_MODE", prev.emailMode);
    restore("MAW3ED_OUTBOX_FILE", prev.outbox);
    restore("MAW3ED_WEBHOOK_LEDGER_FILE", prev.ledger);
    restore("MAW3ED_PROVIDER_SANDBOX_LOG", prev.sandboxLog);
    restore("MAW3ED_OUTBOX_WORKER", prev.worker);
    restore("MAW3ED_EMAIL_ADAPTER", prev.emailAdapter);
    for (const file of [tmpOutbox, tmpLedger, tmpSandbox]) {
      try {
        fs.unlinkSync(file);
      } catch {
        /* ignore */
      }
    }
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, suite: "smoke-phase6-integrations", error: error.message }, null, 2));
  process.exit(1);
});
