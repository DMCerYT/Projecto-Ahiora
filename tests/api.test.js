import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { openDatabase } from "../server/db.js";
import { seedDemo } from "../server/demo.js";
import { createApp } from "../server/app.js";
import viteConfig from "../vite.config.js";

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
test("standalone bill images are served only to owners and admins with a validated image content type", async () => {
  const image = {
    name: "bill.png",
    type: "image/png",
    data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/8h8AAAAASUVORK5CYII=",
  };
  const created = await request("/api/bills", {
    method: "POST",
    body: {
      name: "Private card",
      amount: "25",
      first_due_date: "2027-06-18",
      recurrence: "monthly",
      image,
    },
  });
  assert.equal(created.status, 201);
  const { id, first_occurrence } = await created.json();
  assert.equal(first_occurrence.status, "unpaid");
  const response = await request(`/api/bills/${id}/image`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(
    Buffer.from(await response.arrayBuffer()),
    Buffer.from(image.data, "base64"),
  );
  assert.equal(
    (await request(`/api/bills/${id}/image`, { role: "none" })).status,
    401,
  );
  assert.equal(
    (await request(`/api/bills/${id}/image`, { role: "employee" })).status,
    404,
  );
  const foreign = await request("/api/auth/signup", {
    method: "POST",
    body: {
      email: "image-outsider@example.com",
      password: "DemoPass123!",
      name: "Other owner",
      business_name: "Other business",
    },
  });
  const cookie = foreign.headers.get("set-cookie").split(";")[0];
  assert.equal(
    (await request(`/api/bills/${id}/image`, { headers: { Cookie: cookie } }))
      .status,
    404,
  );
  const employeeBill = await request("/api/bills", {
    method: "POST",
    body: {
      name: "Assigned card",
      amount: "25",
      first_due_date: "2027-06-18",
      recurrence: "once",
      image,
    },
  }).then((res) => res.json());
  assert.equal(
    (await request(`/api/bills/${employeeBill.id}/image`, { role: "employee" }))
      .status,
    404,
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

test("property API supports receipt-only transactions and preserves business boundaries", async () => {
  const created = await request("/api/properties", {
    method: "POST",
    body: {
      name: "Rental",
      address: "123 Main",
      tenant_name: "Tenant",
      monthly_rent: "1200",
    },
  });
  assert.equal(created.status, 201);
  const { id } = await created.json();
  const response = await request("/api/transactions", {
    method: "POST",
    body: {
      property_id: id,
      name: "Rent",
      date: "2026-10-18",
      amount: "1200",
      type: "income",
      reference: { reference_number: "RENT-API" },
    },
  });
  assert.equal(response.status, 201);
  const { data } = await request("/api/workspace").then((res) => res.json());
  assert.equal(
    data.properties.find((item) => item.id === id).monthly_rent_cents,
    120000,
  );
  assert.equal(
    data.transactions.find((item) => item.property_id === id).project_id,
    null,
  );
  const { data: employee } = await request("/api/workspace", {
    role: "employee",
  }).then((res) => res.json());
  assert.deepEqual(employee.properties, []);
  assert.deepEqual(employee.bills, []);
  assert.equal(
    (
      await request(`/api/properties/${id}`, {
        method: "PUT",
        role: "employee",
        body: { name: "No", address: "No" },
      })
    ).status,
    403,
  );
});
test("bill API rejects project assignments and payment evidence still requires a receipt ID", async () => {
  assert.equal(
    (
      await request("/api/bills", {
        method: "POST",
        body: {
          project_id: demo.project.id,
          name: "Linked bill",
          amount: "10",
          first_due_date: "2026-10-18",
          recurrence: "once",
        },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/api/transactions", {
        method: "POST",
        body: {
          project_id: demo.project.id,
          name: "Date only",
          date: "2026-10-18",
          amount: "10",
          type: "expense",
          reference: { evidence_at: "2026-10-18" },
        },
      })
    ).status,
    400,
  );
});

test("browser signup and login work through the development proxy while foreign origins stay blocked", async () => {
  const { createServer } = await import("vite");
  const proxy = viteConfig.server.proxy["/api"];
  const vite = await createServer({
    ...viteConfig,
    configFile: false,
    logLevel: "silent",
    optimizeDeps: { noDiscovery: true, include: [] },
    server: {
      ...viteConfig.server,
      host: "127.0.0.1",
      port: 0,
      strictPort: true,
      watch: null,
      proxy: {
        "/api": typeof proxy === "string" ? base : { ...proxy, target: base },
      },
    },
  });
  try {
    await vite.listen();
    const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
    const body = {
      name: "Proxy owner",
      business_name: "Proxy business",
      email: "proxy-owner@example.com",
      password: "Password123",
    };
    const signup = await fetch(`${origin}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify(body),
    });
    assert.equal(signup.status, 201);
    assert.equal((await signup.json()).user.role, "owner");
    const login = await fetch(`${origin}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({ email: body.email, password: body.password }),
    });
    assert.equal(login.status, 200);
    const rejected = await fetch(`${origin}/api/auth/signup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://untrusted.example",
      },
      body: JSON.stringify(body),
    });
    assert.equal(rejected.status, 403);
    assert.equal((await rejected.json()).code, "invalidOrigin");
  } finally {
    await vite.close();
  }
});

test("property rent income accepts amount and date without a name or reference, but refunds require a receipt ID", async () => {
  const property = await request("/api/properties", {
    method: "POST",
    body: { name: "Rent test", address: "123 Main" },
  }).then((res) => res.json());
  const body = {
    property_id: property.id,
    type: "income",
    amount: "1200",
    date: "2026-10-18",
  };
  const response = await request("/api/transactions", { method: "POST", body });
  assert.equal(response.status, 201);
  const { id } = await response.json();
  const { data } = await request("/api/workspace").then((res) => res.json());
  assert.equal(
    data.transactions.find((tx) => tx.id === id).primary_reference_id,
    null,
  );
  assert.equal(
    data.references.some((reference) => reference.transaction_id === id),
    false,
  );
  const rejected = await request("/api/transactions", {
    method: "POST",
    body: { ...body, name: "Refund", type: "refund" },
  });
  assert.equal(rejected.status, 400);
  assert.equal((await rejected.json()).code, "evidenceRequired");
  const accepted = await request("/api/transactions", {
    method: "POST",
    body: {
      ...body,
      name: "Refund",
      type: "refund",
      reference: { reference_number: "REFUND-1", evidence_at: "2026-10-18" },
    },
  });
  assert.equal(accepted.status, 201);
});

test("project and property lifecycle endpoints archive, restore and delete without losing transaction history", async () => {
  const project = await request("/api/projects", {
    method: "POST",
    body: { name: "Lifecycle project", start_date: "2026-10-18" },
  }).then((res) => res.json());
  const property = await request("/api/properties", {
    method: "POST",
    body: { name: "Lifecycle rental", address: "123 Main" },
  }).then((res) => res.json());
  const tx = await request("/api/transactions", {
    method: "POST",
    body: {
      property_id: property.id,
      type: "income",
      amount: "900",
      date: "2026-10-18",
    },
  }).then((res) => res.json());
  const archived = await request(`/api/properties/${property.id}`, {
    method: "PUT",
    body: { name: "Lifecycle rental", address: "123 Main", status: "archived" },
  });
  assert.equal(archived.status, 200);
  const denied = await request("/api/transactions", {
    method: "POST",
    body: {
      property_id: property.id,
      type: "income",
      amount: "900",
      date: "2026-10-18",
    },
  });
  assert.equal((await denied.json()).code, "archived");
  assert.equal(
    (
      await request(`/api/properties/${property.id}`, {
        method: "PUT",
        body: {
          name: "Lifecycle rental",
          address: "123 Main",
          status: "active",
        },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(`/api/projects/${project.id}`, {
        method: "DELETE",
        role: "employee",
      })
    ).status,
    403,
  );
  assert.equal(
    (await request(`/api/projects/${project.id}`, { method: "DELETE" })).status,
    200,
  );
  assert.equal(
    (await request(`/api/properties/${property.id}`, { method: "DELETE" }))
      .status,
    200,
  );
  const { data } = await request("/api/workspace").then((res) => res.json());
  assert.ok(data.transactions.some((item) => item.id === tx.id));
  assert.ok(data.projects.find((item) => item.id === project.id).deleted_at);
  assert.ok(data.properties.find((item) => item.id === property.id).deleted_at);
});
