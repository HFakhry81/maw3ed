import React, { useDeferredValue, useMemo, useState, useTransition } from "react";
import { WEEKDAY_NAMES_AR, ensureWeekHours } from "./WeekScheduleTable.jsx";
import { toMinutes, isOvernightShift } from "./shiftHours.js";

const PROVIDER_PALETTE = [
  "#2563eb", "#0d9488", "#c026d3", "#ea580c", "#4f46e5",
  "#059669", "#db2777", "#0891b2", "#ca8a04", "#7c3aed",
  "#dc2626", "#0284c7"
];

const HOUR_MARKS = [0, 3, 6, 9, 12, 15, 18, 21, 24];

export function colorForStaffId(id) {
  const raw = String(id || "");
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  return PROVIDER_PALETTE[hash % PROVIDER_PALETTE.length];
}

export function resolveStaffHours(person, facilityHours) {
  if (person?.useBusinessHours === false && Array.isArray(person.workingHours) && person.workingHours.length) {
    return ensureWeekHours(person.workingHours);
  }
  return ensureWeekHours(facilityHours || []);
}

/** Split a day shift into one or two segments on a 0–24h axis. */
function daySegments(day) {
  if (!day || day.isOpen === false) return [];
  const open = toMinutes(day.opensAt);
  const close = toMinutes(day.closesAt);
  if (!Number.isFinite(open) || !Number.isFinite(close) || open === close) return [];
  const overnight = day.overnight === true || isOvernightShift(day.opensAt, day.closesAt);
  if (overnight || close < open) {
    return [
      { start: open, end: 1440, overnight: true },
      ...(close > 0 ? [{ start: 0, end: close, overnight: true }] : [])
    ];
  }
  return [{ start: open, end: close, overnight: false }];
}

function pct(minutes) {
  return `${(Math.max(0, Math.min(1440, minutes)) / 1440) * 100}%`;
}

function personIsProvider(person, services) {
  return services.some((service) => (service.providerIds || []).includes(person.id));
}

function personMatchesCategory(person, categoryId, services) {
  if (!categoryId) return true;
  if (person.serviceCategoryId === categoryId) return true;
  return services.some(
    (service) => service.categoryId === categoryId && (service.providerIds || []).includes(person.id)
  );
}

function roleLabel(person, services) {
  const provider = personIsProvider(person, services);
  const title = String(person.title || "").toLowerCase();
  const responsible = /مشرف|مسؤول|مسئول|مدير|استقبال|reception|supervisor|manager/i.test(
    `${person.title || ""} ${person.servicePlace || ""}`
  ) || title.includes("reception");
  if (provider && responsible) return "مقدم + مسئول";
  if (responsible) return "موظف مسئول";
  if (provider) return "مقدم خدمة";
  return person.title || "موظف";
}

function serviceNamesForPerson(person, services, categoryId) {
  return services
    .filter((service) => {
      if (categoryId && service.categoryId !== categoryId) return false;
      return (service.providerIds || []).includes(person.id);
    })
    .map((service) => service.name)
    .slice(0, 3);
}

/**
 * Weekly 24h calendar: days × hours, colored staff shifts.
 * Top category chips act as filters.
 */
