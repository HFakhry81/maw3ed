/**
 * Transactional outbox (Phase 6 package 1).
 * Append-only JSONL with idempotency keys, attempt counters, and status.
 * Delivery workers / email adapters consume pending rows; feature stays
 * sandbox-safe when MAW3ED_EMAIL_MODE=outbox.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DEFAULT_FILE = path.join(__dirname, "data", "transactional-outbox.jsonl");
const MAX_ATTEMPTS = 5;

function outboxPath() {
  return process.env.MAW3ED_OUTBOX_FILE || DEFAULT_FILE;
}

function createId(prefix = "outbox") {
  return `${prefix}-${crypto.randomBytes(6).toString("hex")}`;
}

function readAll(file = outboxPath()) {
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, "utf8");
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function appendRow(row, file = outboxPath()) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const separator = current.length > 0 && !current.endsWith("\n") ? "\n" : "";
  fs.appendFileSync(file, `${separator}${JSON.stringify(row)}\n`, "utf8");
  return row;
}

function rewriteAll(rows, file = outboxPath()) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${rows.map((row) => JSON.stringify(row)).join("\n")}${rows.length ? "\n" : ""}`, "utf8");
}

/**
 * Enqueue a message. Same idempotencyKey returns the existing row (no duplicate).
 */
function enqueue({
  channel = "email",
  type,
  payload = {},
  idempotencyKey = "",
  workspaceId = null,
  maxAttempts = MAX_ATTEMPTS
} = {}) {
  const key = String(idempotencyKey || "").trim();
  const rows = readAll();
  if (key) {
    const existing = rows.find((row) => row.idempotencyKey === key);
    if (existing) return { row: existing, created: false };
  }
  const row = {
    id: createId(),
    channel: String(channel || "email"),
    type: String(type || "generic"),
    workspaceId: workspaceId || null,
    idempotencyKey: key || null,
    payload,
    status: "pending",
    attempts: 0,
    maxAttempts: Math.max(1, Number(maxAttempts) || MAX_ATTEMPTS),
    nextAttemptAt: new Date().toISOString(),
    lastError: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deliveredAt: null
  };
  appendRow(row);
  return { row, created: true };
}

function listPending({ now = Date.now(), limit = 50 } = {}) {
  const lim = Math.min(200, Math.max(1, Number(limit) || 50));
  return readAll()
    .filter((row) => row.status === "pending" && new Date(row.nextAttemptAt || 0).getTime() <= now)
    .slice(0, lim);
}

function markDelivered(id, details = {}) {
  const rows = readAll();
  const index = rows.findIndex((row) => row.id === id);
  if (index < 0) return null;
  rows[index] = {
    ...rows[index],
    status: "delivered",
    attempts: Number(rows[index].attempts || 0) + 1,
    updatedAt: new Date().toISOString(),
    deliveredAt: new Date().toISOString(),
    delivery: details
  };
  rewriteAll(rows);
  return rows[index];
}

function markFailed(id, errorMessage = "") {
  const rows = readAll();
  const index = rows.findIndex((row) => row.id === id);
  if (index < 0) return null;
  const attempts = Number(rows[index].attempts || 0) + 1;
  const maxAttempts = Number(rows[index].maxAttempts || MAX_ATTEMPTS);
  const backoffMs = Math.min(60 * 60 * 1000, 1000 * 2 ** Math.min(attempts, 8));
  const exhausted = attempts >= maxAttempts;
  rows[index] = {
    ...rows[index],
    status: exhausted ? "dead" : "pending",
    attempts,
    lastError: String(errorMessage || "delivery_failed").slice(0, 500),
    nextAttemptAt: new Date(Date.now() + backoffMs).toISOString(),
    updatedAt: new Date().toISOString()
  };
  rewriteAll(rows);
  return rows[index];
}

function summarize() {
  const rows = readAll();
  const byStatus = {};
  for (const row of rows) {
    byStatus[row.status] = (byStatus[row.status] || 0) + 1;
  }
  return { total: rows.length, byStatus };
}

module.exports = {
  MAX_ATTEMPTS,
  enqueue,
  listPending,
  markDelivered,
  markFailed,
  summarize,
  readAll,
  outboxPath
};
