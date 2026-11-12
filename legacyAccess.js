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
    // A configured database must provide an explicit organization association.
    // The local fallback is only for installations without database-backed workspaces.
    if (!databaseConfigured) organizationId = defaultOrganizationId || null;
  }

  if (!organizationId) {
    throw httpError(403, "This workspace is not available for the current account");
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

function classifyUploadAccess(requestedPath) {
  if (typeof requestedPath !== "string" || !requestedPath.trim()) {
    return { kind: "not-upload" };
  }

  let pathname;
  try {
    pathname = new URL(requestedPath, "http://localhost").pathname;
  } catch {
    return { kind: "not-upload" };
  }

  // Normalize separators and reject traversal before interpreting upload segments.
  const normalized = path.posix.normalize(pathname.replace(/\\/g, "/"));
  if (!normalized.startsWith("/data/uploads/")) {
    return { kind: "not-upload" };
  }

  const relative = normalized.slice("/data/uploads/".length);
  if (!relative || relative.startsWith("../") || relative.includes("/../")) {
    return { kind: "not-upload" };
  }

  const segments = relative.split("/").filter(Boolean);
  const extension = path.posix.extname(segments[segments.length - 1] || "").toLowerCase();
  if (
    (segments[0] === "branding" || segments[0] === "workspace-branding") &&
    segments.length > 1 &&
    PUBLIC_UPLOAD_EXTENSIONS.has(extension)
  ) {
    return { kind: "public-branding", path: normalized };
  }

  if (segments[0] === "workspaces" && segments.length === 3 && segments[1]) {
    const workspaceUpload = { workspaceId: segments[1], path: normalized };
    return PUBLIC_UPLOAD_EXTENSIONS.has(extension)
      ? { kind: "public-branding", ...workspaceUpload }
      : { kind: "private-workspace", ...workspaceUpload };
  }

  return { kind: "private-generic", path: normalized };
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
