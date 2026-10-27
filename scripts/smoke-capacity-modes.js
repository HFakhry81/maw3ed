#!/usr/bin/env node
/**
 * Phase 4 package 1 — acceptance smokes for occupancy modes (JSON path).
 *
 * Covers:
 * - exclusive: overlapping resource allocation rejected
 * - rental: resource exclusive for interval
 * - session_capacity: fill seats, reject overflow, concurrent leftover seats,
 *   duplicate enroll blocked, cancel frees once, resource seat cap cannot be exceeded
 * - bundle: multi-item allocations atomic (second conflict fails whole plan)
 *
 * Does NOT claim education/salon/rental UI production-ready.
 */
const path = require("path");
delete process.env.DATABASE_URL;
process.env.MAW3ED_STORAGE = "local";
process.env.MAW3ED_ENV = "local";

delete require.cache[require.resolve("../db")];
delete require.cache[require.resolve("../opsPg")];
delete require.cache[require.resolve("../opsWorkspace")];
delete require.cache[require.resolve("../opsStore")];

const ops = require("../opsStore");
const capacityEngine = require("../capacityEngine");

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
    capacityEngine; // loaded

    const category = ops.listServiceCategories()[0];
    const staff = ops.listStaff()[0];
    assert(category && staff, "need category + staff");

    // --- resources ---
    const room = ops.createResource({
      name: "قاعة أ",
      resourceType: "room",
      capacity: 30,
      unit: "seat",
      status: "active"
    });
    const chair = ops.createResource({
      name: "كرسي 1",
      resourceType: "chair",
      capacity: 1,
      unit: "unit",
      status: "active"
    });
    const table = ops.createResource({
      name: "طاولة 1",
      resourceType: "table",
      capacity: 1,
      unit: "unit",
      status: "active"
    });
    assert(ops.listResources().length >= 3, "resources created");
    checks.push("resources-crud");

    // --- exclusive ---
    const exclusiveSvc = ops.createService({
      name: "خدمة حصرية",
      categoryId: category.id,
      durationMinutes: 30,
      bufferMinutes: 0,
      occupancyMode: "exclusive",
      providerIds: [staff.id],
      publicBooking: false,
      price: 50
    });
    assert(exclusiveSvc.occupancyMode === "exclusive", "occupancy not inferred from template");
    const starts = "2099-09-01T10:00:00.000Z";
    const ends = "2099-09-01T10:30:00.000Z";
    const alloc1 = await ops.allocateResourceForBooking({
      resourceId: chair.id,
      serviceId: exclusiveSvc.id,
      bookingId: "book-ex-1",
      startsAt: starts,
      endsAt: ends,
      occupancyMode: "exclusive"
    });
    assert(alloc1?.id, "exclusive allocation ok");
    const overlapExclusive = await settle(
      ops.allocateResourceForBooking({
        resourceId: chair.id,
        serviceId: exclusiveSvc.id,
        bookingId: "book-ex-2",
        startsAt: "2099-09-01T10:15:00.000Z",
        endsAt: "2099-09-01T10:45:00.000Z",
        occupancyMode: "exclusive"
      })
    );
    assert(!overlapExclusive.ok && overlapExclusive.error?.code === "RESOURCE_CONFLICT", "exclusive overlap rejected");
    checks.push("exclusive-resource-conflict");

    // --- rental ---
    const rentalSvc = ops.createService({
      name: "تأجير طاولة",
      categoryId: category.id,
      durationMinutes: 60,
      occupancyMode: "rental",
      providerIds: [staff.id],
      publicBooking: false,
      price: 80
    });
    const rentalAlloc = await ops.allocateResourceForBooking({
      resourceId: table.id,
      serviceId: rentalSvc.id,
      bookingId: "book-rent-1",
      startsAt: "2099-09-01T12:00:00.000Z",
      endsAt: "2099-09-01T13:00:00.000Z",
      occupancyMode: "rental"
    });
    assert(rentalAlloc?.id, "rental allocation ok");
    const rentalConflict = await settle(
      ops.allocateResourceForBooking({
        resourceId: table.id,
        serviceId: rentalSvc.id,
        bookingId: "book-rent-2",
        startsAt: "2099-09-01T12:30:00.000Z",
        endsAt: "2099-09-01T13:30:00.000Z",
        occupancyMode: "rental"
      })
    );
    assert(!rentalConflict.ok, "rental overlap rejected");
    checks.push("rental-resource-exclusive");

    // --- session_capacity ---
    const sessionSvc = ops.createService({
      name: "جلسة جماعية",
      categoryId: category.id,
      durationMinutes: 60,
      occupancyMode: "session_capacity",
      defaultCapacity: 50,
      providerIds: [staff.id],
      publicBooking: false,
      price: 20
    });
    ops.requireServiceResource({
      serviceId: sessionSvc.id,
      resourceId: room.id,
      quantity: 1
    });

    // Reject occurrence capacity > room seats (30)
    const tooBig = await settle(
      ops.createSessionOccurrence({
        serviceId: sessionSvc.id,
        resourceId: room.id,
        staffId: staff.id,
        startsAt: "2099-09-02T15:00:00.000Z",
        endsAt: "2099-09-02T16:00:00.000Z",
        capacity: 50
      })
    );
    assert(
      !tooBig.ok && tooBig.error?.code === "CAPACITY_EXCEEDS_RESOURCE",
      "cannot silently exceed physical room seats"
    );
    checks.push("session-capacity-respects-resource-seats");

    const occurrence = await ops.createSessionOccurrence({
      serviceId: sessionSvc.id,
      resourceId: room.id,
      staffId: staff.id,
      startsAt: "2099-09-02T15:00:00.000Z",
      endsAt: "2099-09-02T16:00:00.000Z",
      capacity: 3
    });
    assert(occurrence.capacity === 3, "occurrence capacity 3");

    // Staff conflict on overlapping occurrence
    const staffClash = await settle(
      ops.createSessionOccurrence({
        serviceId: sessionSvc.id,
        resourceId: room.id,
        staffId: staff.id,
        startsAt: "2099-09-02T15:30:00.000Z",
        endsAt: "2099-09-02T16:30:00.000Z",
        capacity: 3
      })
    );
    assert(!staffClash.ok && staffClash.error?.code === "STAFF_CONFLICT", "staff overlap blocked");
    checks.push("occurrence-staff-no-overlap");

    // Seed customers for enrollments
    const customers = [];
    for (let i = 0; i < 6; i += 1) {
      customers.push(
        ops.createCustomer({
          firstName: `طالب${i}`,
          lastName: "اختبار",
          phone: `+20 12000000${i}`,
          categoryId: "cat-new"
        })
      );
    }

    const e1 = await ops.enrollInOccurrence({
      occurrenceId: occurrence.id,
      customerId: customers[0].id,
      seats: 1,
      idempotencyKey: "enroll-1"
    });
    const e1b = await ops.enrollInOccurrence({
      occurrenceId: occurrence.id,
      customerId: customers[0].id,
      seats: 1,
      idempotencyKey: "enroll-1"
    });
    assert(e1.id === e1b.id, "idempotent enroll");
    const dup = await settle(
      ops.enrollInOccurrence({
        occurrenceId: occurrence.id,
        customerId: customers[0].id,
        seats: 1,
        idempotencyKey: "enroll-1-dup-customer"
      })
    );
    assert(!dup.ok && dup.error?.code === "ALREADY_ENROLLED", "duplicate customer blocked");

    await ops.enrollInOccurrence({
      occurrenceId: occurrence.id,
      customerId: customers[1].id,
      seats: 1
    });
    // 1 seat left — 3 concurrent requests: only one succeeds
    const concurrent = await Promise.all(
      [2, 3, 4].map((idx) =>
        settle(
          ops.enrollInOccurrence({
            occurrenceId: occurrence.id,
            customerId: customers[idx].id,
            seats: 1,
            idempotencyKey: `race-${idx}`
          })
        )
      )
    );
    const concurrentOk = concurrent.filter((item) => item.ok);
    const concurrentFail = concurrent.filter((item) => !item.ok);
    assert(concurrentOk.length === 1, `expected 1 concurrent success, got ${concurrentOk.length}`);
    assert(
      concurrentFail.every((item) => item.error?.code === "SESSION_FULL"),
      "overflow must be SESSION_FULL"
    );
    const avail = ops.getOccurrenceAvailability(occurrence.id);
    assert(avail.remaining === 0 && avail.occupied === 3, "full at capacity 3");
    checks.push("session-capacity-fill-and-concurrent");

    // Cancel frees once
    const cancel1 = await ops.cancelEnrollment(e1.id);
    assert(cancel1.freed === true, "cancel frees seat");
    const cancel2 = await ops.cancelEnrollment(e1.id);
    assert(cancel2.freed === false, "second cancel does not free again");
    const afterCancel = ops.getOccurrenceAvailability(occurrence.id);
    assert(afterCancel.remaining === 1, "one seat freed");
    const reEnroll = await ops.enrollInOccurrence({
      occurrenceId: occurrence.id,
      customerId: customers[5].id,
      seats: 1
    });
    assert(reEnroll?.id, "freed seat reusable");
    checks.push("session-cancel-frees-once");

    ops.recordAttendance({
      enrollmentId: reEnroll.id,
      occurrenceId: occurrence.id,
      status: "present"
    });
    checks.push("attendance-record");

    // --- bundle atomic ---
    const chair2 = ops.createResource({
      name: "كرسي 2",
      resourceType: "chair",
      capacity: 1,
      unit: "unit"
    });
    // First item uses free chair2; second tries occupied chair → whole plan fails before write
    // Pre-allocate chair to force conflict on second item
    await ops.allocateResourceForBooking({
      resourceId: chair.id,
      serviceId: exclusiveSvc.id,
      bookingId: "pre",
      startsAt: "2099-09-03T10:00:00.000Z",
      endsAt: "2099-09-03T11:00:00.000Z",
      occupancyMode: "exclusive"
    });
    const bundleFail = await settle(
      ops.createBundleAllocations([
        {
          id: "b1",
          serviceId: exclusiveSvc.id,
          resourceId: chair2.id,
          startsAt: "2099-09-03T10:00:00.000Z",
          endsAt: "2099-09-03T10:30:00.000Z",
          occupancyMode: "exclusive"
        },
        {
          id: "b2",
          serviceId: exclusiveSvc.id,
          resourceId: chair.id,
          startsAt: "2099-09-03T10:00:00.000Z",
          endsAt: "2099-09-03T10:30:00.000Z",
          occupancyMode: "exclusive"
        }
      ])
    );
    assert(!bundleFail.ok && bundleFail.error?.code === "RESOURCE_CONFLICT", "bundle fails closed");
    // Successful bundle on two free resources
    const chair3 = ops.createResource({
      name: "كرسي 3",
      resourceType: "chair",
      capacity: 1,
      unit: "unit"
    });
    const bundleOk = await ops.createBundleAllocations([
      {
        id: "ok1",
        serviceId: exclusiveSvc.id,
        resourceId: chair2.id,
        bookingId: "bundle-1",
        startsAt: "2099-09-04T10:00:00.000Z",
        endsAt: "2099-09-04T10:30:00.000Z"
      },
      {
        id: "ok2",
        serviceId: exclusiveSvc.id,
        resourceId: chair3.id,
        bookingId: "bundle-1",
        startsAt: "2099-09-04T10:00:00.000Z",
        endsAt: "2099-09-04T10:45:00.000Z"
      }
    ]);
    assert(bundleOk.allocations.length === 2, "bundle allocates all items");
    checks.push("bundle-atomic-all-or-nothing");
  });

  console.log(
    JSON.stringify({
      ok: true,
      suite: "smoke-capacity-modes",
      path: "json-local",
      checks,
      note: "Generic capacity core only — do not claim education/salon/rental production-ready"
    })
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(
      JSON.stringify({
        ok: false,
        suite: "smoke-capacity-modes",
        error: String(error.message || error),
        code: error.code || null,
        stack: error.stack
      })
    );
    process.exit(1);
  });
}
