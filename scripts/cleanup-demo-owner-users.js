#!/usr/bin/env node
/**
 * تنظيف مستخدمي التطبيق محلياً — يبقي فقط مالكي مساحتي العرض + مسؤولي المنصة.
 *
 * يُبقى:
 *   - contact.haitham@gmail.com  (مستشفيات داوي / غالباً super_admin)
 *   - contact.haitham@yahoo.com  (مركز طلائع التعليمي)
 *   - أي مستخدم platform_role / is_platform_admin
 *   - مساحتا dawybooking و talaaee-book المفضّلتان
 *
 * يحذف باقي المستخدمين والمساحات اليتيمة (fail-closed مع --dry-run افتراضياً).
 *
 * Usage:
 *   npm run users:cleanup-demo-owners -- --dry-run
 *   npm run users:cleanup-demo-owners -- --apply
 */
"use strict";

require("./load-env");
const { pool, databaseConfigured, query } = require("../db");
const { KEEP_OWNER_EMAILS, SECTION_TARGETS } = require("./demo-seed-store");

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

  const platformAdmins = users.filter(
    (user) => user.platform_role || user.is_platform_admin === true
  );
  const keepEmails = new Set(KEEP_OWNER_EMAILS.map(normalizeEmail));
  const keepUserIds = new Set();

  for (const user of users) {
    const email = normalizeEmail(user.email);
    if (keepEmails.has(email) || user.platform_role || user.is_platform_admin === true) {
      keepUserIds.add(user.id);
    }
  }

  const removeUsers = users.filter((user) => !keepUserIds.has(user.id));

  const workspaces = (
    await query(
      `SELECT id, name, slug, activity_type, owner_user_id, status, created_at
       FROM workspaces
       ORDER BY created_at ASC`
    )
  ).rows;

  const keepWorkspaceIds = new Set(
    workspaces
      .filter(
        (workspace) =>
          KEEP_WORKSPACE_IDS.includes(workspace.id) || keepUserIds.has(workspace.owner_user_id)
      )
      .map((workspace) => workspace.id)
  );

  // Always force-keep the two mapped demo workspaces if present.
  for (const id of KEEP_WORKSPACE_IDS) keepWorkspaceIds.add(id);

  const removeWorkspaces = workspaces.filter((workspace) => !keepWorkspaceIds.has(workspace.id));

  const report = {
    mode: dryRun ? "dry-run" : "apply",
    keepOwnerEmails: KEEP_OWNER_EMAILS,
    keepWorkspaceIds: [...keepWorkspaceIds],
    platformAdmins: platformAdmins.map((user) => ({
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      platformRole: user.platform_role || (user.is_platform_admin ? "super_admin" : null),
      isPlatformAdmin: Boolean(user.is_platform_admin),
      status: user.status,
      clerkUserId: user.clerk_user_id
    })),
    keptUsers: users
      .filter((user) => keepUserIds.has(user.id))
      .map((user) => ({
        id: user.id,
        email: user.email,
        platformRole: user.platform_role,
        isPlatformAdmin: Boolean(user.is_platform_admin)
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

  if (dryRun) {
    console.log("\n[cleanup] dry-run فقط — لم يُحذف شيء. للتنفيذ: npm run users:cleanup-demo-owners -- --apply");
    return report;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Null soft FKs that might block user deletes
    if (removeUsers.length) {
      const removeIds = removeUsers.map((user) => user.id);
      await client.query(
        `UPDATE platform_audit_events SET actor_user_id = NULL WHERE actor_user_id = ANY($1::text[])`,
        [removeIds]
      );
      await client.query(
        `UPDATE platform_settlements SET created_by = NULL WHERE created_by = ANY($1::text[])`,
        [removeIds]
      ).catch(() => null);
    }

    for (const workspace of removeWorkspaces) {
      await client.query(`DELETE FROM workspaces WHERE id = $1`, [workspace.id]);
      console.log(`[cleanup] deleted workspace ${workspace.id} (${workspace.slug || workspace.name})`);
    }

    for (const user of removeUsers) {
      // workspace_members / staff links cascade; owned workspaces already removed or kept
      const ownedKept = (
        await client.query(
          `SELECT id, slug FROM workspaces WHERE owner_user_id = $1`,
          [user.id]
        )
      ).rows;
      if (ownedKept.length) {
        throw new Error(
          `رفض الحذف fail-closed: المستخدم ${user.email} ما زال مالكاً لمساحات محفوظة: ${ownedKept
            .map((row) => row.id)
            .join(", ")}`
        );
      }
      await client.query(`DELETE FROM app_users WHERE id = $1`, [user.id]);
      console.log(`[cleanup] deleted user ${user.email} (${user.id})`);
    }

    await client.query("COMMIT");
    console.log("[cleanup] apply complete");
    return report;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error("[cleanup] FAILED:", error.message || error);
      process.exitCode = 1;
    })
    .finally(async () => {
      if (pool) await pool.end();
    });
}

module.exports = { main, KEEP_OWNER_EMAILS, KEEP_WORKSPACE_IDS };
