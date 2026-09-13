import React, { Suspense, memo, useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const DASHBOARD_DATE = "2025-05-14";
const arabicDigits = (value) => String(value).replace(/\d/g, (digit) => "٠١٢٣٤٥٦٧٨٩"[digit]);
const statusLabels = { confirmed: "مؤكد", pending: "بانتظار التأكيد", cancelled: "ملغى", completed: "مكتمل" };
const colorNames = ["blue", "mint", "amber", "violet"];

const navigation = [
  { id: "dashboard", label: "لوحة التحكم", icon: "grid" },
  { id: "calendar", label: "التقويم", icon: "calendar", badge: 3 },
  { id: "appointments", label: "المواعيد", icon: "clock" },
  { id: "patients", label: "المرضى", icon: "users", group: "تشغيل المستشفى" },
  { id: "services", label: "الأقسام والعيادات", icon: "layers" },
  { id: "team", label: "الأطباء والطاقم", icon: "stethoscope" },
  { id: "reports", label: "التقارير", icon: "chart", group: "الإدارة والتحليل" },
  { id: "settings", label: "الإعدادات", icon: "settings" }
];

function Icon({ name, size = 18 }) {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 10h18" /><path d="M7 14h.01M11 14h.01M15 14h.01M7 18h.01M11 18h.01" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    users: <><path d="M16 20v-1.7a3.3 3.3 0 0 0-3.3-3.3H7.3A3.3 3.3 0 0 0 4 18.3V20" /><circle cx="10" cy="7" r="3" /><path d="M20 20v-1.5a3.2 3.2 0 0 0-2.4-3.1M16.5 4.1a3 3 0 0 1 0 5.8" /></>,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>,
    stethoscope: <><path d="M6 3v5a4 4 0 0 0 8 0V3M4 3h4M12 3h4" /><path d="M14 15a4 4 0 1 0 8 0v-2" /><circle cx="20" cy="10" r="2" /></>,
    chart: <><path d="M4 19V5M4 19h17" /><path d="m7 15 4-4 3 2 5-7" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.5 1.5-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.2h-2.1v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1-1.5-1.5.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H7v-2.1h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.5-1.5.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5V5h2.1v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.5 1.5-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.2v2.1h-.2a1.7 1.7 0 0 0-1.5 1Z" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    chevron: <path d="m7 10 5 5 5-5" />,
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>
  };
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

const api = {
  get: async (url) => {
    const response = await fetch(url);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "تعذر تحميل البيانات");
    return payload;
  },
  post: async (url, body) => {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "تعذر إتمام العملية");
    return payload;
  }
};

function useDashboardData(date) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const reload = useCallback(() => {
    startTransition(() => {
      api.get(`/api/dashboard?date=${date}`).then(setData).catch((requestError) => setError(requestError.message));
    });
  }, [date]);
  useEffect(reload, [reload]);
  return { data, error, isPending, reload };
}

const StatCard = memo(function StatCard({ label, value, change, note, tone, icon, progress }) {
  return <article className={`stat-card stat-${tone}`}>
    <div className="stat-top"><span>{label}</span><span className="stat-icon"><Icon name={icon} size={17} /></span></div>
    <strong className="stat-value">{value}{progress ? <small>٪</small> : null}</strong>
    <div className="stat-foot"><b>↑ {change}</b><span>{note}</span></div>
    {progress ? <div className="stat-progress"><i style={{ width: `${progress}%` }} /></div> : <div className="mini-bars">{[35, 55, 42, 72, 48, 80, 64, 92].map((height) => <i key={height} style={{ height: `${height}%` }} />)}</div>}
  </article>;
});

const AppointmentRow = memo(function AppointmentRow({ appointment, index }) {
  const [hour, minute] = appointment.time.split(":");
  const displayHour = Number(hour) > 12 ? Number(hour) - 12 : Number(hour);
  return <div className="appointment-row">
    <div className="time"><b>{arabicDigits(`${displayHour}:${minute}`)}</b><span>{appointment.period}</span></div>
    <i className={`appointment-marker ${colorNames[index % colorNames.length]}`} />
    <div className="appointment-copy"><b>{appointment.patientName}</b><span>{appointment.serviceName} <em>•</em> {appointment.doctorName}</span></div>
    <div className={`patient-avatar avatar-${index % 4}`}>{appointment.patientName.trim().charAt(0)}</div>
    <span className={`status ${appointment.status}`}>{statusLabels[appointment.status] || "قيد المراجعة"}</span>
  </div>;
});

