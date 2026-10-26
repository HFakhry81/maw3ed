#!/usr/bin/env node
/**
 * Smoke: workspace operational events are append-only, sanitized, role-gated, and tenant-scoped.
 */
const fs = require("fs");
const path = require("path");
const { tryHandleOpsApi, isOpsRoleAllowed } = require("../opsRoutes");
const workspaceEvents = require("../workspaceEvents");
const ops = require("../opsStore");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function invoke({ path: apiPath, method = "GET", workspaceId, role = "owner", userId = "user-events", body = {}, query = "" }) {
  let response = null;
  const pathname = apiPath.split("?")[0];
  const requestUrl = new URL(`http://localhost${pathname}${query || (apiPath.includes("?") ? `?${apiPath.split("?")[1]}` : "")}`);
  await tryHandleOpsApi({
    requested: pathname,
    req: {
      method,
      headers: { "x-workspace-id": workspaceId },
      socket: { remoteAddress: "127.0.0.1" }
    },
    res: {},
    requestUrl,
    sendJson: (_res, status, payload) => {
      response = { status, body: payload };
    },
    parseJsonBody: async () => body,
    localData: {},
    requireAppUser: async () => ({ id: userId }),
    getUserWorkspace: async (_id, requested) =>
      requested === workspaceId ? { id: workspaceId, role, status: "active" } : null,
    databaseConfigured: false
  });
  return response;
}

async function main() {
  const originalEnv = {
    MAW3ED_ENV: process.env.MAW3ED_ENV,
    MAW3ED_REQUIRE_AUTH: process.env.MAW3ED_REQUIRE_AUTH
  };
  process.env.MAW3ED_ENV = "production";
  process.env.MAW3ED_REQUIRE_AUTH = "1";

  const ws = "ws-events-smoke";
  const other = "ws-events-other";

  try {
    assert(isOpsRoleAllowed("/api/ops/events", "GET", "admin"), "admin can read events");
    assert(!isOpsRoleAllowed("/api/ops/events", "GET", "staff"), "staff cannot read events");

    ops.seedWorkspaceStore(ws, { slug: "events-smoke", businessName: "مساحة أحداث" });
    ops.seedWorkspaceStore(other, { slug: "events-other", businessName: "مساحة أخرى" });

    let staffId = null;
    await ops.withWorkspaceAsync(ws, async () => {
      staffId = ops.listStaff()[0].id;
    });

    const denied = await invoke({
      path: "/api/ops/expenses",
      workspaceId: ws,
      role: "manager"
    });
    assert(denied?.status === 403, "manager expenses denial should 403");

    const patched = await invoke({
      path: `/api/ops/staff/${staffId}`,
      method: "PATCH",
      workspaceId: ws,
      role: "owner",
      body: { title: "أخصائي موثق" }
    });
    assert(patched?.status === 200, "owner staff patch should succeed");

    const listed = await invoke({
      path: "/api/ops/events?limit=20",
      workspaceId: ws,
      role: "owner"
    });
    assert(listed?.status === 200, "owner may list workspace events");
    const actions = (listed.body.events || []).map((event) => event.action);
    assert(actions.includes("staff.update"), "successful staff update must be logged");
    assert(actions.includes("authz.denied"), "role denial must be logged");

    const sanitized = workspaceEvents.appendWorkspaceEvent(ws, {
      actor_id: "user-events",
      action: "test.sanitize",
      details: { phone: "0100", note: "ok", token: "secret" }
    });
    assert(sanitized.details.phone == null, "phone must be stripped from event details");
    assert(sanitized.details.token == null, "token must be stripped from event details");
    assert(sanitized.details.note === "ok", "safe details remain");

    const otherList = await invoke({
      path: "/api/ops/events",
      workspaceId: other,
      role: "owner",
      userId: "user-other"
    });
    assert(otherList?.status === 200, "other workspace owner can list own events");
    const leaked = (otherList.body.events || []).some((event) => event.action === "staff.update");
    assert(!leaked, "events must not leak across workspaces");

    console.log(JSON.stringify({ ok: true, suite: "smoke-workspace-events", actions }, null, 2));
  } finally {
    if (originalEnv.MAW3ED_ENV === undefined) delete process.env.MAW3ED_ENV;
    else process.env.MAW3ED_ENV = originalEnv.MAW3ED_ENV;
    if (originalEnv.MAW3ED_REQUIRE_AUTH === undefined) delete process.env.MAW3ED_REQUIRE_AUTH;
    else process.env.MAW3ED_REQUIRE_AUTH = originalEnv.MAW3ED_REQUIRE_AUTH;
    for (const id of [ws, other]) {
      try {
        fs.rmSync(path.join(__dirname, "..", "data", "workspaces", id), { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, suite: "smoke-workspace-events", error: error.message }, null, 2));
  process.exit(1);
});
