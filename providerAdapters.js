/**
 * Channel provider adapters (Phase 6).
 * Email has a sandbox adapter used by the outbox worker.
 * SMS / WhatsApp stay capability-gated stubs (refuse unless explicitly enabled later).
 */
const fs = require("fs");
const path = require("path");

const DEFAULT_SANDBOX_LOG = path.join(__dirname, "data", "provider-sandbox-deliveries.jsonl");

function sandboxLogPath(env = process.env) {
  return env.MAW3ED_PROVIDER_SANDBOX_LOG || DEFAULT_SANDBOX_LOG;
}

function appendSandboxDelivery(entry, env = process.env) {
  const file = sandboxLogPath(env);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const separator = current.length > 0 && !current.endsWith("\n") ? "\n" : "";
  fs.appendFileSync(
    file,
    `${separator}${JSON.stringify({ deliveredAt: new Date().toISOString(), ...entry })}\n`,
    "utf8"
  );
}

function resolveEmailAdapterMode(env = process.env) {
  const forced = String(env.MAW3ED_EMAIL_ADAPTER || "").toLowerCase();
  if (forced === "sandbox" || forced === "live" || forced === "disabled") return forced;
  if (String(env.MAW3ED_EMAIL_MODE || "").toLowerCase() === "outbox") return "sandbox";
  if (env.SENDGRID_API_KEY || env.MAIL_FROM) return "live";
  return "sandbox";
}

function gatedOffError(channel, reason = "not_wired") {
  const error = new Error(`${channel} adapter disabled (${reason})`);
  error.code = "PROVIDER_DISABLED";
  error.statusCode = 503;
  error.channel = channel;
  error.reason = reason;
  return error;
}

/**
 * Deliver an email outbox row. Sandbox never calls a live provider.
 */
async function deliverEmail(row, env = process.env) {
  const mode = resolveEmailAdapterMode(env);
  if (mode === "disabled") throw gatedOffError("email", "disabled");
  const payload = row.payload || {};
  const to = payload.to || null;
  if (!to) {
    const error = new Error("email payload missing to");
    error.code = "EMAIL_PAYLOAD_INVALID";
    throw error;
  }

  if (mode === "sandbox") {
    appendSandboxDelivery(
      {
        channel: "email",
        adapter: "sandbox",
        outboxId: row.id,
        type: row.type,
        to,
        subject: payload.subject || null,
        workspaceId: row.workspaceId || null,
        idempotencyKey: row.idempotencyKey || null
      },
      env
    );
    return { adapter: "email-sandbox", to, subject: payload.subject || null };
  }

  // Live path stays feature-gated: worker opts in with MAW3ED_EMAIL_ADAPTER=live
  // and SendGrid credentials. Does not call email.js (avoids outbox re-enqueue loops).
  if (!env.SENDGRID_API_KEY) {
    throw gatedOffError("email", "live_credentials_missing");
  }
  const mailFrom = env.MAIL_FROM || "noreply@maw3ed.local";
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: mailFrom, name: env.MAIL_FROM_NAME || "موعد Maw3ed" },
      subject: payload.subject || "Maw3ed",
      content: [{ type: "text/html", value: payload.html || "<p>Maw3ed notification</p>" }],
      headers: row.idempotencyKey ? { "X-Idempotency-Key": String(row.idempotencyKey).slice(0, 200) } : undefined
    })
  });
  if (!response.ok) {
    const errorBody = await response.text();
    const error = new Error(`SendGrid send failed with status ${response.status}: ${errorBody.slice(0, 200)}`);
    error.code = "EMAIL_LIVE_FAILED";
    throw error;
  }
  return { adapter: "email-live", provider: "sendgrid", to };
}

async function deliverSms(_row, env = process.env) {
  if (env.MAW3ED_SMS_ENABLED === "1") {
    throw gatedOffError("sms", "stub_not_implemented");
  }
  throw gatedOffError("sms", "not_wired");
}

async function deliverWhatsApp(_row, env = process.env) {
  if (env.MAW3ED_WHATSAPP_ENABLED === "1") {
    throw gatedOffError("whatsapp", "stub_not_implemented");
  }
  throw gatedOffError("whatsapp", "not_wired");
}

/**
 * Webhook-originated outbox rows are recorded as sandbox notices (no external fan-out).
 */
async function deliverWebhookNotice(row, env = process.env) {
  appendSandboxDelivery(
    {
      channel: "webhook",
      adapter: "sandbox-notice",
      outboxId: row.id,
      type: row.type,
      workspaceId: row.workspaceId || null,
      eventId: row.payload?.eventId || null,
      provider: row.payload?.provider || null
    },
    env
  );
  return { adapter: "webhook-sandbox-notice", eventId: row.payload?.eventId || null };
}

async function deliverOutboxRow(row, env = process.env) {
  const channel = String(row.channel || "email").toLowerCase();
  if (channel === "email") return deliverEmail(row, env);
  if (channel === "sms") return deliverSms(row, env);
  if (channel === "whatsapp" || channel === "wa") return deliverWhatsApp(row, env);
  if (channel === "webhook") return deliverWebhookNotice(row, env);
  throw gatedOffError(channel, "unknown_channel");
}

module.exports = {
  resolveEmailAdapterMode,
  deliverEmail,
  deliverSms,
  deliverWhatsApp,
  deliverWebhookNotice,
  deliverOutboxRow,
  sandboxLogPath,
  appendSandboxDelivery
};