function Sidebar({ activeView, onNavigate, collapsed, onToggle }) {
  return <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
    <div className="brand">
      <img src="/assets/maw3ed-icon.svg" alt="موعد" />
      <div><strong>موعد</strong><span>إدارة الرعاية بوضوح</span></div>
      <button className="sidebar-toggle" onClick={onToggle} aria-label="تبديل القائمة"><Icon name="menu" size={17} /></button>
    </div>
    <div className="workspace-card">
      <div className="workspace-avatar">ش</div>
      <div className="workspace-copy"><b>مستشفى الشفاء</b><span>مساحة العمل الطبية</span></div>
      <Icon name="chevron" size={14} />
    </div>
    <nav className="nav">
      {navigation.map((item, index) => <React.Fragment key={item.id}>
        {item.group && <p className="nav-label">{item.group}</p>}
        {!item.group && index === 0 && <p className="nav-label">الرئيسية</p>}
        <button className={`nav-item ${activeView === item.id ? "active" : ""}`} onClick={() => onNavigate(item.id)} title={item.label}>
          <Icon name={item.icon} size={18} /><span>{item.label}</span>{item.badge && <i className="nav-badge">{item.badge}</i>}
        </button>
      </React.Fragment>)}
    </nav>
    <div className="sidebar-footer">
      <div className="upgrade-card"><span className="upgrade-mark">✦</span><b>قالب طبي مرن</b><p>خصّص مساحة العمل لتناسب فريقك.</p><button onClick={() => onNavigate("settings")}>إدارة التخصيص <Icon name="arrow" size={13} /></button></div>
      <div className="profile"><div className="profile-avatar">س</div><div><b>د. سارة أحمد</b><span>مديرة التشغيل الطبي</span></div><button aria-label="المزيد">•••</button></div>
    </div>
  </aside>;
}

function Header({ activeView, onVerify, onNotify, onToggleSidebar }) {
  const current = navigation.find((item) => item.id === activeView);
  return <header className="topbar">
    <button className="mobile-menu" onClick={onToggleSidebar} aria-label="فتح القائمة"><Icon name="menu" size={20} /></button>
    <div className="breadcrumb"><span>مساحة العمل</span><b>/</b><strong>{current?.label || "لوحة التحكم"}</strong></div>
    <div className="top-actions">
      <button className="verify-button" onClick={onVerify}><Icon name="mail" size={15} /><span>تحقق من البريد</span></button>
      <button className="notification" onClick={onNotify} aria-label="الإشعارات"><Icon name="bell" size={19} /><i /></button>
      <div className="top-divider" />
      <div className="top-user"><div><b>مرحباً، د. سارة</b><span>الأربعاء، ١٤ مايو ٢٠٢٥</span></div><div className="top-avatar">س</div></div>
    </div>
  </header>;
}

