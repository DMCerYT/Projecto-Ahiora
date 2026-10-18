import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import { useWorkspace } from "../lib/WorkspaceContext.jsx";
import CalendarPayments from "../components/CalendarPayments.jsx";
import SummaryCard from "../components/SummaryCard.jsx";
import { Empty, PageTitle, Status } from "../components/DomainUI.jsx";
import { buildCalendarEvents } from "../../shared/calendar.js";

export default function Dashboard() {
  const { t } = useLanguage(),
    { data, money, date } = useWorkspace(),
    [projectId, setProjectId] = useState("");
  const events = useMemo(() => buildCalendarEvents(data), [data]);
  const visibleProjects = data.projects.filter(
    (project) => project.status !== "archived",
  );
  const sum = (key) =>
    visibleProjects.reduce((total, project) => total + project[key], 0);
  const reminders = data.occurrences
    .filter((row) =>
      ["overdue", "due_soon", "processing"].includes(row.display_status),
    )
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  return (
    <div className="pageStack">
      <PageTitle title="dashboard" />
      <div className="summaryGrid">
        <SummaryCard
          label={t("availableBalance")}
          value={money(sum("available_cents"))}
          tone="positive"
        />
        <SummaryCard
          label={t("expenses")}
          value={money(sum("expense_cents"))}
          tone="warning"
        />
        <SummaryCard
          label={t("incomeAndRefunds")}
          value={money(sum("income_cents") + sum("refund_cents"))}
          tone="neutral"
        />
        <SummaryCard
          label={t("unpaid30")}
          value={money(sum("unpaid_cents"))}
          tone="warning"
        />
        <SummaryCard
          label={t("projectedBalance")}
          value={money(sum("projected_cents"))}
        />
        <SummaryCard
          label={t("activeProjects")}
          value={String(
            visibleProjects.filter((project) => project.status === "active")
              .length,
          )}
        />
      </div>
      <p className="fieldHint">{t("balanceHint")}</p>
      <section className="contentSection">
        <div className="sectionHeader">
          <h2>{t("reminders")}</h2>
          <Link to="/bills">{t("allBills")}</Link>
        </div>
        <p className="fieldHint">{t("reminderHint")}</p>
        {!reminders.length ? (
          <Empty />
        ) : (
          <div className="recordList">
            {reminders.map((row) => {
              const bill = data.bills.find((item) => item.id === row.bill_id);
              return (
                <Link className="listRow" key={row.id} to={`/bills#${row.id}`}>
                  <div>
                    <strong>{bill.name}</strong>
                    <span>{date(row.due_date)}</span>
                  </div>
                  <strong>{money(row.amount_cents)}</strong>
                  <Status value={row.display_status} />
                </Link>
              );
            })}
          </div>
        )}
      </section>
      <section className="contentSection">
        <div className="sectionHeader">
          <h2>{t("calendar")}</h2>
          <label>
            {t("project")}
            <select
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
            >
              <option value="">{t("allProjects")}</option>
              {data.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="fieldHint">{t("calendarHint")}</p>
        <CalendarPayments
          items={events.filter(
            (event) => !projectId || event.project_id === projectId,
          )}
        />
      </section>
    </div>
  );
}