export function StaffShiftsBoard({ ops, filter = { kind: "all" }, onFilterChange, onOpenStaff }) {
  const categories = ops?.serviceCategories || [];
  const services = (ops?.services || []).filter((service) => service.active !== false);
  const staff = ops?.staff || [];
  const facilityHours = ops?.schedule?.general || [];

  const [query, setQuery] = useState("");
  const [focusStaffId, setFocusStaffId] = useState("");
  const [isPending, startTransition] = useTransition();
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const activeStaff = useMemo(
    () => staff.filter((person) => person.active !== false),
    [staff]
  );

  const hoursByStaff = useMemo(() => {
    const map = new Map();
    activeStaff.forEach((person) => map.set(person.id, resolveStaffHours(person, facilityHours)));
    return map;
  }, [activeStaff, facilityHours]);

  const filteredPeople = useMemo(() => {
    let list = activeStaff;
    const kind = filter?.kind || "all";
    if (kind === "providers") {
      list = list.filter((person) => personIsProvider(person, services));
    } else if (kind === "customHours") {
      list = list.filter((person) => person.useBusinessHours === false);
    } else if (kind === "unassigned") {
      list = list.filter((person) => {
        const hasCategory = Boolean(person.serviceCategoryId);
        const hasServices = personIsProvider(person, services);
        return !hasCategory && !hasServices;
      });
    } else if (kind === "category" && filter.categoryId) {
      list = list.filter((person) => personMatchesCategory(person, filter.categoryId, services));
    }

    if (deferredQuery) {
      list = list.filter((person) => {
        const names = serviceNamesForPerson(person, services, filter.kind === "category" ? filter.categoryId : "").join(" ");
        return `${person.name} ${person.title || ""} ${person.servicePlace || ""} ${names}`
          .toLowerCase()
          .includes(deferredQuery);
      });
    }
    return list;
  }, [activeStaff, services, filter, deferredQuery]);

  const legend = useMemo(
    () => filteredPeople.map((person) => ({
      person,
      color: colorForStaffId(person.id),
      role: roleLabel(person, services)
    })),
    [filteredPeople, services]
  );

  const dayRows = useMemo(() => (
    WEEKDAY_NAMES_AR.map((label, weekday) => {
      const blocks = [];
      filteredPeople.forEach((person) => {
        const days = hoursByStaff.get(person.id) || [];
        const day = days.find((item) => Number(item.weekday) === weekday);
        const segments = daySegments(day);
        if (!segments.length) return;
        const color = colorForStaffId(person.id);
        const servicesLabel = serviceNamesForPerson(
          person,
          services,
          filter.kind === "category" ? filter.categoryId : ""
        ).join(" · ");
        segments.forEach((segment, index) => {
          blocks.push({
            id: `${person.id}-${weekday}-${index}`,
            person,
            color,
            role: roleLabel(person, services),
            servicesLabel,
            start: segment.start,
            end: segment.end,
            overnight: segment.overnight,
            label: `${person.name} · ${day.opensAt}–${day.closesAt}${day.overnight ? " ليلية" : ""}`
          });
        });
      });

      // Lane packing so overlapping shifts stay readable
      const sorted = [...blocks].sort((a, b) => a.start - b.start || a.end - b.end);
      const laneEnds = [];
      sorted.forEach((block) => {
        let lane = laneEnds.findIndex((end) => end <= block.start);
        if (lane < 0) {
          lane = laneEnds.length;
          laneEnds.push(block.end);
        } else {
          laneEnds[lane] = block.end;
        }
        block.lane = lane;
      });
      const laneCount = Math.max(1, laneEnds.length);

      return { weekday, label, blocks: sorted, laneCount };
    })
  ), [filteredPeople, hoursByStaff, services, filter]);

  const setFilter = (next) => {
    onFilterChange?.(next);
    setFocusStaffId("");
  };

  const categoryTabs = useMemo(() => {
    return categories.map((category) => {
      const count = activeStaff.filter((person) => personMatchesCategory(person, category.id, services)).length;
      return { ...category, count };
    }).filter((item) => item.count > 0);
  }, [categories, activeStaff, services]);

  return (
    <section className="staff-shifts-board panel">
      <header className="staff-shifts-head">
        <div>
          <h2>تقويم توزيع الورديات</h2>
          <p className="muted">
            الأيام مقابل 24 ساعة — كل موظف بلون · مقدم خدمة / موظف مسئول
            {isPending ? " · جارٍ التصفية…" : ""}
          </p>
        </div>
        <div className="staff-shifts-meta">
          <span>{filteredPeople.length} ظاهر</span>
          <span>{dayRows.reduce((sum, row) => sum + row.blocks.length, 0)} شرائح</span>
        </div>
      </header>

      <div className="staff-filter-tabs" role="tablist" aria-label="فلاتر الورديات">
        <button
          type="button"
          role="tab"
          aria-selected={(filter?.kind || "all") === "all"}
          className={(filter?.kind || "all") === "all" ? "is-active" : ""}
          onClick={() => setFilter({ kind: "all" })}
        >
          الكل <b>{activeStaff.length}</b>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={filter?.kind === "providers"}
          className={filter?.kind === "providers" ? "is-active" : ""}
          onClick={() => setFilter({ kind: "providers" })}
        >
          مقدمو خدمات <b>{activeStaff.filter((p) => personIsProvider(p, services)).length}</b>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={filter?.kind === "customHours"}
          className={filter?.kind === "customHours" ? "is-active" : ""}
          onClick={() => setFilter({ kind: "customHours" })}
        >
          ساعات خاصة <b>{activeStaff.filter((p) => p.useBusinessHours === false).length}</b>
        </button>
        {categoryTabs.map((category) => (
          <button
            key={category.id}
            type="button"
            role="tab"
            aria-selected={filter?.kind === "category" && filter.categoryId === category.id}
            className={filter?.kind === "category" && filter.categoryId === category.id ? "is-active" : ""}
            onClick={() => setFilter({ kind: "category", categoryId: category.id })}
          >
            {category.name} <b>{category.count}</b>
          </button>
        ))}
      </div>

      <div className="staff-shifts-toolbar">
        <input
          className="search-input"
          value={query}
          onChange={(event) => {
            const value = event.target.value;
            startTransition(() => setQuery(value));
          }}
          placeholder="بحث بالاسم أو المهنة أو مكان الخدمة…"
          aria-label="بحث في التقويم"
        />
        {focusStaffId ? (
          <button type="button" className="ghost-button" onClick={() => setFocusStaffId("")}>إلغاء التركيز</button>
        ) : null}
      </div>

      {legend.length > 0 && (
        <div className="staff-shifts-legend" role="list">
          {legend.map(({ person, color, role }) => (
            <button
              key={person.id}
              type="button"
              role="listitem"
              className={`staff-shifts-legend-item${focusStaffId === person.id ? " is-active" : ""}`}
              style={{ "--provider-color": color }}
              onClick={() => setFocusStaffId((current) => (current === person.id ? "" : person.id))}
              onDoubleClick={() => onOpenStaff?.(person.id, "schedule")}
              title="نقرة للتركيز · نقرتان لفتح الجدول"
            >
              <i style={{ background: color }} />
              <span>{person.name}</span>
              <em>{role}</em>
            </button>
          ))}
        </div>
      )}

      <div className="staff-day-calendar" dir="ltr">
        <div className="staff-day-calendar-hours" aria-hidden="true">
          <span className="staff-day-calendar-corner" />
          <div className="staff-day-calendar-hour-track">
            {HOUR_MARKS.map((hour) => (
              <span key={hour} style={{ insetInlineStart: `${(hour / 24) * 100}%` }}>
                {String(hour).padStart(2, "0")}
              </span>
            ))}
          </div>
        </div>

        {!filteredPeople.length ? (
          <div className="empty-state">لا نتائج لهذا الفلتر</div>
        ) : (
          dayRows.map((row, rowIndex) => (
            <div
              className={`staff-day-calendar-row${rowIndex % 2 ? " is-alt" : ""}`}
              key={row.weekday}
            >
              <div className="staff-day-calendar-label">
                <strong>{row.label}</strong>
                <small>{row.blocks.length ? `${new Set(row.blocks.map((b) => b.person.id)).size} أشخاص` : "لا ورديات"}</small>
              </div>
              <div
                className="staff-day-calendar-track"
                style={{ "--lane-count": row.laneCount }}
              >
                {HOUR_MARKS.slice(1, -1).map((hour) => (
                  <i
                    key={hour}
                    className="staff-day-calendar-gridline"
                    style={{ insetInlineStart: `${(hour / 24) * 100}%` }}
                  />
                ))}
                {row.blocks.map((block) => {
                  const dimmed = focusStaffId && focusStaffId !== block.person.id;
                  return (
                    <button
                      type="button"
                      key={block.id}
                      className={`staff-day-shift${block.overnight ? " is-overnight" : ""}${dimmed ? " is-dimmed" : ""}${focusStaffId === block.person.id ? " is-focused" : ""}`}
                      style={{
                        insetInlineStart: pct(block.start),
                        width: pct(block.end - block.start),
                        top: `calc(${block.lane} * (100% / var(--lane-count)) + 2px)`,
                        height: `calc((100% / var(--lane-count)) - 4px)`,
                        background: block.color,
                        "--provider-color": block.color
                      }}
                      title={`${block.label}${block.servicesLabel ? ` · ${block.servicesLabel}` : ""} · ${block.role}`}
                      onClick={() => onOpenStaff?.(block.person.id, "schedule")}
                    >
                      <b>{block.person.name.split(/\s+/).slice(0, 2).join(" ")}</b>
                      <span>{block.role}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

/** Summary cards + filterable category tabs for the staff page. */
export function StaffStatsBar({ ops, filter = { kind: "all" }, onFilterChange }) {
  const staff = ops?.staff || [];
  const categories = ops?.serviceCategories || [];
  const services = ops?.services || [];

  const stats = useMemo(() => {
    const active = staff.filter((person) => person.active !== false);
    const withCustomHours = active.filter((person) => person.useBusinessHours === false).length;
    const providers = active.filter((person) => personIsProvider(person, services)).length;
    const byCategory = categories.map((category) => {
      const count = active.filter((person) => personMatchesCategory(person, category.id, services)).length;
      return { id: category.id, name: category.name, count };
    }).filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count);

    const unassigned = active.filter((person) => {
      const hasCategory = Boolean(person.serviceCategoryId);
      const hasServices = personIsProvider(person, services);
      return !hasCategory && !hasServices;
    }).length;

    return {
      total: staff.length,
      active: active.length,
      providers,
      withCustomHours,
      byCategory,
      unassigned
    };
  }, [staff, categories, services]);

  const select = (next) => onFilterChange?.(next);

  return (
    <div className="staff-stats">
      <div className="stats-cards staff-stats-cards">
        <button
          type="button"
          className={`panel staff-stat-card${(filter?.kind || "all") === "all" ? " is-active" : ""}`}
          onClick={() => select({ kind: "all" })}
        >
          <span>إجمالي الموظفين</span><b>{stats.total}</b>
        </button>
        <button
          type="button"
          className={`panel staff-stat-card${filter?.kind === "providers" ? " is-active" : ""}`}
          onClick={() => select({ kind: "providers" })}
        >
          <span>مقدمو خدمات</span><b>{stats.providers}</b>
        </button>
        <button
          type="button"
          className={`panel staff-stat-card${filter?.kind === "customHours" ? " is-active" : ""}`}
          onClick={() => select({ kind: "customHours" })}
        >
          <span>ساعات خاصة</span><b>{stats.withCustomHours}</b>
        </button>
        <button
          type="button"
          className={`panel staff-stat-card${filter?.kind === "unassigned" ? " is-active" : ""}`}
          onClick={() => select({ kind: "unassigned" })}
        >
          <span>بدون قسم</span><b>{stats.unassigned}</b>
        </button>
      </div>
      {(stats.byCategory.length > 0 || stats.unassigned > 0) && (
        <div className="staff-stats-categories panel">
          <div className="staff-stats-categories-head">
            <strong>فلتر حسب القسم / فئة الخدمة</strong>
            <small>اضغط لتحديث التقويم والقائمة</small>
          </div>
          <div className="staff-stats-chips" role="tablist">
            <button
              type="button"
              className={`staff-stats-chip${(filter?.kind || "all") === "all" ? " is-active" : ""}`}
              onClick={() => select({ kind: "all" })}
            >
              <b>{stats.active}</b>
              <span>الكل</span>
            </button>
            {stats.byCategory.map((item) => (
              <button
                type="button"
                className={`staff-stats-chip${filter?.kind === "category" && filter.categoryId === item.id ? " is-active" : ""}`}
                key={item.id}
                onClick={() => select({ kind: "category", categoryId: item.id })}
              >
                <b>{item.count}</b>
                <span>{item.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
