import { useEffect, useId, useRef, useState } from "react";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import { useWorkspace } from "../lib/WorkspaceContext.jsx";
import { encodeFiles } from "../lib/apiClient.js";

export function ErrorBox({ error }) {
  const { t } = useLanguage();
  return error ? (
    <div className="errorBox" role="alert">
      {t(`errors.${error.code || error.message || "internal"}`)}
    </div>
  ) : null;
}
export function Status({ value }) {
  const { t } = useLanguage();
  return (
    <span className={`statusPill ${value}`}>{t(`statuses.${value}`)}</span>
  );
}
export function Empty() {
  const { t } = useLanguage();
  return <p className="stateBox">{t("noRecords")}</p>;
}
export function PageTitle({ title, children }) {
  const { t } = useLanguage(),
    { data } = useWorkspace();
  return (
    <header className="pageHeader">
      <div>
        <p className="eyebrow">{data.business.name}</p>
        <h1>{t(title)}</h1>
      </div>
      {children}
    </header>
  );
}
export function Fields({ fields, form, setForm }) {
  const { t } = useLanguage();
  const fieldId = useId();
  return (
    <div className="formGrid">
      {fields
        .filter((field) => !field.show || field.show(form))
        .map((field) => {
          const options =
            typeof field.options === "function"
              ? field.options(form)
              : field.options || [];
          if (field.type === "checks")
            return (
              <fieldset className="fullSpan" key={field.name}>
                <legend>{t(field.label || field.name)}</legend>
                <div className="checkOptions">
                  {options.map((item) => (
                    <label key={item.value} className="checkLabel">
                      <input
                        type="checkbox"
                        checked={(form[field.name] || []).includes(item.value)}
                        onChange={(event) =>
                          setForm((old) => ({
                            ...old,
                            [field.name]: event.target.checked
                              ? [...(old[field.name] || []), item.value]
                              : (old[field.name] || []).filter(
                                  (id) => id !== item.value,
                                ),
                          }))
                        }
                      />
                      {item.label}
                    </label>
                  ))}
                </div>
                {!options.length && (
                  <span className="fieldHint">{t("noProjects")}</span>
                )}
              </fieldset>
            );
          const props = {
            id: `${fieldId}-${field.name}`,
            name: field.name,
            value: form[field.name] ?? "",
            required: field.required,
            disabled: field.disabled,
            onChange: (event) =>
              setForm((old) => ({ ...old, [field.name]: event.target.value })),
          };
          return (
            <label
              key={field.name}
              className={field.wide ? "fullSpan" : ""}
              htmlFor={props.id}
            >
              {t(field.label || field.name)}
              {field.type === "select" ? (
                <select {...props}>
                  <option value="">{t("choose")}</option>
                  {options.map((item) =>
                    typeof item === "string" ? (
                      <option key={item} value={item}>
                        {t(`statuses.${item}`)}
                      </option>
                    ) : (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ),
                  )}
                </select>
              ) : field.type === "textarea" ? (
                <textarea
                  {...props}
                  rows="3"
                  maxLength={field.maxLength || 5000}
                />
              ) : (
                <input
                  {...props}
                  type={field.type || "text"}
                  min={field.min}
                  max={field.max}
                  step={
                    field.step || (field.type === "number" ? "0.01" : undefined)
                  }
                  maxLength={field.maxLength || 500}
                  autoComplete={
                    field.type === "password" ? "new-password" : undefined
                  }
                />
              )}
              {field.hint && <span className="fieldHint">{t(field.hint)}</span>}
            </label>
          );
        })}
    </div>
  );
}
export function Editor({
  title,
  fields,
  initial,
  evidence = false,
  subtitle,
  onSave,
  onClose,
}) {
  const { t } = useLanguage();
  const dialog = useRef(null);
  const [form, setForm] = useState(initial || {}),
    [files, setFiles] = useState([]),
    [error, setError] = useState(null),
    [saving, setSaving] = useState(false);
  useEffect(() => {
    dialog.current.showModal();
  }, []);
  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { reference_number, evidence_at, reference_description, ...body } =
        form;
      if (evidence) {
        if (!reference_number?.trim() && !evidence_at && !files.length)
          throw new Error("evidenceRequired");
        body.reference = {
          reference_number,
          evidence_at: evidence_at ? new Date(evidence_at).toISOString() : "",
          description: reference_description,
          files: await encodeFiles(files),
        };
      }
      await onSave(body);
      onClose();
    } catch (next) {
      setError(next);
    } finally {
      setSaving(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="formDialog"
      aria-labelledby="editor-title"
      onCancel={(event) => {
        if (saving) event.preventDefault();
        else onClose();
      }}
    >
      <form onSubmit={submit}>
        <div className="sectionHeader">
          <h2 id="editor-title">{t(title)}</h2>
          <button
            type="button"
            className="smallButton"
            disabled={saving}
            onClick={onClose}
          >
            {t("close")}
          </button>
        </div>
        <ErrorBox error={error} />
        {subtitle && <p className="fieldHint">{subtitle}</p>}
        <Fields fields={fields} form={form} setForm={setForm} />
        {evidence && (
          <section className="evidencePanel">
            <h3>{t("reference")}</h3>
            <p className="fieldHint">{t("evidenceHint")}</p>
            <Fields
              fields={[
                { name: "reference_number" },
                { name: "evidence_at", type: "datetime-local" },
                { name: "reference_description", type: "textarea", wide: true },
              ]}
              form={form}
              setForm={setForm}
            />
            <label>
              {t("files")}
              <input
                type="file"
                multiple
                onChange={(event) =>
                  setFiles(Array.from(event.target.files || []))
                }
              />
              <span className="fieldHint">{t("fileHint")}</span>
            </label>
          </section>
        )}
        <button className="primaryButton" disabled={saving}>
          {t(saving ? "saving" : "save")}
        </button>
      </form>
    </dialog>
  );
}
export function References({ transactionId, occurrenceId }) {
  const { t } = useLanguage(),
    { data, date, editor, mutate } = useWorkspace();
  const [adding, setAdding] = useState(false);
  const references = data.references.filter((reference) =>
    transactionId
      ? reference.transaction_id === transactionId
      : reference.occurrence_id === occurrenceId,
  );
  return (
    <div className="referenceList">
      {references.map((reference) => (
        <div className="referenceItem" key={reference.id}>
          <strong>{reference.reference_number || t("reference")}</strong>
          {reference.evidence_at && <span>{date(reference.evidence_at)}</span>}
          {reference.description && <span>{reference.description}</span>}
          {data.attachments
            .filter((file) => file.reference_id === reference.id)
            .map((file) => (
              <a key={file.id} href={file.download_url} className="fileLink">
                {file.original_name} · {Math.ceil(file.size_bytes / 1024)} KB ↓
              </a>
            ))}
        </div>
      ))}
      {editor && (
        <button className="linkButton" onClick={() => setAdding(true)}>
          {t("addReference")}
        </button>
      )}
      {adding && (
        <Editor
          title="addReference"
          fields={[]}
          evidence
          onClose={() => setAdding(false)}
          onSave={(body) =>
            mutate("references", {
              ...body.reference,
              ...(transactionId
                ? { transaction_id: transactionId }
                : { occurrence_id: occurrenceId }),
            })
          }
        />
      )}
    </div>
  );
}
export function Comments({ projectId, transactionId }) {
  const { t } = useLanguage(),
    { data, user, date, mutate } = useWorkspace();
  const [text, setText] = useState(""),
    [error, setError] = useState(null),
    [saving, setSaving] = useState(false),
    [editing, setEditing] = useState(null);
  const transactionIds = new Set(
    data.transactions
      .filter((tx) => tx.project_id === projectId)
      .map((tx) => tx.id),
  );
  const comments = data.comments.filter((comment) =>
    transactionId
      ? comment.transaction_id === transactionId
      : comment.project_id === projectId ||
        transactionIds.has(comment.transaction_id),
  );
  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await mutate("comments", {
        text,
        ...(transactionId
          ? { transaction_id: transactionId }
          : { project_id: projectId }),
      });
      setText("");
    } catch (next) {
      setError(next);
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="contentSection">
      <h2>{t("comments")}</h2>
      <div className="commentList">
        {comments.map((comment) => (
          <article key={comment.id} className="commentItem">
            <div className="sectionHeader">
              <strong>{comment.author_name}</strong>
              <small>
                {date(comment.created_at)}
                {comment.edited_at &&
                  ` · ${t("edited")} ${date(comment.edited_at)}`}
              </small>
            </div>
            {projectId && comment.transaction_id && (
              <small>
                {t("transaction")}:{" "}
                {
                  data.transactions.find(
                    (tx) => tx.id === comment.transaction_id,
                  )?.name
                }
              </small>
            )}
            <p>{comment.text}</p>
            {comment.author_id === user.id && (
              <button
                className="linkButton"
                onClick={() => setEditing(comment)}
              >
                {t("edit")}
              </button>
            )}
          </article>
        ))}
      </div>
      <ErrorBox error={error} />
      <form onSubmit={submit} className="commentForm">
        <label>
          {t("addComment")}
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            required
            maxLength="5000"
            rows="3"
          />
        </label>
        <button className="primaryButton" disabled={saving}>
          {t(saving ? "saving" : "postComment")}
        </button>
      </form>
      {editing && (
        <Editor
          title="editComment"
          initial={editing}
          fields={[
            { name: "text", type: "textarea", required: true, wide: true },
          ]}
          onClose={() => setEditing(null)}
          onSave={(body) =>
            mutate(`comments/${editing.id}`, { text: body.text }, "PUT")
          }
        />
      )}
    </section>
  );
}
export function useAction() {
  const [error, setError] = useState(null),
    [busy, setBusy] = useState(false);
  const run = async (work) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (next) {
      setError(next);
    } finally {
      setBusy(false);
    }
  };
  return { error, busy, run };
}
