import { isPropertyIncome } from "../../shared/evidence.js";
export function targetOptions(data, t, targetType, includeHistory = false) {
  return [
    ...(targetType === "property"
      ? []
      : data.projects
          .filter(
            (item) =>
              includeHistory ||
              (!item.deleted_at && item.status !== "archived"),
          )
          .map((item) => ({
            value: `project:${item.id}`,
            label: `${t("project")}: ${item.name}${includeHistory && (item.deleted_at || item.status === "archived") ? ` (${t(item.deleted_at ? "deleted" : "statuses.archived")})` : ""}`,
          }))),
    ...(targetType === "project"
      ? []
      : (data.properties || [])
          .filter(
            (item) =>
              includeHistory ||
              (!item.deleted_at && item.status !== "archived"),
          )
          .map((item) => ({
            value: `property:${item.id}`,
            label: `${t("property")}: ${item.name}${includeHistory && (item.deleted_at || item.status === "archived") ? ` (${t(item.deleted_at ? "deleted" : "statuses.archived")})` : ""}`,
          }))),
  ];
}
export function transactionTarget(body) {
  const { destination, ...rest } = body;
  const [kind, id] = (destination || "").split(":");
  return {
    ...rest,
    ...(kind === "property" ? { property_id: id } : { project_id: id }),
  };
}

export function isPropertyIncomeDraft(form) {
  return isPropertyIncome(transactionTarget(form));
}
