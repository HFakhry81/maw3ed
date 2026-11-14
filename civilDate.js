function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function civilDateInTimeZone(instant = new Date(), timeZone = "Africa/Cairo") {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timeZone || "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(instant instanceof Date ? instant : new Date(instant));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

module.exports = { localDateString, civilDateInTimeZone };
