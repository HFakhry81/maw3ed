const fs = require("fs");
const path = require("path");
const { pool } = require("../db");

const organizationId = "org-maw3ed";
const source = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "maw3ed-data.json"), "utf8"));

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO organizations (id, name, slug, website, owner_company)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, website = EXCLUDED.website, owner_company = EXCLUDED.owner_company`,
      [organizationId, "مستشفى الشفاء", "al-shifa", "https://upnexa-eg.com", "UpNexa-eg.com"]
    );
    for (const department of source.departments) {
      await client.query(
        `INSERT INTO departments (id, organization_id, name, default_service)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, default_service = EXCLUDED.default_service`,
        [department.id, organizationId, department.name, department.defaultService]
      );
    }
    for (const doctor of source.doctors) {
      await client.query(
        `INSERT INTO doctors (id, organization_id, name, specialty)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, specialty = EXCLUDED.specialty`,
        [doctor.id, organizationId, doctor.name, doctor.specialty]
      );
    }
    for (const patient of source.patients) {
      await client.query(
        `INSERT INTO patients (id, organization_id, name, joined_at, last_visit)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, joined_at = EXCLUDED.joined_at, last_visit = EXCLUDED.last_visit`,
        [patient.id, organizationId, patient.name, patient.joinedAt, patient.lastVisit]
      );
    }
    for (const appointment of source.appointments) {
      await client.query(
        `INSERT INTO appointments
          (id, organization_id, appointment_date, appointment_time, patient_id, department_id, doctor_id, service_name, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET appointment_date = EXCLUDED.appointment_date,
           appointment_time = EXCLUDED.appointment_time, patient_id = EXCLUDED.patient_id,
           department_id = EXCLUDED.department_id, doctor_id = EXCLUDED.doctor_id,
           service_name = EXCLUDED.service_name, status = EXCLUDED.status`,
        [appointment.id, organizationId, appointment.date, appointment.time, appointment.patientId, appointment.departmentId, appointment.doctorId, appointment.serviceName, appointment.status]
      );
    }
    await client.query(
      `INSERT INTO dashboard_metrics (organization_id, completed_exams, attendance_rate)
       VALUES ($1, $2, $3)
       ON CONFLICT (organization_id) DO UPDATE SET completed_exams = EXCLUDED.completed_exams, attendance_rate = EXCLUDED.attendance_rate, updated_at = NOW()`,
      [organizationId, source.stats.completedExams, source.stats.attendanceRate]
    );
    await client.query("COMMIT");
    console.log(`Maw3ed seed complete: ${source.departments.length} departments, ${source.doctors.length} doctors, ${source.patients.length} patients, ${source.appointments.length} appointments.`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});