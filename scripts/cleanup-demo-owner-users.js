#!/usr/bin/env node
/**
 * تنظيف مستخدمي التطبيق محلياً — يبقي فقط 3 مستخدمين:
 *   1. contact.fakhry@gmail.com  → مسؤول المنصة الوحيد (super_admin) — بلا أي مساحة
 *   2. contact.haitham@gmail.com → مالك medical / dawybooking فقط — ليس platform admin
 *   3. contact.haitham@yahoo.com → مالك education / talaaee-book فقط — ليس platform admin
 *
 * يحذف كل مستخدم آخر (مثل totty_alex@yahoo.co.uk و contact.fakhry@yahoo.com)
 * وكل المساحات غير dawybooking + talaaee-book (مثل haitham-fakhry / workspace_dcb873bd…).
 *
 * عند --apply (FK-aware):
 *   - يضبط platform_role=super_admin + is_platform_admin على fakhry فقط
 *   - يصفّر أعلام المنصة عن المالكين دائماً
 *   - يفصل fakhry عن memberships / staff links
 *   - يمسح صفوف workspace_ops_* / staff_links / members ثم يحذف المساحات غير المحفوظة
 *   - يعيد تعيين platform_audit_events.actor_user_id للمستخدمين المحذوفين → platform admin
 *     (DISABLE TRIGGER USER مؤقتاً لأن الجدول immutable؛ لا تُحذف صفوف التدقيق)
 *   - الاستعلامات الاختيارية: فحص to_regclass + SAVEPOINT حتى لا تُجهض المعاملة إن غاب الجدول
 *
 * Usage:
 *   npm run users:cleanup-demo-owners -- --dry-run
 *   npm run users:cleanup-demo-owners -- --apply
 */
"use strict";

require("./load-env");
const crypto = require("crypto");
const { pool, databaseConfigured, query } = require("../db");
const {
  KEEP_OWNER_EMAILS,
  KEEP_USER_EMAILS,
  PLATFORM_ADMIN_EMAIL,
  SECTION_TARGETS
} = require("./demo-seed-store");

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const dryRun = !apply || args.includes("--dry-run");

const KEEP_WORKSPACE_IDS = [
  SECTION_TARGETS.medical.preferredWorkspaceId,
  SECTION_TARGETS.education.preferredWorkspaceId
];

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isPlatformAdminRow(user) {
  return Boolean(user.platform_role) || user.is_platform_admin === true;
}

function formatPgError(error) {
  if (!error) return "unknown error";
  const parts = [error.message || String(error)];
  if (error.code) parts.push(`code=${error.code}`);
  if (error.constraint) parts.push(`constraint=${error.constraint}`);
  if (error.table) parts.push(`table=${error.table}`);
  if (error.detail) parts.push(`detail=${error.detail}`);
  return parts.join(" | ");
}

async function relationExists(client, relationName) {
  // Accept "workspace_staff_links" or "public.workspace_staff_links"
  const qualified = String(relationName).includes(".")
    ? String(relationName)
    : `public.${relationName}`;
  const result = await client.query(`SELECT to_regclass($1) AS reg`, [qualified]);
  return Boolean(result.rows[0]?.reg);
}

/**
 * Optional query inside an open TX.
 * Missing relation/column must not abort the surrounding transaction:
 * check to_regclass when possible + SAVEPOINT for every optional statement.
 */
async function safeClientQuery(client, sql, params = [], { relation } = {}) {
  if (relation) {
    const exists = await relationExists(client, relation);
    if (!exists) {
      return { rows: [], skipped: true, reason: "missing_relation", relation };
    }
  }

  const sp = `sp_${crypto.randomBytes(6).toString("hex")}`;
  await client.query(`SAVEPOINT ${sp}`);
  try {
    const result = await client.query(sql, params);
    await client.query(`RELEASE SAVEPOINT ${sp}`);
    return result;
  } catch (error) {
    await client.query(`ROLLBACK TO SAVEPOINT ${sp}`).catch(() => null);
    if (error && (error.code === "42P01" || error.code === "42703")) {
      return { rows: [], skipped: true, code: error.code };
    }
    throw error;
  }
}

const optionalClientQuery = safeClientQuery;

async function safePoolQuery(sql, params = []) {
  try {
    return await query(sql, params);
  } catch (error) {
    if (error && (error.code === "42P01" || error.code === "42703")) return { rows: [] };
    throw error;
  }
}

