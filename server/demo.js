import { FinanceStore } from "./domain.js";
import { addDays, monthBounds, todayInZone } from "../shared/dates.js";

export const demoAccounts = [
  { email: "owner@demo.local", password: "DemoPass123!", role: "owner" },
  { email: "admin@demo.local", password: "DemoPass123!", role: "admin" },
  { email: "employee@demo.local", password: "DemoPass123!", role: "employee" },
];

// Fixed dates can be supplied by tests; regular demo resets use the business's current day.
export function seedDemo(db, { today = todayInZone(), uploadDir } = {}) {
  if (db.prepare("SELECT 1 FROM businesses LIMIT 1").get())
    throw new Error("Demo seeding requires an empty database.");
  const store = new FinanceStore(db, {
    uploadDir,
    now: () => new Date(`${today}T16:00:00Z`),
  });
  const owner = store.createBusiness({
    ...demoAccounts[0],
    name: "Elena Rivera",
    business_name: "Ahiora Demo Construction",
  });
  store.updateBusiness(owner, {
    name: "Ahiora Demo Construction",
    address: "100 Demo Avenue, San Juan",
    default_language: "en",
    currency: "USD",
    time_zone: "America/New_York",
  });
  const start = `${today.slice(0, 7)}-01`;
  const project = store.saveProject(owner, {
    name: "Café renovation",
    start_date: start,
    budget: "10000",
  });
  const second = store.saveProject(owner, {
    name: "Office expansion",
    start_date: start,
    budget: "20000",
  });
  const operations = store.saveProject(owner, {
    name: "Business operations",
    start_date: start,
    budget: "5000",
  });
  const admin = store.saveMember(owner, {
    ...demoAccounts[1],
    name: "Mateo Santos",
    preferred_language: "es",
  });
  const employee = store.saveMember(owner, {
    ...demoAccounts[2],
    name: "Sofía López",
    title: "Site coordinator",
    project_ids: [project.id],
  });
  const contractor = store.saveContractor(owner, {
    name: "Luis Torres Electric",
    email: "luis@example.com",
    phone: "555-0101",
    address: "25 Demo Street",
    project_ids: [project.id, second.id],
  });
  store.saveContractor(owner, {
    name: "Ana Cruz Plumbing",
    phone: "555-0102",
    project_ids: [project.id],
  });
  const account = store.saveAccount(owner, {
    name: "Business checking",
    masked_identifier: "•••• 1234",
  });
  store.saveAccount(owner, {
    name: "Business card",
    masked_identifier: "•••• 9876",
  });
  const expense = store.createTransaction(owner, {
    project_id: project.id,
    name: "Construction materials",
    type: "expense",
    date: today,
    amount: "2000",
    invoice_id: "DEMO-INV-001",
    reference: {
      reference_number: "DEMO-RECEIPT-001",
      description: "Demonstration purchase evidence",
    },
  });
  store.createTransaction(owner, {
    project_id: project.id,
    name: "Additional project funding",
    type: "income",
    date: today,
    amount: "1000",
    reference: { reference_number: "DEMO-DEPOSIT-001" },
  });
  store.createTransaction(owner, {
    project_id: project.id,
    name: "Returned materials",
    type: "refund",
    date: today,
    amount: "250",
    reference: { reference_number: "DEMO-REFUND-001" },
  });
  store.createTransaction(owner, {
    project_id: second.id,
    name: "Design work",
    type: "expense",
    date: today,
    amount: "500",
    reference: {
      reference_number: "DEMO-DESIGN-001",
      evidence_at: today,
      description: "Demo payment date",
    },
  });
  const monthly = store.createBill(owner, {
    name: "Equipment lease",
    amount: "300",
    first_due_date: monthBounds(today.slice(0, 7)).end,
    recurrence: "monthly",
    recurrence_day: 31,
    payee_account_number: "DEMO-LEASE-001",
    billing_account_id: account.id,
  });
  store.createBill(owner, {
    name: "Internet service",
    amount: "100",
    first_due_date: addDays(today, 3),
    recurrence: "interval_days",
    interval_days: 30,
    billing_account_id: account.id,
  });
  const paidBill = store.createBill(owner, {
    name: "Business supplies",
    amount: "100",
    first_due_date: addDays(today, -2),
    recurrence: "once",
    billing_account_id: account.id,
  });
  const processingBill = store.createBill(owner, {
    name: "Inspection fee",
    amount: "250",
    first_due_date: addDays(today, -1),
    recurrence: "once",
    billing_account_id: account.id,
  });
  store.createBill(owner, {
    name: "Weekly site cleaning",
    amount: "75",
    first_due_date: addDays(today, 2),
    recurrence: "weekly",
    billing_account_id: account.id,
  });
  store.ensureOccurrences(owner, today.slice(0, 7));
  const occurrenceFor = (bill) =>
    db
      .prepare(
        "SELECT * FROM bill_occurrences WHERE bill_id = ? ORDER BY due_date LIMIT 1",
      )
      .get(bill.id);
  const paidOccurrence = occurrenceFor(paidBill),
    processingOccurrence = occurrenceFor(processingBill);
  const reference = {
    reference_number: "DEMO-PAID-001",
    evidence_at: today,
    description: "Demo receipt; not a real payment",
  };
  if (uploadDir)
    reference.files = [
      {
        name: "demo-receipt.txt",
        type: "text/plain",
        data: Buffer.from(
          "DEMO ONLY\nBusiness supplies: $100.00\nReference: DEMO-PAID-001\n",
        ).toString("base64"),
      },
    ];
  const payment = store.createPayment(owner, paidOccurrence.id, {
    amount: "100",
    payment_date: today,
    status: "processed",
    reference,
  });
  const processingPayment = store.createPayment(
    owner,
    processingOccurrence.id,
    {
      amount: "250",
      payment_date: today,
      status: "processing",
      reference: { reference_number: "DEMO-PROCESSING-001" },
    },
  );
  store.saveComment(owner, {
    project_id: project.id,
    text: "Demo: electrical work is delegated to Luis. Receipts are attached to transactions.",
  });
  const employeeUser = db
    .prepare("SELECT * FROM users WHERE id = ?")
    .get(employee.id);
  store.saveComment(employeeUser, {
    transaction_id: expense.id,
    text: "Materials received and checked on site.",
  });
  return {
    owner,
    admin,
    employee,
    project,
    second,
    operations,
    contractor,
    account,
    expense,
    monthly,
    payment,
    processingPayment,
    processingOccurrence,
  };
}
