import React, { Component, Suspense, useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./ops.css";
import { api } from "./api";
import { LOCALES, applyDocumentLocale, t } from "./i18n";
import { CalendarView } from "./CalendarView.jsx";

const NAV = [
  { id: "overview", mark: "غرفة" },
  { id: "calendar", mark: "تق" },
  { id: "customers", mark: "عم" },
  { id: "staff", mark: "مو" },
  { id: "schedule", mark: "جد" },
  { id: "services", mark: "خد" },
  { id: "bookingPage", mark: "حجز" },
  { id: "stats", mark: "إحص" },
  { id: "payments", mark: "دفع", growth: true },
  { id: "expenses", mark: "مص" },
  { id: "marketing", mark: "تس", growth: true, badge: "جديد" },
  { id: "notifications", mark: "تنب" },
  { id: "preferences", mark: "تفض" },
  { id: "integrations", mark: "ربط", growth: true }
];

const MOBILE_NAV = ["overview", "calendar", "customers", "services", "more"];

class ModuleBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return (
        <section className="ops-page">
          <div className="panel empty-state">تعذّر عرض هذا القسم. باقي غرفة العمليات يعمل بشكل طبيعي.</div>
        </section>
      );
    }
    return this.props.children;
  }
}

function useOpsBootstrap() {
  const [ops, setOps] = useState(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const reload = useCallback(() => {
    startTransition(() => {
      api.get("/api/ops/bootstrap").then(setOps).catch((err) => setError(err.message));
    });
  }, []);
  useEffect(reload, [reload]);
  return { ops, setOps, error, isPending, reload };
}

function useAppointments() {
  const [appointments, setAppointments] = useState([]);
  const reload = useCallback(() => {
    api.get("/api/ops/appointments").then((result) => setAppointments(result.appointments || [])).catch(() => {
      api.get("/api/appointments").then((result) => setAppointments(result.appointments || [])).catch(() => {});
    });
  }, []);
  useEffect(reload, [reload]);
  return { appointments, reload };
}

function Drawer({ title, open, onClose, children }) {
  if (!open) return null;
  return (
    <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="drawer-panel" role="dialog" aria-modal="true">
        <header><h3>{title}</h3><button type="button" onClick={onClose} aria-label="close">✕</button></header>
        {children}
      </aside>
    </div>
  );
}

function CalendarViewProxy(props) {
  return <CalendarView {...props} Drawer={Drawer} />;
}

function CustomersView({ ops, reload, locale }) {
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "", email: "", categoryId: "cat-new" });
  const customers = useMemo(() => {
    const list = ops?.customers || [];
    const q = search.trim().toLowerCase();
    return list.filter((customer) => {
      const hay = `${customer.firstName} ${customer.lastName} ${customer.phone} ${customer.email}`.toLowerCase();
      return (!q || hay.includes(q)) && (categoryId === "all" || customer.categoryId === categoryId);
    });
  }, [ops, search, categoryId]);

  const submit = async (event) => {
    event.preventDefault();
    await api.post("/api/ops/customers", form);
    setOpen(false);
    setForm({ firstName: "", lastName: "", phone: "", email: "", categoryId: "cat-new" });
    reload();
  };

  return (
    <section className="ops-page">
      <div className="ops-header">
        <div><h1>{t(locale, "customers")}</h1><p>إدارة علاقات العملاء والفئات</p></div>
        <button className="primary-button" type="button" onClick={() => setOpen(true)}>+ {t(locale, "add")}</button>
      </div>
      <div className="toolbar">
        <input placeholder={t(locale, "search")} value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="chips">
          <button type="button" className={categoryId === "all" ? "chip active" : "chip"} onClick={() => setCategoryId("all")}>الكل</button>
          {(ops?.customerCategories || []).map((category) => (
            <button key={category.id} type="button" className={categoryId === category.id ? "chip active" : "chip"} onClick={() => setCategoryId(category.id)}>{category.name}</button>
          ))}
        </div>
      </div>
      <div className="data-table panel">
        {customers.map((customer) => (
          <div className="table-row" key={customer.id}>
            <div className="avatar">{customer.firstName.charAt(0)}</div>
            <div><b>{customer.firstName} {customer.lastName}</b><small>{(ops?.customerCategories || []).find((c) => c.id === customer.categoryId)?.name}</small></div>
            <span>{customer.phone || "—"}</span>
            <span>{customer.email || "—"}</span>
          </div>
        ))}
        {!customers.length && <div className="empty-state">{t(locale, "empty")}</div>}
      </div>
      <Drawer title="إضافة عميل" open={open} onClose={() => setOpen(false)}>
        <form className="stack-form" onSubmit={submit}>
          <label>الاسم الأول<input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></label>
          <label>اللقب<input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></label>
          <label>الهاتف<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
          <label>البريد<input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label>الفئة<select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
            {(ops?.customerCategories || []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select></label>
          <div className="form-actions"><button className="primary-button">{t(locale, "save")}</button></div>
        </form>
      </Drawer>
    </section>
  );
}

function StaffView({ ops, reload, locale }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", title: "" });
  const submit = async (event) => {
    event.preventDefault();
    await api.post("/api/ops/staff", form);
    setOpen(false);
    setForm({ name: "", title: "" });
    reload();
  };
  return (
    <section className="ops-page">
      <div className="ops-header">
        <div><h1>{t(locale, "staff")}</h1><p>الموظفون ومقدمو الخدمات</p></div>
        <button className="primary-button" type="button" onClick={() => setOpen(true)}>+ إضافة موظف</button>
      </div>
      <div className="data-table panel">
        {(ops?.staff || []).map((person) => (
          <div className="table-row" key={person.id}>
            <div className="avatar">{person.name.charAt(0)}</div>
            <div><b>{person.name}</b><small>{person.title}</small></div>
            <span>{person.servicesCount || 0} خدمات</span>
            <button type="button" className="danger-button" onClick={async () => { await api.del(`/api/ops/staff/${person.id}`); reload(); }}>حذف</button>
          </div>
        ))}
      </div>
      <Drawer title="إضافة موظف" open={open} onClose={() => setOpen(false)}>
        <form className="stack-form" onSubmit={submit}>
          <label>الاسم<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label>المهنة<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
          <div className="form-actions"><button className="primary-button">{t(locale, "save")}</button></div>
        </form>
      </Drawer>
    </section>
  );
}

function ServicesView({ ops, reload, locale }) {
  const [categoryId, setCategoryId] = useState(ops?.serviceCategories?.[0]?.id || "");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", categoryId: "", durationMinutes: 30, bufferMinutes: 0, price: 0, providerId: "", publicBooking: true, autoAccept: true });
  useEffect(() => {
    if (!categoryId && ops?.serviceCategories?.[0]) setCategoryId(ops.serviceCategories[0].id);
  }, [ops, categoryId]);
  const services = (ops?.services || []).filter((service) => !categoryId || service.categoryId === categoryId);
  const submit = async (event) => {
    event.preventDefault();
    await api.post("/api/ops/services", { ...form, categoryId: form.categoryId || categoryId });
    setOpen(false);
    reload();
  };
  return (
    <section className="ops-page">
      <div className="ops-header">
        <div><h1>{t(locale, "services")}</h1><p>فئات الخدمات والتسعير والمدة</p></div>
        <button className="primary-button" type="button" onClick={() => setOpen(true)}>+ إضافة خدمة</button>
      </div>
      <div className="split-panels">
        <aside className="panel category-list">
          <div className="panel-head"><b>فئة الخدمة</b><button type="button" onClick={async () => {
            const name = window.prompt("اسم الفئة");
            if (name) { await api.post("/api/ops/service-categories", { name }); reload(); }
          }}>+ إضافة</button></div>
          {(ops?.serviceCategories || []).map((category) => (
            <button key={category.id} type="button" className={categoryId === category.id ? "cat active" : "cat"} onClick={() => setCategoryId(category.id)}>{category.name}</button>
          ))}
        </aside>
        <div className="panel service-list">
          {services.map((service) => (
            <div className="table-row" key={service.id}>
              <div><b>{service.name}</b><small>{service.durationMinutes} د · تأخير {service.bufferMinutes} د</small></div>
              <span>E£{service.price}</span>
              <button type="button" className="danger-button" onClick={async () => { await api.del(`/api/ops/services/${service.id}`); reload(); }}>حذف</button>
            </div>
          ))}
          {!services.length && <div className="empty-state">{t(locale, "empty")}</div>}
        </div>
      </div>
      <Drawer title="إضافة خدمة" open={open} onClose={() => setOpen(false)}>
        <form className="stack-form" onSubmit={submit}>
          <label>الاسم<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label>الفئة<select value={form.categoryId || categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
            {(ops?.serviceCategories || []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select></label>
          <label>مقدم الخدمة<select value={form.providerId} onChange={(e) => setForm({ ...form, providerId: e.target.value })}>
            <option value="">—</option>
            {(ops?.staff || []).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select></label>
          <div className="form-row">
            <label>المدة (د)<input type="number" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })} /></label>
            <label>وقت التأخير<input type="number" value={form.bufferMinutes} onChange={(e) => setForm({ ...form, bufferMinutes: Number(e.target.value) })} /></label>
          </div>
          <label>السعر<input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} /></label>
          <label className="check"><input type="checkbox" checked={form.publicBooking} onChange={(e) => setForm({ ...form, publicBooking: e.target.checked })} /> عرض على صفحة الحجز</label>
          <label className="check"><input type="checkbox" checked={form.autoAccept} onChange={(e) => setForm({ ...form, autoAccept: e.target.checked })} /> قبول تلقائي</label>
          <div className="form-actions"><button className="primary-button">{t(locale, "save")}</button></div>
        </form>
      </Drawer>
    </section>
  );
}

function ScheduleView({ ops, reload, locale }) {
  const [tab, setTab] = useState("general");
  const [days, setDays] = useState(ops?.schedule?.general || []);
  useEffect(() => { setDays(ops?.schedule?.general || []); }, [ops]);
  const dayNames = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const save = async () => {
    await api.put("/api/ops/working-hours", { days });
    reload();
  };
  return (
    <section className="ops-page">
      <div className="ops-header"><div><h1>{t(locale, "schedule")}</h1><p>ساعات العمل والأيام المغلقة</p></div>{tab === "general" && <button className="primary-button" type="button" onClick={save}>{t(locale, "save")}</button>}</div>
      <div className="tabs">
        {[["general", "عام"], ["closed", "الأيام المغلقة"], ["specific", "أيام محددة"]].map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? "tab active" : "tab"} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === "general" && (
        <div className="panel schedule-table">
          {days.map((day, index) => (
            <div className="schedule-row" key={day.weekday}>
              <b>{dayNames[index]}</b>
              <label className="switch"><input type="checkbox" checked={day.isOpen} onChange={(e) => setDays((current) => current.map((item, i) => i === index ? { ...item, isOpen: e.target.checked } : item))} /><i /></label>
              <input type="time" value={day.opensAt} disabled={!day.isOpen} onChange={(e) => setDays((current) => current.map((item, i) => i === index ? { ...item, opensAt: e.target.value } : item))} />
              <input type="time" value={day.closesAt} disabled={!day.isOpen} onChange={(e) => setDays((current) => current.map((item, i) => i === index ? { ...item, closesAt: e.target.value } : item))} />
            </div>
          ))}
        </div>
      )}
      {tab === "closed" && (
        <div className="panel">
          <button className="primary-button" type="button" onClick={async () => {
            const startDate = window.prompt("تاريخ البدء YYYY-MM-DD");
            if (!startDate) return;
            await api.post("/api/ops/closed-days", { startDate, endDate: startDate, description: window.prompt("الوصف") || "" });
            reload();
          }}>+ إضافة أيام مغلقة</button>
          {(ops?.schedule?.closedDays || []).map((item) => <div key={item.id} className="table-row"><b>{item.startDate}</b><span>{item.description || "—"}</span></div>)}
        </div>
      )}
      {tab === "specific" && (
        <div className="panel">
          <button className="primary-button" type="button" onClick={async () => {
            const title = window.prompt("العنوان");
            const startDate = window.prompt("من تاريخ YYYY-MM-DD");
            if (!title || !startDate) return;
            await api.post("/api/ops/specific-days", { title, startDate, endDate: startDate, opensAt: "08:00", closesAt: "16:00" });
            reload();
          }}>+ إضافة أيام محددة</button>
          {(ops?.schedule?.specificDays || []).map((item) => <div key={item.id} className="table-row"><b>{item.title}</b><span>{item.startDate} · {item.opensAt}-{item.closesAt}</span></div>)}
        </div>
      )}
    </section>
  );
}

