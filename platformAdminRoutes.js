/**
 * HTTP handlers for /api/admin/* platform console.
 */
function createAdminRouter(deps) {
  const {
    query,
    listPlans,
    requireAppUser,
    platformAdmin,
    sendJson,
    parseJsonBody,
    whopRequest
  } = deps;

  const {
    ROLE_CAPABILITIES,
    PLATFORM_ROLES,
    clientIp,
    parsePaging,
    toCsv,
    capabilitiesForRole,
    resolvePlatformRole,
    writeAuditLog,
    bindRequirePlatformRole,
    createConfirmation,
    consumeConfirmation,
    recordSubscriptionActivation,
    createId
  } = platformAdmin;

  const requirePlatformRole = bindRequirePlatformRole(requireAppUser);

  async function requirePlatformAdminCompat(req) {
    return requirePlatformRole(req, PLATFORM_ROLES);
  }

  async function updateManualSubscription(admin, subscriptionId, status, req, payload = {}) {
    if (!["active", "cancelled", "rejected"].includes(status)) {
      const error = new Error("Invalid subscription status");
      error.statusCode = 400;
      throw error;
    }
    const destructive = status === "rejected" || status === "cancelled";
    if (destructive) {
      await consumeConfirmation(admin, {
        confirmToken: payload.confirmToken,
        action: `subscription_${status}`,
        targetId: subscriptionId,
        challenge: payload.challenge
      });
    }
    const before = (await query(`SELECT * FROM workspace_subscriptions WHERE id = $1 AND provider = 'manual'`, [subscriptionId])).rows[0];
    if (!before) {
      const error = new Error("Manual subscription request not found");
      error.statusCode = 404;
      throw error;
    }
    const normalized = status === "rejected" ? "cancelled" : status;
    let result;
    if (normalized === "active") {
      await recordSubscriptionActivation(before, { provider: "manual" });
      result = (await query(`SELECT * FROM workspace_subscriptions WHERE id = $1`, [subscriptionId])).rows[0];
    } else {
      result = (
        await query(
          `UPDATE workspace_subscriptions
           SET status = $1, cancelled_at = NOW(), updated_at = NOW()
           WHERE id = $2 AND provider = 'manual'
           RETURNING *`,
          [normalized, subscriptionId]
        )
      ).rows[0];
    }
    await writeAuditLog({
      adminId: admin.id,
      action: `subscription_${status}`,
      targetType: "subscription",
      targetId: subscriptionId,
      oldValue: { status: before.status, plan_key: before.plan_key },
      newValue: { status: result.status, plan_key: result.plan_key },
      ip: clientIp(req),
      details: { status: result.status }
    });
    return result;
  }

  async function handle(requested, req, res, requestUrl) {
    if (!requested.startsWith("/api/admin")) return false;

    // GET /api/admin/me
    if (requested === "/api/admin/me" && req.method === "GET") {
      const admin = await requirePlatformRole(req, PLATFORM_ROLES);
      return sendJson(res, 200, {
        ok: true,
        admin: {
          id: admin.id,
          email: admin.email,
          displayName: admin.display_name,
          platformRole: admin.platform_role,
          capabilities: admin.capabilities
        }
      });
    }

    // POST /api/admin/confirmations
    if (requested === "/api/admin/confirmations" && req.method === "POST") {
      const admin = await requirePlatformRole(req, PLATFORM_ROLES);
      const payload = await parseJsonBody(req);
      const confirmation = await createConfirmation(admin, payload);
      return sendJson(res, 201, { ok: true, confirmation });
    }

    // GET /api/admin/overview
    if (requested === "/api/admin/overview" && req.method === "GET") {
      const admin = await requirePlatformRole(req, ROLE_CAPABILITIES.read);
      const [users, workspaces, subscriptions, pending, events, mrr] = await Promise.all([
        query("SELECT COUNT(*)::int AS count FROM app_users WHERE status = 'active'"),
        query("SELECT COUNT(*)::int AS count FROM workspaces WHERE status = 'active'"),
        query("SELECT plan_key, COUNT(*)::int AS count FROM workspace_subscriptions WHERE status = 'active' GROUP BY plan_key ORDER BY plan_key"),
        query("SELECT COUNT(*)::int AS count FROM workspace_subscriptions WHERE status = 'pending'"),
        query(
          `SELECT COUNT(*)::int AS count FROM platform_audit_events
           WHERE created_at >= date_trunc('day', NOW())`
        ),
        query(
          `SELECT COALESCE(SUM(COALESCE(s.price_usd_snapshot, p.price_usd)), 0)::float AS mrr
           FROM workspace_subscriptions s
           JOIN plan_catalog p ON p.plan_key = s.plan_key
           WHERE s.status = 'active' AND s.plan_key <> 'free'`
        )
      ]);
      return sendJson(res, 200, {
        ok: true,
        admin: {
          id: admin.id,
          email: admin.email,
          platformRole: admin.platform_role,
          capabilities: admin.capabilities
        },
        metrics: {
          users: users.rows[0].count,
          workspaces: workspaces.rows[0].count,
          subscriptions: subscriptions.rows,
          pendingSubscriptions: pending.rows[0].count,
          auditToday: events.rows[0].count,
          estimatedMrr: Number(mrr.rows[0].mrr || 0)
        }
      });
    }

    // GET /api/admin/workspaces
    if (requested === "/api/admin/workspaces" && req.method === "GET") {
      await requirePlatformRole(req, ROLE_CAPABILITIES.read);
      const { limit, offset, q, status, planKey } = parsePaging(requestUrl);
      const params = [];
      const where = [];
      if (q) {
        params.push(`%${q}%`);
        where.push(`(w.name ILIKE $${params.length} OR w.slug ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
      }
      if (status) {
        params.push(status);
        where.push(`w.status = $${params.length}`);
      }
      const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
      params.push(limit, offset);
      const result = await query(
        `SELECT w.id, w.name, w.slug, w.activity_type, w.status, w.created_at, u.email AS owner_email,
                COALESCE((SELECT plan_key FROM workspace_subscriptions s
                  WHERE s.workspace_id = w.id AND s.status IN ('pending','active','past_due')
                  ORDER BY s.created_at DESC LIMIT 1), 'free') AS plan_key,
                COUNT(*) OVER()::int AS total_count
         FROM workspaces w
         JOIN app_users u ON u.id = w.owner_user_id
         ${whereSql}
         ORDER BY w.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );
      let rows = result.rows;
      if (planKey) rows = rows.filter((row) => row.plan_key === planKey);
      return sendJson(res, 200, {
        ok: true,
        workspaces: rows.map(({ total_count, ...row }) => row),
        paging: { limit, offset, total: rows[0]?.total_count || 0 }
      });
    }

    // PATCH /api/admin/workspaces/:id
    const workspaceMatch = requested.match(/^\/api\/admin\/workspaces\/([^/]+)$/);
    if (workspaceMatch && req.method === "PATCH") {
      const admin = await requirePlatformRole(req, ROLE_CAPABILITIES.killSwitch);
      const workspaceId = decodeURIComponent(workspaceMatch[1]);
      const payload = await parseJsonBody(req);
      const nextStatus = String(payload.status || "").trim();
      if (!["active", "suspended", "archived"].includes(nextStatus)) {
        return sendJson(res, 400, { ok: false, error: "status must be active|suspended|archived" });
      }
      await consumeConfirmation(admin, {
        confirmToken: payload.confirmToken,
        action: "workspace_status",
        targetId: workspaceId,
        challenge: payload.challenge
      });
      const before = (await query(`SELECT * FROM workspaces WHERE id = $1`, [workspaceId])).rows[0];
      if (!before) return sendJson(res, 404, { ok: false, error: "Workspace not found" });
      const updated = (
        await query(`UPDATE workspaces SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`, [
          nextStatus,
          workspaceId
        ])
      ).rows[0];
      await writeAuditLog({
        adminId: admin.id,
        action: "workspace_status_changed",
        targetType: "workspace",
        targetId: workspaceId,
        oldValue: { status: before.status },
        newValue: { status: updated.status },
        ip: clientIp(req)
      });
      return sendJson(res, 200, { ok: true, workspace: updated });
    }

    // GET /api/admin/subscriptions
    if (requested === "/api/admin/subscriptions" && req.method === "GET") {
      await requirePlatformRole(req, ROLE_CAPABILITIES.read);
      const { limit, offset, q, status, planKey } = parsePaging(requestUrl);
      const params = [];
      const where = [];
      if (status) {
        params.push(status);
        where.push(`s.status = $${params.length}`);
      }
      if (planKey) {
        params.push(planKey);
        where.push(`s.plan_key = $${params.length}`);
      }
      if (q) {
        params.push(`%${q}%`);
        where.push(`(w.name ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
      }
      const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
      params.push(limit, offset);
      const result = await query(
        `SELECT s.id, s.workspace_id, s.plan_key, s.provider, s.status, s.created_at, s.updated_at,
                s.activated_at, s.cancelled_at, s.price_usd_snapshot,
                w.name AS workspace_name, u.email AS owner_email,
                COUNT(*) OVER()::int AS total_count
         FROM workspace_subscriptions s
         JOIN workspaces w ON w.id = s.workspace_id
         JOIN app_users u ON u.id = w.owner_user_id
         ${whereSql}
         ORDER BY s.updated_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );
      return sendJson(res, 200, {
        ok: true,
        subscriptions: result.rows.map(({ total_count, ...row }) => row),
        paging: { limit, offset, total: result.rows[0]?.total_count || 0 }
      });
    }

    const adminSubscriptionMatch = requested.match(/^\/api\/admin\/subscriptions\/([^/]+)$/);
    if (adminSubscriptionMatch && req.method === "PATCH") {
      const admin = await requirePlatformRole(req, ROLE_CAPABILITIES.subscriptions);
      const payload = await parseJsonBody(req);
      const subscription = await updateManualSubscription(admin, adminSubscriptionMatch[1], payload.status, req, payload);
      return sendJson(res, 200, { ok: true, subscription });
    }

    if (requested === "/api/admin/plans" && req.method === "GET") {
      await requirePlatformRole(req, ROLE_CAPABILITIES.read);
      return sendJson(res, 200, { ok: true, plans: await listPlans() });
    }

    const adminPlanMatch = requested.match(/^\/api\/admin\/plans\/(free|pro|ultimate)$/);
    if (adminPlanMatch && req.method === "PATCH") {
      const admin = await requirePlatformRole(req, ROLE_CAPABILITIES.plans);
      const planKey = adminPlanMatch[1];
      const payload = await parseJsonBody(req);
      await consumeConfirmation(admin, {
        confirmToken: payload.confirmToken,
        action: "plan_price_update",
        targetId: planKey,
        challenge: payload.challenge
      });
      const current = (await query("SELECT * FROM plan_catalog WHERE plan_key = $1", [planKey])).rows[0];
      if (!current) return sendJson(res, 404, { ok: false, error: "Plan not found" });
      const price = Number(payload.priceUsd);
      if (!Number.isFinite(price) || price < 0) {
        return sendJson(res, 400, { ok: false, error: "priceUsd must be a non-negative number" });
      }
      if (current.whop_plan_id && planKey !== "free") {
        try {
          await whopRequest(`/api/v1/plans/${encodeURIComponent(current.whop_plan_id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ renewal_price: price })
          });
        } catch (error) {
          console.warn("[admin] Whop plan price sync skipped:", error.message);
        }
      }
      const updated = (
        await query("UPDATE plan_catalog SET price_usd = $1, updated_at = NOW() WHERE plan_key = $2 RETURNING *", [
          price,
          planKey
        ])
      ).rows[0];
      await writeAuditLog({
        adminId: admin.id,
        action: "plan_price_updated",
        targetType: "plan",
        targetId: planKey,
        oldValue: { priceUsd: Number(current.price_usd) },
        newValue: { priceUsd: price },
        ip: clientIp(req)
      });
      return sendJson(res, 200, { ok: true, plan: updated });
    }

    // Users
    if (requested === "/api/admin/users" && req.method === "GET") {
      await requirePlatformRole(req, ROLE_CAPABILITIES.read);
      const { limit, offset, q } = parsePaging(requestUrl);
      const params = [];
      let whereSql = "";
      if (q) {
        params.push(`%${q}%`);
        whereSql = `WHERE email ILIKE $1 OR COALESCE(display_name,'') ILIKE $1`;
      }
      params.push(limit, offset);
      const result = await query(
        `SELECT id, email, display_name, status, is_platform_admin, platform_role, created_at,
                COUNT(*) OVER()::int AS total_count
         FROM app_users
         ${whereSql}
         ORDER BY created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );
      return sendJson(res, 200, {
        ok: true,
        users: result.rows.map(({ total_count, ...row }) => row),
        paging: { limit, offset, total: result.rows[0]?.total_count || 0 }
      });
    }

    const userRoleMatch = requested.match(/^\/api\/admin\/users\/([^/]+)\/role$/);
    if (userRoleMatch && req.method === "PATCH") {
      const admin = await requirePlatformRole(req, ROLE_CAPABILITIES.assignRoles);
      const userId = decodeURIComponent(userRoleMatch[1]);
      const payload = await parseJsonBody(req);
      const nextRole = payload.platformRole === null || payload.platformRole === "" ? null : String(payload.platformRole);
      if (nextRole && !PLATFORM_ROLES.includes(nextRole)) {
        return sendJson(res, 400, { ok: false, error: "Invalid platformRole" });
      }
      await consumeConfirmation(admin, {
        confirmToken: payload.confirmToken,
        action: "user_role_update",
        targetId: userId,
        challenge: payload.challenge
      });
      const before = (await query(`SELECT * FROM app_users WHERE id = $1`, [userId])).rows[0];
      if (!before) return sendJson(res, 404, { ok: false, error: "User not found" });
      if (before.id === admin.id && nextRole !== "super_admin") {
        return sendJson(res, 400, { ok: false, error: "لا يمكن إزالة صلاحية Super Admin عن حسابك الحالي" });
      }
      const updated = (
        await query(
          `UPDATE app_users SET platform_role = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
          [nextRole, userId]
        )
      ).rows[0];
      await writeAuditLog({
        adminId: admin.id,
        action: "platform_role_updated",
        targetType: "user",
        targetId: userId,
        oldValue: { platform_role: before.platform_role },
        newValue: { platform_role: updated.platform_role },
        ip: clientIp(req)
      });
      return sendJson(res, 200, { ok: true, user: updated });
    }

    // Finance overview
    if (requested === "/api/admin/finance/overview" && req.method === "GET") {
      await requirePlatformRole(req, ROLE_CAPABILITIES.finance);
      const [paidIn, pending, settlements, mrr] = await Promise.all([
        query(
          `SELECT COALESCE(SUM(amount),0)::float AS total
           FROM billing_transactions WHERE status = 'paid' AND direction = 'in'`
        ),
        query(`SELECT COUNT(*)::int AS count FROM billing_transactions WHERE status = 'pending'`),
        query(
          `SELECT COALESCE(SUM(amount),0)::float AS total
           FROM platform_settlements WHERE status = 'paid'`
        ),
        query(
          `SELECT COALESCE(SUM(COALESCE(s.price_usd_snapshot, p.price_usd)), 0)::float AS mrr
           FROM workspace_subscriptions s
           JOIN plan_catalog p ON p.plan_key = s.plan_key
           WHERE s.status = 'active' AND s.plan_key <> 'free'`
        )
      ]);
      return sendJson(res, 200, {
        ok: true,
        finance: {
          paidInTotal: Number(paidIn.rows[0].total || 0),
          pendingTransactions: pending.rows[0].count,
          settlementsPaid: Number(settlements.rows[0].total || 0),
          estimatedMrr: Number(mrr.rows[0].mrr || 0)
        }
      });
    }

    if (requested === "/api/admin/finance/transactions" && req.method === "GET") {
      await requirePlatformRole(req, ROLE_CAPABILITIES.finance);
      const { limit, offset, status } = parsePaging(requestUrl);
      const params = [];
      let whereSql = "";
      if (status) {
        params.push(status);
        whereSql = `WHERE t.status = $1`;
      }
      params.push(limit, offset);
      const result = await query(
        `SELECT t.*, w.name AS workspace_name, COUNT(*) OVER()::int AS total_count
         FROM billing_transactions t
         JOIN workspaces w ON w.id = t.workspace_id
         ${whereSql}
         ORDER BY t.occurred_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );
      return sendJson(res, 200, {
        ok: true,
        transactions: result.rows.map(({ total_count, ...row }) => row),
        paging: { limit, offset, total: result.rows[0]?.total_count || 0 }
      });
    }

    if (requested === "/api/admin/finance/transactions" && req.method === "POST") {
      const admin = await requirePlatformRole(req, ROLE_CAPABILITIES.finance);
      const payload = await parseJsonBody(req);
      const workspaceId = String(payload.workspaceId || "").trim();
      const amount = Number(payload.amount);
      const direction = ["in", "out", "adjustment"].includes(payload.direction) ? payload.direction : "adjustment";
      const status = ["pending", "paid", "failed", "refunded", "void"].includes(payload.status)
        ? payload.status
        : "paid";
      if (!workspaceId || !Number.isFinite(amount) || amount < 0) {
        return sendJson(res, 400, { ok: false, error: "workspaceId and non-negative amount are required" });
      }
      const id = createId("btx");
      const row = (
        await query(
          `INSERT INTO billing_transactions
            (id, workspace_id, subscription_id, plan_key, provider, direction, amount, currency, status, details)
           VALUES ($1, $2, $3, $4, 'manual', $5, $6, $7, $8, $9::jsonb)
           RETURNING *`,
          [
            id,
            workspaceId,
            payload.subscriptionId || null,
            payload.planKey || null,
            direction,
            amount,
            payload.currency || "usd",
            status,
            JSON.stringify({ ...(payload.details || {}), createdBy: admin.id })
          ]
        )
      ).rows[0];
      await writeAuditLog({
        adminId: admin.id,
        action: "billing_transaction_created",
        targetType: "billing_transaction",
        targetId: id,
        newValue: { amount, direction, status, workspaceId },
        ip: clientIp(req)
      });
      return sendJson(res, 201, { ok: true, transaction: row });
    }

    if (requested === "/api/admin/finance/settlements" && req.method === "GET") {
      await requirePlatformRole(req, ROLE_CAPABILITIES.finance);
      const { limit, offset } = parsePaging(requestUrl);
      const result = await query(
        `SELECT s.*, u.email AS created_by_email, COUNT(*) OVER()::int AS total_count
         FROM platform_settlements s
         LEFT JOIN app_users u ON u.id = s.created_by
         ORDER BY s.created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
      return sendJson(res, 200, {
        ok: true,
        settlements: result.rows.map(({ total_count, ...row }) => row),
        paging: { limit, offset, total: result.rows[0]?.total_count || 0 }
      });
    }

    if (requested === "/api/admin/finance/settlements" && req.method === "POST") {
      const admin = await requirePlatformRole(req, ROLE_CAPABILITIES.finance);
      const payload = await parseJsonBody(req);
      const amount = Number(payload.amount);
      if (!Number.isFinite(amount) || amount < 0) {
        return sendJson(res, 400, { ok: false, error: "amount must be a non-negative number" });
      }
      const id = createId("settle");
      const status = ["pending", "paid", "failed"].includes(payload.status) ? payload.status : "pending";
      const row = (
        await query(
          `INSERT INTO platform_settlements
            (id, provider, provider_settlement_id, amount, currency, status, period_start, period_end, details, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
           RETURNING *`,
          [
            id,
            payload.provider || "manual",
            payload.providerSettlementId || null,
            amount,
            payload.currency || "usd",
            status,
            payload.periodStart || null,
            payload.periodEnd || null,
            JSON.stringify(payload.details || {}),
            admin.id
          ]
        )
      ).rows[0];
      await writeAuditLog({
        adminId: admin.id,
        action: "platform_settlement_created",
        targetType: "platform_settlement",
        targetId: id,
        newValue: { amount, status },
        ip: clientIp(req)
      });
      return sendJson(res, 201, { ok: true, settlement: row });
    }

    // Audit
    if (requested === "/api/admin/audit" && req.method === "GET") {
      await requirePlatformRole(req, ROLE_CAPABILITIES.read);
      const { limit, offset, q } = parsePaging(requestUrl, { limit: 50, offset: 0 });
      const params = [];
      let whereSql = "";
      if (q) {
        params.push(`%${q}%`);
        whereSql = `WHERE e.action ILIKE $1 OR COALESCE(e.target_id,'') ILIKE $1 OR COALESCE(u.email,'') ILIKE $1`;
      }
      params.push(limit, offset);
      const result = await query(
        `SELECT e.id, e.action, e.target_type, e.target_id, e.details, e.old_value, e.new_value,
                e.ip_address, e.created_at, u.email AS actor_email,
                COUNT(*) OVER()::int AS total_count
         FROM platform_audit_events e
         LEFT JOIN app_users u ON u.id = e.actor_user_id
         ${whereSql}
         ORDER BY e.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );
      return sendJson(res, 200, {
        ok: true,
        events: result.rows.map(({ total_count, ...row }) => row),
        paging: { limit, offset, total: result.rows[0]?.total_count || 0 }
      });
    }

    // CSV export
    const exportMatch = requested.match(/^\/api\/admin\/export\/(workspaces|subscriptions|transactions|audit)\.csv$/);
    if (exportMatch && req.method === "GET") {
      await requirePlatformRole(req, ROLE_CAPABILITIES.read);
      const kind = exportMatch[1];
      let csv = "";
      if (kind === "workspaces") {
        const result = await query(
          `SELECT w.id, w.name, w.slug, w.activity_type, w.status, w.created_at, u.email AS owner_email
           FROM workspaces w JOIN app_users u ON u.id = w.owner_user_id
           ORDER BY w.created_at DESC LIMIT 5000`
        );
        csv = toCsv(result.rows, [
          { label: "id", key: "id" },
          { label: "name", key: "name" },
          { label: "slug", key: "slug" },
          { label: "activity_type", key: "activity_type" },
          { label: "status", key: "status" },
          { label: "owner_email", key: "owner_email" },
          { label: "created_at", key: "created_at" }
        ]);
      } else if (kind === "subscriptions") {
        const result = await query(
          `SELECT s.id, s.workspace_id, s.plan_key, s.provider, s.status, s.price_usd_snapshot, s.created_at, w.name AS workspace_name
           FROM workspace_subscriptions s JOIN workspaces w ON w.id = s.workspace_id
           ORDER BY s.updated_at DESC LIMIT 5000`
        );
        csv = toCsv(result.rows, [
          { label: "id", key: "id" },
          { label: "workspace", key: "workspace_name" },
          { label: "plan_key", key: "plan_key" },
          { label: "provider", key: "provider" },
          { label: "status", key: "status" },
          { label: "price_usd_snapshot", key: "price_usd_snapshot" },
          { label: "created_at", key: "created_at" }
        ]);
      } else if (kind === "transactions") {
        await requirePlatformRole(req, ROLE_CAPABILITIES.finance);
        const result = await query(
          `SELECT t.id, t.workspace_id, t.plan_key, t.direction, t.amount, t.currency, t.status, t.occurred_at
           FROM billing_transactions t ORDER BY t.occurred_at DESC LIMIT 5000`
        );
        csv = toCsv(result.rows, [
          { label: "id", key: "id" },
          { label: "workspace_id", key: "workspace_id" },
          { label: "plan_key", key: "plan_key" },
          { label: "direction", key: "direction" },
          { label: "amount", key: "amount" },
          { label: "currency", key: "currency" },
          { label: "status", key: "status" },
          { label: "occurred_at", key: "occurred_at" }
        ]);
      } else {
        const result = await query(
          `SELECT e.id, e.action, e.target_type, e.target_id, e.ip_address, e.created_at, u.email AS actor_email
           FROM platform_audit_events e LEFT JOIN app_users u ON u.id = e.actor_user_id
           ORDER BY e.created_at DESC LIMIT 5000`
        );
        csv = toCsv(result.rows, [
          { label: "id", key: "id" },
          { label: "action", key: "action" },
          { label: "target_type", key: "target_type" },
          { label: "target_id", key: "target_id" },
          { label: "actor_email", key: "actor_email" },
          { label: "ip_address", key: "ip_address" },
          { label: "created_at", key: "created_at" }
        ]);
      }
      res.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="maw3ed-${kind}.csv"`
      });
      res.end(csv);
      return true;
    }

    return false;
  }

  return {
    handle,
    requirePlatformAdminCompat,
    writeAuditLog,
    updateManualSubscription
  };
}

module.exports = { createAdminRouter };
