#!/usr/bin/env node
/**
 * Phase 4 — HTTP/ops capacity routes + exclusive/rental auto-allocate on booking create.
 * Does not claim education/salon/rental UI production-ready.
 */
delete process.env.DATABASE_URL;
process.env.MAW3ED_STORAGE = "local";
process.env.MAW3ED_ENV = "local";

delete require.cache[require.resolve("../db")];
delete require.cache[require.resolve("../opsPg")];
delete require.cache[require.resolve("../opsWorkspace")];
delete require.cache[require.resolve("../opsStore")];
delete require.cache[require.resolve("../opsRoutes")];

const ops = require("../opsStore");
const { tryHandleOpsApi, isOpsRoleAllowed } = require("../opsRoutes");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function settle(promise) {
  return promise.then(
    (value) => ({ ok: true, value }),
    (error) => ({ ok: false, error })
  );
}

async function invokeOps({ path: apiPath, method = "GET", body = {}, workspaceId = ops.DEFAULT_WORKSPACE_ID }) {
  let response = null;
  const req = {
    method,
    headers: { "x-workspace-id": workspaceId },
    socket: { remoteAddress: "127.0.0.1" }
  };
  await tryHandleOpsApi({
    requested: apiPath,
    req,
    res: {},
    requestUrl: new URL(`http://localhost${apiPath}`),
    sendJson: (_res, status, payload) => {
      response = { status, body: payload };
    },
    parseJsonBody: async () => body,
    localData: {},
    requireAppUser: async () => ({ id: "user-cap-http" }),
    getUserWorkspace: async () => ({
      id: workspaceId,
      role: "owner",
      status: "active",
      organization_id: "org-cap"
    }),
    databaseConfigured: false
  });
  return response;
}

