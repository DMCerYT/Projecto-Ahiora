import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import { useWorkspace } from "../lib/WorkspaceContext.jsx";
import { unpaidBillChoices } from "../../shared/paymentChoices.js";
import { Editor } from "./DomainUI.jsx";
import {
  targetOptions,
  transactionTarget,
  isPropertyIncomeDraft,
} from "../lib/transactionTargets.js";
import { useMobile } from "../lib/useMobile.js";
import {
  MobileTransactionFlow,
  MobileBillPaymentFlow,
  MobileBillScheduleFlow,
  MobileBillPicker,
} from "./MobileFinancialFlows.jsx";

export function TransactionEditor({
  projectId = "",
  propertyId = "",
  targetType,
  onClose,
}) {
  const { data, mutate } = useWorkspace();
  const { t } = useLanguage();
  const mobile = useMobile();
  const targets = targetOptions(data, t, targetType);
  if (mobile)
    return (
      <MobileTransactionFlow
        projectId={projectId}
        propertyId={propertyId}
        targetType={targetType}
        onClose={onClose}
      />
    );
  return (
    <Editor
      title="newTransaction"
      fields={[
        {
          name: "destination",
          label: "destination",
          type: "select",
          options: targets,
          required: true,
        },
        {
          name: "name",
          required: (form) => !isPropertyIncomeDraft(form),
          hint: "rentIncomeNameHint",
        },
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
      initial={{
        destination: propertyId
          ? `property:${propertyId}`
          : projectId
            ? `project:${projectId}`
            : "",
        date: data.today,
        type: "expense",
      }}
      evidence
      receiptRequired={(form) => !isPropertyIncomeDraft(form)}
      onClose={onClose}
      onSave={(body) => mutate("transactions", transactionTarget(body))}
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
  const mobile = useMobile();
  const accounts = data.billing_accounts.map((account) => ({
    value: account.id,
    label: `${account.name} ${account.masked_identifier}`,
  }));
  if (mobile)
    return <MobileBillPaymentFlow row={row} bill={bill} onClose={onClose} />;
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
  const mobile = useMobile();
  if (mobile)
    return (
      <MobileBillPicker onClose={onClose} ScheduleEditor={BillScheduleEditor} />
    );
  return <DesktopBillPaymentPicker onClose={onClose} />;
}

function DesktopBillPaymentPicker({ onClose }) {
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
            navigate(`/transactions?tab=bills#${next.row.id}`);
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
              {choices.map(({ row, bill }) => (
                <option key={row.id} value={row.id}>
                  {bill.name} · {date(row.due_date)} · {money(row.amount_cents)}
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

export function BillScheduleEditor({ onClose }) {
  const { data, mutate } = useWorkspace();
  const mobile = useMobile();
  const accounts = data.billing_accounts.map((account) => ({
    value: account.id,
    label: `${account.name} ${account.masked_identifier}`,
  }));
  const fields = [
    { name: "name", required: true, maxLength: mobile ? 160 : undefined },
    { name: "amount", type: "number", min: "0.01", required: true },
    { name: "first_due_date", type: "date", required: true },
    {
      name: "recurrence",
      type: "select",
      options: ["once", "monthly", "weekly", "yearly", "interval_days"],
      required: true,
    },
    {
      name: "recurrence_day",
      type: "number",
      min: 1,
      max: 31,
      step: 1,
      show: (form) => form.recurrence === "monthly",
      hint: "monthlyHint",
    },
    {
      name: "interval_days",
      type: "number",
      min: 1,
      max: 3650,
      step: 1,
      required: true,
      show: (form) => form.recurrence === "interval_days",
    },
    { name: "payee_account_number" },
    {
      name: "billing_account_id",
      label: "billingAccount",
      type: "select",
      options: accounts,
    },
  ];
  if (mobile)
    return <MobileBillScheduleFlow fields={fields} onClose={onClose} />;
  return (
    <Editor
      title="newBill"
      fields={fields}
      initial={{
        first_due_date: data.today,
        recurrence: "monthly",
        interval_days: 30,
      }}
      onClose={onClose}
      onSave={(body) => mutate("bills", body)}
    />
  );
}