function BookingPageView({ ops, reload, locale }) {
  const page = ops?.bookingPage || {};
  const [draft, setDraft] = useState(page);
  useEffect(() => setDraft(page), [ops]);
  const save = async (event) => {
    event.preventDefault();
    await api.put("/api/ops/booking-page", draft);
    reload();
  };
  return (
    <section className="ops-page">
      <div className="ops-header"><div><h1>{t(locale, "bookingPage")}</h1><p>هوية صفحة الحجز العامة</p></div></div>
      <form className="panel booking-form" onSubmit={save}>
        <label className="switch-line"><span>تفعيل الحجز عبر الإنترنت</span><input type="checkbox" checked={!!draft.onlineBookingEnabled} onChange={(e) => setDraft({ ...draft, onlineBookingEnabled: e.target.checked })} /></label>
        <label>اسم العمل<input value={draft.businessName || ""} onChange={(e) => setDraft({ ...draft, businessName: e.target.value })} /></label>
        <label>الرابط /slug<input value={draft.slug || ""} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} /></label>
        <div className="form-row">
          <label>البريد<input value={draft.email || ""} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></label>
          <label>الهاتف<input value={draft.phone || ""} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></label>
        </div>
        <label>الوصف<textarea value={draft.description || ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
        <p className="muted">الرابط العام: <a href={`/book.html?slug=${draft.slug}`} target="_blank" rel="noreferrer">/book.html?slug={draft.slug}</a></p>
        <button className="primary-button" type="submit">{t(locale, "save")}</button>
      </form>
    </section>
  );
}

