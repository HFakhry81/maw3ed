#!/usr/bin/env node
/**
 * Smoke: workspace staff account links (one-to-one per workspace) + desk scope policy.
 */
const fs = require("fs");
const path = require("path");
const {
  upsertLink,
  getActiveLinkForUser,
  suspendLink,
  listWorkspaceLinks,
  filterDeskPayload,
  appointmentInStaffScope,
  isDeskRoute,
  linksPath
} = require("../staffLinks");
const { isOpsRoleAllowed } = require("../opsRoutes");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const workspaceId = `ws-stafflink-${process.pid}`;
  const otherWorkspaceId = `ws-stafflink-b-${process.pid}`;
  const userA = "user-a";
  const userB = "user-b";
  const staffA = "staff-a";
  const staffB = "staff-b";

  try {
    // Policy: unlinked staff fail closed; linked staff get desk only.
    assert(
      !isOpsRoleAllowed("/api/ops/desk/check-in", "POST", "staff"),
      "unlinked staff must be denied desk"
    );
    assert(
      isOpsRoleAllowed("/api/ops/desk/check-in", "POST", "staff", {
        staffLink: { status: "active", staffId: staffA }
      }),
      "linked staff may check in"
    );
    assert(
      isOpsRoleAllowed("/api/ops/desk/today", "GET", "staff", {
        staffLink: { status: "active", staffId: staffA }
      }),
      "linked staff may read scoped desk today"
    );
    assert(
      !isOpsRoleAllowed("/api/ops/desk/appointments/appt-1/addons", "POST", "staff", {
        staffLink: { status: "active", staffId: staffA }
      }),
      "linked staff must not price/add desk addons"
    );
    assert(
      !isOpsRoleAllowed("/api/ops/customers", "GET", "staff", {
        staffLink: { status: "active", staffId: staffA }
      }),
      "linked staff must not list all customers"
    );
    assert(isDeskRoute("/api/ops/desk/preview", "POST"), "preview is a desk route");

    // One-to-one upsert within a workspace (JSON path).
    const link = await upsertLink({
      workspaceId,
      userId: userA,
      staffId: staffA,
      roleInWorkspace: "desk",
      staffExists: async () => true
    });
    assert(link.staffId === staffA && link.userId === userA, "link fields");
    assert((await getActiveLinkForUser(userA, workspaceId))?.id === link.id, "active resolve");

    let conflict = null;
    try {
      await upsertLink({
        workspaceId,
        userId: userB,
        staffId: staffA,
        staffExists: async () => true
      });
    } catch (error) {
      conflict = error;
    }
    assert(conflict?.statusCode === 409, "staff record cannot link to two users");

    conflict = null;
    try {
      await upsertLink({
        workspaceId,
        userId: userA,
        staffId: staffB,
        staffExists: async () => true
      });
    } catch (error) {
      conflict = error;
    }
    assert(conflict?.statusCode === 409, "user cannot link to two staff in same workspace");

    // Same user may link in another workspace (multi-workspace login).
    const linkB = await upsertLink({
      workspaceId: otherWorkspaceId,
      userId: userA,
      staffId: staffB,
      staffExists: async () => true
    });
    assert(linkB.workspaceId === otherWorkspaceId, "second workspace link");
    assert((await listWorkspaceLinks(workspaceId)).length === 1, "workspace A has one link");

    // Desk scope helpers
    const desk = {
      waiting: [{ id: "1", staffId: staffA }, { id: "2", staffId: staffB }],
      active: [{ id: "3", staffId: staffA }],
      done: [],
      appointments: [
        { id: "1", staffId: staffA },
        { id: "2", staffId: staffB },
        { id: "3", staffId: staffA }
      ]
    };
    const scoped = filterDeskPayload(desk, staffA);
    assert(scoped.appointments.length === 2 && scoped.counts.total === 2, "desk filter by staff");
    assert(
      appointmentInStaffScope({ staffId: staffA }, staffA),
      "assigned appointment in scope"
    );
    assert(
      !appointmentInStaffScope({ staffId: staffB }, staffA),
      "other staff appointment out of scope"
    );
    assert(
      appointmentInStaffScope({ staffId: "" }, staffA, { allowUnassigned: true }),
      "unassigned allowed for check-in claim"
    );

    const suspended = await suspendLink(workspaceId, { staffId: staffA });
    assert(suspended.status === "suspended", "suspend link");
    assert((await getActiveLinkForUser(userA, workspaceId)) === null, "suspended not active");
    assert(
      !isOpsRoleAllowed("/api/ops/desk/check-in", "POST", "staff", {
        staffLink: suspended
      }),
      "suspended link denies desk"
    );

    console.log(JSON.stringify({ ok: true, suite: "smoke-staff-links" }));
  } finally {
    for (const id of [workspaceId, otherWorkspaceId]) {
      const file = linksPath(id);
      const dir = path.dirname(file);
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, suite: "smoke-staff-links", error: String(error.message || error) }));
  process.exit(1);
});