async function main() {
  const checks = [];

  assert(isOpsRoleAllowed("/api/ops/resources", "GET", "manager"), "manager may list resources");
  assert(isOpsRoleAllowed("/api/ops/session-occurrences", "POST", "manager"), "manager may create occurrences");
  assert(!isOpsRoleAllowed("/api/ops/resources", "GET", "viewer"), "viewer cannot list resources");
  assert(
    isOpsRoleAllowed("/api/ops/session-occurrences/occ-1/enrollments", "POST", "manager"),
    "manager may enroll"
  );
  checks.push("rbac-known-capacity-routes");

  await ops.withWorkspaceAsync(ops.DEFAULT_WORKSPACE_ID, async () => {
    ops.resetOpsData();
    const category = ops.listServiceCategories()[0];
    const staff = ops.listStaff()[0];
    assert(category && staff, "need category + staff");

    const createRes = await invokeOps({
      path: "/api/ops/resources",
      method: "POST",
      body: {
        name: "كرسي HTTP",
        resourceType: "chair",
        capacity: 1,
        unit: "unit",
        status: "active"
      }
    });
    assert(createRes?.status === 201 && createRes.body?.resource?.id, "POST /resources");
    const chairId = createRes.body.resource.id;

    const listRes = await invokeOps({ path: "/api/ops/resources" });
    assert(
      listRes?.status === 200 && listRes.body.resources.some((row) => row.id === chairId),
      "GET /resources"
    );

    const patchRes = await invokeOps({
      path: `/api/ops/resources/${chairId}`,
      method: "PATCH",
      body: { location: "الطابق 1" }
    });
    assert(patchRes?.status === 200 && patchRes.body.resource.location === "الطابق 1", "PATCH /resources/:id");
    checks.push("http-resources-crud");

    const exclusiveSvc = ops.createService({
      name: "خدمة حصرية HTTP",
      categoryId: category.id,
      durationMinutes: 30,
      bufferMinutes: 0,
      occupancyMode: "exclusive",
      providerIds: [staff.id],
      publicBooking: false,
      price: 40
    });
    const reqRes = await invokeOps({
      path: "/api/ops/service-resource-requirements",
      method: "POST",
      body: { serviceId: exclusiveSvc.id, resourceId: chairId, quantity: 1 }
    });
    assert(reqRes?.status === 201, "POST service-resource-requirements");
    checks.push("http-service-resource-requirement");

    const date = "2099-11-10"; // Monday
    ops.addSpecificDay({
      title: "Phase4 HTTP",
      startDate: date,
      endDate: date,
      opensAt: "09:00",
      closesAt: "18:00"
    });

    const booked = await ops.createAppointmentAsync({
      customerName: "عميل مورد",
      phone: "+20 1555000001",
      staffId: staff.id,
      serviceId: exclusiveSvc.id,
      date,
      time: "10:00"
    });
    assert(booked.resourceId === chairId, "auto-allocate sets appointment.resourceId");
    const conflict = await settle(
      ops.createAppointmentAsync({
        customerName: "عميل تعارض",
        phone: "+20 1555000002",
        staffId: staff.id,
        serviceId: exclusiveSvc.id,
        date,
        time: "10:00"
      })
    );
    // Staff overlap fires first at same staff+time; use different staff for resource-only conflict.
    assert(!conflict.ok, "second same-slot booking rejected");

    const staff2 = ops.createStaff({
      firstName: "مقدم",
      lastName: "ثانٍ",
      name: "مقدم ثانٍ",
      title: "موظف"
    });
    ops.updateService(exclusiveSvc.id, { providerIds: [staff.id, staff2.id] });
    const resourceClash = await settle(
      ops.createAppointmentAsync({
        customerName: "عميل مورد 2",
        phone: "+20 1555000003",
        staffId: staff2.id,
        serviceId: exclusiveSvc.id,
        date,
        time: "10:00"
      })
    );
    assert(
      !resourceClash.ok && resourceClash.error?.code === "RESOURCE_CONFLICT",
      "exclusive auto-allocate blocks second resource use"
    );
    checks.push("auto-allocate-exclusive-conflict");

    ops.updateAppointmentStatus(booked.id, "cancelled");
    const afterCancel = await ops.createAppointmentAsync({
      customerName: "عميل بعد إلغاء",
      phone: "+20 1555000004",
      staffId: staff2.id,
      serviceId: exclusiveSvc.id,
      date,
      time: "10:00"
    });
    assert(afterCancel.resourceId === chairId, "cancel releases resource for reallocation");
    checks.push("cancel-releases-allocation");

    // session_capacity HTTP enroll path
    const room = ops.createResource({
      name: "قاعة HTTP",
      resourceType: "room",
      capacity: 5,
      unit: "seat"
    });
    const sessionSvc = ops.createService({
      name: "جلسة HTTP",
      categoryId: category.id,
      durationMinutes: 60,
      occupancyMode: "session_capacity",
      defaultCapacity: 5,
      providerIds: [staff.id],
      publicBooking: false,
      price: 15
    });
    const occRes = await invokeOps({
      path: "/api/ops/session-occurrences",
      method: "POST",
      body: {
        serviceId: sessionSvc.id,
        resourceId: room.id,
        staffId: staff.id,
        startsAt: "2099-11-11T15:00:00.000Z",
        endsAt: "2099-11-11T16:00:00.000Z",
        capacity: 2
      }
    });
    assert(occRes?.status === 201 && occRes.body.occurrence?.id, "POST session-occurrences");
    const occurrenceId = occRes.body.occurrence.id;

    const customer = ops.createCustomer({
      firstName: "طالب",
      lastName: "HTTP",
      phone: "+20 1555000099",
      categoryId: "cat-new"
    });
    const enrollRes = await invokeOps({
      path: `/api/ops/session-occurrences/${occurrenceId}/enrollments`,
      method: "POST",
      body: { customerId: customer.id, seats: 1, idempotencyKey: "http-enr-1" }
    });
    assert(enrollRes?.status === 201 && enrollRes.body.enrollment?.id, "POST enrollments");
    const avail = await invokeOps({
      path: `/api/ops/session-occurrences/${occurrenceId}/availability`
    });
    assert(avail?.status === 200 && avail.body.availability.remaining === 1, "GET availability");
    const cancelEnroll = await invokeOps({
      path: `/api/ops/enrollments/${enrollRes.body.enrollment.id}/cancel`,
      method: "POST"
    });
    assert(cancelEnroll?.status === 200 && cancelEnroll.body.freed === true, "POST enroll cancel");
    checks.push("http-session-enroll-availability");
  });

  console.log(
    JSON.stringify({
      ok: true,
      suite: "smoke-capacity-http",
      checks,
      note: "Generic capacity HTTP + auto-allocate — not vertical product readiness"
    })
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(
      JSON.stringify({
        ok: false,
        suite: "smoke-capacity-http",
        error: String(error.message || error),
        code: error.code || null,
        stack: error.stack
      })
    );
    process.exit(1);
  });
}
