import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { hashPassword } from "./auth.js";
import {
  addDays,
  isDate,
  monthBounds,
  occurrenceDates,
  todayInZone,
} from "../shared/dates.js";

export class DomainError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}
const requireThat = (condition, code, status) => {
  if (!condition) throw new DomainError(code, status);
};
const text = (value, max = 500) =>
  String(value ?? "")
    .trim()
    .slice(0, max);
const requiredText = (value, max) => {
  const result = text(value, max);
  requireThat(result, "required");
  return result;
};
const dateValue = (value) => {
  requireThat(
    isDate(value) && value >= "1970-01-01" && value <= "2100-12-31",
    "invalidDate",
  );
  return value;
};
const option = (value, options) => {
  requireThat(options.includes(value), "invalidOption");
  return value;
};
export function cents(value, allowZero = false) {
  const raw = String(value ?? "");
  requireThat(/^\d+(\.\d{1,2})?$/.test(raw), "invalidAmount");
  const [whole, fraction = ""] = raw.split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  requireThat(
    Number.isSafeInteger(result) &&
      result <= 1000000000000 &&
      (allowZero ? result >= 0 : result > 0),
    "invalidAmount",
  );
  return result;
}
export function publicUser(user) {
  if (!user) return null;
  const {
    id,
    business_id,
    name,
    email,
    role,
    title,
    preferred_language,
    last_accessed_at,
  } = user;
  return {
    id,
    business_id,
    name,
    email,
    role,
    title,
    preferred_language,
    last_accessed_at,
  };
}

