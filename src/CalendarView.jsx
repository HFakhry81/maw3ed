import React, { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { t } from "./i18n";
import { SmartTimePicker } from "./SmartTimePicker.jsx";
import { confirmSaved, confirmSaveFailed } from "./saveFeedback.jsx";
import { toMinutes, isOvernightShift } from "./shiftHours.js";
import { occupancyModeLabel } from "./occupancyLabels.js";

function startOfWeek(date) {
  const value = new Date(date);
  value.setDate(value.getDate() - value.getDay());
  value.setHours(0, 0, 0, 0);
  return value;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, count) {
  const value = new Date(date);
  value.setDate(value.getDate() + count);
  return value;
}

export function CalendarView({ appointments, ops, onCreated, locale, Drawer, canCreate = true }) {
  const [open, setOpen] = useState(false);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const staff = ops?.staff || [];
  const allServices = ops?.services || [];
  const services = useMemo(
    () => allServices.filter((service) => service.active !== false && (service.providerIds || []).length > 0),
    [allServices]
  );
  const facilityHours = ops?.schedule?.general || [];
  const customers = ops?.customers || [];
  const [form, setForm] = useState({
    customerName: "",
    date: formatDate(new Date()),
    time: "09:00",
    staffId: "",
    serviceId: "",
    paymentMethod: "cash",
    notes: ""
  });
  const [busy, setBusy] = useState(false);
  const dayNames = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const selectedService = services.find((service) => service.id === form.serviceId) || null;
  const staffForService = useMemo(() => {
    const providerIds = selectedService?.providerIds || [];
    if (!providerIds.length) return [];
    return staff.filter((person) => person.active !== false && providerIds.includes(person.id));
  }, [staff, selectedService]);

  useEffect(() => {
    setForm((current) => {
      const nextServiceId = services.some((service) => service.id === current.serviceId)
        ? current.serviceId
        : services[0]?.id || "";
      const providers = (services.find((service) => service.id === nextServiceId)?.providerIds || []);
      const nextStaffId = providers.includes(current.staffId) ? current.staffId : providers[0] || "";
      if (nextServiceId === current.serviceId && nextStaffId === current.staffId) return current;
      return { ...current, serviceId: nextServiceId, staffId: nextStaffId };
    });
  }, [staff, services]);

  const weekAppointments = useMemo(() => {
    const from = formatDate(weekStart);
    const to = formatDate(addDays(weekStart, 6));
    return (appointments || []).filter((item) => {
      const date = item.date || item.appointmentDate;
      return date >= from && date <= to;
    });
  }, [appointments, weekStart]);

  const hours = useMemo(() => {
    const visibleHours = new Set(Array.from(
      { length: 13 },
      (_, index) => `${String(index + 8).padStart(2, "0")}:00`
    ));
    const addHours = (start, end) => {
      for (let hour = start; hour < end; hour += 1) {
        visibleHours.add(`${String(hour % 24).padStart(2, "0")}:00`);
      }
    };
    for (const day of facilityHours) {
      if (!day || day.isOpen === false) continue;
      const open = toMinutes(day.opensAt);
      const close = toMinutes(day.closesAt);
      if (!Number.isFinite(open) || !Number.isFinite(close) || open === close) continue;
      const startHour = Math.floor(open / 60);
      const closeHour = Math.ceil(close / 60);
      if (isOvernightShift(day)) {
        addHours(startHour, 24);
        addHours(0, closeHour);
      } else {
        addHours(startHour, closeHour);
      }
    }
    for (const appointment of weekAppointments) {
      const hour = String(appointment.time || "").slice(0, 2);
      if (/^\d{2}$/.test(hour) && Number(hour) <= 23) visibleHours.add(`${hour}:00`);
    }
    return [...visibleHours].sort((left, right) => Number(left.slice(0, 2)) - Number(right.slice(0, 2)));
  }, [facilityHours, weekAppointments]);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api.post("/api/ops/appointments", {
        customerName: form.customerName,
        date: form.date,
        time: form.time,
        staffId: form.staffId,
        serviceId: form.serviceId,
        paymentMethod: form.paymentMethod,
        notes: form.notes
      });
      setOpen(false);
      setForm((current) => ({ ...current, customerName: "", notes: "" }));
      onCreated?.();
      confirmSaved("تم حفظ الموعد");
    } catch (error) {
      confirmSaveFailed("تعذر حفظ الموعد", error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="ops-page">
      <div className="ops-header">
        <div>
          <h1>{t(locale, "calendar")}</h1>
          <p>تقويم أسبوعي مرتبط بالموظفين والخدمات</p>
        </div>
        <div className="header-actions">
          <button className="secondary-button" type="button" onClick={() => setWeekStart((current) => addDays(current, -7))}>السابق</button>
          <button className="secondary-button" type="button" onClick={() => setWeekStart(startOfWeek(new Date()))}>اليوم</button>
          <button className="secondary-button" type="button" onClick={() => setWeekStart((current) => addDays(current, 7))}>التالي</button>
          {canCreate ? (
            <button className="primary-button" type="button" onClick={() => setOpen(true)}>+ {t(locale, "createAppointment")}</button>
          ) : null}
        </div>
      </div>
      <div className="week-range panel">{formatDate(weekStart)} — {formatDate(addDays(weekStart, 6))} · {weekAppointments.length} مواعيد</div>
      <div className="week-calendar panel">
        <div className="week-grid">
          <div className="week-corner" />
          {weekDays.map((day, index) => (
            <div className={`week-day-head ${formatDate(day) === formatDate(new Date()) ? "today" : ""}`} key={formatDate(day)}>
              <b>{dayNames[index]}</b>
              <span>{formatDate(day).slice(5)}</span>
            </div>
          ))}
          {hours.map((hour) => (
            <React.Fragment key={hour}>
              <div className="week-hour">{hour}</div>
              {weekDays.map((day) => {
                const date = formatDate(day);
                const cells = weekAppointments.filter((item) => (item.date || item.appointmentDate) === date && String(item.time || "").startsWith(hour.slice(0, 2)));
                return (
                  <div
                    className="week-cell"
                    key={`${date}-${hour}`}
                    onDoubleClick={() => {
                      if (!canCreate) return;
                      setForm((current) => ({ ...current, date, time: hour }));
                      setOpen(true);
                    }}
                  >
                    {cells.map((item) => (
                      <article key={item.id} className={`week-event status-${item.status}`}>
                        <strong>{item.time}</strong>
                        <span>{item.customerName || item.patientName}</span>
                        <small>
                          {item.serviceName || "خدمة"}
                          {item.staffName || item.doctorName ? ` · ${item.staffName || item.doctorName}` : ""}
                          {item.amount != null ? ` · ${Number(item.amount) === 0 ? "مجاني" : `E£${item.amount}`}` : ""}
                          {item.status ? ` · ${item.status}` : ""}
                        </small>
                      </article>
                    ))}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
      <Drawer title={t(locale, "createAppointment")} open={open} onClose={() => setOpen(false)}>
        <form className="stack-form" onSubmit={submit}>
          <label>العميل
            <input list="customer-list" required value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} placeholder="اسم العميل" />
            <datalist id="customer-list">
              {customers.map((customer) => <option key={customer.id} value={`${customer.firstName} ${customer.lastName}`.trim()} />)}
            </datalist>
          </label>
          <label>التاريخ<input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
          <label>وقت البدء
            <SmartTimePicker
              required
              value={form.time || "09:00"}
              onChange={(time) => setForm({ ...form, time })}
              aria-label="وقت بدء الموعد"
            />
          </label>
          <label>الخدمة<select required value={form.serviceId} onChange={(e) => {
            const serviceId = e.target.value;
            const providers = (services.find((service) => service.id === serviceId)?.providerIds || []);
            setForm({
              ...form,
              serviceId,
              staffId: providers.includes(form.staffId) ? form.staffId : providers[0] || ""
            });
          }}>
            {!services.length && <option value="">لا توجد خدمات بمقدم معيّن</option>}
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name} · {service.durationMinutes}د · حجز {(Number(service.durationMinutes) || 0) + (Number(service.bufferMinutes) || 0)}د
                {service.occupancyMode && service.occupancyMode !== "exclusive" ? ` · ${occupancyModeLabel(service.occupancyMode, locale)}` : ""}
              </option>
            ))}
          </select></label>
          {selectedService?.occupancyMode && selectedService.occupancyMode !== "exclusive" ? (
            <p className="muted" role="note">
              نمط الإشغال: {occupancyModeLabel(selectedService.occupancyMode, locale)}
              {selectedService.occupancyMode === "session_capacity"
                ? ` · سعة ${selectedService.defaultCapacity || 1}`
                : ""}
              {selectedService.occupancyMode === "rental"
                ? " · يُخصَّص مورد تلقائياً عند الإنشاء إن وُجد متطلب"
                : ""}
            </p>
          ) : null}
          <label>الموظف<select required value={form.staffId} onChange={(e) => setForm({ ...form, staffId: e.target.value })}>
            {!staffForService.length && <option value="">عيّن مقدماً للخدمة أولاً</option>}
            {staffForService.map((person) => <option key={person.id} value={person.id}>{person.name} — {person.title}</option>)}
          </select></label>
          <fieldset className="pay-row">
            <legend>طريقة الدفع</legend>
            {[["cash", "نقداً"], ["card", "بطاقة"], ["transfer", "EFT"]].map(([value, label]) => (
              <label key={value}><input type="radio" name="pay" checked={form.paymentMethod === value} onChange={() => setForm({ ...form, paymentMethod: value })} /> {label}</label>
            ))}
          </fieldset>
          <label>ملاحظة<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="غير مرئي للعملاء" /></label>
          <div className="form-actions">
            <button className="primary-button" disabled={busy}>{busy ? t(locale, "loading") : t(locale, "save")}</button>
            <button type="button" className="secondary-button" onClick={() => setOpen(false)}>{t(locale, "cancel")}</button>
          </div>
        </form>
      </Drawer>
    </section>
  );
}