function OverviewView({ ops, appointments, locale, onNavigate }) {
  const stats = ops?.stats || {};
  const today = new Date().toISOString().slice(0, 10);
  const todayItems = (appointments || []).filter((item) => item.date === today && item.status !== "cancelled").slice(0, 6);
  const usage = ops?.planUsage;
  return (
    <section className="ops-page command-center">
      <div className="ops-header">
        <div>
          <h1>{t(locale, "overview")}</h1>
          <p>غرفة العمليات المركزية — شفافية لحظية عبر الحجوزات والعملاء والمال</p>
        </div>
        <a className="primary-button" href="/plans.html">ترقية الخطة</a>
      </div>
      <div className="stats-cards">
        <article className="panel kpi"><span>مواعيد اليوم</span><b>{stats.appointments?.todayCount || todayItems.length}</b></article>
        <article className="panel kpi"><span>نسبة الحضور</span><b>{stats.attendanceRate || 0}%</b></article>
        <article className="panel kpi"><span>إيراد مؤكد</span><b>E£{stats.revenueTotal || 0}</b></article>
        <article className="panel kpi"><span>قيد الانتظار</span><b>{stats.appointments?.pendingCount || 0}</b></article>
      </div>
      <div className="split-panels">
        <div className="panel">
          <div className="panel-head"><b>مواعيد اليوم</b><button type="button" onClick={() => onNavigate("calendar")}>التقويم</button></div>
          {todayItems.map((item) => (
            <div className="table-row" key={item.id}>
              <b>{item.time}</b>
              <span>{item.customerName}</span>
              <span>{item.serviceName}</span>
              <span className={`status-pill status-${item.status}`}>{item.status}</span>
            </div>
          ))}
          {!todayItems.length && <div className="empty-state">لا مواعيد اليوم بعد — صفحة الحجز العامة جاهزة لاستقبال العملاء.</div>}
        </div>
        <div className="panel">
          <div className="panel-head"><b>اختصارات تشغيلية</b></div>
          <div className="quick-actions">
            <button type="button" onClick={() => onNavigate("customers")}>CRM العملاء</button>
            <button type="button" onClick={() => onNavigate("services")}>الخدمات والأقسام</button>
            <button type="button" onClick={() => onNavigate("bookingPage")}>صفحة الحجز العامة</button>
            <button type="button" onClick={() => onNavigate("stats")}>التقارير</button>
          </div>
          {usage?.warnings?.length > 0 && (
            <div className="plan-warning">
              اقتربت من حدود الخطة المجانية: {usage.warnings.map((item) => `${item.key} ${item.used}/${item.limit}`).join(" · ")}
            </div>
          )}
          <div className="upgrade-card">
            <b>بوابة الترقية</b>
            <p>التقارير التفصيلية، أكواد الخصم، وواتساب تفتح مع Pro — الواجهة موجودة كـ Teaser.</p>
            <a href="/plans.html">عرض الخطط</a>
          </div>
        </div>
      </div>
    </section>
  );
}

