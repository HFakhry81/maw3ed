/**
 * Billing / checkout sandbox acceptance contract (Phase 6).
 * Passing this suite does NOT enable hostedCheckout — that stays gated.
 */
const webhooks = require("./webhookSandbox");
const { normalizeSandboxProviderEvent } = require("./providerWebhookAdapters");
const { getIntegrationCapabilities, getCheckoutHttpStatus } = require("./billingCapabilities");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/**
 * Run in-process sandbox acceptance checks.
 * Safe: no network, no subscription activation, checkout remains gated.
 */
function runBillingSandboxAcceptance({ pid = process.pid } = {}) {
  const checks = [];

  const caps = getIntegrationCapabilities({
    MAW3ED_EMAIL_MODE: "outbox",
    MAW3ED_HOSTED_CHECKOUT: "1",
    MAW3ED_BILLING_SANDBOX_ACCEPTED: "0"
  });
  assert(caps.billing.hostedCheckout === false, "hostedCheckout stays false without sandbox acceptance env");
  assert(getCheckoutHttpStatus(caps) === 410, "checkout HTTP remains 410 while gated");
  checks.push("checkout-gated-without-acceptance-env");

  const unlockedCaps = getIntegrationCapabilities({
    MAW3ED_EMAIL_MODE: "outbox",
    MAW3ED_HOSTED_CHECKOUT: "1",
    MAW3ED_BILLING_SANDBOX_ACCEPTED: "1"
  });
  // Even with both envs, package policy keeps hostedCheckout false unless explicitly allowed in code path.
  // Acceptance proves the gate helpers; production unlock is a later product decision.
  assert(unlockedCaps.billing.hostedCheckout === false, "hostedCheckout remains policy-gated after sandbox tests");
  assert(unlockedCaps.billing.sandboxAcceptance.testsExist === true, "sandbox acceptance advertised");
  checks.push("checkout-remains-policy-gated");

  const whopBody = {
    eventId: `accept-whop-${pid}`,
    eventType: "payment.succeeded",
    amount: 2500,
    currency: "USD",
    status: "paid",
    workspaceId: "ws-accept"
  };
  const whopSig = webhooks.signBody(JSON.stringify(whopBody), "whop");
  const whop = webhooks.handleSandboxWebhook({
    provider: "whop",
    rawBody: JSON.stringify(whopBody),
    signatureHeader: whopSig,
    eventId: whopBody.eventId,
    eventType: whopBody.eventType,
    payload: whopBody
  });
  assert(whop.accepted === true && whop.activatesSubscription === false, "whop sandbox accepts without activation");
  checks.push("whop-payment-sandbox");

  const stripeBody = {
    id: `evt_stripe_${pid}`,
    type: "checkout.session.completed",
    data: { object: { amount_total: 1200, currency: "usd", status: "complete", metadata: { workspaceId: "ws-accept" } } }
  };
  const stripeNorm = normalizeSandboxProviderEvent("stripe", stripeBody);
  assert(stripeNorm.amount === 1200 && stripeNorm.currency === "usd", "stripe normalizer maps money fields");
  const stripeSig = webhooks.signBody(JSON.stringify(stripeBody), "stripe");
  const stripe = webhooks.handleSandboxWebhook({
    provider: "stripe",
    rawBody: JSON.stringify(stripeBody),
    signatureHeader: `sha256=${stripeSig}`,
    eventId: stripeBody.id,
    eventType: stripeBody.type,
    payload: stripeBody
  });
  assert(stripe.accepted === true && stripe.hostedCheckout === false, "stripe sandbox accepts; checkout still off");
  checks.push("stripe-checkout-event-sandbox");

  let missingMoney = null;
  try {
    normalizeSandboxProviderEvent("stripe", {
      id: `evt_bad_${pid}`,
      type: "payment_intent.succeeded",
      data: { object: {} }
    });
  } catch (error) {
    missingMoney = error;
  }
  assert(missingMoney?.code === "SANDBOX_AMOUNT_REQUIRED", "payment-like events require amount");
  checks.push("payment-event-validation");

  return {
    ok: true,
    suite: "billing-sandbox-acceptance",
    checks,
    hostedCheckoutEnabled: false,
    note: "Sandbox webhook/payment-event contract passed; hostedCheckout stays gated (no live Stripe/Whop capture)."
  };
}

module.exports = { runBillingSandboxAcceptance };
