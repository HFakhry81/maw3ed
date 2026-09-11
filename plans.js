const featureLabels = { public_booking: "صفحة حجز عامة", basic_dashboard: "لوحة تحكم أساسية", email_verification: "تحقق البريد", analytics: "تحليلات متقدمة", reminders: "تذكيرات", custom_branding: "هوية مخصصة", api_access: "وصول API", advanced_roles: "صلاحيات متقدمة", priority_support: "دعم أولوية" };
const labels = { free: "البداية", pro: "الأكثر اختياراً", ultimate: "للمؤسسات" };
const money = (value) => Number(value) === 0 ? "مجاني" : `$${Number(value).toFixed(2)}`;
function render(plans) {
  document.getElementById("plans").innerHTML = plans.map((plan) => {
    const features = Object.entries(plan.features || {}).filter(([, enabled]) => enabled).map(([key]) => `<li>${featureLabels[key] || key}</li>`).join("");
    return `<article class="plan ${plan.plan_key === "pro" ? "featured" : ""} ${plan.plan_key === "free" ? "free" : ""}">
      <span class="badge">${labels[plan.plan_key] || plan.display_name}</span><h2>${plan.display_name}</h2>
      <div class="price">${money(plan.price_usd)} <small>${Number(plan.price_usd) ? "/ شهرياً" : ""}</small></div>
      <p class="desc">${plan.description}</p><ul class="features">${features}</ul>
      <button class="cta" data-plan="${plan.plan_key}">${plan.plan_key === "free" ? "ابدأ مجاناً" : "اطلب الاشتراك"}</button>
    </article>`;
  }).join("");
  document.querySelectorAll("[data-plan]").forEach((button) => button.addEventListener("click", () => requestPlan(button.dataset.plan)));
}
async function requestPlan(planKey) {
  const note = document.getElementById("planNote");
  if (planKey === "free") {
    note.textContent = "لتفعيل الخطة المجانية، سجّل الدخول أولاً.";
  } else {
    note.textContent = "سيتم إرسال طلبك إلى مسؤول المنصة بعد تسجيل الدخول.";
  }
  const account = await fetch("/api/account").then((response) => response.json());
  if (!account.ok) return window.location.href = `/auth.html?next=/plans.html`;
  const response = await fetch("/api/billing/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planKey }) });
  const payload = await response.json();
  note.textContent = response.ok ? payload.request.message || "تم تفعيل الخطة." : payload.error || "تعذر تنفيذ الطلب.";
}
fetch("/api/plans").then((response) => response.json()).then((payload) => render(payload.plans || [])).catch(() => { document.getElementById("planNote").textContent = "تعذر تحميل الخطط."; });