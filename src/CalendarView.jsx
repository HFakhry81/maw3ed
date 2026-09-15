import React, { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { t } from "./i18n";

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

export function CalendarView({ appointments, ops, onCreated, locale, Drawer }) {
  const [open, setOpen] = useState(false);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const staff = ops?.staff || [];
  const services = ops?.services || [];
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
  const hours = useMemo(() => Array.from({ length: 13 }, (_, index) => `${String(8 + index).padStart(2, "0")}:00`), []);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);

  useEffect(() => {
    setForm((current) => ({
      ...current,
      staffId: current.staffId || staff[0]?.id || "",
      serviceId: current.serviceId || services[0]?.id || ""
    }));
  }, [staff, services]);

  const weekAppointments = useMemo(() => {
    const from = formatDate(weekStart);
    const to = formatDate(addDays(weekStart, 6));
    return (appointments || []).filter((item) => {
      const date = item.date || item.appointmentDate;
      return date >= from && date <= to;
    });
  }, [appointments, weekStart]);

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
    } catch (error) {
      alert(error.message);
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
          <button className="primary-button" type="button" onClick={() => setOpen(true)}>+ {t(locale, "createAppointment")}</button>
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
          <label>وقت البدء<input type="time" required value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></label>
          <label>الموظف<select required value={form.staffId} onChange={(e) => setForm({ ...form, staffId: e.target.value })}>
            {staff.map((person) => <option key={person.id} value={person.id}>{person.name} — {person.title}</option>)}
          </select></label>
          <label>الخدمة<select required value={form.serviceId} onChange={(e) => setForm({ ...form, serviceId: e.target.value })}>
            {services.map((service) => <option key={service.id} value={service.id}>{service.name} · {service.durationMinutes}د · E£{service.price}</option>)}
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
