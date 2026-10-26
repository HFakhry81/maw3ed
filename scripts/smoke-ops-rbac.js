#!/usr/bin/env node
/**
 * Smoke: workspace operations enforce membership and route-level role policy
 * before entering the workspace data layer.
 */
const { tryHandleOpsApi, isOpsRoleAllowed } = require("../opsRoutes");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeRequest(method, workspaceId = "ws-rbac-test") {
  return {
    method,
    headers: { "x-workspace-id": workspaceId },
    socket: { remoteAddress: "127.0.0.1" }
  };
}

async function invoke({ path, method = "GET", user = { id: "user-1" }, membership = { role: "viewer", status: "active" } }) {
  let response = null;
  const req = makeRequest(method);
  const res = {};
  const sendJson = (_res, status, body) => {
    response = { status, body };
  };

  await tryHandleOpsApi({
    requested: path,
    req,
    res,
    requestUrl: new URL(`http://localhost${path}`),
    sendJson,
    parseJsonBody: async () => ({}),
    localData: {},
    requireAppUser: async () => {
      if (!user) {
        const error = new Error("Authentication is required");
        error.statusCode = 401;
        throw error;
      }
      return user;
    },
    getUserWorkspace: async () => membership,
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

  try {
    assert(isOpsRoleAllowed("/api/ops/appointments", "GET", "manager"), "manager should read appointments");
    assert(!isOpsRoleAllowed("/api/ops/bootstrap", "GET", "viewer"), "viewer must not read bootstrap data");
    assert(!isOpsRoleAllowed("/api/ops/customers", "GET", "staff"), "staff must not list all customers");
    assert(!isOpsRoleAllowed("/api/ops/desk/check-in", "POST", "staff"), "staff must not check in until account-to-staff attribution exists");
    assert(!isOpsRoleAllowed("/api/ops/expenses", "GET", "manager"), "manager must not read workspace finances");
    assert(!isOpsRoleAllowed("/api/ops/notifications", "GET", "manager"), "manager must not read notification configuration");
    assert(!isOpsRoleAllowed("/api/ops/stats", "GET", "manager"), "manager must not read financial aggregates");
    assert(isOpsRoleAllowed("/api/ops/appointments", "POST", "manager"), "manager should create operational appointments");
    assert(isOpsRoleAllowed("/api/ops/expenses", "GET", "owner"), "owner should read workspace finances");
    assert(isOpsRoleAllowed("/api/ops/events", "GET", "owner"), "owner should read workspace audit events");
    assert(!isOpsRoleAllowed("/api/ops/events", "GET", "manager"), "manager must not read workspace audit events");
    assert(!isOpsRoleAllowed("/api/ops/not-yet-implemented", "GET", "owner"), "unknown ops routes must fail closed");

    const unauthenticated = await invoke({ path: "/api/ops/bootstrap", user: null });
    assert(unauthenticated?.status === 401, "unauthenticated ops request must be rejected");

    const nonMember = await invoke({ path: "/api/ops/bootstrap", membership: null });
    assert(nonMember?.status === 403, "non-member workspace request must be rejected");

    const viewerBootstrap = await invoke({ path: "/api/ops/bootstrap", membership: { role: "viewer", status: "active" } });
    assert(viewerBootstrap?.status === 403, "viewer must not access PII-bearing bootstrap response");

    const managerExpenses = await invoke({ path: "/api/ops/expenses", membership: { role: "manager", status: "active" } });
    assert(managerExpenses?.status === 403, "manager must not access finance endpoint");

    console.log(JSON.stringify({ ok: true, suite: "smoke-ops-rbac" }, null, 2));
  } finally {
    if (originalEnv.MAW3ED_ENV === undefined) delete process.env.MAW3ED_ENV;
    else process.env.MAW3ED_ENV = originalEnv.MAW3ED_ENV;
    if (originalEnv.MAW3ED_REQUIRE_AUTH === undefined) delete process.env.MAW3ED_REQUIRE_AUTH;
    else process.env.MAW3ED_REQUIRE_AUTH = originalEnv.MAW3ED_REQUIRE_AUTH;
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, suite: "smoke-ops-rbac", error: error.message }, null, 2));
  process.exit(1);
});
