/**
 * Workspace staff account links (auth user ↔ staff professional profile).
 *
 * Branch vocabulary: Maw3ed tenants are workspaces; there is no separate branch
 * table. Multi-location = multiple workspace memberships for one login.
 *
 * Storage:
 * - PostgreSQL: workspace_staff_links (migration 012)
 * - JSON local: data/workspaces/<id>/staff-links.json
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { databaseConfigured, query, pool } = require("./db");

const rootDir = __dirname;
const workspacesRoot = path.join(rootDir, "data", "workspaces");

const ROLE_IN_WORKSPACE = new Set(["desk", "provider", "both"]);
const LINK_STATUS = new Set(["active", "suspended"]);

function createId(prefix = "slink") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeWorkspaceId(raw) {
  const id = String(raw || "").trim();
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) {
    const error = new Error("معرف المساحة غير صالح");
    error.statusCode = 400;
    throw error;
  }
  return id;
}

function linksPath(workspaceId) {
  return path.join(workspacesRoot, sanitizeWorkspaceId(workspaceId), "staff-links.json");
}

function normalizeLink(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id || row.workspaceId),
    userId: String(row.user_id || row.userId),
    staffId: String(row.staff_id || row.staffId),
    roleInWorkspace: String(row.role_in_workspace || row.roleInWorkspace || "desk"),
    status: String(row.status || "active"),
    createdAt: row.created_at || row.createdAt || null,
    updatedAt: row.updated_at || row.updatedAt || null
  };
}

function readJsonLinks(workspaceId) {
  const filePath = linksPath(workspaceId);
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const rows = Array.isArray(raw) ? raw : Array.isArray(raw.links) ? raw.links : [];
    return rows.map(normalizeLink).filter(Boolean);
  } catch {
    return [];
  }
}

function writeJsonLinks(workspaceId, links) {
  const filePath = linksPath(workspaceId);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const payload = {
    workspaceId: sanitizeWorkspaceId(workspaceId),
    updatedAt: new Date().toISOString(),
    links: links.map(normalizeLink)
  };
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function assertLinkShape({ userId, staffId, roleInWorkspace, status }) {
  if (!userId || !String(userId).trim()) {
    const error = new Error("معرف المستخدم مطلوب");
    error.statusCode = 400;
    throw error;
  }
  if (!staffId || !String(staffId).trim()) {
    const error = new Error("معرف الموظف مطلوب");
    error.statusCode = 400;
    throw error;
  }
  const role = String(roleInWorkspace || "desk");
  if (!ROLE_IN_WORKSPACE.has(role)) {
    const error = new Error("role_in_workspace غير صالح");
    error.statusCode = 400;
    throw error;
  }
  const nextStatus = String(status || "active");
  if (!LINK_STATUS.has(nextStatus)) {
    const error = new Error("حالة الربط غير صالحة");
    error.statusCode = 400;
    throw error;
  }
  return { userId: String(userId).trim(), staffId: String(staffId).trim(), roleInWorkspace: role, status: nextStatus };
}

async function listWorkspaceLinks(workspaceId) {
  const id = sanitizeWorkspaceId(workspaceId);
  if (!databaseConfigured) {
    return readJsonLinks(id);
  }
  const result = await query(
    `SELECT id, workspace_id, user_id, staff_id, role_in_workspace, status, created_at, updated_at
     FROM workspace_staff_links
     WHERE workspace_id = $1
     ORDER BY created_at ASC`,
    [id]
  );
  return result.rows.map(normalizeLink);
}

async function getActiveLinkForUser(userId, workspaceId) {
  const id = sanitizeWorkspaceId(workspaceId);
  const uid = String(userId || "").trim();
  if (!uid) return null;

  if (!databaseConfigured) {
    return (
      readJsonLinks(id).find(
        (link) => link.userId === uid && link.status === "active"
      ) || null
    );
  }

  const result = await query(
    `SELECT id, workspace_id, user_id, staff_id, role_in_workspace, status, created_at, updated_at
     FROM workspace_staff_links
     WHERE workspace_id = $1 AND user_id = $2 AND status = 'active'
     LIMIT 1`,
    [id, uid]
  );
  return normalizeLink(result.rows[0] || null);
}

async function listActiveLinksForUser(userId) {
  const uid = String(userId || "").trim();
  if (!uid) return [];

  if (!databaseConfigured) {
    if (!fs.existsSync(workspacesRoot)) return [];
    const out = [];
    for (const entry of fs.readdirSync(workspacesRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const link = readJsonLinks(entry.name).find(
        (item) => item.userId === uid && item.status === "active"
      );
      if (link) out.push(link);
    }
    return out;
  }

  const result = await query(
    `SELECT id, workspace_id, user_id, staff_id, role_in_workspace, status, created_at, updated_at
     FROM workspace_staff_links
     WHERE user_id = $1 AND status = 'active'
     ORDER BY created_at ASC`,
    [uid]
  );
  return result.rows.map(normalizeLink);
}

/**
 * Upsert one-to-one link in a workspace. Rejects conflicts with another user/staff.
 */
