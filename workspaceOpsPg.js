const { pool } = require("./db");

const tables = [
  "workspace_ops_appointment_visit_meta",
  "workspace_ops_appointment_visits",
  "workspace_ops_appointment_line_items",
  "workspace_ops_appointments",
  "workspace_ops_expenses",
  "workspace_ops_specific_days",
  "workspace_ops_closed_days",
  "workspace_ops_working_hours",
  "workspace_ops_service_providers",
  "workspace_ops_services",
  "workspace_ops_staff_specific_days",
  "workspace_ops_staff_closed_days",
  "workspace_ops_staff_working_hours",
  "workspace_ops_staff",
  "workspace_ops_service_categories",
  "workspace_ops_customers",
  "workspace_ops_customer_categories",
  "workspace_ops_medical_departments",
  "workspace_ops_activity_labels",
  "workspace_ops_social_links"
];

function list(result) {
  return result.rows;
}

function dateOnly(value) {
  if (!value) return "";
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function isoOrNull(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function numberOr(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function boolOr(value, fallback = false) {
  return value === null || value === undefined ? fallback : Boolean(value);
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function decodeMeta(row) {
  if (row.value_type === "null") return null;
  if (row.value_type === "boolean") return row.value_text === "true";
  if (row.value_type === "number") return Number(row.value_text);
  if (row.value_type === "json") return JSON.parse(row.value_text);
  return row.value_text;
}

function encodeMeta(value) {
  if (value === null || value === undefined) return { type: "null", value: null };
  if (typeof value === "boolean") return { type: "boolean", value: String(value) };
  if (typeof value === "number" && Number.isFinite(value)) {
    return { type: "number", value: String(value) };
  }
  if (typeof value === "string") return { type: "string", value };
  if (typeof value === "object") return { type: "json", value: JSON.stringify(value) };
  throw new Error("PostgreSQL appointment visit metadata contains an unsupported value");
}

async function hasProfile(client, workspaceId) {
  const result = await client.query(
    "SELECT 1 FROM workspace_ops_profiles WHERE workspace_id = $1",
    [workspaceId]
  );
  return result.rowCount > 0;
}

async function insertRows(client, table, columns, rows) {
  if (!rows.length) return;
  const batchSize = Math.max(1, Math.floor(60000 / columns.length));
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const params = [];
    const values = batch.map((row) => {
      const placeholders = columns.map((_, index) => {
        params.push(row[index]);
        return `$${params.length}`;
      });
      return `(${placeholders.join(", ")})`;
    });
    await client.query(
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${values.join(", ")}`,
      params
    );
  }
}

function mapHours(rows) {
  return rows.map((row) => ({
    weekday: Number(row.weekday),
    isOpen: row.is_open,
    opensAt: row.opens_at,
    closesAt: row.closes_at,
    overnight: row.overnight,
    breakEnabled: row.break_enabled,
    breakStartsAt: row.break_starts_at,
    breakEndsAt: row.break_ends_at
  }));
}

function mapClosedDays(rows) {
  return rows.map((row) => ({
    id: row.id,
    startDate: dateOnly(row.start_date),
    endDate: dateOnly(row.end_date),
    description: row.description
  }));
}

function mapSpecificDays(rows) {
  return rows.map((row) => ({
    id: row.id,
    startDate: dateOnly(row.start_date),
    endDate: dateOnly(row.end_date),
    title: row.title,
    opensAt: row.opens_at,
    closesAt: row.closes_at,
    breakStartsAt: row.break_starts_at,
    breakEndsAt: row.break_ends_at
  }));
}

async function loadStore(client, workspaceId, defaultStoreFactory) {
  const profileResult = await client.query(
    "SELECT * FROM workspace_ops_profiles WHERE workspace_id = $1",
    [workspaceId]
  );
  const profile = profileResult.rows[0];
  if (!profile) return null;

  const results = {};
  for (const table of tables) {
    results[table] = await client.query(
      `SELECT * FROM ${table} WHERE workspace_id = $1`,
      [workspaceId]
    );
  }
  const data = defaultStoreFactory();
  const bookingPage = {
    ...data.bookingPage,
    slug: profile.slug,
    businessName: profile.business_name,
    industry: profile.industry || "",
    email: profile.email || "",
    phone: profile.phone || "",
    description: profile.description || "",
    country: profile.country || "",
    state: profile.state || "",
    city: profile.city || "",
    street: profile.street || "",
    timezone: profile.timezone,
    onlineBookingEnabled: profile.online_booking_enabled,
    logoUrl: profile.logo_url || "",
    showPlatformBranding: profile.show_platform_branding,
    socialLinks: {}
  };
  for (const row of list(results.workspace_ops_social_links)) {
    bookingPage.socialLinks[row.platform] = row.url;
  }
  data.bookingPage = bookingPage;
  data.calendarPreferences = {
    showBusinessHoursOnly: profile.calendar_show_business_hours_only,
    slotOrder: profile.calendar_slot_order,
    appointmentColorMode: profile.calendar_appointment_color_mode,
    multiServiceEnabled: profile.calendar_multi_service_enabled
  };
  data.notifications = {
    email: {
      confirmation: profile.notification_email_confirmation,
      reminder: profile.notification_email_reminder,
      followUp: profile.notification_email_follow_up,
      cancellation: profile.notification_email_cancellation,
      reschedule: profile.notification_email_reschedule
    },
    messagingChannel: profile.notification_messaging_channel,
    messaging: {
      confirmation: profile.notification_messaging_confirmation,
      reminder: profile.notification_messaging_reminder,
      cancellation: profile.notification_messaging_cancellation,
      reschedule: profile.notification_messaging_reschedule
    },
    pushDailyReminder: profile.notification_push_daily_reminder
  };
  data.activityMode = profile.activity_mode;
  data.activityModeLocked = profile.activity_mode_locked;
  data.activityTemplateId = profile.activity_template_id;
  data.planKey = profile.plan_key;

  data.customerCategories = list(results.workspace_ops_customer_categories).map((row) => ({
    id: row.id,
    name: row.name,
    color: row.color
  }));
  data.customers = list(results.workspace_ops_customers).map((row) => ({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    email: row.email,
    address: row.address,
    categoryId: row.category_id,
    avatarUrl: row.avatar_url
  }));
  data.serviceCategories = list(results.workspace_ops_service_categories).map((row) => ({
    id: row.id,
    name: row.name,
    sort: Number(row.sort_order),
    enabled: row.enabled,
    active: row.active
  }));

  const staffHours = new Map();
  for (const row of list(results.workspace_ops_staff_working_hours)) {
    const rows = staffHours.get(row.staff_id) || [];
    rows.push(row);
    staffHours.set(row.staff_id, rows);
  }
  const staffClosedDays = new Map();
  for (const row of list(results.workspace_ops_staff_closed_days)) {
    const rows = staffClosedDays.get(row.staff_id) || [];
    rows.push(row);
    staffClosedDays.set(row.staff_id, rows);
  }
  const staffSpecificDays = new Map();
  for (const row of list(results.workspace_ops_staff_specific_days)) {
    const rows = staffSpecificDays.get(row.staff_id) || [];
    rows.push(row);
    staffSpecificDays.set(row.staff_id, rows);
  }
  data.staff = list(results.workspace_ops_staff).map((row) => ({
    id: row.id,
    name: row.name,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    title: row.title,
    avatarUrl: row.avatar_url,
    servicePlace: row.service_place,
    serviceCategoryId: row.service_category_id,
    serviceIds: [],
    active: row.active,
    useBusinessHours: row.use_business_hours,
    workingHours: row.use_business_hours ? null : mapHours(staffHours.get(row.id) || []),
    closedDays: mapClosedDays(staffClosedDays.get(row.id) || []),
    specificDays: mapSpecificDays(staffSpecificDays.get(row.id) || [])
  }));

  const providers = new Map();
  for (const row of list(results.workspace_ops_service_providers)) {
    const ids = providers.get(row.service_id) || [];
    ids.push(row.staff_id);
    providers.set(row.service_id, ids);
  }
  data.services = list(results.workspace_ops_services).map((row) => ({
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    durationMinutes: Number(row.duration_minutes),
    bufferMinutes: Number(row.buffer_minutes),
    pricingType: row.pricing_type,
    price: numberOr(row.price),
    priceMin: numberOr(row.price_min),
    priceMax: numberOr(row.price_max),
    color: row.color,
    providerIds: providers.get(row.id) || [],
    publicBooking: row.public_booking,
    autoAccept: row.auto_accept,
    autoComplete: row.auto_complete,
    active: row.active,
    description: row.description
  }));
  const staffById = new Map(data.staff.map((person) => [person.id, person]));
  for (const [serviceId, staffIds] of providers.entries()) {
    const staffSet = new Set(staffIds);
    for (const person of staffById.values()) {
      if (staffSet.has(person.id)) person.serviceIds.push(serviceId);
    }
  }

  data.workingHours = mapHours(list(results.workspace_ops_working_hours));
  data.closedDays = mapClosedDays(list(results.workspace_ops_closed_days));
  data.specificDays = mapSpecificDays(list(results.workspace_ops_specific_days));
  data.expenses = list(results.workspace_ops_expenses).map((row) => ({
    id: row.id,
    name: row.name,
    amount: numberOr(row.amount),
    category: row.category,
    date: dateOnly(row.expense_date),
    description: row.description,
    recurrence: row.recurrence
  }));

  const lineItems = new Map();
  for (const row of list(results.workspace_ops_appointment_line_items)) {
    const rows = lineItems.get(row.appointment_id) || [];
    rows.push({
      id: row.id,
      kind: row.kind,
      serviceId: row.service_id,
      name: row.name,
      amount: numberOr(row.amount),
      pricingType: row.pricing_type,
      priceMin: numberOr(row.price_min),
      priceMax: numberOr(row.price_max),
      pricingStatus: row.pricing_status,
      durationMinutes: Number(row.duration_minutes),
      addedAt: isoOrNull(row.added_at),
      addedByStaffId: row.added_by_staff_id
    });
    lineItems.set(row.appointment_id, rows);
  }
  const visits = new Map();
  for (const row of list(results.workspace_ops_appointment_visits)) {
    const rows = visits.get(row.appointment_id) || [];
    rows.push({
      id: row.id,
      at: isoOrNull(row.occurred_at),
      type: row.event_type,
      byStaffId: row.staff_id,
      byStaffName: row.staff_name
    });
    visits.set(row.appointment_id, rows);
  }
  for (const row of list(results.workspace_ops_appointment_visit_meta)) {
    const appointmentVisits = visits.get(row.appointment_id) || [];
    const visit = appointmentVisits.find((item) => item.id === row.visit_id);
    if (visit) visit[row.meta_key] = decodeMeta(row);
    visits.set(row.appointment_id, appointmentVisits);
  }
  data.appointments = list(results.workspace_ops_appointments).map((row) => {
    const appointment = {
      id: row.id,
      date: dateOnly(row.appointment_date),
      time: row.appointment_time,
      customerId: row.customer_id,
      customerName: row.customer_name,
      staffId: row.staff_id,
      staffName: row.staff_name,
      serviceId: row.service_id,
      serviceName: row.service_name,
      categoryId: row.category_id,
      durationMinutes: Number(row.duration_minutes),
      paymentMethod: row.payment_method,
      paymentStatus: row.payment_status,
      pricingType: row.pricing_type,
      priceMin: numberOr(row.price_min),
      priceMax: numberOr(row.price_max),
      depositAmount: numberOr(row.deposit_amount),
      amount: numberOr(row.amount),
      pricingStatus: row.pricing_status,
      notes: row.notes,
      status: row.status,
      checkInToken: row.check_in_token,
      checkedInAt: isoOrNull(row.checked_in_at),
      checkedInByStaffId: row.checked_in_by_staff_id,
      completedAt: isoOrNull(row.completed_at),
      lineItems: lineItems.get(row.id) || [],
      visitLog: visits.get(row.id) || [],
      createdAt: isoOrNull(row.created_at),
      updatedAt: isoOrNull(row.updated_at)
    };
    if (row.idempotency_key) appointment.idempotencyKey = row.idempotency_key;
    return appointment;
  });

  data.medicalDepartments = list(results.workspace_ops_medical_departments).map((row) => ({
    id: row.id,
    name: row.name,
    enabled: row.enabled
  }));
  const labels = list(results.workspace_ops_activity_labels);
  data.activityLabels = {};
  data.activityLabelsI18n = null;
  for (const row of labels) {
    if (row.scope === "default") {
      data.activityLabels[row.label_key] = row.label_value;
    } else {
      data.activityLabelsI18n ||= {};
      data.activityLabelsI18n[row.locale] ||= {};
      data.activityLabelsI18n[row.locale][row.label_key] = row.label_value;
    }
  }
  return data;
}

function hoursRows(workspaceId, rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => [
    workspaceId,
    Number(row.weekday),
    boolOr(row.isOpen, true),
    row.opensAt || "09:00",
    row.closesAt || "17:00",
    boolOr(row.overnight),
    boolOr(row.breakEnabled),
    row.breakStartsAt || "",
    row.breakEndsAt || ""
  ]);
}

function closedDayRows(workspaceId, rows, staffId = null) {
  return (Array.isArray(rows) ? rows : []).map((row) => staffId
    ? [workspaceId, staffId, String(row.id), dateOnly(row.startDate), dateOnly(row.endDate), row.description || ""]
    : [workspaceId, String(row.id), dateOnly(row.startDate), dateOnly(row.endDate), row.description || ""]);
}

function specificDayRows(workspaceId, rows, staffId = null) {
  return (Array.isArray(rows) ? rows : []).map((row) => staffId
    ? [workspaceId, staffId, String(row.id), dateOnly(row.startDate), dateOnly(row.endDate), row.title || "", row.opensAt || "08:00", row.closesAt || "16:00", row.breakStartsAt || "", row.breakEndsAt || ""]
    : [workspaceId, String(row.id), dateOnly(row.startDate), dateOnly(row.endDate), row.title || "", row.opensAt || "08:00", row.closesAt || "16:00", row.breakStartsAt || "", row.breakEndsAt || ""]);
}

async function saveStore(client, workspaceId, input) {
  const data = asObject(input);
  const page = asObject(data.bookingPage);
  const calendar = asObject(data.calendarPreferences);
  const notifications = asObject(data.notifications);
  const emailNotifications = asObject(notifications.email);
  const messageNotifications = asObject(notifications.messaging);
  const socialLinks = asObject(page.socialLinks);
  const slug = String(page.slug || "").trim();
  if (!slug) throw new Error(`Workspace ${workspaceId} has no booking slug`);

  await client.query("DELETE FROM workspace_ops_profiles WHERE workspace_id = $1", [workspaceId]);
  await client.query(
    `INSERT INTO workspace_ops_profiles (
      workspace_id, slug, business_name, industry, email, phone, description,
      country, state, city, street, timezone, online_booking_enabled, logo_url,
      show_platform_branding, locale, calendar_show_business_hours_only,
      calendar_slot_order, calendar_appointment_color_mode, calendar_multi_service_enabled,
      notification_email_confirmation, notification_email_reminder, notification_email_follow_up,
      notification_email_cancellation, notification_email_reschedule, notification_messaging_channel,
      notification_messaging_confirmation, notification_messaging_reminder,
      notification_messaging_cancellation, notification_messaging_reschedule,
      notification_push_daily_reminder, activity_mode, activity_mode_locked,
      activity_template_id, plan_key
    ) VALUES (
      ${Array.from({ length: 35 }, (_, index) => `$${index + 1}`).join(", ")}
    )`,
    [
      workspaceId, slug, String(page.businessName || ""), page.industry || null,
      page.email || null, page.phone || null, page.description || null,
      page.country || null, page.state || null, page.city || null, page.street || null,
      page.timezone || "Africa/Cairo", boolOr(page.onlineBookingEnabled, true),
      page.logoUrl || "", boolOr(page.showPlatformBranding, true), page.locale || "ar",
      boolOr(calendar.showBusinessHoursOnly, true), calendar.slotOrder || "start-to-end",
      calendar.appointmentColorMode || "service", boolOr(calendar.multiServiceEnabled, true),
      boolOr(emailNotifications.confirmation, true), boolOr(emailNotifications.reminder, true),
      boolOr(emailNotifications.followUp), boolOr(emailNotifications.cancellation, true),
      boolOr(emailNotifications.reschedule, true), notifications.messagingChannel || "whatsapp",
      boolOr(messageNotifications.confirmation), boolOr(messageNotifications.reminder),
      boolOr(messageNotifications.cancellation), boolOr(messageNotifications.reschedule),
      boolOr(notifications.pushDailyReminder, true), data.activityMode || "medical",
      boolOr(data.activityModeLocked), data.activityTemplateId || "medical",
      data.planKey || "free"
    ]
  );

  const organization = await client.query(
    "SELECT id FROM organizations WHERE workspace_id = $1 LIMIT 1",
    [workspaceId]
  );
  if (organization.rows[0]) {
    await client.query(
      `UPDATE organizations SET name = $2, slug = $3, activity_type = $4, locale = $5
       WHERE id = $1`,
      [
        organization.rows[0].id,
        String(page.businessName || ""),
        slug,
        data.activityMode || "medical",
        page.locale || "ar"
      ]
    );
    await client.query(
      `INSERT INTO booking_pages
        (organization_id, slug, logo_url, description, phone, email, address, show_platform_branding)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (organization_id) DO UPDATE SET
         slug = EXCLUDED.slug, logo_url = EXCLUDED.logo_url,
         description = EXCLUDED.description, phone = EXCLUDED.phone,
         email = EXCLUDED.email, address = EXCLUDED.address,
         show_platform_branding = EXCLUDED.show_platform_branding, updated_at = NOW()`,
      [
        organization.rows[0].id,
        slug,
        page.logoUrl || null,
        page.description || null,
        page.phone || null,
        page.email || null,
        [page.street, page.city, page.state, page.country].filter(Boolean).join(", "),
        boolOr(page.showPlatformBranding, true)
      ]
    );
  }

  const staffIds = new Set((Array.isArray(data.staff) ? data.staff : []).map((row) => String(row.id)));
  const clean = (value) => Array.isArray(value) ? value : [];

  await insertRows(client, "workspace_ops_social_links", ["workspace_id", "platform", "url"],
    Object.entries(socialLinks).map(([platform, url]) => [workspaceId, platform, String(url || "")]));

  const labelRows = [];
  for (const [key, value] of Object.entries(asObject(data.activityLabels))) {
    if (typeof value === "string") labelRows.push([workspaceId, "default", "", key, value]);
  }
  for (const [locale, labels] of Object.entries(asObject(data.activityLabelsI18n))) {
    for (const [key, value] of Object.entries(asObject(labels))) {
      if (typeof value === "string") labelRows.push([workspaceId, "localized", locale, key, value]);
    }
  }
  await insertRows(client, "workspace_ops_activity_labels",
    ["workspace_id", "scope", "locale", "label_key", "label_value"], labelRows);
  await insertRows(client, "workspace_ops_medical_departments",
    ["workspace_id", "id", "name", "enabled"],
    clean(data.medicalDepartments).map((row) => [workspaceId, String(row.id), String(row.name || ""), boolOr(row.enabled, true)]));
  await insertRows(client, "workspace_ops_customer_categories",
    ["workspace_id", "id", "name", "color"],
    clean(data.customerCategories).map((row) => [workspaceId, String(row.id), String(row.name || ""), row.color || "#2474df"]));
  await insertRows(client, "workspace_ops_customers",
    ["workspace_id", "id", "first_name", "last_name", "phone", "email", "address", "category_id", "avatar_url"],
    clean(data.customers).map((row) => [
      workspaceId, String(row.id), String(row.firstName || ""), String(row.lastName || ""),
      String(row.phone || ""), String(row.email || ""), String(row.address || ""),
      String(row.categoryId || ""), String(row.avatarUrl || "")
    ]));
  await insertRows(client, "workspace_ops_service_categories",
    ["workspace_id", "id", "name", "sort_order", "enabled", "active"],
    clean(data.serviceCategories).map((row, index) => [
      workspaceId, String(row.id), String(row.name || ""), numberOr(row.sort, index),
      boolOr(row.enabled, true), boolOr(row.active, true)
    ]));

  const staff = clean(data.staff);
  await insertRows(client, "workspace_ops_staff",
    ["workspace_id", "id", "name", "first_name", "last_name", "phone", "title", "avatar_url",
      "service_place", "service_category_id", "active", "use_business_hours"],
    staff.map((row) => [
      workspaceId, String(row.id), String(row.name || ""),
      String(row.firstName || ""), String(row.lastName || ""), String(row.phone || ""),
      String(row.title || ""), String(row.avatarUrl || ""), String(row.servicePlace || ""),
      String(row.serviceCategoryId || ""), boolOr(row.active, true), boolOr(row.useBusinessHours, true)
    ]));
  for (const person of staff) {
    if (person.useBusinessHours === false) {
      await insertRows(client, "workspace_ops_staff_working_hours",
        ["workspace_id", "staff_id", "weekday", "is_open", "opens_at", "closes_at", "overnight",
          "break_enabled", "break_starts_at", "break_ends_at"],
        hoursRows(workspaceId, person.workingHours).map((row) => [workspaceId, String(person.id), ...row.slice(1)]));
    }
    await insertRows(client, "workspace_ops_staff_closed_days",
      ["workspace_id", "staff_id", "id", "start_date", "end_date", "description"],
      closedDayRows(workspaceId, person.closedDays, String(person.id)));
    await insertRows(client, "workspace_ops_staff_specific_days",
      ["workspace_id", "staff_id", "id", "start_date", "end_date", "title", "opens_at", "closes_at", "break_starts_at", "break_ends_at"],
      specificDayRows(workspaceId, person.specificDays, String(person.id)));
  }

  const services = clean(data.services);
  await insertRows(client, "workspace_ops_services",
    ["workspace_id", "id", "category_id", "name", "duration_minutes", "buffer_minutes", "pricing_type",
      "price", "price_min", "price_max", "color", "public_booking", "auto_accept", "auto_complete", "active", "description"],
    services.map((row) => [
      workspaceId, String(row.id), String(row.categoryId || ""), String(row.name || ""),
      numberOr(row.durationMinutes, 30), numberOr(row.bufferMinutes), row.pricingType || "fixed",
      numberOr(row.price), numberOr(row.priceMin), numberOr(row.priceMax), row.color || "#2474df",
      boolOr(row.publicBooking, true), boolOr(row.autoAccept), boolOr(row.autoComplete),
      boolOr(row.active, true), String(row.description || "")
    ]));
  const providerRows = [];
  for (const service of services) {
    for (const staffId of clean(service.providerIds)) {
      if (staffIds.has(String(staffId))) providerRows.push([workspaceId, String(service.id), String(staffId)]);
    }
  }
  await insertRows(client, "workspace_ops_service_providers",
    ["workspace_id", "service_id", "staff_id"], providerRows);

  await insertRows(client, "workspace_ops_working_hours",
    ["workspace_id", "weekday", "is_open", "opens_at", "closes_at", "overnight", "break_enabled", "break_starts_at", "break_ends_at"],
    hoursRows(workspaceId, data.workingHours));
  await insertRows(client, "workspace_ops_closed_days",
    ["workspace_id", "id", "start_date", "end_date", "description"],
    closedDayRows(workspaceId, data.closedDays));
  await insertRows(client, "workspace_ops_specific_days",
    ["workspace_id", "id", "start_date", "end_date", "title", "opens_at", "closes_at", "break_starts_at", "break_ends_at"],
    specificDayRows(workspaceId, data.specificDays));
  await insertRows(client, "workspace_ops_expenses",
    ["workspace_id", "id", "name", "amount", "category", "expense_date", "description", "recurrence"],
    clean(data.expenses).map((row) => [
      workspaceId, String(row.id), String(row.name || ""), numberOr(row.amount),
      row.category || "general", dateOnly(row.date) || new Date().toISOString().slice(0, 10),
      String(row.description || ""), row.recurrence || "none"
    ]));

  const appointments = clean(data.appointments);
  // idempotency_key column arrives in migration 013; older DBs without it still save.
  const idempotencyCol = await client.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'workspace_ops_appointments'
       AND column_name = 'idempotency_key'
     LIMIT 1`
  );
  const supportsIdempotencyKey = idempotencyCol.rows.length > 0;

  const appointmentColumns = [
    "workspace_id", "id", "appointment_date", "appointment_time", "customer_id", "customer_name",
    "staff_id", "staff_name", "service_id", "service_name", "category_id", "duration_minutes",
    "payment_method", "payment_status", "pricing_type", "price_min", "price_max", "deposit_amount",
    "amount", "pricing_status", "notes", "status", "check_in_token", "checked_in_at",
    "checked_in_by_staff_id", "completed_at", "created_at", "updated_at"
  ];
  if (supportsIdempotencyKey) appointmentColumns.push("idempotency_key");

  await insertRows(client, "workspace_ops_appointments",
    appointmentColumns,
    appointments.map((row) => {
      const values = [
        workspaceId, String(row.id), dateOnly(row.date), String(row.time || "00:00"),
        row.customerId || null, String(row.customerName || ""), row.staffId || null,
        String(row.staffName || ""), row.serviceId || null, String(row.serviceName || ""),
        String(row.categoryId || ""), numberOr(row.durationMinutes, 30), row.paymentMethod || "cash",
        row.paymentStatus || "unpaid", row.pricingType || "fixed", numberOr(row.priceMin),
        numberOr(row.priceMax), numberOr(row.depositAmount), numberOr(row.amount),
        row.pricingStatus || "fixed", String(row.notes || ""), row.status || "pending",
        String(row.checkInToken || ""), row.checkedInAt || null, row.checkedInByStaffId || null,
        row.completedAt || null, row.createdAt || new Date().toISOString(), row.updatedAt || null
      ];
      if (supportsIdempotencyKey) values.push(String(row.idempotencyKey || ""));
      return values;
    }));

  const lineItemRows = [];
  const visitRows = [];
  const visitMetaRows = [];
  for (const appointment of appointments) {
    for (const item of clean(appointment.lineItems)) {
      lineItemRows.push([
        workspaceId, String(appointment.id), String(item.id), item.kind || "primary",
        item.serviceId || null, String(item.name || item.serviceName || ""),
        numberOr(item.amount), item.pricingType || appointment.pricingType || "fixed",
        numberOr(item.priceMin), numberOr(item.priceMax), item.pricingStatus || "fixed",
        numberOr(item.durationMinutes, appointment.durationMinutes || 30), item.addedAt || null,
        item.addedByStaffId || null
      ]);
    }
    for (const entry of clean(appointment.visitLog)) {
      const visitId = String(entry.id || "");
      if (!visitId) throw new Error(`Appointment ${appointment.id} has a visit entry without an id`);
      visitRows.push([
        workspaceId, String(appointment.id), visitId, entry.at || new Date().toISOString(),
        String(entry.type || entry.event || "note"),
        entry.staffId || entry.byStaffId || null,
        String(entry.staffName || entry.byStaffName || "")
      ]);
      for (const [key, value] of Object.entries(entry)) {
        if (["id", "at", "type", "event", "staffId", "staffName", "byStaffId", "byStaffName"].includes(key)) continue;
        const meta = encodeMeta(value);
        visitMetaRows.push([workspaceId, String(appointment.id), visitId, key, meta.type, meta.value]);
      }
    }
  }
  await insertRows(client, "workspace_ops_appointment_line_items",
    ["workspace_id", "appointment_id", "id", "kind", "service_id", "name", "amount", "pricing_type",
      "price_min", "price_max", "pricing_status", "duration_minutes", "added_at", "added_by_staff_id"],
    lineItemRows);
  await insertRows(client, "workspace_ops_appointment_visits",
    ["workspace_id", "appointment_id", "id", "occurred_at", "event_type", "staff_id", "staff_name"],
    visitRows);
  await insertRows(client, "workspace_ops_appointment_visit_meta",
    ["workspace_id", "appointment_id", "visit_id", "meta_key", "value_type", "value_text"],
    visitMetaRows);

  await client.query(
    "UPDATE workspace_ops_profiles SET updated_at = NOW() WHERE workspace_id = $1",
    [workspaceId]
  );
}

async function withTransaction(workspaceId, operation) {
  if (!pool) throw new Error("PostgreSQL pool is not configured");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [workspaceId]);
    const value = await operation(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  hasProfile,
  loadStore,
  saveStore,
  withTransaction
};
