#!/usr/bin/env node
/**
 * استعادة/حفظ البذرة الموحدة (طبي + طلائع) من/إلى مساحات المالكين الصحيحة.
 *
 *   npm run seed:demo:restore
 *   npm run seed:demo:restore -- --section=medical
 *   npm run seed:demo:restore -- --section=education --replace
 *   npm run seed:demo:save -- --section=medical
 *   npm run seed:demo:save -- --section=education
 *
 * medical   → contact.haitham@gmail.com  (dawybooking)
 * education → contact.haitham@yahoo.com (talaaee-book)
 *
 * npm run migrate / npm run seed لا يحمّلان هذه البذرة.
 */
"use strict";

const fs = require("fs");
const path = require("path");
require("./load-env");

const { query, pool, databaseConfigured } = require("../db");
const ops = require("../opsStore");
const opsWorkspace = require("../opsWorkspace");
const {
  SECTION_TARGETS,
  sectionKeys,
  getSectionTarget,
  readDemoSeedBundle,
  writeDemoSeedBundle,
  getSectionStore,
  setSectionStore,
  applyActivityFields,
  pickOwnedWorkspaceForSection,
  summarizeStore,
  canonicalSeedPath
} = require("./demo-seed-store");

const args = process.argv.slice(2);
const doRestore = args.includes("--restore");
const doSave = args.includes("--save");
const doReplace = args.includes("--replace");
const noBackup = args.includes("--no-backup");
const keepActivity = args.includes("--keep-activity");
const sectionArg = args.find((item) => item.startsWith("--section="));
const wsArg = args.find((item) => item.startsWith("--workspace="));
const ownerArg = args.find((item) => item.startsWith("--owner-email="));

const requestedSection = sectionArg ? sectionArg.slice("--section=".length).trim().toLowerCase() : "all";
const requestedWorkspaceId = wsArg ? wsArg.slice("--workspace=".length).trim() : "";
const ownerEmailOverride = ownerArg ? ownerArg.slice("--owner-email=".length).trim() : "";

