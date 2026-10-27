#!/usr/bin/env node
/**
 * Phase 3 — timezone / DST contract for availability vs final booking.
 *
 * Contract under test:
 * - Civil "today" follows bookingPage.timezone (not UTC).
 * - Occupancy uses wall-clock [start, end+buffer) minutes; the same helper
 *   feeds both slot blocking and createAppointment collision checks.
 * - On a DST spring-forward civil day (America/New_York), wall-clock minute
 *   arithmetic is still what booking uses (Maw3ed stores local wall times).
 */
const bookingAtomic = require("../bookingAtomic");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function main() {
  const checks = [];

  // 1) Civil date differs by timezone around a UTC midnight boundary
  const nearUtcMidnight = new Date("2026-06-15T00:30:00.000Z");
  const cairo = bookingAtomic.civilDateInTimeZone(nearUtcMidnight, "Africa/Cairo");
  const newYork = bookingAtomic.civilDateInTimeZone(nearUtcMidnight, "America/New_York");
  assert(cairo === "2026-06-15", `Cairo civil date expected 2026-06-15 got ${cairo}`);
  assert(newYork === "2026-06-14", `NY civil date expected 2026-06-14 got ${newYork}`);
  checks.push("civil-date-timezone-boundary");

  // 2) Shared occupancy helper: duration+buffer identical for slots & booking
  const interval = bookingAtomic.occupancyInterval({
    date: "2026-03-29",
    time: "01:30",
    durationMinutes: 30,
    bufferMinutes: 15
  });
  assert(interval.startMinutes === 90, "01:30 → 90 minutes");
  assert(interval.endMinutes === 135, "30+15 buffer → end 135 (02:15 wall)");
  assert(interval.blockMinutes === 45, "block minutes");
  const service = { durationMinutes: 30, bufferMinutes: 15 };
  assert(
    bookingAtomic.serviceBlockMinutes(service) === interval.blockMinutes,
    "serviceBlockMinutes must match occupancyInterval block"
  );
  checks.push("shared-duration-buffer-helper");

  // 3) Overlap uses the shared interval (equal-start-only would miss this)
  const first = bookingAtomic.occupancyInterval({
    date: "2026-03-29",
    time: "10:00",
    durationMinutes: 30,
    bufferMinutes: 15
  });
  const mid = bookingAtomic.occupancyInterval({
    date: "2026-03-29",
    time: "10:30",
    durationMinutes: 30,
    bufferMinutes: 15
  });
  const after = bookingAtomic.occupancyInterval({
    date: "2026-03-29",
    time: "10:45",
    durationMinutes: 30,
    bufferMinutes: 15
  });
  assert(
    bookingAtomic.rangesOverlap(first.startMinutes, first.endMinutes, mid.startMinutes, mid.endMinutes),
    "10:30 overlaps 10:00..10:45 occupancy"
  );
  assert(
    !bookingAtomic.rangesOverlap(
      first.startMinutes,
      first.endMinutes,
      after.startMinutes,
      after.endMinutes
    ),
    "10:45 adjacent after buffer must not overlap"
  );
  checks.push("overlap-matches-slot-and-booking");

  // 4) DST spring-forward civil day in America/New_York (2026-03-08):
  // wall 01:30 + 90m block → 03:00 wall minutes. Booking does not convert to
  // UTC duration; slots and create share the same minute math.
  const dstDay = "2026-03-08";
  const dstInterval = bookingAtomic.occupancyInterval({
    date: dstDay,
    time: "01:30",
    durationMinutes: 60,
    bufferMinutes: 30
  });
  assert(dstInterval.date === dstDay, "DST civil date preserved");
  assert(dstInterval.endMinutes === bookingAtomic.toMinutes("03:00"), "wall-clock end 03:00");
  const collision = bookingAtomic.findStaffOverlap({
    appointments: [
      {
        id: "a1",
        date: dstDay,
        time: "01:30",
        staffId: "s1",
        serviceId: "svc",
        durationMinutes: 60,
        status: "confirmed"
      }
    ],
    services: [{ id: "svc", durationMinutes: 60, bufferMinutes: 30 }],
    staffId: "s1",
    date: dstDay,
    startMinutes: bookingAtomic.toMinutes("02:30"),
    endMinutes: bookingAtomic.toMinutes("02:30") + 90
  });
  assert(collision?.id === "a1", "wall-clock overlap on DST day still detected");
  checks.push("dst-spring-forward-wall-clock");

  // 5) Idempotency header resolver (HTTP contract helper)
  const fromHeader = bookingAtomic.resolveIdempotencyKeyFromRequest(
    { headers: { "idempotency-key": " hdr-key-1 " } },
    {}
  );
  assert(fromHeader === "hdr-key-1", "Idempotency-Key header normalized");
  const fromBody = bookingAtomic.resolveIdempotencyKeyFromRequest(
    { headers: {} },
    { idempotencyKey: "body-key" }
  );
  assert(fromBody === "body-key", "body idempotencyKey used");
  const headerWins = bookingAtomic.resolveIdempotencyKeyFromRequest(
    { headers: { "idempotency-key": "header" } },
    { idempotencyKey: "body" }
  );
  // Body is checked first in resolveIdempotencyKeyFromRequest — document actual order:
  // body.idempotencyKey || header. Prefer body when both set (explicit payload).
  assert(headerWins === "body", "explicit body key preferred over header");
  checks.push("http-idempotency-key-resolver");

  console.log(
    JSON.stringify({
      ok: true,
      suite: "smoke-booking-timezone",
      checks,
      note: "Maw3ed stores local wall date/time; duration+buffer are wall-clock minutes shared by slots and booking."
    })
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(
      JSON.stringify({
        ok: false,
        suite: "smoke-booking-timezone",
        error: String(error.message || error)
      })
    );
    process.exit(1);
  }
}
