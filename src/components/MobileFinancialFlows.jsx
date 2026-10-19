import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import { useWorkspace } from "../lib/WorkspaceContext.jsx";
import {
  targetOptions,
  transactionTarget,
  isPropertyIncomeDraft,
} from "../lib/transactionTargets.js";
import { encodeFiles } from "../lib/apiClient.js";
import { unpaidBillChoices } from "../../shared/paymentChoices.js";
import { Fields } from "./DomainUI.jsx";
import {
  BillImage,
  FinanceButton,
  FinanceError,
  FinanceEvidence,
  FinanceHero,
  MobileFinanceDialog,
} from "./MobileFinanceUI.jsx";
import incomeIcon from "../assets/mobile/finance/income.svg";
import refundIcon from "../assets/mobile/finance/refund.svg";
import expenseIcon from "../assets/mobile/finance/expense.svg";

function StepForm({ step, children, ...props }) {
  const element = useRef(null);
  useEffect(() => {
    element.current.closest(".mobileFinanceScroll").scrollTo(0, 0);
    element.current.querySelector("h2")?.focus({ preventScroll: true });
  }, [step]);
  return (
    <form ref={element} className="mobileFinanceForm" {...props}>
      {children}
    </form>
  );
}

function useDraft(initial) {
  const baseline = useRef(initial);
  const [form, setForm] = useState(initial);
  const [files, setFiles] = useState([]);
  const dirty =
    Object.keys({ ...baseline.current, ...form }).some(
      (key) => String(form[key] ?? "") !== String(baseline.current[key] ?? ""),
    ) || files.length > 0;
  return { form, setForm, files, setFiles, dirty };
}

async function withEvidence(form, files, receiptRequired = true) {
  const { reference_number, evidence_at, reference_description, ...body } =
    form;
  if (receiptRequired && !reference_number?.trim())
    throw new Error("evidenceRequired");
  if (files.length > 5 || files.some((file) => file.size > 8 * 1024 * 1024))
    throw new Error("invalidFile");
  return {
    ...body,
    reference: {
      reference_number,
      evidence_at: evidence_at || "",
      description: reference_description,
      files: await encodeFiles(files),
    },
  };
}

function StepActions({ step, setStep, saving, final, finalLabel = "save" }) {
  const { t } = useLanguage();
  return (
    <footer className="mobileFinanceStepActions">
      {step > 0 && (
        <button
          type="button"
          className="mobileFinanceBack"
          disabled={saving}
          onClick={() => setStep(step - 1)}
        >
          {t("back")}
        </button>
      )}
      <FinanceButton type="submit" disabled={saving} next={!final}>
        {t(saving ? "saving" : final ? finalLabel : "continue")}
      </FinanceButton>
    </footer>
  );
}

