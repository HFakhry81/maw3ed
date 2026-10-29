/**
 * Smoke: unified multi-purpose status machines + template BookingType seeds.
 * Run: node scripts/smoke-ops-status-machines.js
 */
const assert = require("assert");
const path = require("path");

const root = path.join(__dirname, "..");
const statusMachines = require(path.join(root, "opsStatusMachines.js"));
const activityTemplates = require(path.join(root, "activityTemplatesCatalog.js"));

function ok(label) {
  console.log(`  ✓ ${label}`);
}

function main() {
  console.log("smoke-ops-status-machines");

  assert.strictEqual(
    statusMachines.bookingTypeForTemplate("medical"),
    "APPOINTMENT"
  );
  assert.strictEqual(
    statusMachines.bookingTypeForTemplate("education"),
    "BATCH_SCHEDULE"
  );
  assert.strictEqual(
    statusMachines.bookingTypeForTemplate("billiards"),
    "RESOURCE_RENTAL"
  );
  assert.strictEqual(
    statusMachines.bookingTypeForTemplate("sauna"),
    "APPOINTMENT"
  );
  assert.strictEqual(
    statusMachines.bookingTypeForTemplate("sports"),
    "RESOURCE_RENTAL"
  );
  assert.strictEqual(
    statusMachines.bookingTypeForTemplate("gaming"),
    "RESOURCE_RENTAL"
  );
  ok("template → BookingType map");

  assert.strictEqual(
    statusMachines.occupancyForBookingType("APPOINTMENT"),
    "exclusive"
  );
  assert.strictEqual(
    statusMachines.occupancyForBookingType("RESOURCE_RENTAL"),
    "rental"
  );
  assert.strictEqual(
    statusMachines.occupancyForBookingType("BATCH_SCHEDULE"),
    "session_capacity"
  );
  ok("BookingType → occupancy_mode");

  assert.strictEqual(
    statusMachines.assertAppointmentTransition("pending", "confirmed"),
    "confirmed"
  );
  assert.strictEqual(
    statusMachines.assertAppointmentTransition("confirmed", "checked_in"),
    "checked_in"
  );
  assert.strictEqual(
    statusMachines.assertAppointmentTransition("checked_in", "in_progress"),
    "in_progress"
  );
  assert.strictEqual(
    statusMachines.assertAppointmentTransition("in_progress", "paused"),
    "paused"
  );
  assert.strictEqual(
    statusMachines.assertAppointmentTransition("paused", "completed"),
    "completed"
  );
  assert.strictEqual(
    statusMachines.assertAppointmentTransition("confirmed", "waitlisted"),
    "waitlisted"
  );
  assert.strictEqual(
    statusMachines.normalizeAppointmentStatus("arrived"),
    "checked_in"
  );
  let threw = false;
  try {
    statusMachines.assertAppointmentTransition("completed", "pending");
  } catch {
    threw = true;
  }
  assert.ok(threw, "completed must not reopen to pending");
  ok("APPOINTMENT transitions");

  assert.strictEqual(
    statusMachines.normalizeResourceStatus("active"),
    "available"
  );
  assert.strictEqual(
    statusMachines.normalizeResourceStatus("maintenance"),
    "under_maintenance"
  );
  assert.ok(statusMachines.isBookableResourceStatus("available"));
  assert.ok(!statusMachines.isBookableResourceStatus("occupied"));
  ok("resource statuses");

  assert.strictEqual(
    statusMachines.assertRentalSessionTransition("open", "paused"),
    "paused"
  );
  assert.strictEqual(
    statusMachines.assertRentalSessionTransition("paused", "closed_pending_payment"),
    "closed_pending_payment"
  );
  assert.strictEqual(
    statusMachines.assertRentalSessionTransition(
      "closed_pending_payment",
      "settled"
    ),
    "settled"
  );
  ok("RESOURCE_RENTAL session transitions");

  assert.strictEqual(
    statusMachines.normalizeBatchOccurrenceStatus("scheduled"),
    "open"
  );
  assert.strictEqual(
    statusMachines.normalizeBatchOccurrenceStatus("open", {
      seatsTaken: 20,
      capacity: 20
    }),
    "full"
  );
  assert.strictEqual(
    statusMachines.normalizeAttendanceStatus("present"),
    "attended"
  );
  assert.strictEqual(
    statusMachines.normalizeStaffBranchLinkStatus("suspended"),
    "suspended"
  );
  ok("BATCH + staff-branch statuses");

  const ids = activityTemplates.allTemplateIds();
  for (const id of ["sauna", "sports", "gaming", "education", "billiards", "beauty"]) {
    assert.ok(ids.includes(id), `missing template ${id}`);
  }
  ok("required templates present");

  const edu = activityTemplates.buildSeedFromTemplate("education", "ar");
  assert.strictEqual(edu.bookingType, "BATCH_SCHEDULE");
  const group = edu.services.find((s) => s.id === "edu-en-group");
  assert.ok(group);
  assert.strictEqual(group.occupancyMode, "session_capacity");
  assert.ok(group.defaultCapacity >= 2);
  ok("education seed occupancy");

  const bill = activityTemplates.buildSeedFromTemplate("billiards", "ar");
  assert.strictEqual(bill.bookingType, "RESOURCE_RENTAL");
  const table = bill.services.find((s) => s.id === "bill-hour");
  assert.strictEqual(table.occupancyMode, "rental");
  ok("billiards seed occupancy");

  const sauna = activityTemplates.buildSeedFromTemplate("sauna", "ar");
  assert.strictEqual(sauna.bookingType, "APPOINTMENT");
  assert.ok(sauna.services.length >= 1);
  ok("sauna seed");

  const catalog = statusMachines.catalogForApi("ar");
  assert.ok(catalog.bookingTypes.length === 3);
  assert.ok(catalog.appointmentStatuses.some((s) => s.key === "in_progress"));
  assert.ok(catalog.rentalSessionStatuses.some((s) => s.key === "settled"));
  ok("status catalog API shape");

  console.log("PASS");
}

main();
