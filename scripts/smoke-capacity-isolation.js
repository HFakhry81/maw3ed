#!/usr/bin/env node
/**
 * Phase 4 — cross-workspace isolation for resources, occurrences, enrollments.
 * Store-scoped reads + HTTP membership BOLA for capacity routes.
 */
delete process.env.DATABASE_URL;
process.env.MAW3ED_STORAGE = "local";
process.env.MAW3ED_ENV = "production";
process.env.MAW3ED_REQUIRE_AUTH = "1";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "smoke-capacity-isolation-session-secret";

delete require.cache[require.resolve("../db")];
delete require.cache[require.resolve("../opsPg")];
delete require.cache[require.resolve("../opsWorkspace")];
delete require.cache[require.resolve("../opsStore")];
delete require.cache[require.resolve("../opsRoutes")];

const ops = require("../opsStore");
const { tryHandleOpsApi } = require("../opsRoutes");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function invokeOps({
  path: apiPath,
  method = "GET",
  workspaceId,
  membershipFor,
  body = {},
  user = { id: "user-cap-a" }
}) {
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
    requireAppUser: async () => {
      if (!user) {
        const error = new Error("Authentication is required");
        error.statusCode = 401;
        throw error;
      }
      return user;
    },
    getUserWorkspace: async (_userId, requestedWorkspaceId) => {
      if (!membershipFor) return null;
      return membershipFor[requestedWorkspaceId || workspaceId] || null;
    },
    databaseConfigured: false
  });
  return response;
}

