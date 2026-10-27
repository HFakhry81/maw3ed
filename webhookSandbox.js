/**
 * Provider webhook sandbox (Phase 6 package 1).
 * HMAC-SHA256 signature verification + idempotent event ledger.
 * Not a live payment/messaging provider — sandbox only.
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const outbox = require("./transactionalOutbox");

const DEFAULT_LEDGER_FILE = path.join(__dirname, "data", "webhook-sandbox-ledger.jsonl");

function ledgerPath() {
  return process.env.MAW3ED_WEBHOOK_LEDGER_FILE || DEFAULT_LEDGER_FILE;
}

function webhookSecret(provider) {
  const named = process.env[`MAW3ED_WEBHOOK_SECRET_${String(provider || "").toUpperCase()}`];
  return named || process.env.MAW3ED_WEBHOOK_SECRET || process.env.SESSION_SECRET || "development-only-verification-secret";
}

function timingSafeEqualString(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function signBody(rawBody, provider) {
  return crypto.createHmac("sha256", webhookSecret(provider)).update(String(rawBody || "")).digest("hex");
}

function verifySignature({ provider, rawBody, signatureHeader }) {
  const provided = String(signatureHeader || "")
    .trim()
    .replace(/^sha256=/i, "");
  if (!provided) {
    const error = new Error("Missing webhook signature");
    error.statusCode = 401;
    error.code = "WEBHOOK_SIGNATURE_MISSING";
    throw error;
  }
  const expected = signBody(rawBody, provider);
  if (!timingSafeEqualString(provided, expected)) {
    const error = new Error("Invalid webhook signature");
    error.statusCode = 401;
    error.code = "WEBHOOK_SIGNATURE_INVALID";
    throw error;
  }
  return true;
}

function appendLedger(entry) {
  const file = ledgerPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const separator = current.length > 0 && !current.endsWith("\n") ? "\n" : "";
  fs.appendFileSync(file, `${separator}${JSON.stringify({ receivedAt: new Date().toISOString(), ...entry })}\n`);
}

function findLedgerEvent(provider, eventId) {
  const file = ledgerPath();
  if (!fs.existsSync(file)) return null;
  const needle = String(eventId || "");
  const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      const row = JSON.parse(lines[i]);
      if (row.provider === provider && row.eventId === needle) return row;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/**
 * Handle a sandbox webhook. Returns { replayed, accepted, outbox? }.
 */
function handleSandboxWebhook({
  provider,
  rawBody,
  signatureHeader,
  eventId,
  eventType,
  payload = {}
}) {
  const cleanProvider = String(provider || "sandbox").toLowerCase().replace(/[^a-z0-9_-]/g, "") || "sandbox";
  verifySignature({ provider: cleanProvider, rawBody, signatureHeader });
  const id = String(eventId || payload.id || "").trim();
  if (!id) {
    const error = new Error("eventId is required");
    error.statusCode = 400;
    throw error;
  }
  const prior = findLedgerEvent(cleanProvider, id);
  if (prior) {
    return { ok: true, replayed: true, accepted: false, eventId: id, provider: cleanProvider };
  }

  const type = String(eventType || payload.type || "unknown");
  appendLedger({
    provider: cleanProvider,
    eventId: id,
    eventType: type,
    payloadSummary: {
      amount: payload.amount ?? null,
      currency: payload.currency ?? null,
      workspaceId: payload.workspaceId ?? null,
      status: payload.status ?? null
    }
  });

  // Enqueue a sanitized notification/outbox row — never store PAN/secrets.
  const queued = outbox.enqueue({
    channel: "webhook",
    type: `webhook.${cleanProvider}.${type}`,
    workspaceId: payload.workspaceId || null,
    idempotencyKey: `webhook:${cleanProvider}:${id}`,
    payload: {
      provider: cleanProvider,
      eventId: id,
      eventType: type,
      amount: payload.amount ?? null,
      currency: payload.currency || null,
      status: payload.status || null
    }
  });

  return {
    ok: true,
    replayed: false,
    accepted: true,
    eventId: id,
    provider: cleanProvider,
    outboxId: queued.row.id,
    outboxCreated: queued.created
  };
}

module.exports = {
  signBody,
  verifySignature,
  handleSandboxWebhook,
  findLedgerEvent,
  webhookSecret,
  ledgerPath
};