function Dashboard({ data, isPending, onNewAppointment, onNavigate }) {
  const stats = data?.stats || { appointmentsToday: 48, newPatients: 32, completedExams: 128, attendanceRate: 96 };
  const appointments = data?.appointments || [];
  const departments = data?.departments || [];
  const displayedAppointments = appointments.slice(0, 4);
  return <div className={isPending ? "dashboard is-loading" : "dashboard"}>
    <section className="hero-row">
      <div><div className="eyebrow"><i /> نموذج طبي قابل للتخصيص</div><h1>صباح الخير، د. سارة <span>✦</span></h1><p>ملخص التشغيل الطبي في مستشفى الشفاء لهذا اليوم.</p></div>
      <button className="primary-button" onClick={onNewAppointment}><Icon name="plus" size={17} /> موعد جديد</button>
    </section>
    <section className="stats-grid">
      <StatCard label="مواعيد اليوم" value={arabicDigits(stats.appointmentsToday)} change="١٢٪" note="مقارنة بالأسبوع الماضي" tone="blue" icon="calendar" />
      <StatCard label="مرضى جدد" value={arabicDigits(stats.newPatients)} change="٨.٤٪" note="مقارنة بالأسبوع الماضي" tone="amber" icon="users" />
      <StatCard label="فحوصات مكتملة" value={arabicDigits(stats.completedExams)} change="٢٤٪" note="مقارنة بالأسبوع الماضي" tone="violet" icon="stethoscope" />
      <StatCard label="نسبة الحضور" value={arabicDigits(stats.attendanceRate)} change="٣.٢٪" note="مقارنة بالأسبوع الماضي" tone="mint" icon="chart" progress={stats.attendanceRate} />
    </section>
    <section className="insight-strip">
      <div><span className="section-kicker">مساحة عمل منظمة</span><h2>كل ما يحتاجه فريقك في مكان واحد</h2><p>تابع المواعيد والمرضى وأداء الأقسام من لوحة واحدة.</p></div>
      <div className="department-chips">{departments.slice(0, 8).map((department, index) => <button className={index === 0 ? "active" : ""} key={department.id} onClick={() => onNavigate("services")}><span>{index === 0 ? "+" : "•"}</span>{department.name}</button>)}</div>
    </section>
    <div className="main-grid">
      <section className="panel schedule-panel">
        <PanelHeading title="الجدول الطبي للأسبوع" subtitle="مواعيد الأقسام من ١١ — ١٧ مايو ٢٠٢٥"><div className="panel-tools"><button aria-label="الأسبوع السابق">›</button><button aria-label="الأسبوع التالي">‹</button><button className="quiet-button">هذا الأسبوع <Icon name="chevron" size={12} /></button></div></PanelHeading>
        <WeekCalendar />
      </section>
      <section className="panel today-panel">
        <PanelHeading title="مواعيد اليوم" subtitle={`الأربعاء، ١٤ مايو • ${arabicDigits(stats.appointmentsToday)} موعداً`}><button className="round-button" onClick={() => onNavigate("appointments")}><Icon name="arrow" size={16} /></button></PanelHeading>
        <div className="today-progress"><div><span>نسبة الإنجاز</span><b>٦٧٪</b></div><div className="progress-track"><i style={{ width: "67%" }} /></div></div>
        <div className="appointment-list">{displayedAppointments.length ? displayedAppointments.map((appointment, index) => <AppointmentRow key={appointment.id} appointment={appointment} index={index} />) : <div className="empty-state">لا توجد مواعيد لهذا اليوم.</div>}</div>
        <button className="view-all" onClick={() => onNavigate("appointments")}>عرض كل المواعيد <Icon name="arrow" size={14} /></button>
      </section>
    </div>
    <div className="secondary-grid">
      <section className="panel demand-panel"><PanelHeading title="الأقسام الأكثر طلباً" subtitle="خلال آخر ٣٠ يوماً"><button className="dots">•••</button></PanelHeading><div className="demand-content"><div className="donut"><div><b>٣٨٤</b><span>موعد</span></div></div><ul><li><i className="dot dot-blue" />الباطنية <b>٣٨٪</b></li><li><i className="dot dot-amber" />الأطفال <b>٢٨٪</b></li><li><i className="dot dot-violet" />الأسنان <b>١٨٪</b></li><li><i className="dot dot-soft" />أقسام أخرى <b>١٦٪</b></li></ul></div></section>
      <section className="panel patients-panel"><PanelHeading title="مرضى جدد" subtitle="آخر الملفات الطبية المضافة"><button className="quiet-link" onClick={() => onNavigate("patients")}>عرض الكل <Icon name="arrow" size={13} /></button></PanelHeading><PatientTable patients={data?.patients || []} /></section>
    </div>
  </div>;
}

function PanelHeading({ title, subtitle, children }) {
  return <div className="panel-heading"><div><h2>{title}</h2><p>{subtitle}</p></div>{children}</div>;
}

