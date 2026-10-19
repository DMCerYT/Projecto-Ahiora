import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import { useWorkspace } from "../lib/WorkspaceContext.jsx";
import {
  Comments,
  Editor,
  Empty,
  PageTitle,
  Status,
} from "../components/DomainUI.jsx";
import {
  AddButton,
  BalanceSummary,
  DesktopIcon,
  EntityRow,
  PeriodControl,
  EntityListFilter,
  LifecycleNotice,
  entityStatusConfirmation,
  entityDeleteConfirmation,
} from "../components/DesktopUI.jsx";
import { TransactionEditor } from "../components/FinancialEditors.jsx";
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
  const { t } = useLanguage();
  const navigate = useNavigate();
  return (
    <Editor
      title={project ? "editProject" : "newProject"}
      initial={
        project
          ? { ...project, budget: (project.budget_cents / 100).toFixed(2) }
          : { start_date: data.today, status: "active", budget: "0" }
      }
      fields={projectFields.map((field) =>
        field.name === "status" && !project
          ? { ...field, options: ["active", "completed"] }
          : field,
      )}
      confirmSave={(body) => entityStatusConfirmation(project, body, t)}
      deleteConfirmation={
        project ? entityDeleteConfirmation(project, t) : undefined
      }
      onDelete={
        project
          ? async () => {
              await mutate(`projects/${project.id}`, {}, "DELETE");
              navigate("/projects");
            }
          : undefined
      }
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
    { data, editor } = useWorkspace();
  const [editing, setEditing] = useState(null),
    [creating, setCreating] = useState(false),
    [visibility, setVisibility] = useState("current");
  const records = data.projects.filter(
    (item) =>
      !item.deleted_at &&
      (visibility === "all" ||
        (visibility === "archived"
          ? item.status === "archived"
          : item.status !== "archived")),
  );
  return (
    <div className="pageStack">
      <PageTitle title="projects">
        {editor && (
          <div className="buttonRow">
            <AddButton
              disabled={
                !data.projects.some(
                  (item) => !item.deleted_at && item.status !== "archived",
                )
              }
              onClick={() => setCreating(true)}
            >
              {t("newTransaction")}
            </AddButton>
            <AddButton onClick={() => setEditing({})}>
              {t("newProject")}
            </AddButton>
          </div>
        )}
      </PageTitle>
      <div className="filterBar">
        <PeriodControl />
        <EntityListFilter value={visibility} onChange={setVisibility} />
      </div>
      {!records.length ? (
        <Empty />
      ) : (
        <div className="entityList">
          {records.map((project) => (
            <div key={project.id}>
              <EntityRow entity={project} />
              <div className="entityStatus">
                <Status value={project.status} />
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && (
        <ProjectEditor
          project={editing.id ? editing : null}
          onClose={() => setEditing(null)}
        />
      )}
      {creating && (
        <TransactionEditor
          targetType="project"
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}
export function ProjectDetails() {
  const { id } = useParams(),
    { t } = useLanguage(),
    { data, editor, date } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const project = data.projects.find((item) => item.id === id);
  if (!project) return <Empty />;
  const contractors = data.contractors.filter((item) =>
    item.project_ids.includes(id),
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
        {editor && !project.deleted_at && (
          <button
            className="primaryButton desktopAction"
            onClick={() => setEditing(true)}
          >
            {t("editProject")}
            <DesktopIcon name="edit" />
          </button>
        )}
      </header>
      <LifecycleNotice entity={project} />
      <PeriodControl />
      <BalanceSummary
        target="project_id"
        id={id}
        budget={project.budget_cents}
      />
      <p className="fieldHint">{t("projectBalanceHint")}</p>
      <TransactionList projectId={id} columns />
      <section className="contentSection">
        <h2>{t("contractors")}</h2>
        {!contractors.length ? (
          <Empty />
        ) : (
          <div className="recordList">
            {contractors.map((item) => (
              <div className="listRow" key={item.id}>
                <strong>{item.name}</strong>
                <span>{item.email}</span>
                <span>{item.phone}</span>
              </div>
            ))}
          </div>
        )}
      </section>
      <Comments projectId={id} />
      {editing && (
        <ProjectEditor project={project} onClose={() => setEditing(false)} />
      )}
    </div>
  );
}
