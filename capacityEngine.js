/**
 * Phase 4 — generic occupancy / capacity engine (JSON + PG-ready).
 *
 * occupancy_mode on services (never inferred from activity_mode/template):
 *   - exclusive: staff/resource interval [start, end+buffer) cannot overlap
 *   - rental: resource exclusive for chosen duration
 *   - session_capacity: enrollments consume seats on an occurrence
 *
 * composition on bookings:
 *   - single: one item
 *   - bundle: multiple items; atomic — any resource failure rolls back all
 *
 * Resource.capacity uses resource.unit ('seat' | 'unit'). Do not treat a count
 * of resources as seats unless unit === 'seat'.
 */
const bookingAtomic = require("./bookingAtomic");

const OCCUPANCY_MODES = new Set(["exclusive", "rental", "session_capacity"]);
const COMPOSITIONS = new Set(["single", "bundle"]);
const ACTIVE_ENROLLMENT_STATUSES = new Set(["reserved", "confirmed", "attended"]);
const ACTIVE_ALLOCATION_STATUSES = new Set(["active"]);

function normalizeOccupancyMode(value, fallback = "exclusive") {
  const mode = String(value || fallback).trim();
  return OCCUPANCY_MODES.has(mode) ? mode : fallback;
}

function normalizeComposition(value, fallback = "single") {
  const composition = String(value || fallback).trim();
  return COMPOSITIONS.has(composition) ? composition : fallback;
}

function activeEnrollmentSeats(enrollments, occurrenceId) {
  return (enrollments || [])
    .filter(
      (row) =>
        row.occurrenceId === occurrenceId && ACTIVE_ENROLLMENT_STATUSES.has(String(row.status || ""))
    )
    .reduce((sum, row) => sum + Math.max(1, Number(row.seats) || 1), 0);
}

function remainingSeats(occurrence, enrollments) {
  const capacity = Math.max(1, Number(occurrence?.capacity) || 1);
  const occupied = activeEnrollmentSeats(enrollments, occurrence.id);
  return {
    capacity,
    occupied,
    remaining: Math.max(0, capacity - occupied)
  };
}

/**
 * Effective session capacity = min(occurrence.capacity, resource.capacity when unit=seat).
 * Never silently raise above the physical resource seat limit.
 */
function effectiveOccurrenceCapacity(occurrence, resource) {
  const configured = Math.max(1, Number(occurrence?.capacity) || 1);
  if (!resource) return { capacity: configured, limitedBy: "occurrence" };
  if (String(resource.unit || "seat") !== "seat") {
    return { capacity: configured, limitedBy: "occurrence", resourceUnit: resource.unit };
  }
  const physical = Math.max(1, Number(resource.capacity) || 1);
  if (configured > physical) {
    return {
      capacity: physical,
      limitedBy: "resource",
      configured,
      physical,
      rejectedIfStrict: true
    };
  }
  return { capacity: configured, limitedBy: "occurrence", physical };
}

function assertOccurrenceCapacityFitsResource(occurrence, resource, { strict = true } = {}) {
  const effective = effectiveOccurrenceCapacity(occurrence, resource);
  if (strict && effective.rejectedIfStrict) {
    const error = new Error(
      `Occurrence capacity ${effective.configured} exceeds resource seat capacity ${effective.physical}`
    );
    error.statusCode = 400;
    error.code = "CAPACITY_EXCEEDS_RESOURCE";
    throw error;
  }
  return effective;
}

function findActiveEnrollment(enrollments, { occurrenceId, customerId }) {
  return (enrollments || []).find(
    (row) =>
      row.occurrenceId === occurrenceId &&
      row.customerId === customerId &&
      ACTIVE_ENROLLMENT_STATUSES.has(String(row.status || ""))
  ) || null;
}

function findEnrollmentByIdempotencyKey(enrollments, key) {
  const normalized = bookingAtomic.normalizeIdempotencyKey(key);
  if (!normalized) return null;
  return (
    (enrollments || []).find(
      (row) => bookingAtomic.normalizeIdempotencyKey(row.idempotencyKey) === normalized
    ) || null
  );
}

/**
 * Decide enroll outcome without mutating. Caller applies lock + write.
 */
function planEnrollment({
  occurrence,
  resource,
  enrollments,
  customerId,
  seats = 1,
  idempotencyKey = ""
}) {
  if (!occurrence || occurrence.status === "cancelled") {
    const error = new Error("Session occurrence is not open for enrollment");
    error.statusCode = 404;
    error.code = "OCCURRENCE_UNAVAILABLE";
    throw error;
  }
  const existingKey = findEnrollmentByIdempotencyKey(enrollments, idempotencyKey);
  if (existingKey) {
    return { action: "idempotent", enrollment: existingKey };
  }
  const duplicate = findActiveEnrollment(enrollments, {
    occurrenceId: occurrence.id,
    customerId
  });
  if (duplicate) {
    const error = new Error("Customer is already enrolled in this occurrence");
    error.statusCode = 409;
    error.code = "ALREADY_ENROLLED";
    throw error;
  }
  const effective = assertOccurrenceCapacityFitsResource(occurrence, resource, { strict: true });
  const seatCount = Math.max(1, Number(seats) || 1);
  const snap = remainingSeats({ ...occurrence, capacity: effective.capacity }, enrollments);
  if (seatCount > snap.remaining) {
    const error = new Error("Session is full");
    error.statusCode = 409;
    error.code = "SESSION_FULL";
    error.remaining = snap.remaining;
    error.capacity = snap.capacity;
    throw error;
  }
  return {
    action: "enroll",
    seats: seatCount,
    capacity: snap.capacity,
    remainingAfter: snap.remaining - seatCount
  };
}