function cloneStore(store) {
  return JSON.parse(JSON.stringify(store));
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mergeSeedObject(seedObject, currentObject) {
  const merged = { ...seedObject };
  for (const [key, currentValue] of Object.entries(currentObject)) {
    const seedValue = seedObject[key];
    if (isRecord(seedValue) && isRecord(currentValue)) {
      merged[key] = mergeSeedObject(seedValue, currentValue);
    } else {
      merged[key] = currentValue;
    }
  }
  return merged;
}

function seedArrayKey(value) {
  if (isRecord(value)) {
    for (const key of ["id", "weekday", "date", "key"]) {
      if (value[key] !== undefined && value[key] !== null) return `${key}:${value[key]}`;
    }
    return `json:${JSON.stringify(value)}`;
  }
  return `${typeof value}:${String(value)}`;
}

function mergeSeedArray(seedArray, currentArray) {
  const merged = new Map();
  for (const item of seedArray) merged.set(seedArrayKey(item), cloneStore(item));
  for (const item of currentArray) {
    const key = seedArrayKey(item);
    const seedItem = merged.get(key);
    merged.set(key, isRecord(seedItem) && isRecord(item) ? { ...seedItem, ...item } : cloneStore(item));
  }
  return [...merged.values()];
}

function mergeSeedStore(currentStore, seedStore) {
  const merged = cloneStore(seedStore);
  for (const [key, currentValue] of Object.entries(currentStore)) {
    const seedValue = seedStore[key];
    if (Array.isArray(seedValue) && Array.isArray(currentValue)) {
      merged[key] = mergeSeedArray(seedValue, currentValue);
    } else if (isRecord(seedValue) && isRecord(currentValue)) {
      merged[key] = mergeSeedObject(seedValue, currentValue);
    } else {
      merged[key] = currentValue;
    }
  }
  return merged;
}

function backupOpsFile(wsId) {
  const src = path.join(__dirname, "..", "data", "workspaces", wsId, "maw3ed-ops.json");
  if (!fs.existsSync(src)) return null;
  const backupDir = path.join(__dirname, "..", "data", "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = path.join(backupDir, `${wsId}-maw3ed-ops-${stamp}.json`);
  fs.copyFileSync(src, dest);
  return dest;
}

function mapWorkspaceRow(row, sectionKey, extra = {}) {
  const target = getSectionTarget(sectionKey);
  const activityTemplates = require("../activityTemplatesCatalog");
  const resolved = activityTemplates.resolveTemplateId(row.activity_type || "");
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    activityType: row.activity_type,
    locale: row.locale,
    needsActivityConversion: resolved !== target.activityType,
    sectionKey,
    ...extra
  };
}

async function resolveSectionWorkspace(sectionKey) {
  const sectionTarget = getSectionTarget(sectionKey);
  const ownerEmail = ownerEmailOverride || sectionTarget.ownerEmail;

  if (requestedWorkspaceId) {
    const safeId = opsWorkspace.sanitizeWorkspaceId(requestedWorkspaceId);
    if (safeId !== requestedWorkspaceId) {
      throw new Error(`معرّف مساحة العمل غير صالح: ${requestedWorkspaceId}`);
    }
    if (!databaseConfigured) {
      return {
        id: safeId,
        sectionKey,
        ownerEmail,
        needsActivityConversion: false,
        explicit: true
      };
    }
    const result = await query(
      `SELECT id, name, slug, activity_type, locale
       FROM workspaces WHERE id = $1 AND status = 'active'`,
      [safeId]
    );
    if (!result.rows[0]) throw new Error(`مساحة العمل غير موجودة أو غير نشطة: ${safeId}`);
    return mapWorkspaceRow(result.rows[0], sectionKey, { ownerEmail, explicit: true });
  }

  if (!databaseConfigured) {
    throw new Error(
      `تعذّر حل مساحة قسم ${sectionKey}: فعّل PostgreSQL أو مرّر --workspace=<id>.`
    );
  }

  // Prefer exact preferred workspace id when it exists (even before email filter).
  const preferred = await query(
    `SELECT id, name, slug, activity_type, locale, owner_user_id
     FROM workspaces WHERE id = $1 AND status = 'active'`,
    [sectionTarget.preferredWorkspaceId]
  );
  if (preferred.rows[0] && !ownerEmailOverride) {
    return mapWorkspaceRow(preferred.rows[0], sectionKey, {
      ownerEmail,
      pickReason: "preferred_id_global"
    });
  }

  const result = await query(
    `SELECT DISTINCT w.id, w.name, w.slug, w.activity_type, w.locale, w.created_at
     FROM app_users u
     JOIN workspaces w ON w.owner_user_id = u.id AND w.status = 'active'
     JOIN workspace_members wm
       ON wm.workspace_id = w.id AND wm.user_id = u.id AND wm.role = 'owner'
     WHERE LOWER(BTRIM(u.email)) = LOWER(BTRIM($1))
     ORDER BY w.created_at ASC`,
    [ownerEmail]
  );
  const picked = pickOwnedWorkspaceForSection(result.rows, sectionKey);
  if (!picked.target) {
    const available = result.rows.length
      ? result.rows.map((row) => `${row.name} [${row.activity_type}] (${row.id})`).join(", ")
      : "لا توجد مساحة نشطة مملوكة لهذا الحساب";
    throw new Error(
      `تعذّر تحديد مساحة قسم ${sectionKey} للحساب ${ownerEmail} (سبب: ${picked.reason}). المساحات: ${available}. مرّر --workspace=<id>.`
    );
  }
  return mapWorkspaceRow(picked.target, sectionKey, {
    ownerEmail,
    pickReason: picked.reason
  });
}

async function ensureWorkspaceActivity(target) {
  const sectionTarget = getSectionTarget(target.sectionKey);
  if (keepActivity) return { converted: false, skipped: true };
  if (!target.needsActivityConversion) return { converted: false };

  const activityType = sectionTarget.activityType;
  if (!databaseConfigured) {
    target.activityType = activityType;
    target.needsActivityConversion = false;
    return { converted: true, persistence: "ops-only" };
  }

  console.log(
    `[seed-demo] تحويل نشاط ${target.id} → ${activityType} (كان: ${target.activityType || "?"}) مع الإبقاء على المالك/الـ slug`
  );
  await query(
    `UPDATE workspaces SET activity_type = $2, updated_at = NOW() WHERE id = $1`,
    [target.id, activityType]
  );
  await query(`UPDATE organizations SET activity_type = $2 WHERE workspace_id = $1`, [
    target.id,
    activityType
  ]);
  await query(
    `UPDATE workspace_ops_profiles
     SET activity_mode = $2,
         activity_template_id = $2,
         activity_mode_locked = FALSE,
         updated_at = NOW()
     WHERE workspace_id = $1`,
    [target.id, activityType]
  );
  target.activityType = activityType;
  target.needsActivityConversion = false;
  return { converted: true, persistence: "postgres" };
}

function applyWorkspaceIdentity(store, ctx, workspaceTarget) {
  const currentPage = ctx.data.bookingPage || {};
  const nextPage = {
    ...(store.bookingPage || {}),
    ...currentPage
  };
  const previousSlug = currentPage.slug;
  const sectionTarget = getSectionTarget(workspaceTarget.sectionKey);
  const targetSlug =
    workspaceTarget?.slug || sectionTarget.preferredSlug || previousSlug || nextPage.slug;

  if (targetSlug) {
    const registeredSlug = opsWorkspace.isPostgresWorkspace()
      ? targetSlug
      : opsWorkspace.registerSlug(targetSlug, workspaceTarget.id);
    nextPage.slug = registeredSlug;
    if (!opsWorkspace.isPostgresWorkspace() && previousSlug && previousSlug !== registeredSlug) {
      opsWorkspace.unregisterSlug(previousSlug, workspaceTarget.id);
    }
  }
  if (workspaceTarget?.name) nextPage.businessName = workspaceTarget.name;
  else if (sectionTarget.preferredName && doReplace) nextPage.businessName = sectionTarget.preferredName;
  if (workspaceTarget?.locale) nextPage.locale = workspaceTarget.locale;
  if (workspaceTarget?.ownerEmail) {
    nextPage.email = workspaceTarget.ownerEmail;
    const logoUrl = currentPage.logoUrl || "";
    const logoWorkspaceId = logoUrl.match(/\/workspaces\/([^/]+)\//)?.[1];
    nextPage.logoUrl = logoWorkspaceId && logoWorkspaceId !== workspaceTarget.id ? "" : logoUrl;
  }
  store.bookingPage = nextPage;
}

async function restoreSection(sectionKey, bundle) {
  const sectionTarget = getSectionTarget(sectionKey);
  const workspaceTarget = await resolveSectionWorkspace(sectionKey);
  console.log(
    `[seed-demo] restore section=${sectionKey} → workspace=${workspaceTarget.id}` +
      (workspaceTarget.name ? ` name=${workspaceTarget.name}` : "") +
      ` owner=${workspaceTarget.ownerEmail || sectionTarget.ownerEmail}` +
      (workspaceTarget.pickReason ? ` pick=${workspaceTarget.pickReason}` : "")
  );

  const seedStore = getSectionStore(bundle, sectionKey);
  const activityResult = await ensureWorkspaceActivity(workspaceTarget);

  const counts = await ops.withWorkspaceAsync(workspaceTarget.id, async () => {
    if (!noBackup) {
      const backup = backupOpsFile(workspaceTarget.id);
      if (backup) console.log(`[seed-demo] pre-restore backup → ${backup}`);
    }
    const ctx = opsWorkspace.getContext(() => cloneStore(seedStore));
    const next = doReplace ? cloneStore(seedStore) : mergeSeedStore(ctx.data, seedStore);
    applyActivityFields(next, sectionTarget.activityType);
    applyWorkspaceIdentity(next, ctx, workspaceTarget);
    opsWorkspace.replaceStoreData(ctx, next);
    return {
      section: sectionKey,
      workspaceId: workspaceTarget.id,
      ...summarizeStore(ctx.data),
      mode: doReplace ? "replace" : "merge",
      activityConversion: activityResult
    };
  });

  console.log(`[seed-demo] restore done section=${sectionKey}`);
  console.log(JSON.stringify(counts, null, 2));
  return counts;
}

async function saveSection(sectionKey) {
  const workspaceTarget = await resolveSectionWorkspace(sectionKey);
  console.log(
    `[seed-demo] save section=${sectionKey} ← workspace=${workspaceTarget.id}` +
      (workspaceTarget.name ? ` name=${workspaceTarget.name}` : "")
  );

  const liveStore = await ops.withWorkspaceAsync(workspaceTarget.id, async () => {
    const ctx = opsWorkspace.getContext(() => ({ staff: [], services: [], customers: [] }));
    return cloneStore(ctx.data);
  });

  let bundle;
  try {
    bundle = readDemoSeedBundle({ migrate: true });
  } catch (error) {
    if (error.code !== "SEED_MISSING") throw error;
    bundle = { sections: {} };
  }
  bundle = setSectionStore(bundle, sectionKey, liveStore, { source: "save", workspaceId: workspaceTarget.id });
  // Ensure the other section still exists when first creating the unified file.
  if (sectionKey === "medical" && !bundle.sections.education?.store) {
    const { buildEducationStore } = require("./demo-seed-store");
    bundle = setSectionStore(bundle, "education", buildEducationStore(), {
      source: "template-bootstrap"
    });
  }
  if (sectionKey === "education" && !bundle.sections.medical?.store) {
    throw new Error(
      "لا يمكن حفظ قسم education قبل وجود قسم medical في البذرة. استعد/احفظ medical أولاً أو شغّل ترحيل الملف الكانوني."
    );
  }

  const written = writeDemoSeedBundle(bundle, {
    source: `save:${sectionKey}`,
    savedWorkspaceId: workspaceTarget.id
  });
  console.log(`[seed-demo] canonical saved → ${path.relative(process.cwd(), written.path)}`);
  console.log(JSON.stringify(written.meta.sections, null, 2));
  return written.meta;
}

function resolveSectionsToRun() {
  if (!requestedSection || requestedSection === "all") return sectionKeys();
  if (requestedSection === "talaaee") return ["education"];
  if (requestedSection === "hospital") return ["medical"];
  getSectionTarget(requestedSection);
  return [requestedSection];
}

async function main() {
  if (doRestore && doSave) {
    throw new Error("استخدم --restore أو --save فقط");
  }
  if (!doRestore && !doSave) {
    console.log(`Usage:
  npm run seed:demo:restore
  npm run seed:demo:restore -- --section=medical|education|all [--replace]
  npm run seed:demo:save -- --section=medical|education
  Overrides: --owner-email=...  --workspace=...  --keep-activity  --no-backup

Canonical file: ${path.relative(process.cwd(), canonicalSeedPath())}
  medical   → ${SECTION_TARGETS.medical.ownerEmail} / ${SECTION_TARGETS.medical.preferredSlug}
  education → ${SECTION_TARGETS.education.ownerEmail} / ${SECTION_TARGETS.education.preferredSlug}`);
    process.exit(1);
  }

  const sections = resolveSectionsToRun();
  if (doSave && sections.length !== 1) {
    throw new Error("الحفظ يتطلب --section=medical أو --section=education");
  }

  if (doRestore) {
    const bundle = readDemoSeedBundle({ migrate: true });
    console.log(`[seed-demo] restoring from ${path.relative(process.cwd(), canonicalSeedPath())}`);
    const results = [];
    for (const key of sections) {
      results.push(await restoreSection(key, bundle));
    }
    console.log("[seed-demo] all requested sections restored");
    console.log("تذكير: npm run migrate / npm run seed لا يستعيدان هذه البذرة.");
    return results;
  }

  return saveSection(sections[0]);
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error("[seed-demo] FAILED:", error.message || error);
      process.exitCode = 1;
    })
    .finally(async () => {
      if (pool) await pool.end();
    });
}

module.exports = {
  resolveSectionWorkspace,
  restoreSection,
  saveSection,
  resolveSectionsToRun
};
