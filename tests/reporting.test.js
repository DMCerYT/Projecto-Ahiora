import test from "node:test";
import assert from "node:assert/strict";
import { financialTotals, inPeriod, periodStart } from "../shared/reporting.js";

test("report periods use calendar YTD and month plus clamped rolling months", () => {
  assert.equal(periodStart("2026-10-18", "ytd"), "2026-01-01");
  assert.equal(periodStart("2026-10-18", "month"), "2026-10-01");
  assert.equal(periodStart("2026-05-31", "threeMonths"), "2026-02-28");
  assert.equal(periodStart("2024-02-29", "year"), "2023-02-28");
  assert.equal(
    inPeriod({ date: "2026-10-19" }, "2026-10-18", "lifetime"),
    false,
  );
  assert.equal(
    inPeriod({ date: "2026-07-18" }, "2026-10-18", "threeMonths"),
    true,
  );
  assert.equal(
    inPeriod({ date: "2026-07-17" }, "2026-10-18", "threeMonths"),
    false,
  );
});
test("period totals retain separate income and refunds, ignore voids, and apply budget once", () => {
  const tx = (type, amount_cents, status = "recorded") => ({
    type,
    amount_cents,
    status,
  });
  const result = financialTotals(
    [
      tx("expense", 500),
      tx("income", 300),
      tx("refund", 100),
      tx("expense", 900, "void"),
    ],
    1000,
  );
  assert.deepEqual(result, {
    expense_cents: 500,
    income_cents: 300,
    refund_cents: 100,
    net_cents: -100,
    available_cents: 900,
  });
  assert.equal(financialTotals([]).available_cents, 0);
});
