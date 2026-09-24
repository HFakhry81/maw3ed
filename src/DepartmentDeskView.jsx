import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { formatMoney } from "./i18n";
import { confirmSaved, confirmSaveFailed } from "./saveFeedback.jsx";
import { staffRoleGroupId } from "./staffRoleGroups.js";
import { QrCodeScanner } from "./QrCodeScanner.jsx";

/**
 * Department attendance desk: QR / token check-in + active visit add-ons.
 */
export function DepartmentDeskView({ ops, locale, reloadAppointments }) {
  const categories = ops?.serviceCategories || [];
  const [categoryId, setCategoryId] = useState(categories[0]?.id || "");
  const [actorStaffId, setActorStaffId] = useState("");
  const [desk, setDesk] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeId, setActiveId] = useState("");
  const [checkInBusy, setCheckInBusy] = useState(false);
  const [addonOpen, setAddonOpen] = useState(false);

  const deskStaff = useMemo(() => {
    return (ops?.staff || []).filter((person) => {
      if (person.active === false) return false;
      const role = staffRoleGroupId(person.title);
      if (role !== "admin" && role !== "other") {
        // allow nurses/doctors only if linked to category as admin fallback empty
      }
      if (!categoryId) return role === "admin";
      return (
        role === "admin"
        || person.serviceCategoryId === categoryId
        || (ops?.services || []).some(
          (service) => service.categoryId === categoryId && (service.providerIds || []).includes(person.id)
        )
      );
    });
  }, [ops, categoryId]);

  const categoryServices = useMemo(
    () => (ops?.services || []).filter(
      (service) => service.categoryId === categoryId && service.active !== false
    ),
    [ops, categoryId]
  );

  const activeVisit = useMemo(() => {
    const rows = desk?.active || [];
    return rows.find((item) => item.id === activeId) || rows[0] || null;
  }, [desk, activeId]);

  const loadDesk = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.get(
        `/api/ops/desk/today?categoryId=${encodeURIComponent(categoryId || "")}`
      );
      setDesk(result.desk || null);
      if (result.desk?.active?.length && !activeId) {
        setActiveId(result.desk.active[0].id);
      }
    } catch (err) {
      setError(err.message || "تعذر تحميل شاشة الحضور");
    } finally {
      setLoading(false);
    }
  }, [categoryId, activeId]);

  useEffect(() => {
    loadDesk();
  }, [categoryId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!actorStaffId && deskStaff[0]?.id) setActorStaffId(deskStaff[0].id);
  }, [deskStaff, actorStaffId]);

  const doCheckIn = useCallback(async (rawToken) => {
    const token = String(rawToken || "").trim();
    if (!token) return;
    let checkToken = token;
    try {
      if (token.includes("token=")) {
        const url = new URL(token, window.location.origin);
        checkToken = url.searchParams.get("token") || token;
      } else if (token.includes("/pass/")) {
        const parts = token.split("/pass/");
        checkToken = decodeURIComponent((parts[1] || "").split(/[?#]/)[0]);
      }
    } catch {
      checkToken = token;
    }
    setCheckInBusy(true);
    try {
      const result = await api.post("/api/ops/desk/check-in", {
        token: checkToken,
        categoryId,
        actorStaffId
      });
      setActiveId(result.appointment?.id || "");
      confirmSaved("تم تسجيل الحضور");
      await loadDesk();
      reloadAppointments?.();
    } catch (err) {
      confirmSaveFailed("تعذر تسجيل الحضور", err.message);
      throw err;
    } finally {
      setCheckInBusy(false);
    }
  }, [actorStaffId, categoryId, loadDesk, reloadAppointments]);

  const addAddon = async (serviceId) => {
    if (!activeVisit?.id) return;
    try {
      const result = await api.post(`/api/ops/desk/appointments/${activeVisit.id}/addons`, {
        serviceId,
        actorStaffId
      });
      setAddonOpen(false);
      setActiveId(result.appointment?.id || activeVisit.id);
      confirmSaved("أُضيفت الخدمة إلى الفاتورة");
      await loadDesk();
      reloadAppointments?.();
    } catch (err) {
      confirmSaveFailed("تعذر إضافة الخدمة", err.message);
    }
  };

  const completeVisit = async () => {
    if (!activeVisit?.id) return;
    if (!window.confirm(`إنهاء زيارة «${activeVisit.customerName}»؟`)) return;
    try {
      await api.post(`/api/ops/desk/appointments/${activeVisit.id}/complete`, { actorStaffId });
      confirmSaved("أُغلقت الزيارة");
      setActiveId("");
      await loadDesk();
      reloadAppointments?.();
    } catch (err) {
      confirmSaveFailed("تعذر إنهاء الزيارة", err.message);
    }
  };

  const statusLabel = (status) => {
    if (status === "checked_in") return "حضر";
    if (status === "confirmed") return "مؤكد";
    if (status === "pending") return "بانتظار";
    if (status === "completed") return "مكتمل";
    return status || "—";
  };

  return (
    <section className="ops-page desk-page">
      <div className="ops-header">
        <div>
          <h1>حضور وتشغيل القسم</h1>
          <p>QR Code Scanner · ماسح USB/كاميرا · خدمات إضافية · عزل حسب الفئة</p>
        </div>
        <button type="button" className="secondary-button" onClick={loadDesk} disabled={loading}>
          تحديث
        </button>
      </div>

      <div className="desk-toolbar panel">
        <label>
          القسم / الفئة
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">كل الأقسام</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </label>
        <label>
          موظف الاستقبال / المشرف
          <select value={actorStaffId} onChange={(e) => setActorStaffId(e.target.value)}>
            <option value="">—</option>
            {deskStaff.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name} · {person.title || ""}
              </option>
            ))}
          </select>
        </label>
        <div className="desk-counts">
          <span><b>{desk?.counts?.waiting ?? 0}</b> انتظار</span>
          <span><b>{desk?.counts?.active ?? 0}</b> داخل القسم</span>
          <span><b>{desk?.counts?.done ?? 0}</b> مكتمل</span>
        </div>
      </div>

      {error ? <div className="plan-warning">{error}</div> : null}

      <div className="desk-grid">
        <section className="panel desk-zone">
          <div className="dir-zone-head">
            <b>QR Code Scanner</b>
            <small>{desk?.date || ""}</small>
          </div>
          <QrCodeScanner busy={checkInBusy} onScan={doCheckIn} />
        </section>

        <section className="panel desk-zone">
          <div className="dir-zone-head">
            <b>زيارة نشطة</b>
            {activeVisit ? <small>{statusLabel(activeVisit.status)}</small> : null}
          </div>
          {!activeVisit ? (
            <div className="empty-state">لا يوجد عميل داخل القسم حالياً — امسح بطاقة الحضور</div>
          ) : (
            <div className="desk-active">
              <div className="desk-active-head">
                <strong>{activeVisit.customerName}</strong>
                <span>{activeVisit.serviceName}</span>
                <span>{activeVisit.time} · {activeVisit.staffName}</span>
                <span className="desk-amount">{formatMoney(activeVisit.amount || 0, locale)}</span>
              </div>
              <ul className="desk-lines">
                {(activeVisit.lineItems || []).map((line) => (
                  <li key={line.id}>
                    <span>{line.kind === "addon" ? "＋" : "●"} {line.name}</span>
                    <b>{formatMoney(line.amount || 0, locale)}</b>
                  </li>
                ))}
              </ul>
              <div className="desk-active-actions">
                <button type="button" className="edit-button" onClick={() => setAddonOpen(true)}>+ إضافة خدمة</button>
                <button type="button" className="primary-button" onClick={completeVisit}>إنهاء الزيارة</button>
              </div>
              {(desk?.active || []).length > 1 ? (
                <div className="desk-active-switch">
                  {(desk.active || []).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={item.id === activeVisit.id ? "chip on" : "chip"}
                      onClick={() => setActiveId(item.id)}
                    >
                      {item.customerName}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </section>

        <section className="panel desk-zone desk-queue">
          <div className="dir-zone-head"><b>قائمة اليوم</b></div>
          <div className="desk-queue-list">
            {(desk?.appointments || []).map((item) => (
              <button
                key={item.id}
                type="button"
                className={`desk-queue-row status-${item.status}`}
                onClick={() => {
                  if (item.status === "checked_in") setActiveId(item.id);
                }}
              >
                <span>{item.time}</span>
                <span>{item.customerName}</span>
                <span>{item.serviceName}</span>
                <em>{statusLabel(item.status)}</em>
              </button>
            ))}
            {!desk?.appointments?.length && !loading ? (
              <div className="empty-state">لا مواعيد لهذا اليوم في القسم</div>
            ) : null}
          </div>
        </section>
      </div>

      {addonOpen && activeVisit ? (
        <div className="desk-modal-backdrop" role="presentation" onClick={() => setAddonOpen(false)}>
          <div className="desk-modal panel" role="dialog" onClick={(e) => e.stopPropagation()}>
            <header>
              <h3>إضافة خدمة — {activeVisit.customerName}</h3>
              <button type="button" className="ghost-button" onClick={() => setAddonOpen(false)}>✕</button>
            </header>
            <p className="muted">خدمات قسم «{categories.find((c) => c.id === categoryId)?.name || "الحالي"}» فقط</p>
            <div className="desk-addon-list">
              {categoryServices
                .filter((service) => service.id !== activeVisit.serviceId)
                .map((service) => (
                  <button
                    key={service.id}
                    type="button"
                    className="desk-addon-row"
                    onClick={() => addAddon(service.id)}
                  >
                    <span>{service.name}</span>
                    <b>
                      {service.pricingType === "on_request"
                        ? "عند الطلب"
                        : service.pricingType === "range"
                          ? `${service.priceMin}–${service.priceMax}`
                          : service.pricingType === "free"
                            ? "مجاني"
                            : formatMoney(service.price || 0, locale)}
                    </b>
                  </button>
                ))}
              {!categoryServices.length ? <div className="empty-state">لا خدمات في هذا القسم</div> : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
