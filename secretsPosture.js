/**
 * Secrets posture checks (Phase 7 package 1).
 * Never logs secret values — only presence, length class, and known-weak defaults.
 */

const SENSITIVE_ENV_KEYS = [
  "SESSION_SECRET",
  "CLERK_SECRET_KEY",
  "CLERK_JWT_KEY",
  "DATABASE_URL",
  "SENDGRID_API_KEY",
  "WHOP_API_KEY",
  "WHOP_WEBHOOK_SECRET",
  "MAW3ED_WEBHOOK_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET"
];

const WEAK_SESSION_DEFAULTS = new Set([
  "development-only-verification-secret",
  "changeme",
  "secret",
  "password",
  "maw3ed",
  "test"
]);

function classifyPresence(value) {
  if (value === undefined || value === null || String(value).trim() === "") return "missing";
  const text = String(value);
  if (text.length < 8) return "too_short";
  if (text.length < 24) return "short";
  return "present";
}

function isWeakSessionSecret(value) {
  const text = String(value || "").trim();
  if (!text) return true;
  if (WEAK_SESSION_DEFAULTS.has(text.toLowerCase())) return true;
  if (text.length < 16) return true;
  return false;
}

function redactValue(value) {
  if (value === undefined || value === null || value === "") return "";
  const text = String(value);
  if (text.length <= 8) return "***";
  return `${text.slice(0, 2)}…${text.slice(-2)} (len=${text.length})`;
}

function redactObject(input = {}, { keys = SENSITIVE_ENV_KEYS } = {}) {
  const sensitive = new Set(keys.map((key) => key.toLowerCase()));
  const out = {};
  for (const [key, value] of Object.entries(input || {})) {
    if (sensitive.has(String(key).toLowerCase()) || /secret|password|token|api[_-]?key/i.test(key)) {
      out[key] = typeof value === "string" && value ? "[REDACTED]" : value ? "[REDACTED]" : value;
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = redactObject(value, { keys });
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Evaluate secrets posture without printing values.
 */
function evaluateSecretsPosture(env = process.env) {
  const mode = String(env.MAW3ED_ENV || "local").trim().toLowerCase();
  const warnings = [];
  const errors = [];
  const inventory = {};

  for (const key of SENSITIVE_ENV_KEYS) {
    inventory[key] = classifyPresence(env[key]);
  }

  const session = env.SESSION_SECRET;
  if (mode === "production") {
    if (!session || isWeakSessionSecret(session)) {
      errors.push("production_weak_or_missing_session_secret");
    }
    if (!env.CLERK_SECRET_KEY && env.MAW3ED_REQUIRE_AUTH !== "0") {
      warnings.push("production_missing_clerk_secret_key");
    }
    if (String(env.DATABASE_URL || "").includes("CHANGE_ME")) {
      errors.push("production_placeholder_database_url");
    }
    if (inventory.DATABASE_URL === "missing" && String(env.MAW3ED_STORAGE || "").toLowerCase() === "postgres") {
      errors.push("production_postgres_without_database_url");
    }
  } else if (session && isWeakSessionSecret(session)) {
    warnings.push("local_default_session_secret");
  }

  if (env.MAW3ED_WEBHOOK_SECRET && String(env.MAW3ED_WEBHOOK_SECRET).length < 16) {
    warnings.push("webhook_secret_short");
  }

  return {
    mode,
    ok: errors.length === 0,
    inventory,
    warnings,
    errors,
    redaction: "values_never_logged"
  };
}

function assertSecretsPosture(env = process.env) {
  const posture = evaluateSecretsPosture(env);
  if (!posture.ok) {
    const error = new Error(`Secrets posture failed: ${posture.errors.join(", ")}`);
    error.statusCode = 503;
    error.code = "secrets_posture";
    error.posture = posture;
    throw error;
  }
  return posture;
}

module.exports = {
  SENSITIVE_ENV_KEYS,
  classifyPresence,
  isWeakSessionSecret,
  redactValue,
  redactObject,
  evaluateSecretsPosture,
  assertSecretsPosture
};