async function upsertLink({
  workspaceId,
  userId,
  staffId,
  roleInWorkspace = "desk",
  status = "active",
  staffExists = null
}) {
  const id = sanitizeWorkspaceId(workspaceId);
  const shape = assertLinkShape({ userId, staffId, roleInWorkspace, status });

  if (typeof staffExists === "function") {
    const ok = await staffExists(id, shape.staffId);
    if (!ok) {
      const error = new Error("سجل الموظف غير موجود في هذه المساحة");
      error.statusCode = 404;
      throw error;
    }
  }

  if (!databaseConfigured) {
    const links = readJsonLinks(id);
    const byUser = links.find((link) => link.userId === shape.userId);
    const byStaff = links.find((link) => link.staffId === shape.staffId);
    if (byUser && byStaff && byUser.id !== byStaff.id) {
      const error = new Error("تعارض: المستخدم وسجل الموظف مربوطان بروابط مختلفة");
      error.statusCode = 409;
      throw error;
    }
    if (byStaff && byStaff.userId !== shape.userId) {
      const error = new Error("سجل الموظف مربوط بحساب آخر في هذه المساحة");
      error.statusCode = 409;
      throw error;
    }
    if (byUser && byUser.staffId !== shape.staffId) {
      const error = new Error("الحساب مربوط بموظف آخر في هذه المساحة");
      error.statusCode = 409;
      throw error;
    }

    const now = new Date().toISOString();
    const existing = byUser || byStaff;
    const next = {
      id: existing?.id || createId("slink"),
      workspaceId: id,
      userId: shape.userId,
      staffId: shape.staffId,
      roleInWorkspace: shape.roleInWorkspace,
      status: shape.status,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };
    const rest = links.filter((link) => link.id !== next.id);
    writeJsonLinks(id, [...rest, next]);
    return next;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const conflict = await client.query(
      `SELECT id, user_id, staff_id FROM workspace_staff_links
       WHERE workspace_id = $1 AND (user_id = $2 OR staff_id = $3)`,
      [id, shape.userId, shape.staffId]
    );
    for (const row of conflict.rows) {
      if (row.user_id === shape.userId && row.staff_id !== shape.staffId) {
        const error = new Error("الحساب مربوط بموظف آخر في هذه المساحة");
        error.statusCode = 409;
        throw error;
      }
      if (row.staff_id === shape.staffId && row.user_id !== shape.userId) {
        const error = new Error("سجل الموظف مربوط بحساب آخر في هذه المساحة");
        error.statusCode = 409;
        throw error;
      }
    }

    const existing = conflict.rows.find(
      (row) => row.user_id === shape.userId && row.staff_id === shape.staffId
    );
    let result;
    if (existing) {
      result = await client.query(
        `UPDATE workspace_staff_links
         SET role_in_workspace = $2, status = $3, updated_at = NOW()
         WHERE id = $1
         RETURNING id, workspace_id, user_id, staff_id, role_in_workspace, status, created_at, updated_at`,
        [existing.id, shape.roleInWorkspace, shape.status]
      );
    } else {
      result = await client.query(
        `INSERT INTO workspace_staff_links
           (id, workspace_id, user_id, staff_id, role_in_workspace, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, workspace_id, user_id, staff_id, role_in_workspace, status, created_at, updated_at`,
        [createId("slink"), id, shape.userId, shape.staffId, shape.roleInWorkspace, shape.status]
      );
    }
    await client.query("COMMIT");
    return normalizeLink(result.rows[0]);
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw error;
  } finally {
    client.release();
  }
}

