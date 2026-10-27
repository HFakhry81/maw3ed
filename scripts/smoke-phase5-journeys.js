#!/usr/bin/env node
/**
 * Phase 5 — product journeys smoke:
 * template lock, occupancy UI helpers, role nav, signed manage links,
 * list pagination, public session_capacity enrollment, RTL/a11y markers.
 */
const path = require("path");
const fs = require("fs");
const ops = require("../opsStore");
const { isOpsRoleAllowed } = require("../opsRoutes");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loadEsModule(relPath) {
  return import(pathToFileUrl(path.join(__dirname, "..", relPath)));
}

function pathToFileUrl(filePath) {
  return `file://${path.resolve(filePath)}`;
}

async function main() {
  const checks = [];
  const workspaceId = `ws-phase5-${process.pid}`;
  const slug = `phase5-${process.pid}`;

  try {
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
      let denied = null;
      try {
        ops.updateActivityProfile({ templateId: "salon", lock: true });
      } catch (error) {
        denied = error;
      }
      assert(denied?.statusCode === 403 || /قفل|locked/i.test(denied?.message || ""), "locked template rejects change");
      checks.push("template-lock-on-create");

      const categories = ops.listServiceCategories();
      assert(categories.length > 0, "seeded categories");
      const staff = ops.listStaff();
      assert(staff.length > 0, "seeded staff");

      const sessionService = ops.createService({
        name: `جلسة سعة ${Date.now()}`,
        categoryId: categories[0].id,
        durationMinutes: 45,
        bufferMinutes: 0,
        pricingType: "fixed",
        price: 100,
        occupancyMode: "session_capacity",
        defaultCapacity: 3,
        compositionDefault: "single",
        publicBooking: true,
        providerIds: [staff[0].id]
      });
      assert(sessionService.occupancyMode === "session_capacity", "service stores occupancyMode");
      checks.push("service-occupancy-fields");

      const resource = ops.createResource({
        name: "قاعة اختبار",
        resourceType: "room",
        capacity: 20,
        unit: "seat"
      });
      assert(ops.listResources().some((row) => row.id === resource.id), "resource listed");
      checks.push("resources-surface");

      const publicPage = ops.getPublicBooking(slug);
      assert(
        (publicPage.services || []).some((row) => row.id === sessionService.id && row.occupancyMode === "session_capacity"),
        "public service includes occupancyMode"
      );
      checks.push("public-booking-occupancy");

      // --- Pagination ---
      for (let i = 0; i < 5; i += 1) {
        ops.createCustomer({
          firstName: `عميل${i}`,
          lastName: "اختبار",
          phone: `010000000${i}`,
          categoryId: "cat-new"
        });
      }
      const page1 = ops.listCustomers({ limit: 2, offset: 0 });
      assert(!Array.isArray(page1) && page1.items.length === 2, "customers page size 2");
      assert(page1.paging.total >= 5, "customers total >= 5");
      const page2 = ops.listCustomers({ limit: 2, offset: 2 });
      assert(page2.items.length === 2, "customers offset page");
      assert(page1.items[0].id !== page2.items[0].id, "pages differ");
      checks.push("list-pagination-customers");

      // --- Signed manage cancel/reschedule ---
      const exclusive = ops.createService({
        name: `حصري ${Date.now()}`,
        categoryId: categories[0].id,
        durationMinutes: 30,
        bufferMinutes: 0,
        pricingType: "fixed",
        price: 50,
        occupancyMode: "exclusive",
        publicBooking: true,
        providerIds: [staff[0].id]
      });
      const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      const appt = await ops.createAppointmentAsync({
        customerName: "سارة اختبار",
        phone: "0111111111",
        date,
        time: "10:00",
        staffId: staff[0].id,
        serviceId: exclusive.id
      });
      const manage = ops.issueManageForAppointment(appt);
      assert(manage?.token && manage.manageUrl, "manage token issued");
      const preview = ops.publicManagePreview(slug, manage.token);
      assert(preview.canCancel && preview.canReschedule, "manage preview allows cancel+reschedule");
      const cancelled = ops.publicManageCancel(slug, manage.token);
      assert(cancelled.appointment.status === "cancelled", "signed cancel works");
      let reused = null;
      try {
        ops.publicManageCancel(slug, manage.token);
      } catch (error) {
        reused = error;
      }
      assert(reused && (reused.statusCode === 409 || /مسبقا|USED/i.test(reused.message || "")), "cancel token single-use");
      checks.push("signed-manage-cancel");

      const appt2 = await ops.createAppointmentAsync({
        customerName: "سارة اختبار",
        phone: "0111111111",
        date,
        time: "11:00",
        staffId: staff[0].id,
        serviceId: exclusive.id
      });
      const manage2 = ops.issueManageForAppointment(appt2);
      const moved = await ops.publicManageReschedule(slug, manage2.token, {
        date,
        time: "12:00",
        staffId: staff[0].id
      });
      assert(moved.appointment.time === "12:00", "signed reschedule updates time");
      checks.push("signed-manage-reschedule");

      // --- Public session enrollment ---
      const starts = new Date(Date.now() + 2 * 86400000);
      starts.setMinutes(0, 0, 0);
      const ends = new Date(starts.getTime() + 60 * 60 * 1000);
      const occurrence = await ops.createSessionOccurrence({
        serviceId: sessionService.id,
        staffId: staff[0].id,
        resourceId: resource.id,
        capacity: 3,
        startsAt: starts.toISOString(),
        endsAt: ends.toISOString(),
        title: "جلسة عامة"
      });
      const listed = ops.listPublicSessionOccurrences(slug, { serviceId: sessionService.id });
      assert(listed.occurrences.some((row) => row.id === occurrence.id && row.remaining === 3), "public sessions list");
      const enroll1 = await ops.publicEnrollInSession(slug, {
        occurrenceId: occurrence.id,
        customerName: "أحمد جلسة",
        phone: "0122222222",
        seats: 2
      });
      assert(enroll1.enrollment?.status === "confirmed", "public enroll confirmed");
      assert(enroll1.remaining === 1, "remaining seats after enroll");
      assert(enroll1.manageUrl, "enrollment manage url");
      const enroll2 = await ops.publicEnrollInSession(slug, {
        occurrenceId: occurrence.id,
        customerName: "منى جلسة",
        phone: "0133333333",
        seats: 1
      });
      assert(enroll2.remaining === 0, "filled to capacity");
      let overflow = null;
      try {
        await ops.publicEnrollInSession(slug, {
          occurrenceId: occurrence.id,
          customerName: "زيادة",
          phone: "0144444444",
          seats: 1
        });
      } catch (error) {
        overflow = error;
      }
      assert(overflow, "overflow enroll rejected");
      const cancelEnroll = ops.publicManageCancel(slug, enroll1.manageToken);
      assert(cancelEnroll.freed === true || cancelEnroll.enrollment?.status === "cancelled", "enrollment cancel via manage token");
      checks.push("public-session-enrollment");
    });

    const unlockedId = `ws-phase5-open-${process.pid}`;
    ops.seedWorkspaceStore(unlockedId, {
      slug: `phase5-open-${process.pid}`,
      businessName: "غير مقفول",
      activityType: "custom",
      locale: "ar",
      lockActivity: false
    });
    await ops.withWorkspaceAsync(unlockedId, async () => {
      assert(ops.getActivityProfile("ar").locked === false, "lockActivity:false leaves unlocked");
      checks.push("template-unlock-opt-out");
    });

    assert(!isOpsRoleAllowed("/api/ops/bootstrap", "GET", "staff"), "unlinked staff cannot bootstrap");
    assert(
      isOpsRoleAllowed("/api/ops/bootstrap", "GET", "staff", {
        staffLink: { status: "active", staffId: "staff-1" }
      }),
      "linked staff may bootstrap desk shell"
    );
    checks.push("staff-bootstrap-rbac");

    const roleNav = await loadEsModule("src/roleNav.js");
    const occupancy = await loadEsModule("src/occupancyLabels.js");
    assert(roleNav.navVisibleForRole("industry", "owner", { activityLocked: true }) === false, "hide industry when locked");
    assert(occupancy.occupancyShortBadge("rental") === "تأجير", "short badge");
    checks.push("role-nav-and-occupancy-labels");

    const bookHtml = fs.readFileSync(path.join(__dirname, "..", "book.html"), "utf8");
    assert(bookHtml.includes("sessions/") && bookHtml.includes("enroll"), "book.html session enroll path");
    assert(bookHtml.includes("skip") && bookHtml.includes("aria-"), "book.html a11y markers");
    assert(bookHtml.includes('lang="ar"') && bookHtml.includes('dir="rtl"'), "public booking RTL Arabic");
    const manageHtml = fs.readFileSync(path.join(__dirname, "..", "manage.html"), "utf8");
    assert(manageHtml.includes("manage/") && manageHtml.includes("تخطّي"), "manage.html exists with a11y skip");
    checks.push("public-booking-rtl-a11y");

    // Platform unlock deferred: no admin unlock surface in this package.
    const adminRoutes = fs.readFileSync(path.join(__dirname, "..", "platformAdminRoutes.js"), "utf8");
    assert(!/activity_mode_locked|unlockActivity|activityTemplate/.test(adminRoutes), "platform unlock still absent — deferred");
    checks.push("platform-unlock-deferred");

    console.log(JSON.stringify({ ok: true, suite: "smoke-phase5-journeys", checks }, null, 2));
  } finally {
    for (const id of [workspaceId, `ws-phase5-open-${process.pid}`]) {
      try {
        fs.rmSync(path.join(__dirname, "..", "data", "workspaces", id), { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, suite: "smoke-phase5-journeys", error: error.message, stack: error.stack }, null, 2));
  process.exit(1);
});
