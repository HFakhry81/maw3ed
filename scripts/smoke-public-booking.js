#!/usr/bin/env node
/**
 * Smoke tests for public booking slot engine + CRM upsert.
 * Usage: node scripts/smoke-public-booking.js
 */
const path = require("path");

const storeModule = path.join(__dirname, "..", "opsStore.js");
delete require.cache[require.resolve(storeModule)];
const ops = require(storeModule);

function assert(condition, message) {
  if (!condition) {
    const error = new Error(message);
    error.statusCode = 1;
    throw error;
  }
}

function main() {
  const reset = ops.resetOpsData();
  const slug = reset.slug;
  const date = new Date().toISOString().slice(0, 10);
  const booking = ops.getPublicBooking(slug);
  assert(booking.services.length > 0, "expected public services");
  const service = booking.services[0];
  const serviceId = service.id;
  const blockMinutes = Number(service.durationMinutes || 30) + Number(service.bufferMinutes || 0);

  const slots = ops.listPublicSlots(slug, { date, serviceId, staffId: "any" });
  assert(slots.slots.length > 0, "expected free slots");
  assert(slots.blockMinutes === blockMinutes, `blockMinutes expected ${blockMinutes}, got ${slots.blockMinutes}`);

  const lunchHits = slots.slots.filter((slot) => {
    const [hours, minutes] = slot.time.split(":").map(Number);
    const start = hours * 60 + minutes;
    return start < 14 * 60 && start + blockMinutes > 13 * 60;
  });
  assert(lunchHits.length === 0, `lunch break leaked slots: ${lunchHits.map((s) => s.time).join(",")}`);

  const first = slots.slots[0];
  const hold = ops.holdPublicSlot(slug, { date, serviceId, staffId: "any", time: first.time });
  assert(hold.staffId, "hold must return staffId");
  const afterHold = ops.listPublicSlots(slug, { date, serviceId, staffId: hold.staffId });
  assert(!afterHold.slots.some((slot) => slot.time === first.time), "held slot must disappear for others");

  const appointment = ops.createPublicAppointment(slug, {
    serviceId,
    staffId: hold.staffId,
    date,
    time: first.time,
    customerName: "سارة اختبار",
    phone: "01055550101",
    email: "sara-smoke@test.com",
    notes: "smoke"
  });
  assert(appointment.id, "appointment id required");

  let collision = null;
  try {
    ops.createPublicAppointment(slug, {
      serviceId,
      staffId: hold.staffId,
      date,
      time: first.time,
      customerName: "عميل آخر",
      phone: "01055550202"
    });
  } catch (error) {
    collision = { message: error.message, statusCode: error.statusCode };
  }
  assert(collision && collision.statusCode === 409, "expected 409 collision");

  const remaining = ops.listPublicSlots(slug, { date, serviceId, staffId: hold.staffId });
  assert(remaining.slots.length > 0, "need another free slot for upsert");
  const next = remaining.slots[0];
  const upserted = ops.createPublicAppointment(slug, {
    serviceId,
    staffId: hold.staffId,
    date,
    time: next.time,
    customerName: "سارة محدّثة",
    phone: "01055550101",
    email: "sara-updated@test.com"
  });
  const matches = ops.listCustomers().filter(
    (customer) => String(customer.phone || "").replace(/\s+/g, "") === "01055550101"
  );
  assert(matches.length === 1, "phone upsert must keep a single customer");
  assert(matches[0].email === "sara-updated@test.com", "upsert must refresh email");
  assert(upserted.customerId === matches[0].id, "appointment must attach to upserted customer");

  const status = ops.updateAppointmentStatus(appointment.id, "completed");
  assert(status.status === "completed", "status update failed");

  console.log(
    JSON.stringify(
      {
        ok: true,
        suite: "smoke-public-booking",
        slug,
        date,
        blockMinutes,
        slotCount: slots.slots.length,
        appointmentId: appointment.id,
        upsertCustomerId: matches[0].id,
        collision: collision.message
      },
      null,
      2
    )
  );
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({ ok: false, suite: "smoke-public-booking", error: error.message }, null, 2));
  process.exit(1);
}
