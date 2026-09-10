const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { query, pool } = require("./db");
const { sendVerificationEmail } = require("./email");

const root = __dirname;
const port = 5000;
const organizationId = "org-maw3ed";
const eventsFile = path.join(root, "data", "development-events.jsonl");
const emailOutboxFile = path.join(root, "data", "email-outbox.jsonl");
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8"
};

fs.mkdirSync(path.dirname(eventsFile), { recursive: true });

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

async function requestVerification(payload) {
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const error = new Error("A valid email address is required");
    error.statusCode = 400;
    throw error;
  }
  const code = String(crypto.randomInt(100000, 1000000));
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
    if (requested === "/api/health" && req.method === "GET") {
      await query("SELECT 1");
      return sendJson(res, 200, { ok: true, service: "maw3ed-api", database: "postgresql" });
    }
    if (requested === "/api/dashboard" && req.method === "GET") {
      return sendJson(res, 200, await dashboardData(requestUrl.searchParams.get("date") || "2025-05-14"));
    }
    if (requested === "/api/departments" && req.method === "GET") {
      const result = await query("SELECT id, name, default_service FROM departments WHERE organization_id = $1 AND active = true ORDER BY name", [organizationId]);
      return sendJson(res, 200, { ok: true, departments: result.rows });
    }
    if (requested === "/api/doctors" && req.method === "GET") {
      const result = await query("SELECT id, name, specialty FROM doctors WHERE organization_id = $1 AND active = true ORDER BY name", [organizationId]);
      return sendJson(res, 200, { ok: true, doctors: result.rows });
    }
    if (requested === "/api/patients" && req.method === "GET") {
      const result = await query("SELECT id, name, email, joined_at AS \"joinedAt\", last_visit AS \"lastVisit\" FROM patients WHERE organization_id = $1 ORDER BY created_at DESC", [organizationId]);
      return sendJson(res, 200, { ok: true, patients: result.rows });
    }
    if (requested === "/api/appointments" && req.method === "GET") {
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

    const relative = requested === "/" ? "/index.html" : requested;
    const filePath = path.resolve(root, `.${relative}`);
    if (!filePath.startsWith(root)) return res.end("Forbidden");
    fs.readFile(filePath, (error, data) => {
      if (error) {
        res.writeHead(error.code === "ENOENT" ? 404 : 500, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end(error.code === "ENOENT" ? "Not found" : "Server error");
      }
      res.writeHead(200, { "Content-Type": types[path.extname(filePath)] || "application/octet-stream", "Cache-Control": "no-store" });
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