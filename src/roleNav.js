/**
 * Role-aware nav / write gates aligned with server ops RBAC
 * (owner | admin | manager | staff | viewer).
 */

const MEMBERSHIP_ROLES = new Set(["owner", "admin", "manager", "staff", "viewer"]);

const MANAGER_HIDDEN = new Set([
  "expenses",
  "notifications",
  "stats",
  "industry",
  "payments",
  "marketing",
  "integrations"
]);

export function normalizeMembershipRole(role) {
  const value = String(role || "").trim().toLowerCase();
  return MEMBERSHIP_ROLES.has(value) ? value : "";
}

export function membershipRoleLabel(role, locale = "ar") {
  const key = normalizeMembershipRole(role);
  const ar = {
    owner: "مالك",
    admin: "مسؤول",
    manager: "مدير تشغيل",
    staff: "موظف",
    viewer: "عرض فقط"
  };
  const en = {
    owner: "Owner",
    admin: "Admin",
    manager: "Manager",
    staff: "Staff",
    viewer: "Viewer"
  };
  const table = String(locale || "ar").toLowerCase().startsWith("ar") ? ar : en;
  return table[key] || key || (String(locale || "ar").startsWith("ar") ? "غير محدد" : "Unknown");
}

/**
 * Whether a nav item should appear for the membership role.
 * Demo localStorage roles (reception/provider) are not used here.
 */
export function navVisibleForRole(navId, role, { activityLocked = false, staffLinked = false } = {}) {
  const r = normalizeMembershipRole(role);
  if (navId === "industry" && activityLocked) return false;

  if (!r) return navId !== "industry" || !activityLocked;

  if (r === "viewer") {
    return navId === "account" || navId === "schedule";
  }

  if (r === "staff") {
    if (!staffLinked) return navId === "account";
    return navId === "desk" || navId === "account";
  }

  if (r === "manager") {
    if (MANAGER_HIDDEN.has(navId)) return false;
    return true;
  }

  // owner / admin
  return true;
}

export function filterNavItems(navItems, role, options = {}) {
  return (navItems || []).filter((item) => navVisibleForRole(item.id, role, options));
}

export function canWriteCatalog(role) {
  const r = normalizeMembershipRole(role);
  return !r || r === "owner" || r === "admin" || r === "manager";
}

export function canManageFinance(role) {
  const r = normalizeMembershipRole(role);
  return !r || r === "owner" || r === "admin";
}

export function canCreateAppointments(role) {
  const r = normalizeMembershipRole(role);
  return !r || r === "owner" || r === "admin" || r === "manager";
}

export function defaultViewForRole(role, { staffLinked = false, activityLocked = false } = {}) {
  const r = normalizeMembershipRole(role);
  if (r === "staff") return staffLinked ? "desk" : "account";
  if (r === "viewer") return "account";
  if (!activityLocked && r === "owner") return "overview";
  return "overview";
}