function StatsView({ ops, locale }) {
  const stats = ops?.stats || {};
  return (
    <section className="ops-page">
      <div className="ops-header"><div><h1>{t(locale, "stats")}</h1><p>مؤشرات الأداء والملخص المالي</p></div></div>
      <div className="stats-cards">
        <article className="panel"><span>مكتمل / مؤكد</span><b>{stats.appointments?.completedCount || 0}</b></article>
        <article className="panel"><span>ملغى</span><b>{stats.appointments?.cancelledCount || 0}</b></article>
        <article className="panel"><span>إجمالي المواعيد</span><b>{stats.appointments?.totalCount || 0}</b></article>
        <article className="panel"><span>مواعيد اليوم</span><b>{stats.appointments?.todayCount || 0}</b></article>
        <article className="panel"><span>نسبة الحضور</span><b>{stats.attendanceRate || 0}%</b></article>
        <article className="panel"><span>إيراد مؤكد</span><b>E£{stats.revenueTotal || 0}</b></article>
        <article className="panel"><span>العملاء</span><b>{stats.customersCount || 0}</b></article>
        <article className="panel"><span>المصروفات</span><b>E£{stats.expensesTotal || 0}</b></article>
      </div>
    </section>
  );
}

function ExpensesView({ ops, reload, locale }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", amount: 0, category: "rent", date: new Date().toISOString().slice(0, 10), description: "", recurrence: "none" });
  const submit = async (event) => {
    event.preventDefault();
    await api.post("/api/ops/expenses", form);
    setOpen(false);
    reload();
  };
  return (
    <section className="ops-page">
      <div className="ops-header"><div><h1>{t(locale, "expenses")}</h1><p>تتبع المصروفات</p></div><button className="primary-button" type="button" onClick={() => setOpen(true)}>+ إضافة مصروف</button></div>
      <div className="panel">
        {(ops?.expenses || []).map((expense) => <div key={expense.id} className="table-row"><b>{expense.name}</b><span>{expense.category}</span><span>E£{expense.amount}</span><span>{expense.date}</span></div>)}
        {!(ops?.expenses || []).length && <div className="empty-state">{t(locale, "empty")}</div>}
      </div>
      <Drawer title="إضافة مصروف" open={open} onClose={() => setOpen(false)}>
        <form className="stack-form" onSubmit={submit}>
          <label>الاسم<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label>المبلغ<input type="number" required value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></label>
          <label>الفئة<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            <option value="rent">إيجار</option><option value="bills">فواتير</option><option value="supplies">لوازم</option><option value="general">عام</option>
          </select></label>
          <label>التاريخ<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
          <label>الوصف<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <div className="form-actions"><button className="primary-button">{t(locale, "save")}</button></div>
        </form>
      </Drawer>
    </section>
  );
}

