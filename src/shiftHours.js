/**
 * ESM shift-hour helpers for the React app.
 * Keep in sync with root shiftHours.js (CJS for opsStore).
 */

export function toMinutes(hhmm) {
  const [hours, minutes] = String(hhmm || "00:00").split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return NaN;
  return hours * 60 + minutes;
}

export function fromMinutes(total) {
  const normalized = ((Number(total) % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function isOvernightShift(dayOrOpensAt, closesAtMaybe) {
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

export function shiftSpanMinutes(opensAt, closesAt, overnight = false) {
  const open = toMinutes(opensAt);
  const close = toMinutes(closesAt);
  if (!Number.isFinite(open) || !Number.isFinite(close)) return 0;
  if (close === open) return 0;
  if (overnight || close < open) return 1440 - open + close;
  return close - open;
}

export function mapTimeOntoShift(timeHm, opensAt, closesAt, overnight = false) {
  const open = toMinutes(opensAt);
  const t = toMinutes(timeHm);
  if (!Number.isFinite(open) || !Number.isFinite(t)) return NaN;
  const night = overnight || isOvernightShift(opensAt, closesAt);
  if (!night) return t;
  return t >= open ? t : t + 1440;
}

export function shiftEndOnTimeline(opensAt, closesAt, overnight = false) {
  const open = toMinutes(opensAt);
  const span = shiftSpanMinutes(opensAt, closesAt, overnight);
  if (!span) return NaN;
  return open + span;
}

export function validateShiftDay(day, label = "اليوم") {
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

export function overnightHint(day) {
  if (!day || day.isOpen === false || !day.overnight) return "";
  return "وردية ليلية: الحضور بتاريخ اليوم · الانصراف يُحتسب بتاريخ الغد.";
}

const shiftHours = {
  toMinutes,
  fromMinutes,
  isOvernightShift,
  shiftSpanMinutes,
  mapTimeOntoShift,
  shiftEndOnTimeline,
  validateShiftDay,
  overnightHint
};

export default shiftHours;
