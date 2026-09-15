const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const storePath = path.join(__dirname, "data", "maw3ed-ops.json");

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
      breakEnabled: true,
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
    medicalDepartments: MEDICAL_DEPARTMENTS.map((department) => ({ ...department, enabled: true })),
    planKey: "free"
  };
}

function loadStore() {
  try {
    if (!fs.existsSync(storePath)) {
      const seed = defaultStore();
      fs.mkdirSync(path.dirname(storePath), { recursive: true });
      fs.writeFileSync(storePath, JSON.stringify(seed, null, 2));
      return seed;
    }
    return { ...defaultStore(), ...JSON.parse(fs.readFileSync(storePath, "utf8")) };
  } catch {
    return defaultStore();
  }
}

function saveStore(data) {
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify(data, null, 2));
}

let store = loadStore();

function persist() {
  saveStore(store);
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
  const q = search.trim().toLowerCase();
  return store.staff
    .filter((person) => !q || `${person.name} ${person.title}`.toLowerCase().includes(q))
    .map((person) => ({
      ...person,
      servicesCount: store.services.filter((service) => (service.providerIds || []).includes(person.id)).length
    }));
}


function getPlanLimits() {
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
  return { ...usage, warnings };
}

function assertPlanCapacity(kind) {
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

function getActivityProfile() {
  return {
    mode: store.activityMode || "medical",
    medicalDepartments: store.medicalDepartments || MEDICAL_DEPARTMENTS.map((department) => ({ ...department, enabled: true })),
    flexibleHint: "في الوضع المرن يمكن تخصيص الحقول والخدمات لأي نشاط: تدريب، صالونات، استشارات، أو مؤسسات خدمية."
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
  const mode = payload.mode === "flexible" ? "flexible" : payload.mode === "medical" ? "medical" : store.activityMode;
  store.activityMode = mode;
  if (Array.isArray(payload.medicalDepartments)) {
    store.medicalDepartments = payload.medicalDepartments.map((department) => ({
      id: String(department.id || createId("dept")),
      name: String(department.name || "").trim() || "قسم",
      enabled: department.enabled !== false
    }));
  }
  if (mode === "medical") applyMedicalCategories();
  persist();
  return getActivityProfile();
}

function createStaff(payload) {
  assertPlanCapacity("staff");
  const name = String(payload.name || "").trim();
  if (!name) fail("اسم الموظف مطلوب");
  const person = {
    id: createId("staff"),
    name,
    title: String(payload.title || "").trim() || "موظف",
    active: true
  };
  store.staff.unshift(person);
  persist();
  return person;
}

function updateStaff(id, payload) {
  const person = store.staff.find((item) => item.id === id);
  if (!person) fail("الموظف غير موجود", 404);
  if (payload.name != null) person.name = String(payload.name).trim();
  if (payload.title != null) person.title = String(payload.title).trim();
  if (payload.active != null) person.active = Boolean(payload.active);
  persist();
  return person;
}

function deleteStaff(id) {
  const index = store.staff.findIndex((item) => item.id === id);
  if (index < 0) fail("الموظف غير موجود", 404);
  store.staff.splice(index, 1);
  store.services.forEach((service) => {
    service.providerIds = (service.providerIds || []).filter((providerId) => providerId !== id);
  });
  persist();
}

function listServiceCategories() {
  return [...store.serviceCategories].sort((a, b) => a.sort - b.sort);
}

function createServiceCategory(payload) {
  const name = String(payload.name || "").trim();
  if (!name) fail("اسم الفئة مطلوب");
  const category = { id: createId("svc-cat"), name, sort: store.serviceCategories.length };
  store.serviceCategories.push(category);
  persist();
  return category;
}

function listServices(categoryId) {
  return store.services.filter((service) => !categoryId || service.categoryId === categoryId);
}

function createService(payload) {
  assertPlanCapacity("services");
  const name = String(payload.name || "").trim();
  const categoryId = payload.categoryId;
  if (!name || !categoryId) fail("اسم الخدمة والفئة مطلوبان");
  const service = {
    id: createId("svc"),
    categoryId,
    name,
    durationMinutes: Number(payload.durationMinutes) || 30,
    bufferMinutes: Number(payload.bufferMinutes) || 0,
    pricingType: payload.pricingType || "fixed",
    price: Number(payload.price) || 0,
    color: payload.color || "#1967e8",
    providerIds: Array.isArray(payload.providerIds)
      ? payload.providerIds
      : payload.providerId
        ? [payload.providerId]
        : [],
    publicBooking: payload.publicBooking !== false,
    autoAccept: Boolean(payload.autoAccept),
    autoComplete: Boolean(payload.autoComplete),
    description: String(payload.description || "")
  };
  store.services.unshift(service);
  persist();
  return service;
}

function deleteService(id) {
  const index = store.services.findIndex((item) => item.id === id);
  if (index < 0) fail("الخدمة غير موجودة", 404);
  store.services.splice(index, 1);
  persist();
}

function getWorkingSchedule() {
  return {
    general: store.workingHours,
    closedDays: store.closedDays,
    specificDays: store.specificDays
  };
}

function saveWorkingHours(days) {
  if (!Array.isArray(days) || days.length !== 7) fail("جدول الأيام السبعة مطلوب");
  store.workingHours = days.map((day, weekday) => ({
    weekday,
    isOpen: day.isOpen !== false,
    opensAt: day.opensAt || "09:00",
    closesAt: day.closesAt || "21:00",
    breakEnabled: Boolean(day.breakEnabled),
    breakStartsAt: day.breakStartsAt || "13:00",
    breakEndsAt: day.breakEndsAt || "14:00"
  }));
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
  const nextSlug = String(payload.slug || store.bookingPage.slug)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-");
  store.bookingPage = {
    ...store.bookingPage,
    ...payload,
    slug: nextSlug,
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
    services: store.services.filter((service) => service.publicBooking),
    categories: listServiceCategories(),
    staff: store.staff.filter((person) => person.active),
    workingHours: store.workingHours
  };
}


const slotHolds = new Map();

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
  for (const [key, expiresAt] of slotHolds.entries()) {
    if (expiresAt <= now) slotHolds.delete(key);
  }
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

function listStaffSlotsForDay({ staffId, date, blockMinutes, ignoreHolds = false }) {
  purgeExpiredHolds();
  const day = new Date(`${date}T12:00:00`);
  if (Number.isNaN(day.getTime())) fail("تاريخ غير صالح");
  if ((store.closedDays || []).some((item) => item.date === date)) return [];
  const weekday = day.getDay();
  const hours = store.workingHours.find((item) => item.weekday === weekday);
  if (!hours || hours.isOpen === false) return [];

  const open = toMinutes(hours.opensAt);
  const close = toMinutes(hours.closesAt);
  const blocked = [];
  if (hours.breakEnabled && hours.breakStartsAt && hours.breakEndsAt) {
    blocked.push([toMinutes(hours.breakStartsAt), toMinutes(hours.breakEndsAt)]);
  }
  store.appointments
    .filter((item) => item.date === date && item.staffId === staffId && item.status !== "cancelled")
    .forEach((item) => {
      const start = toMinutes(item.time);
      blocked.push([start, start + appointmentBlockMinutes(item)]);
    });
  if (!ignoreHolds) {
    for (const [key, expiresAt] of slotHolds.entries()) {
      if (expiresAt <= Date.now()) continue;
      const [holdStaff, holdDate, holdTime] = key.split("|");
      if (holdStaff === staffId && holdDate === date) {
        const start = toMinutes(holdTime);
        blocked.push([start, start + blockMinutes]);
      }
    }
  }

  const slots = [];
  for (let cursor = open; cursor + blockMinutes <= close; cursor += blockMinutes) {
    const end = cursor + blockMinutes;
    const hitsBlock = blocked.some(([start, stop]) => rangesOverlap(cursor, end, start, stop));
    if (!hitsBlock) slots.push(fromMinutes(cursor));
  }
  return slots;
}

function listPublicSlots(slug, { date, serviceId, staffId = "any", ignoreHolds = false } = {}) {
  if (store.bookingPage.slug !== slug || !store.bookingPage.onlineBookingEnabled) {
    fail("صفحة الحجز غير متاحة", 404);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) fail("التاريخ مطلوب");
  const service = store.services.find((item) => item.id === serviceId);
  if (!service || !service.publicBooking) fail("الخدمة غير متاحة للحجز العام", 400);
  const blockMinutes = Number(service.durationMinutes || 30) + Number(service.bufferMinutes || 0);
  const providers = (service.providerIds || [])
    .map((id) => store.staff.find((person) => person.id === id && person.active))
    .filter(Boolean);
  const pool = providers.length ? providers : store.staff.filter((person) => person.active);
  if (!pool.length) return { date, serviceId, blockMinutes, staffId, slots: [] };

  if (staffId && staffId !== "any") {
    const person = pool.find((item) => item.id === staffId);
    if (!person) fail("هذا الموظف غير مرتبط بالخدمة", 400);
    return {
      date,
      serviceId,
      staffId: person.id,
      blockMinutes,
      slots: listStaffSlotsForDay({ staffId: person.id, date, blockMinutes, ignoreHolds }).map((time) => ({
        time,
        staffId: person.id,
        staffName: person.name
      }))
    };
  }

  const merged = new Map();
  pool.forEach((person) => {
    listStaffSlotsForDay({ staffId: person.id, date, blockMinutes, ignoreHolds }).forEach((time) => {
      if (!merged.has(time)) merged.set(time, { time, staffId: person.id, staffName: person.name });
    });
  });
  return {
    date,
    serviceId,
    staffId: "any",
    blockMinutes,
    slots: [...merged.values()].sort((a, b) => a.time.localeCompare(b.time))
  };
}

function holdPublicSlot(slug, payload = {}) {
  const listed = listPublicSlots(slug, payload);
  const time = String(payload.time || "");
  const match = listed.slots.find((slot) => slot.time === time);
  if (!match) fail("هذا الوقت لم يعد متاحاً", 409);
  slotHolds.set(holdKey(match.staffId, listed.date, time), Date.now() + 3 * 60 * 1000);
  return { ok: true, holdSeconds: 180, staffId: match.staffId, date: listed.date, time };
}

function createPublicAppointment(slug, payload = {}) {
  if (store.bookingPage.slug !== slug || !store.bookingPage.onlineBookingEnabled) {
    fail("صفحة الحجز غير متاحة", 404);
  }
  const serviceId = String(payload.serviceId || "");
  const service = store.services.find((item) => item.id === serviceId);
  if (!service || !service.publicBooking) fail("الخدمة غير متاحة للحجز العام", 400);
  const date = String(payload.date || "");
  const time = String(payload.time || "");
  let staffId = String(payload.staffId || "");
  // Drop the booker's soft hold before availability re-check so they are not blocked by themselves.
  if (staffId && staffId !== "any") {
    slotHolds.delete(holdKey(staffId, date, time));
  } else {
    purgeExpiredHolds();
    for (const key of [...slotHolds.keys()]) {
      const [, holdDate, holdTime] = key.split("|");
      if (holdDate === date && holdTime === time) slotHolds.delete(key);
    }
  }
  if (!staffId || staffId === "any") {
    const available = listPublicSlots(slug, { date, serviceId, staffId: "any", ignoreHolds: true });
    const match = available.slots.find((slot) => slot.time === time);
    if (!match) fail("لا يوجد موظف متاح في هذا الوقت", 409);
    staffId = match.staffId;
  } else {
    const available = listPublicSlots(slug, { date, serviceId, staffId, ignoreHolds: true });
    if (!available.slots.some((slot) => slot.time === time)) fail("هذا الوقت لم يعد متاحاً", 409);
  }
  return createAppointment({
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
  const phone = String(payload.phone || "").trim();
  const email = String(payload.email || "").trim();
  const blockMinutes = Number(service?.durationMinutes || 30) + Number(service?.bufferMinutes || 0);
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
    paymentStatus: "unpaid",
    amount: Number(service?.price || payload.amount || 0),
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

module.exports = {
  createId,
  getActivityProfile,
  updateActivityProfile,
  getPlanUsage,
  listCustomers,
  createCustomer,
  listCustomerCategories,
  createCustomerCategory,
  listStaff,
  createStaff,
  updateStaff,
  deleteStaff,
  listServiceCategories,
  createServiceCategory,
  listServices,
  createService,
  deleteService,
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
  getStatsSummary
};
