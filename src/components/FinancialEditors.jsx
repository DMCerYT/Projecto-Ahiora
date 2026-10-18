import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import { useWorkspace } from "../lib/WorkspaceContext.jsx";
import { unpaidBillChoices } from "../../shared/paymentChoices.js";
import { Editor } from "./DomainUI.jsx";

export function TransactionEditor({ projectId = "", onClose }) {
  const { data, mutate } = useWorkspace();
  const projects = data.projects
    .filter((project) => project.status !== "archived")
    .map((project) => ({ value: project.id, label: project.name }));
  return (
    <Editor
      title="newTransaction"
      fields={[
        {
          name: "project_id",
          label: "project",
          type: "select",
          options: projects,
          required: true,
        },
        { name: "name", required: true },
        {
          name: "type",
          type: "select",
          options: ["expense", "income", "refund"],
          required: true,
        },
        { name: "amount", type: "number", min: "0.01", required: true },
        { name: "date", type: "date", required: true },
        { name: "invoice_id" },
      ]}
      initial={{ project_id: projectId, date: data.today, type: "expense" }}
      evidence
      onClose={onClose}
      onSave={(body) => mutate("transactions", body)}
    />
  );
}

export function BillPaymentEditor({
  row,
  bill,
  onClose,
  showBillName = false,
}) {
  const { data, mutate, date } = useWorkspace();
  const accounts = data.billing_accounts.map((account) => ({
    value: account.id,
    label: `${account.name} ${account.masked_identifier}`,
  }));
  return (
    <Editor
      title="recordPayment"
      subtitle={
        showBillName ? `${bill.name} · ${date(row.due_date)}` : undefined
      }
      fields={[
        { name: "amount", type: "number", required: true, disabled: true },
        { name: "payment_date", type: "date", required: true },
        {
          name: "status",
          type: "select",
          options: ["processing", "processed"],
          required: true,
        },
        {
          name: "billing_account_id",
          label: "billingAccount",
          type: "select",
          options: accounts,
          required: true,
        },
      ]}
      initial={{
        amount: (row.amount_cents / 100).toFixed(2),
        payment_date: data.today,
        status: "processed",
        billing_account_id: bill.billing_account_id || "",
      }}
      evidence
      onClose={onClose}
      onSave={(body) => mutate("payments", { ...body, occurrence_id: row.id })}
    />
  );
}

export function BillPaymentPicker({ onClose }) {
  const { t } = useLanguage(),
    { data, money, date } = useWorkspace();
  const navigate = useNavigate(),
    dialog = useRef(null);
  const [selectedId, setSelectedId] = useState(""),
    [choice, setChoice] = useState(null);
  const choices = unpaidBillChoices(data);
  useEffect(() => {
    dialog.current.showModal();
  }, []);
  if (choice)
    return (
      <BillPaymentEditor
        row={choice.row}
        bill={choice.bill}
        onClose={onClose}
        showBillName
      />
    );
  return (
    <dialog
      ref={dialog}
      className="formDialog"
      aria-labelledby="bill-picker-title"
      onCancel={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const next = choices.find((item) => item.row.id === selectedId);
          if (!next) return;
          // A failed attempt already has a payment record: resume its existing workflow.
          if (next.payment) {
            navigate(`/bills#${next.row.id}`);
            onClose();
          } else setChoice(next);
        }}
      >
        <div className="sectionHeader">
          <h2 id="bill-picker-title">{t("billPayment")}</h2>
          <button className="smallButton" type="button" onClick={onClose}>
            {t("close")}
          </button>
        </div>
        <p className="fieldHint">{t("selectBillHint")}</p>
        {!choices.length ? (
          <p className="stateBox">{t("noUnpaidBills")}</p>
        ) : (
          <label htmlFor="mobile-bill-choice">
            {t("selectBill")}
            <select
              id="mobile-bill-choice"
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
              required
            >
              <option value="">{t("choose")}</option>
              {choices.map(({ row, bill, project }) => (
                <option key={row.id} value={row.id}>
                  {bill.name} · {project.name} · {date(row.due_date)} ·{" "}
                  {money(row.amount_cents)}
                </option>
              ))}
            </select>
          </label>
        )}
        {!data.billing_accounts.length && (
          <p className="fieldHint">{t("accountRequiredHint")}</p>
        )}
        <button
          className="primaryButton"
          disabled={!selectedId || !data.billing_accounts.length}
        >
          {t("continuePayment")}
        </button>
      </form>
    </dialog>
  );
}
