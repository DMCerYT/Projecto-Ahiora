import { useEffect, useRef, useState } from "react";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import { ErrorBox, Fields } from "./DomainUI.jsx";
import closeIcon from "../assets/mobile/finance/close.svg";
import billIcon from "../assets/mobile/finance/bill.svg";
import billMascot from "../assets/mobile/finance/bill-mascot.png";
import transactionMascot from "../assets/mobile/finance/transaction-mascot.png";
import continueIcon from "../assets/mobile/finance/continue.svg";

function DiscardPrompt({ onKeep, onDiscard }) {
  const { t } = useLanguage();
  const dialog = useRef(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    dialog.current.showModal();
    return () => previousFocus?.focus({ preventScroll: true });
  }, []);
  return (
    <dialog
      ref={dialog}
      className="mobileDiscard"
      aria-label={t("discardTitle")}
      onCancel={(event) => {
        event.preventDefault();
        onKeep();
      }}
    >
      <h2>{t("discardTitle")}</h2>
      <p>{t("discardHint")}</p>
      <button
        type="button"
        className="mobileFinanceButton"
        autoFocus
        onClick={onKeep}
      >
        {t("keepEditing")}
      </button>
      <button
        type="button"
        className="mobileFinanceButton danger"
        onClick={onDiscard}
      >
        {t("discardChanges")}
      </button>
    </dialog>
  );
}

export function MobileFinanceDialog({
  title,
  dirty = false,
  saving = false,
  onClose,
  children,
  className = "",
}) {
  const { t } = useLanguage();
  const dialog = useRef(null);
  const [discarding, setDiscarding] = useState(false);
  useEffect(() => {
    const previousFocus = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current.showModal();
    return () => {
      document.body.style.overflow = overflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);
  const requestClose = () => {
    if (saving) return;
    if (dirty) setDiscarding(true);
    else onClose();
  };
  return (
    <dialog
      ref={dialog}
      className={`mobileFinanceDialog ${className}`}
      aria-label={t(title)}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
    >
      <button
        type="button"
        className="mobileFinanceClose"
        aria-label={t("close")}
        disabled={saving}
        onClick={requestClose}
      >
        <img src={closeIcon} width="48" height="48" alt="" />
      </button>
      <div className="mobileFinanceScroll" aria-busy={saving}>
        {children}
      </div>
      {discarding && (
        <DiscardPrompt
          onKeep={() => setDiscarding(false)}
          onDiscard={onClose}
        />
      )}
    </dialog>
  );
}

export function FinanceHero({ title, transaction = false, compact = false }) {
  const { t } = useLanguage();
  return (
    <header
      className={`mobileFinanceHero ${transaction ? "transaction" : "bill"} ${compact ? "compact" : ""}`}
    >
      <div className="mobileFinanceMascot" aria-hidden="true">
        <img src={transaction ? transactionMascot : billMascot} alt="" />
      </div>
      {!compact && <div className="mobileMascotFade" />}
      <h2 tabIndex="-1">{t(title)}</h2>
    </header>
  );
}

export function FinanceButton({
  children,
  next = false,
  className = "",
  ...props
}) {
  return (
    <button className={`mobileFinanceButton ${className}`} {...props}>
      <span>{children}</span>
      {next && <img src={continueIcon} width="36" height="36" alt="" />}
    </button>
  );
}

export function BillImage({ bill, className = "" }) {
  return (
    <span className={`mobileBillImage ${className}`}>
      <img src={bill.image_url || billIcon} width="40" height="40" alt="" />
    </span>
  );
}

export function FinanceEvidence({
  form,
  setForm,
  files,
  setFiles,
  receiptRequired = true,
}) {
  const { t } = useLanguage();
  return (
    <section className="mobileFinanceEvidence">
      <h3>{t("reference")}</h3>
      <p className="fieldHint">
        {t(receiptRequired ? "evidenceHint" : "optionalEvidenceHint")}
      </p>
      <Fields
        fields={[
          {
            name: "reference_number",
            required: receiptRequired,
            maxLength: 200,
          },
          { name: "evidence_at", type: "date" },
          { name: "reference_description", type: "textarea" },
        ]}
        form={form}
        setForm={setForm}
      />
      <label>
        {t("files")}
        <input
          type="file"
          multiple
          onChange={(event) => {
            const next = Array.from(event.target.files || []);
            setFiles(next);
            event.target.value = "";
          }}
        />
        <span className="fieldHint">{t("fileHint")}</span>
      </label>
      {files.length > 0 && (
        <ul className="mobileFileList">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`}>
              <span>{file.name}</span>
              <button
                type="button"
                onClick={() =>
                  setFiles(files.filter((_, item) => item !== index))
                }
                aria-label={t("removeFile", { name: file.name })}
              >
                {t("remove")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function FinanceError({ error }) {
  const element = useRef(null);
  useEffect(() => {
    if (!error) return;
    element.current?.scrollIntoView({ block: "nearest" });
    element.current?.focus({ preventScroll: true });
  }, [error]);
  return error ? (
    <div ref={element} tabIndex="-1">
      <ErrorBox error={error} />
    </div>
  ) : null;
}
