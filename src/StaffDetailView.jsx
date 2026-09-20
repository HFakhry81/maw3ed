import React, { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { WeekScheduleTable, ensureWeekHours, validateWeekHours } from "./WeekScheduleTable.jsx";
import { SmartTimePicker } from "./SmartTimePicker.jsx";
import { confirmSaved, confirmSaveFailed } from "./saveFeedback.jsx";
import { formatMoney } from "./i18n";
import { CategoryProvidersTable } from "./ServiceProvidersTable.jsx";

export const STAFF_SECTIONS = [
  { id: "history", label: "تاريخ المواعيد", icon: "⏱" },
  { id: "upcoming", label: "المواعيد القادمة", icon: "📅" },
  { id: "newAppointment", label: "موعد جديد", icon: "+" },
  { id: "services", label: "الخدمات", icon: "☰" },
  { id: "schedule", label: "جدول العمل", icon: "🗓" },
  { id: "closedDays", label: "أيام مغلقة", icon: "🚫", pro: true },
  { id: "specificDays", label: "أيام محددة", icon: "📌", pro: true },
  { id: "commission", label: "العمولة", icon: "%", pro: true, isNew: true },
  { id: "payroll", label: "كشوف المرتبات", icon: "💰", pro: true, isNew: true },
  { id: "reviews", label: "المراجعات", icon: "★", pro: true }
];

function ProGate({ title, children }) {
  return (
    <div className="staff-pro-gate panel">
      <div className="staff-pro-badge">احترافي</div>
      <h3>{title}</h3>
      <p className="muted">هذه الخاصية ضمن الخطة الاحترافية. المنطق مغلق حالياً في الواجهة والخادم حتى الترقية.</p>
      {children}
    </div>
  );
}

function AppointmentTable({ rows, locale, empty, onSetPrice }) {
  const statusLabel = (item) => {
    const ps = item.pricingStatus || "";
    if (ps === "quote_pending") return "بانتظار عرض سعر";
    if (ps === "quoted") return "عرض سعر";
    if (ps === "range_deposit") return "عربون (حد أدنى)";
    if (ps === "range_agreed") return "متفق ضمن النطاق";
    if (ps === "range_final") return "نهائي ضمن النطاق";
    if (ps === "free") return "مجاني";
    return item.status || "—";
  };

  const priceLabel = (item) => {
    if (item.pricingType === "on_request" && item.pricingStatus === "quote_pending") return "عند الطلب";
    if (item.pricingType === "range" && (item.priceMin != null || item.priceMax != null)) {
      const base = item.amount != null ? formatMoney(item.amount, locale) : "—";
      return `${base} (${formatMoney(item.priceMin, locale)}–${formatMoney(item.priceMax, locale)})`;
    }
    if (item.amount != null) return formatMoney(item.amount, locale);
    if (item.price != null) return formatMoney(item.price, locale);
    return "—";
  };

  const needsPrice = (item) =>
    item.pricingType === "on_request" && item.pricingStatus === "quote_pending"
    || item.pricingType === "range" && (item.pricingStatus === "range_deposit" || item.pricingStatus === "range_agreed");

  return (
    <div className="staff-appt-table panel">
      <div className="staff-appt-head">
        <span>التاريخ</span>
        <span>الوقت</span>
        <span>الخدمة</span>
        <span>العميل</span>
        <span>التسعير</span>
        <span>المبلغ</span>
        <span></span>
      </div>
      {!rows.length ? (
        <div className="empty-state">{empty}</div>
      ) : (
        rows.map((item) => (
          <div className="staff-appt-row" key={item.id}>
            <span>{item.date}</span>
            <span className="staff-appt-time">{item.time}</span>
            <span>{item.serviceName || item.serviceId || "—"}</span>
            <span>{item.customerName || item.patientName || "—"}</span>
            <span>{statusLabel(item)}</span>
            <span>{priceLabel(item)}</span>
            <span>
              {needsPrice(item) && onSetPrice ? (
                <button
                  type="button"
                  className="edit-button"
                  onClick={() => onSetPrice(item)}
                >
                  {item.pricingType === "on_request" ? "عرض سعر" : "تأكيد السعر"}
                </button>
              ) : null}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

function NewAppointmentForm({ person, ops, onCreated }) {
  const services = (ops?.services || []).filter(
    (service) => (service.providerIds || []).includes(person.id) && service.active !== false
  );
  const [form, setForm] = useState({
    customerName: "",
    date: new Date().toISOString().slice(0, 10),
    time: "10:00",
    serviceId: services[0]?.id || "",
    notes: ""
  });
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (!form.serviceId) {
      window.alert("اربط خدمة بهذا الموظف أولاً");
      return;
    }
    setBusy(true);
    try {
      await api.post("/api/ops/appointments", {
        customerName: form.customerName,
        date: form.date,
        time: form.time,
        staffId: person.id,
        serviceId: form.serviceId,
        notes: form.notes
      });
      confirmSaved("تم حفظ الموعد");
      setForm((current) => ({ ...current, customerName: "", notes: "" }));
      onCreated?.();
    } catch (error) {
      confirmSaveFailed("تعذر حفظ الموعد", error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="panel stack-form staff-new-appt" onSubmit={submit}>
      <h3>موعد جديد — {person.name}</h3>
      <label>العميل<input required value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} /></label>
      <label>التاريخ<input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
      <label>الوقت
        <SmartTimePicker show24h value={form.time} onChange={(time) => setForm({ ...form, time })} />
      </label>
      <label>الخدمة
        <select required value={form.serviceId} onChange={(e) => setForm({ ...form, serviceId: e.target.value })}>
          {!services.length && <option value="">لا توجد خدمات مرتبطة</option>}
          {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
        </select>
      </label>
      <label>ملاحظات<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
      <button className="primary-button" type="submit" disabled={busy}>{busy ? "جارٍ الحفظ…" : "حفظ الموعد"}</button>
    </form>
  );
}

/**
 * SetTime-style dedicated staff profile page.
 */
export function StaffDetailView({
  person,
  ops,
  appointments = [],
  locale,
  section = "history",
  onSectionChange,
  onBack,
  onEdit,
  reload,
  reloadAppointments,
  onGoToServicesCategory
}) {
  const today = new Date().toISOString().slice(0, 10);
  const staffAppointments = useMemo(
    () => (appointments || []).filter((item) => item.staffId === person.id && item.status !== "cancelled"),
    [appointments, person.id]
  );
  const history = useMemo(
    () => staffAppointments.filter((item) => item.date < today || ["completed", "cancelled", "no_show"].includes(item.status)),
    [staffAppointments, today]
  );
  const upcoming = useMemo(
    () => staffAppointments.filter((item) => item.date >= today && !["completed", "cancelled", "no_show"].includes(item.status)),
    [staffAppointments, today]
  );
  const linkedServices = useMemo(() => {
    // Canonical: only services that currently list this staff in providerIds.
    return (ops?.services || []).filter((service) => (service.providerIds || []).includes(person.id));
  }, [ops, person]);

  const placeLabel = useMemo(() => {
    if (person.servicePlace) return person.servicePlace;
    const category = (ops?.serviceCategories || []).find((item) => item.id === person.serviceCategoryId);
    if (category?.name) return category.name;
    const first = linkedServices[0];
    const fromService = first && (ops?.serviceCategories || []).find((item) => item.id === first.categoryId);
    return fromService?.name || "غير محدد";
  }, [person, ops, linkedServices]);

  const categoryIdForProviders = person.serviceCategoryId
    || linkedServices[0]?.categoryId
    || "";

  const [scheduleDays, setScheduleDays] = useState(() =>
    ensureWeekHours(person.workingHours || ops?.schedule?.general || [])
  );
  const [useBusinessHours, setUseBusinessHours] = useState(person.useBusinessHours !== false);
  const [savingSchedule, setSavingSchedule] = useState(false);

  useEffect(() => {
    setScheduleDays(ensureWeekHours(person.workingHours || ops?.schedule?.general || []));
    setUseBusinessHours(person.useBusinessHours !== false);
  }, [person, ops]);

  const saveSchedule = async () => {
    if (!useBusinessHours) {
      const error = validateWeekHours(scheduleDays);
      if (error) {
        window.alert(error);
        return;
      }
    }
    setSavingSchedule(true);
    try {
      await api.patch(`/api/ops/staff/${person.id}`, {
        useBusinessHours,
        workingHours: useBusinessHours ? null : ensureWeekHours(scheduleDays)
      });
      reload?.();
      confirmSaved("تم حفظ جدول عمل الموظف");
    } catch (error) {
      confirmSaveFailed("تعذر حفظ الجدول", error.message);
    } finally {
      setSavingSchedule(false);
    }
  };

  const addStaffClosedDay = async () => {
    const startDate = window.prompt("تاريخ الإغلاق YYYY-MM-DD");
    if (!startDate) return;
    const description = window.prompt("الوصف") || "";
    try {
      const closedDays = [...(person.closedDays || []), {
        id: `scd-${Date.now().toString(36)}`,
        startDate,
        endDate: startDate,
        description
      }];
      await api.patch(`/api/ops/staff/${person.id}`, { closedDays });
      reload?.();
      confirmSaved("تم إضافة يوم مغلق للموظف");
    } catch (error) {
      confirmSaveFailed("تعذر الإضافة", error.message);
    }
  };

  const addStaffSpecificDay = async () => {
    const title = window.prompt("العنوان");
    const startDate = window.prompt("التاريخ YYYY-MM-DD");
    if (!title || !startDate) return;
    try {
      const specificDays = [...(person.specificDays || []), {
        id: `ssd-${Date.now().toString(36)}`,
        title,
        startDate,
        endDate: startDate,
        opensAt: "08:00",
        closesAt: "16:00"
      }];
      await api.patch(`/api/ops/staff/${person.id}`, { specificDays });
      reload?.();
      confirmSaved("تم إضافة يوم محدد للموظف");
    } catch (error) {
      confirmSaveFailed("تعذر الإضافة", error.message);
    }
  };

  const setAppointmentPrice = async (item) => {
    const isRange = item.pricingType === "range";
    const hint = isRange
      ? `السعر النهائي ضمن ${item.priceMin}–${item.priceMax}`
      : "أدخل عرض السعر للعميل";
    const raw = window.prompt(hint, String(item.amount ?? item.priceMin ?? ""));
    if (raw == null || raw === "") return;
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 0) {
      window.alert("مبلغ غير صالح");
      return;
    }
    try {
      await api.patch(`/api/ops/appointments/${item.id}/pricing`, { amount });
      reloadAppointments?.();
      confirmSaved(isRange ? "تم تأكيد السعر ضمن النطاق" : "تم إرسال عرض السعر");
    } catch (error) {
      confirmSaveFailed("تعذر تحديث السعر", error.message);
    }
  };

  let content = null;
  if (section === "history") {
    content = (
      <>
        <h2>تاريخ المواعيد</h2>
        <AppointmentTable rows={history} locale={locale} empty="لا يوجد سجل مواعيد." onSetPrice={setAppointmentPrice} />
      </>
    );
  } else if (section === "upcoming") {
    content = (
      <>
        <h2>المواعيد القادمة</h2>
        <AppointmentTable rows={upcoming} locale={locale} empty="لا توجد مواعيد قادمة." onSetPrice={setAppointmentPrice} />
      </>
    );
  } else if (section === "newAppointment") {
    content = (
      <NewAppointmentForm
        person={person}
        ops={ops}
        onCreated={() => {
          reloadAppointments?.();
          onSectionChange?.("upcoming");
        }}
      />
    );
  } else if (section === "services") {
    content = (
      <>
        <h2>الخدمات والمقدمون</h2>
        <CategoryProvidersTable
          ops={ops}
          categoryId={categoryIdForProviders}
          reload={reload}
          onGoToServicesCategory={onGoToServicesCategory}
          title="المقدمون حسب الخدمة"
        />
        <div className="panel" style={{ marginTop: 12 }}>
          <b>خدمات هذا الموظف</b>
          {!linkedServices.length ? (
            <div className="empty-state">غير مربوط كـ مقدم حالياً.</div>
          ) : (
            linkedServices.map((service) => (
              <div className="table-row" key={service.id}>
                <b>{service.name}</b>
                <span>{service.durationMinutes} د</span>
                <span>{service.active === false ? "متوقفة" : "نشطة"}</span>
              </div>
            ))
          )}
        </div>
        <button type="button" className="ghost-button" onClick={onEdit}>تعديل البطاقة</button>
      </>
    );
  } else if (section === "schedule") {
    content = (
      <>
        <div className="ops-header" style={{ marginBottom: 12 }}>
          <div>
            <h2>جدول العمل</h2>
            <p className="muted">ساعات مخصصة أو اتباع ساعات المنشأة</p>
          </div>
          <button type="button" className="primary-button" disabled={savingSchedule} onClick={saveSchedule}>
            {savingSchedule ? "جارٍ الحفظ…" : "حفظ"}
          </button>
        </div>
        <label className="check" style={{ marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={useBusinessHours}
            onChange={(e) => {
              setUseBusinessHours(e.target.checked);
              if (!e.target.checked) {
                setScheduleDays(ensureWeekHours(person.workingHours || ops?.schedule?.general || []));
              }
            }}
          />
          استخدام ساعات عمل المنشأة
        </label>
        {!useBusinessHours ? (
          <div className="panel week-schedule-panel">
            <WeekScheduleTable days={scheduleDays} onChange={setScheduleDays} />
          </div>
        ) : (
          <p className="muted">الموظف يتبع الجدول العام للمنشأة.</p>
        )}
      </>
    );
  } else if (section === "closedDays") {
    content = (
      <ProGate title="أيام مغلقة للموظف">
        <p className="muted">يمكن تخزين الأيام الآن للتحضير؛ تطبيقها على الحجز يُفعَّل مع الخطة الاحترافية.</p>
        <button type="button" className="primary-button" onClick={addStaffClosedDay}>+ إضافة يوم مغلق</button>
        <div className="panel" style={{ marginTop: 12 }}>
          {(person.closedDays || []).map((item) => (
            <div className="table-row" key={item.id}><b>{item.startDate}</b><span>{item.description || "—"}</span></div>
          ))}
          {!(person.closedDays || []).length ? <div className="empty-state">لا أيام مغلقة</div> : null}
        </div>
      </ProGate>
    );
  } else if (section === "specificDays") {
    content = (
      <ProGate title="أيام محددة للموظف">
        <button type="button" className="primary-button" onClick={addStaffSpecificDay}>+ إضافة يوم محدد</button>
        <div className="panel" style={{ marginTop: 12 }}>
          {(person.specificDays || []).map((item) => (
            <div className="table-row" key={item.id}>
              <b>{item.title}</b>
              <span>{item.startDate} · {item.opensAt}-{item.closesAt}</span>
            </div>
          ))}
          {!(person.specificDays || []).length ? <div className="empty-state">لا أيام محددة</div> : null}
        </div>
      </ProGate>
    );
  } else if (section === "commission") {
    content = (
      <ProGate title="العمولة">
        <p className="muted">حساب عمولة الموظف من المواعيد المكتملة — منطق مغلق حتى تفعيل الفوترة الاحترافية.</p>
      </ProGate>
    );
  } else if (section === "payroll") {
    content = (
      <ProGate title="كشوف المرتبات">
        <p className="muted">توليد كشوف المرتبات من ساعات الوردية (بما فيها الليلية) — منطق مغلق حالياً.</p>
      </ProGate>
    );
  } else if (section === "reviews") {
    content = (
      <ProGate title="المراجعات">
        <p className="muted">تقييمات العملاء للموظف — منطق مغلق حالياً.</p>
      </ProGate>
    );
  }

  const initial = (person.name || "?").charAt(0);

  return (
    <section className="ops-page staff-detail-page">
      <button type="button" className="ghost-button staff-back" onClick={onBack}>→ رجوع</button>
      <div className="staff-detail-layout">
        <aside className="staff-detail-rail panel">
          <div className="staff-detail-rail-head">
            <button type="button" className="edit-button" onClick={onEdit}>تعديل</button>
          </div>
          <div className="staff-detail-profile">
            <div
              className="avatar lg"
              style={person.avatarUrl ? { backgroundImage: `url(${person.avatarUrl})`, backgroundSize: "cover" } : undefined}
            >
              {!person.avatarUrl && initial}
            </div>
            <b>{person.name}</b>
            <span>{person.title || "—"}</span>
            <small>{person.phone || "بدون هاتف"}</small>
            <small className="staff-detail-place">مكان الخدمة: {placeLabel}</small>
          </div>
          <nav className="staff-detail-nav" aria-label="أقسام الموظف">
            {STAFF_SECTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={section === item.id ? "active" : ""}
                onClick={() => onSectionChange?.(item.id)}
              >
                <span className="staff-nav-ico" aria-hidden="true">{item.icon}</span>
                <span>{item.label}</span>
                {item.isNew ? <em className="staff-nav-new">جديد</em> : null}
                {item.pro ? <em className="staff-nav-pro">احترافي</em> : null}
              </button>
            ))}
          </nav>
        </aside>
        <div className="staff-detail-main">
          {content}
        </div>
      </div>
    </section>
  );
}
