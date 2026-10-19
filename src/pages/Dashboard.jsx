import { useState } from "react";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import { useWorkspace } from "../lib/WorkspaceContext.jsx";
import CalendarPayments from "../components/CalendarPayments.jsx";
import { Empty, PageTitle } from "../components/DomainUI.jsx";
import {
  AddButton,
  EntityRow,
  PeriodControl,
} from "../components/DesktopUI.jsx";
import { TransactionEditor } from "../components/FinancialEditors.jsx";
import { buildCalendarEvents } from "../../shared/calendar.js";

export default function Dashboard() {
  const { t } = useLanguage(),
    { data, editor } = useWorkspace();
  const [creating, setCreating] = useState(null);
  const projects = data.projects.filter(
    (item) => !item.deleted_at && item.status === "active",
  );
  const properties = data.properties.filter(
    (item) => !item.deleted_at && item.status !== "archived",
  );
  const events = buildCalendarEvents(data);
  return (
    <div className="pageStack">
      <PageTitle title="mainDashboard" />
      <PeriodControl />
      {editor && (
        <section className="dashboardSection">
          <div className="sectionHeader">
            <h2>{t("propertyList")}</h2>
            <AddButton
              disabled={!properties.length}
              onClick={() => setCreating("property")}
            >
              {t("newTransaction")}
            </AddButton>
          </div>
          <details className="dashboardGroup" open>
            <summary>
              {t("properties")} ({properties.length})
            </summary>
            {properties.length ? (
              <div className="entityList">
                {properties.map((property) => (
                  <EntityRow key={property.id} entity={property} property />
                ))}
              </div>
            ) : (
              <Empty />
            )}
          </details>
        </section>
      )}
      <section className="dashboardSection">
        <div className="sectionHeader">
          <h2>{t("currentProjects")}</h2>
          {editor && (
            <AddButton
              disabled={!projects.length}
              onClick={() => setCreating("project")}
            >
              {t("newTransaction")}
            </AddButton>
          )}
        </div>
        <details className="dashboardGroup" open>
          <summary>
            {t("projects")} ({projects.length})
          </summary>
          {projects.length ? (
            <div className="entityList">
              {projects.map((project) => (
                <EntityRow key={project.id} entity={project} />
              ))}
            </div>
          ) : (
            <Empty />
          )}
        </details>
      </section>
      <section className="contentSection">
        <h2>{t("calendar")}</h2>
        <p className="fieldHint">{t("calendarHint")}</p>
        <CalendarPayments items={events} />
      </section>
      {creating && (
        <TransactionEditor
          targetType={creating}
          onClose={() => setCreating(null)}
        />
      )}
    </div>
  );
}
