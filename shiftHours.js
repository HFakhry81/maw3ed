/**
 * Shared shift-hour helpers (same-day + dedicated overnight / night shifts).
 *
 * Same day: closesAt must be after opensAt.
 * Night shift (overnight: true): clock-out is the NEXT calendar day, so closesAt
 * may be earlier on the clock than opensAt (e.g. 22:00 → 09:00).
 */

function toMinutes(hhmm) {
  const [hours, minutes] = String(hhmm || "00:00").split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return NaN;
  return hours * 60 + minutes;
}

function fromMinutes(total) {
  const normalized = ((Number(total) % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** Explicit night shift, or legacy rows where end < start on the clock. */
function isOvernightShift(dayOrOpensAt, closesAtMaybe) {
  if (dayOrOpensAt && typeof dayOrOpensAt === "object") {
    if (dayOrOpensAt.overnight === true) return true;
    if (dayOrOpensAt.overnight === false) return false;
    const open = toMinutes(dayOrOpensAt.opensAt);
    const close = toMinutes(dayOrOpensAt.closesAt);
    return Number.isFinite(open) && Number.isFinite(close) && close < open;
  }
  const open = toMinutes(dayOrOpensAt);
  const close = toMinutes(closesAtMaybe);
  return Number.isFinite(open) && Number.isFinite(close) && close < open;
}

function shiftSpanMinutes(opensAt, closesAt, overnight = false) {
  const open = toMinutes(opensAt);
  const close = toMinutes(closesAt);
  if (!Number.isFinite(open) || !Number.isFinite(close)) return 0;
  if (close === open) return 0;
  if (overnight || close < open) return 1440 - open + close;
  return close - open;
}

function mapTimeOntoShift(timeHm, opensAt, closesAt, overnight = false) {
  const open = toMinutes(opensAt);
  const t = toMinutes(timeHm);
  if (!Number.isFinite(open) || !Number.isFinite(t)) return NaN;
  const night = overnight || isOvernightShift(opensAt, closesAt);
  if (!night) return t;
  return t >= open ? t : t + 1440;
}

function shiftEndOnTimeline(opensAt, closesAt, overnight = false) {
  const open = toMinutes(opensAt);
  const span = shiftSpanMinutes(opensAt, closesAt, overnight);
  if (!span) return NaN;
  return open + span;
}

/**
 * Validate one day. Returns Arabic error or "".
 * - Normal day: end must be after start (same calendar day).
 * - Night shift: end is next day; clock end must be before clock start.
 */
function validateShiftDay(day, label = "اليوم") {
  if (!day || day.isOpen === false) return "";
  const open = toMinutes(day.opensAt);
  const close = toMinutes(day.closesAt);
  if (!Number.isFinite(open) || !Number.isFinite(close)) {
    return `ساعات العمل غير صالحة ليوم ${label}.`;
  }
  if (open === close) {
    return `ساعات العمل غير صالحة ليوم ${label} — فترة العمل فارغة.`;
  }

  const overnight = day.overnight === true;

  if (overnight) {
    if (!(close < open)) {
      return `وردية ليلية ليوم ${label}: وقت الانصراف يجب أن يكون بعد منتصف الليل (مثلاً 09:00 ص) لأن الانصراف يُحتسب بتاريخ الغد. أو أوقف «وردية ليلية» إن كانت الوردية في نفس اليوم.`;
    }
  } else if (!(close > open)) {
    return `ليوم ${label}: لا يمكن أن يكون وقت الانصراف قبل/مساوياً لوقت الحضور في نفس اليوم. إذا كانت وردية ليلية (حضور اليوم وانصراف الغد) فعّل «وردية ليلية».`;
  }

  if (!day.breakEnabled) return "";

  const end = shiftEndOnTimeline(day.opensAt, day.closesAt, overnight);
  let breakStart = mapTimeOntoShift(day.breakStartsAt, day.opensAt, day.closesAt, overnight);
  let breakEnd = mapTimeOntoShift(day.breakEndsAt, day.opensAt, day.closesAt, overnight);
  if (!(Number.isFinite(breakStart) && Number.isFinite(breakEnd)) || breakEnd === breakStart) {
    return `فترة الاستراحة غير صالحة ليوم ${label}.`;
  }
  if (breakEnd < breakStart) breakEnd += 1440;
  if (breakStart < open || breakEnd > end) {
    return `الاستراحة في يوم ${label} يجب أن تكون داخل ساعات الوردية${overnight ? " (بما فيها ما بعد منتصف الليل)" : ""}.`;
  }
  return "";
}

function overnightHint(day) {
  if (!day || day.isOpen === false || !day.overnight) return "";
  return "وردية ليلية: الحضور بتاريخ اليوم · الانصراف يُحتسب بتاريخ الغد.";
}

function addCalendarDays(dateStr, delta) {
  const day = new Date(`${dateStr}T12:00:00`);
  day.setDate(day.getDate() + delta);
  return day.toISOString().slice(0, 10);
}

function simplifyBreakBlocks(hours, segment) {
  if (!hours?.breakEnabled || !hours.breakStartsAt || !hours.breakEndsAt) return [];
  const open = toMinutes(hours.opensAt);
  const close = toMinutes(hours.closesAt);
  const overnight = isOvernightShift(hours);
  let bs = mapTimeOntoShift(hours.breakStartsAt, hours.opensAt, hours.closesAt, overnight);
  let be = mapTimeOntoShift(hours.breakEndsAt, hours.opensAt, hours.closesAt, overnight);
  if (!(Number.isFinite(bs) && Number.isFinite(be)) || bs === be) return [];
  if (be < bs) be += 1440;

  if (!overnight || segment === "day") {
    return be > bs ? [[bs, be]] : [];
  }
  if (segment === "evening") {
    const left = Math.max(bs, open);
    const right = Math.min(be, 1440);
    return right > left ? [[left, right]] : [];
  }
  if (segment === "morning") {
    const left = Math.max(bs, 1440) - 1440;
    const right = Math.min(be, 1440 + close) - 1440;
    return right > left ? [[left, right]] : [];
  }
  return [];
}

module.exports = {
  toMinutes,
  fromMinutes,
  isOvernightShift,
  shiftSpanMinutes,
  mapTimeOntoShift,
  shiftEndOnTimeline,
  validateShiftDay,
  overnightHint,
  addCalendarDays,
  simplifyBreakBlocks
};
