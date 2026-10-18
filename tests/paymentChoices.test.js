import test from "node:test";
import assert from "node:assert/strict";
import { unpaidBillChoices } from "../shared/paymentChoices.js";

function fixture() {
  return {
    today: "2026-10-18",
    projects: [
      { id: "project", status: "active" },
      { id: "archive", status: "archived" },
    ],
    bills: [
      { id: "bill", project_id: "project", name: "Rent" },
      { id: "archived-bill", project_id: "archive", name: "Old rent" },
    ],
    occurrences: [
      {
        id: "unpaid",
        bill_id: "bill",
        status: "unpaid",
        due_date: "2026-10-20",
      },
      {
        id: "overdue",
        bill_id: "bill",
        status: "unpaid",
        due_date: "2026-10-01",
      },
      {
        id: "processing",
        bill_id: "bill",
        status: "processing",
        due_date: "2026-10-02",
      },
      { id: "paid", bill_id: "bill", status: "paid", due_date: "2026-10-03" },
      {
        id: "canceled",
        bill_id: "bill",
        status: "canceled",
        due_date: "2026-10-04",
      },
      {
        id: "archived",
        bill_id: "archived-bill",
        status: "unpaid",
        due_date: "2026-10-05",
      },
    ],
    payments: [],
  };
}

test("bill selection offers unpaid and overdue obligations, with the oldest first", () => {
  assert.deepEqual(
    unpaidBillChoices(fixture()).map(({ row }) => row.id),
    ["overdue", "unpaid"],
  );
});
test("failed attempts resume their existing record instead of creating another payment", () => {
  const data = fixture();
  data.payments = [
    { id: "failed-attempt", occurrence_id: "unpaid", status: "failed" },
  ];
  assert.equal(
    unpaidBillChoices(data).find(({ row }) => row.id === "unpaid").payment.id,
    "failed-attempt",
  );
});
test("processing or processed payment records cannot be offered for a second payment", () => {
  const data = fixture();
  data.payments = [
    { occurrence_id: "unpaid", status: "processed" },
    { occurrence_id: "overdue", status: "processing" },
  ];
  assert.deepEqual(unpaidBillChoices(data), []);
});
test("bill selection cannot recover projects omitted by the permission-filtered workspace", () => {
  const data = fixture();
  data.projects = [];
  assert.deepEqual(unpaidBillChoices(data), []);
});

test("only the nearest upcoming unpaid installment per schedule is offered, even after browsing later months", () => {
  const data = fixture();
  data.occurrences.push(
    {
      id: "november",
      bill_id: "bill",
      status: "unpaid",
      due_date: "2026-11-20",
    },
    {
      id: "december",
      bill_id: "bill",
      status: "unpaid",
      due_date: "2026-12-20",
    },
  );
  assert.deepEqual(
    unpaidBillChoices(data).map(({ row }) => row.id),
    ["overdue", "unpaid"],
  );
});
test("all missed installments are offered alongside one upcoming installment, independently per schedule", () => {
  const data = fixture();
  data.bills.push({ id: "card", project_id: "project", name: "Credit card" });
  data.occurrences.push(
    { id: "older", bill_id: "bill", status: "unpaid", due_date: "2026-09-01" },
    {
      id: "card-now",
      bill_id: "card",
      status: "unpaid",
      due_date: "2026-10-18",
    },
    {
      id: "card-later",
      bill_id: "card",
      status: "unpaid",
      due_date: "2026-11-18",
    },
  );
  assert.deepEqual(
    unpaidBillChoices(data).map(({ row }) => row.id),
    ["older", "overdue", "card-now", "unpaid"],
  );
});
test("paying the current installment reveals the next eligible unpaid installment", () => {
  const data = fixture();
  data.occurrences.find((row) => row.id === "unpaid").status = "paid";
  data.occurrences.push({
    id: "next",
    bill_id: "bill",
    status: "unpaid",
    due_date: "2026-11-20",
  });
  assert.deepEqual(
    unpaidBillChoices(data).map(({ row }) => row.id),
    ["overdue", "next"],
  );
});
