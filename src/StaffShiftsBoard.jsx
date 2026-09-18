import React, { useDeferredValue, useMemo, useState, useTransition } from "react";
import { WEEKDAY_NAMES_AR, ensureWeekHours } from "./WeekScheduleTable.jsx";
import { toMinutes, fromMinutes, isOvernightShift } from "./shiftHours.js";

const PROVIDER_PALETTE = [
  "#2563eb", "#0d9488", "#c026d3", "#ea580c", "#4f46e5",
  "#059669", "#db2777", "#0891b2", "#ca8a04", "#7c3aed",
  "#dc2626", "#0284c7"
];

const TRACK_START = 6 * 60;
const TRACK_END = 24 * 60;
const TRACK_SPAN = TRACK_END - TRACK_START;

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

function barStyle(opensAt, closesAt, overnight) {
  const open = toMinutes(opensAt);
  const close = toMinutes(closesAt);
  if (!Number.isFinite(open) || !Number.isFinite(close)) return null;
  const night = overnight === true || isOvernightShift(opensAt, closesAt);
  if (night) {
    const left = Math.max(0, ((open - TRACK_START) / TRACK_SPAN) * 100);
    const width = Math.max(4, ((TRACK_END - open) / TRACK_SPAN) * 100);
    return { left: `${left}%`, width: `${Math.min(100 - left, width)}%`, overnight: true };
  }
  const start = Math.max(TRACK_START, Math.min(TRACK_END, open));
  const end = Math.max(TRACK_START, Math.min(TRACK_END, close));
  if (end <= start) return null;
  const left = ((start - TRACK_START) / TRACK_SPAN) * 100;
  const width = ((end - start) / TRACK_SPAN) * 100;
  return { left: `${left}%`, width: `${Math.max(3, width)}%`, overnight: false };
}

function formatShiftLabel(day) {
  if (!day || day.isOpen === false) return "إجازة";
  const base = `${day.opensAt}–${day.closesAt}`;
  return day.overnight ? `${base} (ليلية)` : base;
}

/**
 * Weekly shifts board: category → services → colored provider timelines.
 */
