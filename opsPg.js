const { pool, databaseConfigured } = require("./db");

const DEFAULT_ORG_ID = "org-maw3ed";

function toMinutes(hhmm) {
  const [hours, minutes] = String(hhmm || "00:00").split(":").map(Number);
  return hours * 60 + minutes;
}

function isOpsPgEnabled() {
  return Boolean(databaseConfigured && pool);
}

async function resolveOrganizationId(slug) {
  if (!isOpsPgEnabled()) return null;
  const bySlug = await pool.query(
    `SELECT organization_id AS id FROM booking_pages WHERE slug = $1 LIMIT 1`,
    [String(slug || "")]
  );
  if (bySlug.rows[0]?.id) return bySlug.rows[0].id;

  const org = await pool.query(
    `SELECT id FROM organizations WHERE id = $1 OR slug = $2 LIMIT 1`,
    [DEFAULT_ORG_ID, String(slug || "")]
  );
  if (org.rows[0]?.id) return org.rows[0].id;

  await pool.query(
    `INSERT INTO organizations (id, name, slug, website, owner_company)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO NOTHING`,
    [DEFAULT_ORG_ID, "موعد", String(slug || "maw3ed"), "https://upnexa-eg.com", "UpNexa-eg.com"]
  );
  await pool.query(
    `INSERT INTO booking_pages (organization_id, slug, description)
     VALUES ($1, $2, $3)
     ON CONFLICT (organization_id) DO UPDATE SET slug = EXCLUDED.slug, updated_at = NOW()`,
    [DEFAULT_ORG_ID, String(slug || "maw3ed-demo"), "صفحة الحجز العامة"]
  );
  return DEFAULT_ORG_ID;
}

async function ensureDepartment(client, orgId, service) {
  const departmentId = String(service?.categoryId || "dept-outpatient");
  const name = String(service?.categoryName || service?.name || "العيادات الخارجية");
  await client.query(
    `INSERT INTO departments (id, organization_id, name, default_service)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, default_service = EXCLUDED.default_service, active = true`,
    [departmentId, orgId, name, String(service?.name || "موعد")]
  );
  return departmentId;
}

async function ensureDoctor(client, orgId, staff) {
  const doctorId = String(staff.id);
  await client.query(
    `INSERT INTO doctors (id, organization_id, name, specialty, active)
     VALUES ($1, $2, $3, $4, true)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, specialty = EXCLUDED.specialty, active = true`,
    [doctorId, orgId, String(staff.name || "موظف"), String(staff.title || "Staff")]
  );
  return doctorId;
}

