/**
 * Phase 3 — atomic booking / availability helpers (JSON + PG-ready).
 *
 * Interval occupancy uses half-open [start, end) where end includes service
 * duration + bufferMinutes. Cancelled appointments do not occupy capacity.
 * Hold expiry/cancel frees a soft hold at most once.
 *
 * Per-workspace async mutex serializes booking mutations so overlapping
 * concurrent creates cannot both commit on the local JSON path. PostgreSQL
 * workspaces additionally use advisory locks inside opsWorkspace.runWithWorkspaceAsync.
 */
const workspaceLocks = new Map();

const OCCUPYING_STATUSES = new Set([
  "pending",
  "confirmed",
  "checked_in",
  "completed",
  "no_show"
]);

function normalizeIdempotencyKey(value) {
  const key = String(value || "").trim();
  if (!key) return "";
  if (key.length > 128) return key.slice(0, 128);
  return key;
}

function rangesOverlap(startA, endA, startB, endB) {
  return Number(startA) < Number(endB) && Number(startB) < Number(endA);
}

function toMinutes(hhmm) {
  const [hours, minutes] = String(hhmm || "0:0").split(":").map(Number);
  return hours * 60 + minutes;
}

function fromMinutes(total) {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function serviceBlockMinutes(service, appointment = null) {
  const duration = Number(
    appointment?.durationMinutes || service?.durationMinutes || 30
  );
  const buffer = Number(service?.bufferMinutes || 0);
  return duration + buffer;
}

function appointmentOccupiesCapacity(appointment) {
  if (!appointment) return false;
  const status = String(appointment.status || "pending");
  if (status === "cancelled" || status === "canceled") return false;
  return OCCUPYING_STATUSES.has(status) || !status;
}

function findAppointmentByIdempotencyKey(appointments, key) {
  const normalized = normalizeIdempotencyKey(key);
  if (!normalized) return null;
  return (appointments || []).find(
    (item) => normalizeIdempotencyKey(item.idempotencyKey) === normalized
  ) || null;
}

function findStaffOverlap({
  appointments,
  services,
  staffId,
  date,
  startMinutes,
  endMinutes,
  excludeAppointmentId = null
}) {
  const serviceById = new Map((services || []).map((item) => [item.id, item]));
  for (const item of appointments || []) {
    if (excludeAppointmentId && item.id === excludeAppointmentId) continue;
    if (item.date !== date || item.staffId !== staffId) continue;
    if (!appointmentOccupiesCapacity(item)) continue;
    const service = item.serviceId ? serviceById.get(item.serviceId) : null;
    const otherStart = toMinutes(item.time);
    const otherEnd = otherStart + serviceBlockMinutes(service, item);
    if (rangesOverlap(startMinutes, endMinutes, otherStart, otherEnd)) {
      return item;
    }
  }
  return null;
}

/**
 * Serialize async work per workspace id (in-process).
 * Starts an async IIFE in the caller's AsyncLocalStorage context so workspace
 * ALS from opsWorkspace.runWithWorkspaceAsync is preserved across the mutex.
 */
function withBookingLock(workspaceId, fn) {
  const key = String(workspaceId || "default");
  const state = workspaceLocks.get(key) || { mutex: Promise.resolve() };
  let release = () => {};
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const previous = state.mutex.catch(() => undefined);
  state.mutex = previous.then(() => gate);
  workspaceLocks.set(key, state);

  return (async () => {
    await previous;
    try {
      return await fn();
    } finally {
      release();
      if (workspaceLocks.get(key) === state && state.mutex === previous.then(() => gate)) {
        // Keep the chain for waiters; entry is replaced on next lock acquisition.
      }
    }
  })();
}

function holdKey(staffId, date, time) {
  return `${staffId}|${date}|${time}`;
}

/**
 * Free a soft hold at most once. Returns { freed: boolean }.
 */
function holdMapHas(holdsMap, key) {
  if (!holdsMap) return false;
  if (typeof holdsMap.has === "function") return holdsMap.has(key);
  return holdsMap.get(key) != null;
}

function releaseHoldOnce(holdsMap, { staffId, date, time }, persistFn) {
  const key = holdKey(staffId, date, time);
  const existed = holdMapHas(holdsMap, key);
  if (existed) {
    holdsMap.delete(key);
    if (typeof persistFn === "function") persistFn();
  }
  return { freed: existed, key };
}

/**
 * Drop expired holds. Returns how many were removed this call.
 */
function purgeExpiredHoldsOnce(holdsMap, now = Date.now(), persistFn) {
  let removed = 0;
  const entries =
    typeof holdsMap.entries === "function" ? [...holdsMap.entries()] : [];
  for (const [key, expiresAt] of entries) {
    if (Number(expiresAt) <= now) {
      holdsMap.delete(key);
      removed += 1;
    }
  }
  if (removed && typeof persistFn === "function") persistFn();
  return { removed };
}

/**
 * Civil calendar date (YYYY-MM-DD) for an instant in a given IANA timezone.
 * Used so "today" / availability day matches bookingPage.timezone, not UTC.
 */
function civilDateInTimeZone(instant = new Date(), timeZone = "Africa/Cairo") {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || "Africa/Cairo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(instant instanceof Date ? instant : new Date(instant));
  } catch {
    return new Date(instant).toISOString().slice(0, 10);
  }
}

/**
 * Occupancy interval for a booking attempt, shared by slot listing and final create.
 * Contract: wall-clock minutes on the civil `date` string; end = start + duration + buffer.
 * DST note: Maw3ed stores local wall date/time (not UTC instants). Block length is
 * wall-clock minutes, identical for availability and booking on that civil day.
 */
function occupancyInterval({ date, time, durationMinutes, bufferMinutes = 0 }) {
  const start = toMinutes(time);
  const block = Math.max(0, Number(durationMinutes) || 0) + Math.max(0, Number(bufferMinutes) || 0);
  return {
    date: String(date || ""),
    startMinutes: start,
    endMinutes: start + block,
    blockMinutes: block
  };
}

function resolveIdempotencyKeyFromRequest(req, body = {}) {
  const header =
    (req && (req.headers?.["idempotency-key"] || req.headers?.["Idempotency-Key"])) || "";
  return normalizeIdempotencyKey(body?.idempotencyKey || header);
}

module.exports = {
  OCCUPYING_STATUSES,
  normalizeIdempotencyKey,
  resolveIdempotencyKeyFromRequest,
  rangesOverlap,
  toMinutes,
  fromMinutes,
  serviceBlockMinutes,
  appointmentOccupiesCapacity,
  findAppointmentByIdempotencyKey,
  findStaffOverlap,
  withBookingLock,
  holdKey,
  releaseHoldOnce,
  purgeExpiredHoldsOnce,
  civilDateInTimeZone,
  occupancyInterval
};