async function loadMemberships() {
  return (
    await safePoolQuery(
      `SELECT workspace_id, user_id, role, status
       FROM workspace_members
       ORDER BY workspace_id, user_id`
    )
  ).rows;
}

async function loadStaffLinks() {
  return (
    await safePoolQuery(
      `SELECT id, workspace_id, user_id, staff_id, status
       FROM workspace_staff_links
       ORDER BY workspace_id, user_id`
    )
  ).rows;
}

/**
 * Soft FKs before deleting users:
 * - platform_audit_events are immutable (BEFORE UPDATE/DELETE triggers). For cleanup only:
 *   DISABLE TRIGGER USER → reassign actors of deleted users to platform admin → ENABLE TRIGGER USER.
 *   Do not delete audit rows; do not null actors.
 * - platform_settlements.created_by may be nulled (no immutability trigger).
 */
async function reassignSoftUserFks(client, userIds, platformAdminId) {
  if (!userIds.length) return;

  if (platformAdminId && (await relationExists(client, "platform_audit_events"))) {
    await client.query(`ALTER TABLE platform_audit_events DISABLE TRIGGER USER`);
    try {
      const updated = await client.query(
        `UPDATE platform_audit_events
         SET actor_user_id = $1
         WHERE actor_user_id = ANY($2::text[])`,
        [platformAdminId, userIds]
      );
      console.log(
        `[cleanup] reassigned ${updated.rowCount} platform_audit_events.actor_user_id → platform admin (${platformAdminId})`
      );
    } finally {
      await client.query(`ALTER TABLE platform_audit_events ENABLE TRIGGER USER`);
    }
  }

  await safeClientQuery(
    client,
    `UPDATE platform_settlements SET created_by = NULL WHERE created_by = ANY($1::text[])`,
    [userIds],
    { relation: "platform_settlements" }
  );
}

/**
 * Wipe a workspace and dependents before DELETE workspaces.
 * Mirrors workspaceOpsPg saveStore wipe: deleting workspace_ops_profiles cascades ops children.
 */
async function deleteWorkspaceFully(client, workspace) {
  const workspaceId = workspace.id;
  const label = workspace.slug || workspace.name || workspaceId;

  // Staff links reference workspace_ops_staff; remove before ops profile wipe.
  // Table may be missing when migration 012 is not applied — must not abort the TX.
  await safeClientQuery(
    client,
    `DELETE FROM workspace_staff_links WHERE workspace_id = $1`,
    [workspaceId],
    { relation: "workspace_staff_links" }
  );

  // Normalized ops graph hangs off workspace_ops_profiles (ON DELETE CASCADE to children).
  await safeClientQuery(
    client,
    `DELETE FROM workspace_ops_profiles WHERE workspace_id = $1`,
    [workspaceId],
    { relation: "workspace_ops_profiles" }
  );

  // Platform governance / billing children (also CASCADE from workspaces, but explicit).
  await safeClientQuery(
    client,
    `DELETE FROM billing_transactions WHERE workspace_id = $1`,
    [workspaceId],
    { relation: "billing_transactions" }
  );
  await safeClientQuery(
    client,
    `DELETE FROM subscription_invoices WHERE workspace_id = $1`,
    [workspaceId],
    { relation: "subscription_invoices" }
  );
  await safeClientQuery(
    client,
    `DELETE FROM usage_counters WHERE workspace_id = $1`,
    [workspaceId],
    { relation: "usage_counters" }
  );
  await safeClientQuery(
    client,
    `DELETE FROM workspace_subscriptions WHERE workspace_id = $1`,
    [workspaceId],
    { relation: "workspace_subscriptions" }
  );

  // organizations.workspace_id is ON DELETE SET NULL — clear explicitly for clarity.
  await safeClientQuery(
    client,
    `UPDATE organizations SET workspace_id = NULL WHERE workspace_id = $1`,
    [workspaceId],
    { relation: "organizations" }
  );

  await safeClientQuery(
    client,
    `DELETE FROM workspace_members WHERE workspace_id = $1`,
    [workspaceId],
    { relation: "workspace_members" }
  );

  try {
    await client.query(`DELETE FROM workspaces WHERE id = $1`, [workspaceId]);
  } catch (error) {
    error.message = `فشل حذف المساحة ${workspaceId} (${label}): ${formatPgError(error)}`;
    throw error;
  }
  console.log(`[cleanup] deleted workspace ${workspaceId} (${label})`);
}

