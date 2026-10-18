import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../server/db.js";
import { FinanceStore, cents } from "../server/domain.js";
import { seedDemo } from "../server/demo.js";
import { buildCalendarEvents } from "../shared/calendar.js";
import { translations } from "../src/i18n/translations.js";

let db, store, demo, uploadDir;
beforeEach(() => {
  db = openDatabase(":memory:");
  uploadDir = mkdtempSync(join(tmpdir(), "ahiora-domain-"));
  store = new FinanceStore(db, {
    uploadDir,
    now: () => new Date("2026-10-18T16:00:00Z"),
  });
  demo = seedDemo(db, { today: "2026-10-18", uploadDir });
});
afterEach(() => {
  db.close();
  rmSync(uploadDir, { recursive: true, force: true });
});
const code = (expected) => (error) => error.code === expected;
const txBody = (reference) => ({
  project_id: demo.project.id,
  name: "Test purchase",
  date: "2026-10-18",
  amount: "10.25",
  type: "expense",
  reference,
});
const firstMonthly = () =>
  db
    .prepare(
      "SELECT * FROM bill_occurrences WHERE bill_id = ? ORDER BY due_date",
    )
    .get(demo.monthly.id);
const paymentBody = (extra = {}) => ({
  amount: "300",
  payment_date: "2026-10-18",
  status: "processing",
  billing_account_id: demo.account.id,
  reference: { reference_number: "PAY-TEST" },
  ...extra,
});
const project = (id) =>
  store.workspace(demo.owner).projects.find((row) => row.id === id);

test("fresh schema removes legacy financial tables and passes all foreign keys", () => {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map((row) => row.name);
  for (const name of [
    "incomes",
    "expenses",
    "providers",
    "employees",
    "client_charges",
    "debts",
    "attachments",
    "bill_payments",
  ])
    assert.equal(tables.includes(name), false);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
});
test("balances derive from expenses, income, and refunds in integer cents", () => {
  assert.equal(project(demo.project.id).available_cents, 925000);
  assert.equal(cents("0.29"), 29);
  assert.equal(cents("10.01"), 1001);
  assert.throws(() => cents("1.001"), code("invalidAmount"));
  assert.throws(() => cents("-2"), code("invalidAmount"));
  assert.throws(() => cents("1e3"), code("invalidAmount"));
});
test("transactions require real explicit evidence rather than a creation timestamp", () => {
  for (const reference of [
    undefined,
    {},
    { reference_number: "   " },
    { created_at: "2026-10-18T00:00:00Z" },
  ])
    assert.throws(
      () => store.createTransaction(demo.owner, txBody(reference)),
      code("evidenceRequired"),
    );
  assert.equal(project(demo.project.id).available_cents, 925000);
});
test("number-only, timestamp-only, and file-only references are accepted", () => {
  for (const reference of [
    { reference_number: "R-1" },
    { evidence_at: "2026-10-18T12:30:00Z" },
    {
      files: [
        {
          name: "receipt.txt",
          type: "text/plain",
          data: Buffer.from("receipt").toString("base64"),
        },
      ],
    },
  ]) {
    const { id } = store.createTransaction(demo.owner, txBody(reference));
    assert.equal(
      db
        .prepare(
          "SELECT count(*) AS n FROM evidence_references WHERE transaction_id = ?",
        )
        .get(id).n,
      1,
    );
  }
  assert.equal(project(demo.project.id).available_cents, 925000 - 3075);
});

