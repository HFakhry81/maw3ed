/**
 * Signed, time-limited booking manage tokens (cancel / reschedule / enrollment cancel).
 * Separate from checkInToken — pass QR must not grant cancel power.
 *
 * Token format: bam_<base64url(json)>.<hmac>
 * Single-use per action tracked in per-workspace JSON sidecar (works for JSON + PG ops).
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function secret() {
  return process.env.BOOKING_ACTION_SECRET || process.env.SESSION_SECRET || "development-only-verification-secret";
}

function b64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromB64url(value) {
  const pad = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4));
  return Buffer.from(String(value).replace(/-/g, "+").replace(/_/g, "/") + pad, "base64").toString("utf8");
}

function signPayload(payloadObj) {
  const body = b64url(JSON.stringify(payloadObj));
  const sig = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return `bam_${body}.${sig}`;
}

function verifyRawToken(token) {
  const raw = String(token || "").trim();
  const match = raw.match(/^bam_([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/);
  if (!match) {
    const error = new Error("رابط الإدارة غير صالح");
    error.statusCode = 404;
    error.code = "MANAGE_TOKEN_INVALID";
    throw error;
  }
  const [, body, sig] = match;
  const expected = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    const error = new Error("رابط الإدارة غير صالح");
    error.statusCode = 404;
    error.code = "MANAGE_TOKEN_INVALID";
    throw error;
  }
  let payload;
  try {
    payload = JSON.parse(fromB64url(body));
  } catch {
    const error = new Error("رابط الإدارة غير صالح");
    error.statusCode = 404;
    error.code = "MANAGE_TOKEN_INVALID";
    throw error;
  }
  if (!payload || !payload.jti || !payload.exp) {
    const error = new Error("رابط الإدارة غير صالح");
    error.statusCode = 404;
    error.code = "MANAGE_TOKEN_INVALID";
    throw error;
  }
  if (Date.now() > Number(payload.exp)) {
    const error = new Error("انتهت صلاحية رابط الإدارة");
    error.statusCode = 410;
    error.code = "MANAGE_TOKEN_EXPIRED";
    throw error;
  }
  return payload;
}

function tokensPath(workspaceId) {
  const id = String(workspaceId || "local-default").replace(/[^a-zA-Z0-9_-]/g, "") || "local-default";
  return path.join(__dirname, "data", "workspaces", id, "booking-action-tokens.json");
}

function loadLedger(workspaceId) {
  const file = tokensPath(workspaceId);
  try {
    if (!fs.existsSync(file)) return { tokens: {} };
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    return { tokens: raw.tokens && typeof raw.tokens === "object" ? raw.tokens : {} };
  } catch {
    return { tokens: {} };
  }
}

function saveLedger(workspaceId, ledger) {
  const file = tokensPath(workspaceId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ tokens: ledger.tokens || {}, updatedAt: new Date().toISOString() }, null, 2));
}

function issueAppointmentManageToken(workspaceId, appointmentId, { ttlMs = DEFAULT_TTL_MS } = {}) {
  const ttl = Math.min(MAX_TTL_MS, Math.max(60_000, Number(ttlMs) || DEFAULT_TTL_MS));
  const jti = crypto.randomBytes(16).toString("base64url");
  const exp = Date.now() + ttl;
  const payload = {
    kind: "appointment",
    workspaceId: String(workspaceId || ""),
    appointmentId: String(appointmentId || ""),
    jti,
    exp,
    actions: ["cancel", "reschedule"]
  };
  const ledger = loadLedger(workspaceId);
  ledger.tokens[jti] = {
    kind: "appointment",
    appointmentId: payload.appointmentId,
    usedCancel: false,
    usedReschedule: false,
    exp,
    createdAt: new Date().toISOString()
  };
  saveLedger(workspaceId, ledger);
  const token = signPayload(payload);
  return {
    token,
    expiresAt: new Date(exp).toISOString(),
    managePath: null // filled by caller with slug
  };
}

function issueEnrollmentManageToken(workspaceId, enrollmentId, { ttlMs = DEFAULT_TTL_MS } = {}) {
  const ttl = Math.min(MAX_TTL_MS, Math.max(60_000, Number(ttlMs) || DEFAULT_TTL_MS));
  const jti = crypto.randomBytes(16).toString("base64url");
  const exp = Date.now() + ttl;
  const payload = {
    kind: "enrollment",
    workspaceId: String(workspaceId || ""),
    enrollmentId: String(enrollmentId || ""),
    jti,
    exp,
    actions: ["cancel"]
  };
  const ledger = loadLedger(workspaceId);
  ledger.tokens[jti] = {
    kind: "enrollment",
    enrollmentId: payload.enrollmentId,
    usedCancel: false,
    exp,
    createdAt: new Date().toISOString()
  };
  saveLedger(workspaceId, ledger);
  return {
    token: signPayload(payload),
    expiresAt: new Date(exp).toISOString()
  };
}

function assertActionAllowed(workspaceId, payload, action) {
  const ledger = loadLedger(workspaceId);
  const row = ledger.tokens[payload.jti];
  if (!row) {
    const error = new Error("رابط الإدارة غير معروف أو أُبطل");
    error.statusCode = 404;
    error.code = "MANAGE_TOKEN_UNKNOWN";
    throw error;
  }
  if (Number(row.exp) && Date.now() > Number(row.exp)) {
    const error = new Error("انتهت صلاحية رابط الإدارة");
    error.statusCode = 410;
    error.code = "MANAGE_TOKEN_EXPIRED";
    throw error;
  }
  if (payload.kind === "appointment") {
    if (String(row.appointmentId) !== String(payload.appointmentId)) {
      const error = new Error("رابط الإدارة غير صالح");
      error.statusCode = 404;
      throw error;
    }
    if (action === "cancel" && row.usedCancel) {
      const error = new Error("تم استخدام رابط الإلغاء مسبقاً");
      error.statusCode = 409;
      error.code = "MANAGE_TOKEN_USED";
      throw error;
    }
    if (action === "reschedule" && row.usedReschedule) {
      const error = new Error("تم استخدام رابط إعادة الجدولة مسبقاً");
      error.statusCode = 409;
      error.code = "MANAGE_TOKEN_USED";
      throw error;
    }
  }
  if (payload.kind === "enrollment") {
    if (String(row.enrollmentId) !== String(payload.enrollmentId)) {
      const error = new Error("رابط الإدارة غير صالح");
      error.statusCode = 404;
      throw error;
    }
    if (action === "cancel" && row.usedCancel) {
      const error = new Error("تم استخدام رابط إلغاء التسجيل مسبقاً");
      error.statusCode = 409;
      error.code = "MANAGE_TOKEN_USED";
      throw error;
    }
  }
  return { ledger, row };
}

function consumeAction(workspaceId, payload, action) {
  const { ledger, row } = assertActionAllowed(workspaceId, payload, action);
  if (action === "cancel") row.usedCancel = true;
  if (action === "reschedule") row.usedReschedule = true;
  row[`used${action === "cancel" ? "Cancel" : "Reschedule"}At`] = new Date().toISOString();
  ledger.tokens[payload.jti] = row;
  saveLedger(workspaceId, ledger);
  return row;
}

function inspectToken(token) {
  return verifyRawToken(token);
}

function getLedgerEntry(workspaceId, jti) {
  const ledger = loadLedger(workspaceId);
  return ledger.tokens[String(jti || "")] || null;
}

module.exports = {
  DEFAULT_TTL_MS,
  issueAppointmentManageToken,
  issueEnrollmentManageToken,
  inspectToken,
  assertActionAllowed,
  consumeAction,
  verifyRawToken,
  getLedgerEntry
};
