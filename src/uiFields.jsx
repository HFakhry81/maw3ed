import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

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

function useOutsideClose(rootRef, open, setOpen) {
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [open, rootRef, setOpen]);
}

/** Shows a bottom fade when the list can still scroll. */
function ScrollableMenu({ children, className = "" }) {
  const listRef = useRef(null);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const [canScrollUp, setCanScrollUp] = useState(false);

  const update = () => {
    const el = listRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    setCanScrollUp(el.scrollTop > 4);
    setCanScrollDown(max > 4 && el.scrollTop < max - 4);
  };

  useLayoutEffect(() => {
    update();
    const el = listRef.current;
    if (!el) return undefined;
    el.addEventListener("scroll", update, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(el);
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      ro?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [children]);

  return (
    <div className={`searchable-select-scroll${canScrollDown ? " has-more" : ""}${canScrollUp ? " has-prev" : ""}`}>
      {canScrollUp ? <div className="searchable-select-fade searchable-select-fade-top" aria-hidden="true" /> : null}
      <ul ref={listRef} className={`searchable-select-menu ${className}`.trim()} role="listbox">
        {children}
      </ul>
      {canScrollDown ? (
        <>
          <div className="searchable-select-fade searchable-select-fade-bottom" aria-hidden="true" />
          <div className="searchable-select-more" aria-hidden="true">مرّر للمزيد ▾</div>
        </>
      ) : null}
    </div>
  );
}

/**
 * Searchable single-select.
 * Trigger shows the selected value; opening always lists all options until the user types to filter.
 * Pass noneLabel (e.g. «بلا اختيار») to allow clearing to an empty value.
 * Pass onCreateMissing to offer a create action when the search has no matches.
 */
export function SearchableSelect({
  options = [],
  value = "",
  onChange,
  placeholder = "ابحث أو اختر…",
  allowCustom = false,
  required = false,
  emptyLabel = "لا نتائج",
  noneLabel = "",
  onCreateMissing = null,
  createMissingLabel = "إضافة",
  notFoundMessage = "لا توجد نتيجة مطابقة"
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const hasNone = Boolean(noneLabel);

  useOutsideClose(rootRef, open, setOpen);

  useEffect(() => {
    if (!open) return undefined;
    setQuery("");
    const id = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  const filtered = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return options;
    return options.filter((item) => String(item).toLowerCase().includes(q));
  }, [options, query]);

  const commit = (next) => {
    onChange(next);
    setOpen(false);
    setQuery("");
  };

  const trimmedQuery = String(query || "").trim();
  const display = value ? value : (hasNone ? noneLabel : "");
  const showNoneInList = hasNone && !trimmedQuery;
  const showCreateMissing = Boolean(onCreateMissing) && !filtered.length && Boolean(trimmedQuery);
  const showAllowCustom = allowCustom && !onCreateMissing && !filtered.length && Boolean(trimmedQuery);

  return (
    <div className={`searchable-select${open ? " is-open" : ""}`} ref={rootRef}>
      {required ? <input type="text" className="searchable-select-required" value={value || ""} required readOnly tabIndex={-1} aria-hidden="true" /> : null}
      <button
        type="button"
        className="searchable-select-trigger"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
      >
        <span className={value ? "" : "is-placeholder"}>{display || placeholder}</span>
        <span className="searchable-select-chevron" aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="searchable-select-panel">
          <input
            ref={searchRef}
            type="search"
            className="searchable-select-search"
            value={query}
            placeholder={allowCustom && !onCreateMissing ? "ابحث أو اكتب لإضافة…" : "ابحث…"}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (filtered[0]) commit(filtered[0]);
                else if (showCreateMissing) {
                  const q = trimmedQuery;
                  setOpen(false);
                  setQuery("");
                  onCreateMissing(q);
                } else if (showAllowCustom) commit(trimmedQuery);
              }
              if (e.key === "Escape") setOpen(false);
            }}
          />
          <ScrollableMenu>
            {showNoneInList ? (
              <li>
                <button
                  type="button"
                  role="option"
                  aria-selected={!value}
                  className={!value ? "is-selected searchable-select-none" : "searchable-select-none"}
                  onClick={() => commit("")}
                >
                  {noneLabel}
                </button>
              </li>
            ) : null}
            {filtered.map((item) => (
              <li key={item}>
                <button
                  type="button"
                  role="option"
                  aria-selected={item === value}
                  className={item === value ? "is-selected" : ""}
                  onClick={() => commit(item)}
                >
                  {item}
                </button>
              </li>
            ))}
            {showCreateMissing ? (
              <li className="searchable-select-missing">
                <p>{notFoundMessage} «{trimmedQuery}»</p>
                <button
                  type="button"
                  className="searchable-select-create-btn"
                  onClick={() => {
                    const q = trimmedQuery;
                    setOpen(false);
                    setQuery("");
                    onCreateMissing(q);
                  }}
                >
                  {createMissingLabel}
                </button>
              </li>
            ) : null}
            {showAllowCustom ? (
              <li>
                <button
                  type="button"
                  className="searchable-select-create"
                  onClick={() => commit(trimmedQuery)}
                >
                  إضافة «{trimmedQuery}»
                </button>
              </li>
            ) : null}
            {!filtered.length && !showCreateMissing && !showAllowCustom ? (
              <li className="searchable-select-empty">{emptyLabel}</li>
            ) : null}
          </ScrollableMenu>
        </div>
      )}
    </div>
  );
}

