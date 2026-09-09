const navItems = document.querySelectorAll(".nav-item");
const sections = document.querySelectorAll(".view-section");
const pageTitle = document.getElementById("pageTitle");
const titleMap = {
  dashboard: "لوحة التحكم", calendar: "التقويم", appointments: "المواعيد",
  customers: "العملاء", services: "الخدمات", team: "فريق العمل",
  reports: "التقارير", settings: "الإعدادات"
};

function showView(view) {
  navItems.forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  sections.forEach((section) => section.classList.toggle("active-view", section.dataset.section === view));
  pageTitle.textContent = titleMap[view] || titleMap.dashboard;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

navItems.forEach((item) => item.addEventListener("click", () => showView(item.dataset.view)));
document.querySelectorAll("[data-go-dashboard]").forEach((button) => button.addEventListener("click", () => showView("dashboard")));

const modal = document.getElementById("appointmentModal");
const openModal = () => {
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
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
document.getElementById("appointmentForm").addEventListener("submit", (event) => {
  event.preventDefault();
  closeModal();
  showToast();
  event.target.reset();
});
document.querySelector(".notification-button").addEventListener("click", () => showToast("لا توجد إشعارات جديدة", "كل شيء محدث حتى الآن."));

document.getElementById("prevWeek").addEventListener("click", () => showToast("الأسبوع السابق", "يتم تجهيز مواعيد الأسبوع السابق."));
document.getElementById("nextWeek").addEventListener("click", () => showToast("الأسبوع التالي", "يتم تجهيز مواعيد الأسبوع التالي."));
document.querySelector(".view-all").addEventListener("click", () => showView("appointments"));