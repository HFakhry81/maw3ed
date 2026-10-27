#!/usr/bin/env node
/**
 * Phase 8 — production-like posture checks (no live Stripe/WhatsApp claims).
 */
const { evaluateRuntimePosture, assertRuntimePosture } = require("../runtimePosture");
const { evaluateSecretsPosture } = require("../secretsPosture");
const { getIntegrationCapabilities, getCheckoutHttpStatus } = require("../billingCapabilities");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function main() {
  const checks = [];

  const local = evaluateRuntimePosture({ MAW3ED_ENV: "local", MAW3ED_STORAGE: "json" }, { databaseConfigured: false });
  assert(local.ok === true && local.authRequired === false, "local allows unauthenticated prototype");
  checks.push("local-prototype-ok");

  const prodAuth = evaluateRuntimePosture(
    {
      MAW3ED_ENV: "production",
      SESSION_SECRET: "production-grade-session-secret-value-32",
      CLERK_SECRET_KEY: "sk_test",
      MAW3ED_STORAGE: "postgres",
      DATABASE_URL: "postgresql://u:p@127.0.0.1:5432/maw3ed"
    },
    { databaseConfigured: true }
  );
  assert(prodAuth.ok === true && prodAuth.authRequired === true, "production requires auth");
  assert(prodAuth.storageMode === "postgres", "production prefers postgres when configured");
  checks.push("production-auth-postgres");

  const prodJsonStrict = evaluateRuntimePosture(
    {
      MAW3ED_ENV: "production",
      SESSION_SECRET: "production-grade-session-secret-value-32",
      CLERK_SECRET_KEY: "sk_test",
      MAW3ED_STORAGE: "json",
      MAW3ED_STRICT_PRODUCTION_STORAGE: "1"
    },
    { databaseConfigured: false }
  );
  assert(prodJsonStrict.ok === false, "strict production rejects json storage");
  assert(prodJsonStrict.errors.includes("production_json_storage_forbidden"), "json forbidden error");
  checks.push("production-json-strict");

  const weakSecrets = evaluateSecretsPosture({
    MAW3ED_ENV: "production",
    SESSION_SECRET: "changeme",
    MAW3ED_STORAGE: "postgres"
  });
  assert(weakSecrets.ok === false, "weak secrets fail closed");
  checks.push("production-secrets-fail-closed");

  assertRuntimePosture(
    {
      MAW3ED_ENV: "production",
      SESSION_SECRET: "production-grade-session-secret-value-32",
      CLERK_SECRET_KEY: "sk_test",
      MAW3ED_STORAGE: "postgres",
      DATABASE_URL: "postgresql://u:p@127.0.0.1:5432/maw3ed"
    },
    { databaseConfigured: true }
  );
  checks.push("assert-runtime-posture");

  const caps = getIntegrationCapabilities({ MAW3ED_EMAIL_MODE: "outbox", MAW3ED_HOSTED_CHECKOUT: "1" });
  assert(caps.billing.hostedCheckout === false, "hostedCheckout remains gated");
  assert(getCheckoutHttpStatus(caps) === 410, "checkout HTTP gate 410");
  assert(caps.messaging.sms.enabled === false, "sms not claimed");
  assert(caps.messaging.whatsapp.enabled === false, "whatsapp not claimed");
  assert(caps.billing.providers.stripe.enabled === false, "stripe not claimed live");
  checks.push("integrations-still-gated");

  console.log(
    JSON.stringify(
      {
        ok: true,
        suite: "smoke-production-posture",
        checks,
        note: "Unit posture only. Optional HTTP gate: npm run check:staging. No Stripe/WhatsApp live claim."
      },
      null,
      2
    )
  );
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({ ok: false, suite: "smoke-production-posture", error: error.message }, null, 2));
  process.exit(1);
}
