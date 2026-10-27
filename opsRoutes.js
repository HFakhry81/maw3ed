const ops = require("./opsStore");
const { createPlatformAdmin } = require("./platformAdmin");
const { query, databaseConfigured } = require("./db");
const workspaceEvents = require("./workspaceEvents");
const { evaluateRuntimePosture } = require("./runtimePosture");
const staffLinks = require("./staffLinks");
const bookingAtomic = require("./bookingAtomic");

const platformAdmin = createPlatformAdmin({ query, databaseConfigured, sendJson: () => {} });

const rateBuckets = new Map();
const OPS_ADMIN_ROLES = new Set(["owner", "admin"]);
const OPS_MANAGER_ROLES = new Set(["owner", "admin", "manager"]);
const OPS_VIEWER_READS = new Set([
  "GET /api/ops/activity-templates",
  "GET /api/ops/working-schedule"
]);
const OPS_KNOWN_REQUESTS = new Set([
  "GET /api/ops/bootstrap",
  "GET /api/ops/customers",
  "POST /api/ops/customers",
  "POST /api/ops/customer-categories",
  "GET /api/ops/staff",
  "POST /api/ops/staff",
  "GET /api/ops/service-categories",
  "POST /api/ops/service-categories",
  "GET /api/ops/services",
  "POST /api/ops/services",
  "POST /api/ops/uploads/logo",
  "POST /api/ops/uploads/image",
  "GET /api/ops/activity-templates",
  "GET /api/ops/working-schedule",
  "PUT /api/ops/working-hours",
  "POST /api/ops/closed-days",
  "POST /api/ops/specific-days",
  "GET /api/ops/booking-page",
  "PUT /api/ops/booking-page",
  "GET /api/ops/desk/today",
  "POST /api/ops/desk/preview",
  "POST /api/ops/desk/check-in",
  "GET /api/ops/calendar-preferences",
  "PUT /api/ops/calendar-preferences",
  "GET /api/ops/notifications",
  "PUT /api/ops/notifications",
  "GET /api/ops/expenses",
  "POST /api/ops/expenses",
  "GET /api/ops/appointments",
  "POST /api/ops/appointments",
  "PUT /api/ops/activity-profile",
  "GET /api/ops/stats",
  "GET /api/ops/events",
  "GET /api/ops/contexts",
  "GET /api/ops/staff-link",
  "GET /api/ops/staff-links",
  "GET /api/ops/resources",
  "POST /api/ops/resources",
  "POST /api/ops/service-resource-requirements",
  "GET /api/ops/session-occurrences",
  "POST /api/ops/session-occurrences",
  "POST /api/ops/resource-allocations/bundle"
]);

function recordOpsEvent(workspaceId, event) {
  try {
    return workspaceEvents.appendWorkspaceEvent(workspaceId, event);
  } catch (error) {
    console.warn("[workspace-events] append failed:", error.message);
    return null;
  }
}

function isKnownOpsRequest(requested, method) {
  return OPS_KNOWN_REQUESTS.has(`${method} ${requested}`) ||
    /^\/(?:api\/ops\/staff\/[^/]+|api\/ops\/service-categories\/[^/]+|api\/ops\/services\/[^/]+)$/.test(requested) && ["PATCH", "DELETE"].includes(method) ||
    /^\/api\/ops\/staff\/[^/]+\/(?:commission|payroll|reviews)$/.test(requested) && ["GET", "POST"].includes(method) ||
    /^\/api\/ops\/staff\/[^/]+\/account-link$/.test(requested) && ["PUT", "DELETE"].includes(method) ||
    /^\/api\/ops\/services\/[^/]+\/providers$/.test(requested) && method === "POST" ||
    /^\/api\/ops\/services\/[^/]+\/providers\/[^/]+$/.test(requested) && method === "DELETE" ||
    /^\/api\/ops\/desk\/appointments\/[^/]+\/addons$/.test(requested) && method === "POST" ||
    /^\/api\/ops\/desk\/appointments\/[^/]+\/lines\/[^/]+\/pricing$/.test(requested) && method === "PATCH" ||
    /^\/api\/ops\/desk\/appointments\/[^/]+\/complete$/.test(requested) && method === "POST" ||
    /^\/api\/ops\/appointments\/[^/]+\/(?:status|pricing)$/.test(requested) && method === "PATCH" ||
    /^\/api\/ops\/resources\/[^/]+$/.test(requested) && method === "PATCH" ||
    /^\/api\/ops\/session-occurrences\/[^/]+\/availability$/.test(requested) && method === "GET" ||
    /^\/api\/ops\/session-occurrences\/[^/]+\/enrollments$/.test(requested) && method === "POST" ||
    /^\/api\/ops\/enrollments\/[^/]+\/cancel$/.test(requested) && method === "POST" ||
    /^\/api\/ops\/enrollments\/[^/]+\/attendance$/.test(requested) && method === "POST";
}

