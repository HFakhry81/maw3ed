const navItems = document.querySelectorAll(".nav-item");
const sections = document.querySelectorAll(".view-section");
const pageTitle = document.getElementById("pageTitle");
function trackEvent(event, details = {}) {
  fetch("/api/development-events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, details }),
    keepalive: true
  }).catch((error) => console.warn("Development event was not recorded", error));
}
const dashboardDate = "2025-05-14";
const arabicDigits = (value) => String(value).replace(/\d/g, (digit) => "٠١٢٣٤٥٦٧٨٩"[digit]);
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
}[character]));
const statusLabels = { confirmed: "مؤكد", pending: "بانتظار التأكيد", cancelled: "ملغى", completed: "مكتمل" };
const appointmentColors = ["green", "blue", "yellow", "purple"];

function renderAppointments(appointments) {
  const list = document.getElementById("todayAppointmentsList");
  if (!list) return;
  if (!appointments.length) {
    list.innerHTML = '<div class="empty-state">لا توجد مواعيد لهذا اليوم.</div>';
    return;
  }
  list.innerHTML = appointments.map((appointment, index) => {
    const hour = Number(appointment.time.split(":")[0]);
    const minute = appointment.time.split(":")[1];
    const displayHour = hour > 12 ? hour - 12 : hour;
    const initials = appointment.patientName.trim().charAt(0);
    const color = appointmentColors[index % appointmentColors.length];
    return `<div class="appointment-item">
      <div class="appointment-time"><b>${arabicDigits(`${displayHour}:${minute}`)}</b><span>${escapeHtml(appointment.period)}</span></div>
      <div class="appointment-line ${color}"></div>
      <div class="appointment-info"><b>${escapeHtml(appointment.patientName)}</b><span>${escapeHtml(appointment.serviceName)} • ${escapeHtml(appointment.doctorName)}</span></div>
      <div class="appointment-avatar ${["pink", "peach", "lavender", "mint"][index % 4]}">${escapeHtml(initials)}</div>
      <span class="status ${appointment.status}">${statusLabels[appointment.status] || "قيد المراجعة"}</span>
    </div>`;
  }).join("");
}

async function loadDashboardData() {
  try {
    const response = await fetch(`/api/dashboard?date=${dashboardDate}`);
    if (!response.ok) throw new Error("Dashboard data request failed");
    const payload = await response.json();
    document.getElementById("todayAppointmentsCount").textContent = arabicDigits(payload.stats.appointmentsToday);
    document.getElementById("newPatientsCount").textContent = arabicDigits(payload.stats.newPatients);
    document.getElementById("completedExamsCount").textContent = arabicDigits(payload.stats.completedExams);
    document.getElementById("attendanceRate").innerHTML = `${arabicDigits(payload.stats.attendanceRate)}<span class="percent">٪</span>`;
    renderAppointments(payload.appointments);
  } catch (error) {
    console.warn("Dashboard data could not be loaded", error);
  }
}
const titleMap = {
  dashboard: "لوحة التحكم", calendar: "التقويم", appointments: "المواعيد",
  customers: "المرضى", services: "الأقسام والعيادات", team: "الأطباء والطاقم",
  reports: "التقارير", settings: "الإعدادات"
};

function showView(view) {
  navItems.forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  sections.forEach((section) => section.classList.toggle("active-view", section.dataset.section === view));
  pageTitle.textContent = titleMap[view] || titleMap.dashboard;
  trackEvent("view_changed", { view });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

navItems.forEach((item) => item.addEventListener("click", () => showView(item.dataset.view)));
document.querySelectorAll("[data-go-dashboard]").forEach((button) => button.addEventListener("click", () => showView("dashboard")));

const modal = document.getElementById("appointmentModal");
const openModal = () => {
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  trackEvent("appointment_modal_opened", { source: "dashboard" });
  setTimeout(() => modal.querySelector("input").focus(), 100);
};
const closeModal = () => {
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
};
document.getElementById("newAppointment").addEventListener("click", openModal);
document.getElementById("placeholderNew")?.addEventListener("click", openModal);
document.getElementById("closeModal").addEventListener("click", closeModal);
modal.addEventListener("click", (event) => { if (event.target === modal) closeModal(); });
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeModal(); });

