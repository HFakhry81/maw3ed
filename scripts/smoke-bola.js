#!/usr/bin/env node
/**
 * Smoke: BOLA + function-level + property-level permission checks for ops and legacy APIs.
 * Cross-workspace membership must fail closed; object IDs from another tenant must not mutate.
 */
const fs = require("fs");
const path = require("path");
const { tryHandleOpsApi, isOpsRoleAllowed } = require("../opsRoutes");
const {
  requireLegacyWorkspaceAccess,
  isLegacyRoleAllowed
} = require("../legacyAccess");
const { evaluateRuntimePosture } = require("../runtimePosture");
const ops = require("../opsStore");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeRequest(method, workspaceId) {
  return {
    method,
    headers: { "x-workspace-id": workspaceId },
    socket: { remoteAddress: "127.0.0.1" }
  };
}

async function invokeOps({
  path: apiPath,
  method = "GET",
  workspaceId,
  user = { id: "user-bola-a" },
  membershipFor,
  body = {}
}) {
  let response = null;
  const req = makeRequest(method, workspaceId);
  await tryHandleOpsApi({
    requested: apiPath,
    req,
    res: {},
    requestUrl: new URL(`http://localhost${apiPath}`),
    sendJson: (_res, status, payload) => {
      response = { status, body: payload };
    },
    parseJsonBody: async () => body,
    localData: {},
    requireAppUser: async () => {
      if (!user) {
        const error = new Error("Authentication is required");
        error.statusCode = 401;
        throw error;
      }
      return user;
    },
    getUserWorkspace: async (_userId, requestedWorkspaceId) => {
      if (!membershipFor) return null;
      const effective = requestedWorkspaceId || workspaceId;
      return membershipFor[effective] || null;
    },
    databaseConfigured: false
  });
  return response;
}