function PlaceholderView({ title, body }) {
  return (
    <section className="ops-page">
      <div className="ops-header"><div><h1>{title}</h1><p>{body}</p></div></div>
      <div className="panel locked growth-note">
        <b>ميزة مقفلة — Teaser للترقية</b>
        <p>متاح في مرحلة النمو / Pro. الواجهة جاهزة والقفل مفعّل للخطة المجانية لتحفيز الترقية عند الحاجة.</p>
        <a className="primary-button" href="/plans.html">الترقية الآن</a>
      </div>
    </section>
  );
}

function NotificationsView({ ops, reload, locale }) {
  const [draft, setDraft] = useState(ops?.notifications || {});
  useEffect(() => setDraft(ops?.notifications || {}), [ops]);
  const save = async () => {
    await api.put("/api/ops/notifications", draft);
    reload();
  };
  return (
    <section className="ops-page">
      <div className="ops-header"><div><h1>{t(locale, "notifications")}</h1><p>البريد مجاني · المراسلة Pro</p></div><button className="primary-button" type="button" onClick={save}>{t(locale, "save")}</button></div>
      <div className="notif-grid">
        <article className="panel">
          <h3>البريد الإلكتروني</h3>
          {Object.entries(draft.email || {}).map(([key, value]) => (
            <label key={key} className="check"><input type="checkbox" checked={!!value} onChange={(e) => setDraft({ ...draft, email: { ...draft.email, [key]: e.target.checked } })} /> {key}</label>
          ))}
        </article>
        <article className="panel locked">
          <h3>واتساب / SMS <span className="pro-badge">Pro</span></h3>
          <p className="muted">مقفلة في الخطة المجانية</p>
        </article>
        <article className="panel">
          <h3>تذكير يومي</h3>
          <label className="check"><input type="checkbox" checked={!!draft.pushDailyReminder} onChange={(e) => setDraft({ ...draft, pushDailyReminder: e.target.checked })} /> تفعيل</label>
        </article>
      </div>
    </section>
  );
}

