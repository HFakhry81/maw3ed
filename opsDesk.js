/**
 * Department desk — attendance / check-in / add-ons.
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

function buildPrimaryLineItem(service, pricing) {
  return {
    id: `line-primary`,
    kind: "primary",
    serviceId: service?.id || null,
    name: service?.name || "خدمة أساسية",
    amount: Number(pricing?.amount || 0),
    addedAt: new Date().toISOString(),
    addedByStaffId: null
  };
}

function enrichAppointmentForDesk(appointment, store) {
  const service = store.services.find((item) => item.id === appointment.serviceId) || null;
  const category = service
    ? store.serviceCategories.find((item) => item.id === service.categoryId) || null
    : null;
  return {
    ...appointment,
    categoryId: service?.categoryId || appointment.categoryId || null,
    categoryName: category?.name || appointment.categoryName || "",
    lineItems: Array.isArray(appointment.lineItems) ? appointment.lineItems : [],
    visitLog: Array.isArray(appointment.visitLog) ? appointment.visitLog : []
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

function ensureVisitFields(appointment, service, pricing) {
  if (!appointment.checkInToken) appointment.checkInToken = createCheckInToken();
  if (!Array.isArray(appointment.lineItems) || !appointment.lineItems.length) {
    appointment.lineItems = [buildPrimaryLineItem(service, pricing || { amount: appointment.amount })];
  }
  if (!Array.isArray(appointment.visitLog)) appointment.visitLog = [];
  if (service?.categoryId && !appointment.categoryId) appointment.categoryId = service.categoryId;
  return appointment;
}

module.exports = {
  todayInTimezone,
  createCheckInToken,
  sumLineItems,
  buildPrimaryLineItem,
  enrichAppointmentForDesk,
  pushVisitLog,
  ensureVisitFields
};
