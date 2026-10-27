const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const opsPg = require("./opsPg");
const opsWorkspace = require("./opsWorkspace");
const shiftHours = require("./shiftHours");
const opsDesk = require("./opsDesk");
const activityTemplates = require("./activityTemplatesCatalog");
const bookingAtomic = require("./bookingAtomic");
const capacityOps = require("./capacityOps");
const capacityEngine = require("./capacityEngine");

function createId(prefix) {
  return `${prefix}-${crypto.randomBytes(4).toString("hex")}`;
}

const MEDICAL_DEPARTMENTS = activityTemplates.MEDICAL_DEPARTMENTS.map((department) => ({
  id: department.id,
  name: activityTemplates.localizeText(department.name, "ar")
}));

const PLAN_LIMITS = {
  free: { staff: 2, services: 10, appointmentsPerMonth: 100 },
  pro: { staff: 10, services: Infinity, appointmentsPerMonth: Infinity },
  business: { staff: Infinity, services: Infinity, appointmentsPerMonth: Infinity }
};

/** Soften plan caps while end-to-end testing continues. Set MAW3ED_ENFORCE_PLAN_LIMITS=1 to re-enable. */
function planLimitsEnforced() {
  return process.env.MAW3ED_ENFORCE_PLAN_LIMITS === "1";
}

function defaultStore() {
  const base = {
    customerCategories: [
      { id: "cat-vip", name: "VIP", color: "#f5a623" },
      { id: "cat-regular", name: "عادي", color: "#1967e8" },
      { id: "cat-new", name: "جديد", color: "#16ae7c" }
    ],
    customers: [
      { id: "customer-001", firstName: "حسام", lastName: "مكرم", phone: "+20 1532165498", email: "", address: "", categoryId: "cat-regular", avatarUrl: "" },
      { id: "customer-002", firstName: "هيثم", lastName: "وحيدة", phone: "", email: "contact.fakhry@gmail.com", address: "", categoryId: "cat-new", avatarUrl: "" }
    ],
    staff: [
      { id: "staff-hf", name: "هيثم فخري", title: "مشرف حجز", active: true },
      { id: "staff-rec", name: "أحمد استقبال", title: "Reception", active: true }
    ],
    serviceCategories: [],
    services: [],
    workingHours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      isOpen: true,
      opensAt: "09:00",
      closesAt: "21:00",
      breakEnabled: false,
      breakStartsAt: "13:00",
      breakEndsAt: "14:00"
    })),
    closedDays: [],
    specificDays: [],
    bookingPage: {
      slug: "maw3ed-demo",
      businessName: "موعد — مساحة تجريبية",
      industry: "healthcare",
      email: "hello@maw3ed.app",
      phone: "+20 1550059876",
      description: "منصة مواعيد عربية للأعمال القائمة على الخدمات.",
      country: "مصر",
      state: "القاهرة",
      city: "القاهرة",
      street: "",
      timezone: "Africa/Cairo",
      onlineBookingEnabled: true,
      logoUrl: "",
      showPlatformBranding: true,
      socialLinks: { facebook: "", instagram: "", website: "" }
    },
    calendarPreferences: {
      showBusinessHoursOnly: true,
      slotOrder: "start-to-end",
      appointmentColorMode: "service",
      multiServiceEnabled: true
    },
    notifications: {
      email: { confirmation: true, reminder: true, followUp: false, cancellation: true, reschedule: true },
      messagingChannel: "whatsapp",
      messaging: { confirmation: false, reminder: false, cancellation: false, reschedule: false },
      pushDailyReminder: true
    },
    expenses: [],
    appointments: [],
    activityMode: "medical",
    activityModeLocked: false,
    activityTemplateId: "medical",
    medicalDepartments: [],
    activityLabels: {},
    activityLabelsI18n: null,
    planKey: "free",
    // Phase 4 capacity collections (generic; not inferred from activity_mode)
    resources: [],
    serviceResourceRequirements: [],
    sessionSeries: [],
    sessionOccurrences: [],
    sessionEnrollments: [],
    attendanceRecords: [],
    resourceAllocations: []
  };
  // Local default / demo workspace stays medical; new workspaces re-seed via applyTemplateToStoreData.
  activityTemplates.applyTemplateToStoreData(base, "medical", "ar", { replaceStaff: false });
  const demoStaffIds = ["staff-hf", "staff-rec"];
  (base.services || []).forEach((item, index) => {
    if (!Array.isArray(item.providerIds) || item.providerIds.length === 0) {
      item.providerIds = [demoStaffIds[index % demoStaffIds.length]];
    }
  });
  return base;
}

function loadStore() {
  return opsWorkspace.getContext(defaultStore).data;
}

function ctx() {
  return opsWorkspace.getContext(defaultStore);
}

const store = new Proxy(
  {},
  {
    get(_target, prop) {
      if (prop === "toJSON") return () => ctx().data;
      return ctx().data[prop];
    },
    set(_target, prop, value) {
      ctx().data[prop] = value;
      return true;
    },
    ownKeys() {
      return Reflect.ownKeys(ctx().data);
    },
    getOwnPropertyDescriptor(_target, prop) {
      return Object.getOwnPropertyDescriptor(ctx().data, prop);
    },
    has(_target, prop) {
      return prop in ctx().data;
    }
  }
);

function persist() {
  opsWorkspace.persistContext(ctx());
}

const slotHolds = {
  get(key) {
    return ctx().holds.get(key);
  },
  set(key, value) {
    ctx().holds.set(key, value);
    return this;
  },
  has(key) {
    return ctx().holds.has(key);
  },
  delete(key) {
    return ctx().holds.delete(key);
  },
  clear() {
    ctx().holds.clear();
  },
  entries() {
    return ctx().holds.entries();
  },
  keys() {
    return ctx().holds.keys();
  },
  get size() {
    return ctx().holds.size;
  }
};

function persistHolds() {
  opsWorkspace.persistHoldsContext(ctx());
}

function fail(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}

function normalizeNameKey(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLowerCase();
}

function assertUniqueName({ items, value, field = "name", ignoreId = null, kind = "العنصر", messageOverride }) {
  const nextValue = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!nextValue) return;
  const key = normalizeNameKey(nextValue);
  const duplicate = items.some((item) => {
    if (item.id && ignoreId && String(item.id) === String(ignoreId)) return false;
    const currentValue = String(item[field] ?? "").trim();
    return currentValue && normalizeNameKey(currentValue) === key;
  });
  if (duplicate) {
    const customMessage = messageOverride || `لا يمكن إنشاء ${kind} مكرر باسم «${nextValue}». استخدم اسمًا مختلفًا.`;
    fail(customMessage);
  }
}

function listCustomers({ search = "", categoryId = "" } = {}) {
  const q = search.trim().toLowerCase();
  return store.customers.filter((customer) => {
    const hay = `${customer.firstName} ${customer.lastName} ${customer.phone} ${customer.email}`.toLowerCase();
    return (!q || hay.includes(q)) && (!categoryId || categoryId === "all" || customer.categoryId === categoryId);
  });
}

function createCustomer(payload) {
  const firstName = String(payload.firstName || "").trim();
  if (!firstName) fail("الاسم الأول مطلوب");
  const categoryId = String(payload.categoryId || "cat-new");
  if (!store.customerCategories.some((category) => category.id === categoryId)) {
    fail("فئة العميل غير موجودة");
  }
  const customer = {
    id: createId("customer"),
    firstName,
    lastName: String(payload.lastName || "").trim(),
    phone: String(payload.phone || "").trim(),
    email: String(payload.email || "").trim(),
    address: String(payload.address || "").trim(),
    categoryId,
    avatarUrl: String(payload.avatarUrl || "")
  };
  store.customers.unshift(customer);
  persist();
  return customer;
}

function listCustomerCategories() {
  return store.customerCategories;
}

function createCustomerCategory(payload) {
  const name = String(payload.name || "").trim();
  if (!name) fail("اسم الفئة مطلوب");
  const category = { id: createId("cat"), name, color: payload.color || "#1967e8" };
  store.customerCategories.push(category);
  persist();
  return category;
}

function listStaff({ search = "" } = {}) {
  // Source of truth = service.providerIds; rebuild denormalized staff.serviceIds on read.
  sanitizeAndSyncStaffServiceLinks();
  const q = search.trim().toLowerCase();
  return store.staff
    .filter((person) => !q || `${person.name} ${person.title} ${person.servicePlace || ""}`.toLowerCase().includes(q))
    .map((person) => {
      const serviceIds = serviceIdsLinkedToStaff(person.id);
      return {
        ...person,
        serviceIds,
        closedDays: Array.isArray(person.closedDays) ? person.closedDays : [],
        specificDays: Array.isArray(person.specificDays) ? person.specificDays : [],
        servicesCount: serviceIds.length
      };
    });
}

/** Live link: staff ↔ services only via service.providerIds. */
function serviceIdsLinkedToStaff(staffId) {
  return store.services
    .filter((service) => (service.providerIds || []).includes(staffId))
    .map((service) => service.id);
}

function providersForService(service) {
  const staffById = new Map(store.staff.map((person) => [person.id, person]));
  return (service.providerIds || [])
    .map((id) => {
      const person = staffById.get(id);
      if (!person) return null;
      return { id: person.id, name: person.name, title: person.title || "", servicePlace: person.servicePlace || "" };
    })
    .filter(Boolean);
}

function sanitizeAndSyncStaffServiceLinks() {
  const staffIds = new Set(store.staff.map((person) => person.id));
  let changed = false;
  store.services.forEach((service) => {
    const next = (service.providerIds || []).filter((id) => staffIds.has(id));
    if (next.length !== (service.providerIds || []).length) {
      service.providerIds = next;
      changed = true;
    }
  });
  store.staff.forEach((person) => {
    const next = serviceIdsLinkedToStaff(person.id);
    const prev = Array.isArray(person.serviceIds) ? person.serviceIds : [];
    const same = prev.length === next.length && next.every((id) => prev.includes(id));
    if (!same) {
      person.serviceIds = next;
      changed = true;
    }
  });
  if (changed) persist();
  return changed;
}

/** Write staff↔service links by mutating service.providerIds, then resync mirrors. */
function applyStaffServiceLinks(staffId, serviceIds) {
  const wanted = new Set((serviceIds || []).map(String).filter(Boolean));
  store.services.forEach((service) => {
    const ids = new Set(service.providerIds || []);
    if (wanted.has(service.id)) ids.add(staffId);
    else ids.delete(staffId);
    service.providerIds = [...ids];
  });
  sanitizeAndSyncStaffServiceLinks();
  persist();
}

function setServiceProviders(serviceId, providerIds) {
  const service = store.services.find((item) => item.id === serviceId);
  if (!service) fail("الخدمة غير موجودة", 404);
  const staffIds = new Set(store.staff.map((person) => person.id));
  const requestedIds = (providerIds || []).map(String).filter(Boolean);
  if (requestedIds.some((id) => !staffIds.has(id))) fail("يوجد مقدم خدمة غير موجود");
  service.providerIds = requestedIds;
  assertServiceProviders(service);
  sanitizeAndSyncStaffServiceLinks();
  persist();
  return enrichService(service);
}

function addServiceProvider(serviceId, staffId) {
  const service = store.services.find((item) => item.id === serviceId);
  if (!service) fail("الخدمة غير موجودة", 404);
  const person = store.staff.find((item) => item.id === staffId);
  if (!person) fail("الموظف غير موجود", 404);
  const ids = new Set(service.providerIds || []);
  ids.add(staffId);
  service.providerIds = [...ids];
  sanitizeAndSyncStaffServiceLinks();
  persist();
  return enrichService(service);
}

function removeServiceProvider(serviceId, staffId) {
  const service = store.services.find((item) => item.id === serviceId);
  if (!service) fail("الخدمة غير موجودة", 404);
  service.providerIds = (service.providerIds || []).filter((id) => id !== staffId);
  sanitizeAndSyncStaffServiceLinks();
  persist();
  return enrichService(service);
}

