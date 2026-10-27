#!/usr/bin/env node
/**
 * Phase 4 — light PG round-trip for capacity tables (migration 014+).
 * Skips cleanly without DATABASE_URL.
 */
function postgresReady() {
  return (
    process.env.MAW3ED_STORAGE === "postgres" &&
    Boolean(process.env.DATABASE_URL) &&
    !String(process.env.DATABASE_URL).includes("CHANGE_ME")
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  if (!postgresReady()) {
    console.log(
      JSON.stringify({
        ok: true,
        suite: "smoke-capacity-pg",
        skipped: true,
        reason: "No live Postgres — JSON capacity covered by test:capacity-modes",
        ownerHint:
          "On Sam-PC: MAW3ED_STORAGE=postgres DATABASE_URL=postgresql://...@127.0.0.1:5432/maw3ed npm run test:capacity-pg"
      })
    );
    return;
  }

  const { Pool } = require("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const migrate = require("./migrate");
  const client = await pool.connect();
  try {
    const applied = await migrate.applyPendingMigrations(client);
    assert(
      (await client.query(
        "SELECT to_regclass('public.workspace_ops_resources') AS reg"
      )).rows[0].reg,
      "workspace_ops_resources must exist after migrate"
    );
    assert(
      (await client.query(
        "SELECT to_regclass('public.workspace_ops_session_occurrences') AS reg"
      )).rows[0].reg,
      "session_occurrences must exist"
    );
    const cols = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'workspace_ops_services'
         AND column_name IN ('occupancy_mode', 'default_capacity', 'composition_default')`
    );
    assert(cols.rows.length === 3, "services occupancy columns present");

    delete require.cache[require.resolve("../db")];
    delete require.cache[require.resolve("../workspaceOpsPg")];
    const workspaceOpsPg = require("../workspaceOpsPg");

    const workspaceId = `phase4-cap-${process.pid}`;
    const slug = `phase4-cap-${process.pid}`;
    const userId = `user-${workspaceId}`;
    await client.query(
      `INSERT INTO app_users (id, email, display_name, status)
       VALUES ($1, $2, $3, 'active') ON CONFLICT DO NOTHING`,
      [userId, `${workspaceId}@example.test`, "Phase4"]
    );
    await client.query(
      `INSERT INTO workspaces (id, owner_user_id, name, slug, status)
       VALUES ($1, $2, $3, $4, 'active') ON CONFLICT DO NOTHING`,
      [workspaceId, userId, "Phase4 Cap", slug]
    );

    const store = {
      customerCategories: [{ id: "cat-new", name: "جديد" }],
      customers: [{ id: "c1", firstName: "طالب", lastName: "أ", categoryId: "cat-new" }],
      staff: [{ id: "s1", name: "مدرس", active: true }],
      serviceCategories: [{ id: "sc1", name: "عام", sort: 0, enabled: true }],
      services: [
        {
          id: "svc1",
          categoryId: "sc1",
          name: "جلسة",
          durationMinutes: 60,
          occupancyMode: "session_capacity",
          defaultCapacity: 10,
          providerIds: ["s1"],
          publicBooking: false,
          active: true
        }
      ],
      workingHours: [],
      closedDays: [],
      specificDays: [],
      expenses: [],
      appointments: [],
      resources: [
        {
          id: "r1",
          name: "قاعة",
          resourceType: "room",
          capacity: 10,
          unit: "seat",
          status: "active"
        }
      ],
      serviceResourceRequirements: [
        { id: "srr1", serviceId: "svc1", resourceId: "r1", quantity: 1, required: true }
      ],
      sessionSeries: [],
      sessionOccurrences: [
        {
          id: "occ1",
          serviceId: "svc1",
          staffId: "s1",
          resourceId: "r1",
          startsAt: "2099-10-01T10:00:00.000Z",
          endsAt: "2099-10-01T11:00:00.000Z",
          capacity: 10,
          status: "scheduled",
          title: "حصة"
        }
      ],
      sessionEnrollments: [
        {
          id: "enr1",
          occurrenceId: "occ1",
          customerId: "c1",
          seats: 1,
          status: "confirmed",
          idempotencyKey: "pg-enr-1"
        }
      ],
      attendanceRecords: [],
      resourceAllocations: [],
      bookingPage: { slug, businessName: "Phase4", timezone: "Africa/Cairo", onlineBookingEnabled: true },
      calendarPreferences: {},
      notifications: {},
      activityMode: "medical",
      activityTemplateId: "medical",
      planKey: "pro"
    };

    await workspaceOpsPg.saveStore(client, workspaceId, store);
    const empty = () => ({
      customerCategories: [],
      customers: [],
      staff: [],
      serviceCategories: [],
      services: [],
      workingHours: [],
      closedDays: [],
      specificDays: [],
      expenses: [],
      appointments: [],
      resources: [],
      serviceResourceRequirements: [],
      sessionSeries: [],
      sessionOccurrences: [],
      sessionEnrollments: [],
      attendanceRecords: [],
      resourceAllocations: [],
      bookingPage: {},
      calendarPreferences: {},
      notifications: {}
    });
    const loaded = await workspaceOpsPg.loadStore(client, workspaceId, empty);
    assert(loaded.resources.length === 1, "resources round-trip");
    assert(loaded.sessionOccurrences.length === 1, "occurrences round-trip");
    assert(loaded.sessionEnrollments[0]?.idempotencyKey === "pg-enr-1", "enrollment key round-trip");
    assert(loaded.services[0]?.occupancyMode === "session_capacity", "occupancy_mode round-trip");

    await client.query("DELETE FROM workspace_ops_profiles WHERE workspace_id = $1", [workspaceId]);
    await client.query("DELETE FROM workspaces WHERE id = $1", [workspaceId]);
    await client.query("DELETE FROM app_users WHERE id = $1", [userId]);

    console.log(
      JSON.stringify({
        ok: true,
        suite: "smoke-capacity-pg",
        skipped: false,
        applied: applied.applied,
        checks: ["migrate-014", "resources-roundtrip", "session-enrollment-roundtrip"]
      })
    );
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(
      JSON.stringify({
        ok: false,
        suite: "smoke-capacity-pg",
        error: String(error.message || error),
        stack: error.stack
      })
    );
    process.exit(1);
  });
}