test("evidence timestamps must contain a valid date and explicit time zone", () => {
  for (const evidence_at of [
    "2026-02-30T12:00:00Z",
    "2026-10-18",
    "2026-10-18T12:00:00",
  ]) {
    assert.throws(
      () => store.createTransaction(demo.owner, txBody({ evidence_at })),
      code("invalidDate"),
    );
  }
});
test("malformed evidence and failed transactions do not leave files or rows behind", () => {
  const before = readdirSync(uploadDir);
  assert.throws(
    () =>
      store.createTransaction(
        demo.owner,
        txBody({ files: [{ name: "bad", data: "??" }] }),
      ),
    code("invalidFile"),
  );
  db.exec(
    "CREATE TRIGGER fail_transaction BEFORE INSERT ON transactions BEGIN SELECT RAISE(ABORT, 'simulated failure'); END",
  );
  assert.throws(
    () =>
      store.createTransaction(
        demo.owner,
        txBody({ files: [{ name: "receipt", data: "aGVsbG8=" }] }),
      ),
    /simulated failure/,
  );
  assert.deepEqual(readdirSync(uploadDir), before);
});
test("the database rejects a transaction without its own primary reference", () => {
  assert.throws(
    () =>
      db
        .prepare(
          "INSERT INTO transactions (id,business_id,project_id,name,date,amount_cents,type,primary_reference_id,created_by) VALUES ('bad',?,?, 'Bad','2026-10-18',100,'expense',NULL,?)",
        )
        .run(demo.owner.business_id, demo.project.id, demo.owner.id),
    /NOT NULL/,
  );
  const foreignReference = db
    .prepare("SELECT primary_reference_id FROM transactions WHERE id = ?")
    .get(demo.expense.id).primary_reference_id;
  assert.throws(() =>
    db
      .prepare(
        "INSERT INTO transactions (id,business_id,project_id,name,date,amount_cents,type,primary_reference_id,created_by) VALUES ('bad',?,?, 'Bad','2026-10-18',100,'expense',?,?)",
      )
      .run(
        demo.owner.business_id,
        demo.project.id,
        foreignReference,
        demo.owner.id,
      ),
  );
});
test("processing payments create no expense; processing once creates exactly one shared-evidence expense", () => {
  assert.equal(project(demo.second.id).available_cents, 1950000);
  assert.equal(project(demo.second.id).projected_cents, 1925000);
  const result = store.updatePayment(demo.owner, demo.processingPayment.id, {
    status: "processed",
  });
  assert.equal(project(demo.second.id).available_cents, 1925000);
  assert.equal(project(demo.second.id).projected_cents, 1925000);
  const reference = db
    .prepare("SELECT * FROM evidence_references WHERE occurrence_id = ?")
    .get(demo.processingOccurrence.id);
  assert.equal(reference.transaction_id, result.transaction_id);
  assert.equal(
    store.updatePayment(demo.owner, result.id, { status: "processed" })
      .transaction_id,
    result.transaction_id,
  );
  assert.equal(
    db
      .prepare("SELECT count(*) AS n FROM transactions WHERE id = ?")
      .get(result.transaction_id).n,
    1,
  );
});
test("duplicate payment submissions cannot double-book an expense", () => {
  const occurrence = firstMonthly();
  const one = store.createPayment(
    demo.owner,
    occurrence.id,
    paymentBody({ status: "processed" }),
  );
  const two = store.createPayment(
    demo.owner,
    occurrence.id,
    paymentBody({ status: "processed" }),
  );
  assert.equal(one.id, two.id);
  assert.equal(one.transaction_id, two.transaction_id);
  assert.equal(project(demo.project.id).available_cents, 895000);
});
test("payments require evidence, the correct business account, and the full amount", () => {
  const occurrence = firstMonthly();
  assert.throws(
    () =>
      store.createPayment(
        demo.owner,
        occurrence.id,
        paymentBody({ reference: {} }),
      ),
    code("evidenceRequired"),
  );
  assert.throws(
    () =>
      store.createPayment(
        demo.owner,
        occurrence.id,
        paymentBody({ amount: "10" }),
      ),
    code("fullPaymentRequired"),
  );
  assert.throws(
    () =>
      store.createPayment(
        demo.owner,
        occurrence.id,
        paymentBody({ billing_account_id: "foreign" }),
      ),
    code("notFound"),
  );
  assert.equal(
    db
      .prepare("SELECT count(*) AS n FROM payments WHERE occurrence_id = ?")
      .get(occurrence.id).n,
    0,
  );
});
test("failed payments retain evidence and allow retry without creating an expense", () => {
  store.updatePayment(demo.owner, demo.processingPayment.id, {
    status: "failed",
  });
  assert.equal(
    db
      .prepare("SELECT status FROM bill_occurrences WHERE id = ?")
      .get(demo.processingOccurrence.id).status,
    "unpaid",
  );
  assert.equal(project(demo.second.id).available_cents, 1950000);
  store.updatePayment(demo.owner, demo.processingPayment.id, {
    status: "processing",
  });
  store.updatePayment(demo.owner, demo.processingPayment.id, {
    status: "processed",
  });
  assert.throws(
    () =>
      store.updatePayment(demo.owner, demo.processingPayment.id, {
        status: "failed",
      }),
    code("processedLocked"),
  );
});
test("paying a recurring bill retains its due date and later occurrences", () => {
  const occurrence = firstMonthly();
  store.createPayment(
    demo.owner,
    occurrence.id,
    paymentBody({ status: "processed", payment_date: "2026-11-04" }),
  );
  const data = store.workspace(demo.owner, "2026-12");
  assert.equal(
    data.occurrences.find((row) => row.id === occurrence.id).due_date,
    "2026-10-31",
  );
  assert.equal(
    data.occurrences.find((row) => row.id === occurrence.id).status,
    "paid",
  );
  assert.deepEqual(
    data.occurrences
      .filter((row) => row.bill_id === demo.monthly.id)
      .map((row) => row.due_date)
      .sort(),
    ["2026-10-31", "2026-11-30", "2026-12-31"],
  );
  assert.equal(
    db
      .prepare("SELECT first_due_date FROM bills WHERE id = ?")
      .get(demo.monthly.id).first_due_date,
    "2026-10-31",
  );
});
test("exploring distant calendar months does not change the 30-day projected balance", () => {
  const before = project(demo.project.id).projected_cents;
  store.workspace(demo.owner, "2028-10");
  assert.equal(project(demo.project.id).projected_cents, before);
});
test("pausing a bill preserves paid history and cancels future unpaid dates", () => {
  const occurrence = firstMonthly();
  store.createPayment(
    demo.owner,
    occurrence.id,
    paymentBody({ status: "processed" }),
  );
  store.pauseBill(demo.owner, demo.monthly.id);
  const data = store.workspace(demo.owner, "2026-12");
  const rows = data.occurrences.filter(
    (row) => row.bill_id === demo.monthly.id,
  );
  assert.equal(rows.find((row) => row.id === occurrence.id).status, "paid");
  assert.equal(
    rows.find((row) => row.due_date === "2026-11-30").status,
    "canceled",
  );
  assert.equal(
    rows.some((row) => row.due_date === "2026-12-31"),
    false,
  );
});
test("contractors have multiple project assignments without login identities", () => {
  const contractor = store
    .workspace(demo.owner)
    .contractors.find((row) => row.id === demo.contractor.id);
  assert.deepEqual(
    new Set(contractor.project_ids),
    new Set([demo.project.id, demo.second.id]),
  );
  assert.equal(
    db.prepare("SELECT 1 FROM users WHERE email = ?").get(contractor.email),
    undefined,
  );
  assert.throws(
    () =>
      store.saveMember(demo.owner, {
        name: "No login",
        email: "a@example.com",
        password: "Password123",
        role: "contractor",
      }),
    code("invalidOption"),
  );
});
test("employees can see and comment only on assigned projects and cannot manage finances", () => {
  const employee = db
    .prepare("SELECT * FROM users WHERE id = ?")
    .get(demo.employee.id);
  const data = store.workspace(employee);
  assert.deepEqual(
    data.projects.map((row) => row.id),
    [demo.project.id],
  );
  assert.ok(
    data.transactions.every((row) => row.project_id === demo.project.id),
  );
  assert.ok(
    data.contractors.every((row) =>
      row.project_ids.every((id) => id === demo.project.id),
    ),
  );
  assert.deepEqual(data.billing_accounts, []);
  assert.deepEqual(data.team, []);
  assert.throws(
    () => store.createTransaction(employee, txBody({ reference_number: "R" })),
    code("forbidden"),
  );
  assert.throws(
    () =>
      store.saveComment(employee, {
        project_id: demo.second.id,
        text: "No access",
      }),
    code("notFound"),
  );
  store.saveComment(employee, { project_id: demo.project.id, text: "Allowed" });
});
test("business ownership and foreign-key relationships prevent cross-business access", () => {
  const outsider = store.createBusiness({
    name: "Other owner",
    business_name: "Other business",
    email: "other@example.com",
    password: "Password123",
  });
  const foreignProject = store.saveProject(outsider, {
    name: "Private",
    start_date: "2026-10-18",
    budget: "50",
  });
  assert.throws(
    () =>
      store.createTransaction(demo.owner, {
        ...txBody({ reference_number: "R" }),
        project_id: foreignProject.id,
      }),
    code("notFound"),
  );
  assert.throws(
    () =>
      store.saveContractor(demo.owner, {
        name: "Contact",
        phone: "123",
        project_ids: [foreignProject.id],
      }),
    code("notFound"),
  );
  assert.throws(
    () =>
      store.saveComment(outsider, {
        transaction_id: demo.expense.id,
        text: "No",
      }),
    code("notFound"),
  );
  assert.equal(store.workspace(outsider).transactions.length, 0);
  assert.throws(
    () =>
      db
        .prepare("INSERT INTO contractor_projects VALUES (?, ?, ?)")
        .run(demo.owner.business_id, demo.contractor.id, foreignProject.id),
    /FOREIGN KEY/,
  );
});
test("admins cannot promote employees or change owners, and employees report to their owner", () => {
  const admin = db
    .prepare("SELECT * FROM users WHERE id = ?")
    .get(demo.admin.id);
  assert.throws(
    () =>
      store.saveMember(admin, {
        name: "Other admin",
        email: "new@example.com",
        password: "Password123",
        role: "admin",
      }),
    code("forbidden"),
  );
  assert.throws(
    () => store.saveMember(demo.owner, { role: "employee" }, demo.owner.id),
    code("ownerLocked"),
  );
  assert.equal(
    store.workspace(demo.owner).team.find((row) => row.id === demo.employee.id)
      .reports_to,
    demo.owner.id,
  );
});
test("comments have exactly one target and only authors can edit them", () => {
  assert.throws(
    () =>
      store.saveComment(demo.owner, {
        project_id: demo.project.id,
        transaction_id: demo.expense.id,
        text: "Both",
      }),
    code("commentTarget"),
  );
  const { id } = store.saveComment(demo.owner, {
    project_id: demo.project.id,
    text: "Initial",
  });
  const admin = db
    .prepare("SELECT * FROM users WHERE id = ?")
    .get(demo.admin.id);
  assert.throws(
    () => store.saveComment(admin, { text: "Changed" }, id),
    code("forbidden"),
  );
  store.saveComment(demo.owner, { text: "Edited" }, id);
  assert.equal(
    db.prepare("SELECT edited_at FROM comments WHERE id = ?").get(id).edited_at,
    "2026-10-18T16:00:00.000Z",
  );
});
test("voiding preserves evidence, reverses the balance, and retains an audit event", () => {
  store.voidTransaction(demo.owner, demo.expense.id);
  assert.equal(project(demo.project.id).available_cents, 1125000);
  assert.equal(
    db
      .prepare(
        "SELECT count(*) AS n FROM evidence_references WHERE transaction_id = ?",
      )
      .get(demo.expense.id).n,
    1,
  );
  assert.ok(
    db
      .prepare(
        "SELECT 1 FROM audit_events WHERE action = 'transaction.voided' AND entity_id = ?",
      )
      .get(demo.expense.id),
  );
  assert.throws(
    () => store.voidTransaction(demo.owner, demo.payment.transaction_id),
    code("paymentTransactionLocked"),
  );
});
test("attachments inherit project access and all new evidence stays attached to a target", () => {
  const file = db.prepare("SELECT * FROM file_attachments LIMIT 1").get();
  const employee = db
    .prepare("SELECT * FROM users WHERE id = ?")
    .get(demo.employee.id);
  assert.ok(store.attachment(demo.owner, file.id));
  assert.throws(() => store.attachment(employee, file.id), code("notFound"));
  assert.throws(
    () => store.addReference(demo.owner, { reference_number: "orphan" }),
    code("referenceTarget"),
  );
});
test("calendar keeps due dates and payment events without double-counting payment expenses", () => {
  const data = store.workspace(demo.owner),
    events = buildCalendarEvents(data);
  assert.equal(
    events.some(
      (event) => event.id === `transaction-${demo.payment.transaction_id}`,
    ),
    false,
  );
  assert.equal(
    events.filter((event) => event.id === `payment-${demo.payment.id}`).length,
    1,
  );
  assert.ok(
    events.find((event) => event.kind === "billDue" && event.status === "paid"),
  );
  assert.ok(
    events.find(
      (event) => event.kind === "payment" && event.status === "processing",
    ),
  );
});
test("English and Spanish dictionaries have identical keys", () => {
  const keys = (object, prefix = "") =>
    Object.entries(object)
      .flatMap(([key, value]) =>
        typeof value === "object"
          ? keys(value, `${prefix}${key}.`)
          : [`${prefix}${key}`],
      )
      .sort();
  assert.deepEqual(keys(translations.en), keys(translations.es));
});
