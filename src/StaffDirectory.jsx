import React, { useMemo, useState } from "react";
import { colorForStaffId } from "./StaffShiftsBoard.jsx";
import {
  STAFF_ROLE_GROUPS,
  staffRoleGroupId,
  isProviderStaff,
  isUnassignedStaff,
  categoryNameForStaff,
  sortByKey
} from "./staffRoleGroups.js";

/**
 * Staff directory: insight zones + sortable table grouped by role family.
 */
export function StaffDirectory({
  ops,
  filter,
  onFilterChange,
  onOpenStaff,
  onEdit,
  onDelete
}) {
  const staff = ops?.staff || [];
  const services = ops?.services || [];
  const categories = ops?.serviceCategories || [];
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [collapsed, setCollapsed] = useState({});
  const [query, setQuery] = useState("");

  const insights = useMemo(() => {
    const active = staff.filter((person) => person.active !== false);
    const providers = active.filter((person) => isProviderStaff(person, services));
    const unassigned = active.filter((person) => isUnassignedStaff(person, services));
    const admins = active.filter((person) => staffRoleGroupId(person.title) === "admin");
    const noCategory = active.filter((person) => !person.serviceCategoryId);
    return {
      total: staff.length,
      active: active.length,
      providers: providers.length,
      unassigned: unassigned.length,
      admins: admins.length,
      noCategory: noCategory.length
    };
  }, [staff, services]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return staff
      .filter((person) => {
        const kind = filter?.kind || "all";
        if (kind === "providers") return isProviderStaff(person, services);
        if (kind === "unassigned") return isUnassignedStaff(person, services);
        if (kind === "admins") return staffRoleGroupId(person.title) === "admin";
        if (kind === "customHours") return person.useBusinessHours === false;
        if (kind === "category" && filter.categoryId) {
          if (person.serviceCategoryId === filter.categoryId) return true;
          return services.some(
            (service) => service.categoryId === filter.categoryId
              && (service.providerIds || []).includes(person.id)
          );
        }
        return true;
      })
      .filter((person) => {
        if (!q) return true;
        const category = categoryNameForStaff(person, categories, services);
        return `${person.name} ${person.title || ""} ${person.phone || ""} ${person.servicePlace || ""} ${category}`
          .toLowerCase()
          .includes(q);
      })
      .map((person) => ({
        id: person.id,
        person,
        name: person.name || "",
        title: person.title || "",
        roleGroup: staffRoleGroupId(person.title),
        category: categoryNameForStaff(person, categories, services),
        place: person.servicePlace || "—",
        phone: person.phone || "—",
        servicesCount: person.servicesCount || services.filter((s) => (s.providerIds || []).includes(person.id)).length,
        hours: person.useBusinessHours === false ? "خاصة" : "منشأة",
        active: person.active !== false
      }));
  }, [staff, services, categories, filter, query]);

  const sorted = useMemo(() => sortByKey(rows, sortKey, sortDir), [rows, sortKey, sortDir]);

  const grouped = useMemo(() => {
    return STAFF_ROLE_GROUPS.map((group) => ({
      ...group,
      rows: sorted.filter((row) => row.roleGroup === group.id)
    })).filter((group) => group.rows.length);
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
      <button
        type="button"
        className={`dir-sort${sortKey === col ? " is-active" : ""}`}
        onClick={() => toggleSort(col)}
      >
        {children}
        <span aria-hidden="true">{sortKey === col ? (sortDir === "asc" ? "↑" : "↓") : "↕"}</span>
      </button>
    </th>
  );

  return (
    <div className="dir-layout">
      <section className="dir-zone panel" aria-label="مؤشرات الموظفين">
        <div className="dir-zone-head">
          <b>لمحة سريعة</b>
          <small>اضغط للتصفية</small>
        </div>
        <div className="dir-insight-grid">
          <button type="button" className={`dir-insight${(filter?.kind || "all") === "all" ? " is-active" : ""}`} onClick={() => onFilterChange?.({ kind: "all" })}>
            <span>الكل</span><strong>{insights.total}</strong>
          </button>
          <button type="button" className={`dir-insight${filter?.kind === "providers" ? " is-active" : ""}`} onClick={() => onFilterChange?.({ kind: "providers" })}>
            <span>مقدمو خدمة</span><strong>{insights.providers}</strong>
          </button>
          <button type="button" className={`dir-insight${filter?.kind === "admins" ? " is-active" : ""}`} onClick={() => onFilterChange?.({ kind: "admins" })}>
            <span>إداري / حجز</span><strong>{insights.admins}</strong>
          </button>
          <button type="button" className={`dir-insight is-warn${filter?.kind === "unassigned" ? " is-active" : ""}`} onClick={() => onFilterChange?.({ kind: "unassigned" })}>
            <span>غير معيّنين</span><strong>{insights.unassigned}</strong>
          </button>
          <button type="button" className={`dir-insight${filter?.kind === "customHours" ? " is-active" : ""}`} onClick={() => onFilterChange?.({ kind: "customHours" })}>
            <span>ساعات خاصة</span><strong>{staff.filter((p) => p.useBusinessHours === false).length}</strong>
          </button>
        </div>
      </section>

      <section className="dir-zone panel" aria-label="دليل الموظفين">
        <div className="dir-zone-head">
          <b>دليل الموظفين</b>
          <input
            className="search-input dir-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="بحث بالاسم / المهنة / القسم…"
          />
        </div>

        {!grouped.length ? (
          <div className="empty-state">لا نتائج لهذا العرض</div>
        ) : (
          grouped.map((group) => {
            const closed = collapsed[group.id] === true;
            return (
              <div className="dir-group" key={group.id}>
                <button
                  type="button"
                  className="dir-group-toggle"
                  onClick={() => setCollapsed((c) => ({ ...c, [group.id]: !closed }))}
                  aria-expanded={!closed}
                >
                  <strong>{group.label}</strong>
                  <span>{group.rows.length}</span>
                  <em>{closed ? "▾" : "▴"}</em>
                </button>
                {!closed && (
                  <div className="dir-table-wrap">
                    <table className="dir-table">
                      <thead>
                        <tr>
                          <SortTh col="name">الاسم</SortTh>
                          <SortTh col="title">المهنة</SortTh>
                          <SortTh col="category">فئة الخدمة</SortTh>
                          <SortTh col="place">مكان الخدمة</SortTh>
                          <SortTh col="phone">الهاتف</SortTh>
                          <SortTh col="servicesCount">خدمات</SortTh>
                          <SortTh col="hours">الساعات</SortTh>
                          <th>إجراءات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map((row, index) => (
                          <tr key={row.id} className={index % 2 ? "is-alt" : ""}>
                            <td>
                              <button type="button" className="dir-name-btn" onClick={() => onOpenStaff?.(row.id, "history")}>
                                <i style={{ background: colorForStaffId(row.id) }} />
                                <span>{row.name}</span>
                              </button>
                            </td>
                            <td>{row.title || "—"}</td>
                            <td>{row.category}</td>
                            <td>{row.place}</td>
                            <td>{row.phone}</td>
                            <td>{row.servicesCount}</td>
                            <td>{row.hours}</td>
                            <td className="dir-actions">
                              <button type="button" className="ghost-button" onClick={() => onOpenStaff?.(row.id, "history")}>الملف</button>
                              <button type="button" className="edit-button" onClick={() => onEdit?.(row.person)}>تعديل</button>
                              <button type="button" className="danger-button" onClick={() => onDelete?.(row.person)}>حذف</button>
                            </td>
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
  );
}
