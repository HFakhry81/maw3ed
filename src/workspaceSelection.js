/**
 * Post-sign-in workspace selection.
 * Real memberships always win over sticky local-default / empty / stale ids.
 */

export const LOCAL_DEFAULT_WORKSPACE_ID = "local-default";
export const WORKSPACE_STORAGE_KEY = "maw3ed.workspaceId";
/** Session flag: user explicitly chose المساحة المحلية in the UI this session. */
export const LOCAL_WORKSPACE_OPT_IN_KEY = "maw3ed.allowLocalWorkspace";

/** Demo owner → preferred public slug (when that membership exists). */
export const DEMO_EMAIL_PREFERRED_SLUG = Object.freeze({
  "contact.haitham@gmail.com": "dawybooking",
  "contact.haitham@yahoo.com": "talaaee-book"
});

export function isLocalOrEmptyWorkspaceId(id) {
  const value = String(id || "").trim();
  return !value || value === LOCAL_DEFAULT_WORKSPACE_ID;
}

export function membershipRole(workspace) {
  if (!workspace || typeof workspace !== "object") return "";
  return String(workspace.role || workspace.member_role || "").trim().toLowerCase();
}

function roleRank(role) {
  if (role === "owner") return 0;
  if (role === "admin") return 1;
  if (role === "manager") return 2;
  if (role === "staff") return 3;
  return 4;
}

export function realMemberships(workspaces) {
  return (Array.isArray(workspaces) ? workspaces : []).filter(
    (workspace) => workspace && workspace.id && !isLocalOrEmptyWorkspaceId(workspace.id)
  );
}

/**
 * Prefer demo slug (by email), then owner role, then earliest created_at.
 */
export function pickPreferredWorkspace(workspaces, { userEmail } = {}) {
  const list = realMemberships(workspaces);
  if (!list.length) return null;

  const email = String(userEmail || "").trim().toLowerCase();
  const preferredSlug = DEMO_EMAIL_PREFERRED_SLUG[email];
  if (preferredSlug) {
    const bySlug = list.find(
      (workspace) => String(workspace.slug || "").trim().toLowerCase() === preferredSlug
    );
    if (bySlug) return bySlug;
  }

  return [...list].sort((left, right) => {
    const roleDiff = roleRank(membershipRole(left)) - roleRank(membershipRole(right));
    if (roleDiff !== 0) return roleDiff;
    return String(left.created_at || "").localeCompare(String(right.created_at || ""));
  })[0];
}

/**
 * Resolve which workspace id should be active after memberships are known.
 * - Keep a stored id only when it is a real membership in the list.
 * - Replace local-default / empty / missing / stale unless allowLocalOptIn.
 * - With no memberships, local-default remains available.
 */
export function resolveWorkspaceIdForSession(
  workspaces,
  storedId,
  { userEmail, allowLocalOptIn = false } = {}
) {
  const list = realMemberships(workspaces);
  const stored = String(storedId || "").trim();

  if (!list.length) {
    return isLocalOrEmptyWorkspaceId(stored) ? LOCAL_DEFAULT_WORKSPACE_ID : stored || LOCAL_DEFAULT_WORKSPACE_ID;
  }

  if (allowLocalOptIn && isLocalOrEmptyWorkspaceId(stored)) {
    return LOCAL_DEFAULT_WORKSPACE_ID;
  }

  if (stored && !isLocalOrEmptyWorkspaceId(stored) && list.some((workspace) => workspace.id === stored)) {
    return stored;
  }

  const preferred = pickPreferredWorkspace(list, { userEmail });
  return preferred?.id || list[0].id;
}

export function readLocalWorkspaceOptIn() {
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(LOCAL_WORKSPACE_OPT_IN_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeLocalWorkspaceOptIn(enabled) {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (enabled) sessionStorage.setItem(LOCAL_WORKSPACE_OPT_IN_KEY, "1");
    else sessionStorage.removeItem(LOCAL_WORKSPACE_OPT_IN_KEY);
  } catch {
    /* ignore */
  }
}

export function clearLocalWorkspaceOptIn() {
  writeLocalWorkspaceOptIn(false);
}