function rangesOverlapInstant(startA, endA, startB, endB) {
  const a0 = new Date(startA).getTime();
  const a1 = new Date(endA).getTime();
  const b0 = new Date(startB).getTime();
  const b1 = new Date(endB).getTime();
  return a0 < b1 && b0 < a1;
}

function findResourceAllocationConflict({
  allocations,
  resourceId,
  startsAt,
  endsAt,
  excludeId = null
}) {
  return (allocations || []).find((row) => {
    if (excludeId && row.id === excludeId) return false;
    if (row.resourceId !== resourceId) return false;
    if (!ACTIVE_ALLOCATION_STATUSES.has(String(row.status || "active"))) return false;
    return rangesOverlapInstant(startsAt, endsAt, row.startsAt, row.endsAt);
  }) || null;
}

function findStaffOccurrenceConflict({
  occurrences,
  staffId,
  startsAt,
  endsAt,
  excludeId = null
}) {
  if (!staffId) return null;
  return (occurrences || []).find((row) => {
    if (excludeId && row.id === excludeId) return false;
    if (row.staffId !== staffId) return false;
    if (row.status === "cancelled") return false;
    return rangesOverlapInstant(startsAt, endsAt, row.startsAt, row.endsAt);
  }) || null;
}

/**
 * Plan exclusive/rental resource booking for one item.
 */
function planResourceAllocation({
  service,
  resource,
  allocations,
  startsAt,
  endsAt,
  mode
}) {
  const occupancy = normalizeOccupancyMode(mode || service?.occupancyMode);
  if (occupancy === "session_capacity") {
    return { action: "skip_resource_exclusive", reason: "session_capacity_uses_seats" };
  }
  if (!resource) {
    const error = new Error("Required resource is missing for exclusive/rental booking");
    error.statusCode = 400;
    error.code = "RESOURCE_REQUIRED";
    throw error;
  }
  const statusMachines = require("./opsStatusMachines");
  if (!statusMachines.isBookableResourceStatus(resource.status)) {
    const error = new Error("Resource is not available");
    error.statusCode = 409;
    error.code = "RESOURCE_INACTIVE";
    throw error;
  }
  const conflict = findResourceAllocationConflict({
    allocations,
    resourceId: resource.id,
    startsAt,
    endsAt
  });
  if (conflict) {
    const error = new Error("Resource is already allocated for this interval");
    error.statusCode = 409;
    error.code = "RESOURCE_CONFLICT";
    error.conflictId = conflict.id;
    throw error;
  }
  return {
    action: "allocate",
    occupancy,
    resourceId: resource.id,
    startsAt,
    endsAt
  };
}

/**
 * Bundle: plan all items; fail closed if any item cannot allocate.
 * Does not mutate — caller applies all allocations or none.
 */
function planBundleAllocations({ items, allocations }) {
  const planned = [];
  let working = [...(allocations || [])];
  for (const item of items || []) {
    const plan = planResourceAllocation({
      service: item.service,
      resource: item.resource,
      allocations: working,
      startsAt: item.startsAt,
      endsAt: item.endsAt,
      mode: item.occupancyMode || item.service?.occupancyMode
    });
    if (plan.action === "allocate") {
      const ghost = {
        id: `planned-${planned.length}`,
        resourceId: plan.resourceId,
        startsAt: plan.startsAt,
        endsAt: plan.endsAt,
        status: "active"
      };
      working.push(ghost);
      planned.push({ ...plan, itemId: item.id || item.lineItemId || null });
    } else {
      planned.push({ ...plan, itemId: item.id || item.lineItemId || null });
    }
  }
  return { action: "bundle", items: planned };
}

function cancelEnrollmentOnce(enrollment) {
  if (!enrollment) return { freed: false, seats: 0 };
  if (String(enrollment.status) === "cancelled") {
    return { freed: false, seats: 0, enrollment };
  }
  const seats = Math.max(1, Number(enrollment.seats) || 1);
  return {
    freed: true,
    seats,
    enrollment: { ...enrollment, status: "cancelled", updatedAt: new Date().toISOString() }
  };
}

function releaseAllocationOnce(allocation) {
  if (!allocation) return { freed: false };
  if (String(allocation.status) !== "active") return { freed: false, allocation };
  return {
    freed: true,
    allocation: { ...allocation, status: "released" }
  };
}

module.exports = {
  OCCUPANCY_MODES,
  COMPOSITIONS,
  ACTIVE_ENROLLMENT_STATUSES,
  ACTIVE_ALLOCATION_STATUSES,
  normalizeOccupancyMode,
  normalizeComposition,
  activeEnrollmentSeats,
  remainingSeats,
  effectiveOccurrenceCapacity,
  assertOccurrenceCapacityFitsResource,
  findActiveEnrollment,
  findEnrollmentByIdempotencyKey,
  planEnrollment,
  rangesOverlapInstant,
  findResourceAllocationConflict,
  findStaffOccurrenceConflict,
  planResourceAllocation,
  planBundleAllocations,
  cancelEnrollmentOnce,
  releaseAllocationOnce
};