async function fetchFinalAdminReport(adminEmail) {
  const users = (
    await query(
      `SELECT id, email, display_name, platform_role, is_platform_admin, status, clerk_user_id
       FROM app_users
       ORDER BY email ASC`
    )
  ).rows;
  const workspaces = (
    await query(
      `SELECT id, name, slug, owner_user_id, activity_type, status
       FROM workspaces
       ORDER BY slug ASC`
    )
  ).rows;
  const memberships = await loadMemberships();
  const admin = users.find((user) => normalizeEmail(user.email) === normalizeEmail(adminEmail)) || null;
  return {
    users: users.map((user) => ({
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      platformRole: user.platform_role,
      isPlatformAdmin: Boolean(user.is_platform_admin),
      status: user.status,
      clerkUserId: user.clerk_user_id,
      ownedWorkspaces: workspaces
        .filter((workspace) => workspace.owner_user_id === user.id)
        .map((workspace) => ({ id: workspace.id, slug: workspace.slug, name: workspace.name })),
      memberships: memberships
        .filter((row) => row.user_id === user.id)
        .map((row) => ({ workspaceId: row.workspace_id, role: row.role }))
    })),
    workspaces: workspaces.map((workspace) => ({
      id: workspace.id,
      slug: workspace.slug,
      name: workspace.name,
      ownerUserId: workspace.owner_user_id,
      activityType: workspace.activity_type
    })),
    platformAdmin: admin
      ? {
          id: admin.id,
          email: admin.email,
          displayName: admin.display_name,
          platformRole: admin.platform_role,
          isPlatformAdmin: Boolean(admin.is_platform_admin),
          status: admin.status,
          clerkUserId: admin.clerk_user_id,
          ownedWorkspaces: workspaces.filter((workspace) => workspace.owner_user_id === admin.id),
          memberships: memberships.filter((row) => row.user_id === admin.id)
        }
      : null
  };
}