function enrichService(service) {
  return {
    ...service,
    providers: providersForService(service)
  };
}


function normalizeWeekHours(days, fallback = store.workingHours) {
  const source = Array.isArray(days) && days.length ? days : fallback;
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => {
    const day = source.find((item) => Number(item.weekday) === weekday) || fallback.find((item) => item.weekday === weekday) || {};
    const opensAt = day.opensAt || "09:00";
    const closesAt = day.closesAt || "21:00";
    const overnight = day.overnight === true;
    return {
      weekday,
      isOpen: day.isOpen !== false,
      opensAt,
      closesAt,
      overnight,
      breakEnabled: Boolean(day.breakEnabled),
      breakStartsAt: day.breakStartsAt || "13:00",
      breakEndsAt: day.breakEndsAt || "14:00"
    };
  });
}

function normalizeStaffClosedDays(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item, index) => {
    const startDate = String(item.startDate || item.date || "").trim();
    const endDate = String(item.endDate || startDate).trim() || startDate;
    return {
      id: String(item.id || `scd-${Date.now().toString(36)}-${index}`),
      startDate,
      endDate,
      description: String(item.description || "").trim()
    };
  }).filter((item) =>
    /^\d{4}-\d{2}-\d{2}$/.test(item.startDate) &&
    /^\d{4}-\d{2}-\d{2}$/.test(item.endDate) &&
    item.endDate >= item.startDate
  );
}

function normalizeStaffSpecificDays(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item, index) => {
    const startDate = String(item.startDate || item.date || "").trim();
    const endDate = String(item.endDate || startDate).trim() || startDate;
    return {
      id: String(item.id || `ssd-${Date.now().toString(36)}-${index}`),
      title: String(item.title || "").trim() || "يوم محدد",
      startDate,
      endDate,
      opensAt: String(item.opensAt || "08:00").trim(),
      closesAt: String(item.closesAt || "16:00").trim(),
      breakStartsAt: String(item.breakStartsAt || "").trim(),
      breakEndsAt: String(item.breakEndsAt || "").trim()
    };
  }).filter((item) =>
    /^\d{4}-\d{2}-\d{2}$/.test(item.startDate) &&
    /^\d{4}-\d{2}-\d{2}$/.test(item.endDate) &&
    item.endDate >= item.startDate &&
    /^\d{2}:\d{2}$/.test(item.opensAt) &&
    /^\d{2}:\d{2}$/.test(item.closesAt)
  );
}

/** Explicitly closed Pro staff features — no compute path yet. */
function assertStaffProFeatureClosed(feature) {
  fail(`خاصية «${feature}» ضمن الخطة الاحترافية ومغلقة حالياً`, 403);
}

function dateInRange(date, startDate, endDate) {
  const start = String(startDate || "");
  const end = String(endDate || startDate || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return false;
  return date >= start && date <= (end || start);
}

function isClosedCalendarDay(date) {
  return (store.closedDays || []).some((item) =>
    dateInRange(date, item.startDate || item.date, item.endDate || item.startDate || item.date)
  );
}

function findSpecificDayOverride(date) {
  return (store.specificDays || []).find((item) =>
    dateInRange(date, item.startDate, item.endDate || item.startDate)
  );
}

function findStaffSpecificDayOverride(staff, date) {
  return (staff?.specificDays || []).find((item) =>
    dateInRange(date, item.startDate, item.endDate || item.startDate)
  );
}

function resolveHoursForStaff(staffId, date) {
  if (isClosedCalendarDay(date)) return null;
  const staff = store.staff.find((person) => person.id === staffId);
  if ((staff?.closedDays || []).some((item) =>
    dateInRange(date, item.startDate || item.date, item.endDate || item.startDate || item.date)
  )) return null;

  const specific = findStaffSpecificDayOverride(staff, date) || findSpecificDayOverride(date);
  if (specific) {
    return {
      isOpen: true,
      opensAt: specific.opensAt || "08:00",
      closesAt: specific.closesAt || "16:00",
      overnight: shiftHours.isOvernightShift(specific.opensAt, specific.closesAt),
      breakEnabled: Boolean(specific.breakStartsAt && specific.breakEndsAt),
      breakStartsAt: specific.breakStartsAt || "",
      breakEndsAt: specific.breakEndsAt || ""
    };
  }
  const weekday = new Date(`${date}T12:00:00`).getDay();
  if (staff?.useBusinessHours === false && Array.isArray(staff.workingHours) && staff.workingHours.length) {
    const custom = staff.workingHours.find((item) => Number(item.weekday) === weekday);
    if (custom) return custom;
  }
  return store.workingHours.find((item) => item.weekday === weekday) || null;
}

function appointmentsForService(serviceId) {
  return store.appointments.filter((item) => {
    if (item.serviceId !== serviceId) return false;
    if (item.status === "cancelled" || item.status === "canceled") return false;
    return true;
  });
}

function appointmentsForCategory(categoryId) {
  const serviceIds = new Set(store.services.filter((service) => service.categoryId === categoryId).map((service) => service.id));
  return store.appointments.filter((item) => {
    if (!serviceIds.has(item.serviceId)) return false;
    if (item.status === "cancelled" || item.status === "canceled") return false;
    return true;
  });
}

function futureAppointmentsFor({ staffId = "", serviceId = "" } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  return store.appointments.filter((item) => {
    if (item.status === "cancelled" || item.status === "canceled") return false;
    if (item.date < today) return false;
    if (staffId && item.staffId !== staffId) return false;
    if (serviceId && item.serviceId !== serviceId) return false;
    return true;
  });
}

function assertServiceProviders(service) {
  // Creating/editing a service may omit providers. Booking must not.
  const knownStaffIds = new Set(store.staff.map((person) => person.id));
  const providerIds = Array.isArray(service?.providerIds) ? service.providerIds : [];
  if (providerIds.some((id) => !knownStaffIds.has(id))) fail("يوجد مقدم خدمة غير موجود");
}

function assertServiceBookable(service) {
  if (!service) fail("الخدمة غير موجودة", 404);
  if (service.active === false) fail("هذه الخدمة متوقفة ولا يمكن الحجز عليها", 400);
  const providers = (service.providerIds || []).filter(Boolean);
  if (!providers.length) {
    fail("لا يمكن تحديد موعد لخدمة بلا مقدم خدمة. عيّن موظفاً للخدمة أولاً.", 400);
  }
  return providers;
}

function snapQuarterMinutes(value, { min = 0, allowZero = false } = {}) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return allowZero ? 0 : min;
  if (allowZero && raw <= 0) return 0;
  const snapped = Math.round(raw / 15) * 15;
  return Math.max(min, snapped);
}

function normalizeServiceTiming(payload, current = {}) {
  const durationMinutes = snapQuarterMinutes(
    payload.durationMinutes != null ? payload.durationMinutes : current.durationMinutes ?? 30,
    { min: 15 }
  );
  const bufferMinutes = snapQuarterMinutes(
    payload.bufferMinutes != null ? payload.bufferMinutes : current.bufferMinutes ?? 0,
    { min: 0, allowZero: true }
  );
  if (durationMinutes < 15) fail("زمن تقديم الخدمة يجب ألا يقل عن 15 دقيقة", 400);
  if (bufferMinutes < 0) fail("الفاصل الزمني غير صالح", 400);
  if (durationMinutes > 8 * 60) fail("زمن تقديم الخدمة طويل جداً", 400);
  return { durationMinutes, bufferMinutes };
}

/** Booking block = delivery time + maintenance / re-cleaning interval. */
function serviceBookingBlockMinutes(service) {
  return Number(service?.durationMinutes || 30) + Number(service?.bufferMinutes || 0);
}

function normalizeServicePricing(payload, current = {}) {
  const pricingType = String(payload.pricingType != null ? payload.pricingType : current.pricingType || "fixed");
  const allowed = new Set(["fixed", "free", "range", "on_request"]);
  if (!allowed.has(pricingType)) fail("نوع التسعير غير مدعوم", 400);

  let price = Number(payload.price != null ? payload.price : current.price ?? 0);
  let priceMin = Number(payload.priceMin != null ? payload.priceMin : current.priceMin ?? 0);
  let priceMax = Number(payload.priceMax != null ? payload.priceMax : current.priceMax ?? 0);

  if (!Number.isFinite(price)) price = 0;
  if (!Number.isFinite(priceMin)) priceMin = 0;
  if (!Number.isFinite(priceMax)) priceMax = 0;

  if (pricingType === "free" || pricingType === "on_request") {
    price = 0;
    priceMin = 0;
    priceMax = 0;
  } else if (pricingType === "fixed") {
    if (price < 0) fail("سعر الخدمة غير صالح", 400);
    priceMin = price;
    priceMax = price;
  } else if (pricingType === "range") {
    if (priceMin < 0 || priceMax < priceMin) {
      fail("نطاق السعر غير صالح — يجب أن يكون «ينتهي عند» أكبر من أو يساوي «يبدأ من»", 400);
    }
    // Catalog default; concrete booking amount resolved in resolveBookingPricing().
    price = priceMin;
  }

  return {
    pricingType,
    price: Math.round(price),
    priceMin: Math.round(priceMin),
    priceMax: Math.round(priceMax)
  };
}

/**
 * Resolve money fields at booking time.
 * - fixed: amount = price
 * - free: amount = 0
 * - range: deposit = priceMin (indicator range kept); final amount set later by staff within [min,max]
 * - on_request: amount = 0 until staff sends a quote
 *
 * Platform profit model (Maw3ed): SaaS subscription — not per-booking marketplace commission.
 */
function resolveBookingPricing(service, payload = {}) {
  const pricingType = String(service?.pricingType || "fixed");
  const priceMin = Math.round(Number(service?.priceMin ?? service?.price ?? 0) || 0);
  const priceMax = Math.round(Number(service?.priceMax ?? service?.price ?? 0) || 0);
  const catalogPrice = Math.round(Number(service?.price ?? 0) || 0);

  if (pricingType === "free") {
    return {
      pricingType,
      priceMin: 0,
      priceMax: 0,
      depositAmount: 0,
      amount: 0,
      pricingStatus: "free",
      paymentStatus: "paid"
    };
  }

  if (pricingType === "fixed") {
    return {
      pricingType,
      priceMin: catalogPrice,
      priceMax: catalogPrice,
      depositAmount: catalogPrice,
      amount: catalogPrice,
      pricingStatus: "fixed",
      paymentStatus: "unpaid"
    };
  }

  if (pricingType === "range") {
    const requested = payload.amount != null ? Number(payload.amount) : NaN;
    // Optional explicit amount within range (ops-created bookings); public defaults to deposit=min.
    let amount = priceMin;
    let pricingStatus = "range_deposit";
    if (Number.isFinite(requested) && requested >= priceMin && requested <= priceMax) {
      amount = Math.round(requested);
      pricingStatus = requested === priceMin ? "range_deposit" : "range_agreed";
    }
    return {
      pricingType,
      priceMin,
      priceMax,
      depositAmount: priceMin,
      amount,
      pricingStatus,
      paymentStatus: "unpaid"
    };
  }

  // on_request — quote later
  return {
    pricingType: "on_request",
    priceMin: 0,
    priceMax: 0,
    depositAmount: 0,
    amount: 0,
    pricingStatus: "quote_pending",
    paymentStatus: "unpaid"
  };
}

