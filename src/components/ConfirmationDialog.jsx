import { useEffect, useId, useRef } from "react";
import { useLanguage } from "../i18n/LanguageContext.jsx";

export default function ConfirmationDialog({
  title,
  message,
  confirmLabel = "confirm",
  danger = false,
  busy,
  onConfirm,
  onCancel,
}) {
  const { t } = useLanguage();
  const dialog = useRef(null),
    titleId = useId(),
    messageId = useId();
  useEffect(() => {
    const previousFocus = document.activeElement;
    dialog.current.showModal();
    return () => previousFocus?.focus({ preventScroll: true });
  }, []);
  return (
    <dialog
      ref={dialog}
      className="confirmationDialog"
      aria-labelledby={titleId}
      aria-describedby={messageId}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!busy) onCancel();
      }}
    >
      <h2 id={titleId}>{title}</h2>
      <p id={messageId}>{message}</p>
      <div className="buttonRow">
        <button
          type="button"
          className="secondaryButton"
          autoFocus
          disabled={busy}
          onClick={onCancel}
        >
          {t("cancel")}
        </button>
        <button
          type="button"
          className={danger ? "primaryButton danger" : "primaryButton"}
          disabled={busy}
          onClick={onConfirm}
        >
          {t(busy ? "saving" : confirmLabel)}
        </button>
      </div>
    </dialog>
  );
}