async function main() {
  if (!databaseConfigured || !pool) {
    throw new Error("يتطلب PostgreSQL (MAW3ED_STORAGE=postgres و DATABASE_URL)");
  }

  const users = (
    await query(
      `SELECT id, email, display_name, platform_role, is_platform_admin, status, clerk_user_id, created_at
       FROM app_users
       ORDER BY created_at ASC`
    )
  ).rows;

  const keepEmails = new Set(KEEP_USER_EMAILS.map(normalizeEmail));
  const ownerEmails = new Set(KEEP_OWNER_EMAILS.map(normalizeEmail));
  const adminEmail = normalizeEmail(PLATFORM_ADMIN_EMAIL);

  const platformAdminUser = users.find((user) => normalizeEmail(user.email) === adminEmail) || null;
  const ownerUsers = users.filter((user) => ownerEmails.has(normalizeEmail(user.email)));

  const keepUserIds = new Set(
    users.filter((user) => keepEmails.has(normalizeEmail(user.email))).map((user) => user.id)
  );
  const removeUsers = users.filter((user) => !keepUserIds.has(user.id));

  const workspaces = (
    await query(
      `SELECT id, name, slug, activity_type, owner_user_id, status, created_at
       FROM workspaces
       ORDER BY created_at ASC`
    )
  ).rows;

  // Keep ONLY the two mapped demo workspaces — orphan spaces (e.g. haitham-fakhry) go.
  const keepWorkspaceIds = new Set(KEEP_WORKSPACE_IDS);
  const removeWorkspaces = workspaces.filter((workspace) => !keepWorkspaceIds.has(workspace.id));

  const memberships = await loadMemberships();
  const staffLinks = await loadStaffLinks();

  const adminId = platformAdminUser?.id || null;
  const adminOwnedKept = workspaces.filter(
    (workspace) => adminId && workspace.owner_user_id === adminId && keepWorkspaceIds.has(workspace.id)
  );
  const adminOwnedOrphans = workspaces.filter(
    (workspace) => adminId && workspace.owner_user_id === adminId && !keepWorkspaceIds.has(workspace.id)
  );
  const adminMemberships = memberships.filter((row) => adminId && row.user_id === adminId);
  const adminStaffLinks = staffLinks.filter((row) => adminId && row.user_id === adminId);
  const ownersWithAdminFlags = ownerUsers.filter((user) => isPlatformAdminRow(user));

  const report = {
    mode: dryRun ? "dry-run" : "apply",
    platformAdminEmail: PLATFORM_ADMIN_EMAIL,
    keepOwnerEmails: KEEP_OWNER_EMAILS,
    keepUserEmails: KEEP_USER_EMAILS,
    keepWorkspaceIds: [...keepWorkspaceIds],
    platformAdmin: platformAdminUser
      ? {
          id: platformAdminUser.id,
          email: platformAdminUser.email,
          displayName: platformAdminUser.display_name,
          platformRole:
            platformAdminUser.platform_role ||
            (platformAdminUser.is_platform_admin ? "super_admin" : null),
          isPlatformAdmin: Boolean(platformAdminUser.is_platform_admin),
          status: platformAdminUser.status,
          clerkUserId: platformAdminUser.clerk_user_id,
          workspaceMemberships: adminMemberships,
          staffLinks: adminStaffLinks.map((row) => ({
            id: row.id,
            workspaceId: row.workspace_id,
            staffId: row.staff_id
          })),
          ownedWorkspaces: workspaces
            .filter((workspace) => workspace.owner_user_id === platformAdminUser.id)
            .map((workspace) => ({ id: workspace.id, slug: workspace.slug, name: workspace.name }))
        }
      : null,
    currentPlatformAdmins: users.filter(isPlatformAdminRow).map((user) => ({
      id: user.id,
      email: user.email,
      platformRole: user.platform_role || (user.is_platform_admin ? "super_admin" : null),
      isPlatformAdmin: Boolean(user.is_platform_admin)
    })),
    plannedRoleActions: {
      ensurePlatformAdmin: PLATFORM_ADMIN_EMAIL,
      promoteFakhry: Boolean(platformAdminUser),
      stripOwnerPlatformFlags: ownerUsers.map((user) => user.email),
      ownersCurrentlyFlaggedAdmin: ownersWithAdminFlags.map((user) => user.email),
      detachAdminFromWorkspaces: {
        memberships: adminMemberships.length,
        staffLinks: adminStaffLinks.length,
        orphanOwnedToDelete: adminOwnedOrphans.map((workspace) => ({
          id: workspace.id,
          slug: workspace.slug,
          name: workspace.name
        }))
      },
      adminMissing: !platformAdminUser,
      adminOwnsKeptDemoWorkspace: adminOwnedKept.map((workspace) => ({
        id: workspace.id,
        slug: workspace.slug
      }))
    },
    keptUsers: users
      .filter((user) => keepUserIds.has(user.id))
      .map((user) => ({
        id: user.id,
        email: user.email,
        platformRole: user.platform_role,
        isPlatformAdmin: Boolean(user.is_platform_admin),
        roleAfterCleanup:
          normalizeEmail(user.email) === adminEmail
            ? "super_admin (no workspace)"
            : "workspace_owner (not platform admin)"
      })),
    usersToRemove: removeUsers.map((user) => ({ id: user.id, email: user.email })),
    workspacesToRemove: removeWorkspaces.map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      ownerUserId: workspace.owner_user_id
    }))
  };

  console.log(JSON.stringify(report, null, 2));

  if (!platformAdminUser) {
    const message = `مسؤول المنصة المطلوب غير موجود: ${PLATFORM_ADMIN_EMAIL}. أنشئ الحساب أولاً ثم أعد التشغيل.`;
    if (!dryRun) throw new Error(message);
    console.log(`\n[cleanup] WARNING: ${message}`);
  }

  if (adminOwnedKept.length) {
    const message = `fail-closed: ${PLATFORM_ADMIN_EMAIL} يملك مساحة عرض محفوظة ويجب ألا يملك أي مساحة: ${adminOwnedKept
      .map((row) => row.id)
      .join(", ")}`;
    if (!dryRun) throw new Error(message);
    console.log(`\n[cleanup] WARNING: ${message}`);
  }

  // Owners must exist for a complete local demo cleanup.
  for (const email of KEEP_OWNER_EMAILS) {
    if (!ownerUsers.some((user) => normalizeEmail(user.email) === normalizeEmail(email))) {
      console.log(`\n[cleanup] WARNING: المالك المطلوب غير موجود بعد: ${email}`);
    }
  }

  if (dryRun) {
    console.log(
      "\n[cleanup] dry-run فقط — لم يُغيَّر شيء. للتنفيذ: npm run users:cleanup-demo-owners -- --apply"
    );
    return report;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `UPDATE app_users
       SET platform_role = 'super_admin',
           is_platform_admin = TRUE,
           updated_at = NOW()
       WHERE id = $1`,
      [platformAdminUser.id]
    );
    console.log(`[cleanup] platform admin → ${PLATFORM_ADMIN_EMAIL} (${platformAdminUser.id})`);

    // Always clear platform flags on the two owners (even if currently unset).
    for (const user of ownerUsers) {
      await client.query(
        `UPDATE app_users
         SET platform_role = NULL,
             is_platform_admin = FALSE,
             updated_at = NOW()
         WHERE id = $1`,
        [user.id]
      );
      console.log(`[cleanup] owner not platform admin → ${user.email}`);
    }

    await safeClientQuery(
      client,
      `DELETE FROM workspace_staff_links WHERE user_id = $1`,
      [platformAdminUser.id],
      { relation: "workspace_staff_links" }
    );
    await safeClientQuery(
      client,
      `DELETE FROM workspace_members WHERE user_id = $1`,
      [platformAdminUser.id],
      { relation: "workspace_members" }
    );
    console.log(`[cleanup] detached ${PLATFORM_ADMIN_EMAIL} from all workspace memberships/staff links`);

    const removeIds = removeUsers.map((user) => user.id);
    await reassignSoftUserFks(client, removeIds, platformAdminUser.id);

    // Delete orphan/non-demo workspaces first (includes fakhry-owned haitham-fakhry).
    // workspaces.owner_user_id has NO ON DELETE CASCADE toward app_users — wipe deps then delete.
    for (const workspace of removeWorkspaces) {
      await deleteWorkspaceFully(client, workspace);
    }

    for (const user of removeUsers) {
      const ownedKept = (
        await client.query(`SELECT id, slug FROM workspaces WHERE owner_user_id = $1`, [user.id])
      ).rows;
      if (ownedKept.length) {
        throw new Error(
          `رفض الحذف fail-closed: المستخدم ${user.email} ما زال مالكاً لمساحات محفوظة: ${ownedKept
            .map((row) => row.id)
            .join(", ")}`
        );
      }
      try {
        await client.query(`DELETE FROM app_users WHERE id = $1`, [user.id]);
      } catch (error) {
        error.message = `فشل حذف المستخدم ${user.email}: ${formatPgError(error)}`;
        throw error;
      }
      console.log(`[cleanup] deleted user ${user.email} (${user.id})`);
    }

    const leftoverMembers = (
      await safeClientQuery(
        client,
        `SELECT workspace_id FROM workspace_members WHERE user_id = $1`,
        [platformAdminUser.id],
        { relation: "workspace_members" }
      )
    ).rows;
    const leftoverOwned = (
      await client.query(`SELECT id FROM workspaces WHERE owner_user_id = $1`, [platformAdminUser.id])
    ).rows;
    if (leftoverMembers.length || leftoverOwned.length) {
      throw new Error(`fail-closed: ${PLATFORM_ADMIN_EMAIL} ما زال مرتبطاً بمساحات بعد التنظيف`);
    }

    const remaining = (await client.query(`SELECT email FROM app_users ORDER BY email`)).rows.map(
      (row) => normalizeEmail(row.email)
    );
    const expected = new Set(KEEP_USER_EMAILS.map(normalizeEmail));
    const unexpected = remaining.filter((email) => !expected.has(email));
    const missingKeep = [...expected].filter((email) => !remaining.includes(email));
    if (unexpected.length) {
      throw new Error(`fail-closed: بقي مستخدمون غير مسموح بهم: ${unexpected.join(", ")}`);
    }
    if (missingKeep.length) {
      console.log(`[cleanup] WARNING: مستخدمون مطلوبون غير موجودين: ${missingKeep.join(", ")}`);
    }

    await client.query("COMMIT");
    console.log("[cleanup] apply complete");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const after = await fetchFinalAdminReport(PLATFORM_ADMIN_EMAIL);
  console.log("\n[cleanup] final state:");
  console.log(JSON.stringify(after, null, 2));
  report.finalState = after;
  return report;
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error("[cleanup] FAILED:", formatPgError(error));
      process.exitCode = 1;
    })
    .finally(async () => {
      if (pool) await pool.end();
    });
}

module.exports = {
  main,
  PLATFORM_ADMIN_EMAIL,
  KEEP_OWNER_EMAILS,
  KEEP_USER_EMAILS,
  KEEP_WORKSPACE_IDS
};
