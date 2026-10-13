const fs = require("fs");
const path = require("path");
const https = require("https");
const crypto = require("crypto");
const { classifyServer } = require("./desktop");
const { parseSummary, parseModelBuckets, hasData, isObj, str, resetOf } = require("./quota");

const TOKEN_FILE = [".gemini", "antigravity-cli", "antigravity-oauth-token"];
const BINARY_CANDIDATES = [[".local", "bin", "agy"], [".gemini", "antigravity-cli", "bin", "agy"], ["bin", "agy"]];
const FS_TIMEOUT_MS = 2_500;
const PROC_BUDGET_MS = 2_500;
const PROC_MAX_PIDS = 2_000;
const PROC_BATCH = 48;
const BINARY_BUDGET_MS = 20_000;
const BINARY_MAX_BYTES = 512 * 1024 * 1024;
const CLOUD_TIMEOUT_MS = 5_000;
const MIN_FETCH_MS = 60_000;
const IDLE_FETCH_MS = 10 * 60_000;
const ACTIVE_WINDOW_MS = 30 * 60_000;
const LOAD_TTL_MS = 6 * 3600_000;
const EXPIRY_SAFETY_MS = 60_000;
const REFRESH_BACKOFF_MS = 5 * 60_000;

const HOST_TOKEN = "oauth2.googleapis.com";
const HOST_DAILY = "daily-cloudcode-pa.googleapis.com";
const HOST_PROD = "cloudcode-pa.googleapis.com";
const ALLOWED = {
  [HOST_TOKEN]: ["/token"],
  [HOST_DAILY]: ["/v1internal:retrieveUserQuotaSummary"],
  [HOST_PROD]: ["/v1internal:loadCodeAssist", "/v1internal:retrieveUserQuotaSummary", "/v1internal:retrieveUserQuota"],
};
const USER_AGENT = `antigravity/hub/2.9.1 ${process.platform === "win32" ? "windows" : process.platform}/${process.arch === "x64" ? "amd64" : process.arch}`;
const CLIENT_ID_RE = /^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/;
const CLIENT_SECRET_RE = /GOCSPX-[A-Za-z0-9_-]{28}(?![A-Za-z0-9_-])/;
const SECRET_WINDOW = 256;

const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const accountId = (email) => sha256(`antigravity\0${String(email).trim().toLowerCase()}`).slice(0, 8);
const anonymousId = (locId) => sha256(`antigravity-location\0${locId}`).slice(0, 8);

function withTimeout(promise, ms, fallback) {
  return new Promise((resolve) => {
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; resolve(fallback); } }, ms);
    Promise.resolve(promise).then(
      (v) => { if (!done) { done = true; clearTimeout(t); resolve(v); } },
      () => { if (!done) { done = true; clearTimeout(t); resolve(fallback); } }
    );
  });
}

function distroRoot(home) {
  const parent = path.dirname(home);
  if (path.basename(parent).toLowerCase() === "home") return path.dirname(parent);
  if (path.basename(home).toLowerCase() === "root") return parent;
  return null;
}

function isAgy(argv) {
  const base = (s) => String(s || "").split(/[\\/]/).pop();
  if (base(argv[0]) === "agy") return true;
  return /^(node|bun|deno)$/.test(base(argv[0])) && base(argv[1]) === "agy";
}

