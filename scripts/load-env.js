/**
 * Unified env loader — only two modes: local | production.
 *
 * Resolution order:
 * 1. process.env.MAW3ED_ENV (local|production)
 * 2. file .env.mode containing one word: local|production
 * 3. default: local
 *
 * Loads (without overriding existing process.env keys):
 * - .env.<mode>   e.g. .env.local / .env.production
 * - then .env     as shared fallback
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const raw of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function applyEnv(map) {
  for (const [key, value] of Object.entries(map)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function resolveMode() {
  const fromEnv = String(process.env.MAW3ED_ENV || "").trim().toLowerCase();
  if (fromEnv === "local" || fromEnv === "production") return fromEnv;

  const modeFile = path.join(root, ".env.mode");
  if (fs.existsSync(modeFile)) {
    const raw = fs.readFileSync(modeFile, "utf8").trim().toLowerCase();
    if (raw === "local" || raw === "production") return raw;
  }
  return "local";
}

function loadEnv(options = {}) {
  const mode = options.mode || resolveMode();
  if (mode !== "local" && mode !== "production") {
    throw new Error(`MAW3ED_ENV must be "local" or "production" (got "${mode}")`);
  }

  process.env.MAW3ED_ENV = mode;

  // Mode file first, then shared .env fallback (do not override explicit env).
  applyEnv(parseEnvFile(path.join(root, `.env.${mode}`)));
  applyEnv(parseEnvFile(path.join(root, ".env")));

  // Normalize derived defaults per mode.
  if (!process.env.PORT) process.env.PORT = "7000";
  if (!process.env.VITE_PORT) process.env.VITE_PORT = "7100";
  if (!process.env.BACKEND_PORT) process.env.BACKEND_PORT = process.env.PORT || "7000";

  if (mode === "local") {
    if (!process.env.MAW3ED_STORAGE) process.env.MAW3ED_STORAGE = "local";
    if (!process.env.MAW3ED_EMAIL_MODE) process.env.MAW3ED_EMAIL_MODE = "outbox";
  }

  if (mode === "production") {
    if (!process.env.MAW3ED_STORAGE) process.env.MAW3ED_STORAGE = "postgres";
    if (process.env.MAW3ED_EMAIL_MODE === undefined) process.env.MAW3ED_EMAIL_MODE = "";
  }

  return {
    mode,
    storage: process.env.MAW3ED_STORAGE || "local",
    port: Number(process.env.PORT || 7000),
    vitePort: Number(process.env.VITE_PORT || 7100)
  };
}

const loaded = loadEnv();

module.exports = { loadEnv, resolveMode, loaded };