function setAppointmentPricing(id, payload = {}) {
  const appointment = store.appointments.find((item) => item.id === id);
  if (!appointment) fail("الموعد غير موجود", 404);
  const pricingType = String(appointment.pricingType || "fixed");
  const nextAmount = Number(payload.amount);
  if (!Number.isFinite(nextAmount) || nextAmount < 0) fail("المبلغ غير صالح", 400);

  if (pricingType === "range") {
    const min = Number(appointment.priceMin ?? 0);
    const max = Number(appointment.priceMax ?? 0);
    if (nextAmount < min || nextAmount > max) {
      fail(`السعر النهائي يجب أن يكون ضمن النطاق ${min}–${max}`, 400);
    }
    appointment.amount = Math.round(nextAmount);
    appointment.pricingStatus = "range_final";
  } else if (pricingType === "on_request") {
    appointment.amount = Math.round(nextAmount);
    appointment.pricingStatus = "quoted";
  } else if (pricingType === "fixed") {
    appointment.amount = Math.round(nextAmount);
    appointment.pricingStatus = "fixed";
  } else if (pricingType === "free") {
    appointment.amount = 0;
    appointment.pricingStatus = "free";
  } else {
    fail("لا يمكن تحديث تسعير هذا الموعد", 400);
  }

  if (payload.paymentStatus != null) {
    const allowedPay = new Set(["unpaid", "paid", "partial", "refunded"]);
    if (!allowedPay.has(String(payload.paymentStatus))) fail("حالة الدفع غير صالحة", 400);
    appointment.paymentStatus = String(payload.paymentStatus);
  }
  if (payload.notes != null) {
    const note = String(payload.notes || "").trim();
    if (note) appointment.notes = [appointment.notes, note].filter(Boolean).join(" · ");
  }
  appointment.pricedAt = new Date().toISOString();
  appointment.updatedAt = appointment.pricedAt;
  if (Array.isArray(appointment.lineItems) && appointment.lineItems.length) {
    const primary = appointment.lineItems.find((item) => item.kind === "primary") || appointment.lineItems[0];
    if (primary) {
      primary.amount = appointment.amount;
      primary.pricingType = appointment.pricingType;
      primary.priceMin = appointment.priceMin;
      primary.priceMax = appointment.priceMax;
      primary.pricingStatus = appointment.pricingStatus;
      primary.pricedAt = appointment.pricedAt;
    }
    appointment.amount = opsDesk.sumLineItems(appointment.lineItems);
  }
  persist();
  return appointment;
}

function getPlanLimits() {
  if (!planLimitsEnforced()) {
    return { staff: Infinity, services: Infinity, appointmentsPerMonth: Infinity };
  }
  return PLAN_LIMITS[store.planKey] || PLAN_LIMITS.free;
}

function monthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getPlanUsage() {
  const limits = getPlanLimits();
  const month = monthKey();
  const appointmentsThisMonth = store.appointments.filter((item) => String(item.date || "").startsWith(month)).length;
  const usage = {
    planKey: store.planKey || "free",
    staff: { used: store.staff.length, limit: limits.staff },
    services: { used: store.services.length, limit: limits.services },
    appointmentsThisMonth: { used: appointmentsThisMonth, limit: limits.appointmentsPerMonth }
  };
  const warnings = [];
  for (const [key, bucket] of Object.entries(usage)) {
    if (!bucket || typeof bucket !== "object" || !Number.isFinite(bucket.limit)) continue;
    if (bucket.limit > 0 && bucket.used / bucket.limit >= 0.8) {
      warnings.push({ key, used: bucket.used, limit: bucket.limit });
    }
  }
  return { ...usage, warnings, limitsEnforced: planLimitsEnforced() };
}

function assertPlanCapacity(kind) {
  if (!planLimitsEnforced()) return;
  const limits = getPlanLimits();
  const usage = getPlanUsage();
  if (kind === "staff" && Number.isFinite(limits.staff) && usage.staff.used >= limits.staff) {
    fail(`تم بلوغ حد الموظفين في الخطة المجانية (${limits.staff}). رقِّ الخطة للمتابعة.`, 402);
  }
  if (kind === "services" && Number.isFinite(limits.services) && usage.services.used >= limits.services) {
    fail(`تم بلوغ حد الخدمات في الخطة المجانية (${limits.services}).`, 402);
  }
  if (kind === "appointments" && Number.isFinite(limits.appointmentsPerMonth) && usage.appointmentsThisMonth.used >= limits.appointmentsPerMonth) {
    fail(`تم بلوغ سقف الحجوزات الشهرية (${limits.appointmentsPerMonth}).`, 402);
  }
}

function listActivityTemplates(locale = "ar") {
  return activityTemplates.listTemplates(locale);
}

function getActivityProfile(locale = "ar") {
  const templateId = store.activityTemplateId || (store.activityMode === "flexible" ? "custom" : "medical");
  const template = activityTemplates.getTemplate(templateId);
  const lang = activityTemplates.normalizeLocale(locale || store.bookingPage?.locale || "ar");
  return {
    mode: store.activityMode || "medical",
    locked: Boolean(store.activityModeLocked),
    templateId: template.id,
    templateDisplayName: activityTemplates.localizeText(template.displayName, lang),
    templateDescription: activityTemplates.localizeText(template.description, lang),
    labels: store.activityLabels || activityTemplates.templateMeta(template.id, lang).labels,
    labelsI18n: store.activityLabelsI18n || template.labels,
    medicalDepartments: store.medicalDepartments || [],
    emptyCatalog: !(store.serviceCategories || []).length,
    flexibleHint: "في الوضع المرن يمكن تخصيص الحقول والخدمات لأي نشاط: تدريب، صالونات، استشارات، أو مؤسسات خدمية.",
    templates: listActivityTemplates(lang)
  };
}

function applyMedicalCategories() {
  store.serviceCategories = (store.medicalDepartments || []).filter((department) => department.enabled !== false).map((department, sort) => ({
    id: department.id,
    name: department.name,
    nameI18n: department.nameI18n || undefined,
    sort,
    enabled: true
  }));
}

function applyActivityTemplate(templateId, locale = "ar", options = {}) {
  const lang = activityTemplates.normalizeLocale(locale);
  activityTemplates.applyTemplateToStoreData(store, templateId, lang, {
    replaceStaff: options.replaceStaff === true
  });
  if (store.activityMode === "medical") applyMedicalCategories();
  if (options.persist !== false) persist();
  return getActivityProfile(lang);
}

function updateActivityProfile(payload = {}) {
  const locked = Boolean(store.activityModeLocked);
  const requestingModeChange =
    payload.mode != null && payload.mode !== store.activityMode;
  const requestingTemplateChange =
    payload.templateId != null && payload.templateId !== store.activityTemplateId;
  const requestingLock = payload.lock === true;
  const locale = activityTemplates.normalizeLocale(payload.locale || store.bookingPage?.locale || "ar");

  if (locked && (requestingModeChange || requestingTemplateChange)) {
    fail("تم قفل نوع النشاط ولا يمكن تعديله بعد التأكيد.", 403);
  }

  if (!locked && payload.templateId) {
    const requestedId = String(payload.templateId).trim().toLowerCase();
    const knownIds = new Set(activityTemplates.allTemplateIds());
    if (!knownIds.has(requestedId) && requestedId !== "other") {
      fail("القالب غير موجود", 404);
    }
    const template = activityTemplates.getTemplate(requestedId);
    // Replace categories/services with the selected industry catalog (custom/other = empty).
    applyActivityTemplate(requestedId, locale, { replaceStaff: false, persist: false });
    if (store.bookingPage) {
      if (!store.bookingPage.businessName || store.bookingPage.businessName.includes("تجريب")) {
        store.bookingPage.businessName = activityTemplates.localizeText(template.displayName, locale);
      }
    }
  }

  if (!locked && payload.mode != null) {
    const mode = payload.mode === "flexible" ? "flexible" : payload.mode === "medical" ? "medical" : store.activityMode;
    store.activityMode = mode;
    if (mode === "medical") {
      store.activityTemplateId = store.activityTemplateId || "medical";
      if (requestingModeChange && !payload.templateId) {
        applyActivityTemplate("medical", locale, { replaceStaff: false, persist: false });
      }
    }
    if (mode === "flexible" && store.activityTemplateId === "medical") {
      store.activityTemplateId = "custom";
      if (requestingModeChange && !payload.templateId) {
        applyActivityTemplate("custom", locale, { replaceStaff: false, persist: false });
      }
    }
  }

  if (Array.isArray(payload.medicalDepartments)) {
    if (locked) fail("تم قفل نوع النشاط ولا يمكن تعديل الأقسام.", 403);
    store.medicalDepartments = payload.medicalDepartments.map((department) => ({
      id: String(department.id || createId("dept")),
      name: String(department.name || "").trim() || "قسم",
      nameI18n: department.nameI18n || undefined,
      enabled: department.enabled !== false
    }));
  }

  if (requestingLock) {
    store.activityModeLocked = true;
  }

  if (store.activityMode === "medical") applyMedicalCategories();
  persist();
  return getActivityProfile(locale);
}

function saveUploadedLogo(payload = {}) {
  const result = saveUploadedImage({ ...payload, kind: "logo" });
  store.bookingPage.logoUrl = result.url;
  persist();
  return { logoUrl: result.url, url: result.url };
}

function saveUploadedImage(payload = {}) {
  const workspaceId = opsWorkspace.currentWorkspaceId(defaultStore);
  const uploadsDir = opsWorkspace.uploadsDir(workspaceId);
  fs.mkdirSync(uploadsDir, { recursive: true });
  if (payload.url) {
    return { url: String(payload.url).trim() };
  }
  const dataUrl = String(payload.dataUrl || "");
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) fail("صورة غير صالحة");
  const ext = match[1].includes("png") ? "png" : match[1].includes("webp") ? "webp" : match[1].includes("gif") ? "gif" : "jpg";
  const kind = String(payload.kind || "file").replace(/[^a-z0-9_-]/gi, "") || "file";
  const fileName = `${kind}-${Date.now()}.${ext}`;
  const filePath = path.join(uploadsDir, fileName);
  fs.writeFileSync(filePath, Buffer.from(match[2], "base64"));
  return { url: `/data/uploads/workspaces/${workspaceId}/${fileName}` };
}

function createStaff(payload) {
  assertPlanCapacity("staff");
  const firstName = String(payload.firstName || payload.name || "").trim();
  const lastName = String(payload.lastName || "").trim();
  const name = String(payload.name || `${firstName} ${lastName}`.trim()).replace(/\s+/g, " ").trim();
  if (!name) fail("اسم الموظف مطلوب");
  assertUniqueName({
    items: store.staff,
    value: name,
    kind: "موظف",
    messageOverride: `لا يمكن إنشاء موظف مكرر باسم «${name}». استخدم اسمًا مختلفًا.`
  });
  const title = String(payload.title || "").trim();
  if (!title) fail("المهنة مطلوبة");
  const useBusinessHours = payload.useBusinessHours !== false;
  if (!useBusinessHours) assertWeekHoursValid(payload.workingHours);
  const person = {
    id: createId("staff"),
    name,
    firstName: firstName || name.split(/\s+/)[0] || name,
    lastName,
    phone: String(payload.phone || "").trim(),
    title,
    avatarUrl: String(payload.avatarUrl || ""),
    servicePlace: String(payload.servicePlace || "").trim(),
    serviceCategoryId: String(payload.serviceCategoryId || "").trim(),
    serviceIds: Array.isArray(payload.serviceIds) ? payload.serviceIds.map(String).filter(Boolean) : [],
    active: payload.active !== false,
    useBusinessHours,
    workingHours: useBusinessHours ? null : normalizeWeekHours(payload.workingHours),
    // Pro prep: stored only — not applied to booking availability yet.
    closedDays: normalizeStaffClosedDays(payload.closedDays),
    specificDays: normalizeStaffSpecificDays(payload.specificDays)
  };
  store.staff.unshift(person);
  if (Array.isArray(payload.serviceIds)) {
    applyStaffServiceLinks(person.id, payload.serviceIds);
  } else {
    persist();
  }
  return person;
}