export class FinanceStore {
  constructor(
    db,
    {
      uploadDir,
      now = () => new Date(),
      maxUploadBytes = 8 * 1024 * 1024,
    } = {},
  ) {
    this.db = db;
    this.uploadDir = uploadDir;
    this.now = now;
    this.maxUploadBytes = maxUploadBytes;
  }
  atomic(work) {
    this.db.exec("BEGIN IMMEDIATE");
    this.newFiles = [];
    try {
      const result = work();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      for (const file of this.newFiles) {
        try {
          unlinkSync(file);
        } catch {}
      }
      throw error;
    } finally {
      this.newFiles = null;
    }
  }
  audit(user, action, id, details = {}) {
    this.db
      .prepare(
        "INSERT INTO audit_events (business_id, actor_id, action, entity_id, details) VALUES (?, ?, ?, ?, ?)",
      )
      .run(user.business_id, user.id, action, id, JSON.stringify(details));
  }
  row(table, id, user) {
    // Table names come only from the domain methods below, never request parameters.
    const result = this.db
      .prepare(`SELECT * FROM ${table} WHERE id = ? AND business_id = ?`)
      .get(id, user.business_id);
    requireThat(result, "notFound", 404);
    return result;
  }
  editor(user) {
    requireThat(
      user.role === "owner" || user.role === "admin",
      "forbidden",
      403,
    );
  }
  project(user, id, write = false) {
    const project = this.row("projects", id, user);
    if (user.role === "employee")
      requireThat(
        this.db
          .prepare(
            "SELECT 1 FROM employee_projects WHERE user_id = ? AND project_id = ?",
          )
          .get(user.id, id),
        "notFound",
        404,
      );
    if (write) {
      this.editor(user);
      requireThat(project.status !== "archived", "archived");
    }
    return project;
  }
  business(user) {
    return this.db
      .prepare("SELECT * FROM businesses WHERE id = ?")
      .get(user.business_id);
  }
  today(user) {
    return todayInZone(this.business(user).time_zone, this.now());
  }
  createBusiness(body) {
    const email = text(body.email).toLowerCase();
    requireThat(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), "invalidEmail");
    requireThat(
      typeof body.password === "string" &&
        body.password.length >= 8 &&
        body.password.length <= 256,
      "invalidPassword",
    );
    requireThat(
      !this.db.prepare("SELECT id FROM users WHERE email = ?").get(email),
      "emailExists",
      409,
    );
    const name = requiredText(body.name, 160),
      businessName = requiredText(body.business_name, 160);
    const language = option(body.preferred_language || "en", ["en", "es"]);
    const businessId = randomUUID(),
      ownerId = randomUUID();
    const passwordHash = hashPassword(body.password);
    return this.atomic(() => {
      this.db
        .prepare(
          "INSERT INTO businesses (id, name, owner_id, default_language) VALUES (?, ?, ?, ?)",
        )
        .run(businessId, businessName, ownerId, language);
      this.db
        .prepare(
          "INSERT INTO users (id, business_id, name, email, password_hash, role, preferred_language) VALUES (?, ?, ?, ?, ?, 'owner', ?)",
        )
        .run(ownerId, businessId, name, email, passwordHash, language);
      return publicUser(
        this.db.prepare("SELECT * FROM users WHERE id = ?").get(ownerId),
      );
    });
  }
  updateBusiness(user, body) {
    requireThat(user.role === "owner", "forbidden", 403);
    const name = requiredText(body.name, 160),
      address = text(body.address);
    const language = option(body.default_language, ["en", "es"]);
    const currency = text(body.currency).toUpperCase(),
      timeZone = text(body.time_zone);
    requireThat(
      Intl.supportedValuesOf("currency").includes(currency),
      "invalidOption",
    );
    try {
      new Intl.DateTimeFormat("en", { timeZone });
    } catch {
      throw new DomainError("invalidTimeZone");
    }
    const old = this.business(user);
    if (old.currency !== currency)
      requireThat(
        !this.db
          .prepare("SELECT 1 FROM transactions WHERE business_id = ? LIMIT 1")
          .get(user.business_id),
        "currencyLocked",
      );
    return this.atomic(() => {
      this.db
        .prepare(
          "UPDATE businesses SET name = ?, address = ?, default_language = ?, currency = ?, time_zone = ? WHERE id = ?",
        )
        .run(name, address, language, currency, timeZone, user.business_id);
      this.audit(user, "business.updated", user.business_id);
    });
  }
  updateLanguage(user, body) {
    const language = option(body.preferred_language, ["en", "es"]);
    this.db
      .prepare("UPDATE users SET preferred_language = ? WHERE id = ?")
      .run(language, user.id);
    return publicUser(
      this.db.prepare("SELECT * FROM users WHERE id = ?").get(user.id),
    );
  }
  assignments(user, ids = []) {
    requireThat(Array.isArray(ids) && ids.length <= 200, "invalidOption");
    const unique = [...new Set(ids)];
    unique.forEach((id) => this.project(user, id));
    return unique;
  }
  saveMember(user, body, id) {
    this.editor(user);
    const old = id ? this.row("users", id, user) : null;
    requireThat(!old || old.role !== "owner", "ownerLocked");
    const role = option(body.role, ["admin", "employee"]);
    if (role === "admin" || old?.role === "admin")
      requireThat(user.role === "owner", "forbidden", 403);
    const name = requiredText(body.name, 160),
      email = requiredText(body.email).toLowerCase();
    requireThat(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), "invalidEmail");
    requireThat(
      !this.db
        .prepare("SELECT id FROM users WHERE email = ? AND id <> ?")
        .get(email, id || ""),
      "emailExists",
      409,
    );
    const title = role === "employee" ? requiredText(body.title, 160) : null;
    const ids =
      role === "employee" ? this.assignments(user, body.project_ids) : [];
    if (!id || body.password)
      requireThat(
        typeof body.password === "string" &&
          body.password.length >= 8 &&
          body.password.length <= 256,
        "invalidPassword",
      );
    const passwordHash = body.password
      ? hashPassword(body.password)
      : old.password_hash;
    const language = option(
      body.preferred_language || this.business(user).default_language,
      ["en", "es"],
    );
    id ||= randomUUID();
    return this.atomic(() => {
      if (old)
        this.db
          .prepare(
            "UPDATE users SET name = ?, email = ?, role = ?, title = ?, password_hash = ?, preferred_language = ?, last_accessed_at = CASE WHEN ? = 'admin' THEN last_accessed_at ELSE NULL END WHERE id = ?",
          )
          .run(name, email, role, title, passwordHash, language, role, id);
      else
        this.db
          .prepare(
            "INSERT INTO users (id, business_id, name, email, role, title, password_hash, preferred_language) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          )
          .run(
            id,
            user.business_id,
            name,
            email,
            role,
            title,
            passwordHash,
            language,
          );
      this.db
        .prepare("DELETE FROM employee_projects WHERE user_id = ?")
        .run(id);
      ids.forEach((projectId) =>
        this.db
          .prepare("INSERT INTO employee_projects VALUES (?, ?, ?)")
          .run(user.business_id, id, projectId),
      );
      if (old)
        this.db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
      this.audit(user, old ? "member.updated" : "member.created", id);
      return { id };
    });
  }
  saveProject(user, body, id) {
    this.editor(user);
    const old = id ? this.row("projects", id, user) : null;
    const name = requiredText(body.name, 160),
      start = dateValue(body.start_date),
      end = body.end_date ? dateValue(body.end_date) : null;
    requireThat(!end || end >= start, "invalidDate");
    const budget = cents(body.budget, true),
      status = option(body.status || "active", [
        "active",
        "completed",
        "archived",
      ]);
    id ||= randomUUID();
    return this.atomic(() => {
      if (old)
        this.db
          .prepare(
            "UPDATE projects SET name = ?, start_date = ?, end_date = ?, budget_cents = ?, status = ? WHERE id = ?",
          )
          .run(name, start, end, budget, status, id);
      else
        this.db
          .prepare(
            "INSERT INTO projects (id, business_id, name, start_date, end_date, budget_cents, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
          )
          .run(id, user.business_id, name, start, end, budget, status);
      this.audit(user, old ? "project.updated" : "project.created", id, {
        before: old || null,
        budget_cents: budget,
        status,
      });
      return { id };
    });
  }
  saveContractor(user, body, id) {
    this.editor(user);
    const old = id ? this.row("contractors", id, user) : null;
    const name = requiredText(body.name, 160),
      email = text(body.email),
      phone = text(body.phone, 80),
      address = text(body.address);
    requireThat(email || phone || address, "contactRequired");
    if (email)
      requireThat(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), "invalidEmail");
    const ids = this.assignments(user, body.project_ids);
    id ||= randomUUID();
    return this.atomic(() => {
      if (old)
        this.db
          .prepare(
            "UPDATE contractors SET name = ?, email = ?, phone = ?, address = ? WHERE id = ?",
          )
          .run(name, email, phone, address, id);
      else
        this.db
          .prepare("INSERT INTO contractors VALUES (?, ?, ?, ?, ?, ?)")
          .run(id, user.business_id, name, email, phone, address);
      this.db
        .prepare("DELETE FROM contractor_projects WHERE contractor_id = ?")
        .run(id);
      ids.forEach((projectId) =>
        this.db
          .prepare("INSERT INTO contractor_projects VALUES (?, ?, ?)")
          .run(user.business_id, id, projectId),
      );
      this.audit(user, old ? "contractor.updated" : "contractor.created", id);
      return { id };
    });
  }
  deleteContractor(user, id) {
    this.editor(user);
    this.row("contractors", id, user);
    return this.atomic(() => {
      this.db.prepare("DELETE FROM contractors WHERE id = ?").run(id);
      this.audit(user, "contractor.deleted", id);
    });
  }
  saveAccount(user, body, id) {
    this.editor(user);
    const old = id ? this.row("billing_accounts", id, user) : null;
    const name = requiredText(body.name, 160),
      masked = text(body.masked_identifier, 80);
    id ||= randomUUID();
    return this.atomic(() => {
      if (old)
        this.db
          .prepare(
            "UPDATE billing_accounts SET name = ?, masked_identifier = ? WHERE id = ?",
          )
          .run(name, masked, id);
      else
        this.db
          .prepare("INSERT INTO billing_accounts VALUES (?, ?, ?, ?)")
          .run(id, user.business_id, name, masked);
      this.audit(user, old ? "account.updated" : "account.created", id);
      return { id };
    });
  }
  createBill(user, body) {
    this.editor(user);
    this.project(user, body.project_id, true);
    const name = requiredText(body.name, 160),
      amount = cents(body.amount),
      first = dateValue(body.first_due_date);
    const recurrence = option(body.recurrence, [
      "once",
      "monthly",
      "weekly",
      "yearly",
      "interval_days",
    ]);
    const day =
      recurrence === "monthly"
        ? Number(body.recurrence_day || first.slice(-2))
        : null;
    const interval =
      recurrence === "interval_days" ? Number(body.interval_days) : null;
    requireThat(
      day === null || (Number.isInteger(day) && day >= 1 && day <= 31),
      "invalidOption",
    );
    requireThat(
      interval === null ||
        (Number.isSafeInteger(interval) && interval >= 1 && interval <= 3650),
      "invalidOption",
    );
    if (recurrence === "monthly")
      requireThat(
        occurrenceDates(
          { first_due_date: first, recurrence, recurrence_day: day },
          first,
          monthBounds(first.slice(0, 7)).end,
        ).includes(first),
        "invalidSchedule",
      );
    const accountId = body.billing_account_id || null;
    if (accountId) this.row("billing_accounts", accountId, user);
    const id = randomUUID();
    return this.atomic(() => {
      this.db
        .prepare(
          "INSERT INTO bills (id, business_id, project_id, name, payee_account_number, amount_cents, first_due_date, recurrence, recurrence_day, interval_days, billing_account_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          id,
          user.business_id,
          body.project_id,
          name,
          text(body.payee_account_number, 160),
          amount,
          first,
          recurrence,
          day,
          interval,
          accountId,
        );
      this.audit(user, "bill.created", id);
      return { id };
    });
  }
  pauseBill(user, id) {
    this.editor(user);
    this.row("bills", id, user);
    return this.atomic(() => {
      this.db
        .prepare("UPDATE bills SET active = 0, paused_at = ? WHERE id = ?")
        .run(this.now().toISOString(), id);
      // Leave due/overdue obligations and processing/paid history intact; cancel future unpaid ones.
      this.db
        .prepare(
          "UPDATE bill_occurrences SET status = 'canceled' WHERE bill_id = ? AND due_date > ? AND status = 'unpaid'",
        )
        .run(id, this.today(user));
      this.audit(user, "bill.paused", id);
    });
  }
  ensureOccurrences(user, month) {
    const today = this.today(user);
    requireThat(
      /^\d{4}-(0[1-9]|1[0-2])$/.test(month) &&
        month >= "1970-01" &&
        month <= "2100-12",
      "invalidDate",
    );
    const currentEnd = monthBounds(
      addDays(monthBounds(today.slice(0, 7)).end, 1).slice(0, 7),
    ).end;
    const selected = monthBounds(month);
    const bills = this.db
      .prepare(
        "SELECT bills.* FROM bills JOIN projects ON projects.id = bills.project_id WHERE bills.business_id = ? AND bills.active = 1 AND projects.status <> 'archived'",
      )
      .all(user.business_id);
    this.atomic(() => {
      const insert = this.db.prepare(
        "INSERT OR IGNORE INTO bill_occurrences (id, business_id, bill_id, due_date, amount_cents) VALUES (?, ?, ?, ?, ?)",
      );
      for (const bill of bills) {
        const dates = new Set([
          ...occurrenceDates(bill, bill.first_due_date, currentEnd),
          ...occurrenceDates(bill, selected.start, selected.end),
        ]);
        for (const date of dates)
          insert.run(
            randomUUID(),
            user.business_id,
            bill.id,
            date,
            bill.amount_cents,
          );
      }
    });
  }
  referenceRaw(user, body, transactionId, occurrenceId) {
    requireThat(transactionId || occurrenceId, "referenceTarget");
    const referenceNumber = text(body?.reference_number, 200) || null;
    const evidenceAt = text(body?.evidence_at, 80) || null;
    if (evidenceAt)
      requireThat(
        /^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$/.test(evidenceAt) &&
          isDate(evidenceAt.slice(0, 10)) &&
          Number.isFinite(Date.parse(evidenceAt)),
        "invalidDate",
      );
    const files = body?.files ?? [];
    requireThat(Array.isArray(files) && files.length <= 5, "invalidFile");
    requireThat(
      referenceNumber || evidenceAt || files.length,
      "evidenceRequired",
    );
    const decoded = files.map((file) => {
      requireThat(typeof file.data === "string", "invalidFile");
      const raw = file.data.includes(",")
        ? file.data.slice(file.data.indexOf(",") + 1)
        : file.data;
      requireThat(
        raw.length <= Math.ceil(this.maxUploadBytes / 3) * 4 &&
          /^[A-Za-z0-9+/]*={0,2}$/.test(raw),
        "invalidFile",
      );
      const buffer = Buffer.from(raw, "base64");
      requireThat(
        buffer.length > 0 && buffer.length <= this.maxUploadBytes,
        "invalidFile",
      );
      return {
        name: requiredText(file.name, 200).replace(/[\r\n]/g, "_"),
        type: text(file.type, 100) || "application/octet-stream",
        buffer,
      };
    });
    requireThat(decoded.length === 0 || this.uploadDir, "invalidFile");
    const id = randomUUID();
    this.db
      .prepare(
        "INSERT INTO evidence_references (id, business_id, transaction_id, occurrence_id, reference_number, evidence_at, description, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        user.business_id,
        transactionId || null,
        occurrenceId || null,
        referenceNumber,
        evidenceAt ? new Date(evidenceAt).toISOString() : null,
        text(body?.description, 2000),
        user.id,
      );
    for (const file of decoded) {
      const fileId = randomUUID(),
        storageName = `${fileId}.bin`,
        path = join(this.uploadDir, storageName);
      mkdirSync(this.uploadDir, { recursive: true, mode: 0o700 });
      this.newFiles.push(path);
      writeFileSync(path, file.buffer, { mode: 0o600, flag: "wx" });
      this.db
        .prepare(
          "INSERT INTO file_attachments (id, business_id, reference_id, original_name, mime_type, size_bytes, storage_name) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          fileId,
          user.business_id,
          id,
          file.name,
          file.type,
          file.buffer.length,
          storageName,
        );
    }
    return id;
  }
  createTransaction(user, body) {
    this.editor(user);
    this.project(user, body.project_id, true);
    const name = requiredText(body.name, 200),
      amount = cents(body.amount),
      date = dateValue(body.date);
    const type = option(body.type, ["expense", "income", "refund"]),
      id = randomUUID();
    return this.atomic(() => {
      const referenceId = this.referenceRaw(user, body.reference, id, null);
      this.db
        .prepare(
          "INSERT INTO transactions (id, business_id, project_id, name, invoice_id, date, amount_cents, type, primary_reference_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          id,
          user.business_id,
          body.project_id,
          name,
          text(body.invoice_id, 200) || null,
          date,
          amount,
          type,
          referenceId,
          user.id,
        );
      this.audit(user, "transaction.created", id, {
        amount_cents: amount,
        type,
      });
      return { id };
    });
  }
  voidTransaction(user, id) {
    this.editor(user);
    const transaction = this.row("transactions", id, user);
    this.project(user, transaction.project_id, true);
    requireThat(
      !this.db
        .prepare("SELECT 1 FROM payments WHERE transaction_id = ?")
        .get(id),
      "paymentTransactionLocked",
    );
    return this.atomic(() => {
      this.db
        .prepare("UPDATE transactions SET status = 'void' WHERE id = ?")
        .run(id);
      this.audit(user, "transaction.voided", id, { before: transaction });
    });
  }
  addReference(user, body) {
    this.editor(user);
    const tx = body.transaction_id
      ? this.row("transactions", body.transaction_id, user)
      : null;
    const occurrence = body.occurrence_id
      ? this.row("bill_occurrences", body.occurrence_id, user)
      : null;
    const bill = occurrence
      ? this.row("bills", occurrence.bill_id, user)
      : null;
    requireThat(tx || bill, "referenceTarget");
    if (tx) this.project(user, tx.project_id, true);
    if (bill) this.project(user, bill.project_id, true);
    if (tx && bill) {
      const payment = this.db
        .prepare("SELECT * FROM payments WHERE occurrence_id = ?")
        .get(occurrence.id);
      requireThat(payment?.transaction_id === tx.id, "referenceTarget");
    }
    return this.atomic(() => {
      const id = this.referenceRaw(user, body, tx?.id, occurrence?.id);
      this.audit(user, "reference.created", id);
      return { id };
    });
  }
  occurrence(user, id, write = false) {
    const occurrence = this.row("bill_occurrences", id, user),
      bill = this.row("bills", occurrence.bill_id, user);
    this.project(user, bill.project_id, write);
    return { occurrence, bill };
  }
  createPayment(user, occurrenceId, body) {
    this.editor(user);
    const { occurrence, bill } = this.occurrence(user, occurrenceId, true);
    const existing = this.db
      .prepare("SELECT * FROM payments WHERE occurrence_id = ?")
      .get(occurrenceId);
    // A retry cannot double-book an expense. Status changes use the explicit payment endpoint.
    if (existing)
      return {
        id: existing.id,
        transaction_id: existing.transaction_id,
        existing: true,
      };
    requireThat(occurrence.status === "unpaid", "invalidPaymentState");
    const status = option(body.status || "processed", [
      "processing",
      "processed",
    ]);
    const amount = cents(body.amount);
    requireThat(amount === occurrence.amount_cents, "fullPaymentRequired");
    const paymentDate = dateValue(body.payment_date),
      accountId = body.billing_account_id || bill.billing_account_id;
    this.row("billing_accounts", accountId || "", user);
    const id = randomUUID();
    return this.atomic(() => {
      this.referenceRaw(user, body.reference, null, occurrence.id);
      const transactionId =
        status === "processed"
          ? this.paymentExpenseRaw(user, bill, occurrence, paymentDate)
          : null;
      this.db
        .prepare(
          "INSERT INTO payments (id, business_id, occurrence_id, billing_account_id, payment_date, amount_cents, status, transaction_id, recorded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          id,
          user.business_id,
          occurrence.id,
          accountId,
          paymentDate,
          amount,
          status,
          transactionId,
          user.id,
        );
      this.db
        .prepare("UPDATE bill_occurrences SET status = ? WHERE id = ?")
        .run(status === "processed" ? "paid" : "processing", occurrence.id);
      this.audit(user, "payment.recorded", id, { status });
      return { id, transaction_id: transactionId };
    });
  }
  paymentExpenseRaw(user, bill, occurrence, date) {
    const references = this.db
      .prepare("SELECT * FROM evidence_references WHERE occurrence_id = ?")
      .all(occurrence.id);
    requireThat(
      references.length &&
        references.every((reference) => !reference.transaction_id),
      "evidenceRequired",
    );
    const id = randomUUID();
    this.db
      .prepare(
        "UPDATE evidence_references SET transaction_id = ? WHERE occurrence_id = ?",
      )
      .run(id, occurrence.id);
    this.db
      .prepare(
        "INSERT INTO transactions (id, business_id, project_id, name, date, amount_cents, type, primary_reference_id, created_by) VALUES (?, ?, ?, ?, ?, ?, 'expense', ?, ?)",
      )
      .run(
        id,
        user.business_id,
        bill.project_id,
        bill.name,
        date,
        occurrence.amount_cents,
        references[0].id,
        user.id,
      );
    this.audit(user, "transaction.createdFromPayment", id, {
      occurrence_id: occurrence.id,
    });
    return id;
  }
  updatePayment(user, id, body) {
    this.editor(user);
    const payment = this.row("payments", id, user);
    const { bill, occurrence } = this.occurrence(
      user,
      payment.occurrence_id,
      true,
    );
    const status = option(body.status, ["processing", "processed", "failed"]);
    if (payment.status === status)
      return { id, transaction_id: payment.transaction_id };
    requireThat(payment.status !== "processed", "processedLocked");
    return this.atomic(() => {
      const transactionId =
        status === "processed"
          ? this.paymentExpenseRaw(user, bill, occurrence, payment.payment_date)
          : null;
      this.db
        .prepare(
          "UPDATE payments SET status = ?, transaction_id = ? WHERE id = ?",
        )
        .run(status, transactionId, id);
      this.db
        .prepare("UPDATE bill_occurrences SET status = ? WHERE id = ?")
        .run(
          status === "processed"
            ? "paid"
            : status === "processing"
              ? "processing"
              : "unpaid",
          occurrence.id,
        );
      this.audit(user, "payment.statusChanged", id, {
        from: payment.status,
        to: status,
      });
      return { id, transaction_id: transactionId };
    });
  }
  saveComment(user, body, id) {
    const old = id ? this.row("comments", id, user) : null;
    if (old) requireThat(old.author_id === user.id, "forbidden", 403);
    const projectId = old?.project_id || body.project_id || null,
      transactionId = old?.transaction_id || body.transaction_id || null;
    requireThat(Boolean(projectId) !== Boolean(transactionId), "commentTarget");
    const tx = transactionId
      ? this.row("transactions", transactionId, user)
      : null;
    this.project(user, projectId || tx.project_id);
    const content = requiredText(body.text, 5000);
    id ||= randomUUID();
    return this.atomic(() => {
      if (old)
        this.db
          .prepare("UPDATE comments SET text = ?, edited_at = ? WHERE id = ?")
          .run(content, this.now().toISOString(), id);
      else
        this.db
          .prepare(
            "INSERT INTO comments (id, business_id, project_id, transaction_id, author_id, text) VALUES (?, ?, ?, ?, ?, ?)",
          )
          .run(
            id,
            user.business_id,
            projectId,
            transactionId,
            user.id,
            content,
          );
      return { id };
    });
  }
  referenceProject(user, reference) {
    if (reference.transaction_id)
      return this.project(
        user,
        this.row("transactions", reference.transaction_id, user).project_id,
      );
    return this.occurrence(user, reference.occurrence_id).bill;
  }
  attachment(user, id) {
    const file = this.row("file_attachments", id, user),
      reference = this.row("evidence_references", file.reference_id, user);
    this.referenceProject(user, reference);
    return file;
  }
  workspace(user, month = this.today(user).slice(0, 7)) {
    this.ensureOccurrences(user, month);
    const all = (table) =>
      this.db
        .prepare(`SELECT * FROM ${table} WHERE business_id = ?`)
        .all(user.business_id);
    const assigned = new Set(
      this.db
        .prepare("SELECT project_id FROM employee_projects WHERE user_id = ?")
        .all(user.id)
        .map((row) => row.project_id),
    );
    const projects = all("projects").filter(
      (project) => user.role !== "employee" || assigned.has(project.id),
    );
    const projectIds = new Set(projects.map((project) => project.id));
    const transactions = all("transactions").filter((transaction) =>
      projectIds.has(transaction.project_id),
    );
    const transactionIds = new Set(
      transactions.map((transaction) => transaction.id),
    );
    const bills = all("bills").filter((bill) =>
      projectIds.has(bill.project_id),
    );
    const billIds = new Set(bills.map((bill) => bill.id));
    const today = this.today(user),
      soon = addDays(today, 7);
    const occurrences = all("bill_occurrences")
      .filter((row) => billIds.has(row.bill_id))
      .map((row) => ({
        ...row,
        display_status:
          row.status !== "unpaid"
            ? row.status
            : row.due_date < today
              ? "overdue"
              : row.due_date <= soon
                ? "due_soon"
                : "upcoming",
      }));
    const occurrenceIds = new Set(occurrences.map((row) => row.id));
    const references = all("evidence_references").filter(
      (row) =>
        transactionIds.has(row.transaction_id) ||
        occurrenceIds.has(row.occurrence_id),
    );
    const referenceIds = new Set(references.map((row) => row.id));
    const contractors = all("contractors")
      .map((contractor) => ({
        ...contractor,
        project_ids: this.db
          .prepare(
            "SELECT project_id FROM contractor_projects WHERE contractor_id = ?",
          )
          .all(contractor.id)
          .map((row) => row.project_id)
          .filter((id) => projectIds.has(id)),
      }))
      .filter(
        (contractor) =>
          user.role !== "employee" || contractor.project_ids.length,
      );
    const comments = this.db
      .prepare(
        "SELECT comments.*, users.name AS author_name FROM comments JOIN users ON users.id = comments.author_id WHERE comments.business_id = ? ORDER BY comments.created_at",
      )
      .all(user.business_id)
      .filter(
        (row) =>
          projectIds.has(row.project_id) ||
          transactionIds.has(row.transaction_id),
      );
    const payments = all("payments").filter((row) =>
      occurrenceIds.has(row.occurrence_id),
    );
    const totals = projects.map((project) => {
      const sum = (type) =>
        transactions
          .filter(
            (tx) =>
              tx.project_id === project.id &&
              tx.status === "recorded" &&
              tx.type === type,
          )
          .reduce((total, tx) => total + tx.amount_cents, 0);
      const expenses = sum("expense"),
        income = sum("income"),
        refunds = sum("refund");
      const projectBills = new Set(
        bills
          .filter((bill) => bill.project_id === project.id)
          .map((bill) => bill.id),
      );
      const unpaid = occurrences
        .filter(
          (row) =>
            projectBills.has(row.bill_id) &&
            row.due_date <= addDays(today, 30) &&
            ["unpaid", "processing"].includes(row.status),
        )
        .reduce((total, row) => total + row.amount_cents, 0);
      const available = project.budget_cents + income + refunds - expenses;
      return {
        ...project,
        expense_cents: expenses,
        income_cents: income,
        refund_cents: refunds,
        available_cents: available,
        unpaid_cents: unpaid,
        projected_cents: available - unpaid,
      };
    });
    const team =
      user.role === "employee"
        ? []
        : all("users").map((member) => ({
            ...publicUser(member),
            last_accessed_at:
              user.role === "owner" || member.id === user.id
                ? member.last_accessed_at
                : null,
            project_ids: this.db
              .prepare(
                "SELECT project_id FROM employee_projects WHERE user_id = ?",
              )
              .all(member.id)
              .map((row) => row.project_id),
            reports_to:
              member.role === "employee" ? this.business(user).owner_id : null,
          }));
    return {
      business: this.business(user),
      today,
      month,
      projects: totals,
      transactions,
      bills,
      occurrences,
      payments,
      references,
      attachments: all("file_attachments")
        .filter((file) => referenceIds.has(file.reference_id))
        .map(({ storage_name, ...file }) => ({
          ...file,
          download_url: `/api/attachments/${file.id}`,
        })),
      contractors,
      comments,
      team,
      billing_accounts: user.role === "employee" ? [] : all("billing_accounts"),
    };
  }
}
