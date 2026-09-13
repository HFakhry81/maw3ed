const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { query, pool, databaseConfigured } = require("./db");
const { sendVerificationEmail, sendSubscriptionRequestEmail } = require("./email");
const { createClerkClient, verifyToken } = require("@clerk/backend");
const { whopRequest } = require("./whopClient");

const root = __dirname;
const port = Number(process.env.PORT || 7000);
const organizationId = "org-maw3ed";
const eventsFile = path.join(root, "data", "development-events.jsonl");
const emailOutboxFile = path.join(root, "data", "email-outbox.jsonl");
const localDataFile = path.join(root, "data", "maw3ed-data.json");
const localData = JSON.parse(fs.readFileSync(localDataFile, "utf8"));
const localVerificationCodes = new Map();
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8"
};
let clerkClient;

fs.mkdirSync(path.dirname(eventsFile), { recursive: true });

function localDashboardData(date) {
  const appointments = localData.appointments.filter((appointment) => appointment.date === date);
  return {
    ok: true,
    date,
    stats: {
      appointmentsToday: appointments.length,
      newPatients: localData.stats.newPatients,
      completedExams: localData.stats.completedExams,
      attendanceRate: localData.stats.attendanceRate
    },
    appointments,
    departments: localData.departments,
    doctors: localData.doctors,
    patients: localData.patients
  };
}

