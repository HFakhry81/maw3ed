/**
 * Provider-specific webhook payload normalizers (sandbox mode).
 * Used before HMAC-verified ledger write. Does not activate subscriptions.
 */
function isPaymentLikeEvent(eventType) {
  const type = String(eventType || "").toLowerCase();
  return /payment|checkout|invoice|charge|subscription\.(created|updated|deleted)|refund/.test(type);
}

function requireMoneyFields(payload, eventType) {
  if (!isPaymentLikeEvent(eventType)) return;
  const amount = payload.amount ?? payload.data?.object?.amount ?? payload.data?.amount;
  const currency =
    payload.currency || payload.data?.object?.currency || payload.data?.currency || null;
  if (amount === undefined || amount === null || amount === "") {
    const error = new Error("payment-like sandbox event requires amount");
    error.statusCode = 400;
    error.code = "SANDBOX_AMOUNT_REQUIRED";
    throw error;
  }
  if (!currency) {
    const error = new Error("payment-like sandbox event requires currency");
    error.statusCode = 400;
    error.code = "SANDBOX_CURRENCY_REQUIRED";
    throw error;
  }
}

function normalizeWhopSandboxEvent(payload = {}) {
  const eventId = payload.eventId || payload.id || payload.data?.id || null;
  const eventType = payload.eventType || payload.type || payload.action || "whop.unknown";
  requireMoneyFields(payload, eventType);
  return {
    provider: "whop",
    eventId: eventId ? String(eventId) : null,
    eventType: String(eventType),
    amount: payload.amount ?? payload.data?.amount ?? null,
    currency: payload.currency || payload.data?.currency || null,
    status: payload.status || payload.data?.status || null,
    workspaceId: payload.workspaceId || payload.metadata?.workspaceId || null,
    rawKeys: Object.keys(payload || {})
  };
}

function normalizeStripeSandboxEvent(payload = {}) {
  const eventId = payload.eventId || payload.id || null;
  const eventType = payload.eventType || payload.type || "stripe.unknown";
  const object = payload.data?.object || {};
  const enriched = {
    ...payload,
    amount: payload.amount ?? object.amount_total ?? object.amount ?? null,
    currency: payload.currency || object.currency || null,
    status: payload.status || object.status || null,
    workspaceId: payload.workspaceId || object.metadata?.workspaceId || null
  };
  requireMoneyFields(enriched, eventType);
  return {
    provider: "stripe",
    eventId: eventId ? String(eventId) : null,
    eventType: String(eventType),
    amount: enriched.amount,
    currency: enriched.currency,
    status: enriched.status,
    workspaceId: enriched.workspaceId,
    rawKeys: Object.keys(payload || {})
  };
}

function normalizeSandboxProviderEvent(provider, payload = {}) {
  const clean = String(provider || "sandbox").toLowerCase();
  if (clean === "whop") return normalizeWhopSandboxEvent(payload);
  if (clean === "stripe") return normalizeStripeSandboxEvent(payload);
  const eventId = payload.eventId || payload.id || null;
  const eventType = payload.eventType || payload.type || "unknown";
  requireMoneyFields(payload, eventType);
  return {
    provider: clean,
    eventId: eventId ? String(eventId) : null,
    eventType: String(eventType),
    amount: payload.amount ?? null,
    currency: payload.currency || null,
    status: payload.status || null,
    workspaceId: payload.workspaceId || null,
    rawKeys: Object.keys(payload || {})
  };
}

module.exports = {
  isPaymentLikeEvent,
  normalizeWhopSandboxEvent,
  normalizeStripeSandboxEvent,
  normalizeSandboxProviderEvent
};