export function StaffShiftsBoard({ ops, onOpenStaff }) {
  const categories = ops?.serviceCategories || [];
  const services = (ops?.services || []).filter((service) => service.active !== false);
  const staff = (ops?.staff || []).filter((person) => person.active !== false);
  const facilityHours = ops?.schedule?.general || [];

  const [query, setQuery] = useState("");
  const [focusStaffId, setFocusStaffId] = useState("");
  const [collapsed, setCollapsed] = useState({});
  const [isPending, startTransition] = useTransition();
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const staffById = useMemo(() => {
    const map = new Map();
    staff.forEach((person) => map.set(person.id, person));
    return map;
  }, [staff]);

  const hoursByStaff = useMemo(() => {
    const map = new Map();
    staff.forEach((person) => map.set(person.id, resolveStaffHours(person, facilityHours)));
    return map;
  }, [staff, facilityHours]);

  const tree = useMemo(() => {
    const uncategorized = { id: "__none__", name: "بدون فئة", services: [] };
    const byCategory = new Map(categories.map((category) => [category.id, { ...category, services: [] }]));

    services.forEach((service) => {
      const providerIds = [...new Set([
        ...(service.providerIds || []),
        ...staff
          .filter((person) => (person.serviceIds || []).includes(service.id))
          .map((person) => person.id)
      ])].filter((id) => staffById.has(id));

      if (deferredQuery) {
        const hay = `${service.name} ${(byCategory.get(service.categoryId)?.name) || ""}`.toLowerCase();
        const providerHit = providerIds.some((id) => {
          const person = staffById.get(id);
          return person && `${person.name} ${person.title || ""} ${person.servicePlace || ""}`.toLowerCase().includes(deferredQuery);
        });
        if (!hay.includes(deferredQuery) && !providerHit) return;
      }

      const providers = providerIds.map((id) => {
        const person = staffById.get(id);
        return {
          person,
          color: colorForStaffId(id),
          days: hoursByStaff.get(id) || ensureWeekHours([])
        };
      }).filter((item) => item.person);

      const node = { ...service, providers };
      const bucket = byCategory.get(service.categoryId) || uncategorized;
      bucket.services.push(node);
      if (!byCategory.has(service.categoryId) && bucket === uncategorized) {
        /* keep on uncategorized */
      }
    });

    const ranked = categories
      .map((category) => byCategory.get(category.id))
      .filter((item) => item && item.services.length);
    if (uncategorized.services.length) ranked.push(uncategorized);
    return ranked;
  }, [categories, services, staff, staffById, hoursByStaff, deferredQuery]);

  const legend = useMemo(() => {
    const seen = new Map();
    tree.forEach((category) => {
      category.services.forEach((service) => {
        service.providers.forEach(({ person, color }) => {
          if (!seen.has(person.id)) seen.set(person.id, { person, color });
        });
      });
    });
    return [...seen.values()];
  }, [tree]);

  const totalProviders = legend.length;
  const totalServices = tree.reduce((sum, category) => sum + category.services.length, 0);

  return (
    <section className="staff-shifts-board panel">
      <header className="staff-shifts-head">
        <div>
          <h2>توزيع ورديات العمل</h2>
          <p className="muted">
            تقويم أسبوعي حسب فئة الخدمة ومجموعة الخدمات — كل مقدم بلون ثابت
            {isPending ? " · جارٍ التصفية…" : ""}
          </p>
        </div>
        <div className="staff-shifts-meta">
          <span>{tree.length} فئات</span>
          <span>{totalServices} خدمات</span>
          <span>{totalProviders} مقدّمون</span>
        </div>
      </header>

      <div className="staff-shifts-toolbar">
        <input
          className="search-input"
          value={query}
          onChange={(event) => {
            const value = event.target.value;
            startTransition(() => setQuery(value));
          }}
          placeholder="تصفية بالفئة أو الخدمة أو اسم المقدم…"
          aria-label="تصفية توزيع الورديات"
        />
        {focusStaffId ? (
          <button type="button" className="ghost-button" onClick={() => setFocusStaffId("")}>إلغاء التركيز</button>
        ) : null}
      </div>

      {legend.length > 0 && (
        <div className="staff-shifts-legend" role="list">
          {legend.map(({ person, color }) => (
            <button
              key={person.id}
              type="button"
              role="listitem"
              className={`staff-shifts-legend-item${focusStaffId === person.id ? " is-active" : ""}`}
              style={{ "--provider-color": color }}
              onClick={() => setFocusStaffId((current) => (current === person.id ? "" : person.id))}
              onDoubleClick={() => onOpenStaff?.(person.id, "schedule")}
              title="نقرة للتركيز · نقرتان لملف الموظف"
            >
              <i style={{ background: color }} />
              <span>{person.name}</span>
            </button>
          ))}
        </div>
      )}

      <div className="staff-shifts-scale" aria-hidden="true">
        <span>٦ ص</span>
        <span>١٢</span>
        <span>٦ م</span>
        <span>١٢</span>
      </div>

      {!tree.length ? (
        <div className="empty-state">لا توجد خدمات/مقدمون لعرض الورديات. اربط الموظفين بالخدمات أولاً.</div>
      ) : (
        tree.map((category) => {
          const isCollapsed = collapsed[category.id] === true;
          return (
            <div className="staff-shifts-category" key={category.id}>
              <button
                type="button"
                className="staff-shifts-category-toggle"
                onClick={() => setCollapsed((current) => ({ ...current, [category.id]: !isCollapsed }))}
                aria-expanded={!isCollapsed}
              >
                <strong>{category.name}</strong>
                <span>{category.services.length} خدمات · {new Set(category.services.flatMap((s) => s.providers.map((p) => p.person.id))).size} مقدّمون</span>
                <em>{isCollapsed ? "▾" : "▴"}</em>
              </button>
              {!isCollapsed && category.services.map((service) => (
                <div className="staff-shifts-service" key={service.id}>
                  <div className="staff-shifts-service-head">
                    <b>{service.name}</b>
                    <small>{service.durationMinutes || 30} د · {service.providers.length} مقدم</small>
                  </div>
                  {!service.providers.length ? (
                    <p className="muted staff-shifts-empty">لا مقدّم مرتبط بهذه الخدمة</p>
                  ) : (
                    <>
                      <div className="staff-shifts-week-head" aria-hidden="true">
                        <span className="staff-shifts-provider-col">المقدم</span>
                        {WEEKDAY_NAMES_AR.map((label) => <span key={label}>{label}</span>)}
                      </div>
                      {service.providers.map(({ person, color, days }) => {
                        const dimmed = focusStaffId && focusStaffId !== person.id;
                        return (
                          <div
                            className={`staff-shifts-provider-row${dimmed ? " is-dimmed" : ""}${focusStaffId === person.id ? " is-focused" : ""}`}
                            key={`${service.id}-${person.id}`}
                            style={{ "--provider-color": color }}
                          >
                            <button
                              type="button"
                              className="staff-shifts-provider-name"
                              onClick={() => onOpenStaff?.(person.id, "schedule")}
                              title="فتح جدول الموظف"
                            >
                              <i style={{ background: color }} />
                              <span>
                                <b>{person.name}</b>
                                <small>{person.servicePlace || person.title || "—"}</small>
                              </span>
                            </button>
                            {days.map((day) => {
                              const closed = day.isOpen === false;
                              const style = closed ? null : barStyle(day.opensAt, day.closesAt, day.overnight);
                              return (
                                <div className={`staff-shifts-day${closed ? " is-off" : ""}`} key={day.weekday} title={formatShiftLabel(day)}>
                                  <div className="staff-shifts-track">
                                    {style ? (
                                      <span
                                        className={`staff-shifts-bar${style.overnight ? " is-overnight" : ""}`}
                                        style={{ left: style.left, width: style.width, background: color }}
                                      />
                                    ) : (
                                      <span className="staff-shifts-off">—</span>
                                    )}
                                  </div>
                                  {!closed && style ? (
                                    <small>{fromMinutes(toMinutes(day.opensAt)).slice(0, 5)}–{day.closesAt}</small>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              ))}
            </div>
          );
        })
      )}
    </section>
  );
}

/** Summary cards for the staff page. */
export function StaffStatsBar({ ops }) {
  const staff = ops?.staff || [];
  const categories = ops?.serviceCategories || [];
  const services = ops?.services || [];

  const stats = useMemo(() => {
    const active = staff.filter((person) => person.active !== false);
    const withCustomHours = active.filter((person) => person.useBusinessHours === false).length;
    const providers = active.filter((person) => {
      const linked = person.serviceIds?.length
        || services.some((service) => (service.providerIds || []).includes(person.id));
      return Boolean(linked);
    }).length;
    const byCategory = categories.map((category) => {
      const count = active.filter((person) => {
        if (person.serviceCategoryId === category.id) return true;
        const linkedIds = person.serviceIds || [];
        return services.some(
          (service) => service.categoryId === category.id
            && (linkedIds.includes(service.id) || (service.providerIds || []).includes(person.id))
        );
      }).length;
      return { id: category.id, name: category.name, count };
    }).filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count);

    const unassigned = active.filter((person) => {
      const hasCategory = Boolean(person.serviceCategoryId);
      const hasServices = (person.serviceIds || []).length > 0
        || services.some((service) => (service.providerIds || []).includes(person.id));
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

  return (
    <div className="staff-stats">
      <div className="stats-cards staff-stats-cards">
        <div className="panel"><span>إجمالي الموظفين</span><b>{stats.total}</b></div>
        <div className="panel"><span>نشطون</span><b>{stats.active}</b></div>
        <div className="panel"><span>مقدمو خدمات</span><b>{stats.providers}</b></div>
        <div className="panel"><span>ساعات خاصة</span><b>{stats.withCustomHours}</b></div>
      </div>
      {(stats.byCategory.length > 0 || stats.unassigned > 0) && (
        <div className="staff-stats-categories panel">
          <div className="staff-stats-categories-head">
            <strong>حسب القسم / فئة الخدمة</strong>
            <small>{stats.byCategory.length} أقسام فيها موظفون</small>
          </div>
          <div className="staff-stats-chips">
            {stats.byCategory.map((item) => (
              <span className="staff-stats-chip" key={item.id}>
                <b>{item.count}</b>
                <span>{item.name}</span>
              </span>
            ))}
            {stats.unassigned > 0 ? (
              <span className="staff-stats-chip is-muted">
                <b>{stats.unassigned}</b>
                <span>بدون قسم</span>
              </span>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
