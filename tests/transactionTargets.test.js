import test from "node:test";
import assert from "node:assert/strict";
import { targetOptions } from "../src/lib/transactionTargets.js";

const data = {
  projects: [
    { id: "active-project", name: "Build", status: "active" },
    { id: "complete", name: "Finished", status: "completed" },
    { id: "archive-project", name: "Archive", status: "archived" },
    {
      id: "delete-project",
      name: "Deleted",
      status: "active",
      deleted_at: "2026-10-18",
    },
  ],
  properties: [
    { id: "active-property", name: "Rental", status: "active" },
    { id: "archive-property", name: "Archived rental", status: "archived" },
    {
      id: "delete-property",
      name: "Deleted rental",
      status: "active",
      deleted_at: "2026-10-18",
    },
  ],
};
const t = (key) => key;
test("new transaction pickers exclude archived and deleted properties and projects", () => {
  assert.deepEqual(
    targetOptions(data, t).map((item) => item.value),
    ["project:active-project", "project:complete", "property:active-property"],
  );
  assert.deepEqual(
    targetOptions(data, t, "property").map((item) => item.value),
    ["property:active-property"],
  );
  assert.deepEqual(
    targetOptions(data, t, "project").map((item) => item.value),
    ["project:active-project", "project:complete"],
  );
});
test("historical transaction filters retain archived and deleted destinations with labels", () => {
  const options = targetOptions(data, t, undefined, true);
  assert.equal(options.length, 7);
  assert.match(
    options.find((item) => item.value === "property:archive-property").label,
    /statuses.archived/,
  );
  assert.match(
    options.find((item) => item.value === "project:delete-project").label,
    /deleted/,
  );
});