function WeekCalendar() {
  const bookings = [["كشف باطني", "ليان محمد", "blue"], ["تحاليل مخبرية", "نور علي", "amber"], ["متابعة أطفال", "مها خالد", "mint"], ["أشعة سونار", "جود عبدالعزيز", "violet"], ["عيادة الأسنان", "ريم سعد", "blue"], ["كشف قلب", "هدى أحمد", "coral"], ["علاج طبيعي", "رنا يوسف", "mint"]];
  return <div className="week-calendar"><div className="week-head"><span /><span>الأحد<small>١١</small></span><span>الإثنين<small>١٢</small></span><span className="today">الثلاثاء<small>١٣</small></span><span>الأربعاء<small>١٤</small></span><span>الخميس<small>١٥</small></span><span>الجمعة<small>١٦</small></span><span>السبت<small>١٧</small></span></div><div className="calendar-body"><div className="time-labels">{["٠٩:٠٠", "١٠:٠٠", "١١:٠٠", "١٢:٠٠", "٠١:٠٠", "٠٢:٠٠", "٠٣:٠٠"].map((time) => <span key={time}>{time}</span>)}</div>{Array.from({ length: 7 }, (_, index) => <div className={`day-column ${index === 2 ? "selected" : ""}`} key={index}>{bookings.filter((_, bookingIndex) => bookingIndex % 7 === index || (index === 0 && bookingIndex === 1)).map((booking, bookingIndex) => <span className={`booking booking-${booking[2]}`} style={{ top: `${12 + bookingIndex * 76}px` }} key={booking[0]}>{booking[0]}<small>{booking[1]}</small></span>)}</div>)}</div></div>;
}

function PatientTable({ patients }) {
  const fallback = [{ name: "نور علي", joinedAt: "اليوم", lastVisit: "موعد أول" }, { name: "مها خالد", joinedAt: "أمس", lastVisit: "١٣ مايو ٢٠٢٥" }, { name: "غادة فهد", joinedAt: "١٢ مايو", lastVisit: "١٢ مايو ٢٠٢٥" }];
  const list = patients.length ? patients.slice(0, 3) : fallback;
  return <div className="patient-table"><div className="patient-row table-head"><span>المريض</span><span>تاريخ الانضمام</span><span>آخر زيارة</span></div>{list.map((patient, index) => <div className="patient-row" key={patient.id || patient.name}><div className="patient-name"><i className={`patient-dot dot-${index}`} /> <b>{patient.name}</b></div><span>{patient.joinedAt || "اليوم"}</span><span className={patient.lastVisit === "موعد أول" ? "tag" : ""}>{patient.lastVisit || "موعد أول"}</span></div>)}</div>;
}

function Placeholder({ view, onBack, onNewAppointment }) {
  const page = navigation.find((item) => item.id === view);
  const copy = { calendar: "استعرض جدول الفريق ونقاط الضغط اليومية.", appointments: "تابع كل الحجوزات مع التصفية وتحديث الحالة.", patients: "ملفات المرضى الأساسية وتاريخ الزيارات والمتابعات.", services: "فعّل الأقسام والخدمات المرتبطة بكل عيادة.", team: "نظّم جداول الأطباء والتمريض والاستقبال.", reports: "مؤشرات تشغيلية واضحة تساعدك على قرارات أفضل.", settings: "تحكم في إعدادات الحساب والتنبيهات وهوية صفحة الحجز." };
  return <section className="placeholder"><div className="placeholder-icon"><Icon name={page?.icon || "grid"} size={32} /></div><span className="section-kicker">قريباً في مساحة العمل</span><h2>{page?.label}</h2><p>{copy[view]}</p><div className="placeholder-actions">{view === "appointments" && <button className="primary-button" onClick={onNewAppointment}><Icon name="plus" size={16} /> إضافة موعد</button>}<button className="secondary-button" onClick={onBack}>العودة للوحة التحكم</button></div></section>;
}