function PreferencesView({ ops, reload, locale }) {
  const [draft, setDraft] = useState(ops?.calendarPreferences || {});
  useEffect(() => setDraft(ops?.calendarPreferences || {}), [ops]);
  return (
    <section className="ops-page">
      <div className="ops-header"><div><h1>{t(locale, "preferences")}</h1><p>عرض التقويم</p></div>
        <button className="primary-button" type="button" onClick={async () => { await api.put("/api/ops/calendar-preferences", draft); reload(); }}>{t(locale, "save")}</button>
      </div>
      <div className="panel stack-form">
        <label className="check"><input type="checkbox" checked={!!draft.showBusinessHoursOnly} onChange={(e) => setDraft({ ...draft, showBusinessHoursOnly: e.target.checked })} /> إظهار ساعات العمل فقط</label>
        <label className="check"><input type="checkbox" checked={!!draft.multiServiceEnabled} onChange={(e) => setDraft({ ...draft, multiServiceEnabled: e.target.checked })} /> تفعيل خدمات متعددة</label>
        <label>ألوان المواعيد<select value={draft.appointmentColorMode || "service"} onChange={(e) => setDraft({ ...draft, appointmentColorMode: e.target.value })}>
          <option value="service">حسب لون الخدمة</option>
          <option value="status">حسب الحالة</option>
        </select></label>
      </div>
    </section>
  );
}


