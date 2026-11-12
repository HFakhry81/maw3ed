/**
 * Phase 1 barriers for legacy medical APIs, development-events, and uploads.
 * Fail-closed for unknown routes/roles. x-workspace-id is context only.
 */

const path = require("path");

const LEGACY_ADMIN_ROLES = new Set(["owner", "admin"]);
const LEGACY_MANAGER_ROLES = new Set(["owner", "admin", "manager"]);

const LEGACY_KNOWN_REQUESTS = new Set([
  "GET /api/workspace-profile",
  "PATCH /api/workspace-profile",
  "GET /api/dashboard",
  "GET /api/departments",
  "GET /api/doctors",
  "GET /api/patients",
  "GET /api/appointments",
  "POST /api/appointments"
]);
if (classification.kind === "private-workspace") {
  const membership = await getUserWorkspace(user.id, classification.workspaceId);
  if (!membership) {
    throw httpError(404, "Not found");
  }
  // Verify file ownership or organizational access
  const fileMetadata = await query(
    `SELECT * FROM uploads WHERE workspace_id = $1 AND file_name = $2`,
    [classification.workspaceId, classification.fileName]
  );
  if (!fileMetadata.rows[0]) {
    throw httpError(404, "Not found");
  }
  // Additional check: verify user has access to this specific file
  return { ...classification, membership, fileMetadata: fileMetadata.rows[0] };
}
const PUBLIC_UPLOAD_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".svg"
]);

function authRequiredForRequest(env = process.env) {
  return env.MAW3ED_ENV === "production" || env.MAW3ED_REQUIRE_AUTH === "1";
}

function isKnownLegacyRequest(requested, method) {
  return LEGACY_KNOWN_REQUESTS.has(`${method} ${requested}`);
}

/**
 * Baseline aligned with ops RBAC:
 * - viewer/staff: no legacy medical PII or writes
 * - manager: operational reads + appointment create
 * - owner/admin: profile writes as well
 */
function isLegacyRoleAllowed(requested, method, role) {
  if (!isKnownLegacyRequest(requested, method)) return false;
  if (!role || typeof role !== "string") return false;

  if (requested === "/api/workspace-profile" && method === "PATCH") {
    return LEGACY_ADMIN_ROLES.has(role);
  }

  if (
    requested === "/api/patients" ||
    requested === "/api/dashboard" ||
    requested === "/api/appointments" ||
    requested === "/api/workspace-profile" ||
    requested === "/api/departments" ||
    requested === "/api/doctors"
  ) {
    return LEGACY_MANAGER_ROLES.has(role);
  }

  return false;
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/**
 * Resolve workspace membership for a legacy API call.
 * Client workspace pick is never authorization by itself.
 */
async function requireLegacyWorkspaceAccess({
  req,
  requestUrl,
  requested,
  method,
  requireAppUser,
  getUserWorkspace,
  defaultOrganizationId,
  databaseConfigured,
  env = process.env
}) {
  if (!isKnownLegacyRequest(requested, method)) {
    throw httpError(404, "Not found");
  }

  if (!authRequiredForRequest(env)) {
    return {
      user: null,
      membership: null,
      organizationId: defaultOrganizationId,
      role: null,
      authRequired: false
    };
  }

  const user = await requireAppUser(req);
  if (!user) {
    throw httpError(401, "Authentication is required");
  }

  const requestedWorkspaceId =
    req.headers?.["x-workspace-id"] ||
    requestUrl?.searchParams?.get?.("workspace") ||
    null;

  let membership = null;
  if (requestedWorkspaceId) {
    membership = await getUserWorkspace(user.id, requestedWorkspaceId);
  } else {
    membership = await getUserWorkspace(user.id);
  }

  if (!membership) {
    throw httpError(403, "This workspace is not available for the current account");
  }

  if (!isLegacyRoleAllowed(requested, method, membership.role)) {
    throw httpError(403, "This workspace role cannot perform this operation");
  }

  let organizationId = membership.organization_id || null;
  if (!organizationId && membership.id) {
    organizationId = `org-${membership.id}`;
  }
  if (!organizationId) {
    if (databaseConfigured) {
      throw httpError(403, "This workspace is not available for the current account");
    }
    organizationId = defaultOrganizationId;
  }

  return {
    user,
    membership,
    organizationId,
    role: membership.role,
    authRequired: true
  };
}

function isDevelopmentEventsAllowed(env = process.env) {
  return env.MAW3ED_ENV === "local";
}

/**
 * Workspace branding images remain publicly readable (booking page logos/photos).
 * Non-image or non-workspace uploads require auth + membership when auth is on.
 */
function classifyUploadAccess(requestedPath) {
  const workspaceUploadMatch = String(requestedPath || "").match(
    /^\/data\/uploads\/workspaces\/([^/]+)\/([^/]+)$/
  );
  if (workspaceUploadMatch) {
    const workspaceId = workspaceUploadMatch[1];
    const fileName = workspaceUploadMatch[2];
    const ext = path.extname(fileName).toLowerCase();
    if (!PUBLIC_UPLOAD_EXTENSIONS.has(ext)) {
      return { kind: "private-workspace", workspaceId, fileName };
    }
    return { kind: "public-branding", workspaceId, fileName };
  }

  if (String(requestedPath || "").startsWith("/data/uploads/")) {
    return { kind: "private-generic" };
  }

  return { kind: "not-upload" };
}

async function assertUploadReadable({
  requestedPath,
  req,
  requestUrl,
  requireAppUser,
  getUserWorkspace,
  env = process.env
}) {
  const classification = classifyUploadAccess(requestedPath);
  if (classification.kind === "not-upload") {
    throw httpError(404, "Not found");
  }

  if (classification.kind === "public-branding") {
    return classification;
  }

  if (!authRequiredForRequest(env)) {
    return classification;
  }

  const user = await requireAppUser(req);
  if (!user) {
    throw httpError(401, "Authentication is required");
  }

  if (classification.kind === "private-workspace") {
    const membership = await getUserWorkspace(user.id, classification.workspaceId);
    if (!membership) {
      // Do not reveal whether the object exists in another tenant.
      throw httpError(404, "Not found");
    }
    return { ...classification, membership };
  }

  // Generic /data/uploads/* outside workspace branding: authenticated only.
  return { ...classification, user };
}

module.exports = {
  LEGACY_ADMIN_ROLES,
  LEGACY_MANAGER_ROLES,
  LEGACY_KNOWN_REQUESTS,
  PUBLIC_UPLOAD_EXTENSIONS,
  authRequiredForRequest,
  isKnownLegacyRequest,
  isLegacyRoleAllowed,
  requireLegacyWorkspaceAccess,
  isDevelopmentEventsAllowed,
  classifyUploadAccess,
  assertUploadReadable
};
