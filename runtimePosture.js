/**
 * Production / non-local security posture for Maw3ed.
 * Auth must fail closed outside local. JSON storage must never skip membership.
 */

function authRequiredForEnv(env = process.env) {
  return env.MAW3ED_ENV === "production" || env.MAW3ED_REQUIRE_AUTH === "1";
}

function resolveStorageMode(env = process.env, databaseConfigured = false) {
  const configured = String(env.MAW3ED_STORAGE || "").trim().toLowerCase();
  if (configured === "postgres" && databaseConfigured) return "postgres";
  if (configured === "postgres" && !databaseConfigured) return "json-fallback";
  if (configured === "local" || configured === "json" || configured === "") return "json";
  return configured || "json";
}

/**
 * Evaluate runtime posture without mutating env.
 * Decisions (Phase 1):
 * - production always requires auth
 * - JSON may be used for isolated production-like acceptance checks, but membership
 *   must still be proven; default production storage remains postgres via load-env
 * - hard refusal of JSON in production is opt-in via MAW3ED_STRICT_PRODUCTION_STORAGE=1
 *   unless MAW3ED_ALLOW_JSON_IN_PRODUCTION=1
 */
function evaluateRuntimePosture(env = process.env, { databaseConfigured = false } = {}) {
  const mode = String(env.MAW3ED_ENV || "local").trim().toLowerCase();
  const authRequired = authRequiredForEnv(env);
  const storageMode = resolveStorageMode(env, databaseConfigured);
  const usingJson = storageMode !== "postgres";
  const allowJsonInProduction = env.MAW3ED_ALLOW_JSON_IN_PRODUCTION === "1";
  const strictStorage = env.MAW3ED_STRICT_PRODUCTION_STORAGE === "1";
  const warnings = [];
  const errors = [];

  if (mode === "production" && !authRequired) {
    errors.push("production_requires_auth");
  }

  if (mode === "production" && usingJson) {
    warnings.push("production_using_json_storage");
    if (strictStorage && !allowJsonInProduction) {
      errors.push("production_json_storage_forbidden");
    }
  }

  if (mode === "production" && storageMode === "json-fallback") {
    warnings.push("production_postgres_requested_but_unavailable");
    if (strictStorage && !allowJsonInProduction) {
      errors.push("production_postgres_unavailable");
    }
  }

  let secrets = null;
  try {
    secrets = require("./secretsPosture").evaluateSecretsPosture(env);
    for (const warning of secrets.warnings || []) warnings.push(warning);
    if (mode === "production") {
      for (const error of secrets.errors || []) errors.push(error);
    }
  } catch {
    secrets = null;
  }

  return {
    mode,
    authRequired,
    storageMode,
    usingJson,
    allowJsonInProduction,
    strictStorage,
    membershipRequiredWhenAuth: true,
    jsonSkipsMembership: false,
    secrets: secrets
      ? { ok: secrets.ok, inventory: secrets.inventory, warnings: secrets.warnings, errors: secrets.errors }
      : null,
    warnings,
    errors,
    ok: errors.length === 0
  };
}

function assertRuntimePosture(env = process.env, options = {}) {
  const posture = evaluateRuntimePosture(env, options);
  if (!posture.ok) {
    const error = new Error(`Runtime security posture failed: ${posture.errors.join(", ")}`);
    error.statusCode = 503;
    error.code = "runtime_posture";
    error.posture = posture;
    throw error;
  }
  return posture;
}

function logRuntimePosture(posture, logger = console) {
  if (!posture) return;
  if (posture.warnings.length) {
    logger.warn("[posture]", posture.mode, posture.storageMode, posture.warnings.join(", "));
  }
  if (!posture.ok) {
    logger.error("[posture] blocked:", posture.errors.join(", "));
  }
}

module.exports = {
  authRequiredForEnv,
  resolveStorageMode,
  evaluateRuntimePosture,
  assertRuntimePosture,
  logRuntimePosture
};
