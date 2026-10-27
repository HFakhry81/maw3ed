/**
 * Phase 4 capacity operations against the in-memory ops store shape.
 * Works for JSON local and inside PG-managed withWorkspaceAsync (advisory lock).
 */
const crypto = require("crypto");
const capacityEngine = require("./capacityEngine");
const bookingAtomic = require("./bookingAtomic");

function createId(prefix) {
  return `${prefix}-${crypto.randomBytes(4).toString("hex")}`;
}

function fail(message, statusCode = 400, code = null) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  throw error;
}

function ensureCapacityCollections(store) {
  if (!Array.isArray(store.resources)) store.resources = [];
  if (!Array.isArray(store.serviceResourceRequirements)) store.serviceResourceRequirements = [];
  if (!Array.isArray(store.sessionSeries)) store.sessionSeries = [];
  if (!Array.isArray(store.sessionOccurrences)) store.sessionOccurrences = [];
  if (!Array.isArray(store.sessionEnrollments)) store.sessionEnrollments = [];
  if (!Array.isArray(store.attendanceRecords)) store.attendanceRecords = [];
  if (!Array.isArray(store.resourceAllocations)) store.resourceAllocations = [];
  return store;
}

function createResource(store, payload = {}) {
  ensureCapacityCollections(store);
  const name = String(payload.name || "").trim();
  if (!name) fail("Resource name is required");
  const resource = {
    id: payload.id || createId("res"),
    name,
    resourceType: String(payload.resourceType || payload.type || "room"),
    capacity: Math.max(1, Number(payload.capacity) || 1),
    unit: String(payload.unit || "seat") === "unit" ? "unit" : "seat",
    status: payload.status === "inactive" || payload.status === "maintenance" ? payload.status : "active",
    location: String(payload.location || ""),
    metadata: payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {},
    createdAt: new Date().toISOString()
  };
  store.resources.push(resource);
  return resource;
}

function listResources(store, { status = "" } = {}) {
  ensureCapacityCollections(store);
  return store.resources.filter((row) => !status || row.status === status);
}

function setServiceOccupancy(store, serviceId, payload = {}) {
  const service = (store.services || []).find((item) => item.id === serviceId);
  if (!service) fail("Service not found", 404);
  if (payload.occupancyMode != null) {
    service.occupancyMode = capacityEngine.normalizeOccupancyMode(payload.occupancyMode);
  }
  if (payload.defaultCapacity != null) {
    service.defaultCapacity = Math.max(1, Number(payload.defaultCapacity) || 1);
  }
  if (payload.compositionDefault != null) {
    service.compositionDefault = capacityEngine.normalizeComposition(payload.compositionDefault);
  }
  return service;
}

function requireServiceResource(store, payload = {}) {
  ensureCapacityCollections(store);
  const serviceId = String(payload.serviceId || "");
  if (!serviceId || !(store.services || []).some((item) => item.id === serviceId)) {
    fail("Service not found", 404);
  }
  if (payload.resourceId) {
    const resource = store.resources.find((item) => item.id === payload.resourceId);
    if (!resource) fail("Resource not found", 404);
  }
  const requirement = {
    id: payload.id || createId("srr"),
    serviceId,
    resourceId: payload.resourceId || null,
    resourceType: payload.resourceType || null,
    quantity: Math.max(1, Number(payload.quantity) || 1),
    required: payload.required !== false
  };
  if (!requirement.resourceId && !requirement.resourceType) {
    fail("resourceId or resourceType is required");
  }
  store.serviceResourceRequirements.push(requirement);
  return requirement;
}

