/**
 * Explicit billing / messaging capability flags for Phase 6.
 * Checkout stays disabled until a provider sandbox is accepted.
 */
function getIntegrationCapabilities(env = process.env) {
  const emailMode = String(env.MAW3ED_EMAIL_MODE || "").toLowerCase() || "live-or-fallback";
  const outboxPreferred = emailMode === "outbox";
  return {
    messaging: {
      transactionalOutbox: true,
      emailMode: outboxPreferred ? "outbox" : emailMode,
      liveSendEnabled: !outboxPreferred && Boolean(env.SENDGRID_API_KEY || env.MAIL_FROM),
      sms: { enabled: false, reason: "not_wired" },
      whatsapp: { enabled: false, reason: "not_wired" }
    },
    billing: {
      manualRequest: true,
      hostedCheckout: false,
      reason: "checkout_disabled_until_provider_sandbox",
      providers: {
        whop: { checkout: false, verify: false, status: 410 },
        stripe: { enabled: false, reason: "not_wired" }
      }
    },
    webhooks: {
      sandbox: true,
      path: "/api/webhooks/sandbox/:provider",
      signature: "sha256 HMAC hex (header x-maw3ed-signature or x-signature)"
    }
  };
}

module.exports = { getIntegrationCapabilities };