/** Multi-select with search for service IDs. */
export function SearchableMultiSelect({
  options = [],
  value = [],
  onChange,
  placeholder = "ابحث واختر…",
  noneLabel = "",
  onCreateMissing = null,
  createMissingLabel = "إضافة",
  notFoundMessage = "لا توجد نتيجة مطابقة"
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const selected = Array.isArray(value) ? value : [];
  const hasNone = Boolean(noneLabel);

  useOutsideClose(rootRef, open, setOpen);

  useEffect(() => {
    if (!open) return undefined;
    setQuery("");
    const id = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  const filtered = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return options;
    return options.filter((item) => String(item.label || "").toLowerCase().includes(q));
  }, [options, query]);

  const toggle = (id) => {
    if (selected.includes(id)) onChange(selected.filter((item) => item !== id));
    else onChange([...selected, id]);
  };

  const clearAll = () => {
    onChange([]);
    setOpen(false);
    setQuery("");
  };

  const trimmedQuery = String(query || "").trim();
  const showNoneInList = hasNone && !trimmedQuery;
  const showCreateMissing = Boolean(onCreateMissing) && !filtered.length && Boolean(trimmedQuery);

  return (
    <div className={`searchable-select multi${open ? " is-open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="searchable-select-trigger"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
      >
        <span className={selected.length ? "" : "is-placeholder"}>
          {selected.length ? `${selected.length} محدد` : (hasNone ? noneLabel : placeholder)}
        </span>
        <span className="searchable-select-chevron" aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="searchable-select-panel">
          <input
            ref={searchRef}
            type="search"
            className="searchable-select-search"
            value={query}
            placeholder="ابحث…"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && showCreateMissing) {
                e.preventDefault();
                const q = trimmedQuery;
                setOpen(false);
                setQuery("");
                onCreateMissing(q);
              }
            }}
          />
          <ScrollableMenu>
            {showNoneInList ? (
              <li>
                <button
                  type="button"
                  role="option"
                  aria-selected={!selected.length}
                  className={!selected.length ? "is-selected searchable-select-none" : "searchable-select-none"}
                  onClick={clearAll}
                >
                  {noneLabel}
                </button>
              </li>
            ) : null}
            {filtered.map((item) => (
              <li key={item.id}>
                <label className={`check${selected.includes(item.id) ? " is-selected" : ""}`}>
                  <input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} />
                  {item.label}
                </label>
              </li>
            ))}
            {showCreateMissing ? (
              <li className="searchable-select-missing">
                <p>{notFoundMessage} «{trimmedQuery}»</p>
                <button
                  type="button"
                  className="searchable-select-create-btn"
                  onClick={() => {
                    const q = trimmedQuery;
                    setOpen(false);
                    setQuery("");
                    onCreateMissing(q);
                  }}
                >
                  {createMissingLabel}
                </button>
              </li>
            ) : null}
            {!filtered.length && !showCreateMissing ? (
              <li className="searchable-select-empty">لا نتائج</li>
            ) : null}
          </ScrollableMenu>
        </div>
      )}
    </div>
  );
}
