import React, { useEffect, useMemo, useRef, useState } from "react";

export function lettersOnly(value) {
  return String(value || "").replace(/[0-9٠-٩]/g, "");
}

export function digitsPhone(value) {
  return String(value || "").replace(/[^\d+\s()-]/g, "");
}

export function MoneyInput({ value, onChange, currencySymbol = "ج.م", min = 0, required = false, id }) {
  const shown = value === "" || value == null ? "" : String(value);
  return (
    <div className="money-input">
      <span className="money-currency" aria-hidden="true">{currencySymbol}</span>
      <input
        id={id}
        type="number"
        min={min}
        required={required}
        inputMode="decimal"
        value={shown}
        onFocus={() => {
          if (shown === "0" || Number(shown) === 0) onChange("");
        }}
        onChange={(e) => {
          const next = e.target.value;
          onChange(next === "" ? "" : Number(next));
        }}
      />
    </div>
  );
}

export function toMoneyNumber(value) {
  if (value === "" || value == null || Number.isNaN(Number(value))) return 0;
  return Number(value);
}

/** Searchable single-select; allowCustom lets the user type a new option. */
export function SearchableSelect({
  options = [],
  value = "",
  onChange,
  placeholder = "ابحث أو اختر…",
  allowCustom = false,
  required = false,
  emptyLabel = "لا نتائج"
}) {
  const [query, setQuery] = useState(value || "");
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    setQuery(value || "");
  }, [value]);

  useEffect(() => {
    const onDoc = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, []);

  const filtered = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return options;
    return options.filter((item) => String(item).toLowerCase().includes(q));
  }, [options, query]);

  const commit = (next) => {
    onChange(next);
    setQuery(next);
    setOpen(false);
  };

  return (
    <div className={`searchable-select${open ? " is-open" : ""}`} ref={rootRef}>
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        required={required}
        value={query}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (allowCustom) onChange(e.target.value);
        }}
        onBlur={() => {
          if (allowCustom) onChange(String(query || "").trim());
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (filtered[0]) commit(filtered[0]);
            else if (allowCustom) commit(String(query || "").trim());
          }
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && (
        <ul className="searchable-select-menu" role="listbox">
          {filtered.map((item) => (
            <li key={item}>
              <button type="button" role="option" onMouseDown={(e) => e.preventDefault()} onClick={() => commit(item)}>
                {item}
              </button>
            </li>
          ))}
          {!filtered.length && allowCustom && String(query || "").trim() ? (
            <li>
              <button
                type="button"
                className="searchable-select-create"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commit(String(query).trim())}
              >
                إضافة «{String(query).trim()}»
              </button>
            </li>
          ) : null}
          {!filtered.length && !(allowCustom && String(query || "").trim()) ? (
            <li className="searchable-select-empty">{emptyLabel}</li>
          ) : null}
        </ul>
      )}
    </div>
  );
}

/** Multi-select with search for service IDs. */
export function SearchableMultiSelect({
  options = [],
  value = [],
  onChange,
  placeholder = "ابحث واختر…"
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selected = Array.isArray(value) ? value : [];

  useEffect(() => {
    const onDoc = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, []);

  const filtered = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return options;
    return options.filter((item) => String(item.label || "").toLowerCase().includes(q));
  }, [options, query]);

  const toggle = (id) => {
    if (selected.includes(id)) onChange(selected.filter((item) => item !== id));
    else onChange([...selected, id]);
  };

  return (
    <div className={`searchable-select multi${open ? " is-open" : ""}`} ref={rootRef}>
      <button type="button" className="searchable-select-trigger" onClick={() => setOpen((v) => !v)}>
        {selected.length ? `${selected.length} محدد` : placeholder}
      </button>
      {open && (
        <div className="searchable-select-panel">
          <input
            type="search"
            value={query}
            placeholder="بحث…"
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <ul className="searchable-select-menu" role="listbox">
            {filtered.map((item) => (
              <li key={item.id}>
                <label className="check">
                  <input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} />
                  {item.label}
                </label>
              </li>
            ))}
            {!filtered.length && <li className="searchable-select-empty">لا نتائج</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
