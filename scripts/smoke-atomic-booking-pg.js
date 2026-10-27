#!/usr/bin/env node
/**
 * Phase 3 — PostgreSQL parity for atomic booking contracts.
 *
 * Requires MAW3ED_STORAGE=postgres + DATABASE_URL. Without them: ok + skipped.
 *
 * Covers the same contracts as smoke-atomic-booking.js on a disposable
 * workspace_ops_* tenant under advisory-locked withWorkspaceAsync:
 * concurrent overlap, adjacent OK, idempotent retry, hold cancel frees once.
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

function settle(promise) {
  return promise.then(
    (value) => ({ ok: true, value }),
    (error) => ({ ok: false, error })
  );
}

async function ensureWorkspace(client, workspaceId, slug) {
  const userId = `user-${workspaceId}`;
  await client.query(
    `INSERT INTO app_users (id, email, display_name, status)
     VALUES ($1, $2, $3, 'active') ON CONFLICT (id) DO NOTHING`,
    [userId, `${workspaceId}@example.test`, "Phase3 PG"]
  );
  await client.query(
    `INSERT INTO workspaces (id, owner_user_id, name, slug, status)
     VALUES ($1, $2, $3, $4, 'active') ON CONFLICT (id) DO NOTHING`,
    [workspaceId, userId, `Phase3 ${workspaceId}`, slug]
  );
}

async function main() {
  const checks = [];

  if (!postgresReady()) {
    console.log(
      JSON.stringify({
        ok: true,
        suite: "smoke-atomic-booking-pg",
        skipped: true,
        reason:
          "No live Postgres (set MAW3ED_STORAGE=postgres and DATABASE_URL on 5432). JSON path covered by test:atomic-booking.",
        ownerHint:
          "On Sam-PC: MAW3ED_STORAGE=postgres DATABASE_URL=postgresql://...@127.0.0.1:5432/maw3ed npm run test:atomic-booking-pg"
      })
    );
    return;
  }

  // Ensure migrate 013 is applied when possible
  const { Pool } = require("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const migrate = require("./migrate");
  const migClient = await pool.connect();
  try {
    await migrate.applyPendingMigrations(migClient);
  } finally {
    migClient.release();
  }

  delete require.cache[require.resolve("../db")];
  delete require.cache[require.resolve("../workspaceOpsPg")];
  delete require.cache[require.resolve("../opsWorkspace")];
  delete require.cache[require.resolve("../opsStore")];
  delete require.cache[require.resolve("../opsPg")];

  const workspaceOpsPg = require("../workspaceOpsPg");
  const ops = require("../opsStore");
  const bookingAtomic = require("../bookingAtomic");

  const workspaceId = `phase3-pg-${process.pid}`;
  const slug = `phase3-pg-${process.pid}`;
  const date = "2099-08-11"; // Monday

  const seedClient = await pool.connect();
  try {
    await ensureWorkspace(seedClient, workspaceId, slug);
    const empty = () => ({
      customerCategories: [{ id: "cat-new", name: "جديد", color: "#16ae7c" }],
      customers: [],
      staff: [{ id: "staff-1", name: "مقدم", active: true }],
      serviceCategories: [{ id: "svc-cat-1", name: "عام", sort: 0, enabled: true, active: true }],
      services: [
        {
          id: "svc-1",
          categoryId: "svc-cat-1",
          name: "حجز ذري PG",
          durationMinutes: 30,
          bufferMinutes: 0,
          publicBooking: true,
          autoAccept: true,
          active: true,
          providerIds: ["staff-1"],
          pricingType: "fixed",
          price: 100
        }
      ],
      workingHours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        isOpen: true,
        opensAt: "09:00",
        closesAt: "18:00",
        breakEnabled: false
      })),
      closedDays: [],
      specificDays: [
        {
          id: "spec-1",
          title: "Phase3",
          startDate: date,
          endDate: date,
          opensAt: "09:00",
          closesAt: "18:00"
        }
      ],
      expenses: [],
      appointments: [],
      medicalDepartments: [],
      bookingPage: {
        slug,
        businessName: "Phase3 PG",
        timezone: "Africa/Cairo",
        onlineBookingEnabled: true,
        locale: "ar"
      },
      calendarPreferences: {},
      notifications: {},
      activityMode: "medical",
      activityTemplateId: "medical",
      planKey: "pro"
    });
    await workspaceOpsPg.saveStore(seedClient, workspaceId, empty());
  } finally {
    seedClient.release();
  }

  try {
    await ops.withWorkspaceAsync(workspaceId, async () => {
      const staffId = "staff-1";
      const serviceId = "svc-1";

      const overlapResults = await Promise.all([
        settle(
          ops.createAppointmentAsync({
            customerName: "عميل أ",
            phone: "+20 1100000001",
            staffId,
            serviceId,
            date,
            time: "10:00"
          })
        ),
        settle(
          ops.createAppointmentAsync({
            customerName: "عميل ب",
            phone: "+20 1100000002",
            staffId,
            serviceId,
            date,
            time: "10:15"
          })
        )
      ]);
      assert(
        overlapResults.filter((item) => item.ok).length === 1,
        `PG overlap expected one success: ${JSON.stringify(overlapResults.map((r) => (r.ok ? r.value?.time : r.error?.message)))}`
      );
      assert(overlapResults.filter((item) => !item.ok).length === 1, "PG overlap one failure");
      checks.push("pg-concurrent-overlap");

      for (const item of ops.listAppointments({ from: date, to: date })) {
        if (item.serviceId === serviceId) ops.updateAppointmentStatus(item.id, "cancelled");
      }

      const adjacent = await Promise.all([
        ops.createAppointmentAsync({
          customerName: "عميل ج",
          phone: "+20 1100000003",
          staffId,
          serviceId,
          date,
          time: "11:00"
        }),
        ops.createAppointmentAsync({
          customerName: "عميل د",
          phone: "+20 1100000004",
          staffId,
          serviceId,
          date,
          time: "11:30"
        })
      ]);
      assert(adjacent[0].id !== adjacent[1].id, "PG adjacent both ok");
      checks.push("pg-adjacent-both-ok");

      const key = `pg-idem-${Date.now()}`;
      const first = await ops.createAppointmentAsync({
        customerName: "عميل هـ",
        phone: "+20 1100000005",
        staffId,
        serviceId,
        date,
        time: "09:00",
        idempotencyKey: key
      });
      const retry = await ops.createAppointmentAsync({
        customerName: "عميل هـ",
        phone: "+20 1100000005",
        staffId,
        serviceId,
        date,
        time: "09:00",
        idempotencyKey: key
      });
      assert(first.id === retry.id, "PG idempotent retry same id");
      assert(first.idempotencyKey === key, "PG persists idempotencyKey on appointment");
      checks.push("pg-idempotent-retry");

      // Hold cancel frees once (local map + PG release path)
      const openSlots = await ops.listPublicSlots(slug, {
        date,
        serviceId,
        staffId
      });
      assert(openSlots.slots.length >= 1, "PG need open slot");
      const holdTime = openSlots.slots[openSlots.slots.length - 1].time;
      const hold = await ops.holdPublicSlot(slug, {
        date,
        serviceId,
        staffId,
        time: holdTime
      });
      const cancel1 = await ops.cancelSlotHold({
        staffId: hold.staffId,
        date: hold.date,
        time: hold.time,
        slug
      });
      assert(cancel1.freed === true, "PG first hold cancel frees");
      const cancel2 = await ops.cancelSlotHold({
        staffId: hold.staffId,
        date: hold.date,
        time: hold.time,
        slug
      });
      assert(cancel2.localFreed === false, "PG second cancel does not re-free local");
      const after = await ops.listPublicSlots(slug, { date, serviceId, staffId });
      assert(
        after.slots.some((slot) => slot.time === hold.time),
        "PG cancelled hold frees capacity"
      );
      checks.push("pg-hold-cancel-frees-once");

      // Reload from PG to prove idempotency_key survived saveStore
      void bookingAtomic;
    });

    // Outside ALS: reload profile and confirm idempotency key round-tripped
    const verify = await pool.connect();
    try {
      const emptyFactory = () => ({
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
        medicalDepartments: [],
        bookingPage: {},
        calendarPreferences: {},
        notifications: {},
        activityLabels: {}
      });
      const loaded = await workspaceOpsPg.loadStore(verify, workspaceId, emptyFactory);
      const keyed = (loaded.appointments || []).filter((item) => item.idempotencyKey);
      assert(keyed.length >= 1, "PG loadStore returns idempotencyKey");
      checks.push("pg-idempotency-key-roundtrip");
    } finally {
      verify.release();
    }

    console.log(
      JSON.stringify({
        ok: true,
        suite: "smoke-atomic-booking-pg",
        skipped: false,
        workspaceId,
        checks
      })
    );
  } finally {
    const cleanup = await pool.connect();
    try {
      await cleanup.query("DELETE FROM workspace_ops_profiles WHERE workspace_id = $1", [
        workspaceId
      ]);
      await cleanup.query("DELETE FROM workspaces WHERE id = $1", [workspaceId]);
      await cleanup.query("DELETE FROM app_users WHERE id = $1", [`user-${workspaceId}`]);
    } catch {
      /* best effort */
    } finally {
      cleanup.release();
      await pool.end();
    }
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(
      JSON.stringify({
        ok: false,
        suite: "smoke-atomic-booking-pg",
        error: String(error.message || error),
        stack: error.stack
      })
    );
    process.exit(1);
  });
}
