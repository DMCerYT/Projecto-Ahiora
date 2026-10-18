import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import { useWorkspace } from "../lib/WorkspaceContext.jsx";
import {
  BillPaymentEditor,
  BillScheduleEditor,
} from "../components/FinancialEditors.jsx";
import { BillImage } from "../components/MobileFinanceUI.jsx";
import {
  Empty,
  ErrorBox,
  PageTitle,
  References,
  Status,
  useAction,
} from "../components/DomainUI.jsx";

export default function BillsPage() {
  const { t } = useLanguage(),
    { data, editor, money, date, mutate, month, setMonth, loading } =
      useWorkspace(),
    { hash } = useLocation();
  const [creating, setCreating] = useState(false),
    [paying, setPaying] = useState(null),
    [filter, setFilter] = useState("open");
  const action = useAction();
  const projects = data.projects
    .filter((project) => project.status !== "archived")
    .map((project) => ({ value: project.id, label: project.name }));
  const accounts = data.billing_accounts.map((account) => ({
    value: account.id,
    label: `${account.name} ${account.masked_identifier}`,
  }));
  const occurrences = data.occurrences
    .filter(
      (row) =>
        hash === `#${row.id}` ||
        (filter === "open"
          ? ["unpaid", "processing"].includes(row.status) &&
            row.due_date.slice(0, 7) <= month
          : row.due_date.startsWith(month)),
    )
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  return (
    <div className="pageStack">
      <PageTitle title="bills">
        {editor && (
          <button
            className="primaryButton"
            disabled={!projects.length}
            onClick={() => setCreating(true)}
          >
            {t("newBill")}
          </button>
        )}
      </PageTitle>
      <ErrorBox error={action.error} />
      <section className="contentSection">
        <div className="sectionHeader">
          <h2>{t("dueDates")}</h2>
          <div className="filterBar">
            <label>
              {t("month")}
              <input
                type="month"
                value={month}
                min="1970-01"
                max="2100-12"
                onChange={(event) => {
                  if (event.target.value) setMonth(event.target.value);
                }}
              />
            </label>
            <label>
              {t("show")}
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              >
                <option value="open">{t("openBills")}</option>
                <option value="month">{t("allInMonth")}</option>
              </select>
            </label>
          </div>
        </div>
        <p className="fieldHint">{t("paymentHint")}</p>
        {loading ? (
          <p className="stateBox">{t("loading")}</p>
        ) : !occurrences.length ? (
          <Empty />
        ) : (
          <div className="recordList">
            {occurrences.map((row) => {
              const bill = data.bills.find((item) => item.id === row.bill_id),
                payment = data.payments.find(
                  (item) => item.occurrence_id === row.id,
                );
              return (
                <details
                  id={row.id}
                  key={row.id}
                  className="recordCard"
                  open={hash === `#${row.id}` || undefined}
                >
                  <summary>
                    <div>
                      <strong className="mobileBillRecordTitle">
                        <BillImage
                          bill={bill}
                          className="mobileBillRecordImage"
                        />
                        {bill.name}
                      </strong>
                      <span>
                        {date(row.due_date)} ·{" "}
                        {
                          data.projects.find(
                            (project) => project.id === bill.project_id,
                          )?.name
                        }
                      </span>
                    </div>
                    <strong>{money(row.amount_cents)}</strong>
                    <Status value={row.display_status} />
                  </summary>
                  <div className="recordBody">
                    {bill.payee_account_number && (
                      <p>
                        {t("payee_account_number")}: {bill.payee_account_number}
                      </p>
                    )}
                    {payment && (
                      <div className="listRow">
                        <span>
                          {t("payment")}: {date(payment.payment_date)}
                        </span>
                        <Status value={payment.status} />
                        <span>
                          {
                            data.billing_accounts.find(
                              (account) =>
                                account.id === payment.billing_account_id,
                            )?.name
                          }
                        </span>
                      </div>
                    )}
                    <References occurrenceId={row.id} />
                    {editor && row.status === "unpaid" && !payment && (
                      <button
                        className="primaryButton"
                        disabled={action.busy || !accounts.length}
                        onClick={() => setPaying({ row, bill })}
                      >
                        {t("recordPayment")}
                      </button>
                    )}
                    {editor && !accounts.length && row.status === "unpaid" && (
                      <p className="fieldHint">{t("accountRequiredHint")}</p>
                    )}
                    {editor && payment && payment.status !== "processed" && (
                      <div className="buttonRow">
                        <button
                          className="primaryButton"
                          disabled={action.busy}
                          onClick={() => {
                            if (window.confirm(t("processConfirm")))
                              action.run(() =>
                                mutate(
                                  `payments/${payment.id}`,
                                  { status: "processed" },
                                  "PUT",
                                ),
                              );
                          }}
                        >
                          {t("markProcessed")}
                        </button>
                        {payment.status === "processing" ? (
                          <button
                            className="smallButton danger"
                            disabled={action.busy}
                            onClick={() =>
                              action.run(() =>
                                mutate(
                                  `payments/${payment.id}`,
                                  { status: "failed" },
                                  "PUT",
                                ),
                              )
                            }
                          >
                            {t("markFailed")}
                          </button>
                        ) : (
                          <button
                            className="smallButton"
                            disabled={action.busy}
                            onClick={() =>
                              action.run(() =>
                                mutate(
                                  `payments/${payment.id}`,
                                  { status: "processing" },
                                  "PUT",
                                ),
                              )
                            }
                          >
                            {t("retryPayment")}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </section>
      <section className="contentSection">
        <h2>{t("billSchedules")}</h2>
        <p className="fieldHint">{t("scheduleHint")}</p>
        {!data.bills.length ? (
          <Empty />
        ) : (
          <div className="recordList">
            {data.bills.map((bill) => (
              <article key={bill.id} className="listRow">
                <div>
                  <strong className="mobileBillRecordTitle">
                    <BillImage bill={bill} className="mobileBillRecordImage" />
                    {bill.name}
                  </strong>
                  <span>
                    {t(`statuses.${bill.recurrence}`)}
                    {bill.recurrence === "monthly"
                      ? ` · ${t("recurrence_day")}: ${bill.recurrence_day}`
                      : bill.recurrence === "interval_days"
                        ? ` · ${bill.interval_days} ${t("days")}`
                        : ""}
                  </span>
                </div>
                <strong>{money(bill.amount_cents)}</strong>
                <Status value={bill.active ? "active" : "paused"} />
                {editor && Boolean(bill.active) && (
                  <button
                    className="smallButton"
                    disabled={action.busy}
                    onClick={() => {
                      if (window.confirm(t("pauseConfirm")))
                        action.run(() => mutate(`bills/${bill.id}/pause`));
                    }}
                  >
                    {t("pause")}
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
      {creating && <BillScheduleEditor onClose={() => setCreating(false)} />}
      {paying && (
        <BillPaymentEditor
          row={paying.row}
          bill={paying.bill}
          onClose={() => setPaying(null)}
        />
      )}
    </div>
  );
}
