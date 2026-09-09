const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = 5000;
const eventsFile = path.join(root, "data", "development-events.jsonl");
const dataFile = path.join(root, "data", "maw3ed-data.json");
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

function readAppData() {
  return JSON.parse(fs.readFileSync(dataFile, "utf8"));
}

function writeAppData(data) {
  const temporaryFile = `${dataFile}.tmp`;
  fs.writeFileSync(temporaryFile, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  fs.renameSync(temporaryFile, dataFile);
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function readRequestBody(req, limit = 8 * 1024) {
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

function appendDevelopmentEvent(event, details = {}) {
  const record = {
    timestamp: new Date().toISOString(),
    event,
    details,
    source: "web-prototype"
  };
  const current = fs.existsSync(eventsFile) ? fs.readFileSync(eventsFile, "utf8") : "";
  const separator = current.length > 0 && !current.endsWith("\n") ? "\n" : "";
  fs.appendFileSync(eventsFile, `${separator}${JSON.stringify(record)}\n`, "utf8");
  return record;
}

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseJsonBody(req) {
  return readRequestBody(req).then((body) => JSON.parse(body || "{}"));
}

const server = http.createServer((req, res) => {
  const requested = decodeURIComponent(req.url.split("?")[0]);

  if (requested === "/api/health" && req.method === "GET") {
    return sendJson(res, 200, { ok: true, service: "maw3ed-api" });
  }

  if (requested === "/api/dashboard" && req.method === "GET") {
    try {
      const data = readAppData();
      const date = new URL(req.url, "http://localhost").searchParams.get("date") || "2025-05-14";
      const appointments = data.appointments.filter((appointment) => appointment.date === date);
      const newPatients = data.patients.filter((patient) => patient.joinedAt === date).length;
      return sendJson(res, 200, {
        ok: true,
        date,
        stats: {
          appointmentsToday: appointments.length,
          newPatients: data.stats.newPatients ?? newPatients,
          completedExams: data.stats.completedExams,
          attendanceRate: data.stats.attendanceRate
        },
        appointments,
        departments: data.departments,
        doctors: data.doctors
      });
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: "Unable to read dashboard data" });
    }
  }

  if (requested === "/api/departments" && req.method === "GET") {
    try {
      return sendJson(res, 200, { ok: true, departments: readAppData().departments });
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: "Unable to read departments" });
    }
  }

  if (requested === "/api/doctors" && req.method === "GET") {
    try {
      return sendJson(res, 200, { ok: true, doctors: readAppData().doctors });
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: "Unable to read doctors" });
    }
  }

  if (requested === "/api/patients" && req.method === "GET") {
    try {
      return sendJson(res, 200, { ok: true, patients: readAppData().patients });
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: "Unable to read patients" });
    }
  }

  if (requested === "/api/appointments" && req.method === "GET") {
    try {
      const date = new URL(req.url, "http://localhost").searchParams.get("date");
      const appointments = readAppData().appointments.filter((appointment) => !date || appointment.date === date);
      return sendJson(res, 200, { ok: true, appointments });
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: "Unable to read appointments" });
    }
  }

  if (requested === "/api/appointments" && req.method === "POST") {
    parseJsonBody(req)
      .then((payload) => {
        const patientName = typeof payload.patientName === "string" ? payload.patientName.trim() : "";
        const date = typeof payload.date === "string" ? payload.date : "";
        const time = typeof payload.time === "string" ? payload.time : "";
        const doctorId = typeof payload.doctorId === "string" ? payload.doctorId : "";
        const departmentId = typeof payload.departmentId === "string" ? payload.departmentId : "";
        if (!patientName || !date || !time || !doctorId || !departmentId) {
          return sendJson(res, 400, { ok: false, error: "Patient, date, time, doctor and department are required" });
        }

        const data = readAppData();
        const doctor = data.doctors.find((item) => item.id === doctorId);
        const department = data.departments.find((item) => item.id === departmentId);
        if (!doctor || !department) {
          return sendJson(res, 400, { ok: false, error: "Doctor or department was not found" });
        }

        const collision = data.appointments.find((appointment) =>
          appointment.date === date &&
          appointment.time === time &&
          (appointment.doctorId === doctorId || appointment.departmentId === departmentId) &&
          appointment.status !== "cancelled"
        );
        if (collision) {
          return sendJson(res, 409, {
            ok: false,
            error: "This doctor or department is already booked at that time",
            conflictingAppointmentId: collision.id
          });
        }

        let patient = data.patients.find((item) => item.name === patientName);
        if (!patient) {
          patient = { id: createId("patient"), name: patientName, joinedAt: date, lastVisit: "موعد أول" };
          data.patients.unshift(patient);
          data.stats.newPatients = (data.stats.newPatients || 0) + 1;
        }

        const appointment = {
          id: createId("appointment"),
          date,
          time,
          period: Number(time.split(":")[0]) >= 12 ? "مساءً" : "صباحاً",
          patientId: patient.id,
          patientName: patient.name,
          departmentId,
          departmentName: department.name,
          doctorId,
          doctorName: doctor.name,
          serviceName: department.defaultService,
          status: "pending"
        };
        data.appointments.push(appointment);
        writeAppData(data);
        return sendJson(res, 201, { ok: true, appointment });
      })
      .catch((error) => sendJson(res, 400, { ok: false, error: error.message }));
    return;
  }

  if (requested === "/api/development-events" && req.method === "POST") {
    readRequestBody(req)
      .then((body) => {
        const payload = JSON.parse(body || "{}");
        const event = typeof payload.event === "string" ? payload.event.trim() : "";
        if (!/^[a-z0-9_.-]{1,80}$/.test(event)) {
          return sendJson(res, 400, { ok: false, error: "Invalid event name" });
        }
        const details = payload.details && typeof payload.details === "object" ? payload.details : {};
        const safeDetails = JSON.parse(JSON.stringify(details).slice(0, 2000));
        const record = appendDevelopmentEvent(event, safeDetails);
        return sendJson(res, 201, { ok: true, timestamp: record.timestamp });
      })
      .catch((error) => sendJson(res, 400, { ok: false, error: error.message }));
    return;
  }

  if (requested === "/api/development-events" && req.method === "GET") {
    try {
      const limit = Math.min(Math.max(Number(new URL(req.url, "http://localhost").searchParams.get("limit")) || 50, 1), 200);
      const lines = fs.existsSync(eventsFile)
        ? fs.readFileSync(eventsFile, "utf8").trim().split("\n").filter(Boolean).slice(-limit)
        : [];
      return sendJson(res, 200, { ok: true, events: lines.map((line) => JSON.parse(line)) });
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: "Unable to read event log" });
    }
  }

  const relative = requested === "/" ? "/index.html" : requested;
  const filePath = path.join(root, relative);

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(error.code === "ENOENT" ? 404 : 500, {
        "Content-Type": "text/plain; charset=utf-8"
      });
      return res.end(error.code === "ENOENT" ? "Not found" : "Server error");
    }
    res.writeHead(200, {
      "Content-Type": types[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(data);
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Maw3ed dashboard running on port ${port}`);
});