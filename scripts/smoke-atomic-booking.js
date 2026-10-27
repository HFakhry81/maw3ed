#!/usr/bin/env node
/**
 * Phase 3 package smoke (JSON local path):
 * - concurrent overlapping requests → exactly one success
 * - adjacent non-overlapping → both ok
 * - idempotent retry returns the same appointment
 * - hold cancel / expiry frees capacity once
 *
 * Interval rule: [start, end + buffer). Equal-start-only is not enough.
 */
// Force JSON local storage so leftover PG slot_holds / appointments cannot
// pollute availability. PG parity is a follow-up Phase 3 package.
delete process.env.DATABASE_URL;
process.env.MAW3ED_STORAGE = "local";
process.env.MAW3ED_ENV = "local";

const path = require("path");
const storeModule = path.join(__dirname, "..", "opsStore.js");
delete require.cache[require.resolve("../db")];
delete require.cache[require.resolve("../opsPg")];
delete require.cache[require.resolve("../opsWorkspace")];
delete require.cache[require.resolve(storeModule)];
const ops = require(storeModule);
const bookingAtomic = require("../bookingAtomic");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function settle(promise) {
  return promise.then(
    (value) => ({ ok: true, value }),
    (error) => ({ ok: false, error })
  );
}

async function main() {
  const checks = [];

  await ops.withWorkspaceAsync(ops.DEFAULT_WORKSPACE_ID, async () => {
    ops.resetOpsData();
    const staff = ops.listStaff()[0];
    assert(staff?.id, "need staff");
    const category = ops.listServiceCategories()[0];
    assert(category?.id, "need service category");

    // Fixed 30m service with 0 buffer so adjacent 10:00 and 10:30 do not overlap;
    // overlapping case uses 10:00 (30m) vs 10:15.
    const service = ops.createService({
      name: "حجز ذري",
      categoryId: category.id,
      durationMinutes: 30,
      bufferMinutes: 0,
      publicBooking: true,
      autoAccept: true,
      providerIds: [staff.id],
      pricingType: "fixed",
      price: 100
    });

    // Open a far-future weekday window so hours never block the drill.
    const date = "2099-07-12"; // Monday
    ops.addSpecificDay({
      title: "Phase3",
      startDate: date,
      endDate: date,
      opensAt: "09:00",
      closesAt: "18:00"
    });

    // Use morning slots only — resetOpsData enables a 13:00–14:00 break on
    // default working hours; specific-day override is open, but keep times
    // clearly inside the 09:00–12:00 window for readability.
    // --- concurrent overlapping (different starts) ---
    const overlapResults = await Promise.all([
      settle(
        ops.createAppointmentAsync({
          customerName: "عميل أ",
          phone: "+20 1000000001",
          staffId: staff.id,
          serviceId: service.id,
          date,
          time: "10:00"
        })
      ),
      settle(
        ops.createAppointmentAsync({
          customerName: "عميل ب",
          phone: "+20 1000000002",
          staffId: staff.id,
          serviceId: service.id,
          date,
          time: "10:15"
        })
      )
    ]);
    const overlapOk = overlapResults.filter((item) => item.ok);
    const overlapFail = overlapResults.filter((item) => !item.ok);
    assert(
      overlapOk.length === 1,
      `expected exactly one overlap success, got ${overlapOk.length}: ${JSON.stringify(overlapResults.map((r) => r.ok ? r.value?.time : r.error?.message))}`
    );
    assert(overlapFail.length === 1, `expected exactly one overlap failure, got ${overlapFail.length}`);
    assert(
      overlapFail[0].error?.statusCode === 409 || /محجوز|متاح/i.test(String(overlapFail[0].error?.message || "")),
      "overlap failure should be 409 conflict"
    );
    checks.push("concurrent-overlap-one-success");

    // Cancel the winner so the adjacent pair starts clean.
    for (const item of ops.listAppointments({ from: date, to: date })) {
      if (item.serviceId === service.id) {
        ops.updateAppointmentStatus(item.id, "cancelled");
      }
    }

    // --- adjacent non-overlapping ---
    const adjacent = await Promise.all([
      ops.createAppointmentAsync({
        customerName: "عميل ج",
        phone: "+20 1000000003",
        staffId: staff.id,
        serviceId: service.id,
        date,
        time: "11:00"
      }),
      ops.createAppointmentAsync({
        customerName: "عميل د",
        phone: "+20 1000000004",
        staffId: staff.id,
        serviceId: service.id,
        date,
        time: "11:30"
      })
    ]);
    assert(adjacent.length === 2 && adjacent[0].id !== adjacent[1].id, "adjacent bookings both succeed");
    assert(
      !bookingAtomic.rangesOverlap(
        bookingAtomic.toMinutes("11:00"),
        bookingAtomic.toMinutes("11:00") + 30,
        bookingAtomic.toMinutes("11:30"),
        bookingAtomic.toMinutes("11:30") + 30
      ),
      "11:00/11:30 must be non-overlapping under [start,end)"
    );
    checks.push("adjacent-both-ok");

    // --- idempotent retry ---
    const key = `idem-${Date.now()}`;
    const first = await ops.createAppointmentAsync({
      customerName: "عميل هـ",
      phone: "+20 1000000005",
      staffId: staff.id,
      serviceId: service.id,
      date,
      time: "09:00",
      idempotencyKey: key
    });
    const retry = await ops.createAppointmentAsync({
      customerName: "عميل هـ",
      phone: "+20 1000000005",
      staffId: staff.id,
      serviceId: service.id,
      date,
      time: "09:00",
      idempotencyKey: key
    });
    assert(first.id === retry.id, "idempotent retry must return same appointment id");
    const sameKeyCount = ops
      .listAppointments({ from: date, to: date })
      .filter((item) => item.idempotencyKey === key).length;
    assert(sameKeyCount === 1, "idempotency key must create only one row");
    checks.push("idempotent-retry");

    // Concurrent idempotent retries → same id, no duplicates
    const concurrentKey = `idem-concurrent-${Date.now()}`;
    const concurrentIdem = await Promise.all([
      ops.createAppointmentAsync({
        customerName: "عميل و",
        phone: "+20 1000000006",
        staffId: staff.id,
        serviceId: service.id,
        date,
        time: "12:00",
        idempotencyKey: concurrentKey
      }),
      ops.createAppointmentAsync({
        customerName: "عميل و",
        phone: "+20 1000000006",
        staffId: staff.id,
        serviceId: service.id,
        date,
        time: "12:00",
        idempotencyKey: concurrentKey
      })
    ]);
    assert(
      concurrentIdem[0].id === concurrentIdem[1].id,
      "concurrent idempotent creates must collapse to one appointment"
    );
    checks.push("idempotent-concurrent");

    // --- hold cancel frees once ---
    const slug = ops.getBookingPage().slug;
    const openSlots = await ops.listPublicSlots(slug, {
      date,
      serviceId: service.id,
      staffId: staff.id
    });
    assert(openSlots.slots.length >= 1, "need an open slot for hold drill");
    const holdTime = openSlots.slots[openSlots.slots.length - 1].time;
    const hold = await ops.holdPublicSlot(slug, {
      date,
      serviceId: service.id,
      staffId: staff.id,
      time: holdTime
    });
    assert(hold.ok && hold.staffId && hold.time, "hold must succeed with staff/time");
    const slotsWhileHeld = await ops.listPublicSlots(slug, {
      date: hold.date,
      serviceId: service.id,
      staffId: hold.staffId
    });
    assert(
      !slotsWhileHeld.slots.some((slot) => slot.time === hold.time),
      "held slot must be unavailable"
    );
    const cancel1 = await ops.cancelSlotHold({
      staffId: hold.staffId,
      date: hold.date,
      time: hold.time,
      slug
    });
    assert(cancel1.localFreed === true, `first cancel must free local hold: ${JSON.stringify(cancel1)}`);
    const cancel2 = await ops.cancelSlotHold({
      staffId: hold.staffId,
      date: hold.date,
      time: hold.time,
      slug
    });
    assert(cancel2.localFreed === false, "second cancel must not free local hold again");
    const slotsAfterCancel = await ops.listPublicSlots(slug, {
      date: hold.date,
      serviceId: service.id,
      staffId: hold.staffId
    });
    assert(
      slotsAfterCancel.slots.some((slot) => slot.time === hold.time),
      "cancelled hold must free capacity"
    );
    checks.push("hold-cancel-frees-once");

    // --- hold expiry frees once ---
    const map = new Map();
    map.set(bookingAtomic.holdKey(hold.staffId, hold.date, hold.time), Date.now() - 1000);
    const firstPurge = bookingAtomic.purgeExpiredHoldsOnce(map, Date.now());
    assert(firstPurge.removed === 1, "expired hold removed once");
    const secondPurge = bookingAtomic.purgeExpiredHoldsOnce(map, Date.now());
    assert(secondPurge.removed === 0, "second purge removes nothing");
    checks.push("hold-expiry-frees-once");

    // Buffer-aware overlap: block = duration+buffer (45m). Slot grid steps by
    // block size, so book 09:00 then a mid-interval start must collide even
    // though duration-only end would be 09:30.
    ops.resetOpsData();
    const staff2 = ops.listStaff()[0];
    const cat2 = ops.listServiceCategories()[0];
    const buffered = ops.createService({
      name: "خدمة بفاصل",
      categoryId: cat2.id,
      durationMinutes: 30,
      bufferMinutes: 15,
      publicBooking: true,
      autoAccept: true,
      providerIds: [staff2.id],
      price: 50
    });
    ops.addSpecificDay({
      title: "Phase3-buffer",
      startDate: date,
      endDate: date,
      opensAt: "09:00",
      closesAt: "18:00"
    });
    await ops.createAppointmentAsync({
      customerName: "عميل ز",
      phone: "+20 1000000007",
      staffId: staff2.id,
      serviceId: buffered.id,
      date,
      time: "09:00"
    });
    // Direct overlap helper: 09:30 is inside [09:00, 09:45) occupancy.
    const collision = bookingAtomic.findStaffOverlap({
      appointments: ops.listAppointments({ from: date, to: date }),
      services: ops.listServices(),
      staffId: staff2.id,
      date,
      startMinutes: bookingAtomic.toMinutes("09:30"),
      endMinutes: bookingAtomic.toMinutes("09:30") + 45
    });
    assert(collision, "09:30 must overlap 09:00 occupancy including 15m buffer");
    const afterBuffer = await ops.createAppointmentAsync({
      customerName: "عميل ط",
      phone: "+20 1000000009",
      staffId: staff2.id,
      serviceId: buffered.id,
      date,
      time: "09:45"
    });
    assert(afterBuffer?.id, "first grid slot after duration+buffer must succeed");
    checks.push("buffer-extends-occupancy");
  });

  const result = { ok: true, suite: "smoke-atomic-booking", path: "json-local", checks };
  console.log(JSON.stringify(result));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(
      JSON.stringify({
        ok: false,
        suite: "smoke-atomic-booking",
        error: String(error.message || error),
        stack: error.stack
      })
    );
    process.exit(1);
  });
}