function updateStaff(id, payload) {
  const person = store.staff.find((item) => item.id === id);
  if (!person) fail("الموظف غير موجود", 404);
  if (payload.firstName != null || payload.lastName != null || payload.name != null) {
    const firstName = payload.firstName != null ? String(payload.firstName).trim() : person.firstName || "";
    const lastName = payload.lastName != null ? String(payload.lastName).trim() : person.lastName || "";
    const nextName = String(payload.name || `${firstName} ${lastName}`.trim() || person.name).replace(/\s+/g, " ").trim();
    assertUniqueName({
      items: store.staff,
      value: nextName,
      field: "name",
      ignoreId: id,
      kind: "موظف",
      messageOverride: `لا يمكن استخدام اسم الموظف المكرر «${nextName}». اختر اسمًا مختلفًا.`
    });
    person.firstName = firstName;
    person.lastName = lastName;
    person.name = nextName;
  }
  if (payload.title != null) {
    const title = String(payload.title).trim();
    if (!title) fail("المهنة مطلوبة");
    person.title = title;
  }
  if (payload.phone != null) person.phone = String(payload.phone).trim();
  if (payload.avatarUrl != null) person.avatarUrl = String(payload.avatarUrl).trim();
  if (payload.servicePlace != null) person.servicePlace = String(payload.servicePlace || "").trim();
  if (payload.serviceCategoryId != null) person.serviceCategoryId = String(payload.serviceCategoryId || "").trim();
  if (payload.active != null) person.active = Boolean(payload.active);
  if (payload.useBusinessHours != null) person.useBusinessHours = Boolean(payload.useBusinessHours);
  if (Array.isArray(payload.workingHours)) {
    assertWeekHoursValid(payload.workingHours);
    person.workingHours = normalizeWeekHours(payload.workingHours);
    if (payload.useBusinessHours == null) person.useBusinessHours = false;
  }
  if (person.useBusinessHours) person.workingHours = null;
  if (Array.isArray(payload.closedDays)) {
    person.closedDays = normalizeStaffClosedDays(payload.closedDays);
  }
  if (Array.isArray(payload.specificDays)) {
    person.specificDays = normalizeStaffSpecificDays(payload.specificDays);
  }
  if (Array.isArray(payload.serviceIds)) {
    applyStaffServiceLinks(person.id, payload.serviceIds);
  } else {
    persist();
  }
  return person;
}

function deleteStaff(id) {
  const index = store.staff.findIndex((item) => item.id === id);
  if (index < 0) fail("الموظف غير موجود", 404);
  const blocked = futureAppointmentsFor({ staffId: id });
  if (blocked.length) {
    fail(`لا يمكن حذف الموظف لوجود ${blocked.length} مواعيد قادمة. ألغِ المواعيد أو أعد تعيينها أولاً.`, 409);
  }
  // Unlink from services; if they were the last provider on a public service, turn public booking off.
  store.services.forEach((service) => {
    const before = service.providerIds || [];
    if (!before.includes(id)) return;
    service.providerIds = before.filter((providerId) => providerId !== id);
    if (service.publicBooking && !(service.providerIds || []).length) {
      service.publicBooking = false;
    }
  });
  store.staff.splice(index, 1);
  sanitizeAndSyncStaffServiceLinks();
  persist();
}

function listServiceCategories() {
  return [...store.serviceCategories].sort((a, b) => a.sort - b.sort);
}

function createServiceCategory(payload) {
  const name = String(payload.name || "").replace(/\s+/g, " ").trim();
  if (!name) fail("اسم الفئة مطلوب");
  assertUniqueName({
    items: store.serviceCategories,
    value: name,
    kind: "فئة",
    messageOverride: `لا يمكن إنشاء فئة مكررة باسم «${name}». اختر اسمًا مختلفًا.`
  });
  const category = {
    id: createId("svc-cat"),
    name,
    sort: store.serviceCategories.length,
    enabled: payload.enabled !== false,
    active: payload.active !== false
  };
  store.serviceCategories.push(category);
  persist();
  return category;
}

function updateServiceCategory(id, payload) {
  const category = store.serviceCategories.find((item) => item.id === id);
  if (!category) fail("فئة الخدمة غير موجودة", 404);
  if (payload.name != null) {
    const name = String(payload.name || "").replace(/\s+/g, " ").trim();
    if (!name) fail("اسم الفئة مطلوب");
    assertUniqueName({
      items: store.serviceCategories,
      value: name,
      field: "name",
      ignoreId: id,
      kind: "فئة",
      messageOverride: `لا يمكن استخدام اسم الفئة المكرر «${name}». اختر اسمًا مختلفًا.`
    });
    category.name = name;
  }
  if (payload.enabled != null) category.enabled = Boolean(payload.enabled);
  if (payload.active != null) {
    category.active = Boolean(payload.active);
    category.enabled = category.active;
  }
  if (payload.sort != null && Number.isFinite(Number(payload.sort))) category.sort = Number(payload.sort);
  persist();
  return category;
}

function deleteServiceCategory(id) {
  const index = store.serviceCategories.findIndex((item) => item.id === id);
  if (index < 0) fail("فئة الخدمة غير موجودة", 404);
  const childServices = store.services.filter((service) => service.categoryId === id);
  if (childServices.length) {
    fail(
      `لا يمكن حذف الفئة لأنها تحتوي على ${childServices.length} خدمة. احذف الخدمات الفارغة أولاً أو أوقف الفئة.`,
      409
    );
  }
  const used = appointmentsForCategory(id);
  if (used.length) {
    fail(
      `لا يمكن حذف الفئة — سبق التعامل عليها عبر ${used.length} حجز/موعد. الحذف مسموح فقط للمحتوى الفارغ.`,
      409
    );
  }
  // Keep medical template in sync so deleted empty departments do not reappear.
  if (Array.isArray(store.medicalDepartments)) {
    store.medicalDepartments = store.medicalDepartments.map((department) =>
      department.id === id ? { ...department, enabled: false } : department
    );
  }
  store.serviceCategories.splice(index, 1);
  persist();
  return { ok: true, id };
}

function listServices(categoryId) {
  sanitizeAndSyncStaffServiceLinks();
  return store.services
    .filter((service) => !categoryId || service.categoryId === categoryId)
    .map((service) => enrichService(service));
}

function createService(payload) {
  assertPlanCapacity("services");
  const name = String(payload.name || "").replace(/\s+/g, " ").trim();
  const categoryId = payload.categoryId;
  if (!name || !categoryId) fail("اسم الخدمة والفئة مطلوبان");
  if (!store.serviceCategories.some((category) => category.id === categoryId)) {
    fail("فئة الخدمة غير موجودة");
  }
  assertUniqueName({
    items: store.services,
    value: name,
    kind: "خدمة",
    messageOverride: `لا يمكن إنشاء خدمة مكررة باسم «${name}». اختر اسمًا مختلفًا.`
  });
  const timing = normalizeServiceTiming(payload);
  const pricing = normalizeServicePricing(payload);
  const service = {
    id: createId("svc"),
    categoryId,
    name,
    durationMinutes: timing.durationMinutes,
    bufferMinutes: timing.bufferMinutes,
    pricingType: pricing.pricingType,
    price: pricing.price,
    priceMin: pricing.priceMin,
    priceMax: pricing.priceMax,
    color: payload.color || "#1967e8",
    providerIds: Array.isArray(payload.providerIds)
      ? payload.providerIds.map(String).filter(Boolean)
      : payload.providerId
        ? [String(payload.providerId)]
        : [],
    publicBooking: payload.publicBooking !== false,
    autoAccept: Boolean(payload.autoAccept),
    autoComplete: Boolean(payload.autoComplete),
    active: payload.active !== false,
    description: String(payload.description || ""),
    occupancyMode: capacityEngine.normalizeOccupancyMode(payload.occupancyMode, "exclusive"),
    defaultCapacity: Math.max(1, Number(payload.defaultCapacity) || 1),
    compositionDefault: capacityEngine.normalizeComposition(payload.compositionDefault, "single")
  };
  assertServiceProviders(service);
  store.services.unshift(service);
  sanitizeAndSyncStaffServiceLinks();
  persist();
  return enrichService(service);
}

function updateService(id, payload) {
  const service = store.services.find((item) => item.id === id);
  if (!service) fail("الخدمة غير موجودة", 404);
  if (payload.categoryId != null && !store.serviceCategories.some((category) => category.id === payload.categoryId)) {
    fail("فئة الخدمة غير موجودة");
  }
  const requestedProviderIds = Array.isArray(payload.providerIds)
    ? payload.providerIds.map(String).filter(Boolean)
    : payload.providerId != null
      ? (payload.providerId ? [String(payload.providerId)] : [])
      : null;
  if (requestedProviderIds) {
    const knownStaffIds = new Set(store.staff.map((person) => person.id));
    if (requestedProviderIds.some((staffId) => !knownStaffIds.has(staffId))) fail("يوجد مقدم خدمة غير موجود");
  }
  if (payload.name != null) {
    const name = String(payload.name).replace(/\s+/g, " ").trim();
    if (!name) fail("اسم الخدمة مطلوب");
    assertUniqueName({
      items: store.services,
      value: name,
      field: "name",
      ignoreId: id,
      kind: "خدمة",
      messageOverride: `لا يمكن استخدام اسم الخدمة المكرر «${name}». اختر اسمًا مختلفًا.`
    });
    service.name = name;
  }
  if (payload.categoryId != null) {
    service.categoryId = payload.categoryId;
  }
  if (payload.durationMinutes != null || payload.bufferMinutes != null) {
    const timing = normalizeServiceTiming(payload, service);
    service.durationMinutes = timing.durationMinutes;
    service.bufferMinutes = timing.bufferMinutes;
  }
  if (payload.pricingType != null || payload.price != null || payload.priceMin != null || payload.priceMax != null) {
    const pricing = normalizeServicePricing(payload, service);
    service.pricingType = pricing.pricingType;
    service.price = pricing.price;
    service.priceMin = pricing.priceMin;
    service.priceMax = pricing.priceMax;
  }
  if (payload.color != null) service.color = String(payload.color || "#1967e8");
  if (payload.description != null) service.description = String(payload.description || "");
  if (payload.publicBooking != null) service.publicBooking = Boolean(payload.publicBooking);
  if (payload.autoAccept != null) service.autoAccept = Boolean(payload.autoAccept);
  if (payload.autoComplete != null) service.autoComplete = Boolean(payload.autoComplete);
  if (payload.active != null) service.active = Boolean(payload.active);
  if (payload.occupancyMode != null || payload.defaultCapacity != null || payload.compositionDefault != null) {
    capacityOps.setServiceOccupancy(store, id, payload);
  }
  if (requestedProviderIds) service.providerIds = requestedProviderIds;
  assertServiceProviders(service);
  sanitizeAndSyncStaffServiceLinks();
  persist();
  return enrichService(service);
}

function withCapacityMutation(fn) {
  capacityOps.ensureCapacityCollections(store);
  const result = fn(store);
  persist();
  return result;
}

function createResource(payload) {
  return withCapacityMutation((data) => capacityOps.createResource(data, payload));
}

function listResources(query = {}) {
  capacityOps.ensureCapacityCollections(store);
  return capacityOps.listResources(store, query);
}

function updateResource(id, payload) {
  return withCapacityMutation((data) => capacityOps.updateResource(data, id, payload));
}

function listSessionOccurrences(query = {}) {
  capacityOps.ensureCapacityCollections(store);
  return capacityOps.listSessionOccurrences(store, query);
}

function requireServiceResource(payload) {
  return withCapacityMutation((data) => capacityOps.requireServiceResource(data, payload));
}

function createSessionOccurrence(payload) {
  const workspaceId = opsWorkspace.currentWorkspaceId(defaultStore);
  return bookingAtomic.withBookingLock(workspaceId, async () =>
    withCapacityMutation((data) => capacityOps.createSessionOccurrence(data, payload))
  );
}

function enrollInOccurrence(payload) {
  const workspaceId = opsWorkspace.currentWorkspaceId(defaultStore);
  return bookingAtomic.withBookingLock(workspaceId, async () =>
    withCapacityMutation((data) => capacityOps.enrollInOccurrence(data, payload))
  );
}