async function scanProc(root, opts) {
  const o = opts || {};
  const fsp = o.fsp || fs.promises;
  const clock = o.clock || Date.now;
  const out = { servers: [], cliRunning: false, scanned: 0, complete: false };
  const proc = path.join(root, "proc");
  const names = await withTimeout(fsp.readdir(proc), FS_TIMEOUT_MS, null);
  if (!Array.isArray(names)) return out;
  const pids = names.filter((n) => typeof n === "string" && /^[0-9]{1,9}$/.test(n)).slice(0, PROC_MAX_PIDS);
  const deadline = clock() + (o.budgetMs || PROC_BUDGET_MS);
  for (let i = 0; i < pids.length; i += PROC_BATCH) {
    if (clock() > deadline) return out;
    const batch = pids.slice(i, i + PROC_BATCH);
    const bufs = await Promise.all(batch.map((pid) => withTimeout(fsp.readFile(path.join(proc, pid, "cmdline")), FS_TIMEOUT_MS, null)));
    bufs.forEach((buf, k) => {
      out.scanned++;
      if (!buf || buf.length === 0 || buf.length > 64 * 1024) return;
      const argv = Buffer.from(buf).toString("utf8").split("\0").filter(Boolean);
      if (argv.length === 0) return;
      if (isAgy(argv)) { out.cliRunning = true; return; }
      const server = classifyServer({ pid: Number(batch[k]), name: argv[0].split("/").pop(), cmd: argv, ports: [] });
      if (server) out.servers.push(server);
    });
  }
  out.complete = true;
  return out;
}

function jwtClaims(jwt) {
  try {
    const part = String(jwt || "").split(".")[1];
    if (!part) return {};
    const claims = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    return isObj(claims) ? claims : {};
  } catch {
    return {};
  }
}

function parseTokenFile(text) {
  let data;
  try { data = JSON.parse(String(text)); } catch { return null; }
  if (!isObj(data)) return null;
  const tok = isObj(data.token) ? data.token : data;
  const accessToken = typeof tok.access_token === "string" ? tok.access_token.trim() : "";
  const refreshToken = typeof tok.refresh_token === "string" ? tok.refresh_token.trim() : "";
  if (!accessToken && !refreshToken) return null;
  const expiryMs = resetOf(tok.expiry ?? tok.expiry_date ?? tok.expires_at ?? data.expiry) || 0;
  const claims = jwtClaims(data.id_token || tok.id_token);
  const aud = typeof claims.aud === "string" && CLIENT_ID_RE.test(claims.aud) ? claims.aud : "";
  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  const sub = typeof claims.sub === "string" ? claims.sub : "";
  return { accessToken, refreshToken, expiryMs, aud, identity: email || (sub ? `sub:${sub}` : "") };
}