function localAppointmentCreate(payload) {
  const patientName = typeof payload.patientName === "string" ? payload.patientName.trim() : "";
  const date = typeof payload.date === "string" ? payload.date : "";
  const time = typeof payload.time === "string" ? payload.time : "";
  const doctor = localData.doctors.find((item) => item.id === payload.doctorId);
  const department = localData.departments.find((item) => item.id === payload.departmentId);
  if (!patientName || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time) || !doctor || !department) {
    const error = new Error("Patient, date, time, doctor and department are required");
    error.statusCode = 400;
    throw error;
  }
  const collision = localData.appointments.find((item) => item.date === date && item.time === time && item.status !== "cancelled" && (item.doctorId === doctor.id || item.departmentId === department.id));
  if (collision) {
    const error = new Error("This doctor or department is already booked at that time");
    error.statusCode = 409;
    error.conflictingAppointmentId = collision.id;
    throw error;
  }
  let patient = localData.patients.find((item) => item.name.toLowerCase() === patientName.toLowerCase());
  if (!patient) {
    patient = { id: createId("patient"), name: patientName, joinedAt: date, lastVisit: "موعد أول" };
    localData.patients.unshift(patient);
  }
  const hour = Number(time.slice(0, 2));
  const appointment = {
    id: createId("appointment"),
    date,
    time,
    period: hour >= 12 ? "مساءً" : "صباحاً",
    patientId: patient.id,
    patientName: patient.name,
    departmentId: department.id,
    departmentName: department.name,
    doctorId: doctor.id,
    doctorName: doctor.name,
    serviceName: department.defaultService,
    status: "pending"
  };
  localData.appointments.push(appointment);
  return appointment;
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function readRequestBody(req, limit = 32 * 1024) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body, "utf8") > limit) {
        reject(new Error("Request body is too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function parseJsonBody(req) {
  return readRequestBody(req).then((body) => JSON.parse(body || "{}"));
}

function appendJsonLine(file, record) {
  const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const separator = current.length > 0 && !current.endsWith("\n") ? "\n" : "";
  fs.appendFileSync(file, `${separator}${JSON.stringify(record)}\n`, "utf8");
}

function appendDevelopmentEvent(event, details = {}) {
  const record = {
    timestamp: new Date().toISOString(),
    event,
    details,
    source: "web-prototype"
  };
  appendJsonLine(eventsFile, record);
  return record;
}

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function toAppointment(row) {
  return {
    id: row.id,
    date: row.appointment_date,
    time: row.appointment_time,
    period: Number(String(row.appointment_time).slice(0, 2)) >= 12 ? "مساءً" : "صباحاً",
    patientId: row.patient_id,
    patientName: row.patient_name,
    departmentId: row.department_id,
    departmentName: row.department_name,
    doctorId: row.doctor_id,
    doctorName: row.doctor_name,
    serviceName: row.service_name,
    status: row.status
  };
}

async function dashboardData(date) {
  if (!databaseConfigured) return localDashboardData(date);
  const [appointmentsResult, newPatientsResult, metricsResult, departmentsResult, doctorsResult] = await Promise.all([
    query(
      `SELECT a.id, a.appointment_date, TO_CHAR(a.appointment_time, 'HH24:MI') AS appointment_time,
              a.patient_id, p.name AS patient_name, a.department_id, d.name AS department_name,
              a.doctor_id, dr.name AS doctor_name, a.service_name, a.status
       FROM appointments a
       JOIN patients p ON p.id = a.patient_id
       JOIN departments d ON d.id = a.department_id
       JOIN doctors dr ON dr.id = a.doctor_id
       WHERE a.organization_id = $1 AND a.appointment_date = $2
       ORDER BY a.appointment_time ASC`,
      [organizationId, date]
    ),
    query("SELECT COUNT(*)::int AS count FROM patients WHERE organization_id = $1 AND joined_at = $2", [organizationId, date]),
    query("SELECT completed_exams, attendance_rate FROM dashboard_metrics WHERE organization_id = $1", [organizationId]),
    query("SELECT id, name, default_service FROM departments WHERE organization_id = $1 AND active = true ORDER BY name", [organizationId]),
    query("SELECT id, name, specialty FROM doctors WHERE organization_id = $1 AND active = true ORDER BY name", [organizationId])
  ]);

  const metric = metricsResult.rows[0] || { completed_exams: 0, attendance_rate: 0 };
  return {
    ok: true,
    date,
    stats: {
      appointmentsToday: appointmentsResult.rows.length,
      newPatients: newPatientsResult.rows[0].count,
      completedExams: metric.completed_exams,
      attendanceRate: metric.attendance_rate
    },
    appointments: appointmentsResult.rows.map(toAppointment),
    departments: departmentsResult.rows,
    doctors: doctorsResult.rows
  };
}

async function handleAppointmentCreate(payload) {
  if (!databaseConfigured) return localAppointmentCreate(payload);
  const patientName = typeof payload.patientName === "string" ? payload.patientName.trim() : "";
  const date = typeof payload.date === "string" ? payload.date : "";
  const time = typeof payload.time === "string" ? payload.time : "";
  const doctorId = typeof payload.doctorId === "string" ? payload.doctorId : "";
  const departmentId = typeof payload.departmentId === "string" ? payload.departmentId : "";
  if (!patientName || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time) || !doctorId || !departmentId) {
    const error = new Error("Patient, date, time, doctor and department are required");
    error.statusCode = 400;
    throw error;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const [doctorResult, departmentResult] = await Promise.all([
      client.query("SELECT id, name, specialty FROM doctors WHERE id = $1 AND organization_id = $2 AND active = true", [doctorId, organizationId]),
      client.query("SELECT id, name, default_service FROM departments WHERE id = $1 AND organization_id = $2 AND active = true", [departmentId, organizationId])
    ]);
    const doctor = doctorResult.rows[0];
    const department = departmentResult.rows[0];
    if (!doctor || !department) {
      const error = new Error("Doctor or department was not found");
      error.statusCode = 400;
      throw error;
    }

    const collision = await client.query(
      `SELECT id FROM appointments
       WHERE organization_id = $1 AND appointment_date = $2 AND appointment_time = $3
         AND status <> 'cancelled' AND (doctor_id = $4 OR department_id = $5)
       FOR UPDATE`,
      [organizationId, date, time, doctorId, departmentId]
    );
    if (collision.rows[0]) {
      const error = new Error("This doctor or department is already booked at that time");
      error.statusCode = 409;
      error.conflictingAppointmentId = collision.rows[0].id;
      throw error;
    }

    let patientResult = await client.query(
      "SELECT id, name FROM patients WHERE organization_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1",
      [organizationId, patientName]
    );
    let patient = patientResult.rows[0];
    if (!patient) {
      patient = (await client.query(
        `INSERT INTO patients (id, organization_id, name, joined_at, last_visit)
         VALUES ($1, $2, $3, $4, $5) RETURNING id, name`,
        [createId("patient"), organizationId, patientName, date, "موعد أول"]
      )).rows[0];
    }

    const appointment = (await client.query(
      `INSERT INTO appointments
        (id, organization_id, appointment_date, appointment_time, patient_id, department_id, doctor_id, service_name, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
       RETURNING id, appointment_date, TO_CHAR(appointment_time, 'HH24:MI') AS appointment_time,
                 patient_id, $9::text AS patient_name, department_id, $10::text AS department_name,
                 doctor_id, $11::text AS doctor_name, service_name, status`,
      [createId("appointment"), organizationId, date, time, patient.id, departmentId, doctorId, department.default_service, patient.name, department.name, doctor.name]
    )).rows[0];
    await client.query("COMMIT");
    return toAppointment(appointment);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function verificationHash(email, code) {
  const secret = process.env.SESSION_SECRET || "development-only-verification-secret";
  return crypto.createHash("sha256").update(`${secret}:${email.toLowerCase()}:${code}`).digest("hex");
}

function parseCookies(header = "") {
  return Object.fromEntries(header.split(";").map((part) => part.trim().split("=")).filter(([key, value]) => key && value).map(([key, value]) => [key, decodeURIComponent(value)]));
}

async function getAuthenticatedUser(req) {
  if (!process.env.CLERK_SECRET_KEY) return null;
  const authorization = req.headers.authorization || "";
  const cookies = parseCookies(req.headers.cookie);
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : cookies.__session;
  if (!token) return null;
  try {
    const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
    clerkClient ||= createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
    const clerkUser = await clerkClient.users.getUser(payload.sub);
    const primaryEmail = clerkUser.emailAddresses.find((item) => item.id === clerkUser.primaryEmailAddressId)?.emailAddress || clerkUser.emailAddresses[0]?.emailAddress;
    return {
      clerkUserId: clerkUser.id,
      email: primaryEmail || "",
      displayName: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || primaryEmail || "Maw3ed user"
    };
  } catch {
    return null;
  }
}

async function requireAppUser(req) {
  const identity = await getAuthenticatedUser(req);
  if (!identity) {
    const error = new Error("Authentication is required");
    error.statusCode = 401;
    throw error;
  }
  let result = await query("SELECT * FROM app_users WHERE clerk_user_id = $1", [identity.clerkUserId]);
  if (!result.rows[0]) {
    result = await query(
      `INSERT INTO app_users (id, clerk_user_id, email, display_name, is_platform_admin)
       VALUES ($1, $2, $3, $4, NOT EXISTS (SELECT 1 FROM app_users))
       ON CONFLICT (clerk_user_id) DO UPDATE SET email = EXCLUDED.email, display_name = EXCLUDED.display_name, updated_at = NOW()
       RETURNING *`,
      [createId("user"), identity.clerkUserId, identity.email, identity.displayName]
    );
  }
  return result.rows[0];
}

async function requirePlatformAdmin(req) {
  const user = await requireAppUser(req);
  if (!user.is_platform_admin || user.status !== "active") {
    const error = new Error("Platform administrator access is required");
    error.statusCode = 403;
    throw error;
  }
  return user;
}

async function getUserWorkspace(userId) {
  const result = await query(
    `SELECT w.*, ws.role, pc.plan_key, pc.display_name AS plan_name, pc.features, pc.limits, pc.price_usd
     FROM workspaces w
     JOIN workspace_members ws ON ws.workspace_id = w.id AND ws.user_id = $1
     JOIN plan_catalog pc ON pc.plan_key = COALESCE((SELECT plan_key FROM workspace_subscriptions
       WHERE workspace_id = w.id AND status IN ('active', 'past_due')
       ORDER BY created_at DESC LIMIT 1), 'free')
     ORDER BY w.created_at ASC LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

async function listPlans() {
  if (!databaseConfigured) {
    return [
      { plan_key: "free", display_name: "Free", description: "للبدء وإدارة المواعيد الأساسية", price_usd: 0, billing_period_days: 30, features: ["لوحة التحكم", "إدارة المواعيد"], limits: {}, active: true },
      { plan_key: "pro", display_name: "Pro", description: "لفرق التشغيل الطبية النامية", price_usd: 29, billing_period_days: 30, features: ["تقارير متقدمة", "مساحات عمل متعددة"], limits: {}, active: true },
      { plan_key: "ultimate", display_name: "Ultimate", description: "للمؤسسات والعمليات الكبيرة", price_usd: 79, billing_period_days: 30, features: ["دعم أولوية", "تخصيص كامل"], limits: {}, active: true }
    ];
  }
  const result = await query(
    `SELECT plan_key, display_name, description, price_usd, billing_period_days, features, limits,
            whop_plan_id, active
     FROM plan_catalog WHERE active = true ORDER BY CASE plan_key WHEN 'free' THEN 1 WHEN 'pro' THEN 2 ELSE 3 END`
  );
  return result.rows;
}

async function logPlatformEvent(actorUserId, action, targetType, targetId, details = {}) {
  await query(
    `INSERT INTO platform_audit_events (id, actor_user_id, action, target_type, target_id, details)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [createId("audit"), actorUserId || null, action, targetType || null, targetId || null, JSON.stringify(details)]
  );
}

async function createWorkspace(user, payload) {
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const activityType = typeof payload.activityType === "string" ? payload.activityType.trim().toLowerCase() : "medical";
  const locale = typeof payload.locale === "string" ? payload.locale : "ar";
  const currency = typeof payload.currency === "string" ? payload.currency.toLowerCase() : "usd";
  if (!name || !/^[a-z0-9-]{3,60}$/.test(payload.slug || "")) {
    const error = new Error("Workspace name and a slug containing 3-60 letters, numbers or hyphens are required");
    error.statusCode = 400;
    throw error;
  }
  const workspace = (await query(
    `INSERT INTO workspaces (id, owner_user_id, name, slug, activity_type, locale, currency)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [createId("workspace"), user.id, name, payload.slug, activityType, locale, currency]
  )).rows[0];
  await query(
    "INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')",
    [workspace.id, user.id]
  );
  await logPlatformEvent(user.id, "workspace_created", "workspace", workspace.id, { activityType });
  return workspace;
}

async function createWhopCheckout(user, planKey, requestUrl) {
  const plan = (await query("SELECT * FROM plan_catalog WHERE plan_key = $1 AND active = true", [planKey])).rows[0];
  const workspace = await getUserWorkspace(user.id);
  if (!plan || !workspace || planKey === "free" || !plan.whop_plan_id) {
    const error = new Error("This plan is not available for checkout");
    error.statusCode = 400;
    throw error;
  }
  const redirectUrl = `${requestUrl.origin}/?billing=returned&plan=${encodeURIComponent(planKey)}`;
  const checkout = await whopRequest("/api/v1/checkout_configurations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan_id: plan.whop_plan_id, redirect_url: redirectUrl })
  });
  await query(
    `INSERT INTO workspace_subscriptions (id, workspace_id, plan_key, provider, provider_plan_id, status)
     VALUES ($1, $2, $3, 'whop', $4, 'pending')
     ON CONFLICT (workspace_id) WHERE status IN ('pending', 'active', 'past_due')
     DO UPDATE SET plan_key = EXCLUDED.plan_key, provider_plan_id = EXCLUDED.provider_plan_id, status = 'pending', updated_at = NOW()`,
    [createId("subscription"), workspace.id, planKey, plan.whop_plan_id]
  );
  await logPlatformEvent(user.id, "checkout_started", "workspace", workspace.id, { planKey });
  return { purchaseUrl: checkout.purchase_url, checkoutId: checkout.id, planKey };
}

async function requestManualSubscription(user, planKey) {
  const plan = (await query("SELECT * FROM plan_catalog WHERE plan_key = $1 AND active = true", [planKey])).rows[0];
  const workspace = await getUserWorkspace(user.id);
  if (!plan || !workspace) {
    const error = new Error("Create a workspace before requesting a plan");
    error.statusCode = 400;
    throw error;
  }
  if (planKey === "free") {
    const subscription = (await query(
      `INSERT INTO workspace_subscriptions (id, workspace_id, plan_key, provider, status)
       VALUES ($1, $2, 'free', 'internal', 'active')
       ON CONFLICT (workspace_id) WHERE status IN ('pending', 'active', 'past_due')
       DO UPDATE SET plan_key = 'free', provider = 'internal', provider_plan_id = NULL,
         provider_membership_id = NULL, status = 'active', updated_at = NOW()
       RETURNING *`,
      [createId("subscription"), workspace.id]
    )).rows[0];
    await logPlatformEvent(user.id, "free_plan_activated", "workspace", workspace.id);
    return { mode: "activated", planKey: "free", subscription };
  }
  const subscription = (await query(
    `INSERT INTO workspace_subscriptions (id, workspace_id, plan_key, provider, provider_plan_id, status)
     VALUES ($1, $2, $3, 'manual', $4, 'pending')
     ON CONFLICT (workspace_id) WHERE status IN ('pending', 'active', 'past_due')
     DO UPDATE SET plan_key = EXCLUDED.plan_key, provider = 'manual', provider_plan_id = EXCLUDED.provider_plan_id, status = 'pending', updated_at = NOW()
     RETURNING *`,
    [createId("subscription"), workspace.id, planKey, plan.whop_plan_id]
  )).rows[0];
  const delivery = await sendSubscriptionRequestEmail({ user, workspace, plan });
  await logPlatformEvent(user.id, "paid_plan_requested", "workspace", workspace.id, { planKey, delivery: delivery.mode });
  return { mode: "manual-review", planKey, subscriptionId: subscription.id, message: "تم إرسال طلب الاشتراك إلى مسؤول المنصة للمراجعة.", delivery: delivery.mode };
}

async function updateManualSubscription(admin, subscriptionId, status) {
  if (!["active", "cancelled", "rejected"].includes(status)) {
    const error = new Error("Invalid subscription status");
    error.statusCode = 400;
    throw error;
  }
  const normalized = status === "rejected" ? "cancelled" : status;
  const result = await query(
    `UPDATE workspace_subscriptions SET status = $1, updated_at = NOW()
     WHERE id = $2 AND provider = 'manual' RETURNING *`,
    [normalized, subscriptionId]
  );
  if (!result.rows[0]) {
    const error = new Error("Manual subscription request not found");
    error.statusCode = 404;
    throw error;
  }
  await logPlatformEvent(admin.id, `subscription_${status}`, "subscription", subscriptionId, { status: normalized });
  return result.rows[0];
}

async function verifyWhopCheckout(user, checkoutId) {
  const workspace = await getUserWorkspace(user.id);
  if (!workspace || !checkoutId) {
    const error = new Error("A valid checkout is required");
    error.statusCode = 400;
    throw error;
  }
  const response = await whopRequest(`/api/v1/payments?company_id=${encodeURIComponent(process.env.WHOP_COMPANY_ID)}&checkout_configuration_ids[]=${encodeURIComponent(checkoutId)}`);
  const payment = response.data?.find((item) => ["paid", "succeeded", "active"].includes(String(item.status).toLowerCase()));
  if (!payment) return { verified: false, reason: "payment_not_confirmed" };
  const subscription = (await query(
    `UPDATE workspace_subscriptions SET status = 'active', provider_membership_id = $1, updated_at = NOW()
     WHERE workspace_id = $2 AND status = 'pending' RETURNING *`,
    [payment.membership_id || payment.id || checkoutId, workspace.id]
  )).rows[0];
  if (!subscription) return { verified: false, reason: "subscription_not_found" };
  await logPlatformEvent(user.id, "checkout_verified", "workspace", workspace.id, { checkoutId, planKey: subscription.plan_key });
  return { verified: true, planKey: subscription.plan_key };
}

async function requestVerification(payload) {
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const error = new Error("A valid email address is required");
    error.statusCode = 400;
    throw error;
  }
  const code = String(crypto.randomInt(100000, 1000000));
  if (!databaseConfigured) {
    localVerificationCodes.set(email, { hash: verificationHash(email, code), expiresAt: Date.now() + 600000 });
    appendJsonLine(emailOutboxFile, { createdAt: new Date().toISOString(), to: email, code, type: "verification", mode: "development" });
    return { ok: true, delivery: "development-outbox", expiresInSeconds: 600, devCode: code };
  }
  await query(
    `INSERT INTO email_verifications (id, email, code_hash, expires_at)
     VALUES ($1, $2, $3, NOW() + INTERVAL '10 minutes')`,
    [createId("verification"), email, verificationHash(email, code)]
  );
  const delivery = await sendVerificationEmail({ email, code, locale: payload.locale || "ar" });
  const response = { ok: true, delivery: delivery.mode, expiresInSeconds: 600 };
  if (delivery.mode === "development-outbox") response.devCode = code;
  return response;
}

async function verifyEmail(payload) {
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const code = typeof payload.code === "string" ? payload.code.trim() : "";
  if (!databaseConfigured) {
    const record = localVerificationCodes.get(email);
    if (!record || record.expiresAt < Date.now() || record.hash !== verificationHash(email, code)) {
      const error = new Error("Verification code is invalid or expired");
      error.statusCode = 400;
      throw error;
    }
    localVerificationCodes.delete(email);
    return { ok: true, emailVerified: true };
  }
  const result = await query(
    `SELECT id FROM email_verifications
     WHERE email = $1 AND code_hash = $2 AND verified_at IS NULL AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [email, verificationHash(email, code)]
  );
  if (!result.rows[0]) {
    const error = new Error("Verification code is invalid or expired");
    error.statusCode = 400;
    throw error;
  }
  await query("UPDATE email_verifications SET verified_at = NOW() WHERE id = $1", [result.rows[0].id]);
  return { ok: true, emailVerified: true };
}

async function readEventLog(limit) {
  if (!fs.existsSync(eventsFile)) return [];
  const lines = fs.readFileSync(eventsFile, "utf8").trim().split("\n").filter(Boolean).slice(-limit);
  return lines.map((line) => JSON.parse(line));
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, "http://localhost");
  const requested = decodeURIComponent(requestUrl.pathname);

  try {
    if (requested === "/api/config" && req.method === "GET") {
      return sendJson(res, 200, {
        ok: true,
        clerkPublishableKey: process.env.VITE_CLERK_PUBLISHABLE_KEY || process.env.CLERK_PUBLISHABLE_KEY || null,
        product: "Maw3ed",
        company: "UpNexa-eg.com"
      });
    }
    if (requested === "/api/plans" && req.method === "GET") {
      return sendJson(res, 200, { ok: true, plans: await listPlans() });
    }
    if (requested === "/api/account" && req.method === "GET") {
      const user = await requireAppUser(req);
      return sendJson(res, 200, { ok: true, user: { id: user.id, email: user.email, displayName: user.display_name, isPlatformAdmin: user.is_platform_admin }, workspace: await getUserWorkspace(user.id) });
    }
    if (requested === "/api/workspaces" && req.method === "POST") {
      const user = await requireAppUser(req);
      const existing = await getUserWorkspace(user.id);
      if (existing) return sendJson(res, 409, { ok: false, error: "This account already has a workspace" });
      return sendJson(res, 201, { ok: true, workspace: await createWorkspace(user, await parseJsonBody(req)) });
    }
    if (requested === "/api/entitlements" && req.method === "GET") {
      const user = await requireAppUser(req);
      const workspace = await getUserWorkspace(user.id);
      if (!workspace) return sendJson(res, 200, { ok: true, workspace: null, plan: (await listPlans()).find((plan) => plan.plan_key === "free") });
      return sendJson(res, 200, { ok: true, workspace: { id: workspace.id, name: workspace.name, activityType: workspace.activity_type }, plan: { key: workspace.plan_key, name: workspace.plan_name, features: workspace.features, limits: workspace.limits } });
    }
    if (requested === "/api/billing/request" && req.method === "POST") {
      const user = await requireAppUser(req);
      const payload = await parseJsonBody(req);
      return sendJson(res, 201, { ok: true, request: await requestManualSubscription(user, payload.planKey) });
    }
    if (requested === "/api/whop/checkout" && req.method === "POST") {
      return sendJson(res, 410, { ok: false, error: "Paid checkout is temporarily disabled; use /api/billing/request for manual approval." });
    }
    if (requested === "/api/whop/verify-checkout" && req.method === "POST") {
      return sendJson(res, 410, { ok: false, error: "Automatic paid activation is disabled; an administrator must approve the request." });
    }
    if (requested === "/api/admin/overview" && req.method === "GET") {
      const admin = await requirePlatformAdmin(req);
      const [users, workspaces, subscriptions, events] = await Promise.all([
        query("SELECT COUNT(*)::int AS count FROM app_users WHERE status = 'active'"),
        query("SELECT COUNT(*)::int AS count FROM workspaces WHERE status = 'active'"),
        query("SELECT plan_key, COUNT(*)::int AS count FROM workspace_subscriptions WHERE status = 'active' GROUP BY plan_key ORDER BY plan_key"),
        query("SELECT action, COUNT(*)::int AS count FROM platform_audit_events GROUP BY action ORDER BY count DESC LIMIT 8")
      ]);
      return sendJson(res, 200, { ok: true, admin: { id: admin.id, email: admin.email }, metrics: { users: users.rows[0].count, workspaces: workspaces.rows[0].count, subscriptions: subscriptions.rows, events: events.rows } });
    }
    if (requested === "/api/admin/workspaces" && req.method === "GET") {
      await requirePlatformAdmin(req);
      const result = await query(
        `SELECT w.id, w.name, w.slug, w.activity_type, w.status, w.created_at, u.email AS owner_email,
                COALESCE((SELECT plan_key FROM workspace_subscriptions s WHERE s.workspace_id = w.id AND s.status IN ('pending','active','past_due') ORDER BY s.created_at DESC LIMIT 1), 'free') AS plan_key
         FROM workspaces w JOIN app_users u ON u.id = w.owner_user_id ORDER BY w.created_at DESC`
      );
      return sendJson(res, 200, { ok: true, workspaces: result.rows });
    }
    if (requested === "/api/admin/subscriptions" && req.method === "GET") {
      await requirePlatformAdmin(req);
      const result = await query(
        `SELECT s.id, s.workspace_id, s.plan_key, s.provider, s.status, s.created_at, s.updated_at,
                w.name AS workspace_name, u.email AS owner_email
         FROM workspace_subscriptions s
         JOIN workspaces w ON w.id = s.workspace_id
         JOIN app_users u ON u.id = w.owner_user_id
         ORDER BY s.updated_at DESC`
      );
      return sendJson(res, 200, { ok: true, subscriptions: result.rows });
    }
    const adminSubscriptionMatch = requested.match(/^\/api\/admin\/subscriptions\/([^/]+)$/);
    if (adminSubscriptionMatch && req.method === "PATCH") {
      const admin = await requirePlatformAdmin(req);
      const payload = await parseJsonBody(req);
      return sendJson(res, 200, { ok: true, subscription: await updateManualSubscription(admin, adminSubscriptionMatch[1], payload.status) });
    }
    if (requested === "/api/admin/plans" && req.method === "GET") {
      await requirePlatformAdmin(req);
      return sendJson(res, 200, { ok: true, plans: await listPlans() });
    }
    const adminPlanMatch = requested.match(/^\/api\/admin\/plans\/(free|pro|ultimate)$/);
    if (adminPlanMatch && req.method === "PATCH") {
      const admin = await requirePlatformAdmin(req);
      const planKey = adminPlanMatch[1];
      const payload = await parseJsonBody(req);
      const current = (await query("SELECT * FROM plan_catalog WHERE plan_key = $1", [planKey])).rows[0];
      if (!current) return sendJson(res, 404, { ok: false, error: "Plan not found" });
      const price = Number(payload.priceUsd);
      if (!Number.isFinite(price) || price < 0) return sendJson(res, 400, { ok: false, error: "priceUsd must be a non-negative number" });
      if (current.whop_plan_id && planKey !== "free") {
        await whopRequest(`/api/v1/plans/${encodeURIComponent(current.whop_plan_id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ renewal_price: price })
        });
      }
      const updated = (await query("UPDATE plan_catalog SET price_usd = $1, updated_at = NOW() WHERE plan_key = $2 RETURNING *", [price, planKey])).rows[0];
      await logPlatformEvent(admin.id, "plan_price_updated", "plan", planKey, { priceUsd: price });
      return sendJson(res, 200, { ok: true, plan: updated });
    }
    if (requested === "/api/admin/audit" && req.method === "GET") {
      await requirePlatformAdmin(req);
      const result = await query(
        `SELECT e.id, e.action, e.target_type, e.target_id, e.details, e.created_at, u.email AS actor_email
         FROM platform_audit_events e LEFT JOIN app_users u ON u.id = e.actor_user_id
         ORDER BY e.created_at DESC LIMIT 100`
      );
      return sendJson(res, 200, { ok: true, events: result.rows });
    }
    if (requested === "/api/health" && req.method === "GET") {
      if (databaseConfigured) await query("SELECT 1");
      return sendJson(res, 200, { ok: true, service: "maw3ed-api", database: databaseConfigured ? "postgresql" : "local-memory" });
    }
    if (requested === "/api/dashboard" && req.method === "GET") {
      return sendJson(res, 200, await dashboardData(requestUrl.searchParams.get("date") || "2025-05-14"));
    }
    if (requested === "/api/departments" && req.method === "GET") {
      if (!databaseConfigured) return sendJson(res, 200, { ok: true, departments: localData.departments });
      const result = await query("SELECT id, name, default_service FROM departments WHERE organization_id = $1 AND active = true ORDER BY name", [organizationId]);
      return sendJson(res, 200, { ok: true, departments: result.rows });
    }
    if (requested === "/api/doctors" && req.method === "GET") {
      if (!databaseConfigured) return sendJson(res, 200, { ok: true, doctors: localData.doctors });
      const result = await query("SELECT id, name, specialty FROM doctors WHERE organization_id = $1 AND active = true ORDER BY name", [organizationId]);
      return sendJson(res, 200, { ok: true, doctors: result.rows });
    }
    if (requested === "/api/patients" && req.method === "GET") {
      if (!databaseConfigured) return sendJson(res, 200, { ok: true, patients: localData.patients });
      const result = await query("SELECT id, name, email, joined_at AS \"joinedAt\", last_visit AS \"lastVisit\" FROM patients WHERE organization_id = $1 ORDER BY created_at DESC", [organizationId]);
      return sendJson(res, 200, { ok: true, patients: result.rows });
    }
    if (requested === "/api/appointments" && req.method === "GET") {
      if (!databaseConfigured) {
        const date = requestUrl.searchParams.get("date");
        return sendJson(res, 200, { ok: true, appointments: localData.appointments.filter((appointment) => !date || appointment.date === date) });
      }
      const date = requestUrl.searchParams.get("date");
      const result = await query(
        `SELECT a.id, a.appointment_date, TO_CHAR(a.appointment_time, 'HH24:MI') AS appointment_time,
                a.patient_id, p.name AS patient_name, a.department_id, d.name AS department_name,
                a.doctor_id, dr.name AS doctor_name, a.service_name, a.status
         FROM appointments a JOIN patients p ON p.id = a.patient_id
         JOIN departments d ON d.id = a.department_id JOIN doctors dr ON dr.id = a.doctor_id
         WHERE a.organization_id = $1 AND ($2::date IS NULL OR a.appointment_date = $2::date)
         ORDER BY a.appointment_date, a.appointment_time`,
        [organizationId, date || null]
      );
      return sendJson(res, 200, { ok: true, appointments: result.rows.map(toAppointment) });
    }
    if (requested === "/api/appointments" && req.method === "POST") {
      const appointment = await handleAppointmentCreate(await parseJsonBody(req));
      return sendJson(res, 201, { ok: true, appointment });
    }
    if (requested === "/api/auth/request-verification" && req.method === "POST") {
      return sendJson(res, 200, await requestVerification(await parseJsonBody(req)));
    }
    if (requested === "/api/auth/verify-email" && req.method === "POST") {
      return sendJson(res, 200, await verifyEmail(await parseJsonBody(req)));
    }
    if (requested === "/api/development-events" && req.method === "POST") {
      const payload = await parseJsonBody(req);
      const event = typeof payload.event === "string" ? payload.event.trim() : "";
      if (!/^[a-z0-9_.-]{1,80}$/.test(event)) return sendJson(res, 400, { ok: false, error: "Invalid event name" });
      const details = payload.details && typeof payload.details === "object" ? payload.details : {};
      const serialized = JSON.stringify(details);
      const safeDetails = serialized.length > 2000 ? { truncated: true } : details;
      const record = appendDevelopmentEvent(event, safeDetails);
      return sendJson(res, 201, { ok: true, timestamp: record.timestamp });
    }
    if (requested === "/api/development-events" && req.method === "GET") {
      return sendJson(res, 200, { ok: true, events: await readEventLog(Math.min(Math.max(Number(requestUrl.searchParams.get("limit")) || 50, 1), 200)) });
    }

    const staticRoot = fs.existsSync(path.join(root, "dist", "index.html")) ? path.join(root, "dist") : root;
    const relative = requested === "/" ? "/index.html" : requested;
    const filePath = path.resolve(staticRoot, `.${relative}`);
    if (!filePath.startsWith(staticRoot)) return res.end("Forbidden");
    fs.readFile(filePath, (error, data) => {
      if (error) {
        res.writeHead(error.code === "ENOENT" ? 404 : 500, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end(error.code === "ENOENT" ? "Not found" : "Server error");
      }
      const isHashedAsset = staticRoot.endsWith(`${path.sep}dist`) && /[-_][A-Za-z0-9_-]{8,}\.(?:js|css|svg|png|jpg|webp)$/.test(path.basename(filePath));
      res.writeHead(200, {
        "Content-Type": types[path.extname(filePath)] || "application/octet-stream",
        "Cache-Control": isHashedAsset ? "public, max-age=31536000, immutable" : "no-store"
      });
      res.end(data);
    });
  } catch (error) {
    const status = error.statusCode || 500;
    sendJson(res, status, { ok: false, error: error.message || "Internal server error", ...(error.conflictingAppointmentId ? { conflictingAppointmentId: error.conflictingAppointmentId } : {}) });
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Maw3ed dashboard running on port ${port}`);
});