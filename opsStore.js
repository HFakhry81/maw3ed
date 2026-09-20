const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const opsPg = require("./opsPg");
const opsWorkspace = require("./opsWorkspace");
const shiftHours = require("./shiftHours");

function createId(prefix) {
  return `${prefix}-${crypto.randomBytes(4).toString("hex")}`;
}

const MEDICAL_DEPARTMENTS = [
  { id: "dept-outpatient", name: "العيادات الخارجية" },
  { id: "dept-internal", name: "الباطنية" },
  { id: "dept-pediatrics", name: "الأطفال" },
  { id: "dept-obgyn", name: "النساء والولادة" },
  { id: "dept-dental", name: "الأسنان" },
  { id: "dept-radiology", name: "الأشعة" },
  { id: "dept-lab", name: "المختبر" },
  { id: "dept-dermatology", name: "الجلدية" },
  { id: "dept-ophthalmology", name: "العيون" },
  { id: "dept-cardiology", name: "القلب" },
  { id: "dept-orthopedics", name: "العظام" },
  { id: "dept-ent", name: "الأنف والأذن" },
  { id: "dept-er", name: "الطوارئ" },
  { id: "dept-physio", name: "العلاج الطبيعي" },
  { id: "dept-pharmacy", name: "الصيدلية" }
];

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
  return {
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
    serviceCategories: MEDICAL_DEPARTMENTS.map((department, sort) => ({
      id: department.id,
      name: department.name,
      sort,
      enabled: true
    })),
    services: [
      {
        id: "svc-1",
        categoryId: "dept-er",
        name: "كشف أخصائي",
        durationMinutes: 30,
        bufferMinutes: 30,
        pricingType: "fixed",
        price: 150,
        color: "#1967e8",
        providerIds: ["staff-hf"],
        publicBooking: true,
        autoAccept: true,
        autoComplete: false,
        description: ""
      },
      {
        id: "svc-2",
        categoryId: "dept-er",
        name: "تذكرة دخول طوارئ",
        durationMinutes: 30,
        bufferMinutes: 15,
        pricingType: "fixed",
        price: 150,
        color: "#16ae7c",
        providerIds: ["staff-rec"],
        publicBooking: true,
        autoAccept: true,
        autoComplete: true,
        description: ""
      }
    ],
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
    medicalDepartments: MEDICAL_DEPARTMENTS.map((department) => ({ ...department, enabled: true })),
    planKey: "free"
  };
}

const ACTIVITY_TEMPLATES = [
  { id: "medical", mode: "medical", displayName: "مركز طبي", description: "عيادات ومستشفيات ومراكز رعاية صحية" },
  { id: "clinic", mode: "flexible", displayName: "عيادة", description: "عيادات تخصصية ومراكز كشف" },
  { id: "dentist", mode: "flexible", displayName: "طبيب أسنان", description: "عيادات طب الأسنان" },
  { id: "salon", mode: "flexible", displayName: "صالون الشعر", description: "قص وتصفيف وعناية بالشعر" },
  { id: "barber", mode: "flexible", displayName: "صالون الحلاقة", description: "حلاقة رجالية" },
  { id: "beauty", mode: "flexible", displayName: "التجميل", description: "مراكز التجميل والعناية" },
  { id: "massage", mode: "flexible", displayName: "تدليك", description: "مساج وعلاج طبيعي خفيف" },
  { id: "spa", mode: "flexible", displayName: "منتجع صحي", description: "سبا وعافية" },
  { id: "consultant", mode: "flexible", displayName: "استشاري", description: "استشارات مهنية" },
  { id: "education", mode: "flexible", displayName: "مركز تعليمي", description: "دروس وتدريب" },
  { id: "school", mode: "flexible", displayName: "مدرسة", description: "مدارس وحلقات تعليم" },
  { id: "fitness", mode: "flexible", displayName: "مركز رياضي", description: "جيم وحصص تدريب" },
  { id: "carwash", mode: "flexible", displayName: "غسيل سيارة", description: "غسيل وتلميع سيارات" },
  { id: "events", mode: "flexible", displayName: "تنظيم الأحداث", description: "فعاليات وحجوزات" },
  { id: "pets", mode: "flexible", displayName: "رعاية حيوانات أليفة", description: "عيادات وخدمات حيوانات" },
  { id: "billiards", mode: "flexible", displayName: "صالة بلياردو", description: "طاولات وألعاب بالساعة" },
  { id: "custom", mode: "flexible", displayName: "صناعة مخصصة", description: "نشاط مرن قابل للتخصيص بالكامل" }
];

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
  const customer = {
    id: createId("customer"),
    firstName,
    lastName: String(payload.lastName || "").trim(),
    phone: String(payload.phone || "").trim(),
    email: String(payload.email || "").trim(),
    address: String(payload.address || "").trim(),
    categoryId: payload.categoryId || "cat-new",
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
  service.providerIds = (providerIds || []).map(String).filter((id) => staffIds.has(id));
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

/** Staff-level closed days: stored for Pro prep; booking ignores them until Pro unlock. */
function normalizeStaffClosedDays(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item, index) => {
    const startDate = String(item.startDate || item.date || "").trim();
    return {
      id: String(item.id || `scd-${Date.now().toString(36)}-${index}`),
      startDate,
      endDate: String(item.endDate || startDate).trim() || startDate,
      description: String(item.description || "").trim()
    };
  }).filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.startDate));
}