async function main() {
  const originalEnv = {
    MAW3ED_ENV: process.env.MAW3ED_ENV,
    MAW3ED_REQUIRE_AUTH: process.env.MAW3ED_REQUIRE_AUTH,
    MAW3ED_STORAGE: process.env.MAW3ED_STORAGE,
    MAW3ED_STRICT_PRODUCTION_STORAGE: process.env.MAW3ED_STRICT_PRODUCTION_STORAGE,
    MAW3ED_ALLOW_JSON_IN_PRODUCTION: process.env.MAW3ED_ALLOW_JSON_IN_PRODUCTION,
    SESSION_SECRET: process.env.SESSION_SECRET
  };

  process.env.MAW3ED_ENV = "production";
  process.env.MAW3ED_REQUIRE_AUTH = "1";
  process.env.MAW3ED_STORAGE = "local";
  process.env.SESSION_SECRET = "smoke-bola-session-secret-value";

  const wsA = "ws-bola-a";
  const wsB = "ws-bola-b";

  try {
    // --- Function-level policy ---
    assert(!isOpsRoleAllowed(`/api/ops/appointments/appt-1/pricing`, "PATCH", "manager"), "manager must not override appointment pricing");
    assert(!isOpsRoleAllowed(`/api/ops/desk/appointments/appt-1/addons`, "POST", "manager"), "manager must not add priced desk addons");
    assert(!isOpsRoleAllowed("/api/ops/events", "GET", "manager"), "manager must not read tenant audit events");
    assert(isOpsRoleAllowed("/api/ops/events", "GET", "owner"), "owner may read tenant audit events");
    assert(!isLegacyRoleAllowed("/api/patients", "GET", "viewer"), "viewer must not read legacy patients");
    assert(!isLegacyRoleAllowed("/api/workspace-profile", "PATCH", "manager"), "manager must not patch legacy profile");

    // --- Membership BOLA: forged workspace header ---
    const forged = await invokeOps({
      path: "/api/ops/bootstrap",
      workspaceId: wsB,
      membershipFor: {
        [wsA]: { id: wsA, role: "owner", status: "active", organization_id: "org-a" }
      }
    });
    assert(forged?.status === 403, "member of A must not access workspace B via header");

    // --- Property-level: manager bootstrap must not include finance bags ---
    ops.seedWorkspaceStore(wsA, { slug: "bola-a", businessName: "عيادة بولا أ" });
    const managerBootstrap = await invokeOps({
      path: "/api/ops/bootstrap",
      workspaceId: wsA,
      membershipFor: {
        [wsA]: { id: wsA, role: "manager", status: "active", organization_id: "org-a" }
      }
    });
    assert(managerBootstrap?.status === 200, "manager may load operational bootstrap");
    assert(!Object.prototype.hasOwnProperty.call(managerBootstrap.body, "expenses"), "manager bootstrap must omit expenses");
    assert(!Object.prototype.hasOwnProperty.call(managerBootstrap.body, "notifications"), "manager bootstrap must omit notifications");
    assert(managerBootstrap.body?.stats?.appointments != null, "manager still receives non-financial stats counts");
    assert(managerBootstrap.body?.stats?.revenue == null, "manager stats must not expose revenue aggregates");

    // --- Object-level BOLA across workspaces ---
    // Seeded templates reuse staff-owner ids per tenant; create a B-only id to prove lookup is store-scoped.
    ops.seedWorkspaceStore(wsB, { slug: "bola-b", businessName: "عيادة بولا ب" });
    let staffBOnlyId = null;
    await ops.withWorkspaceAsync(wsB, async () => {
      const created = ops.createStaff({
        firstName: "طبيب",
        lastName: "بولا",
        name: "طبيب بولا فريد",
        title: "دكتور ب"
      });
      staffBOnlyId = created.id;
    });
    assert(staffBOnlyId && staffBOnlyId !== "staff-owner", "workspace B needs a unique staff id");

    const crossObject = await invokeOps({
      path: `/api/ops/staff/${staffBOnlyId}`,
      method: "PATCH",
      workspaceId: wsA,
      membershipFor: {
        [wsA]: { id: wsA, role: "owner", status: "active", organization_id: "org-a" }
      },
      body: { title: "مهرب" }
    });
    assert(crossObject?.status === 404, "B-only staff id must 404 inside workspace A context");

    const crossTenantWrite = await invokeOps({
      path: `/api/ops/staff/${staffBOnlyId}`,
      method: "PATCH",
      workspaceId: wsB,
      membershipFor: {
        [wsA]: { id: wsA, role: "owner", status: "active", organization_id: "org-a" }
      },
      body: { title: "مهرب" }
    });
    assert(crossTenantWrite?.status === 403, "owner of A must not mutate B even with B's object id");

    const stillB = await ops.withWorkspaceAsync(wsB, () => ops.listStaff().find((item) => item.id === staffBOnlyId));
    assert(stillB?.title === "دكتور ب", "cross-tenant patch must not alter B staff");

    // Shared template ids are still tenant-scoped: patching staff-owner in A must not change B.
    await ops.withWorkspaceAsync(wsB, async () => {
      ops.updateStaff("staff-owner", { title: "عنوان ب الأصلي" });
    });
    const sharedIdPatch = await invokeOps({
      path: "/api/ops/staff/staff-owner",
      method: "PATCH",
      workspaceId: wsA,
      membershipFor: {
        [wsA]: { id: wsA, role: "owner", status: "active", organization_id: "org-a" }
      },
      body: { title: "عنوان أ فقط" }
    });
    assert(sharedIdPatch?.status === 200, "owner may patch staff-owner inside own workspace");
    const bOwner = await ops.withWorkspaceAsync(wsB, () => ops.listStaff().find((item) => item.id === "staff-owner"));
    assert(bOwner?.title === "عنوان ب الأصلي", "same staff id in B must remain untouched");

    // --- Function-level live invoke: pricing / events ---
    const managerPricing = await invokeOps({
      path: "/api/ops/appointments/appt-missing/pricing",
      method: "PATCH",
      workspaceId: wsA,
      membershipFor: {
        [wsA]: { id: wsA, role: "manager", status: "active", organization_id: "org-a" }
      },
      body: { amount: 10 }
    });
    assert(managerPricing?.status === 403, "manager pricing override must be rejected before object lookup");

    const managerEvents = await invokeOps({
      path: "/api/ops/events",
      workspaceId: wsA,
      membershipFor: {
        [wsA]: { id: wsA, role: "manager", status: "active", organization_id: "org-a" }
      }
    });
    assert(managerEvents?.status === 403, "manager must not read workspace events");

    // --- Legacy BOLA ---
    let legacyCross = null;
    try {
      await requireLegacyWorkspaceAccess({
        req: makeRequest("GET", wsB),
        requestUrl: new URL("http://localhost/api/patients"),
        requested: "/api/patients",
        method: "GET",
        requireAppUser: async () => ({ id: "user-bola-a" }),
        getUserWorkspace: async (_id, requestedWorkspaceId) =>
          requestedWorkspaceId === wsA
            ? { id: wsA, role: "owner", status: "active", organization_id: "org-a" }
            : null,
        defaultOrganizationId: "org-maw3ed",
        databaseConfigured: false
      });
    } catch (error) {
      legacyCross = error;
    }
    assert(legacyCross?.statusCode === 403, "legacy patients must reject forged workspace header");

    // --- Production JSON posture: membership still required; strict mode optional ---
    const posture = evaluateRuntimePosture(process.env, { databaseConfigured: false });
    assert(posture.authRequired === true, "production must require auth");
    assert(posture.usingJson === true, "this suite uses JSON storage");
    assert(posture.jsonSkipsMembership === false, "JSON must not skip membership");
    assert(posture.warnings.includes("production_using_json_storage"), "JSON-in-production must be warned");
    assert(posture.ok === true, "default production+JSON acceptance posture remains allowed with auth");

    process.env.MAW3ED_STRICT_PRODUCTION_STORAGE = "1";
    delete process.env.MAW3ED_ALLOW_JSON_IN_PRODUCTION;
    const strict = evaluateRuntimePosture(process.env, { databaseConfigured: false });
    assert(strict.ok === false && strict.errors.includes("production_json_storage_forbidden"), "strict mode forbids JSON in production");

    process.env.MAW3ED_ALLOW_JSON_IN_PRODUCTION = "1";
    const allowed = evaluateRuntimePosture(process.env, { databaseConfigured: false });
    assert(allowed.ok === true, "allow flag permits JSON acceptance runs under strict mode");

    console.log(
      JSON.stringify(
        {
          ok: true,
          suite: "smoke-bola",
          checks: [
            "function-level",
            "property-level-bootstrap",
            "membership-bola",
            "object-bola",
            "legacy-bola",
            "production-json-posture"
          ]
        },
        null,
        2
      )
    );
  } finally {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    // Best-effort cleanup of temp workspace event/ops dirs created by this suite.
    for (const id of [wsA, wsB]) {
      try {
        fs.rmSync(path.join(__dirname, "..", "data", "workspaces", id), { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, suite: "smoke-bola", error: error.message }, null, 2));
  process.exit(1);
});
