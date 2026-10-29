/**
 * Maw3ed unified operational status machines.
 *
 * Product truth: Maw3ed is a multi-purpose booking & ops platform — NOT clinic-only.
 * Three booking models (BookingType) cover all activity templates:
 *   APPOINTMENT      → occupancy exclusive (medical, clinic, salon, beauty, sauna…)
 *   RESOURCE_RENTAL  → occupancy rental   (billiards, courts, tables, devices…)
 *   BATCH_SCHEDULE   → occupancy session_capacity (education, school, group fitness…)
 *
 * Labels are bilingual; machine keys are English snake_case for storage/API.
 */

const BOOKING_TYPES = Object.freeze({
  APPOINTMENT: "APPOINTMENT",
  RESOURCE_RENTAL: "RESOURCE_RENTAL",
  BATCH_SCHEDULE: "BATCH_SCHEDULE"
});

/** Map BookingType ↔ existing occupancy_mode on services. */
const BOOKING_TYPE_TO_OCCUPANCY = Object.freeze({
  APPOINTMENT: "exclusive",
  RESOURCE_RENTAL: "rental",
  BATCH_SCHEDULE: "session_capacity"
});

const OCCUPANCY_TO_BOOKING_TYPE = Object.freeze({
  exclusive: "APPOINTMENT",
  rental: "RESOURCE_RENTAL",
  session_capacity: "BATCH_SCHEDULE"
});

const SERVICE_STATUSES = Object.freeze(["active", "inactive"]);

/** Single-appointment lifecycle (medical / salon / beauty / sauna). */
const APPOINTMENT_BOOKING_STATUSES = Object.freeze([
  "pending",
  "confirmed",
  "waitlisted",
  "rescheduled",
  "cancelled",
  "no_show"
]);

/** Visit / execution overlay on the same appointment row for APPOINTMENT flow. */
const APPOINTMENT_SESSION_STATUSES = Object.freeze([
  "checked_in",
  "in_progress",
  "paused",
  "completed"
]);

/** Full appointment.status vocabulary used by desk + public booking. */
const APPOINTMENT_STATUSES = Object.freeze([
  ...APPOINTMENT_BOOKING_STATUSES,
  ...APPOINTMENT_SESSION_STATUSES
]);

const APPOINTMENT_TRANSITIONS = Object.freeze({
  pending: ["confirmed", "waitlisted", "cancelled", "rescheduled"],
  confirmed: ["checked_in", "in_progress", "completed", "cancelled", "no_show", "rescheduled", "waitlisted"],
  waitlisted: ["confirmed", "cancelled", "rescheduled"],
  rescheduled: ["pending", "confirmed", "cancelled"],
  checked_in: ["in_progress", "paused", "completed", "cancelled", "no_show"],
  in_progress: ["paused", "completed", "cancelled"],
  paused: ["in_progress", "completed", "cancelled"],
  completed: [],
  cancelled: [],
  no_show: []
});

const APPOINTMENT_STATUS_ALIASES = Object.freeze({
  check_in: "checked_in",
  arrived: "checked_in",
  cancel: "cancelled",
  canceled: "cancelled",
  no_show: "no_show",
  "no-show": "no_show",
  noShow: "no_show",
  in_service: "in_progress",
  "in-progress": "in_progress",
  on_hold: "paused",
  "on-hold": "paused",
  hold: "paused"
});

/** Resource / table operational state (billiards, courts). */
const RESOURCE_STATUSES = Object.freeze([
  "available",
  "occupied",
  "reserved",
  "under_maintenance",
  // legacy aliases kept for DB rows written before this machine
  "active",
  "inactive",
  "maintenance"
]);

const RESOURCE_STATUS_ALIASES = Object.freeze({
  active: "available",
  inactive: "under_maintenance",
  maintenance: "under_maintenance",
  "under-maintenance": "under_maintenance",
  "in-use": "occupied",
  in_use: "occupied",
  busy: "occupied"
});

/** Live / timed rental session (open table tab). */
const RENTAL_SESSION_STATUSES = Object.freeze([
  "open",
  "fixed_time",
  "paused",
  "closed_pending_payment",
  "settled",
  "cancelled"
]);

