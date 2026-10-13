const http = require("http");
const https = require("https");
const { execFile } = require("child_process");
const { parseSummary, parseUserStatus, hasData, isObj } = require("./quota");

const SERVICE = "/exa.language_server_pb.LanguageServerService";
const METHODS = { summary: "RetrieveUserQuotaSummary", status: "GetUserStatus" };
const REQUEST_BODY = JSON.stringify({ metadata: { ideName: "antigravity", extensionName: "antigravity", locale: "en" } });
const REQUEST_TIMEOUT_MS = 3_000;
const SCAN_TIMEOUT_MS = 5_000;
const MAX_BODY = 4 * 1024 * 1024;
const MAX_PORTS = 8;
const TOKEN_RE = /^[A-Za-z0-9._~+/=-]{8,200}$/;

function flagValue(cmd, name) {
  if (Array.isArray(cmd)) {
    for (let i = 0; i < cmd.length; i++) {
      if (cmd[i] === `--${name}`) return i + 1 < cmd.length && !/^--/.test(cmd[i + 1]) ? cmd[i + 1] : null;
      if (cmd[i].startsWith(`--${name}=`)) return cmd[i].slice(name.length + 3);
    }
    return null;
  }
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`(?:^|\\s)--${esc}(?:=|\\s+)(?:"([^"]*)"|'([^']*)'|([^\\s"']+))`).exec(String(cmd || ""));
  if (!m) return null;
  const v = m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3];
  return /^--/.test(v) ? null : v;
}

function portOf(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : null;
}

function classifyServer(row) {
  if (!row || typeof row !== "object") return null;
  const pid = Number(row.pid);
  if (!Number.isInteger(pid) || pid <= 0) return null;
  const cmd = Array.isArray(row.cmd) ? row.cmd.filter((a) => typeof a === "string") : typeof row.cmd === "string" ? row.cmd : null;
  const text = Array.isArray(cmd) ? cmd.join(" ") : cmd || "";
  const exe = `${row.name || ""} ${Array.isArray(cmd) ? cmd[0] || "" : text.slice(0, 400)}`;
  if (!/language[_-]server/i.test(exe)) return null;
  const ports = Array.from(new Set((Array.isArray(row.ports) ? row.ports : []).map(portOf).filter(Boolean))).sort((a, b) => a - b);
  if (cmd === null || text.trim() === "") return { pid, token: "", ports, extPort: null, reason: "no_cmdline" };
  const appDir = flagValue(cmd, "app_data_dir");
  const ours = (appDir && /^antigravity/i.test(appDir)) || /[\\/]antigravity[\\/]/i.test(text);
  if (!ours) return null;
  const token = flagValue(cmd, "csrf_token");
  const serverPort = portOf(flagValue(cmd, "server_port"));
  const extPort = portOf(flagValue(cmd, "extension_server_port"));
  if (serverPort && !ports.includes(serverPort)) ports.unshift(serverPort);
  const ok = typeof token === "string" && TOKEN_RE.test(token);
  return { pid, token: ok ? token : "", ports, extPort, reason: ok ? "" : "no_token" };
}

const SCAN_SCRIPT = [
  "$ErrorActionPreference='SilentlyContinue'",
  "$ProgressPreference='SilentlyContinue'",
  "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8",
  "$r=@(Get-CimInstance Win32_Process -Filter \"Name LIKE 'language_server%'\" | ForEach-Object {" +
    " $p=@(Get-NetTCPConnection -OwningProcess $_.ProcessId -State Listen | Select-Object -ExpandProperty LocalPort | Sort-Object -Unique);" +
    " [pscustomobject]@{pid=[int]$_.ProcessId;name=[string]$_.Name;cmd=$_.CommandLine;ports=$p} })",
  "if($r.Count -eq 0){'[]'}else{ConvertTo-Json -InputObject $r -Compress -Depth 3}",
].join(";");

function parseProcessJson(stdout) {
  const text = String(stdout || "").replace(/^\uFEFF/, "").trim();
  if (!text) return [];
  let data;
  try { data = JSON.parse(text); } catch { throw new Error("unreadable process list"); }
  const rows = Array.isArray(data) ? data : [data];
  return rows.filter(isObj).map((r) => ({
    pid: Number(r.pid),
    name: typeof r.name === "string" ? r.name : "",
    cmd: typeof r.cmd === "string" ? r.cmd : null,
    ports: (Array.isArray(r.ports) ? r.ports : r.ports === null || r.ports === undefined ? [] : [r.ports]).map(Number).filter((n) => Number.isInteger(n)),
  }));
}

