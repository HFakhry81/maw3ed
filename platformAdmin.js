/**
 * Platform Super Admin governance helpers — RBAC, audit, confirmations, finance.
 */
const crypto = require("crypto");

const PLATFORM_ROLES = ["super_admin", "financial_admin", "support_admin"];

const ROLE_CAPABILITIES = {
  read: ["super_admin", "financial_admin", "support_admin"],
  finance: ["super_admin", "financial_admin"],
  subscriptions: ["super_admin", "financial_admin"],
  plans: ["super_admin", "financial_admin"],
  killSwitch: ["super_admin"],
  assignRoles: ["super_admin"],
  support: ["super_admin", "support_admin"]
};

function createId(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}

function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "local")
    .split(",")[0]
    .trim();
}

function resolvePlatformRole(user) {
  if (user?.platform_role && PLATFORM_ROLES.includes(user.platform_role)) return user.platform_role;
  if (user?.is_platform_admin) return "super_admin";
  return null;
}

function capabilitiesForRole(role) {
  const caps = {};
  for (const [key, roles] of Object.entries(ROLE_CAPABILITIES)) {
    caps[key] = Boolean(role && roles.includes(role));
  }
  return caps;
}

function parsePaging(requestUrl, defaults = { limit: 25, offset: 0 }) {
  const limit = Math.min(100, Math.max(1, Number(requestUrl.searchParams.get("limit") || defaults.limit) || defaults.limit));
  const offset = Math.max(0, Number(requestUrl.searchParams.get("offset") || defaults.offset) || 0);
  const q = String(requestUrl.searchParams.get("q") || "").trim();
  const status = String(requestUrl.searchParams.get("status") || "").trim();
  const planKey = String(requestUrl.searchParams.get("plan_key") || requestUrl.searchParams.get("planKey") || "").trim();
  return { limit, offset, q, status, planKey };
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toCsv(rows, columns) {
  const header = columns.map((col) => csvEscape(col.label)).join(",");
  const lines = rows.map((row) => columns.map((col) => csvEscape(typeof col.value === "function" ? col.value(row) : row[col.key])).join(","));
  return `${header}\n${lines.join("\n")}\n`;
}

function createPlatformAdmin({ query, databaseConfigured, sendJson }) {
  function assertDatabase() {
    if (!databaseConfigured) {
      const error = new Error("لوحة إدارة المنصة تتطلب Postgres (MAW3ED_STORAGE=postgres و DATABASE_URL)");
      error.statusCode = 503;
      throw error;
    }
  }

  async function writeAuditLog({
    adminId = null,
    action,
    targetType = null,
    targetId = null,
    oldValue = null,
    newValue = null,
    ip = null,
    details = {}
  }) {
    assertDatabase();
    await query(
      `INSERT INTO platform_audit_events
        (id, actor_user_id, action, target_type, target_id, details, old_value, new_value, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9)`,
      [
        createId("audit"),
        adminId || null,
        action,
        targetType || null,
        targetId || null,
        JSON.stringify(details || {}),
        oldValue == null ? null : JSON.stringify(oldValue),
        newValue == null ? null : JSON.stringify(newValue),
        ip || null
      ]
    );
  }

  function bindRequirePlatformRole(requireAppUser) {
    return async function requirePlatformRole(req, allowedRoles = PLATFORM_ROLES) {
      assertDatabase();
      const user = await requireAppUser(req);
      if (user.status !== "active") {
        const error = new Error("Platform administrator access is required");
        error.statusCode = 403;
        throw error;
      }
      let role = resolvePlatformRole(user);
      // First-user / legacy boolean without role column populated yet
      if (!role && user.is_platform_admin) {
        role = "super_admin";
        try {
          await query(
            `UPDATE app_users SET platform_role = 'super_admin', is_platform_admin = TRUE, updated_at = NOW()
             WHERE id = $1 AND platform_role IS NULL`,
            [user.id]
          );
          user.platform_role = "super_admin";
        } catch {
          /* column may not exist yet before migrate */
        }
      }
      if (!role || !allowedRoles.includes(role)) {
        const error = new Error("Platform role is not permitted for this action");
        error.statusCode = 403;
        throw error;
      }
      user.platform_role = role;
      user.capabilities = capabilitiesForRole(role);
      return user;
    };
  }

  async function createConfirmation(admin, { action, targetId, challenge }) {
    assertDatabase();
    const cleanAction = String(action || "").trim();
    const cleanTarget = String(targetId || "").trim();
    const cleanChallenge = String(challenge || "CONFIRM").trim() || "CONFIRM";
    if (!cleanAction || !cleanTarget) {
      const error = new Error("action and targetId are required");
      error.statusCode = 400;
      throw error;
    }
    await query(`DELETE FROM admin_action_confirmations WHERE expires_at < NOW() OR consumed_at IS NOT NULL`);
    const id = createId("confirm");
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    await query(
      `INSERT INTO admin_action_confirmations (id, admin_id, action, target_id, challenge, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, admin.id, cleanAction, cleanTarget, cleanChallenge, expiresAt]
    );
    return { id, action: cleanAction, targetId: cleanTarget, challenge: cleanChallenge, expiresAt };
  }

  async function consumeConfirmation(admin, { confirmToken, action, targetId, challenge }) {
    assertDatabase();
    const token = String(confirmToken || "").trim();
    if (!token) {
      const error = new Error("confirmToken مطلوب لتأكيد العملية الحساسة");
      error.statusCode = 400;
      error.code = "confirm_required";
      throw error;
    }
    const row = (
      await query(
        `SELECT * FROM admin_action_confirmations
         WHERE id = $1 AND admin_id = $2 AND consumed_at IS NULL AND expires_at > NOW()`,
        [token, admin.id]
      )
    ).rows[0];
    if (!row) {
      const error = new Error("رمز التأكيد غير صالح أو منتهٍ");
      error.statusCode = 409;
      error.code = "confirm_invalid";
      throw error;
    }
    if (row.action !== action || row.target_id !== String(targetId)) {
      const error = new Error("رمز التأكيد لا يطابق العملية المطلوبة");
      error.statusCode = 409;
      error.code = "confirm_mismatch";
      throw error;
    }
    if (challenge != null && String(challenge).trim() !== row.challenge) {
      const error = new Error("نص التأكيد غير مطابق");
      error.statusCode = 400;
      error.code = "challenge_mismatch";
      throw error;
    }
    await query(`UPDATE admin_action_confirmations SET consumed_at = NOW() WHERE id = $1`, [token]);
    return row;
  }

  async function recordSubscriptionActivation(subscription, { provider = "manual" } = {}) {
    assertDatabase();
    const plan = (
      await query(`SELECT plan_key, price_usd, billing_period_days FROM plan_catalog WHERE plan_key = $1`, [
        subscription.plan_key
      ])
    ).rows[0];
    const amount = Number(plan?.price_usd || subscription.price_usd_snapshot || 0);
    await query(
      `UPDATE workspace_subscriptions
       SET status = 'active',
           activated_at = COALESCE(activated_at, NOW()),
           cancelled_at = NULL,
           price_usd_snapshot = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [subscription.id, amount]
    );
    if (amount > 0) {
      const txId = createId("btx");
      await query(
        `INSERT INTO billing_transactions
          (id, workspace_id, subscription_id, plan_key, provider, direction, amount, currency, status, details)
         VALUES ($1, $2, $3, $4, $5, 'in', $6, 'usd', 'paid', $7::jsonb)`,
        [
          txId,
          subscription.workspace_id,
          subscription.id,
          subscription.plan_key,
          provider,
          amount,
          JSON.stringify({ source: "subscription_activation" })
        ]
      );
      const invoiceId = createId("inv");
      const periodDays = Number(plan?.billing_period_days || 30);
      await query(
        `INSERT INTO subscription_invoices
          (id, workspace_id, subscription_id, plan_key, period_start, period_end,
           amount_due, amount_paid, currency, status, provider)
         VALUES ($1, $2, $3, $4, NOW(), NOW() + ($5 || ' days')::interval, $6, $6, 'usd', 'paid', $7)`,
        [invoiceId, subscription.workspace_id, subscription.id, subscription.plan_key, periodDays, amount, provider]
      );
    }
  }

  async function getWorkspaceStatus(workspaceId) {
    if (!databaseConfigured) return "active";
    const result = await query(`SELECT status FROM workspaces WHERE id = $1 LIMIT 1`, [workspaceId]);
    return result.rows[0]?.status || null;
  }

  async function assertWorkspaceNotSuspended(workspaceId) {
    if (!workspaceId || workspaceId === "local-default") return;
    if (!databaseConfigured) return;
    const status = await getWorkspaceStatus(workspaceId);
    if (status === "suspended") {
      const error = new Error("مساحة العمل معلّقة من إدارة المنصة");
      error.statusCode = 403;
      error.code = "workspace_suspended";
      throw error;
    }
  }

  return {
    PLATFORM_ROLES,
    ROLE_CAPABILITIES,
    createId,
    clientIp,
    resolvePlatformRole,
    capabilitiesForRole,
    parsePaging,
    toCsv,
    csvEscape,
    assertDatabase,
    writeAuditLog,
    bindRequirePlatformRole,
    createConfirmation,
    consumeConfirmation,
    recordSubscriptionActivation,
    getWorkspaceStatus,
    assertWorkspaceNotSuspended
  };
}

module.exports = {
  PLATFORM_ROLES,
  ROLE_CAPABILITIES,
  createPlatformAdmin,
  resolvePlatformRole,
  capabilitiesForRole,
  clientIp,
  parsePaging,
  toCsv
};
