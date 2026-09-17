import React, { Component, Suspense, useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./ops.css";
import { api } from "./api";
import { LOCALES, applyDocumentLocale, t } from "./i18n";
import { CalendarView } from "./CalendarView.jsx";
import {
  Maw3edClerkProvider,
  ClerkTokenBridge,
  FreshTrialGate,
  AuthControls,
  AuthSessionGate,
  WorkspaceOnboarding,
  useClerkPublishableKey,
  useAuth
} from "./ClerkGate.jsx";
import { getClerkLocalization } from "./authI18n";

const NAV = [
  { id: "overview", mark: "لوحة" },
  { id: "calendar", mark: "تق" },
  { id: "customers", mark: "عم" },
  { id: "staff", mark: "مو" },
  { id: "schedule", mark: "جد" },
  { id: "services", mark: "خد" },
  { id: "bookingPage", mark: "حجز" },
  { id: "industry", mark: "قالب" },
  { id: "stats", mark: "إحص" },
  { id: "payments", mark: "دفع", growth: true },
  { id: "expenses", mark: "مص" },
  { id: "marketing", mark: "تس", growth: true, badge: "جديد" },
  { id: "notifications", mark: "تنب" },
  { id: "preferences", mark: "تفض" },
  { id: "account", mark: "حساب" },
  { id: "integrations", mark: "ربط", growth: true }
];

const MOBILE_NAV = ["overview", "calendar", "customers", "services", "more"];

const SERVICE_COLORS = ["#111827", "#7f1d1d", "#92400e", "#9f1239", "#6b21a8", "#a78bfa", "#db2777", "#f9a8d4", "#fb7185", "#3B82F6"];
const SERVICE_DURATION_OPTIONS = Array.from({ length: 16 }, (_, index) => (index + 1) * 15); // 15..240
const SERVICE_BUFFER_OPTIONS = [0, ...SERVICE_DURATION_OPTIONS];

function formatMinutesLabel(minutes) {
  const value = Number(minutes) || 0;
  if (value === 0) return "بدون فاصل (0 د)";
  if (value < 60) return `${value} دقيقة`;
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  if (!rest) return hours === 1 ? "ساعة واحدة" : `${hours} ساعات`;
  return `${hours}س ${rest}د`;
}

function snapToQuarter(value, { min = 0, allowZero = false } = {}) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return allowZero ? 0 : min;
  if (allowZero && raw <= 0) return 0;
  return Math.max(min, Math.round(raw / 15) * 15);
}

async function logoutUser() {
  ["maw3ed.role", "maw3ed.workspaceId"].forEach((key) => localStorage.removeItem(key));
  api.setWorkspaceId("");
  window.location.href = "/";
}

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
          <p>تعذّر عرض هذا القسم. باقي لوحة التحكم يعمل بشكل طبيعي.</p>
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
  const emptyForm = {
    firstName: "", lastName: "", phone: "", title: "", avatarUrl: "", serviceIds: [], active: true,
    useBusinessHours: true
  };
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [form, setForm] = useState(emptyForm);
  const dayNames = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const openCreate = () => {
    setEditingId("");
    setForm(emptyForm);
    setOpen(true);
  };
  const openEdit = (person) => {
    setEditingId(person.id);
    setForm({
      firstName: person.firstName || person.name?.split(/\s+/)[0] || "",
      lastName: person.lastName || person.name?.split(/\s+/).slice(1).join(" ") || "",
      phone: person.phone || "",
      title: person.title || "",
      avatarUrl: person.avatarUrl || "",
      serviceIds: person.serviceIds || (ops?.services || []).filter((s) => (s.providerIds || []).includes(person.id)).map((s) => s.id),
      active: person.active !== false,
      useBusinessHours: person.useBusinessHours !== false,
      workingHours: person.workingHours || (ops?.schedule?.general || []).map((day) => ({ ...day }))
    });
    setOpen(true);
  };
  const submit = async (event) => {
    event.preventDefault();
    const payload = {
      ...form,
      name: `${form.firstName} ${form.lastName}`.trim()
    };
    if (editingId) await api.patch(`/api/ops/staff/${editingId}`, payload);
    else await api.post("/api/ops/staff", payload);
    setOpen(false);
    setForm(emptyForm);
    setEditingId("");
    reload();
  };
  return (
    <section className="ops-page">
      <div className="ops-header">
        <div><h1>{t(locale, "staff")}</h1><p>الموظفون ومقدمو الخدمات وساعات العمل</p></div>
        <button className="primary-button" type="button" onClick={openCreate}>+ إضافة موظف</button>
      </div>
      <div className="data-table panel">
        {(ops?.staff || []).map((person) => (
          <div className="table-row staff-row" key={person.id}>
            <div className="avatar" style={person.avatarUrl ? { backgroundImage: `url(${person.avatarUrl})`, backgroundSize: "cover" } : undefined}>
              {!person.avatarUrl && person.name.charAt(0)}
            </div>
            <div>
              <b>{person.name}</b>
              <small>{person.title}{person.phone ? ` · ${person.phone}` : ""} · {person.useBusinessHours === false ? "ساعات خاصة" : "ساعات المنشأة"}</small>
            </div>
            <span>{person.servicesCount || 0} خدمات</span>
            <div className="row-actions">
              <button type="button" className="edit-button" onClick={() => openEdit(person)}>تعديل</button>
              <button
                type="button"
                className="danger-button"
                onClick={async () => {
                  if (!window.confirm(`حذف الموظف «${person.name}»؟`)) return;
                  try {
                    await api.del(`/api/ops/staff/${person.id}`);
                    reload();
                  } catch (error) {
                    window.alert(error.message || "تعذر الحذف");
                  }
                }}
              >
                حذف
              </button>
            </div>
          </div>
        ))}
      </div>
      <Drawer title={editingId ? "تعديل موظف" : "موظف جديد"} open={open} onClose={() => setOpen(false)}>
        <form className="stack-form" onSubmit={submit}>
          <div className="form-row">
            <label>الاسم الأول<input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></label>
            <label>اسم العائلة<input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></label>
          </div>
          <label>الهاتف (+20)<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="01xxxxxxxxx" /></label>
          <label>المهنة<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
          <label>رابط الصورة<input value={form.avatarUrl} onChange={(e) => setForm({ ...form, avatarUrl: e.target.value })} placeholder="https://..." /></label>
          <label>الخدمات
            <select multiple value={form.serviceIds} onChange={(e) => setForm({ ...form, serviceIds: [...e.target.selectedOptions].map((o) => o.value) })} style={{ minHeight: 96 }}>
              {(ops?.services || []).map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
            </select>
          </label>
          <label className="check"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> نشط</label>
          <label className="check">
            <input
              type="checkbox"
              checked={form.useBusinessHours !== false}
              onChange={(e) => setForm({
                ...form,
                useBusinessHours: e.target.checked,
                workingHours: e.target.checked ? form.workingHours : (form.workingHours || (ops?.schedule?.general || []).map((day) => ({ ...day })))
              })}
            /> استخدام ساعات عمل المنشأة
          </label>
          {form.useBusinessHours === false && (
            <div className="panel schedule-table" style={{ marginTop: 8 }}>
              {(form.workingHours || []).map((day, index) => (
                <div className="schedule-row" key={day.weekday ?? index}>
                  <b>{dayNames[index]}</b>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={day.isOpen !== false}
                      onChange={(e) => setForm((current) => ({
                        ...current,
                        workingHours: current.workingHours.map((item, i) => i === index ? { ...item, isOpen: e.target.checked } : item)
                      }))}
                    /><i />
                  </label>
                  <input
                    type="time"
                    value={day.opensAt || "09:00"}
                    disabled={day.isOpen === false}
                    onChange={(e) => setForm((current) => ({
                      ...current,
                      workingHours: current.workingHours.map((item, i) => i === index ? { ...item, opensAt: e.target.value } : item)
                    }))}
                  />
                  <input
                    type="time"
                    value={day.closesAt || "21:00"}
                    disabled={day.isOpen === false}
                    onChange={(e) => setForm((current) => ({
                      ...current,
                      workingHours: current.workingHours.map((item, i) => i === index ? { ...item, closesAt: e.target.value } : item)
                    }))}
                  />
                </div>
              ))}
            </div>
          )}
          <div className="form-actions"><button className="primary-button">{t(locale, "save")}</button></div>
        </form>
      </Drawer>
    </section>
  );
}

