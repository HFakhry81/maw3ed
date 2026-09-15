const fs = require("fs");
const path = require("path");
const { loaded } = require("./load-env");
const { pool } = require("../db");

const organizationId = "org-maw3ed";
const dataPath = path.join(__dirname, "..", "data", "maw3ed-data.json");

async function main() {
  if (loaded.mode === "local" && process.env.MAW3ED_STORAGE !== "postgres") {
    console.log("[INFO] Local mode without Postgres — seed skipped.");
    process.exit(0);
  }
  if (!pool) {
    console.error("[ERROR] Database pool is not configured (set MAW3ED_STORAGE=postgres and DATABASE_URL).");
    process.exit(1);
  }
  if (!fs.existsSync(dataPath)) {
    console.error(`[ERROR] Data file not found: ${dataPath}`);
    process.exit(1);
  }

  const source = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  const client = await pool.connect();

  try {
    console.log("[INFO] Starting Maw3ed database seed...");
    await client.query("BEGIN");

    // Organization
    await client.query(
      `INSERT INTO organizations (id, name, slug, website, owner_company)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, website = EXCLUDED.website, owner_company = EXCLUDED.owner_company`,
      [organizationId, "مستشفى الشفاء", "al-shifa", "https://upnexa-eg.com", "UpNexa-eg.com"]
    );

    // Departments & Services
    for (const department of source.departments) {
      await client.query(
        `INSERT INTO departments (id, organization_id, name, default_service)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, default_service = EXCLUDED.default_service`,
        [department.id, organizationId, department.name, department.defaultService]
      );
      await client.query(
        `INSERT INTO service_categories (id, organization_id, name)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
        [`category-${department.id}`, organizationId, department.name]
      );
      await client.query(
        `INSERT INTO services
          (id, organization_id, category_id, name, duration_minutes, buffer_minutes, pricing_type, price, public_booking)
         VALUES ($1, $2, $3, $4, 30, 15, 'fixed', 0, true)
         ON CONFLICT (id) DO UPDATE SET category_id = EXCLUDED.category_id, name = EXCLUDED.name`,
        [`service-${department.id}`, organizationId, `category-${department.id}`, department.defaultService]
      );
    }

    // Doctors
    for (const doctor of source.doctors) {
      await client.query(
        `INSERT INTO doctors (id, organization_id, name, specialty)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, specialty = EXCLUDED.specialty`,
        [doctor.id, organizationId, doctor.name, doctor.specialty]
      );
    }

    // Patients
    for (const patient of source.patients) {
      await client.query(
        `INSERT INTO patients (id, organization_id, name, joined_at, last_visit)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, joined_at = EXCLUDED.joined_at, last_visit = EXCLUDED.last_visit`,
        [patient.id, organizationId, patient.name, patient.joinedAt, patient.lastVisit]
      );
    }

    // Customer Categories
    await client.query(
      `INSERT INTO customer_categories (id, organization_id, name, color)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, color = EXCLUDED.color`,
      ["customer-category-standard", organizationId, "عادي", "#2474df"]
    );
    await client.query(
      `UPDATE patients SET category_id = $1 WHERE organization_id = $2 AND category_id IS NULL`,
      ["customer-category-standard", organizationId]
    );

    // Appointments
    for (const appointment of source.appointments) {
      await client.query(
        `INSERT INTO appointments
          (id, organization_id, appointment_date, appointment_time, patient_id, department_id, doctor_id, service_id, service_name, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE SET appointment_date = EXCLUDED.appointment_date,
           appointment_time = EXCLUDED.appointment_time, patient_id = EXCLUDED.patient_id,
           department_id = EXCLUDED.department_id, doctor_id = EXCLUDED.doctor_id,
           service_id = EXCLUDED.service_id, service_name = EXCLUDED.service_name, status = EXCLUDED.status`,
        [appointment.id, organizationId, appointment.date, appointment.time, appointment.patientId, appointment.departmentId, appointment.doctorId, `service-${appointment.departmentId}`, appointment.serviceName, appointment.status]
      );
    }

    // Booking Pages
    await client.query(
      `INSERT INTO booking_pages (organization_id, slug, description, phone, email, address)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (organization_id) DO UPDATE SET description = EXCLUDED.description,
         phone = EXCLUDED.phone, email = EXCLUDED.email, address = EXCLUDED.address, updated_at = NOW()`,
      [organizationId, "al-shifa", "احجز موعدك بسهولة مع مستشفى الشفاء", null, null, null]
    );

    // Working Hours
    for (let weekday = 0; weekday <= 6; weekday += 1) {
      await client.query(
        `INSERT INTO working_hours (organization_id, weekday, opens_at, closes_at, is_closed)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (organization_id, weekday) DO UPDATE SET opens_at = EXCLUDED.opens_at,
           closes_at = EXCLUDED.closes_at, is_closed = EXCLUDED.is_closed`,
        [organizationId, weekday, "09:00", "17:00", weekday === 5]
      );
    }

    // Dashboard Metrics
    await client.query(
      `INSERT INTO dashboard_metrics (organization_id, completed_exams, attendance_rate)
       VALUES ($1, $2, $3)
       ON CONFLICT (organization_id) DO UPDATE SET completed_exams = EXCLUDED.completed_exams, attendance_rate = EXCLUDED.attendance_rate, updated_at = NOW()`,
      [organizationId, source.stats.completedExams, source.stats.attendanceRate]
    );

    await client.query("COMMIT");
    console.log(`[SUCCESS] Seed complete: ${source.departments.length} departments, ${source.doctors.length} doctors, ${source.patients.length} patients, ${source.appointments.length} appointments.`);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[ERROR] Seed process failed:", error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[FATAL ERROR]", err.message);
  process.exit(1);
});