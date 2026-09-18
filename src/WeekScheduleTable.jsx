import React from "react";
import { SmartTimePicker } from "./SmartTimePicker.jsx";
import shiftHours from "./shiftHours.js";

/** Sunday-first — matches JS Date.getDay() and opsStore weekday indices. */
export const WEEKDAY_NAMES_AR = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export function defaultWeekDay(weekday, source = {}) {
  const opensAt = source.opensAt || "09:00";
  const closesAt = source.closesAt || "21:00";
  const open = shiftHours.toMinutes(opensAt);
  const close = shiftHours.toMinutes(closesAt);
  const overnight =
    source.overnight === true ||
    (source.overnight == null && Number.isFinite(open) && Number.isFinite(close) && close < open);
  return {
    weekday,
    isOpen: source.isOpen !== false,
    opensAt,
    closesAt,
    overnight: Boolean(overnight),
    breakEnabled: Boolean(source.breakEnabled),
    breakStartsAt: source.breakStartsAt || "13:00",
    breakEndsAt: source.breakEndsAt || "14:00"
  };
}

export function ensureWeekHours(days, fallback = []) {
  const source = Array.isArray(days) && days.length ? days : fallback;
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => {
    const day = source.find((item) => Number(item.weekday) === weekday) || source[weekday] || {};
    return defaultWeekDay(weekday, day);
  });
}

/** Returns an Arabic error message, or "" if valid. */
export function validateWeekHours(days) {
  const list = ensureWeekHours(days);
  for (const day of list) {
    const label = WEEKDAY_NAMES_AR[day.weekday] || `يوم ${day.weekday}`;
    const error = shiftHours.validateShiftDay(day, label);
    if (error) return error;
  }
  return "";
}

/**
 * SetTime-style week schedule + explicit night-shift mode.
 * Same day: end must be after start (e.g. 15:00 → 23:00 = 3:00 م → 11:00 م).
 * Night shift: clock-out is next calendar day.
 */
export function WeekScheduleTable({ days = [], onChange, compact = false }) {
  const rows = ensureWeekHours(days);

  const patchDay = (index, patch) => {
    if (typeof onChange !== "function") return;
    onChange(rows.map((day, i) => (i === index ? { ...day, ...patch } : day)));
  };

  return (
    <div className={`week-schedule${compact ? " is-compact" : ""}`}>
      <div className="week-schedule-head" aria-hidden="true">
        <span>اليوم</span>
        <span>العمل</span>
        <span>الحضور</span>
        <span>الانصراف</span>
        <span>ليلية</span>
        <span>استراحة</span>
        <span>بدء الاستراحة</span>
        <span>نهاية الاستراحة</span>
      </div>
      {rows.map((day, index) => {
        const closed = day.isOpen === false;
        const breakOff = closed || !day.breakEnabled;
        const overnight = Boolean(day.overnight) && !closed;
        return (
          <div
            className={`week-schedule-row${closed ? " is-closed" : ""}${overnight ? " is-overnight" : ""}${day.breakEnabled && !closed ? " has-break" : ""}`}
            key={day.weekday}
          >
            <b className="week-schedule-day">{WEEKDAY_NAMES_AR[index]}</b>
            <div className="week-schedule-toggle-cell">
              <span className="week-schedule-mobile-label">العمل</span>
              <button
                type="button"
                className={`week-toggle${closed ? "" : " is-on"}`}
                role="switch"
                aria-checked={!closed}
                aria-label={`تفعيل عمل ${WEEKDAY_NAMES_AR[index]}`}
                onClick={() => patchDay(index, { isOpen: closed })}
              >
                <i />
              </button>
            </div>
            <div className="week-schedule-time">
              <span className="week-schedule-mobile-label">الحضور</span>
              <SmartTimePicker
                value={day.opensAt}
                disabled={closed}
                show24h
                aria-label={`حضور ${WEEKDAY_NAMES_AR[index]}`}
                onChange={(next) => patchDay(index, { opensAt: next })}
              />
            </div>
            <div className="week-schedule-time">
              <span className="week-schedule-mobile-label">الانصراف{overnight ? " (غداً)" : ""}</span>
              <SmartTimePicker
                value={day.closesAt}
                disabled={closed}
                show24h
                aria-label={`انصراف ${WEEKDAY_NAMES_AR[index]}`}
                onChange={(next) => patchDay(index, { closesAt: next })}
              />
            </div>
            <div className="week-schedule-toggle-cell">
              <span className="week-schedule-mobile-label">ليلية</span>
              <button
                type="button"
                className={`week-toggle week-toggle-night${overnight ? " is-on" : ""}`}
                role="switch"
                aria-checked={overnight}
                aria-label={`وردية ليلية ${WEEKDAY_NAMES_AR[index]}`}
                title="وردية ليلية: الانصراف بتاريخ الغد"
                disabled={closed}
                onClick={() => {
                  const nextOvernight = !day.overnight;
                  const patch = { overnight: nextOvernight };
                  // Sensible defaults when enabling night shift: e.g. 22:00 → 09:00
                  if (nextOvernight) {
                    const open = shiftHours.toMinutes(day.opensAt);
                    const close = shiftHours.toMinutes(day.closesAt);
                    if (!(Number.isFinite(close) && Number.isFinite(open) && close < open)) {
                      patch.opensAt = day.opensAt || "22:00";
                      if (shiftHours.toMinutes(patch.opensAt) < 18 * 60) patch.opensAt = "22:00";
                      patch.closesAt = "09:00";
                    }
                  }
                  patchDay(index, patch);
                }}
              >
                <i />
              </button>
            </div>
            <div className="week-schedule-toggle-cell">
              <span className="week-schedule-mobile-label">استراحة</span>
              <button
                type="button"
                className={`week-toggle${day.breakEnabled && !closed ? " is-on" : ""}`}
                role="switch"
                aria-checked={Boolean(day.breakEnabled) && !closed}
                aria-label={`استراحة ${WEEKDAY_NAMES_AR[index]}`}
                disabled={closed}
                onClick={() => patchDay(index, { breakEnabled: !day.breakEnabled })}
              >
                <i />
              </button>
            </div>
            <div className="week-schedule-time">
              <span className="week-schedule-mobile-label">بدء الاستراحة</span>
              <SmartTimePicker
                value={day.breakStartsAt}
                disabled={breakOff}
                show24h
                aria-label={`بدء استراحة ${WEEKDAY_NAMES_AR[index]}`}
                onChange={(next) => patchDay(index, { breakStartsAt: next })}
              />
            </div>
            <div className="week-schedule-time">
              <span className="week-schedule-mobile-label">نهاية الاستراحة</span>
              <SmartTimePicker
                value={day.breakEndsAt}
                disabled={breakOff}
                show24h
                aria-label={`نهاية استراحة ${WEEKDAY_NAMES_AR[index]}`}
                onChange={(next) => patchDay(index, { breakEndsAt: next })}
              />
            </div>
            {overnight ? (
              <p className="week-schedule-night-hint">
                وردية ليلية: الحضور <b>{day.opensAt}</b> اليوم · الانصراف <b>{day.closesAt}</b> غداً
                {" "}({Math.round(shiftHours.shiftSpanMinutes(day.opensAt, day.closesAt, true) / 60 * 10) / 10} ساعة عمل)
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