function TypeSelector({ value, onChange }) {
  const { t } = useLanguage();
  return (
    <fieldset className="mobileTransactionTypes">
      <legend>{t("transactionType")}</legend>
      <div>
        {[
          ["income", incomeIcon],
          ["refund", refundIcon],
          ["expense", expenseIcon],
        ].map(([type, icon]) => (
          <label className={`mobileType ${type}`} key={type}>
            <input
              type="radio"
              name="type"
              value={type}
              checked={value === type}
              onChange={() => onChange(type)}
              required
            />
            <span>
              <img src={icon} width="24" height="24" alt="" />
              <span>{t(`statuses.${type}`)}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function MobileTransactionFlow({
  projectId = "",
  propertyId = "",
  targetType,
  onClose,
}) {
  const { t } = useLanguage(),
    { data, mutate } = useWorkspace();
  const draft = useDraft({
    destination: propertyId
      ? `property:${propertyId}`
      : projectId
        ? `project:${projectId}`
        : "",
    name: "",
    date: data.today,
    type: "expense",
    amount: "",
    invoice_id: "",
  });
  const { form, setForm, dirty, files } = draft;
  const [step, setStep] = useState(0),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(null);
  const targets = targetOptions(data, t, targetType);
  async function submit(event) {
    event.preventDefault();
    setError(null);
    if (step < 2) {
      setStep(step + 1);
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      await mutate(
        "transactions",
        transactionTarget(
          await withEvidence(form, files, !isPropertyIncomeDraft(form)),
        ),
      );
      onClose();
    } catch (next) {
      setError(next);
    } finally {
      setSaving(false);
    }
  }
  return (
    <MobileFinanceDialog
      title="newTransaction"
      dirty={dirty}
      saving={saving}
      onClose={onClose}
    >
      <StepForm step={step} onSubmit={submit}>
        <FinanceHero
          title={
            step === 0
              ? "transactionWelcome"
              : step === 1
                ? "transactionDetails"
                : "addEvidence"
          }
          transaction
          compact={step > 0}
        />
        {step > 0 && (
          <p className="mobileFinanceProgress">
            {t("stepOf", { step: step + 1, total: 3 })}
          </p>
        )}
        <FinanceError error={error} />
        {step === 0 ? (
          <>
            <Fields
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
                  label: "transactionName",
                  placeholder: "transactionNameHint",
                  required: !isPropertyIncomeDraft(form),
                  hint: isPropertyIncomeDraft(form)
                    ? "rentIncomeNameHint"
                    : undefined,
                  maxLength: 200,
                },
              ]}
              form={form}
              setForm={setForm}
            />
            <TypeSelector
              value={form.type}
              onChange={(type) => setForm((old) => ({ ...old, type }))}
            />
            {!targets.length && <p className="fieldHint">{t("noTargets")}</p>}
          </>
        ) : step === 1 ? (
          <Fields
            fields={[
              { name: "amount", type: "number", min: "0.01", required: true },
              { name: "date", type: "date", required: true },
              { name: "invoice_id" },
            ]}
            form={form}
            setForm={setForm}
          />
        ) : (
          <FinanceEvidence
            {...draft}
            receiptRequired={!isPropertyIncomeDraft(form)}
          />
        )}
        <StepActions
          step={step}
          setStep={setStep}
          saving={saving}
          final={step === 2}
          finalLabel="saveTransaction"
        />
      </StepForm>
    </MobileFinanceDialog>
  );
}

export function MobileBillPaymentFlow({ row, bill, onClose }) {
  const { t } = useLanguage(),
    { data, mutate, date, money } = useWorkspace();
  const draft = useDraft({
    amount: (row.amount_cents / 100).toFixed(2),
    payment_date: data.today,
    status: "processed",
    billing_account_id: bill.billing_account_id || "",
  });
  const { form, setForm, dirty, files } = draft;
  const [step, setStep] = useState(0),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(null);
  const accounts = data.billing_accounts.map((account) => ({
    value: account.id,
    label: `${account.name} ${account.masked_identifier}`,
  }));
  async function submit(event) {
    event.preventDefault();
    setError(null);
    if (!step) {
      setStep(1);
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      await mutate("payments", {
        ...(await withEvidence(form, files)),
        occurrence_id: row.id,
      });
      onClose();
    } catch (next) {
      setError(next);
    } finally {
      setSaving(false);
    }
  }
  return (
    <MobileFinanceDialog
      title="recordPayment"
      dirty={dirty}
      saving={saving}
      onClose={onClose}
    >
      <StepForm step={step} onSubmit={submit}>
        <FinanceHero title={step ? "addEvidence" : "recordPayment"} compact />
        <div className="mobilePaymentSummary">
          <BillImage bill={bill} />
          <div>
            <strong>{bill.name}</strong>
            <span>
              {t("dueOn", { date: date(row.due_date) })} ·{" "}
              {money(row.amount_cents)}
            </span>
          </div>
        </div>
        <p className="mobileFinanceProgress">
          {t("stepOf", { step: step + 1, total: 2 })}
        </p>
        <FinanceError error={error} />
        {!step ? (
          <>
            <Fields
              fields={[
                { name: "amount", type: "number", disabled: true },
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
              form={form}
              setForm={setForm}
            />
            <p className="fieldHint">{t("paymentHint")}</p>
            {!accounts.length && (
              <p className="fieldHint">{t("accountRequiredHint")}</p>
            )}
          </>
        ) : (
          <FinanceEvidence {...draft} />
        )}
        <StepActions
          step={step}
          setStep={setStep}
          saving={saving}
          final={step === 1}
          finalLabel="recordPayment"
        />
      </StepForm>
    </MobileFinanceDialog>
  );
}

export function MobileBillScheduleFlow({ fields, onClose }) {
  const { t } = useLanguage(),
    { data, mutate, date, money } = useWorkspace();
  const draft = useDraft({
    name: "",
    amount: "",
    first_due_date: data.today,
    recurrence: "monthly",
    recurrence_day: "",
    interval_days: 30,
    payee_account_number: "",
    billing_account_id: "",
  });
  const { form, setForm } = draft;
  const [step, setStep] = useState(0),
    [image, setImage] = useState(null),
    [preview, setPreview] = useState(null),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(null),
    [saved, setSaved] = useState(null),
    [paying, setPaying] = useState(false);
  // Blob URLs are released when replaced or when the editor closes.
  const setBillImage = (file) => {
    setError(null);
    if (
      file &&
      (!["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
        file.size > 8 * 1024 * 1024)
    ) {
      setError(new Error("invalidImage"));
      return;
    }
    setImage(file);
    setPreview(file ? URL.createObjectURL(file) : null);
  };
  useBlobCleanup(preview);
  async function submit(event) {
    event.preventDefault();
    setError(null);
    if (step < 2) {
      setStep(step + 1);
      return;
    }
    if (saving || saved) return;
    setSaving(true);
    try {
      const encoded = image ? (await encodeFiles([image]))[0] : null;
      const result = await mutate("bills", {
        ...form,
        ...(encoded ? { image: encoded } : {}),
      });
      setSaved({
        row: result.first_occurrence,
        bill: {
          ...form,
          id: result.id,
          image_url: image ? `/api/bills/${result.id}/image` : null,
        },
      });
    } catch (next) {
      setError(next);
    } finally {
      setSaving(false);
    }
  }
  if (paying)
    return (
      <MobileBillPaymentFlow
        row={saved.row}
        bill={saved.bill}
        onClose={onClose}
      />
    );
  const fieldNames =
    step === 0
      ? ["name", "amount"]
      : step === 1
        ? ["first_due_date", "recurrence", "recurrence_day", "interval_days"]
        : ["payee_account_number", "billing_account_id"];
  return (
    <MobileFinanceDialog
      title="newBill"
      dirty={!saved && (draft.dirty || !!image)}
      saving={saving}
      onClose={onClose}
    >
      {saved ? (
        <div className="mobileFinanceForm">
          <FinanceHero title="scheduleCreated" compact />
          <div className="mobilePaymentSummary">
            <BillImage bill={saved.bill} />
            <div>
              <strong>{saved.bill.name}</strong>
              <span>
                {t("dueOn", { date: date(saved.row.due_date) })} ·{" "}
                {money(saved.row.amount_cents)}
              </span>
            </div>
          </div>
          <p role="status">{t("firstPaymentOffer")}</p>
          <FinanceButton
            type="button"
            className="green"
            onClick={() => setPaying(true)}
            disabled={!data.billing_accounts.length}
          >
            {t("recordFirstPayment")}
          </FinanceButton>
          {!data.billing_accounts.length && (
            <p className="fieldHint">{t("accountRequiredHint")}</p>
          )}
          <FinanceButton type="button" className="secondary" onClick={onClose}>
            {t("doneForNow")}
          </FinanceButton>
        </div>
      ) : (
        <StepForm step={step} onSubmit={submit}>
          <FinanceHero
            title={
              step === 0
                ? "newBillScheme"
                : step === 1
                  ? "scheduleTiming"
                  : "billAccountImage"
            }
            compact
          />
          <p className="mobileFinanceProgress">
            {t("stepOf", { step: step + 1, total: 3 })}
          </p>
          <FinanceError error={error} />
          <Fields
            fields={fields.filter((field) => fieldNames.includes(field.name))}
            form={form}
            setForm={setForm}
          />
          {step === 2 && (
            <section className="mobileBillImageField">
              <label>
                {t("billImage")}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => {
                    setBillImage(event.target.files?.[0] || null);
                    event.target.value = "";
                  }}
                />
                <span className="fieldHint">{t("billImageHint")}</span>
              </label>
              {image && (
                <div className="mobileImagePreview">
                  <img src={preview} alt={t("billImagePreview")} />
                  <span>{image.name}</span>
                  <button type="button" onClick={() => setBillImage(null)}>
                    {t("remove")}
                  </button>
                </div>
              )}
            </section>
          )}
          <StepActions
            step={step}
            setStep={setStep}
            saving={saving}
            final={step === 2}
            finalLabel="createSchedule"
          />
        </StepForm>
      )}
    </MobileFinanceDialog>
  );
}

// Kept separate so object URL cleanup never changes the draft's persisted fields.
function useBlobCleanup(url) {
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
}

export function MobileBillPicker({ onClose, ScheduleEditor }) {
  const { t } = useLanguage(),
    { data, money, date } = useWorkspace();
  const navigate = useNavigate();
  const [choice, setChoice] = useState(null),
    [creating, setCreating] = useState(false);
  const choices = unpaidBillChoices(data);
  if (creating) return <ScheduleEditor onClose={onClose} />;
  if (choice)
    return (
      <MobileBillPaymentFlow
        row={choice.row}
        bill={choice.bill}
        onClose={onClose}
      />
    );
  return (
    <MobileFinanceDialog
      title="billPayment"
      onClose={onClose}
      className="mobileBillPicker"
    >
      <div className="mobileFinanceForm">
        <FinanceHero title="billWelcome" />
        <FinanceButton
          type="button"
          className="green"
          onClick={() => setCreating(true)}
        >
          {t("newBillScheme")}
        </FinanceButton>
        <p className="mobileBillPickerCaption">{t("orExistingBill")}</p>
        <div
          className="mobileBillChoices"
          role="region"
          aria-label={t("selectBill")}
          tabIndex={choices.length ? 0 : undefined}
        >
          {!choices.length ? (
            <p className="fieldHint">{t("noUnpaidBills")}</p>
          ) : (
            choices.map((item) => (
              <button
                key={item.row.id}
                type="button"
                className="mobileBillChoice"
                aria-label={`${item.bill.name} · ${date(item.row.due_date)} · ${money(item.row.amount_cents)}`}
                onClick={() => {
                  if (item.payment) {
                    navigate(`/transactions?tab=bills#${item.row.id}`);
                    onClose();
                  } else setChoice(item);
                }}
              >
                <BillImage bill={item.bill} />
                <span>
                  <strong>{item.bill.name}</strong>
                  <small>
                    {t(item.row.due_date < data.today ? "overdueOn" : "dueOn", {
                      date: date(item.row.due_date),
                    })}
                  </small>
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </MobileFinanceDialog>
  );
}