function ActivityProfileBar({ ops, reload, locale }) {
  const activity = ops?.activity || { mode: "medical", medicalDepartments: [] };
  const usage = ops?.planUsage;
  const setMode = async (mode) => {
    await api.put("/api/ops/activity-profile", { mode });
    reload();
  };
  const toggleDepartment = async (departmentId) => {
    const medicalDepartments = (activity.medicalDepartments || []).map((department) => (
      department.id === departmentId ? { ...department, enabled: !department.enabled } : department
    ));
    await api.put("/api/ops/activity-profile", { mode: activity.mode, medicalDepartments });
    reload();
  };
  return (
    <section className="activity-panel panel">
      <div className="activity-head">
        <div>
          <h2>نوع النشاط</h2>
          <p>{activity.mode === "medical" ? "قالب طبي للمستشفيات والعيادات" : activity.flexibleHint || "وضع مرن قابل للتخصيص"}</p>
        </div>
        <div className="mode-switch" role="group" aria-label="activity-mode">
          <button type="button" className={activity.mode === "medical" ? "active" : ""} onClick={() => setMode("medical")}>طبي</button>
          <button type="button" className={activity.mode === "flexible" ? "active" : ""} onClick={() => setMode("flexible")}>مرن</button>
        </div>
      </div>
      {activity.mode === "medical" && (
        <div className="department-strip" aria-label="medical-departments">
          <div className="strip-title">الأقسام التي يخدمها النظام ({(activity.medicalDepartments || []).filter((d) => d.enabled !== false).length}/15)</div>
          <div className="department-chips">
            {(activity.medicalDepartments || []).map((department) => (
              <button
                key={department.id}
                type="button"
                className={department.enabled === false ? "dept-chip off" : "dept-chip"}
                onClick={() => toggleDepartment(department.id)}
              >
                {department.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {activity.mode === "flexible" && (
        <p className="flexible-note">الحقول والخدمات قابلة للتخصيص لأي نشاط: شركات، تدريب، صالونات، استشارات، أو مؤسسات خدمية.</p>
      )}
      {usage?.warnings?.length > 0 && (
        <div className="plan-warning">
          اقتربت من حدود الخطة المجانية:
          {" "}
          {usage.warnings.map((item) => `${item.key} ${item.used}/${item.limit}`).join(" · ")}
          . الترقية تبقي الحجوزات دون انقطاع.
        </div>
      )}
    </section>
  );
}

function App() {
  const [locale, setLocale] = useState(localStorage.getItem("maw3ed.locale") || "ar");
  const [view, setView] = useState("overview");
  const [moreOpen, setMoreOpen] = useState(false);
  const [role, setRole] = useState(localStorage.getItem("maw3ed.role") || "owner");
  const { ops, error, isPending, reload } = useOpsBootstrap();
  const { appointments, reload: reloadAppointments } = useAppointments();
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    applyDocumentLocale(locale);
    localStorage.setItem("maw3ed.locale", locale);
  }, [locale]);

  useEffect(() => {
    api.get("/api/workspace-profile").then((result) => setProfile(result.profile)).catch(() => {});
  }, []);

  const navigate = (id) => {
    if (id === "more") {
      setMoreOpen((value) => !value);
      return;
    }
    setView(id);
    setMoreOpen(false);
  };

  const content = (() => {
    if (!ops && isPending) return <div className="loading-state">{t(locale, "loading")}</div>;
    switch (view) {
      case "overview": return <OverviewView ops={ops} appointments={appointments} locale={locale} onNavigate={navigate} />;
      case "calendar": return <CalendarViewProxy appointments={appointments} ops={ops} locale={locale} onCreated={() => { reloadAppointments(); reload(); }} />;
      case "customers": return <CustomersView ops={ops} reload={reload} locale={locale} />;
      case "staff": return <StaffView ops={ops} reload={reload} locale={locale} />;
      case "services": return <ServicesView ops={ops} reload={reload} locale={locale} />;
      case "schedule": return <ScheduleView ops={ops} reload={reload} locale={locale} />;
      case "bookingPage": return <BookingPageView ops={ops} reload={reload} locale={locale} />;
      case "stats": return role === "reception" ? <PlaceholderView title={t(locale, "stats")} body="التقارير المالية للمدير العام فقط — صلاحيات الاستقبال محدودة" /> : <StatsView ops={ops} locale={locale} />;
      case "expenses": return role === "provider" ? <PlaceholderView title={t(locale, "expenses")} body="المصروفات ظاهرة للمدير فقط في هذه المرحلة" /> : <ExpensesView ops={ops} reload={reload} locale={locale} />;
      case "notifications": return <NotificationsView ops={ops} reload={reload} locale={locale} />;
      case "preferences": return <PreferencesView ops={ops} reload={reload} locale={locale} />;
      case "payments": return <PlaceholderView title={t(locale, "payments")} body="بوابة الدفع الإلكتروني (Stripe) — مرحلة النمو" />;
      case "marketing": return <PlaceholderView title={t(locale, "marketing")} body="الخصومات والولاء — مرحلة النمو / Pro" />;
      case "integrations": return <PlaceholderView title={t(locale, "integrations")} body="Google Calendar و Stripe — مرحلة النمو" />;
      default: return <OverviewView ops={ops} appointments={appointments} locale={locale} onNavigate={navigate} />;
    }
  })();

  return (
    <div className={`ops-shell ${isPending ? "is-pending" : ""}`}>
      <aside className="ops-sidebar">
        <div className="ops-brand">
          <img src="/assets/maw3ed-icon.svg" alt="" />
          <div><strong>{t(locale, "brand")}</strong><span>{t(locale, "tagline")}</span></div>
        </div>
        <div className="workspace-pill">
          <b>{profile?.name || ops?.bookingPage?.businessName || "مساحة موعد"}</b>
          <span>{profile?.activityDisplayName || "مساحة عمل"}</span>
        </div>
        <nav className="ops-nav">
          {NAV.map((item) => (
            <button key={item.id} type="button" className={view === item.id ? "nav-item active" : "nav-item"} onClick={() => navigate(item.id)}>
              <span className="nav-ico" aria-hidden="true">{item.mark}</span>
              <span>{t(locale, item.id)}</span>
              {item.badge && <i className="new-badge">{item.badge}</i>}
              {item.growth && <i className="lock-dot" title="Growth" />}
            </button>
          ))}
        </nav>
        <div className="ops-sidebar-foot">
          <label className="locale-select">
            <span>اللغة</span>
            <select value={locale} onChange={(e) => setLocale(e.target.value)}>
              {LOCALES.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
            </select>
          </label>
          <label className="locale-select">
            <span>الدور</span>
            <select value={role} onChange={(e) => { setRole(e.target.value); localStorage.setItem("maw3ed.role", e.target.value); }}>
              <option value="owner">مدير عام</option>
              <option value="reception">استقبال</option>
              <option value="provider">مقدّم خدمة</option>
            </select>
          </label>
          <div className="user-chip"><b>مستخدم موعد</b><span>{t(locale, "free")} · {role === "owner" ? "مدير" : role === "reception" ? "استقبال" : "مقدّم"}</span></div>
        </div>
      </aside>
      <main className="ops-main">
        <ActivityProfileBar ops={ops} reload={reload} locale={locale} />
        {error && <div className="error-banner">{error}<button type="button" onClick={reload}>إعادة</button></div>}
        <ModuleBoundary key={view}>
          <Suspense fallback={<div className="loading-state">{t(locale, "loading")}</div>}>{content}</Suspense>
        </ModuleBoundary>
        <footer className="ops-footer">{t(locale, "poweredBy")}</footer>
      </main>
      <nav className="mobile-bottom-nav" aria-label="mobile">
        {MOBILE_NAV.map((id) => (
          <button key={id} type="button" className={(id === "more" ? moreOpen : view === id) ? "active" : ""} onClick={() => navigate(id)}>
            <span>{id === "more" ? "•••" : NAV.find((item) => item.id === id)?.mark}</span>
            <small>{id === "more" ? "المزيد" : t(locale, id)}</small>
          </button>
        ))}
      </nav>
      {moreOpen && (
        <div className="more-sheet">
          {NAV.filter((item) => !MOBILE_NAV.includes(item.id)).map((item) => (
            <button key={item.id} type="button" onClick={() => navigate(item.id)}>{t(locale, item.id)}</button>
          ))}
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