function httpsPost({ host, path: urlPath, headers, body, timeoutMs }) {
  return new Promise((resolve) => {
    let settled = false;
    let req = null;
    const finish = (v) => { if (settled) return; settled = true; clearTimeout(hard); resolve(v); };
    const limit = timeoutMs || CLOUD_TIMEOUT_MS;
    const hard = setTimeout(() => { try { if (req) req.destroy(); } catch {} finish({ error: "timeout" }); }, limit);
    try {
      req = https.request(
        { host, port: 443, method: "POST", path: urlPath, headers: { ...headers, "Content-Length": Buffer.byteLength(body) }, timeout: limit, agent: false },
        (res) => {
          const chunks = [];
          let size = 0;
          res.on("data", (c) => { size += c.length; if (size <= 2 * 1024 * 1024) chunks.push(c); });
          res.on("end", () => {
            let json = null;
            try { json = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch {}
            finish({ status: res.statusCode || 0, body: json });
          });
          res.on("error", () => finish({ error: "network" }));
        }
      );
      req.on("timeout", () => { try { req.destroy(); } catch {} finish({ error: "timeout" }); });
      req.on("error", () => finish({ error: "network" }));
      req.end(body);
    } catch {
      finish({ error: "network" });
    }
  });
}

function projectIdFrom(v) {
  for (const c of [v, isObj(v) ? v.response : null]) {
    if (!isObj(c)) continue;
    for (const k of ["cloudaicompanionProject", "projectId", "project"]) {
      const p = c[k];
      const id = typeof p === "string" ? p.trim() : isObj(p) ? str(p.value || p.id || p.projectId, 120) : "";
      if (id) return id.slice(0, 120);
    }
  }
  return "";
}

function planFromLoad(v) {
  if (!isObj(v)) return "";
  const paid = isObj(v.paidTier) ? v.paidTier : {};
  const cur = isObj(v.currentTier) ? v.currentTier : {};
  if (String(paid.id || "").toLowerCase() === "g1-pro-tier") return "Pro";
  return str(paid.name, 28) || str(cur.name, 28);
}

function desktopArtifacts(env) {
  if (process.platform !== "win32") return [];
  const local = env && typeof env.LOCALAPPDATA === "string" ? env.LOCALAPPDATA : "";
  return local ? [path.join(local, "Programs", "Antigravity", "resources", "app", "out", "main.js")] : [];
}

function createCli(deps) {
  const d = deps || {};
  const fsp = d.fsp || fs.promises;
  const now = d.now || Date.now;
  const env = d.env || process.env;
  const rawFetch = d.cloudFetch || httpsPost;
  const cloudOff = env.ORBIT_ANTIGRAVITY_CLOUD === "0";
  const refreshOff = env.ORBIT_ANTIGRAVITY_REFRESH === "0";
  const artifacts = Array.isArray(d.artifacts) ? d.artifacts : desktopArtifacts(env);

  const perLoc = new Map();
  const perAccount = new Map();
  const secrets = new Map();
  const stats = { requests: 0, refreshes: 0, rotated: false };

  const locState = (id) => { if (!perLoc.has(id)) perLoc.set(id, { sig: "", tok: null, mtimeMs: 0, mem: null, refreshOffUntil: 0, refreshReason: "" }); return perLoc.get(id); };
  const accState = (id) => { if (!perAccount.has(id)) perAccount.set(id, { lastAt: 0, last: null, inflight: null, project: "", plan: "", loadAt: 0 }); return perAccount.get(id); };

  async function post(host, urlPath, headers, body) {
    if (!ALLOWED[host] || !ALLOWED[host].includes(urlPath)) return { error: "blocked" };
    stats.requests++;
    try {
      const r = await rawFetch({ host, path: urlPath, headers, body, timeoutMs: CLOUD_TIMEOUT_MS });
      return r && typeof r === "object" ? r : { error: "network" };
    } catch {
      return { error: "network" };
    }
  }

  const api = (host, urlPath, accessToken, payload) => post(host, urlPath, {
    Authorization: `Bearer ${accessToken}`,
    Accept: "*/*",
    "Content-Type": "application/json",
    "User-Agent": USER_AGENT,
  }, JSON.stringify(payload || {}));

  async function identity(loc) {
    const st = locState(loc.id);
    const file = path.join(loc.home, ...TOKEN_FILE);
    const info = await withTimeout(fsp.stat(file), FS_TIMEOUT_MS, null);
    if (!info || info.size > 64 * 1024) { st.sig = ""; st.tok = null; return { state: "none", id: "", active: false }; }
    const sig = `${info.size}:${info.mtimeMs}`;
    if (sig !== st.sig) {
      const text = await withTimeout(fsp.readFile(file, "utf8"), FS_TIMEOUT_MS, null);
      if (typeof text !== "string") return { state: "none", id: "", active: false };
      st.sig = sig;
      st.tok = parseTokenFile(text);
      st.mtimeMs = Number(info.mtimeMs) || 0;
      st.mem = null;
      st.refreshOffUntil = 0;
      st.refreshReason = "";
    }
    if (!st.tok) return { state: "malformed", id: "", active: false };
    const age = now() - st.mtimeMs;
    return {
      state: "ok",
      id: st.tok.identity ? accountId(st.tok.identity) : anonymousId(loc.id),
      active: age > -60_000 && age < ACTIVE_WINDOW_MS,
    };
  }

  async function clientSecret(loc, clientId) {
    const files = artifacts.slice();
    for (const p of BINARY_CANDIDATES) files.push(path.join(loc.home, ...p));
    const root = loc.kind === "wsl" ? distroRoot(loc.home) : null;
    if (root) files.push(path.join(root, "usr", "local", "bin", "agy"), path.join(root, "usr", "bin", "agy"));
    for (const file of files) {
      const info = await withTimeout(fsp.stat(file), FS_TIMEOUT_MS, null);
      if (!info || !info.isFile() || info.size === 0 || info.size > BINARY_MAX_BYTES) continue;
      const sig = `${info.size}:${info.mtimeMs}:${clientId}`;
      const hit = secrets.get(file);
      if (hit && hit.sig === sig) { if (hit.value) return hit.value; continue; }
      const value = await withTimeout(scanArtifact(file, clientId), BINARY_BUDGET_MS, null);
      secrets.set(file, { sig, value });
      if (value) return value;
    }
    return null;
  }

  async function scanArtifact(file, clientId) {
    let handle = null;
    try {
      handle = await fsp.open(file, "r");
      const buf = Buffer.allocUnsafe(4 * 1024 * 1024);
      const keep = clientId.length + SECRET_WINDOW + 64;
      let tail = "";
      for (;;) {
        const { bytesRead } = await handle.read(buf, 0, buf.length, null);
        if (!bytesRead) break;
        const text = tail + buf.toString("latin1", 0, bytesRead);
        for (let i = text.indexOf(clientId); i >= 0; i = text.indexOf(clientId, i + 1)) {
          const after = text.slice(i + clientId.length, i + clientId.length + SECRET_WINDOW);
          const m = CLIENT_SECRET_RE.exec(after);
          if (m && !/\.apps\.googleusercontent\.com/.test(after.slice(0, m.index))) return m[0];
        }
        tail = text.slice(-keep);
      }
      return null;
    } catch {
      return null;
    } finally {
      try { if (handle) await handle.close(); } catch {}
    }
  }

  async function accessFor(loc, st) {
    const t = now();
    const tok = st.tok;
    if (tok.accessToken && tok.expiryMs - t > EXPIRY_SAFETY_MS) return { accessToken: tok.accessToken, stored: true };
    if (st.mem && st.mem.expiryMs - t > EXPIRY_SAFETY_MS) return { accessToken: st.mem.accessToken };
    if (refreshOff || !tok.refreshToken || !tok.aud) return { reason: "expired" };
    if (st.refreshOffUntil > t) return { reason: st.refreshReason || "expired" };
    const secret = await clientSecret(loc, tok.aud);
    if (!secret) { st.refreshOffUntil = t + LOAD_TTL_MS; st.refreshReason = "expired"; return { reason: "expired" }; }
    stats.refreshes++;
    const form = new URLSearchParams({ client_id: tok.aud, client_secret: secret, refresh_token: tok.refreshToken, grant_type: "refresh_token" }).toString();
    const r = await post(HOST_TOKEN, "/token", { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, form);
    if (r.error || !r.status) { st.refreshOffUntil = t + REFRESH_BACKOFF_MS; st.refreshReason = "api_error"; return { reason: "api_error" }; }
    const granted = r.status === 200 && isObj(r.body) && typeof r.body.access_token === "string" && r.body.access_token;
    if (!granted) {
      const hard = r.status === 400 || r.status === 401;
      st.refreshOffUntil = t + (hard ? LOAD_TTL_MS : REFRESH_BACKOFF_MS);
      st.refreshReason = hard ? "expired" : "api_error";
      return { reason: st.refreshReason };
    }
    if (typeof r.body.refresh_token === "string" && r.body.refresh_token && r.body.refresh_token !== tok.refreshToken && !stats.rotated) {
      stats.rotated = true;
      console.warn("[antigravity] o servidor OAuth devolveu um refresh token novo — a renovação em memória foi mantida, o arquivo do agy não foi alterado");
    }
    const ttl = Math.max(0, Number(r.body.expires_in) || 0) * 1000;
    st.mem = { accessToken: r.body.access_token, expiryMs: t + ttl };
    return { accessToken: st.mem.accessToken };
  }

  const failed = (r) => (r.error ? "api_error" : r.status === 401 ? "unauthorized" : r.status === 403 ? "forbidden" : r.status === 429 ? "rate_limited" : "api_error");

  async function fetchQuota(loc, st, acc) {
    const got = await accessFor(loc, st);
    if (!got.accessToken) return { ok: false, reason: got.reason };
    const token = got.accessToken;
    const t = now();
    if (!acc.loadAt || t - acc.loadAt > LOAD_TTL_MS) {
      const r = await api(HOST_PROD, "/v1internal:loadCodeAssist", token, { metadata: { ideType: "ANTIGRAVITY" } });
      if (r.error || r.status !== 200) return { ok: false, reason: failed(r) };
      acc.project = projectIdFrom(r.body);
      acc.plan = planFromLoad(r.body);
      acc.loadAt = t;
    }
    const body = acc.project ? { project: acc.project } : {};
    let reason = "no_quota";
    for (const host of [HOST_DAILY, HOST_PROD]) {
      const r = await api(host, "/v1internal:retrieveUserQuotaSummary", token, body);
      if (!r.error && r.status === 200) {
        const parsed = parseSummary(r.body, t);
        if (hasData(parsed)) return { ok: true, data: { groups: parsed.groups, perModel: false, source: "cloud", plan: acc.plan, email: "" } };
        continue;
      }
      reason = failed(r);
      if (reason === "unauthorized" || reason === "rate_limited") return { ok: false, reason };
    }
    const r = await api(HOST_PROD, "/v1internal:retrieveUserQuota", token, body);
    if (!r.error && r.status === 200) {
      const parsed = parseModelBuckets(r.body, t);
      if (hasData(parsed)) return { ok: true, data: { groups: parsed.groups, perModel: true, source: "cloud-models", plan: acc.plan, email: "" } };
      return { ok: false, reason: "no_quota" };
    }
    return { ok: false, reason: reason === "no_quota" ? failed(r) : reason };
  }

  async function cloud(loc, opts) {
    const o = opts || {};
    if (cloudOff) return { ok: false, reason: "cloud_off" };
    const who = o.identity || (await identity(loc));
    if (who.state === "none") return { ok: false, reason: "no_login" };
    if (who.state !== "ok") return { ok: false, reason: "bad_token_file" };
    const st = locState(loc.id);
    const acc = accState(who.id);
    if (acc.inflight) return acc.inflight;
    const t = now();
    const gap = o.force || o.active || who.active ? MIN_FETCH_MS : IDLE_FETCH_MS;
    if (acc.last && t - acc.lastAt < (acc.last.ok ? gap : MIN_FETCH_MS)) return acc.last;
    acc.inflight = (async () => {
      try {
        const res = await fetchQuota(loc, st, acc);
        acc.lastAt = now();
        acc.last = { ...res, fetchedAt: acc.lastAt };
        return acc.last;
      } catch {
        acc.lastAt = now();
        acc.last = { ok: false, reason: "api_error", fetchedAt: acc.lastAt };
        return acc.last;
      } finally {
        acc.inflight = null;
      }
    })();
    return acc.inflight;
  }

  function scan(loc) {
    const root = distroRoot(loc.home);
    if (!root) return Promise.resolve({ servers: [], cliRunning: false, scanned: 0, complete: false });
    return scanProc(root, { fsp, clock: now });
  }

  return { identity, cloud, scan, stats, reset() { perLoc.clear(); perAccount.clear(); secrets.clear(); } };
}

module.exports = {
  createCli, scanProc, parseTokenFile, distroRoot, isAgy, accountId, anonymousId, httpsPost,
  ALLOWED, TOKEN_FILE, MIN_FETCH_MS, IDLE_FETCH_MS,
};
