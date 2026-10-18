const state = {
  me: null,
  caps: {},
  view: "overview",
  pages: { ws: 0, sub: 0, audit: 0 },
  limit: 20,
  pendingConfirm: null
};

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function json(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

function setView(view) {
  state.view = view;
  document.querySelectorAll(".view").forEach((el) => el.classList.toggle("on", el.id === `view-${view}`));
  document.querySelectorAll("#nav button").forEach((btn) => btn.classList.toggle("on", btn.dataset.view === view));
}

function money(value) {
  return `${Number(value || 0).toFixed(2)} USD`;
}

function pill(status) {
  return `<span class="pill ${esc(status || "")}">${esc(status || "—")}</span>`;
}

async function requestConfirmation({ action, targetId, challenge, title, text }) {
  const modal = document.getElementById("confirmModal");
  const challengeInput = document.getElementById("confirmChallenge");
  const errorEl = document.getElementById("confirmError");
  document.getElementById("confirmTitle").textContent = title || "تأكيد العملية";
  document.getElementById("confirmText").textContent = text || `اكتب «${challenge}» للتأكيد`;
  challengeInput.value = "";
  errorEl.textContent = "";
  modal.classList.add("on");

  return new Promise((resolve) => {
    state.pendingConfirm = { action, targetId, challenge, resolve };
  });
}

async function finalizeConfirmation(accepted) {
  const pending = state.pendingConfirm;
  const modal = document.getElementById("confirmModal");
  const errorEl = document.getElementById("confirmError");
  if (!pending) return;
  if (!accepted) {
    modal.classList.remove("on");
    pending.resolve(null);
    state.pendingConfirm = null;
    return;
  }
  const typed = document.getElementById("confirmChallenge").value.trim();
  if (typed !== pending.challenge) {
    errorEl.textContent = "نص التأكيد غير مطابق";
    return;
  }
  const created = await json("/api/admin/confirmations", {
    method: "POST",
    body: JSON.stringify({ action: pending.action, targetId: pending.targetId, challenge: pending.challenge })
  });
  if (!created.response.ok) {
    errorEl.textContent = created.data.error || "تعذر إنشاء رمز التأكيد";
    return;
  }
  modal.classList.remove("on");
  pending.resolve({
    confirmToken: created.data.confirmation.id,
    challenge: pending.challenge
  });
  state.pendingConfirm = null;
}

async function loadOverview() {
  const overview = await json("/api/admin/overview");
  if (overview.response.status === 401) {
    window.location.href = "/auth.html?next=/admin.html";
    return false;
  }
  if (overview.response.status === 503 || overview.response.status === 403) {
    document.getElementById("bootError").textContent =
      overview.data.error || "لا تملك صلاحية مسؤول المنصة أو قاعدة البيانات غير مفعّلة";
    return false;
  }
  if (!overview.response.ok) {
    document.getElementById("bootError").textContent = overview.data.error || "تعذر تحميل لوحة الإدارة";
    return false;
  }

  state.me = overview.data.admin;
  state.caps = overview.data.admin.capabilities || {};
  document.getElementById("roleLabel").textContent = `الدور: ${state.me.platformRole || "—"}`;
  document.getElementById("pendingChip").textContent = `معلق: ${overview.data.metrics.pendingSubscriptions || 0}`;

  const metrics = overview.data.metrics;
  const planMap = Object.fromEntries((metrics.subscriptions || []).map((row) => [row.plan_key, row.count]));
  document.getElementById("metrics").innerHTML = [
    ["المستخدمون النشطون", metrics.users],
    ["المساحات النشطة", metrics.workspaces],
    ["MRR تقديري", money(metrics.estimatedMrr)],
    ["أحداث اليوم", metrics.auditToday],
    ["Free", planMap.free || 0],
    ["Pro", planMap.pro || 0],
    ["Ultimate", planMap.ultimate || 0],
    ["طلبات معلّقة", metrics.pendingSubscriptions]
  ]
    .map(([label, value]) => `<article class="metric"><span>${esc(label)}</span><strong>${esc(value)}</strong></article>`)
    .join("");

  document.getElementById("actionRequired").innerHTML =
    metrics.pendingSubscriptions > 0
      ? `<p>يوجد <b>${metrics.pendingSubscriptions}</b> طلب اشتراك بانتظار المراجعة. انتقل إلى تبويب الاشتراكات.</p>`
      : `<p class="muted">لا عناصر عاجلة حالياً.</p>`;
  return true;
}

async function loadWorkspaces() {
  const q = document.getElementById("wsQ").value.trim();
  const status = document.getElementById("wsStatus").value;
  const offset = state.pages.ws * state.limit;
  const url = `/api/admin/workspaces?limit=${state.limit}&offset=${offset}&q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}`;
  const result = await json(url);
  if (!result.response.ok) {
    document.getElementById("wsBody").innerHTML = `<tr><td colspan="6">${esc(result.data.error || "خطأ")}</td></tr>`;
    return;
  }
  document.getElementById("wsBody").innerHTML = (result.data.workspaces || [])
    .map((row) => {
      const canKill = state.caps.killSwitch;
      const next = row.status === "suspended" ? "active" : "suspended";
      const label = next === "suspended" ? "تعليق" : "تفعيل";
      return `<tr>
        <td>${esc(row.name)}</td>
        <td>${esc(row.slug)}</td>
        <td>${esc(row.plan_key)}</td>
        <td>${pill(row.status)}</td>
        <td>${esc(row.owner_email)}</td>
        <td>${canKill ? `<button class="btn danger" data-ws-status="${esc(row.id)}" data-next="${next}">${label}</button>` : ""}</td>
      </tr>`;
    })
    .join("") || `<tr><td colspan="6" class="muted">لا نتائج</td></tr>`;
  document.getElementById("wsPage").textContent = `صفحة ${state.pages.ws + 1} · الإجمالي ${result.data.paging?.total || 0}`;
}

async function loadSubscriptions() {
  const q = document.getElementById("subQ").value.trim();
  const status = document.getElementById("subStatus").value;
  const offset = state.pages.sub * state.limit;
  const result = await json(
    `/api/admin/subscriptions?limit=${state.limit}&offset=${offset}&q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}`
  );
  if (!result.response.ok) {
    document.getElementById("subscriptions").innerHTML = `<p class="error">${esc(result.data.error || "خطأ")}</p>`;
    return;
  }
  const canFinance = state.caps.subscriptions;
  document.getElementById("subscriptions").innerHTML = `
    <div class="table-wrap"><table>
      <thead><tr><th>المساحة</th><th>الخطة</th><th>المزوّد</th><th>الحالة</th><th>المالك</th><th></th></tr></thead>
      <tbody>
        ${(result.data.subscriptions || [])
          .map((row) => {
            const actions =
              canFinance && row.status === "pending"
                ? `<button class="btn" data-sub-approve="${esc(row.id)}">موافقة</button>
                   <button class="btn danger" data-sub-reject="${esc(row.id)}">رفض</button>`
                : "";
            return `<tr>
              <td>${esc(row.workspace_name)}</td>
              <td>${esc(row.plan_key)}</td>
              <td>${esc(row.provider)}</td>
              <td>${pill(row.status)}</td>
              <td>${esc(row.owner_email)}</td>
              <td>${actions}</td>
            </tr>`;
          })
          .join("") || `<tr><td colspan="6" class="muted">لا اشتراكات</td></tr>`}
      </tbody>
    </table></div>`;
  document.getElementById("subPage").textContent = `صفحة ${state.pages.sub + 1} · الإجمالي ${result.data.paging?.total || 0}`;
}

async function loadPlans() {
  const result = await json("/api/admin/plans");
  if (!result.response.ok) {
    document.getElementById("plans").innerHTML = `<p class="error">${esc(result.data.error || "خطأ")}</p>`;
    return;
  }
  const canEdit = state.caps.plans;
  document.getElementById("plans").innerHTML = (result.data.plans || [])
    .map(
      (plan) => `<div class="plan-row" style="display:grid;grid-template-columns:1fr 120px 90px;gap:8px;align-items:center;padding:12px 0;border-bottom:1px solid var(--line)">
        <div><strong>${esc(plan.display_name)}</strong><div class="muted">${esc(plan.description || "")}</div></div>
        <input type="number" min="0" step="0.01" value="${esc(plan.price_usd)}" data-plan-price="${esc(plan.plan_key)}" ${canEdit ? "" : "disabled"} />
        ${canEdit ? `<button class="btn" data-plan-save="${esc(plan.plan_key)}">حفظ</button>` : "<span></span>"}
      </div>`
    )
    .join("");
}

async function loadFinance() {
  if (!state.caps.finance) {
    document.getElementById("financeMetrics").innerHTML = `<p class="muted">هذه الوحدة للماليين ومسؤولي المنصة فقط.</p>`;
    return;
  }
  const overview = await json("/api/admin/finance/overview");
  if (overview.response.ok) {
    const f = overview.data.finance;
    document.getElementById("financeMetrics").innerHTML = [
      ["مدفوعات واردة", money(f.paidInTotal)],
      ["معاملات معلّقة", f.pendingTransactions],
      ["تسويات مدفوعة", money(f.settlementsPaid)],
      ["MRR تقديري", money(f.estimatedMrr)]
    ]
      .map(([label, value]) => `<article class="metric"><span>${esc(label)}</span><strong>${esc(value)}</strong></article>`)
      .join("");
  }
  const tx = await json("/api/admin/finance/transactions?limit=30");
  document.getElementById("txBody").innerHTML = (tx.data.transactions || [])
    .map(
      (row) => `<tr>
        <td>${esc(row.id)}</td>
        <td>${esc(row.workspace_name || row.workspace_id)}</td>
        <td>${esc(row.direction)}</td>
        <td>${esc(row.amount)} ${esc(row.currency)}</td>
        <td>${pill(row.status)}</td>
        <td>${esc(row.occurred_at)}</td>
      </tr>`
    )
    .join("") || `<tr><td colspan="6" class="muted">لا معاملات</td></tr>`;

  const settlements = await json("/api/admin/finance/settlements?limit=20");
  document.getElementById("settlements").innerHTML = (settlements.data.settlements || [])
    .map(
      (row) => `<div class="audit-item">
        <strong>${esc(row.amount)} ${esc(row.currency)}</strong> · ${pill(row.status)}
        <div class="muted">${esc(row.provider)} · ${esc(row.created_by_email || "")}</div>
      </div>`
    )
    .join("") || `<p class="muted">لا تسويات</p>`;
}

async function loadUsers() {
  const q = document.getElementById("userQ").value.trim();
  const result = await json(`/api/admin/users?limit=50&q=${encodeURIComponent(q)}`);
  if (!result.response.ok) {
    document.getElementById("userBody").innerHTML = `<tr><td colspan="5">${esc(result.data.error || "خطأ")}</td></tr>`;
    return;
  }
  const canAssign = state.caps.assignRoles;
  document.getElementById("userBody").innerHTML = (result.data.users || [])
    .map((row) => {
      const role = row.platform_role || (row.is_platform_admin ? "super_admin" : "");
      return `<tr>
        <td>${esc(row.email)}</td>
        <td>${esc(row.display_name || "")}</td>
        <td>${esc(role || "—")}</td>
        <td>${pill(row.status)}</td>
        <td>${
          canAssign
            ? `<select data-user-role="${esc(row.id)}">
                <option value="">بدون دور منصة</option>
                <option value="super_admin" ${role === "super_admin" ? "selected" : ""}>super_admin</option>
                <option value="financial_admin" ${role === "financial_admin" ? "selected" : ""}>financial_admin</option>
                <option value="support_admin" ${role === "support_admin" ? "selected" : ""}>support_admin</option>
              </select>
              <button class="btn danger" data-user-save="${esc(row.id)}">حفظ</button>`
            : ""
        }</td>
      </tr>`;
    })
    .join("");
}

async function loadAudit() {
  const q = document.getElementById("auditQ").value.trim();
  const offset = state.pages.audit * state.limit;
  const result = await json(`/api/admin/audit?limit=${state.limit}&offset=${offset}&q=${encodeURIComponent(q)}`);
  if (!result.response.ok) {
    document.getElementById("audit").innerHTML = `<p class="error">${esc(result.data.error || "خطأ")}</p>`;
    return;
  }
  document.getElementById("audit").innerHTML = (result.data.events || [])
    .map(
      (row) => `<div class="audit-item">
        <strong>${esc(row.action)}</strong> · ${esc(row.actor_email || "نظام")}
        <div class="muted">${esc(row.target_type || "")} / ${esc(row.target_id || "")} · IP ${esc(row.ip_address || "—")} · ${esc(row.created_at)}</div>
        <code>old: ${esc(JSON.stringify(row.old_value || null))} | new: ${esc(JSON.stringify(row.new_value || null))}</code>
      </div>`
    )
    .join("") || `<p class="muted">لا أحداث</p>`;
  document.getElementById("auditPage").textContent = `صفحة ${state.pages.audit + 1} · الإجمالي ${result.data.paging?.total || 0}`;
}

async function refreshView() {
  if (state.view === "overview") await loadOverview();
  if (state.view === "workspaces") await loadWorkspaces();
  if (state.view === "subscriptions") await loadSubscriptions();
  if (state.view === "plans") await loadPlans();
  if (state.view === "finance") await loadFinance();
  if (state.view === "users") await loadUsers();
  if (state.view === "audit") await loadAudit();
}

function bindActions() {
  document.getElementById("nav").addEventListener("click", async (event) => {
    const btn = event.target.closest("button[data-view]");
    if (!btn) return;
    setView(btn.dataset.view);
    await refreshView();
  });

  document.getElementById("themeToggle").addEventListener("click", () => {
    const html = document.documentElement;
    const next = html.getAttribute("data-theme") === "dark" ? "light" : "dark";
    html.setAttribute("data-theme", next);
    document.getElementById("themeToggle").textContent = next === "dark" ? "وضع فاتح" : "وضع داكن";
    localStorage.setItem("maw3ed-admin-theme", next);
  });

  document.getElementById("confirmCancel").addEventListener("click", () => finalizeConfirmation(false));
  document.getElementById("confirmOk").addEventListener("click", () => finalizeConfirmation(true));

  document.getElementById("wsReload").addEventListener("click", () => {
    state.pages.ws = 0;
    loadWorkspaces();
  });
  document.getElementById("subReload").addEventListener("click", () => {
    state.pages.sub = 0;
    loadSubscriptions();
  });
  document.getElementById("userReload").addEventListener("click", loadUsers);
  document.getElementById("auditReload").addEventListener("click", () => {
    state.pages.audit = 0;
    loadAudit();
  });
  document.getElementById("txReload")?.addEventListener("click", loadFinance);

  document.body.addEventListener("click", async (event) => {
    const pageBtn = event.target.closest("[data-page]");
    if (pageBtn) {
      const key = pageBtn.dataset.page;
      const dir = Number(pageBtn.dataset.dir || 0);
      state.pages[key] = Math.max(0, (state.pages[key] || 0) + dir);
      if (key === "ws") await loadWorkspaces();
      if (key === "sub") await loadSubscriptions();
      if (key === "audit") await loadAudit();
      return;
    }

    const approve = event.target.closest("[data-sub-approve]");
    if (approve) {
      const id = approve.dataset.subApprove;
      const result = await json(`/api/admin/subscriptions/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "active" })
      });
      document.getElementById("bootError").textContent = result.response.ok ? "" : result.data.error || "فشل الاعتماد";
      await loadSubscriptions();
      await loadOverview();
      return;
    }

    const reject = event.target.closest("[data-sub-reject]");
    if (reject) {
      const id = reject.dataset.subReject;
      const confirm = await requestConfirmation({
        action: "subscription_rejected",
        targetId: id,
        challenge: "CONFIRM",
        title: "رفض الاشتراك",
        text: "اكتب CONFIRM لرفض طلب الاشتراك."
      });
      if (!confirm) return;
      const result = await json(`/api/admin/subscriptions/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "rejected", ...confirm })
      });
      document.getElementById("bootError").textContent = result.response.ok ? "" : result.data.error || "فشل الرفض";
      await loadSubscriptions();
      await loadOverview();
      return;
    }

    const planSave = event.target.closest("[data-plan-save]");
    if (planSave) {
      const planKey = planSave.dataset.planSave;
      const input = document.querySelector(`[data-plan-price="${planKey}"]`);
      const confirm = await requestConfirmation({
        action: "plan_price_update",
        targetId: planKey,
        challenge: planKey,
        title: "تغيير سعر الخطة",
        text: `اكتب «${planKey}» لتأكيد تغيير السعر.`
      });
      if (!confirm) return;
      const result = await json(`/api/admin/plans/${planKey}`, {
        method: "PATCH",
        body: JSON.stringify({ priceUsd: Number(input.value), ...confirm })
      });
      document.getElementById("planNotice").textContent = result.response.ok
        ? "تم حفظ السعر"
        : result.data.error || "تعذر الحفظ";
      await loadPlans();
      return;
    }

    const wsStatus = event.target.closest("[data-ws-status]");
    if (wsStatus) {
      const id = wsStatus.dataset.wsStatus;
      const next = wsStatus.dataset.next;
      const confirm = await requestConfirmation({
        action: "workspace_status",
        targetId: id,
        challenge: "CONFIRM",
        title: next === "suspended" ? "تعليق مساحة العمل" : "إعادة تفعيل المساحة",
        text: "اكتب CONFIRM لتأكيد تغيير حالة المساحة."
      });
      if (!confirm) return;
      const result = await json(`/api/admin/workspaces/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: next, ...confirm })
      });
      document.getElementById("bootError").textContent = result.response.ok ? "" : result.data.error || "فشل التحديث";
      await loadWorkspaces();
      return;
    }

    const userSave = event.target.closest("[data-user-save]");
    if (userSave) {
      const id = userSave.dataset.userSave;
      const select = document.querySelector(`[data-user-role="${id}"]`);
      const platformRole = select.value || null;
      const confirm = await requestConfirmation({
        action: "user_role_update",
        targetId: id,
        challenge: "CONFIRM",
        title: "تغيير دور المنصة",
        text: "اكتب CONFIRM لتأكيد تعيين/إزالة دور المنصة."
      });
      if (!confirm) return;
      const result = await json(`/api/admin/users/${id}/role`, {
        method: "PATCH",
        body: JSON.stringify({ platformRole, ...confirm })
      });
      document.getElementById("bootError").textContent = result.response.ok ? "" : result.data.error || "فشل حفظ الدور";
      await loadUsers();
      return;
    }

    if (event.target.id === "addTxBtn") {
      const workspaceId = window.prompt("معرّف مساحة العمل (workspace id)");
      if (!workspaceId) return;
      const amount = Number(window.prompt("المبلغ", "0"));
      const result = await json("/api/admin/finance/transactions", {
        method: "POST",
        body: JSON.stringify({ workspaceId, amount, direction: "adjustment", status: "paid" })
      });
      document.getElementById("bootError").textContent = result.response.ok ? "" : result.data.error || "فشل القيد";
      await loadFinance();
      return;
    }

    if (event.target.id === "addSettleBtn") {
      const amount = Number(window.prompt("مبلغ التسوية", "0"));
      const result = await json("/api/admin/finance/settlements", {
        method: "POST",
        body: JSON.stringify({ amount, status: "paid", provider: "manual" })
      });
      document.getElementById("bootError").textContent = result.response.ok ? "" : result.data.error || "فشل التسوية";
      await loadFinance();
    }
  });

  document.getElementById("globalSearch").addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    const q = event.target.value.trim();
    document.getElementById("wsQ").value = q;
    document.getElementById("subQ").value = q;
    document.getElementById("auditQ").value = q;
    document.getElementById("userQ").value = q;
    setView("workspaces");
    state.pages.ws = 0;
    await loadWorkspaces();
  });
}

async function boot() {
  const theme = localStorage.getItem("maw3ed-admin-theme") || "light";
  document.documentElement.setAttribute("data-theme", theme);
  document.getElementById("themeToggle").textContent = theme === "dark" ? "وضع فاتح" : "وضع داكن";
  bindActions();
  const ok = await loadOverview();
  if (!ok) return;
  await Promise.all([loadWorkspaces(), loadSubscriptions(), loadPlans(), loadAudit()]);
}

boot();