function createSessionOccurrence(store, payload = {}) {
  ensureCapacityCollections(store);
  const service = (store.services || []).find((item) => item.id === payload.serviceId);
  if (!service) fail("Service not found", 404);
  const startsAt = String(payload.startsAt || "");
  const endsAt = String(payload.endsAt || "");
  if (!startsAt || !endsAt || new Date(endsAt) <= new Date(startsAt)) {
    fail("Valid startsAt/endsAt required");
  }
  const resource = payload.resourceId
    ? store.resources.find((item) => item.id === payload.resourceId)
    : null;
  if (payload.resourceId && !resource) fail("Resource not found", 404);

  const configuredCapacity = Math.max(
    1,
    Number(payload.capacity != null ? payload.capacity : service.defaultCapacity || 1)
  );
  const draft = {
    id: payload.id || createId("occ"),
    serviceId: service.id,
    seriesId: payload.seriesId || null,
    staffId: payload.staffId || null,
    resourceId: payload.resourceId || null,
    startsAt,
    endsAt,
    capacity: configuredCapacity,
    status: "scheduled",
    title: String(payload.title || service.name || ""),
    createdAt: new Date().toISOString()
  };

  // Physical seat limit: reject configured capacity above resource seats.
  capacityEngine.assertOccurrenceCapacityFitsResource(draft, resource, { strict: true });

  const staffConflict = capacityEngine.findStaffOccurrenceConflict({
    occurrences: store.sessionOccurrences,
    staffId: draft.staffId,
    startsAt,
    endsAt
  });
  if (staffConflict) {
    fail("Staff is already assigned to an overlapping occurrence", 409, "STAFF_CONFLICT");
  }
  if (draft.resourceId) {
    const resourceOccConflict = (store.sessionOccurrences || []).find(
      (row) =>
        row.resourceId === draft.resourceId &&
        row.status !== "cancelled" &&
        capacityEngine.rangesOverlapInstant(startsAt, endsAt, row.startsAt, row.endsAt)
    );
    if (resourceOccConflict) {
      fail("Resource is already used by an overlapping occurrence", 409, "RESOURCE_CONFLICT");
    }
    const allocConflict = capacityEngine.findResourceAllocationConflict({
      allocations: store.resourceAllocations,
      resourceId: draft.resourceId,
      startsAt,
      endsAt
    });
    if (allocConflict) {
      fail("Resource is allocated to a booking in this interval", 409, "RESOURCE_CONFLICT");
    }
  }

  store.sessionOccurrences.push(draft);
  return draft;
}

function enrollInOccurrence(store, payload = {}) {
  ensureCapacityCollections(store);
  const occurrence = store.sessionOccurrences.find((item) => item.id === payload.occurrenceId);
  if (!occurrence) fail("Occurrence not found", 404, "OCCURRENCE_UNAVAILABLE");
  const customer = (store.customers || []).find((item) => item.id === payload.customerId);
  if (!customer) fail("Customer not found", 404);
  const resource = occurrence.resourceId
    ? store.resources.find((item) => item.id === occurrence.resourceId)
    : null;
  const idempotencyKey = bookingAtomic.normalizeIdempotencyKey(payload.idempotencyKey);
  const plan = capacityEngine.planEnrollment({
    occurrence,
    resource,
    enrollments: store.sessionEnrollments,
    customerId: customer.id,
    seats: payload.seats,
    idempotencyKey
  });
  if (plan.action === "idempotent") return plan.enrollment;

  const enrollment = {
    id: createId("enr"),
    occurrenceId: occurrence.id,
    customerId: customer.id,
    seats: plan.seats,
    status: "confirmed",
    idempotencyKey: idempotencyKey || "",
    bookingId: payload.bookingId || null,
    createdAt: new Date().toISOString()
  };
  store.sessionEnrollments.push(enrollment);
  return enrollment;
}

function cancelEnrollment(store, enrollmentId) {
  ensureCapacityCollections(store);
  const enrollment = store.sessionEnrollments.find((item) => item.id === enrollmentId);
  if (!enrollment) fail("Enrollment not found", 404);
  const result = capacityEngine.cancelEnrollmentOnce(enrollment);
  if (result.freed) {
    Object.assign(enrollment, result.enrollment);
  }
  return { ok: true, freed: result.freed, seats: result.seats, enrollment };
}

function recordAttendance(store, payload = {}) {
  ensureCapacityCollections(store);
  const enrollment = store.sessionEnrollments.find((item) => item.id === payload.enrollmentId);
  if (!enrollment) fail("Enrollment not found", 404);
  const occurrenceId = payload.occurrenceId || enrollment.occurrenceId;
  const existing = store.attendanceRecords.find(
    (row) => row.occurrenceId === occurrenceId && row.enrollmentId === enrollment.id
  );
  if (existing) {
    existing.status = String(payload.status || existing.status);
    existing.recordedAt = new Date().toISOString();
    return existing;
  }
  const record = {
    id: createId("att"),
    occurrenceId,
    enrollmentId: enrollment.id,
    status: String(payload.status || "present"),
    recordedAt: new Date().toISOString()
  };
  store.attendanceRecords.push(record);
  if (record.status === "present" || record.status === "late") {
    enrollment.status = "attended";
  }
  return record;
}

