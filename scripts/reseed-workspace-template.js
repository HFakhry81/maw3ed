#!/usr/bin/env node
/**
 * Re-apply the current activity template catalog (categories + services)
 * onto an existing local ops workspace without changing the template id.
 *
 * Usage:
 *   node scripts/reseed-workspace-template.js --workspace=<id>
 *   node scripts/reseed-workspace-template.js --workspace=<id> --locale=en
 *   node scripts/reseed-workspace-template.js --workspace=<id> --force
 */
const path = require("path");

const args = process.argv.slice(2);
const getArg = (name, fallback = null) => {
  const hit = args.find((item) => item.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const hasFlag = (name) => args.includes(`--${name}`);

const workspaceId = getArg("workspace");
const locale = getArg("locale", "ar");
const force = hasFlag("force");

if (!workspaceId) {
  console.error("Usage: node scripts/reseed-workspace-template.js --workspace=<id> [--locale=ar|en] [--force]");
  process.exit(1);
}

const ops = require(path.join(__dirname, "..", "opsStore"));
const opsWorkspace = require(path.join(__dirname, "..", "opsWorkspace"));

ops.withWorkspace(workspaceId, () => {
  const profile = ops.getActivityProfile(locale);
  const appointments = ops.listAppointments();
  if (appointments.length && !force) {
    throw new Error(
      `Workspace has ${appointments.length} appointment(s). Pass --force to replace categories/services anyway.`
    );
  }
  const ctx = opsWorkspace.getContext(() => ({}));
  const wasLocked = Boolean(ctx.data.activityModeLocked);
  const templateId = ctx.data.activityTemplateId || profile.templateId || "custom";
  ops.applyActivityTemplate(templateId, locale, { replaceStaff: false });
  ctx.data.activityModeLocked = wasLocked;
  opsWorkspace.persistContext(ctx);
  const next = ops.getActivityProfile(locale);
  console.log(
    JSON.stringify(
      {
        ok: true,
        workspaceId,
        templateId: next.templateId,
        categories: ops.listServiceCategories().length,
        services: ops.listServices().length,
        locale,
        locked: next.locked
      },
      null,
      2
    )
  );
});