function isOpsRoleAllowed(requested, method, role, options = {}) {
  if (!isKnownOpsRequest(requested, method)) return false;
  const requestKey = `${method} ${requested}`;
  const staffLink = options.staffLink || null;

  // These endpoints contain no customer, appointment, staff, expense, or auth data.
  if (OPS_VIEWER_READS.has(requestKey) && ["owner", "admin", "manager", "staff", "viewer"].includes(role)) {
    return true;
  }

  // Context/link introspection: any active member may read own selectable context metadata.
  if (
    (requested === "/api/ops/contexts" || requested === "/api/ops/staff-link") &&
    method === "GET" &&
    ["owner", "admin", "manager", "staff", "viewer"].includes(role)
  ) {
    return true;
  }

  // Workspace settings that define the public identity/activity are owner/admin only.
  if (requested === "/api/ops/activity-profile" && method === "PUT") {
    return OPS_ADMIN_ROLES.has(role);
  }

  // Expenses, notification config, aggregates, and tenant audit reads are admin-only.
  if (
    requested === "/api/ops/expenses" ||
    requested === "/api/ops/notifications" ||
    requested === "/api/ops/stats" ||
    requested === "/api/ops/events" ||
    /^\/api\/ops\/(?:appointments\/[^/]+\/pricing|desk\/appointments\/[^/]+\/lines\/[^/]+\/pricing|desk\/appointments\/[^/]+\/addons)$/.test(requested)
  ) {
    return OPS_ADMIN_ROLES.has(role);
  }

  // Staff account links are managed by owner/admin only.
  if (
    requested === "/api/ops/staff-links" && method === "GET" ||
    /^\/api\/ops\/staff\/[^/]+\/account-link$/.test(requested)
  ) {
    return OPS_ADMIN_ROLES.has(role);
  }

  // Staff role: fail closed unless an active workspace staff link exists.
  // Linked staff may use scoped desk routes + a stripped bootstrap for the desk UI shell.
  if (role === "staff") {
    if (!staffLink || staffLink.status !== "active" || !staffLink.staffId) return false;
    if (requested === "/api/ops/bootstrap" && method === "GET") return true;
    if (staffLinks.isStaffForbiddenDeskMoneyRoute(requested, method)) return false;
    return staffLinks.isDeskRoute(requested, method);
  }

  // Manager can run operational flows but cannot perform owner/admin-only actions above.
  return OPS_MANAGER_ROLES.has(role);
}

function denyStaffScope() {
  const error = new Error("Outside linked staff desk scope");
  error.statusCode = 404;
  return error;
}

function clientKey(req) {
  return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "local")
    .split(",")[0]
    .trim();
}

function assertPublicRateLimit(req, action, limit = 30, windowMs = 60_000) {
  const key = `${action}:${clientKey(req)}`;
  const now = Date.now();
  const bucket = rateBuckets.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }
  bucket.count += 1;
  rateBuckets.set(key, bucket);
  if (bucket.count > limit) {
    const error = new Error("تم تجاوز حد الطلبات. حاول بعد دقيقة.");
    error.statusCode = 429;
    throw error;
  }
}

function handleOpsError(res, sendJson, error) {
  const status = error.statusCode || 500;
  return sendJson(res, status, { ok: false, error: error.message || "Ops error" });
}

function adminWorkspaceId(req, requestUrl) {
  const raw = req.headers["x-workspace-id"] || requestUrl.searchParams.get("workspace") || ops.DEFAULT_WORKSPACE_ID;
  return String(raw).trim() || ops.DEFAULT_WORKSPACE_ID;
}

async function publicWorkspaceId(slug) {
  const resolved = await ops.resolveWorkspaceIdForSlugAsync(slug);
  if (!resolved) {
    const error = new Error("صفحة الحجز غير متاحة");
    error.statusCode = 404;
    throw error;
  }
  return resolved;
}

