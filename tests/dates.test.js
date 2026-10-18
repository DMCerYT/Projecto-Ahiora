import test from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  isDate,
  occurrenceDates,
  todayInZone,
} from "../shared/dates.js";

const monthly = {
  first_due_date: "2024-01-31",
  recurrence: "monthly",
  recurrence_day: 31,
};
test("monthly dates clamp in February and return to the 31st in March", () => {
  assert.deepEqual(occurrenceDates(monthly, "2024-01-01", "2024-04-30"), [
    "2024-01-31",
    "2024-02-29",
    "2024-03-31",
    "2024-04-30",
  ]);
});
test("non-leap February clamps to the 28th", () => {
  assert.deepEqual(
    occurrenceDates(
      { ...monthly, first_due_date: "2025-01-31" },
      "2025-02-01",
      "2025-02-28",
    ),
    ["2025-02-28"],
  );
});
test("intervals remain anchored across daylight saving boundaries", () => {
  assert.deepEqual(
    occurrenceDates(
      {
        first_due_date: "2026-03-01",
        recurrence: "interval_days",
        interval_days: 7,
      },
      "2026-03-01",
      "2026-03-22",
    ),
    ["2026-03-01", "2026-03-08", "2026-03-15", "2026-03-22"],
  );
  assert.equal(addDays("2026-11-01", 1), "2026-11-02");
});
test("weekly and yearly recurrence retain their anchor", () => {
  assert.deepEqual(
    occurrenceDates(
      { first_due_date: "2026-10-01", recurrence: "weekly" },
      "2026-10-10",
      "2026-10-22",
    ),
    ["2026-10-15", "2026-10-22"],
  );
  assert.deepEqual(
    occurrenceDates(
      { first_due_date: "2024-02-29", recurrence: "yearly" },
      "2025-01-01",
      "2028-12-31",
    ),
    ["2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"],
  );
});
test("one-time bills are not repeated or backdated before their anchor", () => {
  assert.deepEqual(
    occurrenceDates(
      { first_due_date: "2026-10-18", recurrence: "once" },
      "2026-10-01",
      "2026-10-31",
    ),
    ["2026-10-18"],
  );
  assert.deepEqual(occurrenceDates(monthly, "2023-01-01", "2023-12-31"), []);
});
test("date validation rejects rollover and business date respects the time zone", () => {
  assert.equal(isDate("2026-02-29"), false);
  assert.equal(isDate("2024-02-29"), true);
  assert.equal(
    todayInZone("America/New_York", new Date("2026-10-18T02:00:00Z")),
    "2026-10-17",
  );
  assert.throws(() =>
    occurrenceDates(
      {
        first_due_date: "2026-10-01",
        recurrence: "interval_days",
        interval_days: 0,
      },
      "2026-10-01",
      "2026-10-31",
    ),
  );
});
