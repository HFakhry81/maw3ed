const ops = require("./opsStore");

function handleOpsError(res, sendJson, error) {
  const status = error.statusCode || 500;
  return sendJson(res, status, { ok: false, error: error.message || "Ops error" });
}

async function tryHandleOpsApi({ requested, req, res, requestUrl, sendJson, parseJsonBody, localData }) {
  try {
    if (requested === "/api/ops/bootstrap" && req.method === "GET") {
      sendJson(res, 200, {
        ok: true,
        customers: ops.listCustomers(),
        customerCategories: ops.listCustomerCategories(),
        staff: ops.listStaff(),
        serviceCategories: ops.listServiceCategories(),
        services: ops.listServices(),
        schedule: ops.getWorkingSchedule(),
        bookingPage: ops.getBookingPage(),
        calendarPreferences: ops.getCalendarPreferences(),
        notifications: ops.getNotificationSettings(),
        expenses: ops.listExpenses(),
        appointments: ops.listAppointments(),
        stats: ops.getStatsSummary(localData?.appointments || []),
        activity: ops.getActivityProfile(),
        planUsage: ops.getPlanUsage()
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
      sendJson(res, 200, { ok: true, staff: ops.updateStaff(staffMatch[1], await parseJsonBody(req)) });
      return true;
    }
    if (staffMatch && req.method === "DELETE") {
      ops.deleteStaff(staffMatch[1]);
      sendJson(res, 200, { ok: true });
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
    if (serviceMatch && req.method === "DELETE") {
      ops.deleteService(serviceMatch[1]);
      sendJson(res, 200, { ok: true });
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

    const publicBookingMatch = requested.match(/^\/api\/public\/booking\/([^/]+)$/);
    if (publicBookingMatch && req.method === "GET") {
      sendJson(res, 200, { ok: true, ...ops.getPublicBooking(publicBookingMatch[1]) });
      return true;
    }
    const publicBookMatch = requested.match(/^\/api\/public\/booking\/([^/]+)\/appointments$/);
    if (publicBookMatch && req.method === "POST") {
      sendJson(res, 201, {
        ok: true,
        appointment: ops.createPublicAppointment(publicBookMatch[1], await parseJsonBody(req))
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
      sendJson(res, 201, { ok: true, appointment: ops.createAppointment(await parseJsonBody(req)) });
      return true;
    }


    if (requested === "/api/ops/activity-profile" && req.method === "PUT") {
      sendJson(res, 200, { ok: true, activity: ops.updateActivityProfile(await parseJsonBody(req)) });
      return true;
    }

    if (requested === "/api/ops/stats" && req.method === "GET") {
      sendJson(res, 200, { ok: true, stats: ops.getStatsSummary(localData?.appointments || []) });
      return true;
    }

    return false;
  } catch (error) {
    handleOpsError(res, sendJson, error);
    return true;
  }
}

module.exports = { tryHandleOpsApi };