function cancelEnrollment(enrollmentId) {
  const workspaceId = opsWorkspace.currentWorkspaceId(defaultStore);
  return bookingAtomic.withBookingLock(workspaceId, async () =>
    withCapacityMutation((data) => capacityOps.cancelEnrollment(data, enrollmentId))
  );
}

function recordAttendance(payload) {
  return withCapacityMutation((data) => capacityOps.recordAttendance(data, payload));
}

function allocateResourceForBooking(payload) {
  const workspaceId = opsWorkspace.currentWorkspaceId(defaultStore);
  return bookingAtomic.withBookingLock(workspaceId, async () =>
    withCapacityMutation((data) => capacityOps.allocateResourceForBooking(data, payload))
  );
}

function createBundleAllocations(items) {
  const workspaceId = opsWorkspace.currentWorkspaceId(defaultStore);
  return bookingAtomic.withBookingLock(workspaceId, async () =>
    withCapacityMutation((data) => capacityOps.createBundleAllocations(data, items))
  );
}

function releaseAllocation(allocationId) {
  return withCapacityMutation((data) => capacityOps.releaseAllocation(data, allocationId));
}

function getOccurrenceAvailability(occurrenceId) {
  capacityOps.ensureCapacityCollections(store);
  return capacityOps.getOccurrenceAvailability(store, occurrenceId);
}

function deleteService(id) {
  const index = store.services.findIndex((item) => item.id === id);
  if (index < 0) fail("الخدمة غير موجودة", 404);
  const used = appointmentsForService(id);
  if (used.length) {
    fail(
      `لا يمكن حذف الخدمة — سبق التعامل عليها عبر ${used.length} حجز/موعد. الحذف مسموح فقط للمحتوى الفارغ. يمكنك إيقاف الخدمة بدلاً من حذفها.`,
      409
    );
  }
  store.services.splice(index, 1);
  sanitizeAndSyncStaffServiceLinks();
  persist();
}

function getWorkingSchedule() {
  return {
    general: store.workingHours,
    closedDays: store.closedDays,
    specificDays: store.specificDays
  };
}

function assertWeekHoursValid(days) {
  if (!Array.isArray(days) || !days.length) return;
  const normalized = normalizeWeekHours(days);
  const names = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  for (const day of normalized) {
    const label = names[day.weekday] || `يوم ${day.weekday}`;
    const error = shiftHours.validateShiftDay(day, label);
    if (error) fail(error);
  }
}

function saveWorkingHours(days) {
  if (!Array.isArray(days) || days.length !== 7) fail("جدول الأيام السبعة مطلوب");
  assertWeekHoursValid(days);
  store.workingHours = normalizeWeekHours(days);
  persist();
  return store.workingHours;
}

function addClosedDay(payload) {
  const startDate = String(payload.startDate || "");
  const endDate = String(payload.endDate || startDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) fail("تاريخ البدء مطلوب");
  const item = {
    id: createId("closed"),
    startDate,
    endDate,
    description: String(payload.description || "").trim()
  };
  store.closedDays.unshift(item);
  persist();
  return item;
}

function addSpecificDay(payload) {
  const startDate = String(payload.startDate || "");
  const endDate = String(payload.endDate || startDate);
  const title = String(payload.title || "").trim();
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) fail("العنوان وتاريخ البدء مطلوبان");
  const item = {
    id: createId("specific"),
    startDate,
    endDate,
    title,
    opensAt: payload.opensAt || "08:00",
    closesAt: payload.closesAt || "16:00",
    breakStartsAt: payload.breakStartsAt || "",
    breakEndsAt: payload.breakEndsAt || ""
  };
  store.specificDays.unshift(item);
  persist();
  return item;
}

function getBookingPage() {
  return store.bookingPage;
}

function updateBookingPage(payload) {
  const previousSlug = store.bookingPage.slug;
  const nextSlug = String(payload.slug || store.bookingPage.slug)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-");
  const workspaceId = opsWorkspace.currentWorkspaceId(defaultStore);
  const postgresManaged = opsWorkspace.isPostgresWorkspace();
  const registered = postgresManaged ? nextSlug : opsWorkspace.registerSlug(nextSlug, workspaceId);
  if (!postgresManaged && previousSlug && previousSlug !== registered) {
    opsWorkspace.unregisterSlug(previousSlug, workspaceId);
  }
  store.bookingPage = {
    ...store.bookingPage,
    ...payload,
    slug: registered || nextSlug,
    socialLinks: { ...store.bookingPage.socialLinks, ...(payload.socialLinks || {}) }
  };
  persist();
  return store.bookingPage;
}

function getPublicBooking(slug) {
  if (store.bookingPage.slug !== slug || !store.bookingPage.onlineBookingEnabled) {
    fail("صفحة الحجز غير متاحة", 404);
  }
  return {
    page: store.bookingPage,
    services: store.services.filter((service) => {
      if (!service.publicBooking || service.active === false) return false;
      if (!(service.providerIds || []).length) return false;
      const category = store.serviceCategories.find((item) => item.id === service.categoryId);
      if (category && (category.active === false || category.enabled === false)) return false;
      return true;
    }),
    categories: listServiceCategories(),
    staff: store.staff.filter((person) => person.active),
    workingHours: store.workingHours
  };
}

function toMinutes(hhmm) {
  const [hours, minutes] = String(hhmm || "00:00").split(":").map(Number);
  return hours * 60 + minutes;
}

