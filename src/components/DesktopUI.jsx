import { Link } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import { useWorkspace } from "../lib/WorkspaceContext.jsx";
import { periods } from "../../shared/reporting.js";
import home from "../assets/desktop/home.svg";
import property from "../assets/desktop/property.svg";
import project from "../assets/desktop/project.svg";
import propertyNav from "../assets/desktop/property-nav.svg";
import projectNav from "../assets/desktop/project-nav.svg";
import transactions from "../assets/desktop/transactions.svg";
import contractors from "../assets/desktop/contractors.svg";
import settings from "../assets/desktop/settings.svg";
import add from "../assets/desktop/add.svg";
import edit from "../assets/desktop/edit.svg";

const icons = {
  home,
  property,
  project,
  propertyNav,
  projectNav,
  transactions,
  contractors,
  settings,
  add,
  edit,
};
export function DesktopIcon({ name }) {
  return (
    <span className={`desktopIcon ${name}`} aria-hidden="true">
      <img src={icons[name]} alt="" />
    </span>
  );
}
export function AddButton({ children, ...props }) {
  return (
    <button type="button" className="primaryButton desktopAction" {...props}>
      {children}
      <DesktopIcon name="add" />
    </button>
  );
}
export function PeriodControl() {
  const { t } = useLanguage(),
    { period, setPeriod } = useWorkspace();
  return (
    <label className="periodControl">
      {t("timeframe")}
      <select
        value={period}
        onChange={(event) => setPeriod(event.target.value)}
      >
        {periods.map((value) => (
          <option key={value} value={value}>
            {t(`periods.${value}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
export function EntityRow({ entity, property = false }) {
  const { t } = useLanguage(),
    { totals, money, date } = useWorkspace();
  const total = totals(
    property ? "property_id" : "project_id",
    entity.id,
    entity.budget_cents || 0,
  );
  return (
    <Link
      to={`/${property ? "properties" : "projects"}/${entity.id}`}
      className="entityRow"
    >
      <div className="entityIdentity">
        <DesktopIcon name={property ? "property" : "project"} />
        <div className="entityName">
          <strong>{entity.name}</strong>
          <small>
            {property
              ? `${t("tenant_name")}: ${entity.tenant_name || t("vacant")}`
              : `${date(entity.start_date)}${entity.end_date ? ` — ${date(entity.end_date)}` : ""}`}
          </small>
        </div>
        <div className="entityBalance">
          <small>{t("currentBalance")}</small>
          <strong className={total.available_cents < 0 ? "negative" : ""}>
            {money(total.available_cents)}
          </strong>
        </div>
      </div>
      <div className="entityTotals">
        <div className="negative">
          <small>{t("expenses")}</small>
          <strong>{money(total.expense_cents)}</strong>
        </div>
        <div className="positiveText">
          <small>{t("incomeAndRefunds")}</small>
          <strong>{money(total.income_cents + total.refund_cents)}</strong>
        </div>
      </div>
    </Link>
  );
}
export function BalanceSummary({ target, id, budget = 0 }) {
  const { t } = useLanguage(),
    { totals, money } = useWorkspace();
  const total = totals(target, id, budget),
    lifetime = totals(target, id, budget, true);
  return (
    <section className="balanceOverview" aria-label={t("currentBalance")}>
      <div>
        <span>{t("currentBalance")}</span>
        <strong className={total.available_cents < 0 ? "negative" : ""}>
          {money(total.available_cents)}
        </strong>
      </div>
      <div>
        <span>{t("lifetimeBalance")}</span>
        <strong>{money(lifetime.available_cents)}</strong>
      </div>
      {target === "project_id" && (
        <div>
          <span>{t("budget")}</span>
          <strong>{money(budget)}</strong>
        </div>
      )}
      {[
        ["income", "income_cents"],
        ["refunds", "refund_cents"],
        ["expenses", "expense_cents"],
      ].map(([label, key]) => (
        <div key={key}>
          <span>{t(label)}</span>
          <strong
            className={key === "expense_cents" ? "negative" : "positiveText"}
          >
            {money(total[key])}
          </strong>
        </div>
      ))}
    </section>
  );
}

export function EntityListFilter({ value, onChange }) {
  const { t } = useLanguage();
  return (
    <label className="periodControl">
      {t("show")}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="current">{t("currentItems")}</option>
        <option value="archived">{t("statuses.archived")}</option>
        <option value="all">{t("allItems")}</option>
      </select>
    </label>
  );
}
export function LifecycleNotice({ entity }) {
  const { t } = useLanguage();
  return entity.deleted_at || entity.status === "archived" ? (
    <p className="stateBox">
      {t(entity.deleted_at ? "deletedHistoryHint" : "archivedHistoryHint")}
    </p>
  ) : null;
}
export function entityStatusConfirmation(entity, body, t) {
  if (!entity || entity.status === body.status) return null;
  return {
    title: t("confirmStatusTitle"),
    message: t("confirmStatusMessage", {
      name: entity.name,
      from: t(`statuses.${entity.status}`),
      to: t(`statuses.${body.status}`),
    }),
    confirmLabel: "confirm",
    danger: body.status === "archived",
  };
}
export function entityDeleteConfirmation(entity, t) {
  return {
    title: t("confirmDeleteTitle"),
    message: t("confirmDeleteMessage", { name: entity.name }),
    confirmLabel: "delete",
    danger: true,
  };
}