async function main() {
  const checks = [];
  const wsA = "ws-cap-iso-a";
  const wsB = "ws-cap-iso-b";

  ops.seedWorkspaceStore(wsA, { slug: "cap-iso-a", businessName: "سعة أ" });
  ops.seedWorkspaceStore(wsB, { slug: "cap-iso-b", businessName: "سعة ب" });

  let resourceAId = null;
  let resourceBId = null;
  let occurrenceBId = null;
  let enrollmentBId = null;
  let customerBId = null;

  await ops.withWorkspaceAsync(wsA, async () => {
    ops.resetOpsData();
    ops.updateBookingPage({ slug: "cap-iso-a", businessName: "سعة أ" });
    const resource = ops.createResource({
      name: "قاعة أ فقط",
      resourceType: "room",
      capacity: 10,
      unit: "seat"
    });
    resourceAId = resource.id;
  });

  await ops.withWorkspaceAsync(wsB, async () => {
    ops.resetOpsData();
    ops.updateBookingPage({ slug: "cap-iso-b", businessName: "سعة ب" });
    const staff = ops.listStaff()[0];
    const category = ops.listServiceCategories()[0];
    const resource = ops.createResource({
      name: "قاعة ب فقط",
      resourceType: "room",
      capacity: 8,
      unit: "seat"
    });
    resourceBId = resource.id;
    const service = ops.createService({
      name: "جلسة ب",
      categoryId: category.id,
      durationMinutes: 60,
      occupancyMode: "session_capacity",
      defaultCapacity: 8,
      providerIds: [staff.id],
      publicBooking: false,
      price: 10
    });
    const occurrence = await ops.createSessionOccurrence({
      serviceId: service.id,
      resourceId: resource.id,
      staffId: staff.id,
      startsAt: "2099-12-01T10:00:00.000Z",
      endsAt: "2099-12-01T11:00:00.000Z",
      capacity: 4
    });
    occurrenceBId = occurrence.id;
    const customer = ops.createCustomer({
      firstName: "طالب",
      lastName: "ب",
      phone: "+20 1666000001",
      categoryId: "cat-new"
    });
    customerBId = customer.id;
    const enrollment = await ops.enrollInOccurrence({
      occurrenceId: occurrence.id,
      customerId: customer.id,
      seats: 1,
      idempotencyKey: "iso-b-enr"
    });
    enrollmentBId = enrollment.id;
  });

  // Store isolation: A must not see B resources/occurrences
  const resourcesA = await ops.withWorkspaceAsync(wsA, () => ops.listResources());
  assert(resourcesA.some((row) => row.id === resourceAId), "A sees own resource");
  assert(!resourcesA.some((row) => row.id === resourceBId), "A must not see B resource");
  const occA = await ops.withWorkspaceAsync(wsA, () => ops.listSessionOccurrences());
  assert(!occA.some((row) => row.id === occurrenceBId), "A must not see B occurrence");
  checks.push("store-scoped-resources-occurrences");

  // Using B ids inside A context must 404 (not leak or mutate)
  let crossEnroll = null;
  try {
    await ops.withWorkspaceAsync(wsA, async () => {
      await ops.enrollInOccurrence({
        occurrenceId: occurrenceBId,
        customerId: customerBId,
        seats: 1
      });
    });
  } catch (error) {
    crossEnroll = error;
  }
  assert(
    crossEnroll && (crossEnroll.statusCode === 404 || crossEnroll.code === "OCCURRENCE_UNAVAILABLE"),
    "enroll with foreign occurrence id must fail in A"
  );

  let crossResource = null;
  try {
    await ops.withWorkspaceAsync(wsA, () => {
      ops.updateResource(resourceBId, { name: "مهرب" });
    });
  } catch (error) {
    crossResource = error;
  }
  assert(crossResource?.statusCode === 404, "update B resource id inside A must 404");
  const stillB = await ops.withWorkspaceAsync(wsB, () =>
    ops.listResources().find((row) => row.id === resourceBId)
  );
  assert(stillB?.name === "قاعة ب فقط", "B resource untouched by A id probe");
  checks.push("cross-id-lookup-fail-closed");

  // HTTP: member of A cannot list B resources / enroll in B
  const forgedList = await invokeOps({
    path: "/api/ops/resources",
    workspaceId: wsB,
    membershipFor: {
      [wsA]: { id: wsA, role: "owner", status: "active", organization_id: "org-a" }
    }
  });
  assert(forgedList?.status === 403, "A owner must not list B resources via header");

  const forgedEnroll = await invokeOps({
    path: `/api/ops/session-occurrences/${occurrenceBId}/enrollments`,
    method: "POST",
    workspaceId: wsB,
    membershipFor: {
      [wsA]: { id: wsA, role: "owner", status: "active", organization_id: "org-a" }
    },
    body: { customerId: customerBId, seats: 1 }
  });
  assert(forgedEnroll?.status === 403, "A owner must not enroll into B occurrence");

  const ownerBList = await invokeOps({
    path: "/api/ops/resources",
    workspaceId: wsB,
    user: { id: "user-cap-b" },
    membershipFor: {
      [wsB]: { id: wsB, role: "owner", status: "active", organization_id: "org-b" }
    }
  });
  assert(
    ownerBList?.status === 200 && ownerBList.body.resources.some((row) => row.id === resourceBId),
    "B owner lists own resources"
  );
  assert(
    !ownerBList.body.resources.some((row) => row.id === resourceAId),
    "B list must not include A resource"
  );
  checks.push("http-membership-bola-capacity");

  // Same resource id string reused across tenants stays isolated
  await ops.withWorkspaceAsync(wsA, () => {
    ops.createResource({
      id: resourceBId,
      name: "تصادف معرف أ",
      resourceType: "room",
      capacity: 3,
      unit: "seat"
    });
  });
  const aShared = await ops.withWorkspaceAsync(wsA, () =>
    ops.listResources().find((row) => row.id === resourceBId)
  );
  const bShared = await ops.withWorkspaceAsync(wsB, () =>
    ops.listResources().find((row) => row.id === resourceBId)
  );
  assert(aShared?.name === "تصادف معرف أ", "A owns its copy of shared id");
  assert(bShared?.name === "قاعة ب فقط", "B copy of shared id unchanged");
  assert(enrollmentBId, "B enrollment seeded");
  checks.push("shared-resource-id-tenant-scoped");

  console.log(
    JSON.stringify({
      ok: true,
      suite: "smoke-capacity-isolation",
      checks,
      note: "Capacity isolation only — not vertical product readiness"
    })
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(
      JSON.stringify({
        ok: false,
        suite: "smoke-capacity-isolation",
        error: String(error.message || error),
        code: error.code || null,
        stack: error.stack
      })
    );
    process.exit(1);
  });
}
