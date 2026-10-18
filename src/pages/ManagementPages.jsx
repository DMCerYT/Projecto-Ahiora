import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import { useWorkspace } from "../lib/WorkspaceContext.jsx";
import { useMobile } from "../lib/useMobile.js";
import { apiRequest } from "../lib/apiClient.js";
import {
  Editor,
  Empty,
  ErrorBox,
  Fields,
  PageTitle,
  Status,
  useAction,
} from "../components/DomainUI.jsx";

export function ContractorsPage() {
  const { t } = useLanguage(),
    { data, editor, mutate } = useWorkspace();
  const [editing, setEditing] = useState(null);
  const action = useAction();
  const fields = [
    { name: "name", required: true },
    { name: "email", type: "email" },
    { name: "phone", type: "tel" },
    { name: "address" },
    {
      name: "project_ids",
      label: "assignProjects",
      type: "checks",
      options: data.projects.map((project) => ({
        value: project.id,
        label: project.name,
      })),
    },
  ];
  return (
    <div className="pageStack">
      <PageTitle title="contractors">
        {editor && (
          <button className="primaryButton" onClick={() => setEditing({})}>
            {t("newContractor")}
          </button>
        )}
      </PageTitle>
      <p className="fieldHint">{t("contractorHint")}</p>
      <ErrorBox error={action.error} />
      {!data.contractors.length ? (
        <Empty />
      ) : (
        <div className="projectGrid">
          {data.contractors.map((contractor) => (
            <article className="contentSection" key={contractor.id}>
              <h2>{contractor.name}</h2>
              <p>{contractor.email}</p>
              <p>{contractor.phone}</p>
              <p>{contractor.address}</p>
              <div className="tagList">
                {contractor.project_ids.map((id) => (
                  <Link key={id} to={`/projects/${id}`}>
                    {data.projects.find((project) => project.id === id)?.name}
                  </Link>
                ))}
              </div>
              {editor && (
                <div className="buttonRow">
                  <button
                    className="smallButton"
                    onClick={() => setEditing(contractor)}
                  >
                    {t("edit")}
                  </button>
                  <button
                    className="smallButton danger"
                    disabled={action.busy}
                    onClick={() => {
                      if (window.confirm(t("deleteConfirm")))
                        action.run(() =>
                          mutate(`contractors/${contractor.id}`, {}, "DELETE"),
                        );
                    }}
                  >
                    {t("delete")}
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      {editing && (
        <Editor
          title={editing.id ? "editContractor" : "newContractor"}
          fields={fields}
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={(body) =>
            mutate(
              editing.id ? `contractors/${editing.id}` : "contractors",
              body,
              editing.id ? "PUT" : "POST",
            )
          }
        />
      )}
    </div>
  );
}
export function TeamPage() {
  const { t } = useLanguage(),
    { data, owner, date, mutate } = useWorkspace();
  const [editing, setEditing] = useState(null);
  const fields = [
    { name: "name", required: true },
    { name: "email", type: "email", required: true },
    {
      name: "password",
      type: "password",
      required: !editing?.id,
      hint: editing?.id ? "optionalPassword" : "passwordHint",
    },
    {
      name: "role",
      type: "select",
      options: owner ? ["admin", "employee"] : ["employee"],
      required: true,
    },
    { name: "title", required: true, show: (form) => form.role === "employee" },
    {
      name: "preferred_language",
      type: "select",
      options: [
        { value: "en", label: "English" },
        { value: "es", label: "Español" },
      ],
      required: true,
    },
    {
      name: "project_ids",
      label: "assignProjects",
      type: "checks",
      options: data.projects.map((project) => ({
        value: project.id,
        label: project.name,
      })),
      show: (form) => form.role === "employee",
    },
  ];
  const ownerName = data.team.find((member) => member.role === "owner")?.name;
  return (
    <div className="pageStack">
      <PageTitle title="team">
        <button
          className="primaryButton"
          onClick={() =>
            setEditing({
              role: "employee",
              preferred_language: data.business.default_language,
            })
          }
        >
          {t("newMember")}
        </button>
      </PageTitle>
      <p className="fieldHint">{t("teamHint")}</p>
      <div className="recordList">
        {data.team.map((member) => (
          <article className="contentSection" key={member.id}>
            <div className="sectionHeader">
              <h2>{member.name}</h2>
              <Status value={member.role} />
            </div>
            <p>{member.email}</p>
            {member.role === "employee" && (
              <p>
                {member.title} · {t("reportsTo")}: {ownerName}
              </p>
            )}
            {member.role === "admin" && (owner || member.last_accessed_at) && (
              <p>
                {t("lastAccessed")}:{" "}
                {member.last_accessed_at
                  ? date(member.last_accessed_at)
                  : t("never")}
              </p>
            )}
            <div className="tagList">
              {member.project_ids.map((id) => (
                <Link key={id} to={`/projects/${id}`}>
                  {data.projects.find((project) => project.id === id)?.name}
                </Link>
              ))}
            </div>
            {member.role !== "owner" &&
              (owner || member.role === "employee") && (
                <button
                  className="smallButton"
                  onClick={() => setEditing(member)}
                >
                  {t("edit")}
                </button>
              )}
          </article>
        ))}
      </div>
      {editing && (
        <Editor
          title={editing.id ? "editMember" : "newMember"}
          fields={fields}
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={(body) =>
            mutate(
              editing.id ? `team/${editing.id}` : "team",
              body,
              editing.id ? "PUT" : "POST",
            )
          }
        />
      )}
    </div>
  );
}
export function SettingsPage() {
  const { t } = useLanguage(),
    { data, owner, editor, mutate } = useWorkspace();
  const mobile = useMobile();
  const [form, setForm] = useState(data.business),
    [editing, setEditing] = useState(null),
    [saved, setSaved] = useState(false);
  const action = useAction();
  const fields = [
    { name: "name", required: true },
    { name: "address" },
    {
      name: "default_language",
      type: "select",
      options: [
        { value: "en", label: "English" },
        { value: "es", label: "Español" },
      ],
      required: true,
    },
    { name: "currency", required: true, hint: "currencyHint" },
    { name: "time_zone", required: true },
  ];
  if (!editor && !mobile) return <Navigate to="/" replace />;
  return (
    <div className="pageStack">
      <PageTitle title="settings" />
      <MobileLanguageSettings />
      <ErrorBox error={action.error} />
      {owner && (
        <form
          className="formPanel"
          onSubmit={(event) => {
            event.preventDefault();
            setSaved(false);
            action.run(async () => {
              await mutate("business", form, "PUT");
              setSaved(true);
            });
          }}
        >
          <h2>{t("business")}</h2>
          <Fields fields={fields} form={form} setForm={setForm} />
          {saved && (
            <p className="successBox" role="status">
              {t("saved")}
            </p>
          )}
          <button className="primaryButton" disabled={action.busy}>
            {t(action.busy ? "saving" : "save")}
          </button>
        </form>
      )}
      {editor && (
        <section className="contentSection">
          <div className="sectionHeader">
            <h2>{t("billingAccounts")}</h2>
            <button className="primaryButton" onClick={() => setEditing({})}>
              {t("newAccount")}
            </button>
          </div>
          <p className="fieldHint">{t("billingAccountHint")}</p>
          {!data.billing_accounts.length ? (
            <Empty />
          ) : (
            data.billing_accounts.map((account) => (
              <div className="listRow" key={account.id}>
                <strong>{account.name}</strong>
                <span>{account.masked_identifier}</span>
                <button
                  className="smallButton"
                  onClick={() => setEditing(account)}
                >
                  {t("edit")}
                </button>
              </div>
            ))
          )}
        </section>
      )}
      {editing && (
        <Editor
          title="billingAccount"
          fields={[
            { name: "name", required: true },
            { name: "masked_identifier" },
          ]}
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={(body) =>
            mutate(
              editing.id
                ? `billing-accounts/${editing.id}`
                : "billing-accounts",
              body,
              editing.id ? "PUT" : "POST",
            )
          }
        />
      )}
    </div>
  );
}

function MobileLanguageSettings() {
  const { language, setLanguage, t } = useLanguage();
  const { setUser } = useWorkspace();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(null);
  async function change(next) {
    setBusy(true);
    setError(null);
    try {
      const { user } = await apiRequest("/api/me/language", {
        method: "PUT",
        body: JSON.stringify({ preferred_language: next }),
      });
      setUser(user);
      setLanguage(next);
    } catch (nextError) {
      setError(nextError);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="contentSection mobilePreferences">
      <h2>{t("personalSettings")}</h2>
      <label>
        {t("language")}
        <select
          value={language}
          disabled={busy}
          onChange={(event) => change(event.target.value)}
        >
          <option value="en">English</option>
          <option value="es">Español</option>
        </select>
      </label>
      <ErrorBox error={error} />
    </section>
  );
}
