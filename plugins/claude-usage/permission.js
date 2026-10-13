const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const DEFAULT_PORT = 9123;
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_BODY = 1024 * 1024;
const MAX_PENDING = 20;
const SUMMARY_MAX = 60;
const TOKEN_FILE = "claude-hook-token";
const PORT_FILE = "claude-hook-port";

function orbitHome(env) {
  return (env && env.ORBIT_HOME) || path.join(os.homedir(), ".orbit");
}

function intEnv(v, fallback, min) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= min ? n : fallback;
}

function loadOrCreateToken(dir) {
  const file = path.join(dir, TOKEN_FILE);
  try {
    const t = fs.readFileSync(file, "utf8").trim();
    if (t.length >= 32) return t;
  } catch {}
  const token = crypto.randomBytes(32).toString("hex");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, token + "\n", { mode: 0o600 });
  try { fs.chmodSync(file, 0o600); } catch {}
  return token;
}

function tokenMatches(given, expected) {
  if (typeof given !== "string" || !expected) return false;
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function oneLine(s) {
  return String(s).replace(/\s+/g, " ").trim();
}

function truncate(s, max) {
  const chars = Array.from(s);
  return chars.length > max ? chars.slice(0, max - 1).join("") + "…" : s;
}

function shortPath(p, cwd) {
  let s = String(p).replace(/\\/g, "/");
  const base = cwd ? String(cwd).replace(/\\/g, "/").replace(/\/+$/, "") : "";
  if (base && s.toLowerCase().startsWith(base.toLowerCase() + "/")) s = s.slice(base.length + 1);
  return s;
}

function summarize(tool, input, cwd) {
  const name = oneLine(tool || "Ferramenta");
  const i = input && typeof input === "object" ? input : {};
  let detail = "";
  if (typeof i.command === "string") detail = i.command;
  else if (typeof i.file_path === "string") detail = shortPath(i.file_path, cwd);
  else if (typeof i.notebook_path === "string") detail = shortPath(i.notebook_path, cwd);
  else if (typeof i.path === "string") detail = shortPath(i.path, cwd);
  else if (typeof i.url === "string") detail = i.url;
  else if (typeof i.pattern === "string") detail = i.pattern;
  else if (typeof i.query === "string") detail = i.query;
  else if (typeof i.description === "string") detail = i.description;
  else if (typeof i.prompt === "string") detail = i.prompt;
  else {
    const first = Object.values(i).find((v) => typeof v === "string" && v.trim());
    if (first) detail = first;
  }
  detail = oneLine(detail);
  return truncate(detail ? `${name}: ${detail}` : name, SUMMARY_MAX);
}

function createPermissionService(opts) {
  const env = (opts && opts.env) || process.env;
  const onChange = (opts && opts.onChange) || (() => {});
  const log = (opts && opts.log) || ((...a) => console.log("[claude-code]", ...a));

  const home = orbitHome(env);
  const wantedPort = intEnv(env.ORBIT_CLAUDE_PORT, DEFAULT_PORT, 0);
  const timeoutMs = intEnv(env.ORBIT_CLAUDE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 1);

  const queue = [];
  let server = null;
  let port = 0;
  let token = "";
  let seq = 0;

  function publicItem(r) {
    return { id: r.id, tool: r.tool, summary: r.summary, cwd: r.cwd, sessionId: r.sessionId, receivedAt: r.receivedAt };
  }

  function changed() {
    try { onChange(); } catch (e) { log("onChange error:", e && e.message); }
  }

  function send(res, status, body) {
    if (res.writableEnded || res.destroyed) return;
    const data = JSON.stringify(body);
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": Buffer.byteLength(data),
      "Cache-Control": "no-store",
      Connection: "close",
    });
    res.end(data);
  }

  function enqueue(payload, res) {
    const tool = typeof payload.tool_name === "string" && payload.tool_name ? payload.tool_name : "Ferramenta";
    const cwd = typeof payload.cwd === "string" ? payload.cwd : "";
    const item = {
      id: `${Date.now().toString(36)}-${(++seq).toString(36)}`,
      tool,
      summary: summarize(tool, payload.tool_input, cwd),
      cwd,
      sessionId: typeof payload.session_id === "string" ? payload.session_id : "",
      receivedAt: Date.now(),
      finish: () => {},
    };
    let done = false;
    const timer = setTimeout(() => item.finish("ask"), timeoutMs);
    item.finish = (decision) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      const idx = queue.indexOf(item);
      if (idx >= 0) queue.splice(idx, 1);
      if (decision) send(res, 200, { decision });
      changed();
    };
    res.on("close", () => { if (!res.writableEnded) item.finish(null); });
    queue.push(item);
    log(`pedido de confirmação: ${item.summary} (${queue.length} pendente${queue.length > 1 ? "s" : ""})`);
    changed();
  }

  function handle(req, res) {
    if (req.headers.origin !== undefined) { req.resume(); return send(res, 403, { error: "origin_not_allowed" }); }
    if (!tokenMatches(req.headers["x-orbit-token"], token)) { req.resume(); return send(res, 401, { error: "unauthorized" }); }

    const url = (req.url || "").split("?")[0];
    if (req.method === "GET" && url === "/health") { req.resume(); return send(res, 200, { ok: true, pending: queue.length }); }
    if (url !== "/permission") { req.resume(); return send(res, 404, { error: "not_found" }); }
    if (req.method !== "POST") { req.resume(); return send(res, 405, { error: "method_not_allowed" }); }

    const chunks = [];
    let size = 0;
    let aborted = false;
    req.on("data", (c) => {
      if (aborted) return;
      size += c.length;
      if (size > MAX_BODY) { aborted = true; send(res, 413, { error: "too_large" }); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      if (aborted) return;
      let payload;
      try { payload = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
      catch { return send(res, 400, { error: "invalid_json" }); }
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) return send(res, 400, { error: "invalid_json" });
      if (queue.length >= MAX_PENDING) return send(res, 200, { decision: "ask" });
      enqueue(payload, res);
    });
    req.on("error", () => {});
  }

  function start() {
    return new Promise((resolve) => {
      try {
        token = loadOrCreateToken(home);
      } catch (e) {
        log("não foi possível criar o token do hook — aprovações pelo ring desativadas:", e && e.message);
        return resolve(false);
      }
      const srv = http.createServer(handle);
      srv.on("clientError", (_e, socket) => { try { socket.destroy(); } catch {} });
      srv.once("error", (e) => {
        log(`porta ${wantedPort} indisponível (${e && e.code}) — aprovações pelo ring desativadas; o restante do plugin segue funcionando`);
        resolve(false);
      });
      srv.listen(wantedPort, "127.0.0.1", () => {
        server = srv;
        port = srv.address().port;
        srv.on("error", (e) => log("erro no servidor de aprovações:", e && e.message));
        try { fs.writeFileSync(path.join(home, PORT_FILE), String(port) + "\n"); } catch {}
        log(`servidor de aprovações em http://127.0.0.1:${port}`);
        resolve(true);
      });
    });
  }

  function stop() {
    for (const item of queue.slice()) item.finish("ask");
    const srv = server;
    server = null;
    port = 0;
    if (!srv) return Promise.resolve();
    return new Promise((resolve) => {
      srv.close(() => resolve());
      if (typeof srv.closeIdleConnections === "function") srv.closeIdleConnections();
      const t = setTimeout(() => { if (typeof srv.closeAllConnections === "function") srv.closeAllConnections(); }, 500);
      if (t.unref) t.unref();
    });
  }

  function resolveOldest(decision) {
    const item = queue[0];
    if (!item) return { handled: false };
    const info = publicItem(item);
    item.finish(decision);
    log(`${decision === "allow" ? "aprovado" : "recusado"}: ${info.summary}`);
    return { handled: true, decision, request: info };
  }

  return {
    start,
    stop,
    approve: () => resolveOldest("allow"),
    decline: () => resolveOldest("deny"),
    pending: () => queue.map(publicItem),
    getPort: () => port,
    timeoutMs,
  };
}

module.exports = { createPermissionService, summarize, DEFAULT_PORT, DEFAULT_TIMEOUT_MS, TOKEN_FILE, PORT_FILE, orbitHome };
