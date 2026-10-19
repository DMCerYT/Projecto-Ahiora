import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import { useWorkspace } from "../lib/WorkspaceContext.jsx";
import { Editor, Empty, PageTitle, Status } from "../components/DomainUI.jsx";
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

export function PropertyEditor({ property, onClose }) {
  const { mutate } = useWorkspace();
  const { t } = useLanguage();
  const navigate = useNavigate();
  return (
    <Editor
      title={property ? "editProperty" : "newProperty"}
      initial={
        property
          ? {
              ...property,
              monthly_rent: (property.monthly_rent_cents / 100).toFixed(2),
            }
          : { monthly_rent: "0", status: "active" }
      }
      fields={[
        { name: "name", required: true, maxLength: 160 },
        { name: "address", required: true },
        { name: "tenant_name", maxLength: 160 },
        { name: "monthly_rent", type: "number", min: 0, hint: "rentHint" },
        ...(property
          ? [
              {
                name: "status",
                type: "select",
                options: ["active", "archived"],
                required: true,
              },
            ]
          : []),
      ]}
      confirmSave={(body) => entityStatusConfirmation(property, body, t)}
      deleteConfirmation={
        property ? entityDeleteConfirmation(property, t) : undefined
      }
      onDelete={
        property
          ? async () => {
              await mutate(`properties/${property.id}`, {}, "DELETE");
              navigate("/properties");
            }
          : undefined
      }
      onClose={onClose}
      onSave={(body) =>
        mutate(
          property ? `properties/${property.id}` : "properties",
          body,
          property ? "PUT" : "POST",
        )
      }
    />
  );
}
export function PropertiesPage() {
  const { t } = useLanguage(),
    { data, editor } = useWorkspace();
  const [creating, setCreating] = useState(false),
    [transaction, setTransaction] = useState(false),
    [visibility, setVisibility] = useState("current");
  const records = data.properties.filter(
    (item) =>
      !item.deleted_at &&
      (visibility === "all" ||
        (visibility === "archived"
          ? item.status === "archived"
          : item.status !== "archived")),
  );
  return (
    <div className="pageStack">
      <PageTitle title="propertyList">
        {editor && (
          <div className="buttonRow">
            <AddButton
              disabled={
                !data.properties.some(
                  (item) => !item.deleted_at && item.status !== "archived",
                )
              }
              onClick={() => setTransaction(true)}
            >
              {t("newTransaction")}
            </AddButton>
            <AddButton onClick={() => setCreating(true)}>
              {t("newProperty")}
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
          {records.map((property) => (
            <div key={property.id}>
              <EntityRow entity={property} property />
              <div className="entityStatus">
                <Status value={property.status} />
              </div>
            </div>
          ))}
        </div>
      )}
      {creating && <PropertyEditor onClose={() => setCreating(false)} />}
      {transaction && (
        <TransactionEditor
          targetType="property"
          onClose={() => setTransaction(false)}
        />
      )}
    </div>
  );
}
export function PropertyDetails() {
  const { id } = useParams(),
    { t } = useLanguage(),
    { data, editor, money } = useWorkspace();
  const property = data.properties.find((item) => item.id === id);
  const [editing, setEditing] = useState(false),
    [creating, setCreating] = useState(false);
  if (!property) return <Empty />;
  return (
    <div className="pageStack">
      <Link to="/properties">← {t("properties")}</Link>
      <header className="pageHeader">
        <h1>{property.name}</h1>
        {editor && !property.deleted_at && (
          <div className="buttonRow">
            <button
              className="primaryButton desktopAction"
              onClick={() => setEditing(true)}
            >
              {t("edit")}
              <DesktopIcon name="edit" />
            </button>
            {property.status !== "archived" && (
              <AddButton onClick={() => setCreating(true)}>
                {t("newTransaction")}
              </AddButton>
            )}
          </div>
        )}
      </header>
      <LifecycleNotice entity={property} />
      <Status value={property.status} />
      <section className="propertyInfo">
        <p>
          {t("address")}: {property.address}
        </p>
        <p>
          {t("tenant_name")}: {property.tenant_name || t("vacant")}
        </p>
        <p>
          {t("monthly_rent")}: {money(property.monthly_rent_cents)}
        </p>
      </section>
      <PeriodControl />
      <BalanceSummary target="property_id" id={id} />
      <p className="fieldHint">{t("propertyBalanceHint")}</p>
      <TransactionList propertyId={id} columns />
      {editing && (
        <PropertyEditor property={property} onClose={() => setEditing(false)} />
      )}
      {creating && (
        <TransactionEditor propertyId={id} onClose={() => setCreating(false)} />
      )}
    </div>
  );
}