function fromMinutes(total) {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function purgeExpiredHolds(now = Date.now()) {
  bookingAtomic.purgeExpiredHoldsOnce(slotHolds, now, persistHolds);
}

function holdKey(staffId, date, time) {
  return bookingAtomic.holdKey(staffId, date, time);
}

function rangesOverlap(startA, endA, startB, endB) {
  return bookingAtomic.rangesOverlap(startA, endA, startB, endB);
}

function appointmentBlockMinutes(appointment) {
  const service = store.services.find((item) => item.id === appointment.serviceId);
  return bookingAtomic.serviceBlockMinutes(service, appointment);
}

async function cancelSlotHold({ staffId, date, time, slug = "" } = {}) {
  const cleanStaffId = String(staffId || "");
  const cleanDate = String(date || "");
  const cleanTime = String(time || "");
  const result = bookingAtomic.releaseHoldOnce(
    slotHolds,
    { staffId: cleanStaffId, date: cleanDate, time: cleanTime },
    persistHolds
  );
  let pgFreed = false;
  if (opsPg.isOpsPgEnabled()) {
    try {
      await opsPg.releaseSlotHold({
        staffId: cleanStaffId || "any",
        date: cleanDate,
        time: cleanTime,
        slug: slug || store.bookingPage?.slug || ""
      });
      pgFreed = true;
    } catch (error) {
      console.warn("[ops] postgres hold cancel failed:", error.message);
    }
  }
  return { ok: true, freed: result.freed || pgFreed, localFreed: result.freed, pgFreed };
}

function listStaffSlotsForDay({ staffId, date, blockMinutes, ignoreHolds = false, extraBlocked = [] }) {
  purgeExpiredHolds();
  const day = new Date(`${date}T12:00:00`);
  if (Number.isNaN(day.getTime())) fail("تاريخ غير صالح");

  const collectAppointmentsAndHolds = (hoursContextDate) => {
    const blocked = [];
    store.appointments
      .filter((item) => item.date === hoursContextDate && item.staffId === staffId && item.status !== "cancelled")
      .forEach((item) => {
        const start = toMinutes(item.time);
        blocked.push([start, start + appointmentBlockMinutes(item)]);
      });
    if (!ignoreHolds) {
      for (const [key, expiresAt] of slotHolds.entries()) {
        if (expiresAt <= Date.now()) continue;
        const [holdStaff, holdDate, holdTime] = key.split("|");
        if (holdStaff === staffId && holdDate === hoursContextDate) {
          const start = toMinutes(holdTime);
          blocked.push([start, start + blockMinutes]);
        }
      }
    }
    for (const range of extraBlocked) {
      if (Array.isArray(range) && range.length >= 2) blocked.push([Number(range[0]), Number(range[1])]);
    }
    return blocked;
  };

  const pushSlots = (windowStart, windowEnd, blocked) => {
    const out = [];
    if (!(windowEnd > windowStart)) return out;
    for (let cursor = windowStart; cursor + blockMinutes <= windowEnd; cursor += blockMinutes) {
      const end = cursor + blockMinutes;
      const hitsBlock = blocked.some(([start, stop]) => rangesOverlap(cursor, end, start, stop));
      if (!hitsBlock) out.push(fromMinutes(cursor));
    }
    return out;
  };

  const slots = [];
  const seen = new Set();

  // 1) Shift that starts on this calendar date
  const hours = resolveHoursForStaff(staffId, date);
  if (hours && hours.isOpen !== false) {
    const open = toMinutes(hours.opensAt);
    const close = toMinutes(hours.closesAt);
    const blocked = [
      ...collectAppointmentsAndHolds(date),
      ...(shiftHours.isOvernightShift(hours.opensAt, hours.closesAt)
        ? shiftHours.simplifyBreakBlocks(hours, "evening")
        : shiftHours.simplifyBreakBlocks(hours, "day"))
    ];
    if (shiftHours.isOvernightShift(hours.opensAt, hours.closesAt)) {
      pushSlots(open, 1440, blocked).forEach((time) => {
        if (!seen.has(time)) {
          seen.add(time);
          slots.push(time);
        }
      });
    } else if (close > open) {
      pushSlots(open, close, blocked).forEach((time) => {
        if (!seen.has(time)) {
          seen.add(time);
          slots.push(time);
        }
      });
    }
  }

  // 2) Overnight continuation from previous calendar date into this morning
  const prevDate = shiftHours.addCalendarDays(date, -1);
  const prevHours = resolveHoursForStaff(staffId, prevDate);
  if (prevHours && prevHours.isOpen !== false && shiftHours.isOvernightShift(prevHours.opensAt, prevHours.closesAt)) {
    const close = toMinutes(prevHours.closesAt);
    const blocked = [
      ...collectAppointmentsAndHolds(date),
      ...shiftHours.simplifyBreakBlocks(prevHours, "morning")
    ];
    pushSlots(0, close, blocked).forEach((time) => {
      if (!seen.has(time)) {
        seen.add(time);
        slots.push(time);
      }
    });
  }

  slots.sort();
  return slots;
}

async function listPublicSlots(slug, { date, serviceId, staffId = "any", ignoreHolds = false } = {}) {
  if (store.bookingPage.slug !== slug || !store.bookingPage.onlineBookingEnabled) {
    fail("صفحة الحجز غير متاحة", 404);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) fail("التاريخ مطلوب");
  const service = store.services.find((item) => item.id === serviceId);
  if (!service || !service.publicBooking || service.active === false) fail("الخدمة غير متاحة للحجز العام", 400);
  assertServiceBookable(service);
  const blockMinutes = serviceBookingBlockMinutes(service);
  const providers = (service.providerIds || [])
    .map((id) => store.staff.find((person) => person.id === id && person.active))
    .filter(Boolean);
  if (!providers.length) fail("لا يمكن الحجز — هذه الخدمة بلا مقدم خدمة نشط", 400);
  const pool = providers;

  async function slotsForPerson(person) {
    let extraBlocked = [];
    if (opsPg.isOpsPgEnabled()) {
      try {
        const [pgAppointments, pgHolds] = await Promise.all([
          opsWorkspace.isPostgresWorkspace()
            ? Promise.resolve([])
            : opsPg.listPgBlockedRanges({
                slug,
                staffId: person.id,
                date,
                durationFallback: Number(service.durationMinutes || 30)
              }),
          opsPg.listPgHoldRanges({
            slug,
            staffId: person.id,
            date,
            blockMinutes
          })
        ]);
        extraBlocked = [...pgAppointments, ...pgHolds];
      } catch (error) {
        console.warn("[ops] postgres slot merge failed:", error.message);
      }
    }
    return listStaffSlotsForDay({
      staffId: person.id,
      date,
      blockMinutes,
      ignoreHolds,
      extraBlocked
    }).map((time) => ({
      time,
      staffId: person.id,
      staffName: person.name
    }));
  }

  if (staffId && staffId !== "any") {
    const person = pool.find((item) => item.id === staffId);
    if (!person) fail("هذا الموظف غير مرتبط بالخدمة", 400);
    return {
      date,
      serviceId,
      staffId: person.id,
      blockMinutes,
      slots: await slotsForPerson(person)
    };
  }

  const merged = new Map();
  for (const person of pool) {
    const personSlots = await slotsForPerson(person);
    for (const slot of personSlots) {
      if (!merged.has(slot.time)) merged.set(slot.time, slot);
    }
  }
  return {
    date,
    serviceId,
    staffId: "any",
    blockMinutes,
    slots: [...merged.values()].sort((a, b) => a.time.localeCompare(b.time))
  };
}

async function holdPublicSlot(slug, payload = {}) {
  const listed = await listPublicSlots(slug, payload);
  const time = String(payload.time || "");
  const match = listed.slots.find((slot) => slot.time === time);
  if (!match) fail("هذا الوقت لم يعد متاحاً", 409);
  slotHolds.set(holdKey(match.staffId, listed.date, time), Date.now() + 3 * 60 * 1000);
  persistHolds();
  if (opsPg.isOpsPgEnabled()) {
    try {
      await opsPg.upsertSlotHold({
        staffId: match.staffId,
        date: listed.date,
        time,
        expiresAt: new Date(Date.now() + 3 * 60 * 1000).toISOString(),
        slug
      });
    } catch (error) {
      console.warn("[ops] postgres hold upsert failed:", error.message);
    }
  }
  return { ok: true, holdSeconds: 180, staffId: match.staffId, date: listed.date, time };
}

async function createPublicAppointment(slug, payload = {}) {
  const workspaceId = opsWorkspace.currentWorkspaceId(defaultStore);
  return bookingAtomic.withBookingLock(workspaceId, async () => {
    if (store.bookingPage.slug !== slug || !store.bookingPage.onlineBookingEnabled) {
      fail("صفحة الحجز غير متاحة", 404);
    }
    const idempotencyKey = bookingAtomic.normalizeIdempotencyKey(payload.idempotencyKey);
    if (idempotencyKey) {
      const existing = bookingAtomic.findAppointmentByIdempotencyKey(
        store.appointments,
        idempotencyKey
      );
      if (existing) return existing;
    }
    const serviceId = String(payload.serviceId || "");
    const service = store.services.find((item) => item.id === serviceId);
    if (!service || !service.publicBooking || service.active === false) {
      fail("الخدمة غير متاحة للحجز العام", 400);
    }
    assertServiceBookable(service);
    const date = String(payload.date || "");
    const time = String(payload.time || "");
    let staffId = String(payload.staffId || "");
    // Drop the booker's soft hold before availability re-check so they are not blocked by themselves.
    if (staffId && staffId !== "any") {
      bookingAtomic.releaseHoldOnce(slotHolds, { staffId, date, time }, persistHolds);
    } else {
      purgeExpiredHolds();
      for (const key of [...slotHolds.keys()]) {
        const [, holdDate, holdTime] = key.split("|");
        if (holdDate === date && holdTime === time) slotHolds.delete(key);
      }
      persistHolds();
    }
    if (opsPg.isOpsPgEnabled()) {
      try {
        await opsPg.releaseSlotHold({ staffId: staffId || "any", date, time, slug });
      } catch (error) {
        console.warn("[ops] postgres hold release failed:", error.message);
      }
    }
    if (!staffId || staffId === "any") {
      const available = await listPublicSlots(slug, {
        date,
        serviceId,
        staffId: "any",
        ignoreHolds: true
      });
      const match = available.slots.find((slot) => slot.time === time);
      if (!match) fail("لا يوجد موظف متاح في هذا الوقت", 409);
      staffId = match.staffId;
    } else {
      const available = await listPublicSlots(slug, {
        date,
        serviceId,
        staffId,
        ignoreHolds: true
      });
      if (!available.slots.some((slot) => slot.time === time)) fail("هذا الوقت لم يعد متاحاً", 409);
    }
    const appointment = createAppointment({
      ...payload,
      idempotencyKey: idempotencyKey || undefined,
      serviceId,
      staffId,
      date,
      time,
      customerName: payload.customerName || payload.patientName,
      phone: payload.phone,
      email: payload.email,
      paymentMethod: payload.paymentMethod || "cash"
    });

    if (opsPg.isOpsPgEnabled() && !opsWorkspace.isPostgresWorkspace()) {
      const staff = store.staff.find((person) => person.id === appointment.staffId);
      const category = store.serviceCategories.find((item) => item.id === service.categoryId);
      try {
        await opsPg.persistPublicAppointment({
          slug,
          appointment,
          service,
          staff,
          phone: payload.phone,
          email: payload.email,
          categoryName: category?.name || service.categoryId
        });
      } catch (error) {
        store.appointments = store.appointments.filter((item) => item.id !== appointment.id);
        persist();
        throw error;
      }
    }

    return appointment;
  });
}

function updateAppointmentStatus(id, status) {
  const nextStatus = String(status || "").trim();
  const aliasMap = {
    check_in: "checked_in",
    cancel: "cancelled",
    canceled: "cancelled",
    no_show: "no_show",
    "no-show": "no_show",
    noShow: "no_show"
  };
  const normalized = aliasMap[nextStatus] || nextStatus;
  const allowed = new Set(["pending", "confirmed", "checked_in", "completed", "cancelled", "no_show"]);
  if (!allowed.has(normalized)) fail("حالة الموعد غير صالحة");
  const appointment = store.appointments.find((item) => item.id === id);
  if (!appointment) fail("الموعد غير موجود", 404);

  const validTransitions = {
    pending: ["confirmed", "cancelled", "no_show"],
    confirmed: ["checked_in", "completed", "cancelled", "no_show"],
    checked_in: ["completed", "cancelled", "no_show"],
    completed: [],
    cancelled: [],
    no_show: []
  };
  const current = appointment.status || "pending";
  if (!validTransitions[current]?.includes(normalized) && current !== normalized) {
    fail(`لا يمكن تحويل حالة الموعد من ${current} إلى ${normalized}`, 400);
  }

  appointment.status = normalized;
  appointment.updatedAt = new Date().toISOString();
  if (normalized === "checked_in" && !appointment.checkedInAt) {
    appointment.checkedInAt = appointment.updatedAt;
  }
  if (normalized === "completed" && !appointment.completedAt) {
    appointment.completedAt = appointment.updatedAt;
  }
  if ((normalized === "cancelled" || normalized === "no_show") && !appointment.completedAt && normalized === "no_show") {
    appointment.completedAt = appointment.updatedAt;
  }
  if (normalized === "cancelled") {
    capacityOps.ensureCapacityCollections(store);
    capacityOps.releaseAllocationsForBooking(store, appointment.id);
  }
  persist();
  return appointment;
}

function getCalendarPreferences() {
  return store.calendarPreferences;
}

function updateCalendarPreferences(payload) {
  store.calendarPreferences = { ...store.calendarPreferences, ...payload };
  persist();
  return store.calendarPreferences;
}

function getNotificationSettings() {
  return store.notifications;
}

function updateNotificationSettings(payload) {
  store.notifications = {
    ...store.notifications,
    ...payload,
    email: { ...store.notifications.email, ...(payload.email || {}) },
    messaging: { ...store.notifications.messaging, ...(payload.messaging || {}) }
  };
  persist();
  return store.notifications;
}

function listExpenses() {
  return store.expenses;
}

function createExpense(payload) {
  const name = String(payload.name || "").trim();
  const amount = Number(payload.amount);
  if (!name || Number.isNaN(amount) || amount < 0) fail("الاسم والمبلغ مطلوبان");
  const expense = {
    id: createId("expense"),
    name,
    amount,
    category: String(payload.category || "general"),
    date: payload.date || new Date().toISOString().slice(0, 10),
    description: String(payload.description || ""),
    recurrence: payload.recurrence || "none"
  };
  store.expenses.unshift(expense);
  persist();
  return expense;
}

function listAppointments({ from = "", to = "" } = {}) {
  return store.appointments
    .filter((item) => (!from || item.date >= from) && (!to || item.date <= to))
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
}

function createAppointment(payload) {
  assertPlanCapacity("appointments");
  const idempotencyKey = bookingAtomic.normalizeIdempotencyKey(payload.idempotencyKey);
  if (idempotencyKey) {
    const existing = bookingAtomic.findAppointmentByIdempotencyKey(store.appointments, idempotencyKey);
    if (existing) return existing;
  }
  const customerName = String(payload.customerName || payload.patientName || "").trim();
  const date = String(payload.date || "");
  const time = String(payload.time || "");
  const staffId = String(payload.staffId || payload.doctorId || "");
  const serviceId = String(payload.serviceId || "");
  if (!customerName || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time) || !staffId) {
    fail("العميل والتاريخ والوقت والموظف مطلوبون");
  }
  const staff = store.staff.find((person) => person.id === staffId);
  if (!staff) fail("الموظف غير موجود", 404);
  const service = store.services.find((item) => item.id === serviceId) || null;
  if (serviceId && !service) fail("الخدمة غير موجودة", 404);
  if (service) {
    const providers = assertServiceBookable(service);
    if (!providers.includes(staffId)) fail("هذا الموظف غير مرتبط بالخدمة", 400);
  }
  const phone = String(payload.phone || "").trim();
  const email = String(payload.email || "").trim();
  const blockMinutes = serviceBookingBlockMinutes(service);
  const interval = bookingAtomic.occupancyInterval({
    date,
    time,
    durationMinutes: service?.durationMinutes || 30,
    bufferMinutes: service?.bufferMinutes || 0
  });
  const availableTimes = listStaffSlotsForDay({
    staffId,
    date,
    blockMinutes,
    ignoreHolds: true
  });
  if (!availableTimes.includes(time)) fail("الموظف غير متاح في هذا الوقت أو خارج ساعات العمل", 409);
  // Stronger than equal-start-only: any overlapping [start, end+buffer) collides.
  // Uses the same occupancyInterval helper as availability.
  const collision = bookingAtomic.findStaffOverlap({
    appointments: store.appointments,
    services: store.services,
    staffId,
    date,
    startMinutes: interval.startMinutes,
    endMinutes: interval.endMinutes
  });
  if (collision) fail("هذا الموظف محجوز في نفس الوقت", 409);

  // Phase 4: auto-allocate exclusive/rental resources when required or requested.
  // session_capacity uses enrollments, not exclusive resource allocation on create.
  capacityOps.ensureCapacityCollections(store);
  const occupancyIso = capacityOps.appointmentOccupancyIso(interval);
  let bookingResource = null;
  if (service) {
    const occupancy = capacityEngine.normalizeOccupancyMode(service.occupancyMode, "exclusive");
    if (occupancy === "exclusive" || occupancy === "rental") {
      bookingResource = capacityOps.resolveBookingResource(store, {
        service,
        resourceId: payload.resourceId || null,
        startsAt: occupancyIso.startsAt,
        endsAt: occupancyIso.endsAt
      });
    }
  }

  let customer = null;
  if (phone) {
    customer = store.customers.find((item) => String(item.phone || "").replace(/\s+/g, "") === phone.replace(/\s+/g, ""));
  }
  if (!customer) {
    customer = store.customers.find(
      (item) => `${item.firstName} ${item.lastName}`.trim().toLowerCase() === customerName.toLowerCase()
    );
  }
  if (customer) {
    const [firstName, ...rest] = customerName.split(/\s+/);
    customer.firstName = firstName || customer.firstName;
    customer.lastName = rest.join(" ") || customer.lastName;
    if (phone) customer.phone = phone;
    if (email) customer.email = email;
    persist();
  } else {
    const [firstName, ...rest] = customerName.split(/\s+/);
    customer = createCustomer({ firstName, lastName: rest.join(" "), phone, email, categoryId: "cat-new" });
  }

  const pricing = service ? resolveBookingPricing(service, payload) : {
    pricingType: "fixed",
    priceMin: 0,
    priceMax: 0,
    depositAmount: 0,
    amount: Number(payload.amount || 0) || 0,
    pricingStatus: "fixed",
    paymentStatus: "unpaid"
  };

  const appointment = {
    id: createId("appt"),
    date,
    time,
    customerId: customer.id,
    customerName: `${customer.firstName} ${customer.lastName}`.trim(),
    staffId: staff.id,
    staffName: staff.name,
    serviceId: service?.id || null,
    serviceName: service?.name || "موعد",
    categoryId: service?.categoryId || "",
    durationMinutes: service?.durationMinutes || 30,
    paymentMethod: payload.paymentMethod || "cash",
    paymentStatus: pricing.paymentStatus,
    pricingType: pricing.pricingType,
    priceMin: pricing.priceMin,
    priceMax: pricing.priceMax,
    depositAmount: pricing.depositAmount,
    amount: pricing.amount,
    pricingStatus: pricing.pricingStatus,
    notes: String(payload.notes || ""),
    status: service?.autoAccept ? "confirmed" : "pending",
    checkInToken: opsDesk.createCheckInToken(),
    checkedInAt: null,
    checkedInByStaffId: null,
    completedAt: null,
    lineItems: [opsDesk.buildPrimaryLineItem(service, pricing)],
    visitLog: [],
    createdAt: new Date().toISOString()
  };
  if (idempotencyKey) appointment.idempotencyKey = idempotencyKey;
  if (bookingResource) appointment.resourceId = bookingResource.id;
  // Re-check idempotency after building customer (another waiter may have committed).
  if (idempotencyKey) {
    const raced = bookingAtomic.findAppointmentByIdempotencyKey(store.appointments, idempotencyKey);
    if (raced) return raced;
  }
  store.appointments.push(appointment);
  try {
    if (bookingResource) {
      capacityOps.allocateResourceForBooking(store, {
        resourceId: bookingResource.id,
        serviceId: service?.id || null,
        bookingId: appointment.id,
        startsAt: occupancyIso.startsAt,
        endsAt: occupancyIso.endsAt,
        occupancyMode: service?.occupancyMode
      });
    }
    persist();
  } catch (error) {
    store.appointments = store.appointments.filter((item) => item.id !== appointment.id);
    capacityOps.releaseAllocationsForBooking(store, appointment.id);
    persist();
    throw error;
  }
  return appointment;
}