async function ensureService(client, orgId, service, departmentId) {
  if (!service?.id) return null;
  const categoryId = `category-${departmentId}`;
  const name = String(service.name || "موعد");
  await client.query(
    `INSERT INTO service_categories (id, organization_id, name)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
    [categoryId, orgId, String(service.categoryName || departmentId)]
  );

  // Unique index is (organization_id, LOWER(name)). Prefer updating an existing
  // same-name row so renamed template ids do not collide with older seeds.
  const existingByName = await client.query(
    `SELECT id FROM services
     WHERE organization_id = $1 AND LOWER(name) = LOWER($2)
     LIMIT 1`,
    [orgId, name]
  );
  const serviceId = existingByName.rows[0]?.id || String(service.id);

  await client.query(
    `INSERT INTO services
      (id, organization_id, category_id, name, duration_minutes, buffer_minutes, pricing_type, price, auto_confirm, auto_complete, public_booking, active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, true)
     ON CONFLICT (id) DO UPDATE SET
       category_id = EXCLUDED.category_id,
       name = EXCLUDED.name,
       duration_minutes = EXCLUDED.duration_minutes,
       buffer_minutes = EXCLUDED.buffer_minutes,
       pricing_type = EXCLUDED.pricing_type,
       price = EXCLUDED.price,
       auto_confirm = EXCLUDED.auto_confirm,
       auto_complete = EXCLUDED.auto_complete,
       public_booking = true,
       active = true`,
    [
      serviceId,
      orgId,
      categoryId,
      name,
      Number(service.durationMinutes || 30),
      Number(service.bufferMinutes || 0),
      String(service.pricingType || "fixed"),
      Number(service.price || 0),
      Boolean(service.autoAccept),
      Boolean(service.autoComplete)
    ]
  );
  return serviceId;
}

/**
 * Returns blocked [startMin, endMin] ranges for a staff member on a date from Postgres.
 */
async function listPgBlockedRanges({ slug, staffId, date, durationFallback = 30 }) {
  if (!isOpsPgEnabled()) return [];
  const orgId = await resolveOrganizationId(slug);
  if (!orgId) return [];
  const result = await pool.query(
    `SELECT TO_CHAR(a.appointment_time, 'HH24:MI') AS time,
            COALESCE(s.duration_minutes, $4) AS duration_minutes,
            COALESCE(s.buffer_minutes, 0) AS buffer_minutes
     FROM appointments a
     LEFT JOIN services s ON s.id = a.service_id
     WHERE a.organization_id = $1
       AND a.doctor_id = $2
       AND a.appointment_date = $3
       AND a.status <> 'cancelled'`,
    [orgId, String(staffId), String(date), Number(durationFallback)]
  );
  return result.rows.map((row) => {
    const start = toMinutes(row.time);
    const block = Number(row.duration_minutes || durationFallback) + Number(row.buffer_minutes || 0);
    return [start, start + block];
  });
}

async function persistPublicAppointment({
  slug,
  appointment,
  service,
  staff,
  phone = "",
  email = "",
  categoryName = ""
}) {
  if (!isOpsPgEnabled()) return { skipped: true };
  const orgId = await resolveOrganizationId(slug);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const departmentId = await ensureDepartment(client, orgId, {
      ...service,
      categoryName: categoryName || service?.categoryId
    });
    const doctorId = await ensureDoctor(client, orgId, staff);
    const serviceId = await ensureService(client, orgId, service, departmentId);

    let patient = null;
    const normalizedPhone = String(phone || "").replace(/\s+/g, "");
    if (normalizedPhone) {
      patient = (
        await client.query(
          `SELECT id, name FROM patients
           WHERE organization_id = $1 AND REPLACE(COALESCE(phone, ''), ' ', '') = $2
           LIMIT 1`,
          [orgId, normalizedPhone]
        )
      ).rows[0];
    }
    if (!patient) {
      patient = (
        await client.query(
          `SELECT id, name FROM patients
           WHERE organization_id = $1 AND LOWER(name) = LOWER($2)
           LIMIT 1`,
          [orgId, appointment.customerName]
        )
      ).rows[0];
    }
    if (!patient) {
      patient = (
        await client.query(
          `INSERT INTO patients (id, organization_id, name, email, phone, joined_at, last_visit)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, name`,
          [
            appointment.customerId || `patient-${Date.now()}`,
            orgId,
            appointment.customerName,
            email || null,
            phone || null,
            appointment.date,
            "موعد أول"
          ]
        )
      ).rows[0];
    } else {
      await client.query(
        `UPDATE patients
         SET email = COALESCE(NULLIF($2, ''), email),
             phone = COALESCE(NULLIF($3, ''), phone),
             last_visit = $4
         WHERE id = $1`,
        [patient.id, email, phone, appointment.date]
      );
    }

    const collision = await client.query(
      `SELECT id FROM appointments
       WHERE organization_id = $1 AND appointment_date = $2 AND appointment_time = $3
         AND status <> 'cancelled' AND doctor_id = $4
       FOR UPDATE`,
      [orgId, appointment.date, appointment.time, doctorId]
    );
    if (collision.rows[0]) {
      const error = new Error("هذا الموظف محجوز في نفس الوقت");
      error.statusCode = 409;
      throw error;
    }

    await client.query(
      `INSERT INTO appointments
        (id, organization_id, appointment_date, appointment_time, patient_id, department_id, doctor_id,
         service_id, service_name, status, payment_method, payment_status, amount, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (id) DO UPDATE SET
         appointment_date = EXCLUDED.appointment_date,
         appointment_time = EXCLUDED.appointment_time,
         patient_id = EXCLUDED.patient_id,
         department_id = EXCLUDED.department_id,
         doctor_id = EXCLUDED.doctor_id,
         service_id = EXCLUDED.service_id,
         service_name = EXCLUDED.service_name,
         status = EXCLUDED.status,
         payment_method = EXCLUDED.payment_method,
         payment_status = EXCLUDED.payment_status,
         amount = EXCLUDED.amount,
         notes = EXCLUDED.notes,
         updated_at = NOW()`,
      [
        appointment.id,
        orgId,
        appointment.date,
        appointment.time,
        patient.id,
        departmentId,
        doctorId,
        serviceId,
        appointment.serviceName || "موعد",
        appointment.status || "pending",
        appointment.paymentMethod || "cash",
        appointment.paymentStatus || "unpaid",
        Number(appointment.amount || 0),
        appointment.notes || null
      ]
    );

    await client.query("COMMIT");
    return { ok: true, organizationId: orgId, patientId: patient.id };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function buildSlotHoldKey({ organizationId, staffId, date, time }) {
  return `${String(organizationId || "unknown")}::${String(staffId || "any")}::${String(date)}::${String(time)}`;
}

async function listPgHoldRanges({ slug, staffId, date, blockMinutes }) {
  if (!isOpsPgEnabled()) return [];
  await pool.query(`
    CREATE TABLE IF NOT EXISTS slot_holds (
      hold_key TEXT PRIMARY KEY,
      organization_id TEXT,
      staff_id TEXT NOT NULL,
      hold_date DATE NOT NULL,
      hold_time TIME NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL
    )
  `);
  await pool.query(`DELETE FROM slot_holds WHERE expires_at <= NOW()`);
  const orgId = await resolveOrganizationId(slug);
  const result = await pool.query(
    `SELECT TO_CHAR(hold_time, 'HH24:MI') AS time
     FROM slot_holds
     WHERE organization_id = $1 AND staff_id = $2 AND hold_date = $3 AND expires_at > NOW()`,
    [orgId, String(staffId), String(date)]
  );
  return result.rows.map((row) => {
    const start = toMinutes(row.time);
    return [start, start + Number(blockMinutes || 30)];
  });
}

async function upsertSlotHold({ staffId, date, time, expiresAt, slug }) {
  if (!isOpsPgEnabled()) return { skipped: true };
  await pool.query(`
    CREATE TABLE IF NOT EXISTS slot_holds (
      hold_key TEXT PRIMARY KEY,
      organization_id TEXT,
      staff_id TEXT NOT NULL,
      hold_date DATE NOT NULL,
      hold_time TIME NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL
    )
  `);
  const orgId = await resolveOrganizationId(slug);
  const key = buildSlotHoldKey({ organizationId: orgId, staffId, date, time });
  await pool.query(
    `INSERT INTO slot_holds (hold_key, organization_id, staff_id, hold_date, hold_time, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (hold_key) DO UPDATE SET expires_at = EXCLUDED.expires_at, organization_id = EXCLUDED.organization_id`,
    [key, orgId, String(staffId), String(date), String(time), expiresAt]
  );
  return { ok: true, key };
}

/** Drop a soft hold so the booker is not blocked by their own row during confirm. */
async function releaseSlotHold({ staffId, date, time, slug }) {
  if (!isOpsPgEnabled()) return { skipped: true };
  const orgId = slug ? await resolveOrganizationId(slug) : null;
  const key = orgId ? buildSlotHoldKey({ organizationId: orgId, staffId, date, time }) : `${String(staffId || "any")}::${String(date)}::${String(time)}`;
  await pool.query(`DELETE FROM slot_holds WHERE hold_key = $1`, [key]);
  if (orgId) {
    await pool.query(
      `DELETE FROM slot_holds WHERE organization_id = $1 AND staff_id = $2 AND hold_date = $3 AND TO_CHAR(hold_time, 'HH24:MI') = $4`,
      [orgId, String(staffId), String(date), String(time)]
    );
  } else if (staffId && staffId !== "any") {
    await pool.query(
      `DELETE FROM slot_holds WHERE staff_id = $1 AND hold_date = $2 AND TO_CHAR(hold_time, 'HH24:MI') = $3`,
      [String(staffId), String(date), String(time)]
    );
  } else {
    await pool.query(
      `DELETE FROM slot_holds WHERE hold_date = $1 AND TO_CHAR(hold_time, 'HH24:MI') = $2`,
      [String(date), String(time)]
    );
  }
  return { ok: true, key };
}

module.exports = {
  isOpsPgEnabled,
  resolveOrganizationId,
  listPgBlockedRanges,
  listPgHoldRanges,
  upsertSlotHold,
  releaseSlotHold,
  persistPublicAppointment,
  DEFAULT_ORG_ID
};
