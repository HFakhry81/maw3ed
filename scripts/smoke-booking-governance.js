#!/usr/bin/env node
/**
 * Governance smoke: closed/specific days, staff hours, delete guards, public provider rule.
 */
const path = require("path");
const storeModule = path.join(__dirname, "..", "opsStore.js");
delete require.cache[require.resolve(storeModule)];
const ops = require(storeModule);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  await ops.withWorkspaceAsync(ops.DEFAULT_WORKSPACE_ID, async () => {
    ops.resetOpsData();
    const slug = ops.getBookingPage().slug;
    const service = ops.listServices()[0];
    const staff = ops.listStaff()[0];
    const date = "2099-06-15";

    ops.addClosedDay({ startDate: date, endDate: date, description: "إجازة" });
    const closedSlots = await ops.listPublicSlots(slug, { date, serviceId: service.id, staffId: staff.id });
    assert(closedSlots.slots.length === 0, "closed day must yield zero slots");

    ops.resetOpsData();
    const slug2 = ops.getBookingPage().slug;
    const service2 = ops.listServices()[0];
    const staff2 = ops.listStaff()[0];
    ops.addSpecificDay({
      title: "دوام قصير",
      startDate: date,
      endDate: date,
      opensAt: "10:00",
      closesAt: "12:00"
    });
    const specificSlots = await ops.listPublicSlots(slug2, { date, serviceId: service2.id, staffId: staff2.id });
    assert(specificSlots.slots.length > 0, "specific day should open slots");
    assert(
      specificSlots.slots.every((slot) => slot.time >= "10:00" && slot.time < "12:00"),
      "specific hours window"
    );

    ops.resetOpsData();
    const s3 = ops.getBookingPage().slug;
    const svc3 = ops.listServices()[0];
    const st3 = ops.listStaff()[0];
    ops.updateStaff(st3.id, {
      useBusinessHours: false,
      workingHours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        isOpen: weekday === 1,
        opensAt: "11:00",
        closesAt: "13:00",
        breakEnabled: false
      }))
    });
    const mondayDate = (() => {
      const d = new Date("2099-06-01T12:00:00");
      while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
      return d.toISOString().slice(0, 10);
    })();
    const staffSlots = await ops.listPublicSlots(s3, { date: mondayDate, serviceId: svc3.id, staffId: st3.id });
    assert(staffSlots.slots.length > 0, "custom staff hours should open");
    assert(
      staffSlots.slots.every((slot) => slot.time >= "11:00" && slot.time < "13:00"),
      "staff custom window"
    );

    let providerErr = null;
    try {
      ops.createService({
        name: "خدمة بلا موظف",
        categoryId: svc3.categoryId,
        publicBooking: true,
        providerIds: []
      });
    } catch (error) {
      providerErr = error;
    }
    assert(providerErr && providerErr.statusCode === 400, "public service needs provider");

    const slots = await ops.listPublicSlots(s3, { date: mondayDate, serviceId: svc3.id, staffId: st3.id });
    assert(slots.slots.length > 0, "need slot for delete guard");
    await ops.createPublicAppointment(s3, {
      serviceId: svc3.id,
      staffId: st3.id,
      date: mondayDate,
      time: slots.slots[0].time,
      customerName: "حوكمة اختبار",
      phone: "01099990001"
    });
    let deleteErr = null;
    try {
      ops.deleteStaff(st3.id);
    } catch (error) {
      deleteErr = error;
    }
    assert(deleteErr && deleteErr.statusCode === 409, "staff with future appts cannot delete");

    console.log(
      JSON.stringify(
        { ok: true, suite: "smoke-booking-governance", mondayDate, staffSlotCount: staffSlots.slots.length },
        null,
        2
      )
    );
  });
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, suite: "smoke-booking-governance", error: error.message }, null, 2));
  process.exit(1);
});
