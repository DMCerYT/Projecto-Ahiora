import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import { useWorkspace } from "../lib/WorkspaceContext.jsx";
import {
  Comments,
  Editor,
  Empty,
  PageTitle,
  Status,
} from "../components/DomainUI.jsx";
import SummaryCard from "../components/SummaryCard.jsx";
import { TransactionList } from "./TransactionsPage.jsx";

const projectFields = [
  { name: "name", required: true },
  { name: "start_date", type: "date", required: true },
  { name: "end_date", type: "date" },
  { name: "budget", type: "number", min: 0, required: true },
  {
    name: "status",
    type: "select",
    options: ["active", "completed", "archived"],
    required: true,
  },
];
export function ProjectEditor({ project, onClose }) {
  const { data, mutate } = useWorkspace();
  return (
    <Editor
      title={project ? "editProject" : "newProject"}
      initial={
        project
          ? { ...project, budget: (project.budget_cents / 100).toFixed(2) }
          : { start_date: data.today, status: "active" }
      }
      fields={projectFields}
      onClose={onClose}
      onSave={(body) =>
        mutate(
          project ? `projects/${project.id}` : "projects",
          body,
          project ? "PUT" : "POST",
        )
      }
    />
  );
}
export function ProjectsPage() {
  const { t } = useLanguage(),
    { data, editor, money, date } = useWorkspace();
  const [editing, setEditing] = useState(null);
  return (
    <div className="pageStack">
      <PageTitle title="projects">
        {editor && (
          <button className="primaryButton" onClick={() => setEditing({})}>
            {t("newProject")}
          </button>
        )}
      </PageTitle>
      {!data.projects.length ? (
        <Empty />
      ) : (
        <div className="projectGrid">
          {data.projects.map((project) => (
            <article key={project.id} className="contentSection projectCard">
              <div className="sectionHeader">
                <h2>
                  <Link to={`/projects/${project.id}`}>{project.name}</Link>
                </h2>
                <Status value={project.status} />
              </div>
              <p>
                {date(project.start_date)}
                {project.end_date && ` — ${date(project.end_date)}`}
              </p>
              <dl>
                <div>
                  <dt>{t("budget")}</dt>
                  <dd>{money(project.budget_cents)}</dd>
                </div>
                <div>
                  <dt>{t("availableBalance")}</dt>
                  <dd className={project.available_cents < 0 ? "negative" : ""}>
                    {money(project.available_cents)}
                  </dd>
                </div>
                <div>
                  <dt>{t("projectedBalance")}</dt>
                  <dd>{money(project.projected_cents)}</dd>
                </div>
              </dl>
              {editor && (
                <button
                  className="smallButton"
                  onClick={() => setEditing(project)}
                >
                  {t("edit")}
                </button>
              )}
            </article>
          ))}
        </div>
      )}
      {editing && (
        <ProjectEditor
          project={editing.id ? editing : null}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
export function ProjectDetails() {
  const { id } = useParams(),
    { t } = useLanguage(),
    { data, editor, money, date } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const project = data.projects.find((item) => item.id === id);
  if (!project) return <Empty />;
  const contractors = data.contractors.filter((contractor) =>
    contractor.project_ids.includes(id),
  );
  return (
    <div className="pageStack">
      <Link to="/projects">← {t("projects")}</Link>
      <header className="pageHeader">
        <div>
          <h1>{project.name}</h1>
          <p>
            {date(project.start_date)}
            {project.end_date && ` — ${date(project.end_date)}`}
          </p>
          <Status value={project.status} />
        </div>
        {editor && (
          <button className="smallButton" onClick={() => setEditing(true)}>
            {t("editProject")}
          </button>
        )}
      </header>
      <div className="summaryGrid">
        {[
          ["budget", "budget_cents"],
          ["availableBalance", "available_cents"],
          ["expenses", "expense_cents"],
          ["income", "income_cents"],
          ["refunds", "refund_cents"],
          ["projectedBalance", "projected_cents"],
        ].map(([label, key]) => (
          <SummaryCard
            key={key}
            label={t(label)}
            value={money(project[key])}
            tone={project[key] < 0 ? "danger" : "neutral"}
          />
        ))}
      </div>
      <p className="fieldHint">{t("balanceHint")}</p>
      <section className="contentSection">
        <h2>{t("contractors")}</h2>
        {!contractors.length ? (
          <Empty />
        ) : (
          <div className="recordList">
            {contractors.map((contractor) => (
              <div className="listRow" key={contractor.id}>
                <strong>{contractor.name}</strong>
                <span>{contractor.email}</span>
                <span>{contractor.phone}</span>
                <span>{contractor.address}</span>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="contentSection">
        <h2>{t("bills")}</h2>
        {data.bills
          .filter((bill) => bill.project_id === id)
          .map((bill) => (
            <div className="listRow" key={bill.id}>
              <Link to="/bills">{bill.name}</Link>
              <span>
                {money(bill.amount_cents)} · {t(`statuses.${bill.recurrence}`)}
              </span>
              <Status value={bill.active ? "active" : "paused"} />
            </div>
          ))}
      </section>
      <TransactionList projectId={id} />
      <Comments projectId={id} />
      {editing && (
        <ProjectEditor project={project} onClose={() => setEditing(false)} />
      )}
    </div>
  );
}