const RENTAL_SESSION_TRANSITIONS = Object.freeze({
  open: ["paused", "closed_pending_payment", "settled", "cancelled"],
  fixed_time: ["open", "paused", "closed_pending_payment", "settled", "cancelled"],
  paused: ["open", "closed_pending_payment", "cancelled"],
  closed_pending_payment: ["settled", "open", "cancelled"],
  settled: [],
  cancelled: []
});

const RENTAL_SESSION_ALIASES = Object.freeze({
  active: "open",
  "open_session": "open",
  fixed: "fixed_time",
  "fixed-time": "fixed_time",
  closed: "closed_pending_payment",
  pending_payment: "closed_pending_payment",
  completed: "settled",
  paid: "settled"
});

/** Class / batch occurrence (education). */
const BATCH_OCCURRENCE_STATUSES = Object.freeze(["open", "full", "cancelled", "scheduled", "completed"]);

const BATCH_OCCURRENCE_ALIASES = Object.freeze({
  scheduled: "open",
  completed: "completed"
});

/** Student attendance. */
const ATTENDANCE_STATUSES = Object.freeze(["attended", "absent", "excused", "present", "late"]);

const ATTENDANCE_ALIASES = Object.freeze({
  present: "attended",
  checked_in: "attended",
  "check-in": "attended",
  late: "attended"
});

/** Staff ↔ workspace (branch) binding. */
const STAFF_BRANCH_LINK_STATUSES = Object.freeze(["active", "suspended"]);

const LABELS = Object.freeze({
  bookingType: {
    APPOINTMENT: { ar: "موعد / مقدم خدمة", en: "Appointment / provider" },
    RESOURCE_RENTAL: { ar: "تأجير مورد / طاولة", en: "Resource / table rental" },
    BATCH_SCHEDULE: { ar: "حصة / مجموعة", en: "Batch / class schedule" }
  },
  service: {
    active: { ar: "نشطة", en: "Active" },
    inactive: { ar: "غير متاحة", en: "Inactive" }
  },
  appointment: {
    pending: { ar: "معلق / بانتظار التأكيد", en: "Pending" },
    confirmed: { ar: "مؤكد", en: "Confirmed" },
    waitlisted: { ar: "قائمة الانتظار", en: "Waitlisted" },
    rescheduled: { ar: "مؤجل / مجدول", en: "Rescheduled" },
    cancelled: { ar: "ملغى", en: "Cancelled" },
    no_show: { ar: "لم يحضر", en: "No-show" },
    checked_in: { ar: "تم تسجيل الحضور", en: "Checked-in" },
    in_progress: { ar: "جاري التنفيذ / الكشف", en: "In progress" },
    paused: { ar: "معلقة للتأجيل", en: "Paused / on-hold" },
    completed: { ar: "مكتملة", en: "Completed" }
  },
  resource: {
    available: { ar: "متاحة", en: "Available" },
    occupied: { ar: "مشغولة", en: "Occupied" },
    reserved: { ar: "محجوزة", en: "Reserved" },
    under_maintenance: { ar: "تحت الصيانة", en: "Under maintenance" },
    active: { ar: "متاحة", en: "Available" },
    inactive: { ar: "غير متاحة", en: "Inactive" },
    maintenance: { ar: "تحت الصيانة", en: "Under maintenance" }
  },
  rentalSession: {
    open: { ar: "جلسة مفتوحة", en: "Open session" },
    fixed_time: { ar: "جلسة محددة الموعد", en: "Fixed-time session" },
    paused: { ar: "موقوفة مؤقتاً", en: "Paused" },
    closed_pending_payment: { ar: "تم الإغلاق / بانتظار الحساب", en: "Closed / pending payment" },
    settled: { ar: "مدفوعة ومكتملة", en: "Settled / completed" },
    cancelled: { ar: "ملغاة", en: "Cancelled" }
  },
  batchOccurrence: {
    open: { ar: "مفتوحة للحجز", en: "Open" },
    full: { ar: "مكتملة العدد", en: "Full" },
    cancelled: { ar: "ملغاة", en: "Cancelled" },
    scheduled: { ar: "مجدولة", en: "Scheduled" },
    completed: { ar: "مكتملة", en: "Completed" }
  },
  attendance: {
    attended: { ar: "حاضر", en: "Attended" },
    absent: { ar: "غائب", en: "Absent" },
    excused: { ar: "معذور", en: "Excused" },
    present: { ar: "حاضر", en: "Present" },
    late: { ar: "متأخر", en: "Late" }
  },
  staffBranchLink: {
    active: { ar: "نشط", en: "Active" },
    suspended: { ar: "موقوف", en: "Suspended" }
  }
});