function createAppointmentAsync(payload) {
  const workspaceId = opsWorkspace.currentWorkspaceId(defaultStore);
  return bookingAtomic.withBookingLock(workspaceId, async () => createAppointment(payload));
}

function listDeskToday({ categoryId = "", date = "" } = {}) {
  const tz = store.bookingPage?.timezone || "Africa/Cairo";
  const day = date || opsDesk.todayInTimezone(tz);
  const rows = store.appointments
    .filter((item) => item.date === day && item.status !== "cancelled" && item.status !== "canceled")
    .map((item) => opsDesk.enrichAppointmentForDesk(item, store))
    .filter((item) => !categoryId || item.categoryId === categoryId)
    .sort((a, b) => String(a.time).localeCompare(String(b.time)));

  const waiting = rows.filter((item) => item.status === "pending" || item.status === "confirmed");
  const active = rows.filter((item) => item.status === "checked_in");
  const done = rows.filter((item) => item.status === "completed" || item.status === "no_show");

  return {
    date: day,
    categoryId: categoryId || null,
    counts: { waiting: waiting.length, active: active.length, done: done.length, total: rows.length },
    waiting,
    active,
    done,
    appointments: rows
  };
}

function findAppointmentByCheckInToken(token) {
  const clean = String(token || "").trim();
  if (!clean) return null;
  return store.appointments.find((item) => item.checkInToken === clean) || null;
}

function getPublicPass(slug, token) {
  if (store.bookingPage.slug !== slug) fail("صفحة الحجز غير متاحة", 404);
  const appointment = findAppointmentByCheckInToken(token);
  if (!appointment) fail("رمز الحضور غير صالح", 404);
  const enriched = opsDesk.enrichAppointmentForDesk(appointment, store);
  return {
    businessName: store.bookingPage.businessName,
    slug,
    appointment: {
      id: enriched.id,
      date: enriched.date,
      time: enriched.time,
      serviceName: enriched.serviceName,
      staffName: enriched.staffName,
      customerName: enriched.customerName,
      status: enriched.status,
      categoryName: enriched.categoryName,
      amount: enriched.amount,
      pricingType: enriched.pricingType,
      pricingStatus: enriched.pricingStatus,
      checkInToken: enriched.checkInToken,
      checkedInAt: enriched.checkedInAt || null
    }
  };
}

function previewCheckIn(token) {
  const appointment = findAppointmentByCheckInToken(token);
  if (!appointment) fail("رمز الحضور غير معروف", 404);
  if (appointment.status === "cancelled" || appointment.status === "canceled") {
    fail("هذا الموعد ملغى", 400);
  }
  const service = store.services.find((item) => item.id === appointment.serviceId) || null;
  const enriched = opsDesk.enrichAppointmentForDesk(appointment, store);
  const today = opsDesk.todayInTimezone(store.bookingPage?.timezone || "Africa/Cairo");
  return {
    today,
    sameDay: enriched.date === today,
    appointment: enriched,
    providers: service
      ? (service.providerIds || [])
        .map((id) => store.staff.find((person) => person.id === id))
        .filter(Boolean)
        .map((person) => ({ id: person.id, name: person.name, title: person.title || "" }))
      : []
  };
}

