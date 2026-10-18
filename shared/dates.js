export function isDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}
export function todayInZone(timeZone = "America/New_York", now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function addDays(date, count) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
}
export function monthBounds(month) {
  const [year, number] = month.split("-").map(Number);
  return {
    start: `${month}-01`,
    end: new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10),
  };
}
function clampedDate(year, monthIndex, day) {
  return new Date(
    Date.UTC(
      year,
      monthIndex,
      Math.min(day, new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()),
    ),
  )
    .toISOString()
    .slice(0, 10);
}
// Date-only UTC arithmetic avoids DST changes and never advances from a payment date.
export function occurrenceDates(bill, start, end) {
  const anchor = bill.first_due_date;
  if (!isDate(anchor) || !isDate(start) || !isDate(end) || end < anchor)
    return [];
  const lower = start > anchor ? start : anchor;
  if (bill.recurrence === "once")
    return anchor >= lower && anchor <= end ? [anchor] : [];
  const dates = [];
  const [anchorYear, anchorMonth, anchorDay] = anchor.split("-").map(Number);
  if (bill.recurrence === "monthly" || bill.recurrence === "yearly") {
    const [startYear, startMonth] = lower.split("-").map(Number);
    let offset = Math.max(
      0,
      (startYear - anchorYear) * 12 + startMonth - anchorMonth,
    );
    if (bill.recurrence === "yearly") offset = Math.floor(offset / 12) * 12;
    const step = bill.recurrence === "yearly" ? 12 : 1;
    for (let count = 0; count < 2400; count++, offset += step) {
      const date = clampedDate(
        anchorYear,
        anchorMonth - 1 + offset,
        bill.recurrence === "monthly" ? bill.recurrence_day : anchorDay,
      );
      if (date > end) break;
      if (date >= lower) dates.push(date);
    }
  } else {
    const step = bill.recurrence === "weekly" ? 7 : bill.interval_days;
    if (!Number.isSafeInteger(step) || step < 1)
      throw new Error("Invalid recurrence interval");
    const elapsedDays =
      (Date.parse(`${lower}T00:00:00Z`) - Date.parse(`${anchor}T00:00:00Z`)) /
      86400000;
    let date = addDays(anchor, Math.ceil(elapsedDays / step) * step);
    for (
      let count = 0;
      count < 50000 && date <= end;
      count++, date = addDays(date, step)
    )
      dates.push(date);
  }
  return dates;
}
