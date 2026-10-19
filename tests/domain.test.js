import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
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
test("receipt IDs are required for expenses while reference dates and attachments are optional", () => {
  const file = {
    name: "receipt.txt",
    type: "text/plain",
    data: Buffer.from("receipt").toString("base64"),
  };
  for (const reference of [{ evidence_at: "2026-10-18" }, { files: [file] }])
    assert.throws(
      () => store.createTransaction(demo.owner, txBody(reference)),
      code("evidenceRequired"),
    );
  for (const reference of [
    { reference_number: "R-1" },
    { reference_number: "R-2", files: [file] },
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
  assert.equal(project(demo.project.id).available_cents, 925000 - 2050);
});

test("references accept dates without times and reject invalid dates and timestamps", () => {
  const { id } = store.createTransaction(
    demo.owner,
    txBody({ reference_number: "DATE-ONLY", evidence_at: "2026-10-18" }),
  );
  assert.equal(
    db
      .prepare(
        "SELECT evidence_at FROM evidence_references WHERE transaction_id = ?",
      )
      .get(id).evidence_at,
    "2026-10-18",
  );
  for (const evidence_at of [
    "2026-02-30",
    "2026-10-18T12:00:00Z",
    "2026-10-18T12:00:00",
  ]) {
    assert.throws(
      () =>
        store.createTransaction(
          demo.owner,
          txBody({ reference_number: "BAD-DATE", evidence_at }),
        ),
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
        txBody({
          reference_number: "R-test",
          files: [{ name: "bad", data: "??" }],
        }),
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
        txBody({
          reference_number: "R-test",
          files: [{ name: "receipt", data: "aGVsbG8=" }],
        }),
      ),
    /simulated failure/,
  );
  assert.deepEqual(readdirSync(uploadDir), before);
});
test("the database requires a primary reference for non-rent transactions", () => {
  assert.throws(
    () =>
      db
        .prepare(
          "INSERT INTO transactions (id,business_id,project_id,name,date,amount_cents,type,primary_reference_id,created_by) VALUES ('bad',?,?, 'Bad','2026-10-18',100,'expense',NULL,?)",
        )
        .run(demo.owner.business_id, demo.project.id, demo.owner.id),
    /CHECK constraint failed/,
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
  assert.equal(project(demo.second.id).projected_cents, 1950000);
  const result = store.updatePayment(demo.owner, demo.processingPayment.id, {
    status: "processed",
  });
  assert.equal(project(demo.second.id).available_cents, 1950000);
  assert.equal(project(demo.second.id).projected_cents, 1950000);
  const expense = db
    .prepare("SELECT * FROM transactions WHERE id = ?")
    .get(result.transaction_id);
  assert.equal(expense.project_id, null);
  assert.equal(expense.property_id, null);
  assert.ok(expense.bill_id);
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
  assert.equal(project(demo.project.id).available_cents, 925000);
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
test("a schedule image is shared by recurring obligations and never counts as payment evidence", () => {
  const image = {
    name: "card.png",
    type: "image/png",
    data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/8h8AAAAASUVORK5CYII=",
  };
  const before = project(demo.project.id).available_cents;
  const created = store.createBill(demo.owner, {
    name: "Future card",
    amount: "80",
    first_due_date: "2027-06-18",
    recurrence: "monthly",
    billing_account_id: demo.account.id,
    image,
  });
  assert.equal(created.first_occurrence.due_date, "2027-06-18");
  assert.equal(created.first_occurrence.status, "unpaid");
  assert.equal(project(demo.project.id).available_cents, before);
  const savedImage = store.billImage(demo.owner, created.id);
  assert.equal(savedImage.mime_type, "image/png");
  assert.deepEqual(
    readFileSync(join(uploadDir, savedImage.storage_name)),
    Buffer.from(image.data, "base64"),
  );
  const workspace = store.workspace(demo.owner, "2027-07");
  const bill = workspace.bills.find((row) => row.id === created.id);
  assert.equal(bill.image_url, `/api/bills/${created.id}/image`);
  assert.equal(bill.storage_name, undefined);
  assert.equal(
    workspace.occurrences.filter((row) => row.bill_id === bill.id).length,
    2,
  );
  assert.equal(
    db
      .prepare("SELECT count(*) AS n FROM bill_images WHERE bill_id = ?")
      .get(bill.id).n,
    1,
  );
  assert.throws(
    () =>
      store.createPayment(
        demo.owner,
        created.first_occurrence.id,
        paymentBody({ amount: "80", reference: {} }),
      ),
    code("evidenceRequired"),
  );
  store.createPayment(
    demo.owner,
    created.first_occurrence.id,
    paymentBody({ amount: "80", status: "processed" }),
  );
  assert.equal(project(demo.project.id).available_cents, before);
  assert.equal(
    store.billImage(demo.owner, created.id).storage_name,
    savedImage.storage_name,
  );
});

test("invalid or oversized bill images roll back the schedule and upload, and SVGs cannot be served inline", () => {
  const beforeBills = db.prepare("SELECT count(*) AS n FROM bills").get().n;
  const beforeFiles = readdirSync(uploadDir);
  for (const image of [
    {
      name: "icon.svg",
      type: "image/svg+xml",
      data: Buffer.from('<svg onload="alert(1)"/>').toString("base64"),
    },
    {
      name: "pretend.png",
      type: "image/png",
      data: Buffer.from("not an image").toString("base64"),
    },
    {
      name: "huge.png",
      type: "image/png",
      data: "A".repeat(Math.ceil(store.maxUploadBytes / 3) * 4 + 4),
    },
  ]) {
    assert.throws(
      () =>
        store.createBill(demo.owner, {
          name: "Bad image",
          amount: "1",
          first_due_date: "2026-10-18",
          recurrence: "once",
          image,
        }),
      code("invalidImage"),
    );
    assert.equal(
      db.prepare("SELECT count(*) AS n FROM bills").get().n,
      beforeBills,
    );
    assert.deepEqual(readdirSync(uploadDir), beforeFiles);
  }
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

test("properties support receipts, comments and files without linking to a project", () => {
  const property = store.saveProperty(demo.owner, {
    name: "Rental",
    address: "123 Main",
    tenant_name: "Tenant",
    monthly_rent: "1200",
  });
  const { id } = store.createTransaction(demo.owner, {
    ...txBody({
      reference_number: "RENT-1",
      files: [{ name: "receipt.txt", type: "text/plain", data: "aGVsbG8=" }],
    }),
    project_id: null,
    property_id: property.id,
    type: "income",
    amount: "1200",
  });
  store.saveComment(demo.owner, { transaction_id: id, text: "Rent received" });
  const data = store.workspace(demo.owner);
  assert.equal(data.properties[0].monthly_rent_cents, 120000);
  assert.equal(data.transactions.find((tx) => tx.id === id).project_id, null);
  const reference = data.references.find((ref) => ref.transaction_id === id);
  const file = data.attachments.find(
    (file) => file.reference_id === reference.id,
  );
  assert.ok(store.attachment(demo.owner, file.id));
  const employee = db
    .prepare("SELECT * FROM users WHERE id = ?")
    .get(demo.employee.id);
  assert.deepEqual(store.workspace(employee).properties, []);
  assert.throws(() => store.attachment(employee, file.id), code("notFound"));
  assert.throws(
    () =>
      store.saveComment(employee, { transaction_id: id, text: "No access" }),
    code("notFound"),
  );
  const other = store.createBusiness({
    name: "Other",
    business_name: "Other business",
    email: "other@property.example",
    password: "Password123",
  });
  assert.throws(() => store.property(other, property.id), code("notFound"));
  assert.throws(
    () =>
      store.createTransaction(other, {
        ...txBody({ reference_number: "R" }),
        project_id: null,
        property_id: property.id,
      }),
    code("notFound"),
  );
  store.voidTransaction(demo.owner, id);
  assert.equal(project(demo.project.id).available_cents, 925000);
});
test("manual transactions require exactly one destination, projects default to zero budget, and bills reject destinations", () => {
  const property = store.saveProperty(demo.owner, {
    name: "Rental",
    address: "123 Main",
  });
  assert.throws(
    () =>
      store.createTransaction(demo.owner, {
        ...txBody({ reference_number: "R" }),
        property_id: property.id,
      }),
    code("transactionTarget"),
  );
  assert.throws(
    () =>
      store.createTransaction(demo.owner, {
        ...txBody({ reference_number: "R" }),
        project_id: null,
      }),
    code("transactionTarget"),
  );
  const result = store.saveProject(demo.owner, {
    name: "No budget",
    start_date: "2026-10-18",
  });
  assert.equal(project(result.id).budget_cents, 0);
  assert.throws(
    () =>
      store.createBill(demo.owner, {
        name: "Bill",
        project_id: demo.project.id,
        amount: "1",
        first_due_date: "2026-10-18",
        recurrence: "once",
      }),
    code("standaloneBill"),
  );
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
});

test("property income needs only amount and date and does not create an empty reference", () => {
  const property = store.saveProperty(demo.owner, {
    name: "Rental",
    address: "123 Main",
  });
  for (const reference of [
    undefined,
    {},
    { reference_number: "  ", files: [] },
  ]) {
    const { id } = store.createTransaction(demo.owner, {
      property_id: property.id,
      type: "income",
      amount: "900",
      date: "2026-10-18",
      reference,
    });
    const tx = db.prepare("SELECT * FROM transactions WHERE id = ?").get(id);
    assert.equal(tx.name, "Rent income");
    assert.equal(tx.primary_reference_id, null);
    assert.equal(
      db
        .prepare(
          "SELECT count(*) AS n FROM evidence_references WHERE transaction_id = ?",
        )
        .get(id).n,
      0,
    );
    assert.throws(
      () =>
        store.createTransaction(demo.owner, {
          property_id: property.id,
          type: "refund",
          name: "Refund",
          amount: "10",
          date: "2026-10-18",
          reference,
        }),
      code("evidenceRequired"),
    );
    assert.throws(
      () =>
        store.createTransaction(demo.owner, {
          ...txBody(reference),
          type: "income",
        }),
      code("evidenceRequired"),
    );
  }
  for (const body of [
    { amount: "0", date: "2026-10-18" },
    { amount: "10" },
    { date: "2026-10-18" },
  ])
    assert.throws(() =>
      store.createTransaction(demo.owner, {
        property_id: property.id,
        type: "income",
        ...body,
      }),
    );
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
});
test("property income can include an attachment or date without a receipt ID and add references later", () => {
  const property = store.saveProperty(demo.owner, {
    name: "Rental",
    address: "123 Main",
  });
  const body = {
    property_id: property.id,
    type: "income",
    amount: "900",
    date: "2026-10-18",
  };
  const { id } = store.createTransaction(demo.owner, {
    ...body,
    reference: {
      evidence_at: "2026-10-18",
      files: [{ name: "rent.txt", type: "text/plain", data: "aGVsbG8=" }],
    },
  });
  const reference = store
    .workspace(demo.owner)
    .references.find((ref) => ref.transaction_id === id);
  assert.equal(reference.reference_number, null);
  assert.equal(reference.evidence_at, "2026-10-18");
  assert.ok(
    store
      .workspace(demo.owner)
      .attachments.some((file) => file.reference_id === reference.id),
  );
  const noReference = store.createTransaction(demo.owner, body);
  assert.throws(
    () => store.addReference(demo.owner, { transaction_id: noReference.id }),
    code("referenceDetailsRequired"),
  );
  const added = store.addReference(demo.owner, {
    transaction_id: noReference.id,
    description: "Paid by transfer",
    evidence_at: "2026-10-18",
  });
  assert.equal(
    db
      .prepare("SELECT primary_reference_id FROM transactions WHERE id = ?")
      .get(noReference.id).primary_reference_id,
    added.id,
  );
});
test("legacy reference timestamps display as dates in the business timezone without changing stored data", () => {
  const ref = db
    .prepare("SELECT primary_reference_id FROM transactions WHERE id = ?")
    .get(demo.expense.id).primary_reference_id;
  db.prepare("UPDATE evidence_references SET evidence_at = ? WHERE id = ?").run(
    "2026-10-18T01:00:00Z",
    ref,
  );
  assert.equal(
    store.workspace(demo.owner).references.find((item) => item.id === ref)
      .evidence_at,
    "2026-10-17",
  );
  assert.equal(
    db
      .prepare("SELECT evidence_at FROM evidence_references WHERE id = ?")
      .get(ref).evidence_at,
    "2026-10-18T01:00:00Z",
  );
});

test("archived properties reject financial writes and can be restored without losing history", () => {
  const property = store.saveProperty(demo.owner, {
    name: "Rental",
    address: "123 Main",
    monthly_rent: "900",
  });
  const body = {
    property_id: property.id,
    type: "income",
    amount: "900",
    date: "2026-10-18",
  };
  const tx = store.createTransaction(demo.owner, body);
  store.saveProperty(
    demo.owner,
    {
      name: "Rental",
      address: "123 Main",
      monthly_rent: "900",
      status: "archived",
    },
    property.id,
  );
  assert.throws(
    () => store.createTransaction(demo.owner, body),
    code("archived"),
  );
  assert.throws(
    () => store.voidTransaction(demo.owner, tx.id),
    code("archived"),
  );
  assert.throws(
    () =>
      store.addReference(demo.owner, {
        transaction_id: tx.id,
        reference_number: "R",
      }),
    code("archived"),
  );
  assert.ok(
    store.workspace(demo.owner).transactions.some((item) => item.id === tx.id),
  );
  store.saveProperty(
    demo.owner,
    {
      name: "Rental",
      address: "123 Main",
      monthly_rent: "900",
      status: "active",
    },
    property.id,
  );
  assert.ok(store.createTransaction(demo.owner, body).id);
  assert.equal(
    store.property(demo.owner, property.id).monthly_rent_cents,
    90000,
  );
});
test("deleting destinations preserves financial history and attachments and prevents future writes", () => {
  const property = store.saveProperty(demo.owner, {
    name: "Rental",
    address: "123 Main",
  });
  const tx = store.createTransaction(demo.owner, {
    property_id: property.id,
    type: "income",
    amount: "900",
    date: "2026-10-18",
    reference: {
      files: [{ name: "rent.txt", type: "text/plain", data: "aGVsbG8=" }],
    },
  });
  const file = store
    .workspace(demo.owner)
    .attachments.find(
      (item) =>
        item.reference_id ===
        db
          .prepare("SELECT primary_reference_id FROM transactions WHERE id = ?")
          .get(tx.id).primary_reference_id,
    );
  store.deleteProperty(demo.owner, property.id);
  store.deleteProject(demo.owner, demo.project.id);
  store.deleteProperty(demo.owner, property.id);
  const data = store.workspace(demo.owner);
  assert.equal(
    data.properties.find((item) => item.id === property.id).deleted_at,
    "2026-10-18T16:00:00.000Z",
  );
  assert.equal(
    data.projects.find((item) => item.id === demo.project.id).status,
    "archived",
  );
  assert.ok(data.transactions.some((item) => item.id === tx.id));
  assert.ok(data.transactions.some((item) => item.id === demo.expense.id));
  assert.ok(store.attachment(demo.owner, file.id));
  assert.throws(
    () =>
      store.createTransaction(demo.owner, txBody({ reference_number: "R" })),
    code("notFound"),
  );
  assert.throws(
    () =>
      store.createTransaction(demo.owner, {
        property_id: property.id,
        type: "income",
        amount: "1",
        date: "2026-10-18",
      }),
    code("notFound"),
  );
  assert.throws(
    () =>
      store.saveProperty(
        demo.owner,
        { name: "Restore", address: "No", status: "active" },
        property.id,
      ),
    code("notFound"),
  );
  assert.throws(
    () =>
      store.saveProject(
        demo.owner,
        { name: "Restore", start_date: "2026-10-18", status: "active" },
        demo.project.id,
      ),
    code("notFound"),
  );
  assert.equal(
    db
      .prepare(
        "SELECT count(*) AS n FROM audit_events WHERE entity_id = ? AND action = 'property.deleted'",
      )
      .get(property.id).n,
    1,
  );
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
});
test("only authorized business editors can archive or delete destinations", () => {
  const employee = db
    .prepare("SELECT * FROM users WHERE id = ?")
    .get(demo.employee.id);
  assert.throws(
    () => store.deleteProject(employee, demo.project.id),
    code("forbidden"),
  );
  const property = store.saveProperty(demo.owner, {
    name: "Rental",
    address: "123 Main",
  });
  assert.throws(
    () => store.deleteProperty(employee, property.id),
    code("forbidden"),
  );
  const other = store.createBusiness({
    name: "Other",
    business_name: "Other",
    email: "delete-outsider@example.com",
    password: "Password123",
  });
  assert.throws(
    () => store.deleteProject(other, demo.project.id),
    code("notFound"),
  );
  assert.throws(
    () => store.deleteProperty(other, property.id),
    code("notFound"),
  );
});