/** Default BookingType per activity template id. */
const TEMPLATE_BOOKING_TYPE = Object.freeze({
  medical: "APPOINTMENT",
  clinic: "APPOINTMENT",
  dentist: "APPOINTMENT",
  salon: "APPOINTMENT",
  barber: "APPOINTMENT",
  beauty: "APPOINTMENT",
  massage: "APPOINTMENT",
  spa: "APPOINTMENT",
  sauna: "APPOINTMENT",
  consultant: "APPOINTMENT",
  pets: "APPOINTMENT",
  carwash: "APPOINTMENT",
  education: "BATCH_SCHEDULE",
  school: "BATCH_SCHEDULE",
  fitness: "BATCH_SCHEDULE",
  billiards: "RESOURCE_RENTAL",
  sports: "RESOURCE_RENTAL",
  gaming: "RESOURCE_RENTAL",
  events: "APPOINTMENT",
  custom: "APPOINTMENT",
  other: "APPOINTMENT"
});

function normalizeLocale(locale) {
  return String(locale || "ar").toLowerCase().slice(0, 2) === "en" ? "en" : "ar";
}

function labelOf(group, key, locale = "ar") {
  const lang = normalizeLocale(locale);
  const entry = LABELS[group]?.[key];
  if (!entry) return key;
  return entry[lang] || entry.ar || key;
}

function bookingTypeForTemplate(templateId) {
  const id = String(templateId || "custom").toLowerCase();
  return TEMPLATE_BOOKING_TYPE[id] || "APPOINTMENT";
}

function occupancyForBookingType(bookingType) {
  return BOOKING_TYPE_TO_OCCUPANCY[bookingType] || "exclusive";
}

function bookingTypeForOccupancy(occupancyMode) {
  return OCCUPANCY_TO_BOOKING_TYPE[occupancyMode] || "APPOINTMENT";
}

function normalizeAppointmentStatus(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  return APPOINTMENT_STATUS_ALIASES[value] || value;
}

function assertAppointmentTransition(fromStatus, toStatus) {
  const from = normalizeAppointmentStatus(fromStatus) || "pending";
  const to = normalizeAppointmentStatus(toStatus);
  if (!APPOINTMENT_STATUSES.includes(to)) {
    const err = new Error(`Invalid appointment status: ${toStatus}`);
    err.statusCode = 400;
    err.code = "INVALID_STATUS";
    throw err;
  }
  if (from === to) return to;
  const allowed = APPOINTMENT_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    const err = new Error(`Cannot transition appointment from ${from} to ${to}`);
    err.statusCode = 400;
    err.code = "INVALID_TRANSITION";
    throw err;
  }
  return to;
}

function normalizeResourceStatus(raw) {
  const value = String(raw || "").trim();
  if (!value) return "available";
  return RESOURCE_STATUS_ALIASES[value] || value;
}

function isBookableResourceStatus(status) {
  const normalized = normalizeResourceStatus(status);
  return normalized === "available" || normalized === "reserved";
}

function normalizeRentalSessionStatus(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  return RENTAL_SESSION_ALIASES[value] || value;
}

function assertRentalSessionTransition(fromStatus, toStatus) {
  const from = normalizeRentalSessionStatus(fromStatus) || "open";
  const to = normalizeRentalSessionStatus(toStatus);
  if (!RENTAL_SESSION_STATUSES.includes(to)) {
    const err = new Error(`Invalid rental session status: ${toStatus}`);
    err.statusCode = 400;
    err.code = "INVALID_STATUS";
    throw err;
  }
  if (from === to) return to;
  const allowed = RENTAL_SESSION_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    const err = new Error(`Cannot transition rental session from ${from} to ${to}`);
    err.statusCode = 400;
    err.code = "INVALID_TRANSITION";
    throw err;
  }
  return to;
}

