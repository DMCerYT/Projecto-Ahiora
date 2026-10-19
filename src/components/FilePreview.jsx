import { useEffect, useRef, useState } from "react";
import { useLanguage } from "../i18n/LanguageContext.jsx";

export function FilePreview({ file, onClose }) {
  const { t } = useLanguage();
  const dialog = useRef(null);
  const [preview, setPreview] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const previousFocus = document.activeElement;
    dialog.current.showModal();
    return () => previousFocus?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl;
    const type = file.mime_type?.toLowerCase().split(";")[0];
    const kind = [
      "image/png",
      "image/jpeg",
      "image/gif",
      "image/webp",
      "image/avif",
      "image/bmp",
    ].includes(type)
      ? "image"
      : type === "application/pdf"
        ? "pdf"
        : ["text/plain", "text/csv", "application/json"].includes(type)
          ? "text"
          : null;
    if (!kind) {
      setPreview({ kind: "unsupported" });
      return () => controller.abort();
    }
    async function load() {
      try {
        const response = await fetch(file.download_url, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("previewFailed");
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        if (kind === "text") {
          const text = await blob.text();
          if (!controller.signal.aborted) setPreview({ kind, text });
        } else {
          objectUrl = URL.createObjectURL(new Blob([blob], { type }));
          setPreview({ kind, url: objectUrl });
        }
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      }
    }
    load();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file]);
  return (
    <dialog
      ref={dialog}
      className="filePreviewDialog"
      aria-label={`${t("previewFile")}: ${file.original_name}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="sectionHeader">
        <h2>{file.original_name}</h2>
        <button
          type="button"
          className="smallButton"
          onClick={onClose}
          autoFocus
        >
          {t("close")}
        </button>
      </div>
      <div className="filePreviewContent" aria-busy={!preview && !failed}>
        {failed ? (
          <p role="alert">{t("previewFailed")}</p>
        ) : !preview ? (
          <p role="status">{t("loading")}</p>
        ) : preview.kind === "image" ? (
          <img
            src={preview.url}
            alt={file.original_name}
            onError={() => setFailed(true)}
          />
        ) : preview.kind === "pdf" ? (
          <object
            data={preview.url}
            type="application/pdf"
            aria-label={file.original_name}
          >
            <p>{t("previewUnavailable")}</p>
          </object>
        ) : preview.kind === "text" ? (
          <pre>{preview.text}</pre>
        ) : (
          <p>{t("previewUnavailable")}</p>
        )}
      </div>
      <a href={file.download_url} className="fileLink">
        {t("downloadFile")} · {Math.ceil(file.size_bytes / 1024)} KB ↓
      </a>
    </dialog>
  );
}
