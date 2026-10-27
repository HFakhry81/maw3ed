/**
 * Explicit billing / messaging capability flags for Phase 6.
 * Checkout stays disabled until a provider sandbox is accepted AND product unlocks it.
 * Passing sandbox acceptance tests does not flip hostedCheckout on by itself.
 */
function truthy(value) {
  return value === "1" || value === "true" || value === true;
}

function getIntegrationCapabilities(env = process.env) {
  const emailMode = String(env.MAW3ED_EMAIL_MODE || "").toLowerCase() || "live-or-fallback";
  const outboxPreferred = emailMode === "outbox";
  const workerEnabled = truthy(env.MAW3ED_OUTBOX_WORKER);
  const sandboxAcceptedEnv = truthy(env.MAW3ED_BILLING_SANDBOX_ACCEPTED);
  const hostedCheckoutRequested = truthy(env.MAW3ED_HOSTED_CHECKOUT);
  // Policy: hosted checkout remains off for Phase 6 close even if env requests it.
  // Unlock requires a later explicit product decision (Phase 8+/ops), not just sandbox tests.
  const hostedCheckout = false;

  return {
    messaging: {
      transactionalOutbox: true,
      deliveryWorker: {
        available: true,
        enabled: workerEnabled,
        enableEnv: "MAW3ED_OUTBOX_WORKER=1",
        emailAdapterDefault: outboxPreferred ? "sandbox" : "auto"
      },
      emailMode: outboxPreferred ? "outbox" : emailMode,
      liveSendEnabled: !outboxPreferred && Boolean(env.SENDGRID_API_KEY || env.MAIL_FROM),
      sms: {
        enabled: false,
        reason: truthy(env.MAW3ED_SMS_ENABLED) ? "stub_not_implemented" : "not_wired"
      },
      whatsapp: {
        enabled: false,
        reason: truthy(env.MAW3ED_WHATSAPP_ENABLED) ? "stub_not_implemented" : "not_wired"
      }
    },
    billing: {
      manualRequest: true,
      hostedCheckout,
      reason: hostedCheckout
        ? "enabled"
        : "checkout_disabled_until_product_unlock_after_sandbox",
      sandboxAcceptance: {
        testsExist: true,
        envFlag: sandboxAcceptedEnv,
        hostedCheckoutRequested,
        unlockRequires: [
          "passing npm run test:phase6-integrations (billing-sandbox-acceptance)",
          "explicit product unlock (hostedCheckout stays false in Phase 6)"
        ]
      },
      providers: {
        whop: { checkout: false, verify: false, status: 410, sandboxWebhook: true },
        stripe: { enabled: false, reason: "not_wired", sandboxWebhook: true }
      }
    },
    webhooks: {
      sandbox: true,
      path: "/api/webhooks/sandbox/:provider",
      signature: "sha256 HMAC hex (header x-maw3ed-signature or x-signature)",
      providers: ["whop", "stripe", "sandbox"],
      activatesSubscription: false
    }
  };
}

function getCheckoutHttpStatus(capabilities = getIntegrationCapabilities()) {
  if (capabilities?.billing?.hostedCheckout) return 200;
  return 410;
}

module.exports = { getIntegrationCapabilities, getCheckoutHttpStatus };