function ServicesView({ ops, reload, locale }) {
  const emptyForm = {
    name: "",
    categoryId: "",
    durationMinutes: 30,
    bufferMinutes: 0,
    price: 0,
    priceMin: 0,
    priceMax: 0,
    pricingType: "fixed",
    providerId: "",
    publicBooking: true,
    autoAccept: true,
    autoComplete: true,
    active: true,
    color: "#3B82F6",
    description: ""
  };
  const [categoryId, setCategoryId] = useState(ops?.serviceCategories?.[0]?.id || "");
  const [open, setOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [form, setForm] = useState(emptyForm);
  const categories = ops?.serviceCategories || [];
  const allServices = ops?.services || [];

  useEffect(() => {
    if (!categories.length) {
      if (categoryId) setCategoryId("");
      return;
    }
    if (!categories.some((item) => item.id === categoryId)) {
      setCategoryId(categories[0].id);
    }
  }, [ops, categoryId, categories]);

  const selectedCategory = categories.find((item) => item.id === categoryId) || null;
  const services = categoryId
    ? allServices.filter((service) => service.categoryId === categoryId)
    : [];
  const incompletePricing = form.pricingType === "range" || form.pricingType === "on_request";
  const countInCategory = (id) => allServices.filter((service) => service.categoryId === id).length;

  const formatPrice = (service) => {
    const type = service.pricingType || "fixed";
    if (type === "free") return "مجاني";
    if (type === "on_request") return "عند الطلب";
    if (type === "range") return `E£${service.priceMin ?? service.price ?? 0} – ${service.priceMax ?? service.price ?? 0}`;
    return Number(service.price) === 0 ? "مجاني" : `E£${service.price}`;
  };

  const openCreate = () => {
    setEditingId("");
    setForm({ ...emptyForm, categoryId, durationMinutes: 30, bufferMinutes: 15 });
    setOpen(true);
  };
  const openEdit = (service) => {
    setEditingId(service.id);
    setForm({
      name: service.name || "",
      categoryId: service.categoryId || categoryId,
      durationMinutes: snapToQuarter(service.durationMinutes || 30, { min: 15 }),
      bufferMinutes: snapToQuarter(service.bufferMinutes || 0, { min: 0, allowZero: true }),
      price: service.price || 0,
      priceMin: service.priceMin ?? service.price ?? 0,
      priceMax: service.priceMax ?? service.price ?? 0,
      pricingType: service.pricingType || "fixed",
      providerId: (service.providerIds || [])[0] || "",
      publicBooking: service.publicBooking !== false,
      autoAccept: Boolean(service.autoAccept),
      autoComplete: Boolean(service.autoComplete),
      active: service.active !== false,
      color: service.color || "#3B82F6",
      description: service.description || ""
    });
    setOpen(true);
  };
  const openCategoryCreate = () => {
    setEditingCategoryId("");
    setCategoryName("");
    setCategoryOpen(true);
  };
  const openCategoryEdit = (category) => {
    setEditingCategoryId(category.id);
    setCategoryName(category.name || "");
    setCategoryOpen(true);
  };
  const submitCategory = async (event) => {
    event.preventDefault();
    if (editingCategoryId) await api.patch(`/api/ops/service-categories/${editingCategoryId}`, { name: categoryName });
    else {
      const created = await api.post("/api/ops/service-categories", { name: categoryName });
      if (created?.category?.id) setCategoryId(created.category.id);
    }
    setCategoryOpen(false);
    reload();
  };
  const toggleCategoryActive = async (category) => {
    const next = category.active === false || category.enabled === false;
    try {
      await api.patch(`/api/ops/service-categories/${category.id}`, { active: next });
      reload();
    } catch (error) {
      window.alert(error.message || "تعذر تحديث الفئة");
    }
  };
  const deleteCategory = async (category) => {
    if (!window.confirm(`حذف فئة «${category.name}»؟ الحذف مسموح فقط إذا كانت فارغة ولم يُسجَّل عليها تعامل.`)) return;
    try {
      await api.del(`/api/ops/service-categories/${category.id}`);
      if (categoryId === category.id) setCategoryId(ops?.serviceCategories?.find((item) => item.id !== category.id)?.id || "");
      reload();
    } catch (error) {
      window.alert(error.message || "تعذر حذف الفئة — الحذف للمحتوى الفارغ فقط.");
    }
  };
  const toggleServiceActive = async (service) => {
    try {
      await api.patch(`/api/ops/services/${service.id}`, { active: service.active === false });
      reload();
    } catch (error) {
      window.alert(error.message || "تعذر تحديث الخدمة");
    }
  };
  const deleteServiceRow = async (service) => {
    if (!window.confirm(`حذف خدمة «${service.name}»؟ الحذف مسموح فقط إذا لم يسبق التعامل عليها.`)) return;
    try {
      await api.del(`/api/ops/services/${service.id}`);
      reload();
    } catch (error) {
      window.alert(error.message || "تعذر حذف الخدمة — الحذف للمحتوى الفارغ فقط.");
    }
  };
  const submit = async (event) => {
    event.preventDefault();
    const payload = { ...form, categoryId: form.categoryId || categoryId };
    try {
      if (editingId) await api.patch(`/api/ops/services/${editingId}`, payload);
      else await api.post("/api/ops/services", payload);
      setOpen(false);
      setEditingId("");
      reload();
    } catch (error) {
      window.alert(error.message || "تعذر حفظ الخدمة");
    }
  };
  return (
    <section className="ops-page">
      <div className="ops-header">
        <div><h1>{t(locale, "services")}</h1><p>فئات الخدمات والتسعير وزمن التقديم</p></div>
        <button className="primary-button" type="button" onClick={openCreate}>+ إضافة خدمة</button>
      </div>
      <div className="panel incomplete-logic-note" role="note">
        <b>منطق غير مكتمل — تذكير</b>
        <p>تسعير «نطاق» و«عند الطلب» يُحفظ في الخدمة، لكن ربط السعر عند طلب الحجز لم يُغلق بعد. راجع docs/INCOMPLETE_LOGIC.md.</p>
      </div>
      <div className="split-panels services-split">
        <aside className="panel category-list">
          <div className="panel-head"><b>فئة الخدمة</b><button type="button" onClick={openCategoryCreate}>+ إضافة</button></div>
          {categories.map((category) => {
            const inactive = category.active === false || category.enabled === false;
            const count = countInCategory(category.id);
            return (
              <div key={category.id} className={categoryId === category.id ? "cat-row active" : "cat-row"}>
                <button type="button" className={categoryId === category.id ? "cat active" : "cat"} onClick={() => setCategoryId(category.id)}>
                  <span className="cat-name">
                    {category.name}
                    {inactive ? <span className="status-soft">متوقفة</span> : null}
                  </span>
                  <span className="cat-count">{count} خدمة</span>
                </button>
                <div className="row-actions compact">
                  <button type="button" className="edit-button" onClick={() => openCategoryEdit(category)}>تعديل</button>
                  <button type="button" className="warn-button" onClick={() => toggleCategoryActive(category)}>{inactive ? "تفعيل" : "إيقاف"}</button>
                  <button type="button" className="danger-button" onClick={() => deleteCategory(category)}>حذف</button>
                </div>
              </div>
            );
          })}
        </aside>
        <div className="panel service-list">
          <div className="panel-head service-list-head">
            <div>
              <b>{selectedCategory ? `خدمات «${selectedCategory.name}»` : "الخدمات"}</b>
              <small>{services.length} خدمة في هذه الفئة</small>
            </div>
            {services.length > 0 && (
              <button className="primary-button" type="button" onClick={openCreate}>+ إضافة خدمة</button>
            )}
          </div>
          {services.map((service) => (
            <div className={`table-row service-row${service.active === false ? " is-inactive" : ""}`} key={service.id}>
              <span className="color-dot" style={{ background: service.color || "#3B82F6" }} />
              <div className="service-main">
                <b>
                  {service.name}
                  {service.active === false ? <span className="service-status">متوقفة</span> : null}
                  {!(service.providerIds || []).length ? <span className="service-status">بلا مقدم</span> : null}
                </b>
                <small>
                  تقديم {service.durationMinutes} د
                  {service.bufferMinutes ? ` · فاصل صيانة ${service.bufferMinutes} د` : ""}
                  {" · "}
                  حجز {(Number(service.durationMinutes) || 0) + (Number(service.bufferMinutes) || 0)} د
                </small>
              </div>
              <span className="service-price">{formatPrice(service)}</span>
              <div className="row-actions">
                <button type="button" className="edit-button" onClick={() => openEdit(service)}>تعديل</button>
                <button type="button" className="warn-button" onClick={() => toggleServiceActive(service)}>
                  {service.active === false ? "تفعيل" : "إيقاف"}
                </button>
                <button type="button" className="danger-button" onClick={() => deleteServiceRow(service)}>حذف</button>
              </div>
            </div>
          ))}
          {!services.length && (
            <div className="service-empty">
              <p>
                {selectedCategory
                  ? `لا توجد خدمات في فئة «${selectedCategory.name}» بعد.`
                  : "اختر فئة لعرض خدماتها."}
              </p>
              {selectedCategory && (
                <button className="primary-button service-empty-cta" type="button" onClick={openCreate}>
                  + إضافة خدمة لهذه الفئة
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <Drawer title={editingCategoryId ? "تعديل فئة" : "فئة جديدة"} open={categoryOpen} onClose={() => setCategoryOpen(false)}>
        <form className="stack-form" onSubmit={submitCategory}>
          <label>اسم الفئة<input required value={categoryName} onChange={(e) => setCategoryName(e.target.value)} /></label>
          <p className="muted">الحذف مسموح فقط للفئات الفارغة التي لم يسبق التعامل عليها.</p>
          <div className="form-actions"><button className="primary-button">{t(locale, "save")}</button></div>
        </form>
      </Drawer>
      <Drawer title={editingId ? "تعديل خدمة" : "خدمة جديدة"} open={open} onClose={() => setOpen(false)}>
        <form className="stack-form" onSubmit={submit}>
          <label>الاسم<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label>الفئة<select value={form.categoryId || categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
            {(ops?.serviceCategories || []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select></label>
          <label>مقدم الخدمة (اختياري عند الإنشاء)
            <select value={form.providerId} onChange={(e) => setForm({ ...form, providerId: e.target.value })}>
              <option value="">— بدون تعيين الآن —</option>
              {(ops?.staff || []).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
          </label>
          <p className="muted">يمكن إنشاء الخدمة بلا مقدم، لكن لن يُسمح بتحديد أي موعد عليها حتى يُعيَّن مقدم خدمة واحد على الأقل.</p>
          <label>نوع التسعير
            <select
              value={form.pricingType}
              onChange={(e) => setForm({ ...form, pricingType: e.target.value })}
            >
              <option value="fixed">ثابت (قيمة ثابتة)</option>
              <option value="free">مجاني</option>
              <option value="range">نطاق</option>
              <option value="on_request">عند الطلب</option>
            </select>
          </label>
          {form.pricingType === "fixed" && (
            <label>السعر<input type="number" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} /></label>
          )}
          {form.pricingType === "range" && (
            <div className="form-row">
              <label>يبدأ من<input type="number" min="0" required value={form.priceMin} onChange={(e) => setForm({ ...form, priceMin: Number(e.target.value) })} /></label>
              <label>ينتهي عند<input type="number" min="0" required value={form.priceMax} onChange={(e) => setForm({ ...form, priceMax: Number(e.target.value) })} /></label>
            </div>
          )}
          {(form.pricingType === "free" || form.pricingType === "on_request") && (
            <p className="muted">{form.pricingType === "free" ? "بدون قيمة — حقل المبلغ مخفي." : "يُحدَّد السعر عند طلب الخدمة (منطق غير مكتمل بعد)."}</p>
          )}
          {incompletePricing && (
            <div className="plan-warning">تسعير «{form.pricingType === "range" ? "نطاق" : "عند الطلب"}» محفوظ شكلياً — منطق الربط عند الحجز غير مكتمل.</div>
          )}
          <div className="form-row">
            <label title="المدة الفعلية لتقديم الخدمة مع العميل. تُختار بمضاعفات ربع ساعة.">
              زمن تقديم الخدمة
              <select
                value={snapToQuarter(form.durationMinutes, { min: 15 })}
                onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })}
              >
                {SERVICE_DURATION_OPTIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>{formatMinutesLabel(minutes)}</option>
                ))}
              </select>
            </label>
            <label title="فاصل صيانة / إعادة تجهيز (re-cleaning) بعد انتهاء الخدمة قبل قبول موعد جديد.">
              فاصل زمني (صيانة / إعادة تجهيز)
              <select
                value={snapToQuarter(form.bufferMinutes, { min: 0, allowZero: true })}
                onChange={(e) => setForm({ ...form, bufferMinutes: Number(e.target.value) })}
              >
                {SERVICE_BUFFER_OPTIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>{formatMinutesLabel(minutes)}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="booking-block-note">
            زمن كل حجز لهذه الخدمة =
            {" "}
            <b>{Number(form.durationMinutes) || 0}</b>
            {" "}د تقديم +
            {" "}
            <b>{Number(form.bufferMinutes) || 0}</b>
            {" "}د فاصل =
            {" "}
            <b>{(Number(form.durationMinutes) || 0) + (Number(form.bufferMinutes) || 0)} دقيقة</b>
          </div>
          <label>لون الخدمة
            <div className="color-swatches">
              {SERVICE_COLORS.map((color) => (
                <button key={color} type="button" className={form.color === color ? "swatch on" : "swatch"} style={{ background: color }} onClick={() => setForm({ ...form, color })} aria-label={color} />
              ))}
            </div>
            <input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
          </label>
          <label>وصف مختصر<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <label className="check"><input type="checkbox" checked={form.publicBooking} onChange={(e) => setForm({ ...form, publicBooking: e.target.checked })} /> عرض على صفحة الحجز</label>
          <label className="check"><input type="checkbox" checked={form.autoAccept} onChange={(e) => setForm({ ...form, autoAccept: e.target.checked })} /> قبول تلقائي</label>
          <label className="check"><input type="checkbox" checked={form.autoComplete} onChange={(e) => setForm({ ...form, autoComplete: e.target.checked })} /> إنهاء تلقائي</label>
          <label className="check"><input type="checkbox" checked={form.active !== false} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> نشطة</label>
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
      <div className="ops-header"><div><h1>{t(locale, "schedule")}</h1><p>ساعات المنشأة · أيام مغلقة · أيام محددة (تُطبَّق على الحجز العام)</p></div>{tab === "general" && <button className="primary-button" type="button" onClick={save}>{t(locale, "save")}</button>}</div>
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
  const [uploading, setUploading] = useState(false);
  useEffect(() => setDraft(page), [ops]);
  const save = async (event) => {
    event.preventDefault();
    await api.put("/api/ops/booking-page", draft);
    reload();
  };
  const onLogoFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const result = await api.post("/api/ops/uploads/logo", { dataUrl });
      setDraft((current) => ({ ...current, logoUrl: result.logoUrl }));
      reload();
    } finally {
      setUploading(false);
    }
  };
  return (
    <section className="ops-page">
      <div className="ops-header"><div><h1>المنشأة وصفحة الحجز</h1><p>الهوية العامة وبيانات الحجز للعملاء</p></div></div>
      <form className="panel booking-form" onSubmit={save}>
        <div className="facility-logo-row">
          <div className="facility-logo-preview" style={draft.logoUrl ? { backgroundImage: `url(${draft.logoUrl})` } : undefined}>
            {!draft.logoUrl && <span>شعار العلامة</span>}
          </div>
          <div className="stack-form" style={{ flex: 1 }}>
            <label>رفع شعار<input type="file" accept="image/*" onChange={onLogoFile} disabled={uploading} /></label>
            <label>أو رابط الشعار<input value={draft.logoUrl || ""} onChange={(e) => setDraft({ ...draft, logoUrl: e.target.value })} placeholder="/data/uploads/..." /></label>
          </div>
        </div>
        <label className="switch-line"><span>تفعيل الحجز عبر الإنترنت</span><input type="checkbox" checked={!!draft.onlineBookingEnabled} onChange={(e) => setDraft({ ...draft, onlineBookingEnabled: e.target.checked })} /></label>
        <label>اسم المنشأة<input value={draft.businessName || ""} onChange={(e) => setDraft({ ...draft, businessName: e.target.value })} /></label>
        <label>الرابط /slug<input value={draft.slug || ""} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} /></label>
        <div className="form-row">
          <label>البريد<input value={draft.email || ""} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></label>
          <label>الهاتف<input value={draft.phone || ""} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></label>
        </div>
        <label>الوصف<textarea value={draft.description || ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
        <div className="form-row">
          <label>الدولة<input value={draft.country || ""} onChange={(e) => setDraft({ ...draft, country: e.target.value })} /></label>
          <label>المدينة<input value={draft.city || ""} onChange={(e) => setDraft({ ...draft, city: e.target.value })} /></label>
        </div>
        <label>العنوان<input value={draft.street || ""} onChange={(e) => setDraft({ ...draft, street: e.target.value })} /></label>
        <label>المنطقة الزمنية<input value={draft.timezone || "Africa/Cairo"} onChange={(e) => setDraft({ ...draft, timezone: e.target.value })} /></label>
        <div className="form-row">
          <label>فيسبوك<input value={draft.socialLinks?.facebook || ""} onChange={(e) => setDraft({ ...draft, socialLinks: { ...(draft.socialLinks || {}), facebook: e.target.value } })} /></label>
          <label>إنستغرام<input value={draft.socialLinks?.instagram || ""} onChange={(e) => setDraft({ ...draft, socialLinks: { ...(draft.socialLinks || {}), instagram: e.target.value } })} /></label>
        </div>
        <label>الموقع<input value={draft.socialLinks?.website || ""} onChange={(e) => setDraft({ ...draft, socialLinks: { ...(draft.socialLinks || {}), website: e.target.value } })} /></label>
        <p className="muted">الرابط العام: <a href={`/book.html?slug=${draft.slug}`} target="_blank" rel="noreferrer">/book.html?slug={draft.slug}</a></p>
        <button className="primary-button" type="submit">{t(locale, "save")}</button>
      </form>
    </section>
  );
}

function IndustryTemplatesView({ ops, reload, locale }) {
  const activity = ops?.activity || {};
  const templates = activity.templates || [];
  const locked = Boolean(activity.locked);
  const [query, setQuery] = useState("");
  const filtered = templates.filter((item) => {
    const hay = `${item.displayName} ${item.description} ${item.id}`.toLowerCase();
    return !query.trim() || hay.includes(query.trim().toLowerCase());
  });
  const choose = async (template) => {
    if (locked) {
      window.alert("تم قفل نوع النشاط ولا يمكن تغييره.");
      return;
    }
    const confirmed = window.confirm(
      `تأكيد اختيار «${template.displayName}»؟\nبعد التأكيد لن يمكن تغيير نوع النشاط أو الوضع المرن.`
    );
    if (!confirmed) return;
    await api.put("/api/ops/activity-profile", { templateId: template.id, mode: template.mode, lock: true });
    reload();
  };
  return (
    <section className="ops-page">
      <div className="ops-header">
        <div>
          <h1>اختر الصناعة</h1>
          <p>{locked ? `القالب الحالي مقفول: ${activity.templateDisplayName || activity.mode}` : "اختر قالباً جاهزاً ثم أكّد لقفل نوع النشاط"}</p>
        </div>
      </div>
      <div className="panel">
        <input className="search-input" placeholder="بحث" value={query} onChange={(e) => setQuery(e.target.value)} disabled={locked} />
        <div className="template-list">
          {filtered.map((template) => (
            <button
              key={template.id}
              type="button"
              className={activity.templateId === template.id ? "template-row on" : "template-row"}
              disabled={locked}
              onClick={() => choose(template)}
            >
              <b>{template.displayName}</b>
              <small>{template.description}</small>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function OverviewView({ ops, appointments, locale, onNavigate }) {
  const stats = ops?.stats || {};
  const today = new Date().toISOString().slice(0, 10);
  const todayItems = (appointments || []).filter((item) => item.date === today && item.status !== "cancelled").slice(0, 6);
  const usage = ops?.planUsage;
  const showPlanUi = usage?.limitsEnforced === true;
  return (
    <section className="ops-page command-center">
      <div className="ops-header">
        <div>
          <h1>{t(locale, "overview")}</h1>
          <p>ملخص يومك — الحجوزات والعملاء والإيراد في مكان واحد</p>
        </div>
        {showPlanUi && <a className="primary-button" href="/plans.html">ترقية الخطة</a>}
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
          <div className="panel-head"><b>اختصارات سريعة</b></div>
          <div className="quick-actions">
            <button type="button" onClick={() => onNavigate("customers")}>CRM العملاء</button>
            <button type="button" onClick={() => onNavigate("services")}>الخدمات والأقسام</button>
            <button type="button" onClick={() => onNavigate("bookingPage")}>صفحة الحجز العامة</button>
            <button type="button" onClick={() => onNavigate("stats")}>التقارير</button>
            <button type="button" onClick={() => onNavigate("account")}>الحساب والإعدادات</button>
          </div>
          {showPlanUi && usage?.warnings?.length > 0 && (
            <div className="plan-warning">
              اقتربت من حدود الخطة المجانية: {usage.warnings.map((item) => `${item.key} ${item.used}/${item.limit}`).join(" · ")}
            </div>
          )}
          {showPlanUi && (
            <div className="upgrade-card">
              <b>بوابة الترقية</b>
              <p>التقارير التفصيلية، أكواد الخصم، وواتساب تفتح مع Pro — الواجهة موجودة كـ Teaser.</p>
              <a href="/plans.html">عرض الخطط</a>
            </div>
          )}
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

function PlaceholderView({ title, body, locked = false }) {
  return (
    <section className="ops-page">
      <div className="ops-header"><div><h1>{title}</h1><p>{body}</p></div></div>
      {locked ? (
        <div className="panel locked growth-note">
          <b>ميزة مقفلة — Teaser للترقية</b>
          <p>متاح في مرحلة النمو / Pro. الواجهة جاهزة والقفل مفعّل للخطة المجانية لتحفيز الترقية عند الحاجة.</p>
          <a className="primary-button" href="/plans.html">الترقية الآن</a>
        </div>
      ) : (
        <div className="panel">
          <b>متاح أثناء الاختبار</b>
          <p className="muted">قيود الخطط موقوفة مؤقتاً حتى اكتمال الاختبارات. يمكنك استكشاف الواجهة بحرية.</p>
        </div>
      )}
    </section>
  );
}

function AccountSettingsView({ locale, setLocale, role, setRole }) {
  return (
    <section className="ops-page">
      <div className="ops-header">
        <div>
          <h1>{t(locale, "account")}</h1>
          <p>اللغة، الدور، الأمان، وكلمة المرور — بعيداً عن القائمة الجانبية</p>
        </div>
      </div>
      <div className="split-panels">
        <div className="panel stack-form account-settings-panel">
          <h3>تفضيلات العرض</h3>
          <label className="locale-select">
            <span>اللغة</span>
            <select value={locale} onChange={(e) => setLocale(e.target.value)}>
              {LOCALES.map((item) => (
                <option key={item.code} value={item.code}>{item.label}</option>
              ))}
            </select>
          </label>
          <label className="locale-select">
            <span>الدور التجريبي</span>
            <select
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                localStorage.setItem("maw3ed.role", e.target.value);
              }}
            >
              <option value="owner">مدير عام</option>
              <option value="reception">استقبال</option>
              <option value="provider">مقدّم خدمة</option>
            </select>
          </label>
        </div>
        <div className="panel account-settings-panel">
          <h3>الحساب والأمان</h3>
          <p className="muted">تغيير البريد يعيد التحقق برمز OTP مرة واحدة. تسجيل الدخول العادي لا يرسل رمزاً.</p>
          <AuthControls onSignOut={logoutUser} />
        </div>
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
      <div className="ops-header"><div><h1>{t(locale, "notifications")}</h1><p>البريد الإلكتروني وتذكيرات المواعيد</p></div><button className="primary-button" type="button" onClick={save}>{t(locale, "save")}</button></div>
      <div className="notif-grid">
        <article className="panel">
          <h3>البريد الإلكتروني</h3>
          {Object.entries(draft.email || {}).map(([key, value]) => (
            <label key={key} className="check"><input type="checkbox" checked={!!value} onChange={(e) => setDraft({ ...draft, email: { ...draft.email, [key]: e.target.checked } })} /> {key}</label>
          ))}
        </article>
        <article className={`panel${ops?.planUsage?.limitsEnforced ? " locked" : ""}`}>
          <h3>واتساب / SMS {ops?.planUsage?.limitsEnforced ? <span className="pro-badge">Pro</span> : null}</h3>
          <p className="muted">{ops?.planUsage?.limitsEnforced ? "مقفلة في الخطة المجانية" : "متاحة أثناء الاختبار (قيود الخطط موقوفة مؤقتاً)"}</p>
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
  const locked = Boolean(activity.locked);

  const setMode = async (mode) => {
    if (locked) return;
    if (mode === "flexible" || mode !== activity.mode) {
      const confirmed = window.confirm(
        "بعد التأكيد لن يمكن تغيير نوع النشاط (طبي / مرن). هل تريد المتابعة؟"
      );
      if (!confirmed) return;
      await api.put("/api/ops/activity-profile", { mode, lock: true });
    } else {
      await api.put("/api/ops/activity-profile", { mode });
    }
    reload();
  };

  const toggleDepartment = async (departmentId) => {
    if (locked) return;
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
          <p>
            {locked
              ? `مقفول · ${activity.templateDisplayName || (activity.mode === "medical" ? "طبي" : "مرن")}`
              : activity.mode === "medical"
                ? "قالب طبي للمستشفيات والعيادات"
                : activity.flexibleHint || "وضع مرن قابل للتخصيص"}
          </p>
        </div>
        {!locked ? (
          <div className="mode-switch" role="group" aria-label="activity-mode">
            <button type="button" className={activity.mode === "medical" ? "active" : ""} onClick={() => setMode("medical")}>طبي</button>
            <button type="button" className={activity.mode === "flexible" ? "active" : ""} onClick={() => setMode("flexible")}>مرن</button>
          </div>
        ) : (
          <span className="locked-pill">مقفل</span>
        )}
      </div>
      {activity.mode === "medical" && !locked && (
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
      {ops?.planUsage?.limitsEnforced === true && usage?.warnings?.length > 0 && (
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
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const stored = Number(localStorage.getItem("maw3ed.sidebarWidth"));
    return Number.isFinite(stored) && stored >= 260 && stored <= 420 ? stored : 304;
  });
  const [resizingSidebar, setResizingSidebar] = useState(false);
  const { ops, error, isPending, reload } = useOpsBootstrap();
  const { appointments, reload: reloadAppointments } = useAppointments();
  const [profile, setProfile] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [workspaceId, setWorkspaceId] = useState(localStorage.getItem("maw3ed.workspaceId") || "");

  useEffect(() => {
    applyDocumentLocale(locale);
    localStorage.setItem("maw3ed.locale", locale);
  }, [locale]);

  useEffect(() => {
    localStorage.setItem("maw3ed.sidebarWidth", String(sidebarWidth));
    document.documentElement.style.setProperty("--ops-sidebar-width", `${sidebarWidth}px`);
  }, [sidebarWidth]);

  useEffect(() => {
    if (!resizingSidebar) return undefined;
    const onMove = (event) => {
      const rtl = document.documentElement.dir === "rtl";
      const next = rtl ? window.innerWidth - event.clientX : event.clientX;
      setSidebarWidth(Math.min(420, Math.max(260, Math.round(next))));
    };
    const onUp = () => setResizingSidebar(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [resizingSidebar]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await api.resolveToken();
        if (!token || cancelled) return;
        const [profileResult, workspaceResult] = await Promise.all([
          api.get("/api/workspace-profile").catch(() => null),
          api.get("/api/workspaces").catch(() => ({ workspaces: [] }))
        ]);
        if (cancelled) return;
        if (profileResult?.profile) setProfile(profileResult.profile);
        setWorkspaces(workspaceResult.workspaces || []);
      } catch {
        if (!cancelled) setWorkspaces([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  useEffect(() => {
    if (ops && !ops.activity?.locked && !localStorage.getItem("maw3ed.industrySeen")) {
      setView("industry");
      localStorage.setItem("maw3ed.industrySeen", "1");
    }
  }, [ops]);

  const navigate = (id) => {
    if (id === "more") {
      setMoreOpen((value) => !value);
      return;
    }
    setView(id);
    setMoreOpen(false);
  };

  const switchWorkspace = (id) => {
    setWorkspaceId(id);
    api.setWorkspaceId(id);
    reload();
  };

  const createWorkspace = async () => {
    const name = window.prompt("اسم مساحة العمل الجديدة");
    if (!name) return;
    const activityType = ops?.activity?.templateId || "other";
    try {
      const result = await api.post("/api/workspaces", {
        name,
        slug: name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || `ws-${Date.now()}`,
        activityType: ["medical", "education", "billiards", "salon", "fitness", "other"].includes(activityType)
          ? activityType
          : "other"
      });
      const id = result.workspace?.id;
      if (id) switchWorkspace(id);
      const list = await api.get("/api/workspaces");
      setWorkspaces(list.workspaces || []);
    } catch (err) {
      window.alert(err.message || "تعذر إنشاء مساحة العمل (يتطلب تسجيل دخول Clerk + Postgres)");
    }
  };

  const logoUrl = ops?.bookingPage?.logoUrl || profile?.logoUrl || "";
  const planLocked = ops?.planUsage?.limitsEnforced === true;
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
      case "industry": return <IndustryTemplatesView ops={ops} reload={reload} locale={locale} />;
      case "stats": return role === "reception" ? <PlaceholderView title={t(locale, "stats")} body="التقارير المالية للمدير العام فقط — صلاحيات الاستقبال محدودة" locked={false} /> : <StatsView ops={ops} locale={locale} />;
      case "expenses": return role === "provider" ? <PlaceholderView title={t(locale, "expenses")} body="المصروفات ظاهرة للمدير فقط في هذه المرحلة" locked={false} /> : <ExpensesView ops={ops} reload={reload} locale={locale} />;
      case "notifications": return <NotificationsView ops={ops} reload={reload} locale={locale} />;
      case "preferences": return <PreferencesView ops={ops} reload={reload} locale={locale} />;
      case "account": return <AccountSettingsView locale={locale} setLocale={setLocale} role={role} setRole={setRole} />;
      case "payments": return <PlaceholderView title={t(locale, "payments")} body="بوابة الدفع الإلكتروني (Stripe)" locked={planLocked} />;
      case "marketing": return <PlaceholderView title={t(locale, "marketing")} body="الخصومات والولاء" locked={planLocked} />;
      case "integrations": return <PlaceholderView title={t(locale, "integrations")} body="Google Calendar و Stripe" locked={planLocked} />;
      default: return <OverviewView ops={ops} appointments={appointments} locale={locale} onNavigate={navigate} />;
    }
  })();

  return (
    <div
      className={`ops-shell ${isPending ? "is-pending" : ""} ${resizingSidebar ? "is-resizing-sidebar" : ""}`}
      style={{ "--ops-sidebar-width": `${sidebarWidth}px` }}
    >
      <aside className="ops-sidebar">
        <div className="ops-brand">
          <img src={logoUrl || "/assets/maw3ed-icon.svg"} alt="" />
          <div><strong>{t(locale, "brand")}</strong><span>{t(locale, "tagline")}</span></div>
        </div>
        <div className="workspace-pill">
          <b>{profile?.name || ops?.bookingPage?.businessName || "مساحة موعد"}</b>
          <span>{ops?.activity?.templateDisplayName || profile?.activityDisplayName || "مساحة عمل"}</span>
          {(workspaces.length > 0 || true) && (
            <div className="workspace-switch">
              <select value={workspaceId} onChange={(e) => switchWorkspace(e.target.value)}>
                <option value="">المساحة المحلية</option>
                {workspaces.map((ws) => <option key={ws.id} value={ws.id}>{ws.name}</option>)}
              </select>
              <button type="button" onClick={createWorkspace}>+ مساحة</button>
            </div>
          )}
        </div>
        <nav className="ops-nav">
          {NAV.map((item) => (
            <button key={item.id} type="button" className={view === item.id ? "nav-item active" : "nav-item"} onClick={() => navigate(item.id)}>
              <span className="nav-ico" aria-hidden="true">{item.mark}</span>
              <span>{item.id === "industry" ? "القوالب" : item.id === "bookingPage" ? "المنشأة والحجز" : t(locale, item.id)}</span>
              {item.badge && <i className="new-badge">{item.badge}</i>}
              {item.growth && planLocked && <i className="lock-dot" title="Growth" />}
            </button>
          ))}
        </nav>
        <div className="ops-sidebar-foot">
          <button type="button" className="ghost-button sidebar-account-link" onClick={() => navigate("account")}>
            الحساب والإعدادات
          </button>
        </div>
      </aside>
      <button
        type="button"
        className="ops-sidebar-resize"
        aria-label="تغيير عرض القائمة الجانبية"
        title="اسحب لتغيير العرض"
        onPointerDown={(event) => {
          event.preventDefault();
          setResizingSidebar(true);
        }}
      />
      <main className="ops-main">
        <ActivityProfileBar ops={ops} reload={reload} locale={locale} />
        {error && <div className="error-banner">{error}<button type="button" onClick={reload}>إعادة</button></div>}
        <ModuleBoundary key={view}>
          <Suspense fallback={<div className="loading-state">{t(locale, "loading")}</div>}>{content}</Suspense>
        </ModuleBoundary>
        <footer className="ops-footer">
          <div>{t(locale, "poweredBy")}</div>
          <a href={`mailto:${t(locale, "contactEmail")}`}>{t(locale, "contactEmail")}</a>
        </footer>
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
          <div className="more-facility">
            <div className="facility-logo-preview sm" style={logoUrl ? { backgroundImage: `url(${logoUrl})` } : undefined}>
              {!logoUrl && <span>شعار</span>}
            </div>
            <div>
              <b>{ops?.bookingPage?.businessName || "منشأة موعد"}</b>
              <small>{ops?.activity?.templateDisplayName || "مساحة عمل"}</small>
            </div>
          </div>
          {NAV.filter((item) => !MOBILE_NAV.includes(item.id)).map((item) => (
            <button key={item.id} type="button" onClick={() => navigate(item.id)}>
              {item.id === "industry" ? "القوالب" : item.id === "bookingPage" ? "المنشأة والحجز" : t(locale, item.id)}
            </button>
          ))}
          <button type="button" onClick={() => navigate("account")}>{t(locale, "account")}</button>
          <button type="button" className="logout-button" onClick={logoutUser}>تسجيل الخروج</button>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<Root />);

function AuthenticatedShell() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [workspaces, setWorkspaces] = useState(null);
  const [bootError, setBootError] = useState("");
  const [authBlocked, setAuthBlocked] = useState(false);

  useEffect(() => {
    // Do not call /api/workspaces until Clerk finished loading and the user is signed in.
    if (!isLoaded || !isSignedIn) {
      if (isLoaded && !isSignedIn) {
        setAuthBlocked(true);
        setBootError("يلزم تسجيل الدخول قبل إنشاء مساحة العمل");
        setWorkspaces([]);
      }
      return undefined;
    }

    let cancelled = false;
    let tokenAttempts = 0;

    const load = async () => {
      try {
        const token = await getToken(tokenAttempts === 0 ? undefined : { skipCache: true });
        if (!token) {
          tokenAttempts += 1;
          // Warm up JWT briefly; never hammer /api/workspaces without a Bearer token.
          if (!cancelled && tokenAttempts < 6) {
            window.setTimeout(load, 200 * tokenAttempts);
            return;
          }
          if (cancelled) return;
          setAuthBlocked(true);
          setBootError("يلزم إعادة تسجيل الدخول قبل إنشاء مساحة العمل");
          setWorkspaces([]);
          return;
        }

        const result = await api.get("/api/workspaces");
        if (cancelled) return;
        const list = result.workspaces || [];
        setBootError("");
        setAuthBlocked(false);
        setWorkspaces(list);
        if (list[0]?.id && !localStorage.getItem("maw3ed.workspaceId")) {
          api.setWorkspaceId(list[0].id);
        }
      } catch (err) {
        if (cancelled) return;
        const message = err.message || "تعذر تحميل مساحات العمل";
        const isAuth = err.status === 401 || /authentication|تسجيل الدخول|missing_clerk_token/i.test(message);
        // No retry loop on 401 — surface login UI once.
        if (isAuth) {
          setAuthBlocked(true);
          setBootError("يلزم إعادة تسجيل الدخول قبل إنشاء مساحة العمل");
          setWorkspaces([]);
          return;
        }
        setBootError(message);
        setWorkspaces([]);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, getToken]);

  if (!isLoaded || (isSignedIn && workspaces === null && !authBlocked)) {
    return (
      <div className="auth-landing">
        <div className="auth-landing-card">
          <p>جارٍ التحقق من الحساب ومساحات العمل…</p>
          {bootError && <div className="error-banner">{bootError}</div>}
        </div>
      </div>
    );
  }

  if (authBlocked || !isSignedIn) {
    return (
      <div className="auth-landing">
        <div className="auth-landing-card">
          <img className="auth-brand-logo" src="/assets/maw3ed-icon.svg" alt="موعد" width={112} height={112} />
          <h1>مطلوب تسجيل الدخول</h1>
          <p>{bootError || "انتهت الجلسة أو لم يُربط التوكن بعد. سجّل الدخول مرة أخرى."}</p>
          <a
            className="primary-button auth-cta"
            href="/?mode=sign-in"
            style={{ display: "grid", placeItems: "center", textDecoration: "none" }}
          >
            فتح صفحة الدخول
          </a>
        </div>
      </div>
    );
  }

  if (workspaces.length === 0) {
    return (
      <WorkspaceOnboarding
        onCreated={(workspace) => {
          setWorkspaces([workspace]);
          if (workspace?.id) api.setWorkspaceId(workspace.id);
        }}
      />
    );
  }

  return <App />;
}

function ClerkRoot({ publishableKey }) {
  const [locale, setLocale] = useState(() => localStorage.getItem("maw3ed.locale") || "ar");
  const localization = useMemo(() => getClerkLocalization(locale), [locale]);

  return (
    <Maw3edClerkProvider publishableKey={publishableKey} localization={localization}>
      <FreshTrialGate>
        <AuthSessionGate locale={locale} onLocaleChange={setLocale}>
          <ClerkTokenBridge>
            <AuthenticatedShell />
          </ClerkTokenBridge>
        </AuthSessionGate>
      </FreshTrialGate>
    </Maw3edClerkProvider>
  );
}

function Root() {
  const { key, ready } = useClerkPublishableKey();
  if (!ready) {
    return (
      <div className="auth-landing">
        <div className="auth-landing-card">
          <p>جارٍ تجهيز تسجيل الدخول…</p>
        </div>
      </div>
    );
  }
  if (!key) return <App />;
  return <ClerkRoot publishableKey={key} />;
}