function powershellPath(env) {
  const root = env && typeof env.SystemRoot === "string" && /^[a-zA-Z]:[\\/]/.test(env.SystemRoot) ? env.SystemRoot.replace(/[\\/]+$/, "") : "C:\\Windows";
  return `${root}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
}

function listWindowsProcesses(run) {
  const exec = run || execFile;
  return new Promise((resolve, reject) => {
    let settled = false;
    let child = null;
    const done = (err, rows) => { if (settled) return; settled = true; clearTimeout(guard); err ? reject(err) : resolve(rows); };
    const guard = setTimeout(() => {
      try { if (child && typeof child.kill === "function") child.kill(); } catch {}
      done(new Error("process scan timed out"));
    }, SCAN_TIMEOUT_MS + 500);
    try {
      const encoded = Buffer.from(SCAN_SCRIPT, "utf16le").toString("base64");
      child = exec(
        powershellPath(process.env),
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
        { timeout: SCAN_TIMEOUT_MS, windowsHide: true, maxBuffer: 1024 * 1024, encoding: "utf8" },
        (err, stdout) => {
          if (err) { done(new Error("process scan failed")); return; }
          try { done(null, parseProcessJson(stdout)); } catch (e) { done(e); }
        }
      );
      try { if (child && child.stdin) child.stdin.end(); } catch {}
      if (child && typeof child.on === "function") child.on("error", () => done(new Error("process scan failed")));
    } catch {
      done(new Error("process scan failed"));
    }
  });
}

function loopbackRequest({ port, scheme, method, token, timeoutMs }) {
  return new Promise((resolve) => {
    const tls = scheme === "https";
    const agent = tls ? new https.Agent({ rejectUnauthorized: false, keepAlive: false, maxSockets: 1 }) : new http.Agent({ keepAlive: false, maxSockets: 1 });
    let settled = false;
    let req = null;
    const finish = (v) => {
      if (settled) return;
      settled = true;
      clearTimeout(hard);
      try { agent.destroy(); } catch {}
      resolve(v);
    };
    const limit = timeoutMs || REQUEST_TIMEOUT_MS;
    const hard = setTimeout(() => { try { if (req) req.destroy(); } catch {} finish({ error: "timeout" }); }, limit);
    const headers = {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(REQUEST_BODY),
      "Connect-Protocol-Version": "1",
    };
    if (token) headers["X-Codeium-Csrf-Token"] = token;
    try {
      req = (tls ? https : http).request(
        { host: "127.0.0.1", port, method: "POST", path: `${SERVICE}/${method}`, headers, agent, timeout: limit },
        (res) => {
          const chunks = [];
          let size = 0;
          res.on("data", (c) => {
            size += c.length;
            if (size > MAX_BODY) { try { req.destroy(); } catch {} finish({ status: res.statusCode || 0, body: null }); return; }
            chunks.push(c);
          });
          res.on("end", () => {
            let body = null;
            try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch {}
            finish({ status: res.statusCode || 0, body });
          });
          res.on("error", () => finish({ error: "network" }));
        }
      );
      req.on("timeout", () => { try { req.destroy(); } catch {} finish({ error: "timeout" }); });
      req.on("error", () => finish({ error: "network" }));
      req.end(REQUEST_BODY);
    } catch {
      finish({ error: "network" });
    }
  });
}

function candidateEndpoints(server) {
  const ports = server.ports.slice(0, MAX_PORTS);
  if (server.extPort && !ports.includes(server.extPort)) ports.push(server.extPort);
  const out = [];
  for (const port of ports) for (const scheme of ["https", "http"]) out.push({ port, scheme });
  return out;
}

async function readEndpoint(server, ep, request, t) {
  const call = (method) => request({ port: ep.port, scheme: ep.scheme, method, token: server.token, timeoutMs: REQUEST_TIMEOUT_MS });
  let summary = null;
  let flags = {};
  if (!ep.noSummary) {
    const r = await call(METHODS.summary);
    if (!r || r.error) return { net: true, timeout: !!r && r.error === "timeout" };
    if (r.status === 401 || r.status === 403) return { auth: true, http: r.status };
    if (r.status === 200) summary = parseSummary(r.body, t);
    else flags = { http: r.status, noSummary: r.status === 404 || r.status === 501 };
  }
  const s = await call(METHODS.status);
  let status = null;
  if (s && !s.error) {
    if (s.status === 200 && isObj(s.body) && isObj(s.body.userStatus)) status = parseUserStatus(s.body, t);
    else if (!hasData(summary)) {
      if (s.status === 401 || s.status === 403) return { auth: true, http: s.status };
      return { http: s.status || flags.http || 0 };
    }
  } else if (!hasData(summary)) {
    return { net: true, timeout: !!s && s.error === "timeout", http: flags.http };
  }
  const picked = hasData(summary) ? summary : hasData(status) ? status : null;
  if (!picked) return { empty: true };
  return {
    noSummary: !!flags.noSummary,
    data: {
      groups: picked.groups,
      perModel: picked === status,
      source: picked === summary ? "summary" : "status",
      plan: status ? status.plan : "",
      email: status ? status.email : "",
    },
  };
}

async function queryServer(server, opts) {
  const o = opts || {};
  const request = o.request || loopbackRequest;
  const t = typeof o.now === "number" ? o.now : Date.now();
  if (!server.token) return { ok: false, reason: server.reason || "no_token", tried: 0 };
  const all = candidateEndpoints(server);
  if (all.length === 0) return { ok: false, reason: "no_ports", tried: 0 };
  const known = server.endpoint;
  const order = known ? [known, ...all.filter((e) => !(e.port === known.port && e.scheme === known.scheme))] : all;
  const seen = { auth: false, timeout: false, empty: false, http: 0 };
  let tried = 0;
  for (const ep of order) {
    tried++;
    const r = await readEndpoint(server, ep, request, t);
    if (r.data) {
      server.endpoint = { port: ep.port, scheme: ep.scheme, noSummary: r.noSummary || !!ep.noSummary };
      return { ok: true, data: r.data, endpoint: { port: ep.port, scheme: ep.scheme }, tried };
    }
    if (r.auth) seen.auth = true;
    if (r.timeout) seen.timeout = true;
    if (r.empty) seen.empty = true;
    if (r.http && !r.auth) seen.http = r.http;
  }
  server.endpoint = null;
  const reason = seen.empty ? "no_quota" : seen.auth ? "unauthorized" : seen.http ? "bad_response" : seen.timeout ? "timeout" : "no_answer";
  return { ok: false, reason, http: seen.http || undefined, tried };
}

module.exports = {
  METHODS, REQUEST_BODY, SCAN_SCRIPT, flagValue, classifyServer, parseProcessJson, listWindowsProcesses,
  loopbackRequest, candidateEndpoints, queryServer,
};
