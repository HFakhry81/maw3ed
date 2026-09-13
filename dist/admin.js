const json = (url, options) => fetch(url, options).then(async (response) => ({ response, data: await response.json() }));
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]));
async function load() {
  const overview = await json("/api/admin/overview");
  if (overview.response.status === 401) return window.location.href = "/auth.html?next=/admin.html";
  if (!overview.response.ok) { document.body.innerHTML = "<p>لا تملك صلاحية مسؤول المنصة.</p>"; return; }
  const [workspaces, subscriptions, plans, audit] = await Promise.all(["/api/admin/workspaces", "/api/admin/subscriptions", "/api/admin/plans", "/api/admin/audit"].map((url) => json(url)));
  const metrics = overview.data.metrics;
  document.getElementById("metrics").innerHTML = `<article class="metric"><span>الحسابات النشطة</span><strong>${metrics.users}</strong></article><article class="metric"><span>مساحات العمل</span><strong>${metrics.workspaces}</strong></article>${(metrics.subscriptions || []).map((item) => `<article class="metric"><span>اشتراكات ${esc(item.plan_key)}</span><strong>${item.count}</strong></article>`).join("")}`;
  document.getElementById("subscriptions").innerHTML = subscriptions.data.subscriptions?.length ? `<table class="table"><thead><tr><th>المؤسسة</th><th>الخطة</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody>${subscriptions.data.subscriptions.map((item) => `<tr><td>${esc(item.workspace_name)}<br><small>${esc(item.owner_email)}</small></td><td>${esc(item.plan_key)}</td><td><span class="pill ${item.status === "pending" ? "pending" : ""}">${esc(item.status)}</span></td><td>${item.status === "pending" ? `<button class="btn" data-approve="${item.id}">موافقة</button> <button class="btn reject" data-reject="${item.id}">رفض</button>` : ""}</td></tr>`).join("")}</tbody></table>` : `<div class="empty">لا توجد طلبات اشتراك بعد.</div>`;
  document.getElementById("plans").innerHTML = plans.data.plans.map((plan) => `<div class="plan-row"><strong>${esc(plan.display_name)}</strong><input type="number" min="0" step="0.01" value="${Number(plan.price_usd).toFixed(2)}" data-price="${plan.plan_key}" /><button class="btn" data-save-plan="${plan.plan_key}">حفظ</button></div>`).join("");
  document.getElementById("workspaces").innerHTML = workspaces.data.workspaces?.length ? `<table class="table"><thead><tr><th>المؤسسة</th><th>النشاط</th><th>المالك</th><th>الخطة</th></tr></thead><tbody>${workspaces.data.workspaces.map((item) => `<tr><td>${esc(item.name)}</td><td>${esc(item.activity_type)}</td><td>${esc(item.owner_email)}</td><td><span class="pill">${esc(item.plan_key)}</span></td></tr>`).join("")}</tbody></table>` : `<div class="empty">لا توجد مساحات عمل بعد.</div>`;
  document.getElementById("audit").innerHTML = audit.data.events?.length ? audit.data.events.map((item) => `<p><strong>${esc(item.action)}</strong> · ${esc(item.actor_email || "system")}<br>${new Date(item.created_at).toLocaleString("ar-EG")}</p>`).join("") : `<div class="empty">لا توجد أحداث بعد.</div>`;
  bindActions();
}
async function bindActions() {
  document.querySelectorAll("[data-approve],[data-reject]").forEach((button) => button.addEventListener("click", async () => {
    const id = button.dataset.approve || button.dataset.reject;
    const status = button.dataset.approve ? "active" : "rejected";
    await json(`/api/admin/subscriptions/${id}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({status}) });
    load();
  }));
  document.querySelectorAll("[data-save-plan]").forEach((button) => button.addEventListener("click", async () => {
    const planKey = button.dataset.savePlan;
    const priceUsd = document.querySelector(`[data-price="${planKey}"]`).value;
    const result = await json(`/api/admin/plans/${planKey}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({priceUsd}) });
    document.getElementById("planNotice").textContent = result.response.ok ? "تم تحديث السعر." : result.data.error || "تعذر تحديث السعر.";
    load();
  }));
}
load().catch((error) => { console.error(error); document.body.innerHTML = "<p>تعذر تحميل لوحة مسؤولي المنصة.</p>"; });