function applyCheckInUpdates(appointment, updates = {}) {
  if (!updates || typeof updates !== "object") return appointment;
  if (updates.customerName != null) {
    const name = String(updates.customerName || "").trim();
    if (!name) fail("اسم العميل مطلوب", 400);
    appointment.customerName = name;
  }
  if (updates.serviceId) {
    const service = store.services.find((item) => item.id === updates.serviceId && item.active !== false);
    if (!service) fail("الخدمة المحددة غير موجودة", 404);
    appointment.serviceId = service.id;
    appointment.serviceName = service.name;
    appointment.categoryId = service.categoryId;
    const primary = (appointment.lineItems || []).find((item) => item.kind === "primary");
    if (primary) primary.name = service.name;
  }
  const service = store.services.find((item) => item.id === appointment.serviceId) || null;
  if (updates.staffId) {
    const staff = store.staff.find((person) => person.id === updates.staffId && person.active !== false);
    if (!staff) fail("مقدم الخدمة غير موجود", 404);
    const providers = service?.providerIds || [];
    if (providers.length && !providers.includes(staff.id)) {
      fail("مقدم الخدمة المحدد غير مربوط بهذه الخدمة", 400);
    }
    appointment.staffId = staff.id;
    appointment.staffName = staff.name;
  }
  if (updates.date) {
    const date = String(updates.date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail("تاريخ الحجز غير صالح", 400);
    appointment.date = date;
  }
  if (updates.time) {
    const time = String(updates.time);
    if (!/^\d{2}:\d{2}$/.test(time)) fail("وقت الحجز غير صالح", 400);
    appointment.time = time;
  }
  if (updates.amount != null && updates.amount !== "") {
    const amount = Number(updates.amount);
    if (!Number.isFinite(amount) || amount < 0) fail("المبلغ غير صالح", 400);
    const rounded = Math.round(amount);
    const primary = (appointment.lineItems || []).find((item) => item.kind === "primary");
    if (primary) primary.amount = rounded;
    appointment.amount = Array.isArray(appointment.lineItems) && appointment.lineItems.length
      ? opsDesk.sumLineItems(appointment.lineItems)
      : rounded;
    if (appointment.pricingStatus === "quote_pending") appointment.pricingStatus = "quoted";
  }
  appointment.updatedAt = new Date().toISOString();
  return appointment;
}

/**
 * Check-in by unguessable token.
 * The scanned booking sets the department; a previously selected desk category must not block it.
 */
function checkInByToken({ token, actorStaffId = "", updates = null } = {}) {
  const appointment = findAppointmentByCheckInToken(token);
  if (!appointment) fail("رمز الحضور غير معروف أو منتهي", 404);
  if (appointment.status === "cancelled" || appointment.status === "canceled") {
    fail("هذا الموعد ملغى", 400);
  }
  if (appointment.status === "completed") fail("الزيارة مكتملة مسبقاً", 400);

  const beforeService = store.services.find((item) => item.id === appointment.serviceId) || null;
  opsDesk.ensureVisitFields(appointment, beforeService, {
    amount: appointment.amount,
    pricingType: appointment.pricingType
  }, store);
  if (updates) applyCheckInUpdates(appointment, updates);

  const service = store.services.find((item) => item.id === appointment.serviceId) || null;
  if (service?.categoryId) appointment.categoryId = service.categoryId;

  const day = opsDesk.todayInTimezone(store.bookingPage?.timezone || "Africa/Cairo");
  if (appointment.date !== day) {
    persist();
    fail(`تم حفظ التعديل، لكن الحضور متاح فقط في يوم الموعد (${appointment.date}). اليوم هو ${day}.`, 400);
  }

  if (appointment.status === "checked_in") {
    persist();
    return opsDesk.enrichAppointmentForDesk(appointment, store);
  }

  let actor = null;
  if (actorStaffId) {
    actor = store.staff.find((person) => person.id === actorStaffId) || null;
  }

  appointment.status = "checked_in";
  appointment.checkedInAt = new Date().toISOString();
  appointment.checkedInByStaffId = actor?.id || null;
  appointment.checkedInByName = actor?.name || "";
  appointment.updatedAt = appointment.checkedInAt;
  opsDesk.ensureVisitFields(appointment, service, {
    amount: appointment.amount,
    pricingType: appointment.pricingType,
    priceMin: appointment.priceMin,
    priceMax: appointment.priceMax,
    pricingStatus: appointment.pricingStatus,
    durationMinutes: appointment.durationMinutes || service?.durationMinutes
  }, store);
  opsDesk.pushVisitLog(appointment, {
    type: "check_in",
    byStaffId: actor?.id || null,
    byStaffName: actor?.name || "",
    meta: {
      categoryId: appointment.categoryId || null,
      edited: Boolean(updates),
      expectedEndAt: appointment.expectedEndAt || null
    }
  });
  persist();
  return opsDesk.enrichAppointmentForDesk(appointment, store);
}

function addAppointmentAddon(appointmentId, { serviceId, actorStaffId = "", amount = null } = {}) {
  const appointment = store.appointments.find((item) => item.id === appointmentId);
  if (!appointment) fail("الموعد غير موجود", 404);
  if (appointment.status !== "checked_in") {
    fail("إضافة الخدمات متاحة فقط أثناء زيارة نشطة (تم الحضور)", 400);
  }
  const addon = store.services.find((item) => item.id === serviceId && item.active !== false);
  if (!addon) fail("الخدمة الإضافية غير موجودة", 404);

  const primary = store.services.find((item) => item.id === appointment.serviceId) || null;
  const primaryCategory = appointment.categoryId || primary?.categoryId || "";
  if (primaryCategory && addon.categoryId !== primaryCategory) {
    fail("يُسمح فقط بخدمات نفس القسم/الفئة أثناء الزيارة", 400);
  }

  opsDesk.ensureVisitFields(appointment, primary, {
    amount: appointment.amount,
    pricingType: appointment.pricingType,
    priceMin: appointment.priceMin,
    priceMax: appointment.priceMax,
    pricingStatus: appointment.pricingStatus,
    durationMinutes: appointment.durationMinutes
  }, store);

  const pricing = resolveBookingPricing(addon, amount != null ? { amount } : {});
  const actor = actorStaffId
    ? store.staff.find((person) => person.id === actorStaffId) || null
    : null;

  const line = opsDesk.buildAddonLineItem(addon, {
    ...pricing,
    amount: amount != null && Number.isFinite(Number(amount))
      ? Math.round(Number(amount))
      : pricing.amount,
    durationMinutes: addon.durationMinutes
  }, { id: createId("line"), actor });

  appointment.lineItems.push(line);
  opsDesk.syncAppointmentTotalsFromLines(appointment);
  if (appointment.paymentStatus === "paid" && line.amount > 0) {
    appointment.paymentStatus = "partial";
  }
  appointment.updatedAt = line.addedAt;
  opsDesk.pushVisitLog(appointment, {
    type: "addon",
    byStaffId: actor?.id || null,
    byStaffName: actor?.name || "",
    meta: {
      serviceId: addon.id,
      name: addon.name,
      amount: line.amount,
      pricingType: line.pricingType,
      expectedEndAt: appointment.expectedEndAt || null
    }
  });
  persist();
  return opsDesk.enrichAppointmentForDesk(appointment, store);
}

/**
 * Set / finalize a single provided-service line price during an active desk visit.
 * Used for range (within min–max) and on_request quotes before or at session end.
 */
function setDeskLinePricing(appointmentId, lineId, { amount, actorStaffId = "" } = {}) {
  const appointment = store.appointments.find((item) => item.id === appointmentId);
  if (!appointment) fail("الموعد غير موجود", 404);
  if (appointment.status !== "checked_in") {
    fail("تسعير بنود الزيارة متاح فقط أثناء جلسة حضور نشطة", 400);
  }
  const primary = store.services.find((item) => item.id === appointment.serviceId) || null;
  opsDesk.ensureVisitFields(appointment, primary, {
    amount: appointment.amount,
    pricingType: appointment.pricingType,
    priceMin: appointment.priceMin,
    priceMax: appointment.priceMax,
    pricingStatus: appointment.pricingStatus
  }, store);
  const line = (appointment.lineItems || []).find((item) => item.id === lineId);
  if (!line) fail("بند الخدمة غير موجود في الزيارة", 404);

  const normalized = opsDesk.normalizeLineItem(line, store);
  Object.assign(line, {
    pricingType: normalized.pricingType,
    priceMin: normalized.priceMin,
    priceMax: normalized.priceMax,
    pricingStatus: normalized.pricingStatus,
    durationMinutes: normalized.durationMinutes
  });

  try {
    opsDesk.applyLineFinalPrice(line, amount);
  } catch (err) {
    fail(err.message || "تعذر تثبيت سعر البند", err.status || 400);
  }

  opsDesk.syncAppointmentTotalsFromLines(appointment);
  const actor = actorStaffId
    ? store.staff.find((person) => person.id === actorStaffId) || null
    : null;
  appointment.updatedAt = new Date().toISOString();
  opsDesk.pushVisitLog(appointment, {
    type: "line_pricing",
    byStaffId: actor?.id || null,
    byStaffName: actor?.name || "",
    meta: {
      lineId: line.id,
      name: line.name,
      amount: line.amount,
      pricingStatus: line.pricingStatus
    }
  });
  persist();
  return opsDesk.enrichAppointmentForDesk(appointment, store);
}

/**
 * End desk visit: apply optional per-line final prices, require all range/on_request
 * lines to be finalized, then mark completed. autoEnded=true when timer elapsed.
 */
function completeDeskVisit(appointmentId, {
  actorStaffId = "",
  notes = "",
  linePrices = null,
  autoEnded = false
} = {}) {
  const appointment = store.appointments.find((item) => item.id === appointmentId);
  if (!appointment) fail("الموعد غير موجود", 404);
  if (appointment.status !== "checked_in" && appointment.status !== "confirmed") {
    fail("لا يمكن إنهاء زيارة بهذه الحالة", 400);
  }
  const primary = store.services.find((item) => item.id === appointment.serviceId) || null;
  opsDesk.ensureVisitFields(appointment, primary, {
    amount: appointment.amount,
    pricingType: appointment.pricingType,
    priceMin: appointment.priceMin,
    priceMax: appointment.priceMax,
    pricingStatus: appointment.pricingStatus
  }, store);

  // Persist normalized meta onto live lines before applying prices.
  appointment.lineItems = (appointment.lineItems || []).map((line) => {
    const normalized = opsDesk.normalizeLineItem(line, store);
    Object.assign(line, {
      pricingType: normalized.pricingType,
      priceMin: normalized.priceMin,
      priceMax: normalized.priceMax,
      pricingStatus: normalized.pricingStatus,
      durationMinutes: normalized.durationMinutes,
      amount: normalized.amount
    });
    return line;
  });

  const priceMap = new Map();
  if (Array.isArray(linePrices)) {
    for (const entry of linePrices) {
      if (!entry?.lineId) continue;
      priceMap.set(String(entry.lineId), entry.amount);
    }
  }

  for (const line of appointment.lineItems) {
    if (priceMap.has(line.id)) {
      try {
        opsDesk.applyLineFinalPrice(line, priceMap.get(line.id));
      } catch (err) {
        fail(err.message || "تعذر تثبيت سعر البند", err.status || 400);
      }
    }
  }

  const pending = appointment.lineItems.filter((line) => opsDesk.lineNeedsFinalPrice(line));
  if (pending.length) {
    const names = pending.map((line) => line.name).join("، ");
    fail(
      `يجب إدخال السعر النهائي للخدمات غير المسعّرة أو ذات النطاق قبل إنهاء الجلسة: ${names}`,
      400
    );
  }

  opsDesk.syncAppointmentTotalsFromLines(appointment);

  const actor = actorStaffId
    ? store.staff.find((person) => person.id === actorStaffId) || null
    : null;
  appointment.status = "completed";
  appointment.completedAt = new Date().toISOString();
  appointment.updatedAt = appointment.completedAt;
  appointment.completedAuto = Boolean(autoEnded);
  if (notes) {
    appointment.notes = [appointment.notes, notes].filter(Boolean).join(" · ");
  }
  opsDesk.pushVisitLog(appointment, {
    type: "complete",
    byStaffId: actor?.id || null,
    byStaffName: actor?.name || "",
    meta: {
      amount: appointment.amount,
      autoEnded: Boolean(autoEnded),
      lineCount: appointment.lineItems.length,
      lines: appointment.lineItems.map((line) => ({
        id: line.id,
        name: line.name,
        amount: line.amount,
        pricingType: line.pricingType,
        pricingStatus: line.pricingStatus
      }))
    }
  });
  persist();
  return opsDesk.enrichAppointmentForDesk(appointment, store);
}

function getStatsSummary(fallbackAppointments = []) {
  const appointments = store.appointments.length ? store.appointments : fallbackAppointments;
  const today = new Date().toISOString().slice(0, 10);
  const completed = appointments.filter((item) => item.status === "completed" || item.status === "confirmed");
  const cancelled = appointments.filter((item) => item.status === "cancelled" || item.status === "canceled");
  const todayItems = appointments.filter((item) => item.date === today && item.status !== "cancelled" && item.status !== "canceled");
  const revenueTotal = completed.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const attendanceRate = appointments.length ? Math.round((completed.length / appointments.length) * 100) : 0;
  return {
    appointments: {
      completedCount: completed.length,
      cancelledCount: cancelled.length,
      totalCount: appointments.length,
      todayCount: todayItems.length,
      pendingCount: appointments.filter((item) => item.status === "pending").length
    },
    revenueTotal,
    attendanceRate,
    expensesTotal: store.expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    servicesCount: store.services.length,
    staffCount: store.staff.length,
    customersCount: store.customers.length
  };
}

function resetOpsData() {
  const next = defaultStore();
  next.workingHours = next.workingHours.map((day) => ({
    ...day,
    breakEnabled: true,
    breakStartsAt: day.breakStartsAt || "13:00",
    breakEndsAt: day.breakEndsAt || "14:00"
  }));
  opsWorkspace.replaceStoreData(ctx(), next);
  slotHolds.clear();
  persistHolds();
  try {
    opsWorkspace.registerSlug(next.bookingPage.slug, opsWorkspace.currentWorkspaceId(defaultStore));
  } catch {
    /* ignore */
  }
  return {
    ok: true,
    workspaceId: opsWorkspace.currentWorkspaceId(defaultStore),
    slug: store.bookingPage.slug,
    services: store.services.length,
    staff: store.staff.length,
    customers: store.customers.length,
    appointments: store.appointments.length
  };
}

function withWorkspace(workspaceId, fn) {
  return opsWorkspace.runWithWorkspace(workspaceId, defaultStore, fn);
}

function withWorkspaceAsync(workspaceId, fn) {
  return opsWorkspace.runWithWorkspaceAsync(workspaceId, defaultStore, fn);
}

function resolveWorkspaceIdForSlug(slug) {
  opsWorkspace.ensureCache(opsWorkspace.DEFAULT_WORKSPACE_ID, defaultStore);
  return opsWorkspace.resolveWorkspaceIdBySlug(slug);
}

function resolveWorkspaceIdForSlugAsync(slug) {
  return opsWorkspace.resolveWorkspaceIdBySlugAsync(slug, defaultStore);
}

function seedWorkspaceStore(workspaceId, options = {}) {
  return opsWorkspace.seedWorkspace(workspaceId, options, defaultStore);
}

function getCurrentWorkspaceId() {
  return opsWorkspace.currentWorkspaceId(defaultStore);
}

module.exports = {
  createId,
  DEFAULT_WORKSPACE_ID: opsWorkspace.DEFAULT_WORKSPACE_ID,
  withWorkspace,
  withWorkspaceAsync,
  resolveWorkspaceIdForSlug,
  resolveWorkspaceIdForSlugAsync,
  seedWorkspaceStore,
  getCurrentWorkspaceId,
  listActivityTemplates,
  getActivityProfile,
  updateActivityProfile,
  applyActivityTemplate,
  saveUploadedLogo,
  saveUploadedImage,
  getPlanUsage,
  listCustomers,
  createCustomer,
  listCustomerCategories,
  createCustomerCategory,
  listStaff,
  createStaff,
  updateStaff,
  deleteStaff,
  assertStaffProFeatureClosed,
  listServiceCategories,
  createServiceCategory,
  updateServiceCategory,
  deleteServiceCategory,
  listServices,
  createService,
  updateService,
  deleteService,
  addServiceProvider,
  removeServiceProvider,
  setServiceProviders,
  getWorkingSchedule,
  saveWorkingHours,
  addClosedDay,
  addSpecificDay,
  getBookingPage,
  updateBookingPage,
  getPublicBooking,
  listPublicSlots,
  holdPublicSlot,
  cancelSlotHold,
  createPublicAppointment,
  updateAppointmentStatus,
  getCalendarPreferences,
  updateCalendarPreferences,
  getNotificationSettings,
  updateNotificationSettings,
  listExpenses,
  createExpense,
  listAppointments,
  createAppointment,
  createAppointmentAsync,
  setAppointmentPricing,
  rangesOverlap,
  appointmentBlockMinutes,
  createResource,
  listResources,
  updateResource,
  listSessionOccurrences,
  requireServiceResource,
  createSessionOccurrence,
  enrollInOccurrence,
  cancelEnrollment,
  recordAttendance,
  allocateResourceForBooking,
  createBundleAllocations,
  releaseAllocation,
  getOccurrenceAvailability,
  listDeskToday,
  getPublicPass,
  previewCheckIn,
  checkInByToken,
  addAppointmentAddon,
  setDeskLinePricing,
  completeDeskVisit,
  getStatsSummary,
  resetOpsData
};
