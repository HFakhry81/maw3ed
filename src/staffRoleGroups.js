/** Classify staff titles into operational groups for directory views. */

export const STAFF_ROLE_GROUPS = [
  { id: "doctors", label: "أطباء / أخصائيون", order: 1 },
  { id: "nursing", label: "تمريض", order: 2 },
  { id: "admin", label: "إداريون / حجز", order: 3 },
  { id: "other", label: "أخرى", order: 4 }
];

export function staffRoleGroupId(title) {
  const text = String(title || "").toLowerCase();
  if (/طبيب|طبيبة|دكتور|doctor|dentist|أخصائي|اخصائي|استشاري|consultant|veterinary|بيطري/.test(text)) {
    return "doctors";
  }
  if (/ممرض|ممرضة|nurse|تمريض/.test(text)) return "nursing";
  if (/استقبال|reception|مشرف|مدير|محاسب|منسق|إداري|اداري|حجز|سكرتير|admin|supervisor|manager/.test(text)) {
    return "admin";
  }
  return "other";
}

export function staffRoleGroupLabel(title) {
  const id = staffRoleGroupId(title);
  return STAFF_ROLE_GROUPS.find((item) => item.id === id)?.label || "أخرى";
}

export function isProviderStaff(person, services = []) {
  return (services || []).some((service) => (service.providerIds || []).includes(person.id));
}

export function isUnassignedStaff(person, services = []) {
  const hasCategory = Boolean(person.serviceCategoryId);
  const hasServices = isProviderStaff(person, services);
  return !hasCategory && !hasServices;
}

export function categoryNameForStaff(person, categories = [], services = []) {
  const direct = categories.find((item) => item.id === person.serviceCategoryId);
  if (direct?.name) return direct.name;
  const linked = services.find((service) => (service.providerIds || []).includes(person.id));
  const fromService = linked && categories.find((item) => item.id === linked.categoryId);
  return fromService?.name || "—";
}

export function adminsForCategory(categoryId, staff = [], services = []) {
  if (!categoryId) return [];
  return staff.filter((person) => {
    if (person.active === false) return false;
    if (staffRoleGroupId(person.title) !== "admin") return false;
    if (person.serviceCategoryId === categoryId) return true;
    return services.some(
      (service) => service.categoryId === categoryId && (service.providerIds || []).includes(person.id)
    );
  });
}

export function compareText(a, b) {
  return String(a || "").localeCompare(String(b || ""), "ar", { sensitivity: "base" });
}

export function sortByKey(rows, key, dir = "asc") {
  const factor = dir === "desc" ? -1 : 1;
  return [...rows].sort((left, right) => {
    const av = left[key];
    const bv = right[key];
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * factor;
    return compareText(av, bv) * factor;
  });
}
