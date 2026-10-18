import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import { useWorkspace } from "../lib/WorkspaceContext.jsx";
import { TransactionEditor } from "../components/FinancialEditors.jsx";
import {
  Comments,
  Empty,
  ErrorBox,
  PageTitle,
  References,
  Status,
  useAction,
} from "../components/DomainUI.jsx";

export default function TransactionsPage() {
  return (
    <div className="pageStack">
      <PageTitle title="transactions" />
      <TransactionList />
    </div>
  );
}
export function TransactionList({ projectId }) {
  const { t } = useLanguage(),
    { data, editor, money, date, mutate } = useWorkspace(),
    { hash } = useLocation();
  const [creating, setCreating] = useState(false),
    [filterProject, setFilterProject] = useState(""),
    [type, setType] = useState("");
  const action = useAction();
  const projects = data.projects.filter(
    (project) => project.status !== "archived",
  );
  const records = data.transactions
    .filter(
      (tx) =>
        (!projectId || tx.project_id === projectId) &&
        (!filterProject || tx.project_id === filterProject) &&
        (!type || tx.type === type),
    )
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        b.created_at.localeCompare(a.created_at),
    );
  return (
    <section className="contentSection">
      <div className="sectionHeader">
        <h2>{t("transactions")}</h2>
        {editor &&
          (!projectId ||
            projects.some((project) => project.id === projectId)) && (
            <button
              className="primaryButton"
              disabled={!projects.length}
              onClick={() => setCreating(true)}
            >
              {t("newTransaction")}
            </button>
          )}
      </div>
      <p className="fieldHint">{t("transactionHint")}</p>
      <div className="filterBar">
        {!projectId && (
          <label>
            {t("project")}
            <select
              value={filterProject}
              onChange={(event) => setFilterProject(event.target.value)}
            >
              <option value="">{t("allProjects")}</option>
              {data.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          {t("type")}
          <select
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            <option value="">{t("allTypes")}</option>
            {["expense", "income", "refund"].map((value) => (
              <option key={value} value={value}>
                {t(`statuses.${value}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ErrorBox error={action.error} />
      {!records.length ? (
        <Empty />
      ) : (
        <div className="recordList">
          {records.map((tx) => (
            <details
              className="recordCard"
              id={tx.id}
              key={tx.id}
              open={hash === `#${tx.id}` || undefined}
            >
              <summary>
                <div>
                  <strong>{tx.name}</strong>
                  <span>
                    {date(tx.date)} ·{" "}
                    {
                      data.projects.find(
                        (project) => project.id === tx.project_id,
                      )?.name
                    }
                  </span>
                </div>
                <strong
                  className={
                    tx.type === "expense" ? "negative" : "positiveText"
                  }
                >
                  {tx.type === "expense" ? "−" : "+"}
                  {money(tx.amount_cents)}
                </strong>
                <Status value={tx.status === "void" ? "void" : tx.type} />
              </summary>
              <div className="recordBody">
                {tx.invoice_id && (
                  <p>
                    {t("invoice_id")}: {tx.invoice_id}
                  </p>
                )}
                <h3>{t("references")}</h3>
                <References transactionId={tx.id} />
                {editor &&
                  tx.status === "recorded" &&
                  !data.payments.some(
                    (payment) => payment.transaction_id === tx.id,
                  ) && (
                    <button
                      className="smallButton danger"
                      disabled={action.busy}
                      onClick={() => {
                        if (window.confirm(t("voidConfirm")))
                          action.run(() =>
                            mutate(`transactions/${tx.id}/void`),
                          );
                      }}
                    >
                      {t("voidTransaction")}
                    </button>
                  )}
                {!projectId && (
                  <Link to={`/projects/${tx.project_id}`}>
                    {t("viewProject")}
                  </Link>
                )}
                <Comments transactionId={tx.id} />
              </div>
            </details>
          ))}
        </div>
      )}
      {creating && (
        <TransactionEditor
          projectId={projectId}
          onClose={() => setCreating(false)}
        />
      )}
    </section>
  );
}