function normalizeBatchOccurrenceStatus(raw, { seatsTaken = 0, capacity = 0 } = {}) {
  const value = String(raw || "").trim();
  if (value === "cancelled" || value === "completed") return value;
  const aliased = BATCH_OCCURRENCE_ALIASES[value] || value || "open";
  if (aliased === "full") return "full";
  if (capacity > 0 && seatsTaken >= capacity) return "full";
  if (aliased === "scheduled") return "open";
  return aliased === "open" || aliased === "full" ? aliased : "open";
}

function normalizeAttendanceStatus(raw) {
  const value = String(raw || "").trim();
  if (!value) return "attended";
  return ATTENDANCE_ALIASES[value] || value;
}

function normalizeStaffBranchLinkStatus(raw) {
  const value = String(raw || "").trim().toLowerCase();
  return value === "suspended" ? "suspended" : "active";
}

function catalogForApi(locale = "ar") {
  const lang = normalizeLocale(locale);
  const mapGroup = (group, keys) =>
    keys.map((key) => ({
      key,
      label: labelOf(group, key, lang),
      labelI18n: LABELS[group][key]
    }));

  return {
    bookingTypes: Object.keys(BOOKING_TYPES).map((key) => ({
      key,
      occupancyMode: BOOKING_TYPE_TO_OCCUPANCY[key],
      label: labelOf("bookingType", key, lang),
      labelI18n: LABELS.bookingType[key]
    })),
    serviceStatuses: mapGroup("service", SERVICE_STATUSES),
    appointmentStatuses: mapGroup("appointment", APPOINTMENT_STATUSES),
    appointmentTransitions: APPOINTMENT_TRANSITIONS,
    resourceStatuses: mapGroup("resource", ["available", "occupied", "reserved", "under_maintenance"]),
    rentalSessionStatuses: mapGroup("rentalSession", RENTAL_SESSION_STATUSES),
    rentalSessionTransitions: RENTAL_SESSION_TRANSITIONS,
    batchOccurrenceStatuses: mapGroup("batchOccurrence", ["open", "full", "cancelled"]),
    attendanceStatuses: mapGroup("attendance", ["attended", "absent", "excused"]),
    staffBranchLinkStatuses: mapGroup("staffBranchLink", STAFF_BRANCH_LINK_STATUSES),
    templateBookingTypes: { ...TEMPLATE_BOOKING_TYPE }
  };
}

module.exports = {
  BOOKING_TYPES,
  BOOKING_TYPE_TO_OCCUPANCY,
  OCCUPANCY_TO_BOOKING_TYPE,
  SERVICE_STATUSES,
  APPOINTMENT_BOOKING_STATUSES,
  APPOINTMENT_SESSION_STATUSES,
  APPOINTMENT_STATUSES,
  APPOINTMENT_TRANSITIONS,
  APPOINTMENT_STATUS_ALIASES,
  RESOURCE_STATUSES,
  RESOURCE_STATUS_ALIASES,
  RENTAL_SESSION_STATUSES,
  RENTAL_SESSION_TRANSITIONS,
  RENTAL_SESSION_ALIASES,
  BATCH_OCCURRENCE_STATUSES,
  BATCH_OCCURRENCE_ALIASES,
  ATTENDANCE_STATUSES,
  ATTENDANCE_ALIASES,
  STAFF_BRANCH_LINK_STATUSES,
  LABELS,
  TEMPLATE_BOOKING_TYPE,
  bookingTypeForTemplate,
  occupancyForBookingType,
  bookingTypeForOccupancy,
  normalizeAppointmentStatus,
  assertAppointmentTransition,
  normalizeResourceStatus,
  isBookableResourceStatus,
  normalizeRentalSessionStatus,
  assertRentalSessionTransition,
  normalizeBatchOccurrenceStatus,
  normalizeAttendanceStatus,
  normalizeStaffBranchLinkStatus,
  labelOf,
  catalogForApi
};
