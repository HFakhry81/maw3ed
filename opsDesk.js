/**
 * Department desk — attendance / check-in / add-ons / visit pricing.
 * Works on top of opsStore appointment records (visit fields live on the appointment).
 */
const crypto = require("crypto");

function todayInTimezone(timezone = "Africa/Cairo") {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone || "Africa/Cairo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function createCheckInToken() {
  return `chk_${crypto.randomBytes(18).toString("base64url")}`;
}

function sumLineItems(items = []) {
  return (items || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
}

function lineNeedsFinalPrice(line) {
  const pricingType = String(line?.pricingType || "fixed");
  const status = String(line?.pricingStatus || "");
  if (pricingType === "range") {
    return status !== "range_final";
  }
  if (pricingType === "on_request") {
    return status !== "quoted";
  }
  return false;
}

function finalizeLineStatus(pricingType) {
  if (pricingType === "range") return "range_final";
  if (pricingType === "on_request") return "quoted";
  if (pricingType === "free") return "free";
  return "fixed";
}

function buildLinePricingMeta(service, pricing = {}) {
  const pricingType = String(pricing.pricingType || service?.pricingType || "fixed");
  const priceMin = Math.round(Number(
    pricing.priceMin != null ? pricing.priceMin : service?.priceMin ?? service?.price ?? 0
  ) || 0);
  const priceMax = Math.round(Number(
    pricing.priceMax != null ? pricing.priceMax : service?.priceMax ?? service?.price ?? 0
  ) || 0);
  const amount = Math.round(Number(pricing.amount != null ? pricing.amount : 0) || 0);
  const pricingStatus = String(
    pricing.pricingStatus
      || (pricingType === "free"
        ? "free"
        : pricingType === "range"
          ? "range_deposit"
          : pricingType === "on_request"
            ? "quote_pending"
            : "fixed")
  );
  return {
    pricingType,
    priceMin,
    priceMax,
    amount,
    pricingStatus,
    durationMinutes: Math.max(0, Math.round(Number(
      pricing.durationMinutes != null ? pricing.durationMinutes : service?.durationMinutes ?? 30
    ) || 0))
  };
}

function buildPrimaryLineItem(service, pricing) {
  const meta = buildLinePricingMeta(service, pricing);
  return {
    id: "line-primary",
    kind: "primary",
    serviceId: service?.id || null,
    name: service?.name || "خدمة أساسية",
    amount: meta.amount,
    pricingType: meta.pricingType,
    priceMin: meta.priceMin,
    priceMax: meta.priceMax,
    pricingStatus: meta.pricingStatus,
    durationMinutes: meta.durationMinutes,
    addedAt: new Date().toISOString(),
    addedByStaffId: null
  };
}

function buildAddonLineItem(service, pricing, { id, actor = null } = {}) {
  const meta = buildLinePricingMeta(service, pricing);
  return {
    id: id || `line_${crypto.randomBytes(4).toString("hex")}`,
    kind: "addon",
    serviceId: service?.id || null,
    name: service?.name || "خدمة إضافية",
    amount: meta.amount,
    pricingType: meta.pricingType,
    priceMin: meta.priceMin,
    priceMax: meta.priceMax,
    pricingStatus: meta.pricingStatus,
    durationMinutes: meta.durationMinutes,
    addedAt: new Date().toISOString(),
    addedByStaffId: actor?.id || null,
    addedByName: actor?.name || ""
  };
}

function normalizeLineItem(line, store) {
  if (!line || typeof line !== "object") return line;
  const service = store?.services?.find((item) => item.id === line.serviceId) || null;
  const pricingType = String(line.pricingType || service?.pricingType || "fixed");
  const priceMin = Math.round(Number(
    line.priceMin != null ? line.priceMin : service?.priceMin ?? service?.price ?? line.amount ?? 0
  ) || 0);
  const priceMax = Math.round(Number(
    line.priceMax != null ? line.priceMax : service?.priceMax ?? service?.price ?? line.amount ?? 0
  ) || 0);
  let pricingStatus = String(line.pricingStatus || "");
  if (!pricingStatus) {
    if (pricingType === "free") pricingStatus = "free";
    else if (pricingType === "range") pricingStatus = "range_deposit";
    else if (pricingType === "on_request") pricingStatus = "quote_pending";
    else pricingStatus = "fixed";
  }
  const durationMinutes = Math.max(0, Math.round(Number(
    line.durationMinutes != null ? line.durationMinutes : service?.durationMinutes ?? 30
  ) || 0));
  const normalized = {
    ...line,
    name: line.name || service?.name || "خدمة",
    pricingType,
    priceMin,
    priceMax,
    pricingStatus,
    durationMinutes,
    amount: Math.round(Number(line.amount || 0) || 0)
  };
  normalized.needsFinalPrice = lineNeedsFinalPrice(normalized);
  return normalized;
}

function visitDurationMinutes(lineItems = []) {
  return (lineItems || []).reduce(
    (sum, line) => sum + Math.max(0, Math.round(Number(line.durationMinutes || 0) || 0)),
    0
  );
}

function computeExpectedEndAt(appointment, lineItems = []) {
  if (!appointment?.checkedInAt) return null;
  const started = Date.parse(appointment.checkedInAt);
  if (!Number.isFinite(started)) return null;
  const minutes = visitDurationMinutes(lineItems);
  return new Date(started + minutes * 60 * 1000).toISOString();
}

function applyLineFinalPrice(line, rawAmount) {
  const amount = Number(rawAmount);
  if (!Number.isFinite(amount) || amount < 0) {
    const err = new Error(`مبلغ غير صالح للخدمة «${line.name || line.id}»`);
    err.status = 400;
    throw err;
  }
  const pricingType = String(line.pricingType || "fixed");
  if (pricingType === "range") {
    const min = Number(line.priceMin ?? 0);
    const max = Number(line.priceMax ?? 0);
    if (amount < min || amount > max) {
      const err = new Error(`«${line.name}»: السعر النهائي يجب أن يكون ضمن النطاق ${min}–${max}`);
      err.status = 400;
      throw err;
    }
  }
  if (pricingType === "free") {
    line.amount = 0;
    line.pricingStatus = "free";
    line.needsFinalPrice = false;
    return line;
  }
  line.amount = Math.round(amount);
  line.pricingStatus = finalizeLineStatus(pricingType);
  line.needsFinalPrice = false;
  line.pricedAt = new Date().toISOString();
  return line;
}

function syncAppointmentTotalsFromLines(appointment) {
  const lines = Array.isArray(appointment.lineItems) ? appointment.lineItems : [];
  appointment.amount = sumLineItems(lines);
  const primary = lines.find((item) => item.kind === "primary") || lines[0] || null;
  if (primary) {
    appointment.pricingType = primary.pricingType || appointment.pricingType;
    appointment.priceMin = primary.priceMin ?? appointment.priceMin;
    appointment.priceMax = primary.priceMax ?? appointment.priceMax;
    appointment.pricingStatus = primary.pricingStatus || appointment.pricingStatus;
  }
  const duration = visitDurationMinutes(lines);
  if (duration > 0) appointment.durationMinutes = duration;
  appointment.expectedEndAt = computeExpectedEndAt(appointment, lines);
  appointment.pricingPending = lines.some((line) => lineNeedsFinalPrice(line));
  return appointment;
}

function enrichAppointmentForDesk(appointment, store) {
  const service = store.services.find((item) => item.id === appointment.serviceId) || null;
  const category = service
    ? store.serviceCategories.find((item) => item.id === service.categoryId) || null
    : null;
  const lineItems = (Array.isArray(appointment.lineItems) ? appointment.lineItems : [])
    .map((line) => normalizeLineItem(line, store));
  const duration = visitDurationMinutes(lineItems);
  const expectedEndAt = appointment.expectedEndAt || computeExpectedEndAt(appointment, lineItems);
  const pricingPending = lineItems.some((line) => line.needsFinalPrice);
  const autoEndDue = Boolean(
    appointment.status === "checked_in"
    && expectedEndAt
    && Date.parse(expectedEndAt) <= Date.now()
  );
  return {
    ...appointment,
    categoryId: service?.categoryId || appointment.categoryId || null,
    categoryName: category?.name || appointment.categoryName || "",
    lineItems,
    visitLog: Array.isArray(appointment.visitLog) ? appointment.visitLog : [],
    visitDurationMinutes: duration || Number(appointment.durationMinutes || service?.durationMinutes || 30),
    expectedEndAt,
    pricingPending,
    autoEndDue,
    remainingMinutes: expectedEndAt
      ? Math.max(0, Math.ceil((Date.parse(expectedEndAt) - Date.now()) / 60000))
      : null
  };
}

function pushVisitLog(appointment, entry) {
  if (!Array.isArray(appointment.visitLog)) appointment.visitLog = [];
  appointment.visitLog.push({
    id: `vlog_${crypto.randomBytes(4).toString("hex")}`,
    at: new Date().toISOString(),
    ...entry
  });
}

function ensureVisitFields(appointment, service, pricing, store = null) {
  if (!appointment.checkInToken) appointment.checkInToken = createCheckInToken();
  if (!Array.isArray(appointment.lineItems) || !appointment.lineItems.length) {
    appointment.lineItems = [buildPrimaryLineItem(service, pricing || {
      amount: appointment.amount,
      pricingType: appointment.pricingType,
      priceMin: appointment.priceMin,
      priceMax: appointment.priceMax,
      pricingStatus: appointment.pricingStatus,
      durationMinutes: appointment.durationMinutes
    })];
  } else {
    const lookup = store || { services: service ? [service] : [] };
    appointment.lineItems = appointment.lineItems.map((line) => {
      const normalized = normalizeLineItem(line, lookup);
      Object.assign(line, {
        pricingType: normalized.pricingType,
        priceMin: normalized.priceMin,
        priceMax: normalized.priceMax,
        pricingStatus: normalized.pricingStatus,
        durationMinutes: normalized.durationMinutes
      });
      return line;
    });
  }
  if (!Array.isArray(appointment.visitLog)) appointment.visitLog = [];
  if (service?.categoryId && !appointment.categoryId) appointment.categoryId = service.categoryId;
  syncAppointmentTotalsFromLines(appointment);
  return appointment;
}

module.exports = {
  todayInTimezone,
  createCheckInToken,
  sumLineItems,
  lineNeedsFinalPrice,
  buildPrimaryLineItem,
  buildAddonLineItem,
  normalizeLineItem,
  visitDurationMinutes,
  computeExpectedEndAt,
  applyLineFinalPrice,
  syncAppointmentTotalsFromLines,
  enrichAppointmentForDesk,
  pushVisitLog,
  ensureVisitFields
};
