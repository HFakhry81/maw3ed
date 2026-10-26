/**
 * Workspace operational event log (tenant audit slice).
 * Append-only JSONL under data/workspaces/<id>/events.jsonl — works for both
 * JSON local and PostgreSQL-backed ops without a Phase 2 DB migration.
 * Distinct from local-only /api/development-events telemetry.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const opsWorkspace = require("./opsWorkspace");

const BLOCKED_DETAIL_KEYS = new Set([
  "password",
  "token",
  "authorization",
  "cookie",
  "email",
  "phone",
  "nationalId",
  "ssn",
  "card",
  "patientName",
  "notes"
]);

function eventsPath(workspaceId) {
  return path.join(opsWorkspace.workspaceDir(workspaceId), "events.jsonl");
}

function sanitizeDetails(details = {}) {
  const out = {};
  for (const [key, value] of Object.entries(details || {})) {
    if (BLOCKED_DETAIL_KEYS.has(String(key))) continue;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = sanitizeDetails(value);
      continue;
    }
    if (typeof value === "string" && value.length > 240) {
      out[key] = `${value.slice(0, 240)}…`;
      continue;
    }
    out[key] = value;
  }
  return out;
}

function appendWorkspaceEvent(workspaceId, event = {}) {
  const id = sanitizeWorkspaceOrThrow(workspaceId);
  const record = {
    event_id: event.event_id || `wevt_${crypto.randomUUID()}`,
    timestamp: new Date().toISOString(),
    workspace_id: id,
    actor_type: event.actor_type || "user",
    actor_id: event.actor_id || null,
    role: event.role || null,
    action: String(event.action || "unknown").slice(0, 120),
    target_type: event.target_type || null,
    target_id: event.target_id || null,
    outcome: event.outcome || "success",
    details: sanitizeDetails(event.details || {})
  };

  const file = eventsPath(id);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const separator = current.length > 0 && !current.endsWith("\n") ? "\n" : "";
  fs.appendFileSync(file, `${separator}${JSON.stringify(record)}\n`, "utf8");
  return record;
}

function listWorkspaceEvents(workspaceId, { limit = 50 } = {}) {
  const id = sanitizeWorkspaceOrThrow(workspaceId);
  const file = eventsPath(id);
  const max = Math.min(Math.max(Number(limit) || 50, 1), 200);
  if (!fs.existsSync(file)) return [];

  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
  const events = [];
  for (let i = lines.length - 1; i >= 0 && events.length < max; i -= 1) {
    try {
      events.push(JSON.parse(lines[i]));
    } catch {
      /* skip corrupt line */
    }
  }
  return events;
}

function sanitizeWorkspaceOrThrow(workspaceId) {
  const id = opsWorkspace.sanitizeWorkspaceId(workspaceId);
  if (!id) {
    const error = new Error("Invalid workspace");
    error.statusCode = 400;
    throw error;
  }
  return id;
}

module.exports = {
  eventsPath,
  appendWorkspaceEvent,
  listWorkspaceEvents,
  sanitizeDetails
};