async function tryHandleOpsApi({ requested, req, res, requestUrl, sendJson, parseJsonBody, localData, requireAppUser, getUserWorkspace, databaseConfigured }) {
  try {
    const publicBookingMatch = requested.match(/^\/api\/public\/booking\/([^/]+)$/);
    const publicSlotsMatch = requested.match(/^\/api\/public\/booking\/([^/]+)\/slots$/);
    const publicHoldMatch = requested.match(/^\/api\/public\/booking\/([^/]+)\/hold$/);
    const publicBookMatch = requested.match(/^\/api\/public\/booking\/([^/]+)\/appointments$/);
    const publicPassMatch = requested.match(/^\/api\/public\/booking\/([^/]+)\/pass\/([^/]+)$/);
    const isPublic =
      (publicBookingMatch && req.method === "GET") ||
      (publicSlotsMatch && req.method === "GET") ||
      (publicHoldMatch && req.method === "POST") ||
      (publicBookMatch && req.method === "POST") ||
      (publicPassMatch && req.method === "GET");

    const isOps = requested.startsWith("/api/ops/");
    if (!isOps && !isPublic) return false;

    let workspaceId = ops.DEFAULT_WORKSPACE_ID;
    if (isPublic) {
      const slug = decodeURIComponent(
        (publicBookingMatch || publicSlotsMatch || publicHoldMatch || publicBookMatch || publicPassMatch)[1]
      );
      workspaceId = await publicWorkspaceId(slug);
    } else {
      workspaceId = adminWorkspaceId(req, requestUrl);
    }

    if (isOps) {
      const posture = evaluateRuntimePosture(process.env, { databaseConfigured });
      if (!posture.ok) {
        const error = new Error("Server security posture refuses this request");
        error.statusCode = 503;
        error.code = "runtime_posture";
        throw error;
      }
    }

    const authRequired = process.env.MAW3ED_ENV === "production" || process.env.MAW3ED_REQUIRE_AUTH === "1";
    let workspaceRole = null;
    let actorUserId = null;
    let actorStaffLink = null;
    if (isOps && authRequired) {
      const user = await requireAppUser(req);
      if (!user) {
        const error = new Error("Authentication is required");
        error.statusCode = 401;
        throw error;
      }
      actorUserId = user.id;
      const membership = await getUserWorkspace(user.id, workspaceId);
      if (!membership) {
        recordOpsEvent(workspaceId, {
          actor_id: user.id,
          action: "authz.denied",
          target_type: "route",
          target_id: `${req.method} ${requested}`,
          outcome: "forbidden",
          details: { reason: "not_member" }
        });
        const error = new Error("This workspace is not available for the current account");
        error.statusCode = 403;
        throw error;
      }
      workspaceRole = membership.role;
      actorStaffLink = await staffLinks.getActiveLinkForUser(user.id, workspaceId);
      if (!isOpsRoleAllowed(requested, req.method, membership.role, { staffLink: actorStaffLink })) {
        recordOpsEvent(workspaceId, {
          actor_id: user.id,
          role: membership.role,
          action: "authz.denied",
          target_type: "route",
          target_id: `${req.method} ${requested}`,
          outcome: "forbidden",
          details: {
            reason: membership.role === "staff" && !actorStaffLink
              ? "staff_link_required"
              : "role_not_allowed",
            staffLinkId: actorStaffLink?.id || null
          }
        });
        const error = new Error(
          membership.role === "staff" && !actorStaffLink
            ? "Staff desk access requires an active account↔staff link in this workspace"
            : "This workspace role cannot perform this operation"
        );
        error.statusCode = 403;
        throw error;
      }
    }

    if (isOps || isPublic) {
      await platformAdmin.assertWorkspaceNotSuspended(workspaceId);
    }

    // Phase 3: run booking mutations inside the workspace transaction/lock, then
    // send confirmation email only after commit (no notify-before-commit).
    let pendingBookingConfirmation = null;
    const handled = await ops.withWorkspaceAsync(workspaceId, async () => {
      if (requested === "/api/ops/contexts" && req.method === "GET") {
        // Selectable desk/ops contexts for the authenticated user.
        // Client may suggest x-workspace-id; server still proves membership + link.
        const membership = actorUserId ? await getUserWorkspace(actorUserId, workspaceId) : null;
        const link = actorStaffLink || (actorUserId
          ? await staffLinks.getActiveLinkForUser(actorUserId, workspaceId)
          : null);
        sendJson(res, 200, {
          ok: true,
          current: {
            workspaceId,
            role: workspaceRole || membership?.role || null,
            staffLink: link
              ? {
                  id: link.id,
                  staffId: link.staffId,
                  roleInWorkspace: link.roleInWorkspace,
                  status: link.status
                }
              : null,
            deskAllowed: Boolean(
              workspaceRole &&
                workspaceRole !== "viewer" &&
                (OPS_MANAGER_ROLES.has(workspaceRole) ||
                  (workspaceRole === "staff" && link && link.status === "active"))
            )
          }
        });
        return true;
      }

      if (requested === "/api/ops/staff-link" && req.method === "GET") {
        sendJson(res, 200, {
          ok: true,
          workspaceId,
          staffLink: actorStaffLink
            ? {
                id: actorStaffLink.id,
                staffId: actorStaffLink.staffId,
                roleInWorkspace: actorStaffLink.roleInWorkspace,
                status: actorStaffLink.status
              }
            : null
        });
        return true;
      }

      if (requested === "/api/ops/staff-links" && req.method === "GET") {
        const links = await staffLinks.listWorkspaceLinks(workspaceId);
        sendJson(res, 200, { ok: true, workspaceId, links });
        return true;
      }

      const staffAccountLinkMatch = requested.match(/^\/api\/ops\/staff\/([^/]+)\/account-link$/);
      if (staffAccountLinkMatch && req.method === "PUT") {
        const body = await parseJsonBody(req);
        const staffId = decodeURIComponent(staffAccountLinkMatch[1]);
        const link = await staffLinks.upsertLink({
          workspaceId,
          userId: body.userId,
          staffId,
          roleInWorkspace: body.roleInWorkspace || "desk",
          status: body.status || "active",
          staffExists: async (_ws, id) => Boolean(ops.listStaff().find((person) => person.id === id))
        });
        recordOpsEvent(workspaceId, {
          actor_id: actorUserId,
          role: workspaceRole,
          action: "staff_link.upsert",
          target_type: "staff_link",
          target_id: link.id,
          outcome: "success",
          details: { staffId: link.staffId, userId: link.userId, status: link.status }
        });
        sendJson(res, 200, { ok: true, staffLink: link });
        return true;
      }

      if (staffAccountLinkMatch && req.method === "DELETE") {
        const staffId = decodeURIComponent(staffAccountLinkMatch[1]);
        const link = await staffLinks.suspendLink(workspaceId, { staffId });
        recordOpsEvent(workspaceId, {
          actor_id: actorUserId,
          role: workspaceRole,
          action: "staff_link.suspend",
          target_type: "staff_link",
          target_id: link.id,
          outcome: "success",
          details: { staffId: link.staffId, userId: link.userId }
        });
        sendJson(res, 200, { ok: true, staffLink: link });
        return true;
      }

      if (requested === "/api/ops/bootstrap" && req.method === "GET") {
        const canViewFinance = !workspaceRole || OPS_ADMIN_ROLES.has(workspaceRole);
        const staffLinkPayload = actorStaffLink
          ? {
              id: actorStaffLink.id,
              staffId: actorStaffLink.staffId,
              roleInWorkspace: actorStaffLink.roleInWorkspace,
              status: actorStaffLink.status
            }
          : null;
        const activity = ops.getActivityProfile();
        // Linked staff: desk shell only — no customers, expenses, or facility-wide PII dumps.
        if (workspaceRole === "staff") {
          const linkedStaffId = actorStaffLink?.staffId || "";
          sendJson(res, 200, {
            ok: true,
            workspaceId: ops.getCurrentWorkspaceId(),
            workspaceRole: "staff",
            deskOnly: true,
            customers: [],
            customerCategories: [],
            staff: ops.listStaff().filter((person) => person.id === linkedStaffId || person.active !== false),
            serviceCategories: ops.listServiceCategories(),
            services: ops.listServices(),
            resources: [],
            sessionOccurrences: [],
            schedule: ops.getWorkingSchedule(),
            bookingPage: ops.getBookingPage(),
            calendarPreferences: ops.getCalendarPreferences(),
            appointments: [],
            stats: { appointments: {}, servicesCount: 0, staffCount: 0, customersCount: 0 },
            activity,
            staffLink: staffLinkPayload,
            planUsage: null
          });
          return true;
        }
        const stats = ops.getStatsSummary(localData?.appointments || []);
        sendJson(res, 200, {
          ok: true,
          workspaceId: ops.getCurrentWorkspaceId(),
          workspaceRole: workspaceRole || null,
          customers: ops.listCustomers(),
          customerCategories: ops.listCustomerCategories(),
          staff: ops.listStaff(),
          serviceCategories: ops.listServiceCategories(),
          services: ops.listServices(),
          resources: ops.listResources(),
          sessionOccurrences: ops.listSessionOccurrences(),
          schedule: ops.getWorkingSchedule(),
          bookingPage: ops.getBookingPage(),
          calendarPreferences: ops.getCalendarPreferences(),
          ...(canViewFinance ? { notifications: ops.getNotificationSettings(), expenses: ops.listExpenses() } : {}),
          appointments: ops.listAppointments(),
          stats: canViewFinance ? stats : { appointments: stats.appointments, servicesCount: stats.servicesCount, staffCount: stats.staffCount, customersCount: stats.customersCount },
          activity,
          staffLink: staffLinkPayload,
          planUsage: ops.getPlanUsage()
        });
        return true;
      }

      if (requested === "/api/ops/events" && req.method === "GET") {
        const limit = Number(requestUrl.searchParams.get("limit") || 50);
        sendJson(res, 200, {
          ok: true,
          workspaceId: ops.getCurrentWorkspaceId(),
          events: workspaceEvents.listWorkspaceEvents(ops.getCurrentWorkspaceId(), { limit })
        });
        return true;
      }

      if (requested === "/api/ops/customers" && req.method === "GET") {
        sendJson(res, 200, {
          ok: true,
          customers: ops.listCustomers({
            search: requestUrl.searchParams.get("search") || "",
            categoryId: requestUrl.searchParams.get("categoryId") || ""
          }),
          categories: ops.listCustomerCategories()
        });
        return true;
      }
      if (requested === "/api/ops/customers" && req.method === "POST") {
        sendJson(res, 201, { ok: true, customer: ops.createCustomer(await parseJsonBody(req)) });
        return true;
      }
      if (requested === "/api/ops/customer-categories" && req.method === "POST") {
        sendJson(res, 201, { ok: true, category: ops.createCustomerCategory(await parseJsonBody(req)) });
        return true;
      }

      if (requested === "/api/ops/staff" && req.method === "GET") {
        sendJson(res, 200, {
          ok: true,
          staff: ops.listStaff({ search: requestUrl.searchParams.get("search") || "" })
        });
        return true;
      }
      if (requested === "/api/ops/staff" && req.method === "POST") {
        sendJson(res, 201, { ok: true, staff: ops.createStaff(await parseJsonBody(req)) });
        return true;
      }
      const staffMatch = requested.match(/^\/api\/ops\/staff\/([^/]+)$/);
      if (staffMatch && req.method === "PATCH") {
        const staff = ops.updateStaff(staffMatch[1], await parseJsonBody(req));
        recordOpsEvent(workspaceId, {
          actor_id: actorUserId,
          role: workspaceRole,
          action: "staff.update",
          target_type: "staff",
          target_id: staffMatch[1],
          outcome: "success"
        });
        sendJson(res, 200, { ok: true, staff });
        return true;
      }
      if (staffMatch && req.method === "DELETE") {
        ops.deleteStaff(staffMatch[1]);
        recordOpsEvent(workspaceId, {
          actor_id: actorUserId,
          role: workspaceRole,
          action: "staff.delete",
          target_type: "staff",
          target_id: staffMatch[1],
          outcome: "success"
        });
        sendJson(res, 200, { ok: true });
        return true;
      }

      const staffProMatch = requested.match(/^\/api\/ops\/staff\/([^/]+)\/(commission|payroll|reviews)$/);
      if (staffProMatch && (req.method === "GET" || req.method === "POST")) {
        ops.assertStaffProFeatureClosed(
          staffProMatch[2] === "commission" ? "العمولة" : staffProMatch[2] === "payroll" ? "كشوف المرتبات" : "المراجعات"
        );
        return true;
      }

      if (requested === "/api/ops/service-categories" && req.method === "GET") {
        sendJson(res, 200, { ok: true, categories: ops.listServiceCategories() });
        return true;
      }
      if (requested === "/api/ops/service-categories" && req.method === "POST") {
        sendJson(res, 201, { ok: true, category: ops.createServiceCategory(await parseJsonBody(req)) });
        return true;
      }
      const categoryMatch = requested.match(/^\/api\/ops\/service-categories\/([^/]+)$/);
      if (categoryMatch && req.method === "PATCH") {
        sendJson(res, 200, { ok: true, category: ops.updateServiceCategory(categoryMatch[1], await parseJsonBody(req)) });
        return true;
      }
      if (categoryMatch && req.method === "DELETE") {
        sendJson(res, 200, { ok: true, ...ops.deleteServiceCategory(categoryMatch[1]) });
        return true;
      }
      if (requested === "/api/ops/services" && req.method === "GET") {
        sendJson(res, 200, {
          ok: true,
          services: ops.listServices(requestUrl.searchParams.get("categoryId") || ""),
          categories: ops.listServiceCategories(),
          staff: ops.listStaff()
        });
        return true;
      }
      if (requested === "/api/ops/services" && req.method === "POST") {
        sendJson(res, 201, { ok: true, service: ops.createService(await parseJsonBody(req)) });
        return true;
      }
      const serviceMatch = requested.match(/^\/api\/ops\/services\/([^/]+)$/);
      if (serviceMatch && req.method === "PATCH") {
        sendJson(res, 200, { ok: true, service: ops.updateService(serviceMatch[1], await parseJsonBody(req)) });
        return true;
      }
      if (serviceMatch && req.method === "DELETE") {
        ops.deleteService(serviceMatch[1]);
        sendJson(res, 200, { ok: true });
        return true;
      }
      const serviceProviderMatch = requested.match(/^\/api\/ops\/services\/([^/]+)\/providers\/([^/]+)$/);
      if (serviceProviderMatch && req.method === "DELETE") {
        sendJson(res, 200, {
          ok: true,
          service: ops.removeServiceProvider(serviceProviderMatch[1], serviceProviderMatch[2])
        });
        return true;
      }
      const serviceProvidersMatch = requested.match(/^\/api\/ops\/services\/([^/]+)\/providers$/);
      if (serviceProvidersMatch && req.method === "POST") {
        const body = await parseJsonBody(req);
        sendJson(res, 200, {
          ok: true,
          service: ops.addServiceProvider(serviceProvidersMatch[1], body.staffId || body.providerId)
        });
        return true;
      }

      if (requested === "/api/ops/uploads/logo" && req.method === "POST") {
        sendJson(res, 201, { ok: true, ...ops.saveUploadedLogo(await parseJsonBody(req)) });
        return true;
      }
      if (requested === "/api/ops/uploads/image" && req.method === "POST") {
        sendJson(res, 201, { ok: true, ...ops.saveUploadedImage(await parseJsonBody(req)) });
        return true;
      }

      if (requested === "/api/ops/activity-templates" && req.method === "GET") {
        sendJson(res, 200, { ok: true, templates: ops.listActivityTemplates() });
        return true;
      }

      if (requested === "/api/ops/working-schedule" && req.method === "GET") {
        sendJson(res, 200, { ok: true, schedule: ops.getWorkingSchedule() });
        return true;
      }
      if (requested === "/api/ops/working-hours" && req.method === "PUT") {
        const payload = await parseJsonBody(req);
        sendJson(res, 200, { ok: true, general: ops.saveWorkingHours(payload.days || payload) });
        return true;
      }
      if (requested === "/api/ops/closed-days" && req.method === "POST") {
        sendJson(res, 201, { ok: true, item: ops.addClosedDay(await parseJsonBody(req)) });
        return true;
      }
      if (requested === "/api/ops/specific-days" && req.method === "POST") {
        sendJson(res, 201, { ok: true, item: ops.addSpecificDay(await parseJsonBody(req)) });
        return true;
      }

      if (requested === "/api/ops/booking-page" && req.method === "GET") {
        sendJson(res, 200, { ok: true, page: ops.getBookingPage() });
        return true;
      }
      if (requested === "/api/ops/booking-page" && req.method === "PUT") {
        sendJson(res, 200, { ok: true, page: ops.updateBookingPage(await parseJsonBody(req)) });
        return true;
      }

      if (publicBookingMatch && req.method === "GET") {
        sendJson(res, 200, { ok: true, ...ops.getPublicBooking(publicBookingMatch[1]) });
        return true;
      }
      if (publicSlotsMatch && req.method === "GET") {
        sendJson(res, 200, {
          ok: true,
          ...await ops.listPublicSlots(publicSlotsMatch[1], {
            date: requestUrl.searchParams.get("date") || "",
            serviceId: requestUrl.searchParams.get("serviceId") || "",
            staffId: requestUrl.searchParams.get("staffId") || "any"
          })
        });
        return true;
      }
      if (publicHoldMatch && req.method === "POST") {
        assertPublicRateLimit(req, "hold", 40);
        sendJson(res, 200, { ok: true, ...await ops.holdPublicSlot(publicHoldMatch[1], await parseJsonBody(req)) });
        return true;
      }
      if (publicBookMatch && req.method === "POST") {
        assertPublicRateLimit(req, "book", 20);
        const body = await parseJsonBody(req);
        const idempotencyKey = bookingAtomic.resolveIdempotencyKeyFromRequest(req, body);
        if (idempotencyKey) body.idempotencyKey = idempotencyKey;
        const appointment = await ops.createPublicAppointment(publicBookMatch[1], body);
        const notifications = ops.getNotificationSettings();
        const page = ops.getBookingPage();
        if (notifications?.email?.confirmation !== false) {
          pendingBookingConfirmation = {
            to: String(body.email || "").trim(),
            businessTo: String(page.email || "").trim(),
            appointment,
            page
          };
        }
        sendJson(res, 201, {
          ok: true,
          appointment,
          passUrl: appointment?.checkInToken
            ? `/pass.html?slug=${encodeURIComponent(publicBookMatch[1])}&token=${encodeURIComponent(appointment.checkInToken)}`
            : null,
          workspaceId: ops.getCurrentWorkspaceId()
        });
        return true;
      }

      if (publicPassMatch && req.method === "GET") {
        assertPublicRateLimit(req, "pass", 60);
        const slug = decodeURIComponent(publicPassMatch[1]);
        const token = decodeURIComponent(publicPassMatch[2]);
        sendJson(res, 200, { ok: true, ...ops.getPublicPass(slug, token) });
        return true;
      }

      if (requested === "/api/ops/desk/today" && req.method === "GET") {
        let desk = ops.listDeskToday({
          categoryId: requestUrl.searchParams.get("categoryId") || "",
          date: requestUrl.searchParams.get("date") || ""
        });
        if (workspaceRole === "staff" && actorStaffLink?.staffId) {
          desk = staffLinks.filterDeskPayload(desk, actorStaffLink.staffId);
        }
        sendJson(res, 200, { ok: true, desk });
        return true;
      }

      if (requested === "/api/ops/desk/preview" && req.method === "POST") {
        const body = await parseJsonBody(req);
        const preview = ops.previewCheckIn(body.token || body.checkInToken);
        if (
          workspaceRole === "staff" &&
          actorStaffLink?.staffId &&
          !staffLinks.appointmentInStaffScope(preview.appointment, actorStaffLink.staffId, {
            allowUnassigned: true
          })
        ) {
          throw denyStaffScope();
        }
        sendJson(res, 200, { ok: true, ...preview });
        return true;
      }

      if (requested === "/api/ops/desk/check-in" && req.method === "POST") {
        const body = await parseJsonBody(req);
        const token = body.token || body.checkInToken;
        const preview = ops.previewCheckIn(token);
        let actorStaffId = body.actorStaffId || "";
        let updates = body.updates || null;
        if (workspaceRole === "staff" && actorStaffLink?.staffId) {
          if (
            !staffLinks.appointmentInStaffScope(preview.appointment, actorStaffLink.staffId, {
              allowUnassigned: true
            })
          ) {
            throw denyStaffScope();
          }
          // Never trust client actorStaffId for staff role — force linked record.
          actorStaffId = actorStaffLink.staffId;
          if (!String(preview.appointment.staffId || "").trim()) {
            updates = { ...(updates || {}), staffId: actorStaffLink.staffId };
          } else if (
            updates?.staffId &&
            String(updates.staffId) !== String(actorStaffLink.staffId)
          ) {
            throw denyStaffScope();
          }
        }
        sendJson(res, 200, {
          ok: true,
          appointment: ops.checkInByToken({
            token,
            actorStaffId,
            updates
          })
        });
        return true;
      }

      const deskAddonMatch = requested.match(/^\/api\/ops\/desk\/appointments\/([^/]+)\/addons$/);
      if (deskAddonMatch && req.method === "POST") {
        const body = await parseJsonBody(req);
        sendJson(res, 200, {
          ok: true,
          appointment: ops.addAppointmentAddon(deskAddonMatch[1], body)
        });
        return true;
      }

      const deskLinePriceMatch = requested.match(
        /^\/api\/ops\/desk\/appointments\/([^/]+)\/lines\/([^/]+)\/pricing$/
      );
      if (deskLinePriceMatch && req.method === "PATCH") {
        const body = await parseJsonBody(req);
        sendJson(res, 200, {
          ok: true,
          appointment: ops.setDeskLinePricing(deskLinePriceMatch[1], deskLinePriceMatch[2], body)
        });
        return true;
      }

      const deskCompleteMatch = requested.match(/^\/api\/ops\/desk\/appointments\/([^/]+)\/complete$/);
      if (deskCompleteMatch && req.method === "POST") {
        const appointmentId = deskCompleteMatch[1];
        if (workspaceRole === "staff" && actorStaffLink?.staffId) {
          const appointment = ops.listAppointments().find((item) => item.id === appointmentId);
          if (
            !staffLinks.appointmentInStaffScope(appointment, actorStaffLink.staffId, {
              allowUnassigned: false
            })
          ) {
            throw denyStaffScope();
          }
        }
        const body = await parseJsonBody(req);
        sendJson(res, 200, {
          ok: true,
          appointment: ops.completeDeskVisit(appointmentId, body)
        });
        return true;
      }

      if (requested === "/api/ops/calendar-preferences" && req.method === "GET") {
        sendJson(res, 200, { ok: true, preferences: ops.getCalendarPreferences() });
        return true;
      }
      if (requested === "/api/ops/calendar-preferences" && req.method === "PUT") {
        sendJson(res, 200, { ok: true, preferences: ops.updateCalendarPreferences(await parseJsonBody(req)) });
        return true;
      }

      if (requested === "/api/ops/notifications" && req.method === "GET") {
        sendJson(res, 200, { ok: true, notifications: ops.getNotificationSettings() });
        return true;
      }
      if (requested === "/api/ops/notifications" && req.method === "PUT") {
        sendJson(res, 200, { ok: true, notifications: ops.updateNotificationSettings(await parseJsonBody(req)) });
        return true;
      }

      if (requested === "/api/ops/expenses" && req.method === "GET") {
        sendJson(res, 200, { ok: true, expenses: ops.listExpenses() });
        return true;
      }
      if (requested === "/api/ops/expenses" && req.method === "POST") {
        sendJson(res, 201, { ok: true, expense: ops.createExpense(await parseJsonBody(req)) });
        return true;
      }

      if (requested === "/api/ops/resources" && req.method === "GET") {
        sendJson(res, 200, {
          ok: true,
          resources: ops.listResources({
            status: requestUrl.searchParams.get("status") || ""
          })
        });
        return true;
      }
      if (requested === "/api/ops/resources" && req.method === "POST") {
        sendJson(res, 201, { ok: true, resource: ops.createResource(await parseJsonBody(req)) });
        return true;
      }
      const resourceMatch = requested.match(/^\/api\/ops\/resources\/([^/]+)$/);
      if (resourceMatch && req.method === "PATCH") {
        sendJson(res, 200, {
          ok: true,
          resource: ops.updateResource(resourceMatch[1], await parseJsonBody(req))
        });
        return true;
      }

      if (requested === "/api/ops/service-resource-requirements" && req.method === "POST") {
        sendJson(res, 201, {
          ok: true,
          requirement: ops.requireServiceResource(await parseJsonBody(req))
        });
        return true;
      }

      if (requested === "/api/ops/session-occurrences" && req.method === "GET") {
        sendJson(res, 200, {
          ok: true,
          occurrences: ops.listSessionOccurrences({
            serviceId: requestUrl.searchParams.get("serviceId") || "",
            status: requestUrl.searchParams.get("status") || ""
          })
        });
        return true;
      }
      if (requested === "/api/ops/session-occurrences" && req.method === "POST") {
        sendJson(res, 201, {
          ok: true,
          occurrence: await ops.createSessionOccurrence(await parseJsonBody(req))
        });
        return true;
      }
      const occurrenceAvailabilityMatch = requested.match(
        /^\/api\/ops\/session-occurrences\/([^/]+)\/availability$/
      );
      if (occurrenceAvailabilityMatch && req.method === "GET") {
        sendJson(res, 200, {
          ok: true,
          availability: ops.getOccurrenceAvailability(occurrenceAvailabilityMatch[1])
        });
        return true;
      }
      const occurrenceEnrollMatch = requested.match(
        /^\/api\/ops\/session-occurrences\/([^/]+)\/enrollments$/
      );
      if (occurrenceEnrollMatch && req.method === "POST") {
        const body = await parseJsonBody(req);
        const idempotencyKey = bookingAtomic.resolveIdempotencyKeyFromRequest(req, body);
        if (idempotencyKey) body.idempotencyKey = idempotencyKey;
        body.occurrenceId = occurrenceEnrollMatch[1];
        sendJson(res, 201, {
          ok: true,
          enrollment: await ops.enrollInOccurrence(body)
        });
        return true;
      }

      const enrollmentCancelMatch = requested.match(/^\/api\/ops\/enrollments\/([^/]+)\/cancel$/);
      if (enrollmentCancelMatch && req.method === "POST") {
        sendJson(res, 200, {
          ok: true,
          ...(await ops.cancelEnrollment(enrollmentCancelMatch[1]))
        });
        return true;
      }
      const enrollmentAttendanceMatch = requested.match(
        /^\/api\/ops\/enrollments\/([^/]+)\/attendance$/
      );
      if (enrollmentAttendanceMatch && req.method === "POST") {
        const body = await parseJsonBody(req);
        body.enrollmentId = enrollmentAttendanceMatch[1];
        sendJson(res, 200, { ok: true, attendance: ops.recordAttendance(body) });
        return true;
      }

      if (requested === "/api/ops/resource-allocations/bundle" && req.method === "POST") {
        const body = await parseJsonBody(req);
        const items = Array.isArray(body.items) ? body.items : Array.isArray(body) ? body : [];
        sendJson(res, 201, {
          ok: true,
          ...(await ops.createBundleAllocations(items))
        });
        return true;
      }

      if (requested === "/api/ops/appointments" && req.method === "GET") {
        sendJson(res, 200, {
          ok: true,
          appointments: ops.listAppointments({
            from: requestUrl.searchParams.get("from") || "",
            to: requestUrl.searchParams.get("to") || ""
          })
        });
        return true;
      }
      if (requested === "/api/ops/appointments" && req.method === "POST") {
        const body = await parseJsonBody(req);
        const idempotencyKey = bookingAtomic.resolveIdempotencyKeyFromRequest(req, body);
        if (idempotencyKey) body.idempotencyKey = idempotencyKey;
        sendJson(res, 201, {
          ok: true,
          appointment: await ops.createAppointmentAsync(body)
        });
        return true;
      }

      const appointmentStatusMatch = requested.match(/^\/api\/ops\/appointments\/([^/]+)\/status$/);
      if (appointmentStatusMatch && req.method === "PATCH") {
        const payload = await parseJsonBody(req);
        sendJson(res, 200, {
          ok: true,
          appointment: ops.updateAppointmentStatus(appointmentStatusMatch[1], payload.status)
        });
        return true;
      }

      const appointmentPricingMatch = requested.match(/^\/api\/ops\/appointments\/([^/]+)\/pricing$/);
      if (appointmentPricingMatch && req.method === "PATCH") {
        const payload = await parseJsonBody(req);
        const appointment = ops.setAppointmentPricing(appointmentPricingMatch[1], payload);
        recordOpsEvent(workspaceId, {
          actor_id: actorUserId,
          role: workspaceRole,
          action: "appointment.pricing_update",
          target_type: "appointment",
          target_id: appointmentPricingMatch[1],
          outcome: "success"
        });
        sendJson(res, 200, { ok: true, appointment });
        return true;
      }

      if (requested === "/api/ops/activity-profile" && req.method === "PUT") {
        const activity = ops.updateActivityProfile(await parseJsonBody(req));
        recordOpsEvent(workspaceId, {
          actor_id: actorUserId,
          role: workspaceRole,
          action: "activity_profile.update",
          target_type: "activity_profile",
          target_id: workspaceId,
          outcome: "success"
        });
        sendJson(res, 200, { ok: true, activity });
        return true;
      }

      if (requested === "/api/ops/stats" && req.method === "GET") {
        sendJson(res, 200, { ok: true, stats: ops.getStatsSummary(localData?.appointments || []) });
        return true;
      }

      return false;
    });

    if (pendingBookingConfirmation) {
      try {
        const { sendBookingConfirmationEmail } = require("./email");
        await sendBookingConfirmationEmail({
          ...pendingBookingConfirmation,
          locale: "ar"
        });
      } catch (error) {
        console.warn("[ops] booking confirmation email failed:", error.message);
      }
    }

    return handled;
  } catch (error) {
    handleOpsError(res, sendJson, error);
    return true;
  }
}

module.exports = { tryHandleOpsApi, isOpsRoleAllowed, isKnownOpsRequest };
