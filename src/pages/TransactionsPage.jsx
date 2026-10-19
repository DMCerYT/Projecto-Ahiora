import { useEffect, useRef, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import { useWorkspace } from "../lib/WorkspaceContext.jsx";
import { TransactionEditor } from "../components/FinancialEditors.jsx";
import { AddButton, PeriodControl } from "../components/DesktopUI.jsx";
import { targetOptions } from "../lib/transactionTargets.js";
import {
  Comments,
  Empty,
  ErrorBox,
  PageTitle,
  References,
  Status,
  useAction,
} from "../components/DomainUI.jsx";
import { isPropertyIncome } from "../../shared/evidence.js";
import BillsPage from "./BillsPage.jsx";

export default function TransactionsPage() {
  const { t } = useLanguage();
  const [params, setParams] = useSearchParams();
  const bills = params.get("tab") === "bills";
  return (
    <div className="pageStack">
      <PageTitle title="transactions" />
      <div className="sectionTabs" aria-label={t("transactions")}>
        <button aria-pressed={!bills} onClick={() => setParams({})}>
          {t("transactions")}
        </button>
        <button
          aria-pressed={bills}
          onClick={() => setParams({ tab: "bills" })}
        >
          {t("bills")}
        </button>
      </div>
      {bills ? (
        <BillsPage embedded />
      ) : (
        <>
          <PeriodControl />
          <TransactionList />
        </>
      )}
    </div>
  );
}

export function TransactionDetails({ transaction: tx, onClose }) {
  const { t } = useLanguage(),
    { data, editor, money, date, mutate } = useWorkspace();
  const action = useAction(),
    dialog = useRef(null);
  const project = data.projects.find((item) => item.id === tx.project_id),
    property = data.properties.find((item) => item.id === tx.property_id),
    bill = data.bills.find((item) => item.id === tx.bill_id);
  useEffect(() => {
    const previousFocus = document.activeElement;
    dialog.current.showModal();
    return () => previousFocus?.focus({ preventScroll: true });
  }, []);
  return (
    <dialog
      ref={dialog}
      className="transactionDialog"
      aria-labelledby="transaction-detail-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="sectionHeader">
        <h2 id="transaction-detail-title">{tx.name}</h2>
        <button className="smallButton" onClick={onClose} autoFocus>
          {t("close")}
        </button>
      </div>
      <div className="transactionDetailSummary">
        <Status value={tx.status === "void" ? "void" : tx.type} />
        <strong className={tx.type === "expense" ? "negative" : "positiveText"}>
          {money(tx.amount_cents)}
        </strong>
        <span>
          {t("date")}: {date(tx.date)}
        </span>
        {project && (
          <Link to={`/projects/${project.id}`} onClick={onClose}>
            {project.name}
          </Link>
        )}
        {property && (
          <Link to={`/properties/${property.id}`} onClick={onClose}>
            {property.name}
          </Link>
        )}
        {bill && (
          <span>
            {t("bills")}: {bill.name}
          </span>
        )}
        {tx.invoice_id && (
          <span>
            {t("invoice_id")}: {tx.invoice_id}
          </span>
        )}
      </div>
      <h3>{t("references")}</h3>
      <References transactionId={tx.id} />
      <ErrorBox error={action.error} />
      {editor &&
        tx.status === "recorded" &&
        !tx.bill_id &&
        project?.status !== "archived" && (
          <button
            className="smallButton danger"
            disabled={action.busy}
            onClick={() => {
              if (window.confirm(t("voidConfirm")))
                action.run(() => mutate(`transactions/${tx.id}/void`));
            }}
          >
            {t("voidTransaction")}
          </button>
        )}
      <Comments transactionId={tx.id} />
    </dialog>
  );
}

export function TransactionList({ projectId, propertyId, columns = false }) {
  const { t } = useLanguage(),
    { data, editor, money, date, inPeriod, totals } = useWorkspace(),
    { hash } = useLocation(),
    navigate = useNavigate();
  const [creating, setCreating] = useState(false),
    [destination, setDestination] = useState(""),
    [type, setType] = useState(""),
    [selected, setSelected] = useState(null);
  useEffect(() => {
    if (data.transactions.some((tx) => `#${tx.id}` === hash))
      setSelected(hash.slice(1));
  }, [hash, data.transactions]);
  const targets = targetOptions(data, t);
  const records = data.transactions
    .filter(
      (tx) =>
        (!projectId || tx.project_id === projectId) &&
        (!propertyId || tx.property_id === propertyId) &&
        (!destination ||
          (destination.startsWith("project:")
            ? tx.project_id === destination.slice(8)
            : destination.startsWith("property:")
              ? tx.property_id === destination.slice(9)
              : Boolean(tx.bill_id))) &&
        (!type || tx.type === type) &&
        (inPeriod(tx) || hash === `#${tx.id}`),
    )
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        b.created_at.localeCompare(a.created_at),
    );
  const selectedTransaction = data.transactions.find(
    (tx) => tx.id === selected,
  );
  const canCreate =
    editor &&
    (projectId
      ? data.projects.some(
          (item) => item.id === projectId && item.status !== "archived",
        )
      : propertyId
        ? true
        : targets.length > 0);
  const card = (tx) => {
    const reference = data.references.find(
      (item) => item.id === tx.primary_reference_id,
    );
    const destinationName =
      data.projects.find((item) => item.id === tx.project_id)?.name ||
      data.properties.find((item) => item.id === tx.property_id)?.name ||
      t("bills");
    return (
      <button
        type="button"
        className={`transactionCard ${tx.type} ${tx.status}`}
        key={tx.id}
        onClick={() => setSelected(tx.id)}
      >
        <span className="transactionCardName">
          {t(`statuses.${tx.type}`)}: {tx.name}
        </span>
        {(reference?.reference_number || !isPropertyIncome(tx)) && (
          <span>
            {t("reference_number")}: {reference?.reference_number || "—"}
          </span>
        )}
        <span className="transactionCardMeta">
          {date(tx.date)}
          {!projectId && !propertyId && ` · ${destinationName}`}
          {tx.status === "void" && ` · ${t("statuses.void")}`}
        </span>
        <strong>{money(tx.amount_cents)}</strong>
      </button>
    );
  };
  const target = propertyId ? "property_id" : "project_id",
    id = propertyId || projectId;
  const total = id ? totals(target, id) : null;
  return (
    <section className="transactionSection">
      <div className="sectionHeader">
        <h2>{t("transactions")}</h2>
        {canCreate && (
          <AddButton onClick={() => setCreating(true)}>
            {t("newTransaction")}
          </AddButton>
        )}
      </div>
      <div className="filterBar">
        {!id && (
          <label>
            {t("destination")}
            <select
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
            >
              <option value="">{t("allDestinations")}</option>
              {targets.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
              <option value="bills">{t("bills")}</option>
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
      {!records.length ? (
        <Empty />
      ) : columns ? (
        <div className="transactionColumns">
          {[
            ["expenses", "expense"],
            ["incomeAndRefunds", "credits"],
          ].map(([label, kind]) => (
            <section key={kind}>
              <div className="sectionHeader">
                <h2>{t(label)}</h2>
                {total && (
                  <strong
                    className={kind === "expense" ? "negative" : "positiveText"}
                  >
                    {money(
                      kind === "expense"
                        ? total.expense_cents
                        : total.income_cents + total.refund_cents,
                    )}
                  </strong>
                )}
              </div>
              <div className="transactionCards">
                {records
                  .filter((tx) =>
                    kind === "expense"
                      ? tx.type === "expense"
                      : tx.type !== "expense",
                  )
                  .map(card)}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="transactionCards">{records.map(card)}</div>
      )}
      {creating && (
        <TransactionEditor
          projectId={projectId}
          propertyId={propertyId}
          onClose={() => setCreating(false)}
        />
      )}
      {selectedTransaction && (
        <TransactionDetails
          key={selectedTransaction.id}
          transaction={selectedTransaction}
          onClose={() => {
            setSelected(null);
            if (hash) navigate({ hash: "" }, { replace: true });
          }}
        />
      )}
    </section>
  );
}
