import React, { useEffect, useMemo, useRef, useState } from "react";

const HOURS_12 = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** "HH:MM" (24h) → { hour12, minute, period } */
export function parseTime24(value) {
  const raw = String(value || "09:00");
  const [hRaw, mRaw] = raw.split(":");
  let hour24 = Number(hRaw);
  let minute = Number(mRaw);
  if (!Number.isFinite(hour24) || hour24 < 0 || hour24 > 23) hour24 = 9;
  if (!Number.isFinite(minute) || minute < 0 || minute > 59) minute = 0;
  const period = hour24 >= 12 ? "PM" : "AM";
  let hour12 = hour24 % 12;
  if (hour12 === 0) hour12 = 12;
  return { hour12, minute, period };
}

/** { hour12, minute, period } → "HH:MM" (24h) */
export function toTime24({ hour12, minute, period }) {
  let h = Number(hour12);
  const m = Number(minute);
  if (!Number.isFinite(h) || h < 1 || h > 12) h = 12;
  const safeM = Number.isFinite(m) ? Math.min(59, Math.max(0, m)) : 0;
  let hour24 = h % 12;
  if (String(period).toUpperCase() === "PM") hour24 += 12;
  return `${pad2(hour24)}:${pad2(safeM)}`;
}

function buildMinuteOptions(step = 5) {
  const size = Math.max(1, Math.min(30, Number(step) || 5));
  const list = [];
  for (let m = 0; m < 60; m += size) list.push(pad2(m));
  if (!list.includes("00")) list.unshift("00");
  return list;
}

function snapMinute(minute, step, options) {
  const m = Number(minute);
  if (options.includes(pad2(m))) return pad2(m);
  let best = options[0];
  let bestDiff = Infinity;
  for (const opt of options) {
    const diff = Math.abs(Number(opt) - m);
    if (diff < bestDiff) {
      best = opt;
      bestDiff = diff;
    }
  }
  return best;
}

/**
 * SetTime-style smart time picker: [HH] : [MM] [AM/PM]
 * Stores/emits 24h "HH:MM" for the API while showing 12h UI.
 */
export function SmartTimePicker({
  value = "09:00",
  onChange,
  disabled = false,
  required = false,
  minuteStep = 5,
  show24h = false,
  id,
  "aria-label": ariaLabel = "اختيار الوقت"
}) {
  const rootRef = useRef(null);
  const listRef = useRef(null);
  const [openPart, setOpenPart] = useState(null); // 'hour' | 'minute' | null
  const minuteOptions = useMemo(() => buildMinuteOptions(minuteStep), [minuteStep]);
  const parts = useMemo(() => {
    const parsed = parseTime24(value);
    return {
      hour12: pad2(parsed.hour12),
      minute: snapMinute(parsed.minute, minuteStep, minuteOptions),
      period: parsed.period
    };
  }, [value, minuteStep, minuteOptions]);

  useEffect(() => {
    if (!openPart) return undefined;
    const onDoc = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpenPart(null);
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [openPart]);

  useEffect(() => {
    if (!openPart || !listRef.current) return;
    const selected = listRef.current.querySelector("[data-selected='true']");
    if (selected && typeof selected.scrollIntoView === "function") {
      selected.scrollIntoView({ block: "nearest" });
    }
  }, [openPart, parts.hour12, parts.minute]);

  const emit = (next) => {
    if (disabled || typeof onChange !== "function") return;
    onChange(toTime24(next));
  };

  const togglePart = (part) => {
    if (disabled) return;
    setOpenPart((current) => (current === part ? null : part));
  };

  const togglePeriod = () => {
    if (disabled) return;
    emit({
      hour12: Number(parts.hour12),
      minute: Number(parts.minute),
      period: parts.period === "AM" ? "PM" : "AM"
    });
  };

  const options = openPart === "hour" ? HOURS_12 : openPart === "minute" ? minuteOptions : [];
  const selectedValue = openPart === "hour" ? parts.hour12 : parts.minute;
  const value24 = toTime24({
    hour12: Number(parts.hour12),
    minute: Number(parts.minute),
    period: parts.period
  });
  const periodLabel = parts.period === "AM" ? "ص" : "م";

  return (
    <div className={`smart-time-wrap${disabled ? " is-disabled" : ""}`}>
      <div
        className={`smart-time${disabled ? " is-disabled" : ""}${openPart ? " is-open" : ""}`}
        ref={rootRef}
        id={id}
        aria-label={ariaLabel}
      >
        {required ? (
          <input
            type="text"
            className="smart-time-required"
            value={value24}
            required
            readOnly
            tabIndex={-1}
            aria-hidden="true"
          />
        ) : null}
        <button
          type="button"
          className={`smart-time-seg${openPart === "hour" ? " is-active" : ""}`}
          disabled={disabled}
          aria-expanded={openPart === "hour"}
          onClick={() => togglePart("hour")}
        >
          {parts.hour12}
        </button>
        <span className="smart-time-colon" aria-hidden="true">:</span>
        <button
          type="button"
          className={`smart-time-seg${openPart === "minute" ? " is-active" : ""}`}
          disabled={disabled}
          aria-expanded={openPart === "minute"}
          onClick={() => togglePart("minute")}
        >
          {parts.minute}
        </button>
        <button
          type="button"
          className="smart-time-period"
          disabled={disabled}
          onClick={togglePeriod}
          aria-label={parts.period === "AM" ? "صباحاً" : "مساءً"}
          title={parts.period === "AM" ? "صباحاً (AM)" : "مساءً (PM)"}
        >
          {periodLabel}
        </button>

        {openPart && !disabled ? (
          <ul className="smart-time-menu" role="listbox" ref={listRef}>
            {options.map((opt) => {
              const selected = opt === selectedValue;
              return (
                <li key={opt}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    data-selected={selected ? "true" : "false"}
                    className={selected ? "is-selected" : ""}
                    onClick={() => {
                      if (openPart === "hour") {
                        emit({ hour12: Number(opt), minute: Number(parts.minute), period: parts.period });
                      } else {
                        emit({ hour12: Number(parts.hour12), minute: Number(opt), period: parts.period });
                      }
                      setOpenPart(null);
                    }}
                  >
                    <span className="smart-time-check" aria-hidden="true">{selected ? "✓" : ""}</span>
                    <span>{opt}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
      {show24h ? (
        <small className="smart-time-24" title="التوقيت بنظام 24 ساعة">
          {value24}
        </small>
      ) : null}
    </div>
  );
}
