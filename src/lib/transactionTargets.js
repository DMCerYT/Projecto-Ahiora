import { isPropertyIncome } from "../../shared/evidence.js";
export function targetOptions(data, t, targetType) {
  return [
    ...(targetType === "property"
      ? []
      : data.projects
          .filter((item) => item.status !== "archived")
          .map((item) => ({
            value: `project:${item.id}`,
            label: `${t("project")}: ${item.name}`,
          }))),
    ...(targetType === "project"
      ? []
      : (data.properties || []).map((item) => ({
          value: `property:${item.id}`,
          label: `${t("property")}: ${item.name}`,
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
