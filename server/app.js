import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { join, resolve, extname, sep } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { FinanceStore, DomainError, publicUser } from "./domain.js";
import {
  clearSessionCookie,
  createSession,
  getCookie,
  getSessionUser,
  hashToken,
  sessionCookie,
  verifyPassword,
} from "./auth.js";
import { rootDir } from "./db.js";

export function createApp({
  db,
  uploadDir = join(rootDir, "data/uploads"),
  now,
  maxUploadBytes = Number(process.env.MAX_UPLOAD_BYTES || 8388608),
}) {
  const store = new FinanceStore(db, { uploadDir, now, maxUploadBytes });
  const authAttempts = new Map();
  const login = (res, user) => {
    const session = createSession(db, user.id);
    res.setHeader(
      "Set-Cookie",
      sessionCookie(session.token, session.expiresAt),
    );
    if (user.role === "admin") {
      user.last_accessed_at = new Date().toISOString();
      db.prepare("UPDATE users SET last_accessed_at = ? WHERE id = ?").run(
        user.last_accessed_at,
        user.id,
      );
    }
    return publicUser(user);
  };
  const server = createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (!url.pathname.startsWith("/api/")) {
        serveStatic(req, res, url);
        return;
      }
      res.setHeader("Cache-Control", "no-store");
      if (
        ["POST", "PUT", "PATCH", "DELETE"].includes(req.method) &&
        req.headers.origin
      ) {
        const origin = new URL(req.headers.origin);
        if (origin.host !== req.headers.host)
          throw new DomainError("forbidden", 403);
      }
      if (
        req.method === "POST" &&
        ["/api/auth/login", "/api/auth/signup"].includes(url.pathname)
      ) {
        const ip = req.socket.remoteAddress,
          time = Date.now();
        const previous = authAttempts.get(ip);
        const attempt =
          !previous || previous.until < time
            ? { count: 0, until: time + 600000 }
            : previous;
        attempt.count++;
        authAttempts.set(ip, attempt);
        if (attempt.count > 30) throw new DomainError("rateLimited", 429);
        // Expired entries cannot grow the map indefinitely on a LAN host.
        for (const [key, value] of authAttempts)
          if (value.until < time) authAttempts.delete(key);
        const body = await readJson(req);
        let user;
        if (url.pathname.endsWith("signup")) user = store.createBusiness(body);
        else {
          user = db.prepare("SELECT * FROM users WHERE email = ?").get(
            String(body.email || "")
              .trim()
              .toLowerCase(),
          );
          if (
            !user?.password_hash ||
            typeof body.password !== "string" ||
            body.password.length > 256 ||
            !verifyPassword(body.password, user.password_hash)
          )
            throw new DomainError("invalidCredentials", 401);
        }
        sendJson(res, url.pathname.endsWith("signup") ? 201 : 200, {
          user: login(res, user),
        });
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/auth/github") {
        if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET)
          throw new DomainError("oauthUnavailable");
        const state = randomBytes(24).toString("hex");
        db.prepare("DELETE FROM oauth_states WHERE expires_at <= ?").run(
          new Date().toISOString(),
        );
        db.prepare("INSERT INTO oauth_states VALUES (?, ?)").run(
          state,
          new Date(Date.now() + 600000).toISOString(),
        );
        // Bind state to the initiating browser as well as the database.
        res.setHeader(
          "Set-Cookie",
          `oauth_state=${state}; HttpOnly; SameSite=Lax; Path=/api/auth/github; Max-Age=600${process.env.COOKIE_SECURE === "1" ? "; Secure" : ""}`,
        );
        const target = new URL("https://github.com/login/oauth/authorize");
        target.searchParams.set("client_id", process.env.GITHUB_CLIENT_ID);
        target.searchParams.set(
          "redirect_uri",
          process.env.GITHUB_CALLBACK_URL ||
            `http://${req.headers.host}/api/auth/github/callback`,
        );
        target.searchParams.set("scope", "read:user user:email");
        target.searchParams.set("state", state);
        redirect(res, target.toString());
        return;
      }
      if (
        req.method === "GET" &&
        url.pathname === "/api/auth/github/callback"
      ) {
        const state = url.searchParams.get("state"),
          code = url.searchParams.get("code");
        const valid =
          state &&
          state === getCookie(req, "oauth_state") &&
          db
            .prepare(
              "SELECT 1 FROM oauth_states WHERE state = ? AND expires_at > ?",
            )
            .get(state, new Date().toISOString());
        if (!valid || !code) {
          redirect(res, "/?oauth=failed");
          return;
        }
        db.prepare("DELETE FROM oauth_states WHERE state = ?").run(state);
        const tokenResponse = await fetch(
          "https://github.com/login/oauth/access_token",
          {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              client_id: process.env.GITHUB_CLIENT_ID,
              client_secret: process.env.GITHUB_CLIENT_SECRET,
              code,
              redirect_uri:
                process.env.GITHUB_CALLBACK_URL ||
                `http://${req.headers.host}/api/auth/github/callback`,
            }),
            signal: AbortSignal.timeout(15000),
          },
        );
        const token = await tokenResponse.json();
        if (!token.access_token) {
          redirect(res, "/?oauth=failed");
          return;
        }
        const github = async (path) => {
          const response = await fetch(`https://api.github.com/${path}`, {
            headers: {
              Authorization: `Bearer ${token.access_token}`,
              Accept: "application/vnd.github+json",
              "User-Agent": "ahiora-local",
            },
            signal: AbortSignal.timeout(15000),
          });
          if (!response.ok) throw new DomainError("oauthUnavailable");
          return response.json();
        };
        const profile = await github("user"),
          emails = await github("user/emails");
        const email = emails.find(
          (item) => item.primary && item.verified,
        )?.email;
        if (!email) {
          redirect(res, "/?oauth=failed");
          return;
        }
        const linked = db
          .prepare(
            "SELECT users.* FROM oauth_accounts JOIN users ON users.id = oauth_accounts.user_id WHERE provider = 'github' AND provider_user_id = ?",
          )
          .get(String(profile.id));
        let user =
          linked ||
          db
            .prepare("SELECT * FROM users WHERE email = ?")
            .get(email.toLowerCase());
        if (!user)
          user = store.createBusiness({
            email,
            name: profile.name || profile.login,
            business_name: `${profile.login}'s business`,
            password: randomBytes(32).toString("hex"),
          });
        db.prepare(
          "INSERT OR IGNORE INTO oauth_accounts VALUES (?, ?, 'github', ?)",
        ).run(randomUUID(), user.id, String(profile.id));
        login(res, user);
        redirect(res, "/");
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/auth/logout") {
        const token = getCookie(req, "sid");
        if (token)
          db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(
            hashToken(token),
          );
        res.setHeader("Set-Cookie", clearSessionCookie());
        sendJson(res, 200, { ok: true });
        return;
      }
      const user = getSessionUser(db, req);
      if (req.method === "GET" && url.pathname === "/api/session") {
        sendJson(res, 200, {
          user: publicUser(user),
          github_enabled: Boolean(
            process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET,
          ),
        });
        return;
      }
      if (!user) throw new DomainError("unauthorized", 401);
      if (req.method === "GET" && url.pathname === "/api/workspace") {
        sendJson(res, 200, {
          data: store.workspace(
            user,
            url.searchParams.get("month") || undefined,
          ),
        });
        return;
      }
      const fileMatch = url.pathname.match(/^\/api\/attachments\/([^/]+)$/);
      if (req.method === "GET" && fileMatch) {
        const file = store.attachment(user, fileMatch[1]),
          path = join(uploadDir, file.storage_name);
        if (!existsSync(path)) throw new DomainError("notFound", 404);
        // Downloads avoid executing user-uploaded SVG/HTML in the application origin.
        res.writeHead(200, {
          "Content-Type": "application/octet-stream",
          "Content-Length": file.size_bytes,
          "Content-Disposition": `attachment; filename="${file.original_name.replace(/[^a-zA-Z0-9._-]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(file.original_name)}`,
        });
        createReadStream(path).pipe(res);
        return;
      }
      if (req.method === "PUT" && url.pathname === "/api/me/language") {
        sendJson(res, 200, {
          user: store.updateLanguage(user, await readJson(req)),
        });
        return;
      }
      if (req.method === "PUT" && url.pathname === "/api/business") {
        store.updateBusiness(user, await readJson(req));
        sendJson(res, 200, { ok: true });
        return;
      }
      const match = url.pathname.match(
        /^\/api\/(projects|contractors|billing-accounts|team|transactions|bills|payments|comments|references)(?:\/([^/]+))?(?:\/(void|pause))?$/,
      );
      if (!match) throw new DomainError("notFound", 404);
      const [, entity, id, action] = match;
      let result;
      if (entity === "contractors" && req.method === "DELETE" && id && !action)
        result = store.deleteContractor(user, id);
      else if (
        req.method === "POST" &&
        id &&
        entity === "transactions" &&
        action === "void"
      )
        result = store.voidTransaction(user, id);
      else if (
        req.method === "POST" &&
        id &&
        entity === "bills" &&
        action === "pause"
      )
        result = store.pauseBill(user, id);
      else {
        const body = await readJson(req);
        const save = {
          projects: "saveProject",
          contractors: "saveContractor",
          "billing-accounts": "saveAccount",
          team: "saveMember",
          comments: "saveComment",
        }[entity];
        if (
          save &&
          ((req.method === "POST" && !id) || (req.method === "PUT" && id)) &&
          !action
        )
          result = store[save](user, body, id);
        else if (entity === "transactions" && req.method === "POST" && !id)
          result = store.createTransaction(user, body);
        else if (entity === "bills" && req.method === "POST" && !id)
          result = store.createBill(user, body);
        else if (entity === "references" && req.method === "POST" && !id)
          result = store.addReference(user, body);
        else if (entity === "payments" && req.method === "POST" && !id)
          result = store.createPayment(user, body.occurrence_id, body);
        else if (entity === "payments" && req.method === "PUT" && id)
          result = store.updatePayment(user, id, body);
        else throw new DomainError("notFound", 404);
      }
      sendJson(
        res,
        req.method === "POST" && !id ? 201 : 200,
        result || { ok: true },
      );
    } catch (error) {
      if (error instanceof DomainError)
        sendJson(res, error.status, { code: error.code, error: error.code });
      else if (error instanceof SyntaxError || error instanceof URIError)
        sendJson(res, 400, { code: "invalidRequest", error: "invalidRequest" });
      else {
        console.error(error);
        sendJson(res, 500, { code: "internal", error: "internal" });
      }
    }
  });
  return server;
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16 * 1024 * 1024) throw new DomainError("requestTooLarge", 413);
    chunks.push(chunk);
  }
  const body = chunks.length
    ? JSON.parse(Buffer.concat(chunks).toString("utf8"))
    : {};
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new DomainError("invalidRequest");
  return body;
}
function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}
function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}
function serveStatic(req, res, url) {
  if (!["GET", "HEAD"].includes(req.method)) {
    sendJson(res, 405, { code: "invalidRequest" });
    return;
  }
  const dist = resolve(rootDir, "dist"),
    requested = resolve(dist, `.${decodeURIComponent(url.pathname)}`);
  if (requested !== dist && !requested.startsWith(dist + sep)) {
    sendJson(res, 404, { code: "notFound" });
    return;
  }
  const path =
    existsSync(requested) && statSync(requested).isFile()
      ? requested
      : join(dist, "index.html");
  if (!existsSync(path)) {
    sendJson(res, 404, { error: "Build the client first with npm run build." });
    return;
  }
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".png": "image/png",
  };
  res.writeHead(200, {
    "Content-Type": types[extname(path)] || "application/octet-stream",
  });
  if (req.method === "HEAD") res.end();
  else createReadStream(path).pipe(res);
}
