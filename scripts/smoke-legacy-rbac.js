#!/usr/bin/env node
/**
 * Smoke: legacy medical APIs, development-events, and uploads enforce
 * membership/role policy and fail closed outside local for telemetry.
 */
const {
  isLegacyRoleAllowed,
  isDevelopmentEventsAllowed,
  classifyUploadAccess,
  requireLegacyWorkspaceAccess,
  assertUploadReadable
} = require("../legacyAccess");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeRequest(workspaceId = "ws-legacy-rbac") {
  return {
    headers: { "x-workspace-id": workspaceId },
    socket: { remoteAddress: "127.0.0.1" }
  };
}

async function main() {
  const originalEnv = {
    MAW3ED_ENV: process.env.MAW3ED_ENV,
    MAW3ED_REQUIRE_AUTH: process.env.MAW3ED_REQUIRE_AUTH
  };

  try {
    assert(isLegacyRoleAllowed("/api/patients", "GET", "manager"), "manager should read patients");
    assert(isLegacyRoleAllowed("/api/appointments", "POST", "manager"), "manager should create appointments");
    assert(isLegacyRoleAllowed("/api/workspace-profile", "PATCH", "owner"), "owner should patch profile");
    assert(!isLegacyRoleAllowed("/api/workspace-profile", "PATCH", "manager"), "manager must not patch profile");
    assert(!isLegacyRoleAllowed("/api/patients", "GET", "viewer"), "viewer must not read patients");
    assert(!isLegacyRoleAllowed("/api/appointments", "GET", "staff"), "staff must not read legacy appointments until attribution exists");
    assert(!isLegacyRoleAllowed("/api/legacy-unknown", "GET", "owner"), "unknown legacy routes must fail closed");

    process.env.MAW3ED_ENV = "production";
    assert(!isDevelopmentEventsAllowed(), "development-events must be disabled outside local");

    process.env.MAW3ED_ENV = "local";
    assert(isDevelopmentEventsAllowed(), "development-events remain available in local");

    const publicLogo = classifyUploadAccess("/data/uploads/workspaces/ws-1/logo.png");
    assert(publicLogo.kind === "public-branding", "workspace image branding stays public");

    const privateDoc = classifyUploadAccess("/data/uploads/workspaces/ws-1/notes.pdf");
    assert(privateDoc.kind === "private-workspace", "non-image workspace files are private");

    const genericUpload = classifyUploadAccess("/data/uploads/secret.bin");
    assert(genericUpload.kind === "private-generic", "generic uploads are private");

    process.env.MAW3ED_ENV = "production";
    process.env.MAW3ED_REQUIRE_AUTH = "1";

    let unauthenticatedError = null;
    try {
      await requireLegacyWorkspaceAccess({
        req: makeRequest(),
        requestUrl: new URL("http://localhost/api/patients"),
        requested: "/api/patients",
        method: "GET",
        requireAppUser: async () => {
          const error = new Error("Authentication is required");
          error.statusCode = 401;
          throw error;
        },
        getUserWorkspace: async () => ({ id: "ws-legacy-rbac", role: "owner", organization_id: "org-1", status: "active" }),
        defaultOrganizationId: "org-maw3ed",
        databaseConfigured: false
      });
    } catch (error) {
      unauthenticatedError = error;
    }
    assert(unauthenticatedError?.statusCode === 401, "unauthenticated legacy request must be 401");

    let nonMemberError = null;
    try {
      await requireLegacyWorkspaceAccess({
        req: makeRequest("ws-other"),
        requestUrl: new URL("http://localhost/api/patients"),
        requested: "/api/patients",
        method: "GET",
        requireAppUser: async () => ({ id: "user-1" }),
        getUserWorkspace: async () => null,
        defaultOrganizationId: "org-maw3ed",
        databaseConfigured: false
      });
    } catch (error) {
      nonMemberError = error;
    }
    assert(nonMemberError?.statusCode === 403, "non-member legacy request must be 403");

    let viewerError = null;
    try {
      await requireLegacyWorkspaceAccess({
        req: makeRequest(),
        requestUrl: new URL("http://localhost/api/patients"),
        requested: "/api/patients",
        method: "GET",
        requireAppUser: async () => ({ id: "user-1" }),
        getUserWorkspace: async () => ({ id: "ws-legacy-rbac", role: "viewer", organization_id: "org-1", status: "active" }),
        defaultOrganizationId: "org-maw3ed",
        databaseConfigured: false
      });
    } catch (error) {
      viewerError = error;
    }
    assert(viewerError?.statusCode === 403, "viewer legacy patients access must be 403");

    const managerAccess = await requireLegacyWorkspaceAccess({
      req: makeRequest(),
      requestUrl: new URL("http://localhost/api/patients"),
      requested: "/api/patients",
      method: "GET",
      requireAppUser: async () => ({ id: "user-1" }),
      getUserWorkspace: async () => ({ id: "ws-legacy-rbac", role: "manager", organization_id: "org-1", status: "active" }),
      defaultOrganizationId: "org-maw3ed",
      databaseConfigured: false
    });
    assert(managerAccess.organizationId === "org-1", "membership organization must scope legacy reads");

    let privateUploadError = null;
    try {
      await assertUploadReadable({
        requestedPath: "/data/uploads/workspaces/ws-other/notes.pdf",
        req: makeRequest("ws-legacy-rbac"),
        requestUrl: new URL("http://localhost/data/uploads/workspaces/ws-other/notes.pdf"),
        requireAppUser: async () => ({ id: "user-1" }),
        getUserWorkspace: async (_userId, workspaceId) =>
          workspaceId === "ws-legacy-rbac"
            ? { id: "ws-legacy-rbac", role: "owner", status: "active" }
            : null
      });
    } catch (error) {
      privateUploadError = error;
    }
    assert(privateUploadError?.statusCode === 404, "cross-workspace private upload must 404");

    const branding = await assertUploadReadable({
      requestedPath: "/data/uploads/workspaces/ws-1/logo.png",
      req: makeRequest(),
      requestUrl: new URL("http://localhost/data/uploads/workspaces/ws-1/logo.png"),
      requireAppUser: async () => {
        throw new Error("public branding must not require auth");
      },
      getUserWorkspace: async () => null
    });
    assert(branding.kind === "public-branding", "public branding upload remains readable without auth");

    console.log(JSON.stringify({ ok: true, suite: "smoke-legacy-rbac" }, null, 2));
  } finally {
    if (originalEnv.MAW3ED_ENV === undefined) delete process.env.MAW3ED_ENV;
    else process.env.MAW3ED_ENV = originalEnv.MAW3ED_ENV;
    if (originalEnv.MAW3ED_REQUIRE_AUTH === undefined) delete process.env.MAW3ED_REQUIRE_AUTH;
    else process.env.MAW3ED_REQUIRE_AUTH = originalEnv.MAW3ED_REQUIRE_AUTH;
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, suite: "smoke-legacy-rbac", error: error.message }, null, 2));
  process.exit(1);
});