function AppointmentModal({ open, onClose, onCreated, departments, doctors }) {
  const [form, setForm] = useState({ patientName: "", departmentId: departments[0]?.id || "", doctorId: doctors[0]?.id || "", date: DASHBOARD_DATE, time: "09:00" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (departments[0] && !form.departmentId) setForm((current) => ({ ...current, departmentId: departments[0].id })); if (doctors[0] && !form.doctorId) setForm((current) => ({ ...current, doctorId: doctors[0].id })); }, [departments, doctors, form.departmentId, form.doctorId]);
  if (!open) return null;
  const update = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  const submit = async (event) => { event.preventDefault(); setBusy(true); try { await api.post("/api/appointments", form); onCreated(); onClose(); setForm((current) => ({ ...current, patientName: "" })); } catch (error) { onCreated(error.message); } finally { setBusy(false); } };
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="appointment-title"><button className="modal-close" onClick={onClose} aria-label="إغلاق"><Icon name="close" size={17} /></button><span className="section-kicker">تنظيم موعد جديد</span><h2 id="appointment-title">أضف موعداً إلى جدول اليوم</h2><p>سيظهر الموعد فوراً لفريق التشغيل بعد الحفظ.</p><form onSubmit={submit}><label>اسم المريض<input name="patientName" value={form.patientName} onChange={update} placeholder="مثال: أحمد محمد" required /></label><div className="form-row"><label>القسم<select name="departmentId" value={form.departmentId} onChange={update}>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label><label>الطبيب<select name="doctorId" value={form.doctorId} onChange={update}>{doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.name}</option>)}</select></label></div><div className="form-row"><label>التاريخ<input type="date" name="date" value={form.date} onChange={update} required /></label><label>الوقت<input type="time" name="time" value={form.time} onChange={update} required /></label></div><button className="primary-button form-submit" disabled={busy}>{busy ? "جارٍ الحفظ..." : "حفظ الموعد"} <Icon name="arrow" size={15} /></button></form></section></div>;
}

function App() {
  const [activeView, setActiveView] = useState("dashboard");
  const [collapsed, setCollapsed] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const { data, error, isPending, reload } = useDashboardData(DASHBOARD_DATE);
  const departments = data?.departments || [];
  const doctors = data?.doctors || [];
  const notify = useCallback((title, message) => { setToast({ title, message }); window.setTimeout(() => setToast(null), 3600); }, []);
  const navigate = useCallback((view) => { setActiveView(view); if (view !== "dashboard") window.scrollTo({ top: 0, behavior: "smooth" }); }, []);
  const onCreated = useCallback((message) => { if (message) notify("تعذر حفظ الموعد", message); else { notify("تم حفظ الموعد", "تمت إضافة الموعد إلى جدول اليوم."); reload(); } }, [notify, reload]);
  return <div className="app-shell">
    <Sidebar activeView={activeView} onNavigate={navigate} collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} />
    <main className="main-content"><Header activeView={activeView} onVerify={() => notify("توثيق البريد", "هذه الخطوة جاهزة للربط مع إعدادات الحساب.")} onNotify={() => notify("لا توجد إشعارات جديدة", "كل شيء محدث حتى الآن.")} onToggleSidebar={() => setCollapsed((value) => !value)} /><div className="page-wrap">
      {error && <div className="error-banner">تعذر تحميل البيانات: {error}<button onClick={reload}>إعادة المحاولة</button></div>}
      <Suspense fallback={<div className="loading-state">جارٍ تجهيز مساحة العمل...</div>}>{activeView === "dashboard" ? <Dashboard data={data} isPending={isPending} onNewAppointment={() => setModalOpen(true)} onNavigate={navigate} /> : <Placeholder view={activeView} onBack={() => navigate("dashboard")} onNewAppointment={() => setModalOpen(true)} />}</Suspense>
    </div><footer className="site-footer"><span>© 2026 UpNexa-eg.com</span><b>موعد Maw3ed</b><span>جميع الحقوق محفوظة</span></footer></main>
    <AppointmentModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={onCreated} departments={departments} doctors={doctors} />
    {toast && <div className="toast" role="status"><span>✓</span><div><b>{toast.title}</b><small>{toast.message}</small></div></div>}
  </div>;
}

createRoot(document.getElementById("root")).render(<App />);