async function suspendLink(workspaceId, { userId = null, staffId = null } = {}) {
  const id = sanitizeWorkspaceId(workspaceId);
  if (!userId && !staffId) {
    const error = new Error("userId أو staffId مطلوب");
    error.statusCode = 400;
    throw error;
  }

  if (!databaseConfigured) {
    const links = readJsonLinks(id);
    let changed = false;
    const next = links.map((link) => {
      if ((userId && link.userId === userId) || (staffId && link.staffId === staffId)) {
        changed = true;
        return { ...link, status: "suspended", updatedAt: new Date().toISOString() };
      }
      return link;
    });
    if (!changed) {
      const error = new Error("الربط غير موجود");
      error.statusCode = 404;
      throw error;
    }
    writeJsonLinks(id, next);
    return next.find(
      (link) => (userId && link.userId === userId) || (staffId && link.staffId === staffId)
    );
  }

  const result = await query(
    `UPDATE workspace_staff_links
     SET status = 'suspended', updated_at = NOW()
     WHERE workspace_id = $1
       AND ($2::text IS NULL OR user_id = $2)
       AND ($3::text IS NULL OR staff_id = $3)
     RETURNING id, workspace_id, user_id, staff_id, role_in_workspace, status, created_at, updated_at`,
    [id, userId || null, staffId || null]
  );
  if (!result.rows[0]) {
    const error = new Error("الربط غير موجود");
    error.statusCode = 404;
    throw error;
  }
  return normalizeLink(result.rows[0]);
}

function isDeskRoute(requested, method) {
  if (requested === "/api/ops/desk/today" && method === "GET") return true;
  if (requested === "/api/ops/desk/preview" && method === "POST") return true;
  if (requested === "/api/ops/desk/check-in" && method === "POST") return true;
  if (/^\/api\/ops\/desk\/appointments\/[^/]+\/complete$/.test(requested) && method === "POST") {
    return true;
  }
  return false;
}

/**
 * Desk pricing/addons stay owner/admin — linked staff cannot change money.
 */
function isStaffForbiddenDeskMoneyRoute(requested, method) {
  return (
    (/^\/api\/ops\/desk\/appointments\/[^/]+\/addons$/.test(requested) && method === "POST") ||
    (/^\/api\/ops\/desk\/appointments\/[^/]+\/lines\/[^/]+\/pricing$/.test(requested) &&
      method === "PATCH")
  );
}

/**
 * Appointment is in linked staff scope when assigned to them (or unassigned for check-in claim).
 */
function appointmentInStaffScope(appointment, staffId, { allowUnassigned = false } = {}) {
  if (!appointment || !staffId) return false;
  const assigned = String(appointment.staffId || "").trim();
  if (!assigned) return Boolean(allowUnassigned);
  return assigned === String(staffId);
}

function filterDeskPayload(desk, staffId) {
  if (!desk || !staffId) return desk;
  const match = (item) => String(item.staffId || "") === String(staffId);
  const waiting = (desk.waiting || []).filter(match);
  const active = (desk.active || []).filter(match);
  const done = (desk.done || []).filter(match);
  const appointments = (desk.appointments || []).filter(match);
  return {
    ...desk,
    scopedStaffId: staffId,
    counts: {
      waiting: waiting.length,
      active: active.length,
      done: done.length,
      total: appointments.length
    },
    waiting,
    active,
    done,
    appointments
  };
}

module.exports = {
  ROLE_IN_WORKSPACE,
  LINK_STATUS,
  createId,
  linksPath,
  normalizeLink,
  listWorkspaceLinks,
  getActiveLinkForUser,
  listActiveLinksForUser,
  upsertLink,
  suspendLink,
  isDeskRoute,
  isStaffForbiddenDeskMoneyRoute,
  appointmentInStaffScope,
  filterDeskPayload,
  readJsonLinks,
  writeJsonLinks
};
