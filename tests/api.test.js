import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { openDatabase } from "../server/db.js";
import { seedDemo } from "../server/demo.js";
import { createApp } from "../server/app.js";

let db, server, base, temp, demo;
const cookies = {};
before(async () => {
  temp = mkdtempSync(join(tmpdir(), "ahiora-api-"));
  db = openDatabase(":memory:");
  demo = seedDemo(db, { today: "2026-10-18", uploadDir: temp });
  server = createApp({
    db,
    uploadDir: temp,
    now: () => new Date("2026-10-18T16:00:00Z"),
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  base = `http://127.0.0.1:${server.address().port}`;
  for (const role of ["owner", "admin", "employee"]) {
    const response = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `${role}@demo.local`,
        password: "DemoPass123!",
      }),
    });
    assert.equal(response.status, 200);
    cookies[role] = response.headers.get("set-cookie").split(";")[0];
  }
});
after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  if (db) db.close();
  if (temp) rmSync(temp, { recursive: true, force: true });
});
const request = (
  path,
  { role = "owner", method = "GET", body, headers = {} } = {},
) =>
  fetch(`${base}${path}`, {
    method,
    headers: {
      Cookie: cookies[role] || "",
      "Content-Type": "application/json",
      ...headers,
    },
    ...(body !== undefined
      ? { body: typeof body === "string" ? body : JSON.stringify(body) }
      : {}),
  });

test("unauthenticated requests are rejected and passwords never leave the server", async () => {
  assert.equal((await request("/api/workspace", { role: "none" })).status, 401);
  const response = await request("/api/session");
  const { user } = await response.json();
  assert.equal(user.role, "owner");
  assert.equal(user.password_hash, undefined);
  assert.equal(
    (await request("/api/session", { role: "none" }).then((res) => res.json()))
      .user,
    null,
  );
});
test("admin access timestamps are tracked and exposed to the owner", async () => {
  await request("/api/workspace", { role: "admin" });
  const { data } = await request("/api/workspace").then((res) => res.json());
  assert.ok(
    data.team.find((member) => member.role === "admin").last_accessed_at,
  );
  assert.equal(
    data.team.find((member) => member.role === "employee").last_accessed_at,
    null,
  );
  assert.ok(data.team.every((member) => !("password_hash" in member)));
});
test("employee finance mutations are denied while assigned project comments are accepted", async () => {
  const response = await request("/api/transactions", {
    role: "employee",
    method: "POST",
    body: {},
  });
  assert.equal(response.status, 403);
  assert.equal(
    (
      await request("/api/comments", {
        role: "employee",
        method: "POST",
        body: { project_id: demo.project.id, text: "API comment" },
      })
    ).status,
    201,
  );
  const { data } = await request("/api/workspace", { role: "employee" }).then(
    (res) => res.json(),
  );
  assert.deepEqual(
    data.projects.map((project) => project.id),
    [demo.project.id],
  );
});
test("missing references are rejected through the HTTP API", async () => {
  const response = await request("/api/transactions", {
    method: "POST",
    body: {
      project_id: demo.project.id,
      name: "Missing proof",
      date: "2026-10-18",
      amount: "10",
      type: "expense",
    },
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "evidenceRequired");
});
test("calendar navigation materializes actual occurrences for the selected month", async () => {
  const { data } = await request("/api/workspace?month=2027-02").then((res) =>
    res.json(),
  );
  assert.ok(
    data.occurrences.some(
      (row) => row.bill_id === demo.monthly.id && row.due_date === "2027-02-28",
    ),
  );
  assert.equal((await request("/api/workspace?month=garbage")).status, 400);
});
test("attachments are private downloads with project access checks", async () => {
  const { data } = await request("/api/workspace").then((res) => res.json());
  const file = data.attachments[0];
  const response = await request(file.download_url);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-disposition"), /^attachment;/);
  assert.match(await response.text(), /DEMO ONLY/);
  assert.equal(
    (await request(file.download_url, { role: "employee" })).status,
    404,
  );
  assert.equal(
    (await request(file.download_url, { role: "none" })).status,
    401,
  );
});
test("language preferences persist and invalid roles cannot become contractor logins", async () => {
  assert.equal(
    (
      await request("/api/me/language", {
        method: "PUT",
        body: { preferred_language: "es" },
      })
    ).status,
    200,
  );
  const { user } = await request("/api/session").then((res) => res.json());
  assert.equal(user.preferred_language, "es");
  const response = await request("/api/team", {
    method: "POST",
    body: {
      name: "Contractor",
      email: "contractor@example.com",
      password: "Password123",
      role: "contractor",
    },
  });
  assert.equal(response.status, 400);
});
test("malformed payloads and cross-origin mutations are rejected", async () => {
  assert.equal(
    (await request("/api/projects", { method: "POST", body: "{" })).status,
    400,
  );
  assert.equal(
    (
      await request("/api/projects", {
        method: "POST",
        body: {},
        headers: { Origin: "http://untrusted.example" },
      })
    ).status,
    403,
  );
});
test("a separate business cannot read or modify the first business data", async () => {
  const response = await request("/api/auth/signup", {
    method: "POST",
    body: {
      email: "outside@example.com",
      password: "Password123",
      name: "Outside owner",
      business_name: "Other business",
    },
  });
  assert.equal(response.status, 201);
  const cookie = response.headers.get("set-cookie").split(";")[0];
  const { data } = await request("/api/workspace", {
    headers: { Cookie: cookie },
  }).then((res) => res.json());
  assert.equal(data.transactions.length, 0);
  assert.equal(data.projects.length, 0);
  assert.equal(
    (
      await request(`/api/projects/${demo.project.id}`, {
        method: "PUT",
        headers: { Cookie: cookie },
        body: {},
      })
    ).status,
    404,
  );
});
