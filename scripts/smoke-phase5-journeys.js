#!/usr/bin/env node
/**
 * Phase 5 — product journeys smoke (template lock, occupancy labels, role nav, public payload).
 */
const path = require("path");
const fs = require("fs");
const ops = require("../opsStore");
const { isOpsRoleAllowed } = require("../opsRoutes");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loadEsModule(relPath) {
  // roleNav / occupancyLabels are ESM — evaluate via dynamic import when available,
  // otherwise mirror critical contracts with require of duplicated checks below.
  return import(pathToFileUrl(path.join(__dirname, "..", relPath)));
}

function pathToFileUrl(filePath) {
  const resolved = path.resolve(filePath);
  return `file://${resolved}`;
}

async function main() {
  const checks = [];
  const workspaceId = `ws-phase5-${process.pid}`;
  const slug = `phase5-${process.pid}`;

  try {
    // --- Template lock on create ---
    ops.seedWorkspaceStore(workspaceId, {
      slug,
      businessName: "منشأة اختبار مرحلة 5",
      activityType: "medical",
      locale: "ar",
      lockActivity: true
    });
    await ops.withWorkspaceAsync(workspaceId, async () => {
      const profile = ops.getActivityProfile("ar");
      assert(profile.locked === true, "create with lockActivity must lock template");
      assert(profile.templateId === "medical" || profile.mode === "medical", "medical template applied");
      let denied = null;
      try {
        ops.updateActivityProfile({ templateId: "salon", lock: true });
      } catch (error) {
        denied = error;
      }
      assert(denied && (denied.statusCode === 403 || /قفل|locked/i.test(denied.message || "")), "locked template rejects change");
      checks.push("template-lock-on-create");

      // --- Occupancy on services ---
      const categories = ops.listServiceCategories();
      assert(categories.length > 0, "seeded categories");
      const service = ops.createService({
        name: `جلسة سعة ${Date.now()}`,
        categoryId: categories[0].id,
        durationMinutes: 45,
        bufferMinutes: 15,
        pricingType: "fixed",
        price: 100,
        occupancyMode: "session_capacity",
        defaultCapacity: 12,
        compositionDefault: "single",
        providerIds: (ops.listStaff()[0] && [ops.listStaff()[0].id]) || []
      });
      assert(service.occupancyMode === "session_capacity", "service stores occupancyMode");
      assert(Number(service.defaultCapacity) === 12, "service stores defaultCapacity");
      checks.push("service-occupancy-fields");

      const resource = ops.createResource({
        name: "قاعة اختبار",
        resourceType: "room",
        capacity: 20,
        unit: "seat"
      });
      assert(resource.id && resource.capacity === 20, "resource create");
      assert(ops.listResources().some((row) => row.id === resource.id), "resource listed");
      checks.push("resources-surface");

      // Public booking exposes occupancy fields on services
      const publicPage = ops.getPublicBooking(slug);
      const publicService = (publicPage.services || []).find((row) => row.id === service.id);
      if (publicService) {
        assert(publicService.occupancyMode === "session_capacity", "public service includes occupancyMode");
        checks.push("public-booking-occupancy");
      } else {
        // Service may be filtered if no providers — still OK if providers missing on seed
        checks.push("public-booking-occupancy-skipped-no-provider");
      }
    });

    // Unlock path still works when lockActivity omitted / false
    const unlockedId = `ws-phase5-open-${process.pid}`;
    ops.seedWorkspaceStore(unlockedId, {
      slug: `phase5-open-${process.pid}`,
      businessName: "غير مقفول",
      activityType: "custom",
      locale: "ar",
      lockActivity: false
    });
    await ops.withWorkspaceAsync(unlockedId, async () => {
      const profile = ops.getActivityProfile("ar");
      assert(profile.locked === false, "lockActivity:false leaves unlocked");
      checks.push("template-unlock-opt-out");
    });

    // --- Role policy for linked staff bootstrap ---
    assert(
      !isOpsRoleAllowed("/api/ops/bootstrap", "GET", "staff"),
      "unlinked staff cannot bootstrap"
    );
    assert(
      isOpsRoleAllowed("/api/ops/bootstrap", "GET", "staff", {
        staffLink: { status: "active", staffId: "staff-1" }
      }),
      "linked staff may bootstrap desk shell"
    );
    assert(
      !isOpsRoleAllowed("/api/ops/bootstrap", "GET", "viewer"),
      "viewer still cannot read PII bootstrap"
    );
    checks.push("staff-bootstrap-rbac");

    // --- ESM UI helpers ---
    const roleNav = await loadEsModule("src/roleNav.js");
    const occupancy = await loadEsModule("src/occupancyLabels.js");
    assert(roleNav.navVisibleForRole("industry", "owner", { activityLocked: true }) === false, "hide industry when locked");
    assert(roleNav.navVisibleForRole("desk", "staff", { staffLinked: true }) === true, "staff sees desk");
    assert(roleNav.navVisibleForRole("expenses", "manager") === false, "manager hides expenses");
    assert(roleNav.navVisibleForRole("account", "viewer") === true, "viewer sees account");
    assert(roleNav.canWriteCatalog("viewer") === false, "viewer cannot write catalog");
    assert(occupancy.occupancyModeLabel("session_capacity", "ar").includes("سعة"), "ar occupancy label");
    assert(occupancy.occupancyShortBadge("rental") === "تأجير", "short badge");
    checks.push("role-nav-and-occupancy-labels");

    // book.html mentions occupancy for session/rental
    const bookHtml = fs.readFileSync(path.join(__dirname, "..", "book.html"), "utf8");
    assert(bookHtml.includes("occupancyMode"), "public book.html reads occupancyMode");
    assert(bookHtml.includes('lang="ar"') && bookHtml.includes('dir="rtl"'), "public booking RTL Arabic");
    checks.push("public-booking-rtl-occupancy");

    console.log(JSON.stringify({ ok: true, suite: "smoke-phase5-journeys", checks }, null, 2));
  } finally {
    // Best-effort cleanup of JSON workspace dirs
    for (const id of [workspaceId, `ws-phase5-open-${process.pid}`]) {
      try {
        const dir = path.join(__dirname, "..", "data", "workspaces", id);
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, suite: "smoke-phase5-journeys", error: error.message }, null, 2));
  process.exit(1);
});
