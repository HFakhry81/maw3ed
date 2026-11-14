#!/usr/bin/env node
const { localDateString, civilDateInTimeZone } = require("../civilDate");
const { addCalendarDays } = require("../shiftHours");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function main() {
  process.env.TZ = "Pacific/Kiritimati";

  const instant = new Date("2026-11-14T12:30:00.000Z");
  assert(localDateString(instant) === "2026-11-15", "local civil date should not use the UTC date");
  assert(
    civilDateInTimeZone(instant, "Africa/Cairo") === "2026-11-14",
    "timezone civil date should be formatted as YYYY-MM-DD"
  );
  assert(
    addCalendarDays("2026-11-14", 1) === "2026-11-15",
    "calendar-day arithmetic should preserve the target date across UTC offsets"
  );

  console.log(JSON.stringify({ ok: true, suite: "smoke-civil-date" }));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(JSON.stringify({ ok: false, suite: "smoke-civil-date", error: String(error.message || error) }));
    process.exit(1);
  }
}
