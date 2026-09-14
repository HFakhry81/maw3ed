const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const storePath = path.join(__dirname, "data", "maw3ed-ops.json");

function createId(prefix) {
  return `${prefix}-${crypto.randomBytes(4).toString("hex")}`;
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
      { id: "staff-rec", name: "أحمد استقبال", title: "Reception", active: true },
      { id: "staff-lab", name: "منى معمل", title: "أخصائي معمل", active: true }
    ],
    serviceCategories: [
      { id: "svc-cat-er", name: "قسم الطوارئ", sort: 0 },
      { id: "svc-cat-lab", name: "المعمل والتحاليل الطبية", sort: 1 },
      { id: "svc-cat-ped", name: "عيادة الأطفال", sort: 2 }
    ],
    services: [
      {
        id: "svc-1",
        categoryId: "svc-cat-er",
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
        categoryId: "svc-cat-er",
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

function createStaff(payload) {
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
  const collision = store.appointments.find(
    (item) => item.date === date && item.time === time && item.staffId === staffId && item.status !== "cancelled"
  );
  if (collision) fail("هذا الموظف محجوز في نفس الوقت", 409);

  let customer = store.customers.find(
    (item) => `${item.firstName} ${item.lastName}`.trim().toLowerCase() === customerName.toLowerCase()
  );
  if (!customer) {
    const [firstName, ...rest] = customerName.split(/\s+/);
    customer = createCustomer({ firstName, lastName: rest.join(" "), categoryId: "cat-new" });
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
  const completed = appointments.filter((item) => item.status === "completed" || item.status === "confirmed");
  const cancelled = appointments.filter((item) => item.status === "cancelled" || item.status === "canceled");
  return {
    appointments: {
      completedCount: completed.length,
      cancelledCount: cancelled.length,
      totalCount: appointments.length
    },
    expensesTotal: store.expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    servicesCount: store.services.length,
    staffCount: store.staff.length,
    customersCount: store.customers.length
  };
}

module.exports = {
  createId,
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