/**
 * Allocate resource for exclusive/rental appointment interval.
 */
function allocateResourceForBooking(store, payload = {}) {
  ensureCapacityCollections(store);
  const resource = store.resources.find((item) => item.id === payload.resourceId);
  if (!resource) fail("Resource not found", 404);
  const service = payload.serviceId
    ? (store.services || []).find((item) => item.id === payload.serviceId)
    : null;
  const plan = capacityEngine.planResourceAllocation({
    service,
    resource,
    allocations: store.resourceAllocations,
    startsAt: payload.startsAt,
    endsAt: payload.endsAt,
    mode: payload.occupancyMode || service?.occupancyMode
  });
  if (plan.action !== "allocate") return null;
  const allocation = {
    id: createId("alloc"),
    resourceId: plan.resourceId,
    bookingId: payload.bookingId || null,
    lineItemId: payload.lineItemId || null,
    occurrenceId: null,
    startsAt: plan.startsAt,
    endsAt: plan.endsAt,
    status: "active",
    createdAt: new Date().toISOString()
  };
  store.resourceAllocations.push(allocation);
  return allocation;
}

/**
 * Atomic bundle: plan all allocations first; write only if every item succeeds.
 */
function createBundleAllocations(store, items = []) {
  ensureCapacityCollections(store);
  const prepared = items.map((item, index) => {
    const resource = store.resources.find((row) => row.id === item.resourceId);
    const service = (store.services || []).find((row) => row.id === item.serviceId) || null;
    return {
      id: item.id || `item-${index}`,
      lineItemId: item.lineItemId || null,
      bookingId: item.bookingId || null,
      service,
      resource,
      startsAt: item.startsAt,
      endsAt: item.endsAt,
      occupancyMode: item.occupancyMode || service?.occupancyMode
    };
  });
  const plan = capacityEngine.planBundleAllocations({
    items: prepared,
    allocations: store.resourceAllocations
  });
  const created = [];
  for (const itemPlan of plan.items) {
    if (itemPlan.action !== "allocate") continue;
    const source = prepared.find((row) => row.id === itemPlan.itemId);
    const allocation = {
      id: createId("alloc"),
      resourceId: itemPlan.resourceId,
      bookingId: source?.bookingId || null,
      lineItemId: source?.lineItemId || null,
      occurrenceId: null,
      startsAt: itemPlan.startsAt,
      endsAt: itemPlan.endsAt,
      status: "active",
      createdAt: new Date().toISOString()
    };
    store.resourceAllocations.push(allocation);
    created.push(allocation);
  }
  return { ok: true, allocations: created, plan };
}

function releaseAllocation(store, allocationId) {
  ensureCapacityCollections(store);
  const allocation = store.resourceAllocations.find((item) => item.id === allocationId);
  if (!allocation) fail("Allocation not found", 404);
  const result = capacityEngine.releaseAllocationOnce(allocation);
  if (result.freed) Object.assign(allocation, result.allocation);
  return { ok: true, freed: result.freed, allocation };
}

function getOccurrenceAvailability(store, occurrenceId) {
  ensureCapacityCollections(store);
  const occurrence = store.sessionOccurrences.find((item) => item.id === occurrenceId);
  if (!occurrence) fail("Occurrence not found", 404);
  const resource = occurrence.resourceId
    ? store.resources.find((item) => item.id === occurrence.resourceId)
    : null;
  const effective = capacityEngine.effectiveOccurrenceCapacity(occurrence, resource);
  return {
    occurrenceId,
    ...capacityEngine.remainingSeats(
      { ...occurrence, capacity: effective.capacity },
      store.sessionEnrollments
    ),
    effective
  };
}

module.exports = {
  ensureCapacityCollections,
  createResource,
  listResources,
  setServiceOccupancy,
  requireServiceResource,
  createSessionOccurrence,
  enrollInOccurrence,
  cancelEnrollment,
  recordAttendance,
  allocateResourceForBooking,
  createBundleAllocations,
  releaseAllocation,
  getOccurrenceAvailability
};
