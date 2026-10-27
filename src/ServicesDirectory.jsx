import React, { useMemo, useState } from "react";
import { CategoryProvidersTable } from "./ServiceProvidersTable.jsx";
import { adminsForCategory, sortByKey, compareText } from "./staffRoleGroups.js";
import { formatMoney } from "./i18n";
import { occupancyShortBadge, occupancyModeLabel } from "./occupancyLabels.js";

/**
 * Services directory: insight zones + sortable category→service→provider table.
 */
export function ServicesDirectory({
  ops,
  locale,
  categoryId,
  onCategoryChange,
  onOpenCreate,
  onOpenEdit,
  onToggleActive,
  onDelete,
  onOpenCategoryCreate,
  onOpenCategoryEdit,
  onToggleCategoryActive,
  onDeleteCategory,
  reload,
  canWrite = true
}) {
  const categories = ops?.serviceCategories || [];
  const allServices = ops?.services || [];
  const staff = ops?.staff || [];
  const [sortKey, setSortKey] = useState("categoryName");
  const [sortDir, setSortDir] = useState("asc");
  const [query, setQuery] = useState("");
  const [viewFilter, setViewFilter] = useState("all"); // all | noProvider | public | inactive
  const [collapsedCats, setCollapsedCats] = useState({});

  const insights = useMemo(() => {
    const active = allServices.filter((s) => s.active !== false);
    const noProvider = active.filter((s) => !(s.providerIds || []).length);
    const publicOpen = active.filter((s) => s.publicBooking !== false);
    const publicNoProvider = publicOpen.filter((s) => !(s.providerIds || []).length);
    const inactive = allServices.filter((s) => s.active === false);
    return {
      total: allServices.length,
      categories: categories.length,
      noProvider: noProvider.length,
      publicNoProvider: publicNoProvider.length,
      inactive: inactive.length
    };
  }, [allServices, categories]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allServices
      .filter((service) => {
        if (categoryId && service.categoryId !== categoryId) return false;
        if (viewFilter === "noProvider") return !(service.providerIds || []).length;
        if (viewFilter === "public") return service.publicBooking !== false && !(service.providerIds || []).length;
        if (viewFilter === "inactive") return service.active === false;
        return true;
      })
      .map((service) => {
        const category = categories.find((item) => item.id === service.categoryId);
        const providers = (service.providers || []).length
          ? service.providers
          : (service.providerIds || [])
            .map((id) => staff.find((person) => person.id === id))
            .filter(Boolean)
            .map((person) => ({ id: person.id, name: person.name, title: person.title || "" }));
        const admins = adminsForCategory(service.categoryId, staff, allServices);
        const type = service.pricingType || "fixed";
        let priceLabel;
        if (type === "free") priceLabel = "مجاني";
        else if (type === "on_request") priceLabel = "عند الطلب";
        else if (type === "range") {
          priceLabel = `${formatMoney(service.priceMin ?? service.price ?? 0, locale)} – ${formatMoney(service.priceMax ?? service.price ?? 0, locale)}`;
        } else {
          priceLabel = Number(service.price) === 0 ? "مجاني" : formatMoney(service.price, locale);
        }
        return {
          id: service.id,
          service,
          categoryId: service.categoryId || "",
          categoryName: category?.name || "بدون فئة",
          name: service.name || "",
          duration: (Number(service.durationMinutes) || 0) + (Number(service.bufferMinutes) || 0),
          priceLabel,
          providersLabel: providers.map((p) => p.name).join("، ") || "— بلا مقدم",
          providersCount: providers.length,
          adminLabel: admins.map((p) => p.name).join("، ") || "—",
          status: service.active === false ? "متوقفة" : (service.publicBooking !== false ? "عامة" : "داخلية"),
          publicBooking: service.publicBooking !== false,
          active: service.active !== false,
          occupancyMode: service.occupancyMode || "exclusive",
          occupancyBadge: occupancyShortBadge(service.occupancyMode),
          occupancyLabel: occupancyModeLabel(service.occupancyMode, locale),
          defaultCapacity: service.defaultCapacity
        };
      })
      .filter((row) => {
        if (!q) return true;
        return `${row.categoryName} ${row.name} ${row.providersLabel} ${row.adminLabel} ${row.occupancyLabel}`
          .toLowerCase()
          .includes(q);
      });
  }, [allServices, categories, staff, categoryId, viewFilter, query, locale]);

  const sorted = useMemo(() => sortByKey(rows, sortKey, sortDir), [rows, sortKey, sortDir]);

  const byCategory = useMemo(() => {
    const map = new Map();
    sorted.forEach((row) => {
      if (!map.has(row.categoryId)) {
        map.set(row.categoryId, { id: row.categoryId, name: row.categoryName, rows: [] });
      }
      map.get(row.categoryId).rows.push(row);
    });
    return [...map.values()].sort((a, b) => compareText(a.name, b.name));
  }, [sorted]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortTh = ({ col, children }) => (
    <th>
      <button type="button" className={`dir-sort${sortKey === col ? " is-active" : ""}`} onClick={() => toggleSort(col)}>
        {children}
        <span aria-hidden="true">{sortKey === col ? (sortDir === "asc" ? "↑" : "↓") : "↕"}</span>
      </button>
    </th>
  );

  const countInCategory = (id) => allServices.filter((service) => service.categoryId === id).length;

  return (
    <div className="dir-layout services-dir">
      <section className="dir-zone panel" aria-label="مؤشرات الخدمات">
        <div className="dir-zone-head">
          <b>لمحة سريعة</b>
          <small>اضغط لإبراز الفجوات</small>
        </div>
        <div className="dir-insight-grid">
          <button type="button" className={`dir-insight${viewFilter === "all" && !categoryId ? " is-active" : ""}`} onClick={() => { setViewFilter("all"); onCategoryChange?.(""); }}>
            <span>كل الخدمات</span><strong>{insights.total}</strong>
          </button>
          <button type="button" className={`dir-insight is-warn${viewFilter === "noProvider" ? " is-active" : ""}`} onClick={() => setViewFilter("noProvider")}>
            <span>بلا مقدم</span><strong>{insights.noProvider}</strong>
          </button>
          <button type="button" className={`dir-insight is-warn${viewFilter === "public" ? " is-active" : ""}`} onClick={() => setViewFilter("public")}>
            <span>عامة بلا مقدم</span><strong>{insights.publicNoProvider}</strong>
          </button>
          <button type="button" className={`dir-insight${viewFilter === "inactive" ? " is-active" : ""}`} onClick={() => setViewFilter("inactive")}>
            <span>متوقفة</span><strong>{insights.inactive}</strong>
          </button>
          <button type="button" className="dir-insight" disabled>
            <span>فئات</span><strong>{insights.categories}</strong>
          </button>
        </div>
      </section>

      <div className="services-dir-split">
        <aside className="panel dir-zone category-rail" aria-label="فئات الخدمة">
          <div className="dir-zone-head">
            <b>فئة الخدمة</b>
            {canWrite && onOpenCategoryCreate ? (
              <button type="button" className="ghost-button" onClick={onOpenCategoryCreate}>+ إضافة</button>
            ) : null}
          </div>
          <button
            type="button"
            className={`cat${!categoryId ? " active" : ""}`}
            onClick={() => onCategoryChange?.("")}
          >
            <span className="cat-name">كل الفئات</span>
            <span className="cat-count">{allServices.length}</span>
          </button>
          {categories.map((category) => {
            const inactive = category.active === false || category.enabled === false;
            const count = countInCategory(category.id);
            return (
              <div key={category.id} className={categoryId === category.id ? "cat-row active" : "cat-row"}>
                <button type="button" className={categoryId === category.id ? "cat active" : "cat"} onClick={() => onCategoryChange?.(category.id)}>
                  <span className="cat-name">
                    {category.name} ({count})
                    {inactive ? <span className="status-soft">متوقفة</span> : null}
                  </span>
                  <span className="cat-count">{count}</span>
                </button>
                {canWrite ? (
                  <div className="row-actions compact">
                    <button type="button" className="edit-button" onClick={() => onOpenCategoryEdit?.(category)}>تعديل</button>
                    <button type="button" className="warn-button" onClick={() => onToggleCategoryActive?.(category)}>{inactive ? "تفعيل" : "إيقاف"}</button>
                    <button type="button" className="danger-button" onClick={() => onDeleteCategory?.(category)}>حذف</button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </aside>

        <div className="services-dir-main">
          <section className="dir-zone panel">
            <div className="dir-zone-head">
              <div>
                <b>{categoryId ? `خدمات «${categories.find((c) => c.id === categoryId)?.name || ""}»` : "مصفوفة الخدمات"}</b>
                <small className="muted">فئة ← خدمة ← مقدم ← إداري</small>
              </div>
              <div className="dir-zone-tools">
                <input
                  className="search-input dir-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="بحث خدمة / مقدم / إداري…"
                  aria-label="بحث الخدمات"
                />
                {canWrite && onOpenCreate ? (
                  <button type="button" className="primary-button" onClick={onOpenCreate}>+ خدمة</button>
                ) : null}
              </div>
            </div>

            {categoryId ? (
              <CategoryProvidersTable
                ops={ops}
                categoryId={categoryId}
                reload={reload}
                onOpenService={onOpenEdit}
                title="المقدمون في الفئة"
              />
            ) : null}

            {!byCategory.length ? (
              <div className="empty-state">لا خدمات مطابقة</div>
            ) : (
              byCategory.map((bucket) => {
                const closed = collapsedCats[bucket.id] === true;
                const admins = adminsForCategory(bucket.id, staff, allServices);
                const count = bucket.rows.length;
                return (
                  <div className="dir-group" key={bucket.id || "none"}>
                    <button
                      type="button"
                      className="dir-group-toggle"
                      onClick={() => setCollapsedCats((c) => ({ ...c, [bucket.id]: !closed }))}
                    >
                      <strong>{bucket.name} ({count})</strong>
                      <span>{count} خدمة</span>
                      <span className="dir-group-meta">إداري: {admins.map((a) => a.name).join("، ") || "—"}</span>
                      <em>{closed ? "▾" : "▴"}</em>
                    </button>
                    {!closed && (
                      <div className="dir-table-wrap">
                        <table className="dir-table">
                          <thead>
                            <tr>
                              <SortTh col="name">الخدمة</SortTh>
                              <SortTh col="occupancyBadge">الإشغال</SortTh>
                              <SortTh col="providersLabel">مقدم الخدمة</SortTh>
                              <SortTh col="adminLabel">الإداري المختص</SortTh>
                              <SortTh col="duration">الحجز (د)</SortTh>
                              <SortTh col="priceLabel">السعر</SortTh>
                              <SortTh col="status">الحالة</SortTh>
                              {canWrite ? <th>إجراءات</th> : null}
                            </tr>
                          </thead>
                          <tbody>
                            {bucket.rows.map((row, index) => (
                              <tr key={row.id} className={`${index % 2 ? "is-alt" : ""}${!row.providersCount ? " is-gap" : ""}`}>
                                <td>
                                  <span className="dir-service-name">
                                    <i style={{ background: row.service.color || "#3B82F6" }} />
                                    {row.name}
                                  </span>
                                </td>
                                <td>
                                  <span className="status-soft" title={row.occupancyLabel}>
                                    {row.occupancyBadge}
                                    {row.occupancyMode === "session_capacity" && row.defaultCapacity
                                      ? ` · ${row.defaultCapacity}`
                                      : ""}
                                  </span>
                                </td>
                                <td className={!row.providersCount ? "is-gap-text" : ""}>{row.providersLabel}</td>
                                <td>{row.adminLabel}</td>
                                <td>{row.duration}</td>
                                <td>{row.priceLabel}</td>
                                <td>{row.status}</td>
                                {canWrite ? (
                                  <td className="dir-actions">
                                    <button type="button" className="edit-button" onClick={() => onOpenEdit?.(row.service)}>تعديل</button>
                                    <button type="button" className="warn-button" onClick={() => onToggleActive?.(row.service)}>
                                      {row.active ? "إيقاف" : "تفعيل"}
                                    </button>
                                    <button type="button" className="danger-button" onClick={() => onDelete?.(row.service)}>حذف</button>
                                  </td>
                                ) : null}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
