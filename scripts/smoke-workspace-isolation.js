#!/usr/bin/env node
/**
 * Smoke: two workspaces stay isolated for staff/appointments; slug collision blocked.
 */
const path = require("path");
const storeModule = path.join(__dirname, "..", "opsStore.js");
delete require.cache[require.resolve(storeModule)];
delete require.cache[require.resolve(path.join(__dirname, "..", "opsWorkspace.js"))];
const ops = require(storeModule);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const a = "ws-alpha-test";
  const b = "ws-beta-test";
  ops.seedWorkspaceStore(a, { slug: "clinic-alpha", businessName: "عيادة ألفا" });
  ops.seedWorkspaceStore(b, { slug: "clinic-beta", businessName: "عيادة بيتا" });

  await ops.withWorkspaceAsync(a, async () => {
    ops.resetOpsData();
    ops.updateBookingPage({ slug: "clinic-alpha", businessName: "عيادة ألفا" });
    const staff = ops.listStaff()[0];
    ops.updateStaff(staff.id, { name: "طبيب ألفا", firstName: "طبيب", lastName: "ألفا", title: "دكتور" });
    const service = ops.listServices()[0];
    ops.updateService(service.id, { providerIds: [staff.id], publicBooking: true });
  });

  await ops.withWorkspaceAsync(b, async () => {
    ops.resetOpsData();
    ops.updateBookingPage({ slug: "clinic-beta", businessName: "عيادة بيتا" });
    const staff = ops.listStaff()[0];
    ops.updateStaff(staff.id, { name: "طبيب بيتا", firstName: "طبيب", lastName: "بيتا", title: "دكتور" });
    const service = ops.listServices()[0];
    ops.updateService(service.id, { providerIds: [staff.id], publicBooking: true });
  });

  const staffA = await ops.withWorkspaceAsync(a, () => ops.listStaff().map((s) => s.name));
  const staffB = await ops.withWorkspaceAsync(b, () => ops.listStaff().map((s) => s.name));
  assert(staffA.includes("طبيب ألفا"), "workspace A should contain alpha staff");
  assert(!staffA.includes("طبيب بيتا"), "workspace A must not see beta staff");
  assert(staffB.includes("طبيب بيتا"), "workspace B should contain beta staff");
  assert(!staffB.includes("طبيب ألفا"), "workspace B must not see alpha staff");

  assert(ops.resolveWorkspaceIdForSlug("clinic-alpha") === a, "slug alpha maps to A");
  assert(ops.resolveWorkspaceIdForSlug("clinic-beta") === b, "slug beta maps to B");

  let collision = null;
  try {
    await ops.withWorkspaceAsync(b, () => {
      ops.updateBookingPage({ slug: "clinic-alpha" });
    });
  } catch (error) {
    collision = error;
  }
  assert(collision && collision.statusCode === 409, "slug collision must be 409");

  console.log(
    JSON.stringify(
      {
        ok: true,
        suite: "smoke-workspace-isolation",
        staffA,
        staffB,
        slugA: ops.resolveWorkspaceIdForSlug("clinic-alpha"),
        slugB: ops.resolveWorkspaceIdForSlug("clinic-beta")
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, suite: "smoke-workspace-isolation", error: error.message }, null, 2));
  process.exit(1);
});
