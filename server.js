const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
require("./scripts/load-env");
const { query, pool, databaseConfigured } = require("./db");
const { sendVerificationEmail, sendSubscriptionRequestEmail } = require("./email");
const { createClerkClient, verifyToken } = require("@clerk/backend");
const { whopRequest } = require("./whopClient");
const { tryHandleOpsApi } = require("./opsRoutes");
const { createPlatformAdmin } = require("./platformAdmin");
const { createAdminRouter } = require("./platformAdminRoutes");

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
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
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

function securityHeaders(extra = {}) {
  const isProductionLike = process.env.MAW3ED_ENV === "production" || process.env.MAW3ED_REQUIRE_AUTH === "1";
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
    "X-XSS-Protection": "0",
    "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' http: https:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    ...(isProductionLike ? { "Strict-Transport-Security": "max-age=31536000; includeSubDomains" } : {}),
    ...extra
  };
}

function authRequiredForRequest() {
  return process.env.MAW3ED_ENV === "production" || process.env.MAW3ED_REQUIRE_AUTH === "1";
}

function sendJson(res, status, payload) {
  res.writeHead(status, securityHeaders({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  }));
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
    date: row.appointment_date instanceof Date ? row.appointment_date.toISOString().slice(0, 10) : String(row.appointment_date).slice(0, 10),
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

async function dashboardData(date, orgId = organizationId) {
  if (!databaseConfigured) return localDashboardData(date);
  const [appointmentsResult, newPatientsResult, metricsResult, departmentsResult, doctorsResult, patientsResult] = await Promise.all([
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
      [orgId, date]
    ),
    query("SELECT COUNT(*)::int AS count FROM patients WHERE organization_id = $1 AND joined_at = $2", [orgId, date]),
    query("SELECT completed_exams, attendance_rate FROM dashboard_metrics WHERE organization_id = $1", [orgId]),
    query("SELECT id, name, default_service FROM departments WHERE organization_id = $1 AND active = true ORDER BY name", [orgId]),
    query("SELECT id, name, specialty FROM doctors WHERE organization_id = $1 AND active = true ORDER BY name", [orgId]),
    query(`SELECT id, name, TO_CHAR(joined_at, 'YYYY-MM-DD') AS "joinedAt", last_visit AS "lastVisit"
           FROM patients WHERE organization_id = $1 ORDER BY created_at DESC`, [orgId])
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
    doctors: doctorsResult.rows,
    patients: patientsResult.rows
  };
}

async function handleAppointmentCreate(payload, orgId = organizationId) {
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
      client.query("SELECT id, name, specialty FROM doctors WHERE id = $1 AND organization_id = $2 AND active = true", [doctorId, orgId]),
      client.query("SELECT id, name, default_service FROM departments WHERE id = $1 AND organization_id = $2 AND active = true", [departmentId, orgId])
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
      [orgId, date, time, doctorId, departmentId]
    );
    if (collision.rows[0]) {
      const error = new Error("This doctor or department is already booked at that time");
      error.statusCode = 409;
      error.conflictingAppointmentId = collision.rows[0].id;
      throw error;
    }

    let patientResult = await client.query(
      "SELECT id, name FROM patients WHERE organization_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1",
      [orgId, patientName]
    );
    let patient = patientResult.rows[0];
    if (!patient) {
      patient = (await client.query(
        `INSERT INTO patients (id, organization_id, name, joined_at, last_visit)
         VALUES ($1, $2, $3, $4, $5) RETURNING id, name`,
        [createId("patient"), orgId, patientName, date, "موعد أول"]
      )).rows[0];
    }

    const appointment = (await client.query(
      `INSERT INTO appointments
        (id, organization_id, appointment_date, appointment_time, patient_id, department_id, doctor_id, service_name, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
       RETURNING id, appointment_date, TO_CHAR(appointment_time, 'HH24:MI') AS appointment_time,
                 patient_id, $9::text AS patient_name, department_id, $10::text AS department_name,
                 doctor_id, $11::text AS doctor_name, service_name, status`,
      [createId("appointment"), orgId, date, time, patient.id, departmentId, doctorId, department.default_service, patient.name, department.name, doctor.name]
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
    // Do not pass authorizedParties unless explicitly configured — a mismatched azp
    // claim rejects valid local sessions and loops users back to the login screen.
    const verifyOptions = {
      secretKey: process.env.CLERK_SECRET_KEY,
      clockSkewInMs: 60_000
    };
    if (process.env.CLERK_JWT_KEY) {
      verifyOptions.jwtKey = process.env.CLERK_JWT_KEY;
    }
    if (process.env.CLERK_AUTHORIZED_PARTY) {
      verifyOptions.authorizedParties = String(process.env.CLERK_AUTHORIZED_PARTY)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }

    // @clerk/backend v3 returns { data, errors } — it does not throw on invalid tokens.
    const verified = await verifyToken(token, verifyOptions);
    const payload = verified?.data || (verified?.sub ? verified : null);
    const verifyErrors = verified?.errors;
    if (!payload?.sub) {
      const reason = Array.isArray(verifyErrors) && verifyErrors[0]
        ? verifyErrors[0].message || verifyErrors[0].reason || String(verifyErrors[0])
        : "token verification returned no subject";
      console.warn("[auth] clerk token verification failed:", reason);
      return null;
    }

    clerkClient ||= createClerkClient({
      secretKey: process.env.CLERK_SECRET_KEY,
      publishableKey:
        process.env.CLERK_PUBLISHABLE_KEY ||
        process.env.VITE_CLERK_PUBLISHABLE_KEY ||
        undefined
    });
    const clerkUser = await clerkClient.users.getUser(payload.sub);
    const primaryEmail =
      clerkUser.emailAddresses.find((item) => item.id === clerkUser.primaryEmailAddressId)?.emailAddress ||
      clerkUser.emailAddresses[0]?.emailAddress;
    return {
      clerkUserId: clerkUser.id,
      email: primaryEmail || "",
      displayName: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || primaryEmail || "Maw3ed user"
    };
  } catch (error) {
    console.warn("[auth] clerk token verification failed:", error?.message || error);
    return null;
  }
}

const localClerkWorkspacesPath = path.join(__dirname, "data", "local-clerk-workspaces.json");

function loadLocalClerkWorkspaces() {
  try {
    if (!fs.existsSync(localClerkWorkspacesPath)) return {};
    const data = JSON.parse(fs.readFileSync(localClerkWorkspacesPath, "utf8"));
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

function saveLocalClerkWorkspaces(data) {
  fs.mkdirSync(path.dirname(localClerkWorkspacesPath), { recursive: true });
  fs.writeFileSync(localClerkWorkspacesPath, JSON.stringify(data, null, 2), "utf8");
}

function localActivityMeta(activityType, locale = "ar") {
  const activityTemplates = require("./activityTemplatesCatalog");
  return activityTemplates.templateMeta(activityType, locale);
}

async function requireAppUser(req) {
  const identity = await getAuthenticatedUser(req);
  if (!identity) {
    const error = new Error(
      process.env.MAW3ED_ENV === "local"
        ? "Authentication is required (تحقق من جلسة Clerk؛ إن ظهر fetch failed في السيرفر أوقف VPN أو شغّل: node --use-system-ca server.js)"
        : "Authentication is required"
    );
    error.statusCode = 401;
    throw error;
  }
  if (!databaseConfigured) {
    return {
      id: `local-user-${identity.clerkUserId}`,
      clerk_user_id: identity.clerkUserId,
      email: identity.email,
      display_name: identity.displayName,
      is_platform_admin: false,
      platform_role: null,
      status: "active"
    };
  }
  let result = await query("SELECT * FROM app_users WHERE clerk_user_id = $1", [identity.clerkUserId]);
  if (!result.rows[0]) {
    result = await query(
      `INSERT INTO app_users (id, clerk_user_id, email, display_name, is_platform_admin, platform_role)
       VALUES (
         $1, $2, $3, $4, FALSE, NULL
       )
       ON CONFLICT (clerk_user_id) DO UPDATE SET email = EXCLUDED.email, display_name = EXCLUDED.display_name, updated_at = NOW()
       RETURNING *`,
      [createId("user"), identity.clerkUserId, identity.email, identity.displayName]
    );
  }
  return result.rows[0];
}

const platformAdmin = createPlatformAdmin({ query, databaseConfigured, sendJson });
let adminRouter;

function getAdminRouter() {
  if (!adminRouter) {
    adminRouter = createAdminRouter({
      query,
      listPlans,
      requireAppUser,
      platformAdmin,
      sendJson,
      parseJsonBody,
      whopRequest
    });
  }
  return adminRouter;
}

async function requirePlatformAdmin(req) {
  return getAdminRouter().requirePlatformAdminCompat(req);
}

async function getUserWorkspace(userId, workspaceId = null) {
  if (!databaseConfigured) {
    const rows = loadLocalClerkWorkspaces()[userId] || [];
    const row = (workspaceId ? rows.find((item) => item.id === workspaceId) : rows[0]) || null;
    return row?.status === "active" && row.role ? row : null;
  }
  const result = await query(
    `SELECT w.*, ws.role, o.id AS organization_id, o.activity_type AS organization_activity_type,
            o.locale AS organization_locale, o.currency AS organization_currency,
            o.timezone AS organization_timezone, o.logo_url, o.primary_color, o.labels AS organization_labels,
            pc.plan_key, pc.display_name AS plan_name, pc.features, pc.limits, pc.price_usd
     FROM workspaces w
     JOIN workspace_members ws ON ws.workspace_id = w.id AND ws.user_id = $1
     LEFT JOIN organizations o ON o.workspace_id = w.id
     JOIN plan_catalog pc ON pc.plan_key = COALESCE((SELECT plan_key FROM workspace_subscriptions
       WHERE workspace_id = w.id AND status IN ('active', 'past_due')
       ORDER BY created_at DESC LIMIT 1), 'free')
     WHERE ($2::text IS NULL OR w.id = $2)
       AND w.status = 'active'
       AND ws.status = 'active'
     ORDER BY w.created_at ASC LIMIT 1`,
    [userId, workspaceId]
  );
  return result.rows[0] || null;
}

async function listUserWorkspaces(userId) {
  if (!databaseConfigured) {
    return loadLocalClerkWorkspaces()[userId] || [];
  }
  const result = await query(
    `SELECT w.id, w.name, w.slug, w.activity_type, w.status, w.created_at,
            o.id AS organization_id, o.logo_url, o.name AS organization_name
     FROM workspaces w
     JOIN workspace_members ws ON ws.workspace_id = w.id AND ws.user_id = $1
     LEFT JOIN organizations o ON o.workspace_id = w.id
     WHERE w.status = 'active'
     ORDER BY w.created_at ASC`,
    [userId]
  );
  return result.rows;
}

async function getRequestOrganizationId(req, requestUrl) {
  if (!databaseConfigured) return organizationId;

  const authRequired = process.env.MAW3ED_ENV === "production" || process.env.MAW3ED_REQUIRE_AUTH === "1";
  if (!authRequired) return organizationId;

  const user = await requireAppUser(req);
  const workspaceId = req.headers["x-workspace-id"] || requestUrl.searchParams.get("workspace");
  const effectiveWorkspaceId = workspaceId || (await getUserWorkspace(user.id))?.id;
  if (!effectiveWorkspaceId) {
    const error = new Error("No workspace is available for the current account");
    error.statusCode = 403;
    throw error;
  }
  const workspace = await getUserWorkspace(user.id, effectiveWorkspaceId);
  if (!workspace?.organization_id) {
    const error = new Error("This workspace is not available for the current account");
    error.statusCode = 403;
    throw error;
  }
  return workspace.organization_id;
}

async function getOrganizationProfile(orgId) {
  const result = await query(
    `SELECT o.id, o.workspace_id AS "workspaceId", o.name, o.slug, o.activity_type AS "activityType",
            o.locale, o.currency, o.timezone, o.logo_url AS "logoUrl",
            o.primary_color AS "primaryColor", o.labels, o.settings,
            t.display_name AS "activityDisplayName", t.description AS "activityDescription"
     FROM organizations o
     LEFT JOIN activity_templates t ON t.activity_type = o.activity_type
     WHERE o.id = $1`,
    [orgId]
  );
  return result.rows[0] || null;
}

async function updateOrganizationProfile(req, requestUrl, payload) {
  const orgId = await getRequestOrganizationId(req, requestUrl);
  if (process.env.CLERK_SECRET_KEY) {
    const user = await requireAppUser(req);
    const membership = await query(
      `SELECT ws.role FROM workspace_members ws
       JOIN organizations o ON o.workspace_id = ws.workspace_id
       WHERE o.id = $1 AND ws.user_id = $2`,
      [orgId, user.id]
    );
    if (!["owner", "admin", "manager"].includes(membership.rows[0]?.role)) {
      const error = new Error("Workspace manager access is required");
      error.statusCode = 403;
      throw error;
    }
  } else if (orgId !== organizationId) {
    const error = new Error("Workspace authentication is required");
    error.statusCode = 401;
    throw error;
  }
  const activityType = typeof payload.activityType === "string" ? payload.activityType.trim().toLowerCase() : null;
  const template = activityType ? (await query("SELECT * FROM activity_templates WHERE activity_type = $1", [activityType])).rows[0] : null;
  if (activityType && !template) {
    const error = new Error("Unsupported activity type");
    error.statusCode = 400;
    throw error;
  }
  const labels = payload.labels && typeof payload.labels === "object" && !Array.isArray(payload.labels) ? payload.labels : null;
  const allowedLabels = ["customer", "staff", "department", "service", "appointment"];
  const safeLabels = labels ? Object.fromEntries(Object.entries(labels).filter(([key, value]) => allowedLabels.includes(key) && typeof value === "string" && value.trim()).map(([key, value]) => [key, value.trim()])) : null;
  const current = await getOrganizationProfile(orgId);
  const mergedLabels = { ...(activityType ? (template?.labels || {}) : (current?.labels || {})), ...(safeLabels || {}) };
  const result = await query(
    `UPDATE organizations
     SET name = COALESCE($1, name),
         activity_type = COALESCE($2, activity_type),
         locale = COALESCE($3, locale),
         currency = COALESCE($4, currency),
         timezone = COALESCE($5, timezone),
         logo_url = COALESCE($6, logo_url),
         primary_color = COALESCE($7, primary_color),
         labels = $8::jsonb,
         settings = COALESCE($9::jsonb, settings),
         updated_at = NOW()
     WHERE id = $10
     RETURNING id`,
    [
      typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : null,
      activityType,
      typeof payload.locale === "string" ? payload.locale : null,
      typeof payload.currency === "string" ? payload.currency.toLowerCase() : null,
      typeof payload.timezone === "string" ? payload.timezone : null,
      typeof payload.logoUrl === "string" ? payload.logoUrl.trim() : null,
      /^#[0-9a-f]{6}$/i.test(payload.primaryColor || "") ? payload.primaryColor : null,
      JSON.stringify(mergedLabels),
      payload.settings && typeof payload.settings === "object" && !Array.isArray(payload.settings) ? JSON.stringify(payload.settings) : null,
      orgId
    ]
  );
  if (!result.rows[0]) {
    const error = new Error("Organization profile not found");
    error.statusCode = 404;
    throw error;
  }
  return getOrganizationProfile(orgId);
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

async function logPlatformEvent(actorUserId, action, targetType, targetId, details = {}, meta = {}) {
  if (!databaseConfigured) return;
  try {
    await platformAdmin.writeAuditLog({
      adminId: actorUserId,
      action,
      targetType,
      targetId,
      oldValue: meta.oldValue || null,
      newValue: meta.newValue || null,
      ip: meta.ip || null,
      details
    });
  } catch (error) {
    // Fallback for pre-migration DBs without new audit columns
    try {
      await query(
        `INSERT INTO platform_audit_events (id, actor_user_id, action, target_type, target_id, details)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [createId("audit"), actorUserId || null, action, targetType || null, targetId || null, JSON.stringify(details)]
      );
    } catch (fallbackError) {
      console.warn("[audit] log failed:", error.message, fallbackError.message);
    }
  }
}

async function updateManualSubscription(admin, subscriptionId, status, req = null, payload = {}) {
  return getAdminRouter().updateManualSubscription(admin, subscriptionId, status, req || { headers: {} }, payload);
}

async function createWorkspace(user, payload) {
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const activityType = typeof payload.activityType === "string" ? payload.activityType.trim().toLowerCase() : "medical";
  const locale = typeof payload.locale === "string" ? payload.locale : "ar";
  const currency = typeof payload.currency === "string" ? payload.currency.toLowerCase() : "egp";
  const baseSlug = String(payload.slug || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!name || !/^[a-z0-9-]{3,60}$/.test(baseSlug)) {
    const error = new Error("اسم المساحة مطلوب، والرابط يجب أن يكون 3–60 حرفاً إنجليزياً صغيراً أو أرقاماً أو شرطات فقط (مثل dawy-hospitals)");
    error.statusCode = 400;
    throw error;
  }

  async function nextAvailableSlug(candidate) {
    let slug = candidate;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const existing = await query(
        `SELECT 1 AS hit FROM workspaces WHERE slug = $1
         UNION ALL
         SELECT 1 FROM booking_pages WHERE slug = $1
         UNION ALL
         SELECT 1 FROM organizations WHERE slug = $1
         LIMIT 1`,
        [slug]
      );
      if (!existing.rows[0]) return { slug, taken: attempt > 0 };
      const match = String(candidate).match(/^(.*)-(\d+)$/);
      const base = match ? match[1] : candidate;
      const start = match ? Number(match[2]) : 1;
      const n = start + attempt + 1;
      const suffix = `-${n}`;
      slug = `${base.slice(0, Math.max(3, 60 - suffix.length))}${suffix}`;
    }
    return { slug: `${candidate.slice(0, 40)}-${Date.now().toString(36)}`, taken: true };
  }

  function slugConflictError(requested, suggested) {
    const error = new Error(`الرابط «${requested}» مستخدم بالفعل. عدّله أو أضف تمييزاً مثل «${suggested}»`);
    error.statusCode = 409;
    error.code = "slug_taken";
    error.suggestedSlug = suggested;
    return error;
  }

  if (!databaseConfigured) {
    const activityTemplates = require("./activityTemplatesCatalog");
    const meta = localActivityMeta(activityType, locale);
    const resolvedActivityType = activityTemplates.resolveTemplateId(activityType);
    const registry = loadLocalClerkWorkspaces();
    const takenList = Object.values(registry).flat().map((item) => item.slug);
    let slug = baseSlug;
    if (takenList.includes(baseSlug)) {
      let suggested = baseSlug;
      let n = 2;
      while (takenList.includes(suggested) && n < 40) {
        const suffix = `-${n}`;
        suggested = `${baseSlug.replace(/-\d+$/, "").slice(0, Math.max(3, 60 - suffix.length))}${suffix}`;
        n += 1;
      }
      if (payload.acceptSuggestedSlug && suggested !== baseSlug && !takenList.includes(suggested)) {
        slug = suggested;
      } else {
        throw slugConflictError(baseSlug, suggested);
      }
    }
    const workspaceId = createId("workspace").replace(/_/g, "-");
    const organizationIdLocal = `org-${workspaceId}`;
    try {
      const opsStore = require("./opsStore");
      opsStore.seedWorkspaceStore(workspaceId, {
        slug,
        businessName: name,
        activityType: resolvedActivityType,
        locale
      });
    } catch (error) {
      console.warn("[workspace] local ops seed failed:", error.message);
    }
    const workspace = {
      id: workspaceId,
      name,
      slug,
      activity_type: resolvedActivityType,
      status: "active",
      created_at: new Date().toISOString(),
      organization_id: organizationIdLocal,
      organization_name: name,
      logo_url: null,
      role: "owner",
      plan_key: "free",
      plan_name: "Free",
      features: ["لوحة التحكم", "إدارة المواعيد"],
      limits: {},
      locale,
      currency,
      labels: meta.labels
    };
    registry[user.id] = [...(registry[user.id] || []), workspace];
    saveLocalClerkWorkspaces(registry);
    return workspace;
  }

  const activityTemplates = require("./activityTemplatesCatalog");
  const resolvedActivityType = activityTemplates.resolveTemplateId(activityType);
  const catalogMeta = activityTemplates.templateMeta(resolvedActivityType, locale);
  let template = (await query("SELECT * FROM activity_templates WHERE activity_type = $1", [resolvedActivityType])).rows[0];
  if (!template) {
    template = {
      activity_type: resolvedActivityType,
      display_name: catalogMeta.displayName,
      description: catalogMeta.description,
      labels: catalogMeta.labels,
      defaults: catalogMeta.defaults
    };
  } else {
    template = {
      ...template,
      display_name: catalogMeta.displayName || template.display_name,
      labels: catalogMeta.labels || template.labels,
      defaults: catalogMeta.defaults || template.defaults
    };
  }
  const availability = await nextAvailableSlug(baseSlug);
  let slug = baseSlug;
  if (availability.taken) {
    if (payload.acceptSuggestedSlug && availability.slug) {
      slug = availability.slug;
    } else {
      throw slugConflictError(baseSlug, availability.slug);
    }
  }

  if (!pool) {
    const error = new Error("قاعدة البيانات غير متاحة");
    error.statusCode = 500;
    throw error;
  }

  const client = await pool.connect();
  let workspace;
  try {
    await client.query("BEGIN");
    try {
      workspace = (
        await client.query(
          `INSERT INTO workspaces (id, owner_user_id, name, slug, activity_type, locale, currency)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [createId("workspace"), user.id, name, slug, resolvedActivityType, locale, currency]
        )
      ).rows[0];
    } catch (error) {
      if (error?.code === "23505") {
        const again = await nextAvailableSlug(baseSlug);
        throw slugConflictError(baseSlug, again.slug);
      }
      throw error;
    }
    const organizationId = `org-${workspace.id}`;
    await client.query(
      "INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')",
      [workspace.id, user.id]
    );
    await client.query(
      `INSERT INTO organizations
        (id, workspace_id, name, slug, owner_company, activity_type, locale, currency, labels)
       VALUES ($1, $2, $3, $4, 'UpNexa-eg.com', $5, $6, $7, $8::jsonb)`,
      [organizationId, workspace.id, name, slug, resolvedActivityType, locale, currency, JSON.stringify(template.labels)]
    );
    await client.query("INSERT INTO dashboard_metrics (organization_id) VALUES ($1)", [organizationId]);
    await client.query(
      `INSERT INTO booking_pages (organization_id, slug, description, show_platform_branding)
       VALUES ($1, $2, $3, $4)`,
      [organizationId, slug, `احجز خدمات ${name} بسهولة`, true]
    );
    const catalogSeed = activityTemplates.buildSeedFromTemplate(resolvedActivityType, locale, { replaceStaff: true });
    const departmentRows = catalogSeed.serviceCategories.length
      ? catalogSeed.serviceCategories
      : [{ id: `department-${workspace.id}-main`, name: catalogMeta.labels.department || "الأقسام" }];
    for (const department of departmentRows) {
      await client.query(
        `INSERT INTO departments (id, organization_id, name, default_service)
         VALUES ($1, $2, $3, $4)`,
        [department.id || `department-${workspace.id}-${Math.random().toString(36).slice(2, 8)}`, organizationId, department.name, catalogMeta.labels.service || "الخدمات"]
      );
    }
    await client.query(
      `INSERT INTO doctors (id, organization_id, name, specialty)
       VALUES ($1, $2, $3, $4)`,
      [`staff-${workspace.id}-main`, organizationId, catalogMeta.defaults?.staff_singular || catalogMeta.labels.staff || "الموظفون", catalogMeta.displayName]
    );
    await client.query(
      `INSERT INTO customer_categories (id, organization_id, name, color)
       VALUES ($1, $2, $3, $4)`,
      [`customer-category-${workspace.id}-standard`, organizationId, catalogMeta.labels.customer || "العملاء", "#2474df"]
    );
    for (let weekday = 0; weekday <= 6; weekday += 1) {
      await client.query(
        `INSERT INTO working_hours (organization_id, weekday, opens_at, closes_at, is_closed)
         VALUES ($1, $2, $3, $4, $5)`,
        [organizationId, weekday, "09:00", "17:00", weekday === 5]
      );
    }
    await client.query("COMMIT");
    workspace = { ...workspace, organization_id: organizationId };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw error;
  } finally {
    client.release();
  }

  await logPlatformEvent(user.id, "workspace_created", "workspace", workspace.id, { activityType });
  try {
    const opsStore = require("./opsStore");
    opsStore.seedWorkspaceStore(workspace.id, {
      slug: workspace.slug,
      businessName: name,
      activityType: resolvedActivityType,
      locale
    });
    await opsStore.withWorkspaceAsync(workspace.id, async () => {});
  } catch (error) {
    console.error("[workspace] normalized ops initialization failed:", error.message);
    throw new Error(`تم إنشاء مساحة العمل لكن تعذّر تهيئة بيانات التشغيل في PostgreSQL: ${error.message}`);
  }
  return { ...workspace, organization_id: workspace.organization_id, labels: template.labels };
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

async function getWorkspaceBillingStatus(user, workspaceId = null) {
  const workspace = await getUserWorkspace(user.id, workspaceId);
  if (!workspace) {
    return { workspace: null, planKey: "free", status: "none", subscription: null };
  }

  if (!databaseConfigured) {
    return {
      workspace: { id: workspace.id, name: workspace.name, activityType: workspace.activity_type },
      planKey: workspace.plan_key || "free",
      status: "active",
      subscription: { workspace_id: workspace.id, plan_key: workspace.plan_key || "free", provider: "internal", status: "active" },
      message: "خطة العمل الحالية فعّالة." 
    };
  }

  const subscription = (
    await query(
      `SELECT s.*, pc.display_name AS plan_name, pc.description, pc.price_usd, pc.billing_period_days, pc.features, pc.limits
       FROM workspace_subscriptions s
       JOIN plan_catalog pc ON pc.plan_key = s.plan_key
       WHERE s.workspace_id = $1
       ORDER BY s.updated_at DESC, s.created_at DESC
       LIMIT 1`,
      [workspace.id]
    )
  ).rows[0];

  const planKey = subscription?.plan_key || workspace.plan_key || "free";
  const status = subscription?.status || (workspace.plan_key ? "active" : "none");

  return {
    workspace: { id: workspace.id, name: workspace.name, activityType: workspace.activity_type },
    planKey,
    status,
    subscription: subscription || null,
    active: status === "active" || status === "past_due",
    message:
      status === "pending"
        ? "طلب الاشتراك قيد المراجعة من مسؤول المنصة."
        : status === "active"
          ? "الاشتراك الحالي فعال."
          : status === "cancelled"
            ? "تم إلغاء الاشتراك الحالي."
            : status === "past_due"
              ? "الاشتراك الحالي متأخر في السداد." 
              : "لا يوجد اشتراك نشط في هذه المساحة."
  };
}

async function requestManualSubscription(user, planKey) {
  const plan = (await query("SELECT * FROM plan_catalog WHERE plan_key = $1 AND active = true", [planKey])).rows[0];
  const workspace = await getUserWorkspace(user.id);
  if (!plan || !workspace) {
    const error = new Error("Create a workspace before requesting a plan");
    error.statusCode = 400;
    throw error;
  }
  if (!planKey || !/^(free|pro|ultimate)$/.test(String(planKey))) {
    const error = new Error("Plan is not available");
    error.statusCode = 400;
    throw error;
  }
  if (planKey === "free") {
    const subscription = (await query(
      `INSERT INTO workspace_subscriptions (id, workspace_id, plan_key, provider, status, activated_at, price_usd_snapshot)
       VALUES ($1, $2, 'free', 'internal', 'active', NOW(), 0)
       ON CONFLICT (workspace_id) WHERE status IN ('pending', 'active', 'past_due')
       DO UPDATE SET plan_key = 'free', provider = 'internal', provider_plan_id = NULL,
         provider_membership_id = NULL, status = 'active', activated_at = NOW(),
         price_usd_snapshot = 0, cancelled_at = NULL, updated_at = NOW()
       RETURNING *`,
      [createId("subscription"), workspace.id]
    )).rows[0];
    await logPlatformEvent(user.id, "free_plan_activated", "workspace", workspace.id);
    return { mode: "activated", planKey: "free", status: "active", subscription };
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
  return { mode: "manual-review", planKey, status: "pending", subscriptionId: subscription.id, message: "تم إرسال طلب الاشتراك إلى مسؤول المنصة للمراجعة.", delivery: delivery.mode };
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
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  const requestUrl = new URL(req.url, "http://localhost");
  const requested = decodeURIComponent(requestUrl.pathname);

  Object.entries(securityHeaders()).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
  res.on("finish", () => {
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      level: "info",
      requestId,
      method: req.method,
      path: requested,
      status: res.statusCode || 200,
      durationMs: Date.now() - startTime,
      clientIp: String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim()
    }));
  });

  try {
    if (requested === "/api/config" && req.method === "GET") {
      return sendJson(res, 200, {
        ok: true,
        clerkPublishableKey:
          process.env.VITE_CLERK_PUBLISHABLE_KEY
          || process.env.CLERK_PUBLISHABLE_KEY
          || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
          || null,
        product: "Maw3ed",
        company: "UpNexa-eg.com"
      });
    }
    if (requested === "/api/plans" && req.method === "GET") {
      return sendJson(res, 200, { ok: true, plans: await listPlans() });
    }
    if (requested === "/api/account" && req.method === "GET") {
      const user = await requireAppUser(req);
      return sendJson(res, 200, {
        ok: true,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.display_name,
          isPlatformAdmin: Boolean(user.is_platform_admin || user.platform_role),
          platformRole: user.platform_role || (user.is_platform_admin ? "super_admin" : null)
        },
        workspace: await getUserWorkspace(user.id)
      });
    }
    if (requested === "/api/workspaces" && req.method === "GET") {
      const user = await requireAppUser(req);
      return sendJson(res, 200, { ok: true, workspaces: await listUserWorkspaces(user.id) });
    }
    if (requested === "/api/workspaces" && req.method === "POST") {
      const user = await requireAppUser(req);
      return sendJson(res, 201, { ok: true, workspace: await createWorkspace(user, await parseJsonBody(req)) });
    }
    if (requested === "/api/entitlements" && req.method === "GET") {
      const user = await requireAppUser(req);
      const workspace = await getUserWorkspace(user.id);
      if (!workspace) return sendJson(res, 200, { ok: true, workspace: null, plan: (await listPlans()).find((plan) => plan.plan_key === "free") });
      return sendJson(res, 200, { ok: true, workspace: { id: workspace.id, name: workspace.name, activityType: workspace.activity_type }, plan: { key: workspace.plan_key, name: workspace.plan_name, features: workspace.features, limits: workspace.limits } });
    }
    if (requested === "/api/billing/status" && req.method === "GET") {
      const user = await requireAppUser(req);
      const workspace = await getUserWorkspace(user.id);
      if (!workspace) {
        return sendJson(res, 200, { ok: true, workspace: null, planKey: "free", status: "none", subscription: null });
      }
      const billingStatus = await getWorkspaceBillingStatus(user, workspace.id);
      return sendJson(res, 200, { ok: true, ...billingStatus });
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
    if (requested.startsWith("/api/admin")) {
      const handled = await getAdminRouter().handle(requested, req, res, requestUrl);
      if (handled !== false) return;
      return sendJson(res, 404, { ok: false, error: "Admin route not found" });
    }
    if (requested === "/api/health" && req.method === "GET") {
      let ready = true;
      let database = databaseConfigured ? "postgresql" : "local-memory";
      if (databaseConfigured) {
        try {
          await query("SELECT 1");
        } catch (error) {
          ready = false;
          database = "postgresql-unavailable";
        }
      }
      return sendJson(res, ready ? 200 : 503, {
        ok: ready,
        service: "maw3ed-api",
        database,
        ready,
        liveness: true,
        uptimeMs: Date.now() - startTime
      });
    }
    if (requested === "/api/health/live" && req.method === "GET") {
      return sendJson(res, 200, { ok: true, service: "maw3ed-api", liveness: true, uptimeMs: Date.now() - startTime });
    }
    if (requested === "/api/health/ready" && req.method === "GET") {
      if (databaseConfigured) {
        try {
          await query("SELECT 1");
          return sendJson(res, 200, { ok: true, service: "maw3ed-api", ready: true, database: "postgresql" });
        } catch (error) {
          return sendJson(res, 503, { ok: false, service: "maw3ed-api", ready: false, database: "postgresql-unavailable", error: "database_unavailable" });
        }
      }
      return sendJson(res, 200, { ok: true, service: "maw3ed-api", ready: true, database: "local-memory" });
    }
    if (requested === "/api/activity-templates" && req.method === "GET") {
      const localTemplates = [
        { activity_type: "medical", display_name: "مركز طبي", description: "عيادات ومستشفيات" },
        { activity_type: "clinic", display_name: "عيادة", description: "عيادات تخصصية" },
        { activity_type: "dentist", display_name: "طبيب أسنان", description: "عيادات أسنان" },
        { activity_type: "salon", display_name: "صالون الشعر", description: "قص وتصفيف" },
        { activity_type: "barber", display_name: "صالون الحلاقة", description: "حلاقة رجالية" },
        { activity_type: "beauty", display_name: "التجميل", description: "مراكز تجميل" },
        { activity_type: "massage", display_name: "تدليك", description: "مساج" },
        { activity_type: "spa", display_name: "منتجع صحي", description: "سبا" },
        { activity_type: "consultant", display_name: "استشاري", description: "استشارات" },
        { activity_type: "education", display_name: "مركز تعليمي", description: "تدريب ودروس" },
        { activity_type: "school", display_name: "مدرسة", description: "تعليم" },
        { activity_type: "fitness", display_name: "مركز رياضي", description: "جيم وحصص" },
        { activity_type: "carwash", display_name: "غسيل سيارة", description: "غسيل سيارات" },
        { activity_type: "events", display_name: "تنظيم الأحداث", description: "فعاليات" },
        { activity_type: "pets", display_name: "رعاية حيوانات أليفة", description: "حيوانات أليفة" },
        { activity_type: "billiards", display_name: "صالة بلياردو", description: "طاولات" },
        { activity_type: "other", display_name: "صناعة مخصصة", description: "نشاط مرن" }
      ];
      if (!databaseConfigured) {
        return sendJson(res, 200, { ok: true, templates: localTemplates });
      }
      const result = await query("SELECT activity_type, display_name, description, labels, defaults FROM activity_templates ORDER BY display_name");
      return sendJson(res, 200, { ok: true, templates: result.rows.length ? result.rows : localTemplates });
    }
    if (requested === "/api/workspace-profile" && req.method === "GET") {
      if (authRequiredForRequest()) await requireAppUser(req);
      const orgId = await getRequestOrganizationId(req, requestUrl);
      return sendJson(res, 200, { ok: true, profile: databaseConfigured ? await getOrganizationProfile(orgId) : { id: organizationId, name: localData.organization?.name || "مستشفى الشفاء", activityType: "medical", locale: "ar", currency: "egp", timezone: "Africa/Cairo", labels: { customer: "المرضى", staff: "الأطباء", department: "الأقسام والعيادات", service: "الخدمات", appointment: "المواعيد" } } });
    }
    if (requested === "/api/workspace-profile" && req.method === "PATCH") {
      if (authRequiredForRequest()) await requireAppUser(req);
      return sendJson(res, 200, { ok: true, profile: await updateOrganizationProfile(req, requestUrl, await parseJsonBody(req)) });
    }
    if (requested === "/api/dashboard" && req.method === "GET") {
      if (authRequiredForRequest()) await requireAppUser(req);
      const orgId = await getRequestOrganizationId(req, requestUrl);
      return sendJson(res, 200, await dashboardData(requestUrl.searchParams.get("date") || "2025-05-14", orgId));
    }
    if (requested === "/api/departments" && req.method === "GET") {
      if (authRequiredForRequest()) await requireAppUser(req);
      if (!databaseConfigured) return sendJson(res, 200, { ok: true, departments: localData.departments });
      const orgId = await getRequestOrganizationId(req, requestUrl);
      const result = await query("SELECT id, name, default_service FROM departments WHERE organization_id = $1 AND active = true ORDER BY name", [orgId]);
      return sendJson(res, 200, { ok: true, departments: result.rows });
    }
    if (requested === "/api/doctors" && req.method === "GET") {
      if (authRequiredForRequest()) await requireAppUser(req);
      if (!databaseConfigured) return sendJson(res, 200, { ok: true, doctors: localData.doctors });
      const orgId = await getRequestOrganizationId(req, requestUrl);
      const result = await query("SELECT id, name, specialty FROM doctors WHERE organization_id = $1 AND active = true ORDER BY name", [orgId]);
      return sendJson(res, 200, { ok: true, doctors: result.rows });
    }
    if (requested === "/api/patients" && req.method === "GET") {
      if (authRequiredForRequest()) await requireAppUser(req);
      if (!databaseConfigured) return sendJson(res, 200, { ok: true, patients: localData.patients });
      const orgId = await getRequestOrganizationId(req, requestUrl);
      const result = await query(`SELECT id, name, email, TO_CHAR(joined_at, 'YYYY-MM-DD') AS "joinedAt",
        last_visit AS "lastVisit" FROM patients WHERE organization_id = $1 ORDER BY created_at DESC`, [orgId]);
      return sendJson(res, 200, { ok: true, patients: result.rows });
    }
    if (requested === "/api/appointments" && req.method === "GET") {
      if (authRequiredForRequest()) await requireAppUser(req);
      if (!databaseConfigured) {
        const date = requestUrl.searchParams.get("date");
        return sendJson(res, 200, { ok: true, appointments: localData.appointments.filter((appointment) => !date || appointment.date === date) });
      }
      const date = requestUrl.searchParams.get("date");
      const orgId = await getRequestOrganizationId(req, requestUrl);
      const result = await query(
        `SELECT a.id, a.appointment_date, TO_CHAR(a.appointment_time, 'HH24:MI') AS appointment_time,
                a.patient_id, p.name AS patient_name, a.department_id, d.name AS department_name,
                a.doctor_id, dr.name AS doctor_name, a.service_name, a.status
         FROM appointments a JOIN patients p ON p.id = a.patient_id
         JOIN departments d ON d.id = a.department_id JOIN doctors dr ON dr.id = a.doctor_id
         WHERE a.organization_id = $1 AND ($2::date IS NULL OR a.appointment_date = $2::date)
         ORDER BY a.appointment_date, a.appointment_time`,
        [orgId, date || null]
      );
      return sendJson(res, 200, { ok: true, appointments: result.rows.map(toAppointment) });
    }
    if (requested === "/api/appointments" && req.method === "POST") {
      if (authRequiredForRequest()) await requireAppUser(req);
      const orgId = await getRequestOrganizationId(req, requestUrl);
      const appointment = await handleAppointmentCreate(await parseJsonBody(req), orgId);
      return sendJson(res, 201, { ok: true, appointment });
    }
    if (requested === "/api/auth/request-verification" && req.method === "POST") {
      return sendJson(res, 200, await requestVerification(await parseJsonBody(req)));
    }
    if (requested === "/api/auth/verify-email" && req.method === "POST") {
      return sendJson(res, 200, await verifyEmail(await parseJsonBody(req)));
    }
    if (requested === "/api/development-events" && req.method === "POST") {
      if (process.env.MAW3ED_ENV !== "local") {
        return sendJson(res, 404, { ok: false, error: "Not found" });
      }
      if (process.env.MAW3ED_ENV === "production" || process.env.MAW3ED_REQUIRE_AUTH === "1") {
        await requireAppUser(req);
      }
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
      if (process.env.MAW3ED_ENV !== "local") {
        return sendJson(res, 404, { ok: false, error: "Not found" });
      }
      if (process.env.MAW3ED_ENV === "production" || process.env.MAW3ED_REQUIRE_AUTH === "1") {
        await requireAppUser(req);
      }
      return sendJson(res, 200, { ok: true, events: await readEventLog(Math.min(Math.max(Number(requestUrl.searchParams.get("limit")) || 50, 1), 200)) });
    }

    const opsHandled = await tryHandleOpsApi({
      requested,
      req,
      res,
      requestUrl,
      sendJson,
      parseJsonBody,
      localData,
      requireAppUser,
      getUserWorkspace,
      databaseConfigured
    });
    if (opsHandled) return;

    if (requested.startsWith("/data/uploads/")) {
      let uploadPath = path.resolve(root, `.${requested}`);
      const workspaceUploadMatch = requested.match(/^\/data\/uploads\/workspaces\/([^/]+)\/([^/]+)$/);
      if (workspaceUploadMatch) {
        uploadPath = path.resolve(
          root,
          "data",
          "workspaces",
          workspaceUploadMatch[1],
          "uploads",
          workspaceUploadMatch[2]
        );
      }
      const uploadsRoot = path.resolve(root, "data", "uploads");
      const workspacesRoot = path.resolve(root, "data", "workspaces");
      const allowed =
        uploadPath.startsWith(uploadsRoot + path.sep) ||
        uploadPath === uploadsRoot ||
        (uploadPath.startsWith(workspacesRoot + path.sep) && uploadPath.includes(`${path.sep}uploads${path.sep}`));
      if (!allowed) {
        res.writeHead(403, securityHeaders({ "Content-Type": "text/plain; charset=utf-8" }));
        return res.end("Forbidden");
      }
      return fs.readFile(uploadPath, (error, data) => {
        if (error) {
          res.writeHead(404, securityHeaders({ "Content-Type": "text/plain; charset=utf-8" }));
          return res.end("Not found");
        }
        res.writeHead(200, securityHeaders({
          "Content-Type": types[path.extname(uploadPath)] || "application/octet-stream",
          "Cache-Control": "public, max-age=86400"
        }));
        return res.end(data);
      });
    }

    const distRoot = path.join(root, "dist");
    const hasReactDist = fs.existsSync(path.join(distRoot, "index.html"));
    const staticRoot = hasReactDist ? distRoot : root;
    let relative = requested === "/" ? "/index.html" : requested;
    let filePath = path.resolve(staticRoot, `.${relative}`);
    if (!filePath.startsWith(staticRoot)) return res.end("Forbidden");

    // React SPA: unknown extensionless routes fall back to dist/index.html
    if (hasReactDist && !fs.existsSync(filePath) && !path.extname(relative) && !relative.startsWith("/api/")) {
      relative = "/index.html";
      filePath = path.join(distRoot, "index.html");
    }

    fs.readFile(filePath, (error, data) => {
      if (error) {
        if (hasReactDist && error.code === "ENOENT" && !path.extname(requested)) {
          return fs.readFile(path.join(distRoot, "index.html"), (spaError, spaData) => {
            if (spaError) {
              res.writeHead(404, securityHeaders({ "Content-Type": "text/plain; charset=utf-8" }));
              return res.end("Not found");
            }
            res.writeHead(200, securityHeaders({
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "no-store",
              "X-Maw3ed-UI": "react"
            }));
            return res.end(spaData);
          });
        }
        res.writeHead(error.code === "ENOENT" ? 404 : 500, securityHeaders({ "Content-Type": "text/plain; charset=utf-8" }));
        return res.end(error.code === "ENOENT" ? "Not found" : "Server error");
      }
      const isHashedAsset = hasReactDist && /[-_][A-Za-z0-9_-]{8,}\.(?:js|css|svg|png|jpg|webp)$/.test(path.basename(filePath));
      const headers = securityHeaders({
        "Content-Type": types[path.extname(filePath)] || "application/octet-stream",
        "Cache-Control": isHashedAsset ? "public, max-age=31536000, immutable" : "no-store"
      });
      if (hasReactDist && path.basename(filePath) === "index.html") headers["X-Maw3ed-UI"] = "react";
      res.writeHead(200, headers);
      res.end(data);
    });
  } catch (error) {
    const status = error.statusCode || 500;
    sendJson(res, status, {
      ok: false,
      error: error.message || "Internal server error",
      ...(error.code ? { code: error.code } : {}),
      ...(error.suggestedSlug ? { suggestedSlug: error.suggestedSlug } : {}),
      ...(error.conflictingAppointmentId ? { conflictingAppointmentId: error.conflictingAppointmentId } : {})
    });
  }
});

server.listen(port, "0.0.0.0", () => {
  const ui = fs.existsSync(path.join(root, "dist", "index.html")) ? "react-dist" : "dev-fallback";
  console.log(`Maw3ed React dashboard on port ${port} (${ui})`);
  console.log(`Environment: ${process.env.MAW3ED_ENV || "local"} · storage=${process.env.MAW3ED_STORAGE || "local"}`);
  console.log("Side-by-side ports: web/API 7000, Vite 7100, Postgres 5433/maw3ed");
});
