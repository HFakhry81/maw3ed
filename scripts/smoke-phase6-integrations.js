#!/usr/bin/env node
/**
 * Phase 6 package 1 — transactional outbox + webhook sandbox + billing capability flags.
 */
const fs = require("fs");
const path = require("path");
const outbox = require("../transactionalOutbox");
const webhooks = require("../webhookSandbox");
const { getIntegrationCapabilities } = require("../billingCapabilities");
const { deliverHtmlEmail } = require("../email");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const checks = [];
  const prevEmailMode = process.env.MAW3ED_EMAIL_MODE;
  const prevOutbox = process.env.MAW3ED_OUTBOX_FILE;
  const prevLedger = process.env.MAW3ED_WEBHOOK_LEDGER_FILE;
  const tmpOutbox = path.join(__dirname, "..", "data", `outbox-smoke-${process.pid}.jsonl`);
  const tmpLedger = path.join(__dirname, "..", "data", `webhook-ledger-smoke-${process.pid}.jsonl`);
  process.env.MAW3ED_EMAIL_MODE = "outbox";
  process.env.MAW3ED_OUTBOX_FILE = tmpOutbox;
  process.env.MAW3ED_WEBHOOK_LEDGER_FILE = tmpLedger;

  try {
    for (const file of [tmpOutbox, tmpLedger]) {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }

    const first = outbox.enqueue({
      channel: "email",
      type: "smoke",
      idempotencyKey: `smoke-${process.pid}`,
      payload: { hello: true }
    });
    assert(first.created === true, "first enqueue creates");
    const replay = outbox.enqueue({
      channel: "email",
      type: "smoke",
      idempotencyKey: `smoke-${process.pid}`,
      payload: { hello: true }
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
    assert(caps.webhooks.sandbox === true, "webhook sandbox advertised");
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
    // Point ledger to temp by patching module path is hard; use unique event ids and clean after.
    const accepted = webhooks.handleSandboxWebhook({
      provider,
      rawBody: body,
      signatureHeader: `sha256=${signature}`,
      eventId: `evt-${process.pid}`,
      eventType: "subscription.updated",
      payload: JSON.parse(body)
    });
    assert(accepted.accepted === true && accepted.replayed === false, "webhook accepted");
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

    console.log(JSON.stringify({ ok: true, suite: "smoke-phase6-integrations", checks }, null, 2));
  } finally {
    if (prevEmailMode === undefined) delete process.env.MAW3ED_EMAIL_MODE;
    else process.env.MAW3ED_EMAIL_MODE = prevEmailMode;
    if (prevOutbox === undefined) delete process.env.MAW3ED_OUTBOX_FILE;
    else process.env.MAW3ED_OUTBOX_FILE = prevOutbox;
    if (prevLedger === undefined) delete process.env.MAW3ED_WEBHOOK_LEDGER_FILE;
    else process.env.MAW3ED_WEBHOOK_LEDGER_FILE = prevLedger;
    for (const file of [tmpOutbox, tmpLedger]) {
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