const toast = document.getElementById("toast");
function showToast(title = "تمت العملية بنجاح", message = "أضيف الموعد إلى جدولك.") {
  toast.querySelector("b").textContent = title;
  toast.querySelector("small").textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3200);
}
document.getElementById("appointmentForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = event.target.querySelector(".form-submit");
  submitButton.disabled = true;
  try {
    const response = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientName: document.getElementById("patientName").value,
        departmentId: document.getElementById("departmentId").value,
        doctorId: document.getElementById("doctorId").value,
        date: document.getElementById("appointmentDate").value,
        time: document.getElementById("appointmentTime").value
      })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "تعذر حفظ الموعد");
    closeModal();
    showToast("تم حفظ الموعد", "تمت إضافة الموعد إلى جدول اليوم.");
    trackEvent("appointment_created", { appointmentId: payload.appointment.id, source: "appointment_form" });
    event.target.reset();
    document.getElementById("appointmentDate").value = dashboardDate;
    await loadDashboardData();
  } catch (error) {
    showToast("تعذر حفظ الموعد", error.message);
    trackEvent("appointment_create_failed", { reason: error.message });
  } finally {
    submitButton.disabled = false;
  }
});
document.querySelector(".notification-button").addEventListener("click", () => {
  showToast("لا توجد إشعارات جديدة", "كل شيء محدث حتى الآن.");
  trackEvent("notifications_opened");
});
document.getElementById("industryMode").addEventListener("change", (event) => {
  const isMedical = event.target.value === "medical";
  showToast(
    isMedical ? "تم تفعيل القالب الطبي" : "تم تفعيل الوضع المرن",
    isMedical ? "الأقسام والأطباء جاهزون للإدارة." : "يمكنك تخصيص الحقول والخدمات لأي نشاط."
  );
  trackEvent("industry_mode_changed", { mode: event.target.value });
});

const languageSelect = document.getElementById("languageSelect");
const languageNames = {
  ar: "العربية", en: "English", fr: "Français", ur: "اردو", tr: "Türkçe",
  es: "Español", hi: "हिन्दी", bn: "বাংলা", de: "Deutsch", pt: "Português",
  ru: "Русский", zh: "中文", ja: "日本語", ko: "한국어", id: "Bahasa Indonesia"
};
const rtlLanguages = new Set(["ar", "ur"]);
function applyLanguage(language, source = "اللغة المختارة") {
  const code = languageNames[language] ? language : "en";
  document.documentElement.lang = code;
  document.documentElement.dir = rtlLanguages.has(code) ? "rtl" : "ltr";
  languageSelect.value = code;
  showToast(`تم تفعيل ${languageNames[code]}`, `${source} — تم ضبط اتجاه الواجهة تلقائياً.`);
  trackEvent("language_changed", { language: code, direction: document.documentElement.dir, source });
}
languageSelect.addEventListener("change", (event) => applyLanguage(event.target.value));
document.getElementById("detectLanguage").addEventListener("click", () => {
  const browserLanguage = (navigator.language || "ar").toLowerCase().split("-")[0];
  const detected = languageNames[browserLanguage] ? browserLanguage : "en";
  applyLanguage(detected, "اكتشاف لغة المتصفح");
  trackEvent("browser_language_detected", { browserLanguage, appliedLanguage: detected });
});

document.getElementById("prevWeek").addEventListener("click", () => {
  showToast("الأسبوع السابق", "يتم تجهيز مواعيد الأسبوع السابق.");
  trackEvent("week_navigated", { direction: "previous" });
});
document.getElementById("nextWeek").addEventListener("click", () => {
  showToast("الأسبوع التالي", "يتم تجهيز مواعيد الأسبوع التالي.");
  trackEvent("week_navigated", { direction: "next" });
});
document.querySelector(".view-all").addEventListener("click", () => showView("appointments"));
loadDashboardData();
trackEvent("page_loaded", {
  view: "dashboard",
  language: document.documentElement.lang,
  mode: document.getElementById("industryMode")?.value
});