/** Staff-level specific days: stored for Pro prep; booking ignores them until Pro unlock. */
function normalizeStaffSpecificDays(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item, index) => {
    const startDate = String(item.startDate || item.date || "").trim();
    return {
      id: String(item.id || `ssd-${Date.now().toString(36)}-${index}`),
      title: String(item.title || "").trim() || "يوم محدد",
      startDate,
      endDate: String(item.endDate || startDate).trim() || startDate,
      opensAt: String(item.opensAt || "08:00").trim(),
      closesAt: String(item.closesAt || "16:00").trim()
    };
  }).filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.startDate));
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

function resolveHoursForStaff(staffId, date) {
  if (isClosedCalendarDay(date)) return null;
  const specific = findSpecificDayOverride(date);
  if (specific) {
    return {
      isOpen: true,
      opensAt: specific.opensAt || "08:00",
      closesAt: specific.closesAt || "16:00",
      breakEnabled: Boolean(specific.breakStartsAt && specific.breakEndsAt),
      breakStartsAt: specific.breakStartsAt || "",
      breakEndsAt: specific.breakEndsAt || ""
    };
  }
  const weekday = new Date(`${date}T12:00:00`).getDay();
  const staff = store.staff.find((person) => person.id === staffId);
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
  void service;
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

function listActivityTemplates() {
  return ACTIVITY_TEMPLATES.map((item) => ({ ...item }));
}

function getActivityProfile() {
  const templateId = store.activityTemplateId || (store.activityMode === "flexible" ? "custom" : "medical");
  const template = ACTIVITY_TEMPLATES.find((item) => item.id === templateId) || ACTIVITY_TEMPLATES[0];
  return {
    mode: store.activityMode || "medical",
    locked: Boolean(store.activityModeLocked),
    templateId,
    templateDisplayName: template.displayName,
    medicalDepartments: store.medicalDepartments || MEDICAL_DEPARTMENTS.map((department) => ({ ...department, enabled: true })),
    flexibleHint: "في الوضع المرن يمكن تخصيص الحقول والخدمات لأي نشاط: تدريب، صالونات، استشارات، أو مؤسسات خدمية.",
    templates: listActivityTemplates()
  };
}

function applyMedicalCategories() {
  store.serviceCategories = (store.medicalDepartments || MEDICAL_DEPARTMENTS).filter((department) => department.enabled !== false).map((department, sort) => ({
    id: department.id,
    name: department.name,
    sort,
    enabled: true
  }));
}

function updateActivityProfile(payload = {}) {
  const locked = Boolean(store.activityModeLocked);
  const requestingModeChange =
    payload.mode != null && payload.mode !== store.activityMode;
  const requestingTemplateChange =
    payload.templateId != null && payload.templateId !== store.activityTemplateId;
  const requestingLock = payload.lock === true;

  if (locked && (requestingModeChange || requestingTemplateChange)) {
    fail("تم قفل نوع النشاط ولا يمكن تعديله بعد التأكيد.", 403);
  }

  if (!locked && payload.templateId) {
    const template = ACTIVITY_TEMPLATES.find((item) => item.id === payload.templateId);
    if (!template) fail("القالب غير موجود", 404);
    store.activityTemplateId = template.id;
    store.activityMode = template.mode;
    if (template.mode === "flexible" && template.id !== "medical") {
      const categoryName = template.displayName;
      if (!store.serviceCategories.some((item) => item.name === categoryName)) {
        store.serviceCategories.unshift({
          id: createId("svc-cat"),
          name: `فئة ${categoryName}`,
          sort: 0,
          enabled: true
        });
      }
      if (store.bookingPage) {
        store.bookingPage.industry = template.id;
        if (!store.bookingPage.businessName || store.bookingPage.businessName.includes("تجريب")) {
          store.bookingPage.businessName = template.displayName;
        }
      }
    }
  }

  if (!locked && payload.mode != null) {
    const mode = payload.mode === "flexible" ? "flexible" : payload.mode === "medical" ? "medical" : store.activityMode;
    store.activityMode = mode;
    if (mode === "medical") store.activityTemplateId = store.activityTemplateId || "medical";
    if (mode === "flexible" && store.activityTemplateId === "medical") store.activityTemplateId = "custom";
  }

  if (Array.isArray(payload.medicalDepartments)) {
    if (locked) fail("تم قفل نوع النشاط ولا يمكن تعديل الأقسام.", 403);
    store.medicalDepartments = payload.medicalDepartments.map((department) => ({
      id: String(department.id || createId("dept")),
      name: String(department.name || "").trim() || "قسم",
      enabled: department.enabled !== false
    }));
  }

  if (requestingLock) {
    store.activityModeLocked = true;
  }

  if (store.activityMode === "medical") applyMedicalCategories();
  persist();
  return getActivityProfile();
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
  const name = String(payload.name || `${firstName} ${lastName}`.trim()).trim();
  if (!name) fail("اسم الموظف مطلوب");
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
    person.firstName = firstName;
    person.lastName = lastName;
    person.name = String(payload.name || `${firstName} ${lastName}`.trim() || person.name).trim();
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
  const name = String(payload.name || "").trim();
  if (!name) fail("اسم الفئة مطلوب");
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
    const name = String(payload.name || "").trim();
    if (!name) fail("اسم الفئة مطلوب");
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
  const name = String(payload.name || "").trim();
  const categoryId = payload.categoryId;
  if (!name || !categoryId) fail("اسم الخدمة والفئة مطلوبان");
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
    description: String(payload.description || "")
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
  if (payload.name != null) service.name = String(payload.name).trim();
  if (payload.categoryId != null) service.categoryId = payload.categoryId;
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
  if (Array.isArray(payload.providerIds)) service.providerIds = payload.providerIds.map(String).filter(Boolean);
  else if (payload.providerId != null) service.providerIds = payload.providerId ? [String(payload.providerId)] : [];
  assertServiceProviders(service);
  sanitizeAndSyncStaffServiceLinks();
  persist();
  return enrichService(service);
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
  const registered = opsWorkspace.registerSlug(nextSlug, workspaceId);
  if (previousSlug && previousSlug !== registered) {
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
  let changed = false;
  for (const [key, expiresAt] of slotHolds.entries()) {
    if (expiresAt <= now) {
      slotHolds.delete(key);
      changed = true;
    }
  }
  if (changed) persistHolds();
}

function holdKey(staffId, date, time) {
  return `${staffId}|${date}|${time}`;
}

function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

function appointmentBlockMinutes(appointment) {
  const service = store.services.find((item) => item.id === appointment.serviceId);
  const duration = Number(appointment.durationMinutes || service?.durationMinutes || 30);
  const buffer = Number(service?.bufferMinutes || 0);
  return duration + buffer;
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
          opsPg.listPgBlockedRanges({
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
  if (store.bookingPage.slug !== slug || !store.bookingPage.onlineBookingEnabled) {
    fail("صفحة الحجز غير متاحة", 404);
  }
  const serviceId = String(payload.serviceId || "");
  const service = store.services.find((item) => item.id === serviceId);
  if (!service || !service.publicBooking || service.active === false) fail("الخدمة غير متاحة للحجز العام", 400);
  assertServiceBookable(service);
  const date = String(payload.date || "");
  const time = String(payload.time || "");
  let staffId = String(payload.staffId || "");
  // Drop the booker's soft hold before availability re-check so they are not blocked by themselves.
  if (staffId && staffId !== "any") {
    slotHolds.delete(holdKey(staffId, date, time));
    persistHolds();
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
      await opsPg.releaseSlotHold({ staffId: staffId || "any", date, time });
    } catch (error) {
      console.warn("[ops] postgres hold release failed:", error.message);
    }
  }
  if (!staffId || staffId === "any") {
    const available = await listPublicSlots(slug, { date, serviceId, staffId: "any", ignoreHolds: true });
    const match = available.slots.find((slot) => slot.time === time);
    if (!match) fail("لا يوجد موظف متاح في هذا الوقت", 409);
    staffId = match.staffId;
  } else {
    const available = await listPublicSlots(slug, { date, serviceId, staffId, ignoreHolds: true });
    if (!available.slots.some((slot) => slot.time === time)) fail("هذا الوقت لم يعد متاحاً", 409);
  }
  const appointment = createAppointment({
    ...payload,
    serviceId,
    staffId,
    date,
    time,
    customerName: payload.customerName || payload.patientName,
    phone: payload.phone,
    email: payload.email,
    paymentMethod: payload.paymentMethod || "cash"
  });

  if (opsPg.isOpsPgEnabled()) {
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
}

function updateAppointmentStatus(id, status) {
  const allowed = new Set(["pending", "confirmed", "completed", "cancelled", "no_show"]);
  if (!allowed.has(String(status || ""))) fail("حالة الموعد غير صالحة");
  const appointment = store.appointments.find((item) => item.id === id);
  if (!appointment) fail("الموعد غير موجود", 404);
  appointment.status = status;
  appointment.updatedAt = new Date().toISOString();
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
  const start = toMinutes(time);
  const end = start + blockMinutes;
  const collision = store.appointments.find((item) => {
    if (item.date !== date || item.staffId !== staffId || item.status === "cancelled") return false;
    const otherStart = toMinutes(item.time);
    const otherEnd = otherStart + appointmentBlockMinutes(item);
    return rangesOverlap(start, end, otherStart, otherEnd);
  });
  if (collision) fail("هذا الموظف محجوز في نفس الوقت", 409);

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
    createdAt: new Date().toISOString()
  };
  store.appointments.push(appointment);
  persist();
  return appointment;
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
  seedWorkspaceStore,
  getCurrentWorkspaceId,
  listActivityTemplates,
  getActivityProfile,
  updateActivityProfile,
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
  setAppointmentPricing,
  getStatsSummary,
  resetOpsData
};
