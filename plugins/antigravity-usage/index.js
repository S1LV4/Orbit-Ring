const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");
const quota = require("./quota");
const desktopLib = require("./desktop");
const cliLib = require("./cli");

let createLocator = null;
try { ({ createLocator } = require("./locations")); } catch { createLocator = null; }

const { statusFor, formatRemaining, formatAge } = quota;

const REFRESH_MS = 60_000;
const RESCAN_MS = 5 * 60_000;
const FORCE_SCAN_MIN_MS = 5_000;
const IDLE_SCAN_MIN_MS = 30_000;
const MAX_SERVERS = 4;
const STALE_SHOW_MS = 8 * 24 * 3600_000;
const REMEMBER_MS = 30 * 24 * 3600_000;
const CACHE_REWRITE_MS = 5 * 60_000;
const MAX_PINNABLE = 5;
const CACHE_FILE = ["plugin-data", "antigravity-usage.json"];
const CLI_MARKER = ".gemini/antigravity-cli";

const ACTIONS = {
  gemini: { kind: "gemini" },
  others: { kind: "others" },
  worst: { kind: null },
};
const GROUP_NAME = { gemini: "Gemini", others: "Claude e GPT" };
const MARK = (require("./manifest.json").actions.find((a) => a.keepIcon) || {}).icon;
const ACTION_TITLE = { gemini: "Gemini", others: "Claude e GPT", worst: "Uso" };

let host = null;
let timer = null;
let inflight = null;
let lastSnapshot = "";
let actionsSnapshot = "[]";

let deps = {};
let locator = null;
let cli = null;

let phase = "loading";
let desktop = { state: "unknown", reason: "", http: 0 };
let servers = [];
let lastScanAt = 0;
const wsl = new Map();
const accounts = new Map();
let cacheLoaded = false;
let cacheSnapshot = "";
let cacheSavedAt = 0;

const now = () => (deps.now ? deps.now() : Date.now());
const underJest = () => process.env.JEST_WORKER_ID !== undefined;
const platform = () => deps.platform || process.platform;

function listProcesses() {
  if (deps.listProcesses) return deps.listProcesses();
  if (underJest() || platform() !== "win32") return Promise.resolve([]);
  return desktopLib.listWindowsProcesses();
}

function makeLocator() {
  if (deps.locator) return deps.locator;
  if (underJest() || !createLocator) return { discover: async () => [], reset() {} };
  return createLocator({ markers: [CLI_MARKER] });
}

function makeCli() {
  const blocked = async () => ({ error: "network" });
  return cliLib.createCli({
    fsp: deps.fsp,
    now,
    env: deps.env || process.env,
    cloudFetch: deps.cloudFetch || (underJest() ? blocked : undefined),
    artifacts: deps.artifacts || (underJest() ? [] : undefined),
  });
}

function cacheFile() {
  if (deps.cacheFile !== undefined) return deps.cacheFile;
  if (process.env.ORBIT_HOME) return path.join(process.env.ORBIT_HOME, ...CACHE_FILE);
  if (underJest()) return null;
  return path.join(os.homedir(), ".orbit", ...CACHE_FILE);
}

const short = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");

function cleanBucket(b) {
  if (!quota.isObj(b)) return null;
  const out = {
    id: short(b.id, 40),
    window: short(b.window, 40) || "limite",
    used: typeof b.used === "number" && Number.isFinite(b.used) ? Math.max(0, Math.min(100, b.used)) : null,
    resetAt: typeof b.resetAt === "number" && Number.isFinite(b.resetAt) ? b.resetAt : null,
  };
  if (typeof b.model === "string" && b.model) out.model = b.model.slice(0, 40);
  return out;
}

function cleanAccount(a) {
  if (!quota.isObj(a) || typeof a.id !== "string" || !/^[0-9a-f]{8}$/.test(a.id)) return null;
  const groups = quota.isObj(a.groups) ? a.groups : {};
  const list = (k) => (Array.isArray(groups[k]) ? groups[k].map(cleanBucket).filter(Boolean).slice(0, 8) : []);
  return {
    id: a.id,
    plan: short(a.plan, 28),
    source: short(a.source, 16),
    perModel: a.perModel === true,
    at: typeof a.at === "number" && Number.isFinite(a.at) ? a.at : 0,
    locs: (Array.isArray(a.locs) ? a.locs : []).filter((l) => typeof l === "string").map((l) => l.slice(0, 140)).slice(0, 6),
    where: (Array.isArray(a.where) ? a.where : []).filter((l) => typeof l === "string").map((l) => l.slice(0, 40)).slice(0, 6),
    groups: { gemini: list("gemini"), others: list("others") },
  };
}

function loadCache() {
  if (cacheLoaded) return;
  cacheLoaded = true;
  const file = cacheFile();
  if (!file) return;
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const t = now();
    for (const raw of Array.isArray(data && data.accounts) ? data.accounts : []) {
      const a = cleanAccount(raw);
      if (!a || !a.at || t - a.at > REMEMBER_MS || accounts.has(a.id)) continue;
      accounts.set(a.id, { ...a, live: false });
    }
    cacheSavedAt = Number(data && data.savedAt) || 0;
    cacheSnapshot = JSON.stringify(persistable());
  } catch {}
}

const persistable = () => Array.from(accounts.values(), cleanAccount).filter(Boolean);

function saveCache() {
  const file = cacheFile();
  if (!file) return;
  const list = persistable();
  const snap = JSON.stringify(list);
  if (snap === cacheSnapshot) return;
  const core = (s) => s.replace(/"at":\d+/g, '"at":0');
  if (core(snap) === core(cacheSnapshot) && now() - cacheSavedAt < CACHE_REWRITE_MS) return;
  if (list.length === 0 && cacheSnapshot === "") return;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ version: 1, savedAt: now(), accounts: list }, null, 2));
    cacheSnapshot = snap;
    cacheSavedAt = now();
  } catch {}
}

const REASON_RANK = ["unauthorized", "no_quota", "bad_response", "timeout", "no_answer", "no_ports", "no_token", "no_cmdline"];

async function desktopCycle(force, t, add) {
  const ask = async () => {
    const results = [];
    for (const s of servers.slice(0, MAX_SERVERS)) {
      results.push(await desktopLib.queryServer(s, { request: deps.request, now: t }));
    }
    return results;
  };
  const scan = async () => {
    let rows;
    try { rows = await listProcesses(); } catch { rows = null; }
    lastScanAt = now();
    if (!Array.isArray(rows)) { servers = []; return false; }
    const found = rows.map(desktopLib.classifyServer).filter(Boolean);
    servers = found.map((s) => {
      const prev = servers.find((p) => p.pid === s.pid && p.token === s.token);
      return prev ? { ...s, endpoint: prev.endpoint } : s;
    });
    return true;
  };

  const since = t - lastScanAt;
  const usable = servers.some((s) => s.token);
  let scanned = false;
  let wantScan = !usable || since > RESCAN_MS || (force && since > FORCE_SCAN_MIN_MS);
  if (!usable && lastScanAt && since < (force ? FORCE_SCAN_MIN_MS : IDLE_SCAN_MIN_MS)) wantScan = false;
  if (wantScan) {
    scanned = true;
    if (!(await scan())) { desktop = { state: "scan_error", reason: "scan_error", http: 0 }; return; }
  }
  if (servers.length === 0) {
    if (scanned || desktop.state === "unknown") desktop = { state: platform() === "win32" || deps.listProcesses ? "closed" : "unsupported", reason: "", http: 0 };
    return;
  }
  let results = await ask();
  if (!results.some((r) => r.ok) && !scanned) {
    if (!(await scan())) { desktop = { state: "scan_error", reason: "scan_error", http: 0 }; return; }
    if (servers.length === 0) { desktop = { state: "closed", reason: "", http: 0 }; return; }
    results = await ask();
  }
  const good = results.filter((r) => r.ok);
  if (good.length === 0) {
    const worst = results.slice().sort((a, b) => REASON_RANK.indexOf(a.reason) - REASON_RANK.indexOf(b.reason))[0];
    desktop = { state: "error", reason: (worst && worst.reason) || "no_answer", http: (worst && worst.http) || 0 };
    return;
  }
  desktop = { state: "live", reason: "", http: 0 };
  for (const r of good) {
    const id = r.data.email ? cliLib.accountId(r.data.email) : cliLib.anonymousId("win");
    add(id, r.data, "win", "Windows", t, 0);
  }
}

async function cliCycle(loc, force, t, add, liveNow) {
  const isWsl = loc.kind === "wsl";
  const name = isWsl ? loc.short || "WSL" : loc.short || "Windows";
  const entry = { label: name, state: "idle", reason: "", cliRunning: false };
  const who = await cli.identity(loc);
  if (!isWsl && who.state !== "ok") { wsl.delete(loc.id); return; }
  wsl.set(loc.id, entry);

  let unreachable = false;
  if (isWsl) {
    const scan = await cli.scan(loc);
    entry.cliRunning = scan.cliRunning;
    for (const s of scan.servers.slice(0, 2)) {
      if (!s.token || (s.ports.length === 0 && !s.extPort)) { unreachable = true; continue; }
      const r = await desktopLib.queryServer(s, { request: deps.request, now: t });
      if (!r.ok) { unreachable = true; continue; }
      const id = r.data.email ? cliLib.accountId(r.data.email) : who.state === "ok" ? who.id : cliLib.anonymousId(loc.id);
      add(id, r.data, loc.id, name, t, 0);
      entry.state = "live";
    }
    if (scan.cliRunning && entry.state !== "live") unreachable = true;
  }

  if (who.state === "ok") {
    if (liveNow.has(who.id)) {
      add(who.id, null, loc.id, `${name} (CLI)`, t, 9);
      entry.state = "live";
      return;
    }
    const r = await cli.cloud(loc, { force, active: entry.cliRunning, identity: who });
    if (r.ok) {
      add(who.id, r.data, loc.id, `${name} (CLI)`, r.fetchedAt || t, 1);
      entry.state = "live";
      return;
    }
    entry.reason = r.reason;
  } else if (entry.state !== "live") {
    entry.reason = who.state === "malformed" ? "bad_token_file" : unreachable ? "unreachable" : "no_login";
  }
  if (entry.state !== "live" && unreachable && (entry.reason === "no_login" || entry.reason === "cloud_off")) entry.reason = "unreachable";
}

async function cycle(force) {
  const t = now();
  if (!locator) locator = makeLocator();
  if (!cli) cli = makeCli();
  const liveNow = new Map();
  const add = (id, data, locId, label, at, rank) => {
    const cur = liveNow.get(id);
    if (!cur) {
      if (data) liveNow.set(id, { data, rank, at, locs: [{ id: locId, label }] });
      return;
    }
    if (!cur.locs.some((l) => l.id === locId && l.label === label)) cur.locs.push({ id: locId, label });
    if (data && rank < cur.rank) { cur.data = { ...data, plan: data.plan || cur.data.plan }; cur.rank = rank; cur.at = at; }
    else if (data && !cur.data.plan && data.plan) cur.data = { ...cur.data, plan: data.plan };
  };

  await desktopCycle(force, t, add);

  let locations = [];
  try { locations = (await locator.discover(force)) || []; } catch { locations = []; }
  const seen = new Set();
  for (const loc of locations) {
    if (!loc || typeof loc.id !== "string" || typeof loc.home !== "string") continue;
    seen.add(loc.id);
    if (loc.stale) {
      if (loc.kind === "wsl") wsl.set(loc.id, { label: loc.short || "WSL", state: "stale", reason: "wsl_stopped", cliRunning: false });
      continue;
    }
    try { await cliCycle(loc, force, t, add, liveNow); } catch (e) {
      console.error("[antigravity] falha ao ler um local:", e && e.code ? e.code : "erro");
    }
  }
  for (const id of Array.from(wsl.keys())) if (!seen.has(id)) wsl.delete(id);

  for (const a of accounts.values()) a.live = false;
  for (const [id, v] of liveNow) {
    accounts.set(id, {
      id,
      plan: v.data.plan || "",
      source: v.data.source || "",
      perModel: !!v.data.perModel,
      groups: v.data.groups,
      at: v.at,
      locs: v.locs.map((l) => l.id).filter((x, i, arr) => arr.indexOf(x) === i),
      where: v.locs.map((l) => l.label).filter((x, i, arr) => arr.indexOf(x) === i),
      live: true,
    });
  }
  for (const [id, a] of accounts) if (!a.live && t - a.at > REMEMBER_MS) accounts.delete(id);
  saveCache();
  phase = "ready";
}

function refresh(force) {
  if (inflight) return inflight;
  inflight = (async () => {
    try { await cycle(!!force); } catch (e) {
      console.error("[antigravity] refresh error:", e && e.message ? String(e.message).slice(0, 80) : "erro");
      phase = "ready";
    } finally {
      inflight = null;
    }
    syncActions();
    notifyIfChanged();
  })();
  return inflight;
}

function syncActions() {
  const snap = JSON.stringify(buildActions());
  if (snap === actionsSnapshot) return;
  actionsSnapshot = snap;
  if (host && typeof host.actionsChanged === "function") {
    try { host.actionsChanged(); } catch {}
  }
}

function notifyIfChanged() {
  const snap = JSON.stringify(buildState());
  if (snap === lastSnapshot) return;
  lastSnapshot = snap;
  if (host && typeof host.stateChanged === "function") {
    try { host.stateChanged(); } catch {}
  }
}

function desktopReason(d) {
  switch (d.reason) {
    case "no_cmdline": return "sem acesso à linha de comando do servidor local";
    case "no_token": return "servidor local sem --csrf_token";
    case "no_ports": return "servidor local sem porta aberta (iniciando?)";
    case "unauthorized": return "token recusado pelo servidor local (401/403)";
    case "timeout": return "servidor local não respondeu a tempo";
    case "bad_response": return `resposta inesperada do servidor local${d.http ? ` (HTTP ${d.http})` : ""}`;
    case "no_quota": return "sem dados de cota · faça login no Antigravity";
    case "scan_error": return "não foi possível listar os processos";
    default: return "servidor local não respondeu";
  }
}

function cliReason(reason) {
  switch (reason) {
    case "wsl_stopped": return "WSL parado";
    case "expired": return "token expirado · abra o agy no WSL";
    case "unauthorized": return "login recusado · abra o agy no WSL";
    case "forbidden": return "acesso negado pela API de cota (403)";
    case "rate_limited": return "API de cota limitou as consultas (429)";
    case "no_quota": return "API sem dados de cota";
    case "bad_token_file": return "arquivo de login do agy ilegível";
    case "no_login": return "sem login do agy";
    case "cloud_off": return "CLI fechado · consulta à nuvem desativada";
    case "unreachable": return "CLI em execução · porta local inacessível";
    default: return "falha na API de cota";
  }
}

function staleNote(acc) {
  for (const id of acc.locs) {
    if (id === "win") {
      if (desktop.state === "scan_error") return "Antigravity · não foi possível listar os processos";
      if (desktop.state !== "live") return "Antigravity fechado";
      continue;
    }
    const w = wsl.get(id);
    if (!w) return /^wsl:/.test(id) ? "Antigravity · WSL parado" : "Antigravity · CLI fechado";
    if (w.state !== "live") return `Antigravity · ${cliReason(w.reason)}`;
  }
  return "Antigravity · sem dados novos";
}

function bucketsOf(acc, kind, t) {
  const list = (acc.groups && acc.groups[kind]) || [];
  return list.map((b) => (!acc.live && typeof b.resetAt === "number" && b.resetAt <= t && typeof b.used === "number"
    ? { ...b, used: 0, renewed: true } : b));
}

function worstBucket(buckets) {
  let best = null;
  for (const b of buckets) if (typeof b.used === "number" && (!best || b.used > best.used)) best = b;
  return best;
}

function groupMax(acc, kind, t) {
  const b = worstBucket(bucketsOf(acc, kind, t));
  return b ? b.used : null;
}

function accountMax(acc, kind, t) {
  if (kind) return groupMax(acc, kind, t);
  const g = groupMax(acc, "gemini", t), o = groupMax(acc, "others", t);
  return g === null ? o : o === null ? g : Math.max(g, o);
}

function bucketText(b, t, brief) {
  const pct = b.used === null ? "?" : b.renewed ? "renovado" : `${Math.round(b.used)}%`;
  const left = !b.renewed && typeof b.resetAt === "number" && b.resetAt > t ? formatRemaining(b.resetAt, t) : null;
  return `${b.window} ${pct}${left ? (brief ? ` (${left})` : ` (renova em ${left})`) : ""}`;
}

const groupText = (acc, kind, t, brief) => bucketsOf(acc, kind, t).map((b) => bucketText(b, t, brief)).join(" · ");
const whereOf = (acc) => acc.where.join(" + ") || "?";

function shownAccounts(t) {
  const blocked = (a) => !a.live && a.locs.length === 1 && a.locs[0] === "win" && desktop.state === "error";
  return Array.from(accounts.values()).filter((a) => (a.live || t - a.at < STALE_SHOW_MS) && !blocked(a));
}

function pickAccount(list, kind, t) {
  const usable = list.filter((a) => accountMax(a, kind, t) !== null);
  if (usable.length === 0) return null;
  return usable.slice().sort((a, b) => Number(b.live) - Number(a.live) || accountMax(b, kind, t) - accountMax(a, kind, t))[0];
}

function fallbackState() {
  if (phase === "loading") return { text: "…", label: "Antigravity · carregando uso…" };
  const cliPart = (() => {
    for (const w of wsl.values()) if (w.state !== "live" && w.reason && w.reason !== "no_login") return `CLI no ${w.label}: ${cliReason(w.reason)}`;
    return "";
  })();
  let label;
  if (desktop.state === "error" || desktop.state === "scan_error") label = `Antigravity · uso indisponível (${desktopReason(desktop)})`;
  else if (desktop.state === "unsupported") label = cliPart ? "Antigravity" : "Antigravity · disponível apenas no Windows";
  else label = "Antigravity fechado · abra para ver o uso";
  return { text: "–", label: cliPart ? `${label} · ${cliPart}` : label };
}

function accountState(acc, kind, t, extra) {
  const where = whereOf(acc);
  const plan = acc.plan ? ` · plano ${acc.plan}` : "";
  const tail = `${plan}${extra || ""}`;
  const brief = !acc.live;
  const head = acc.live ? `Antigravity · ${where}` : `${staleNote(acc)} · último valor ${formatAge(t - acc.at)} · ${where}`;
  const finish = (pct, label) => {
    const v = Math.max(0, Math.min(100, Math.round(pct)));
    const st = { value: v, text: `${v}%`, label };
    if (acc.live) st.status = statusFor(pct);
    return st;
  };

  if (kind) {
    const buckets = bucketsOf(acc, kind, t);
    const top = worstBucket(buckets);
    if (!top) return { text: "–", label: `${head} · ${GROUP_NAME[kind]} · sem dados de cota${tail}` };
    const perModel = acc.perModel ? ` · por modelo${top.model ? ` (${top.model})` : ""}` : "";
    return finish(top.used, `${head} · ${GROUP_NAME[kind]} · ${groupText(acc, kind, t, brief)}${perModel}${tail}`);
  }
  const tops = ["gemini", "others"].map((k) => ({ k, b: worstBucket(bucketsOf(acc, k, t)) })).filter((x) => x.b);
  if (tops.length === 0) return { text: "–", label: `${head} · sem dados de cota${tail}` };
  tops.sort((a, b) => b.b.used - a.b.used);
  const main = tops[0];
  const other = tops[1] ? ` · ${GROUP_NAME[tops[1].k]} ${Math.round(tops[1].b.used)}%` : "";
  const perModel = acc.perModel ? " · por modelo" : "";
  return finish(main.b.used, `${head} · ${GROUP_NAME[main.k]} ${bucketText(main.b, t, brief)}${other}${perModel}${tail}`);
}

function pinnable() {
  const list = Array.from(accounts.values());
  return list.length >= 2 ? list.slice(0, MAX_PINNABLE) : [];
}

function accountName(acc, list) {
  const base = whereOf(acc);
  const clash = list.some((o) => o !== acc && whereOf(o) === base);
  return clash ? `${base} (${acc.plan || `conta ${acc.id.slice(0, 4)}`})` : base;
}

function buildActions() {
  const list = pinnable();
  const defs = [];
  for (const acc of list) {
    const name = accountName(acc, list);
    for (const key of Object.keys(ACTIONS)) {
      defs.push({
        id: `${key}.${acc.id}`,
        name: `Antigravity · ${ACTION_TITLE[key]} · ${name}`,
        icon: MARK,
        keepIcon: true,
        stateful: true,
        description: `Cota do Antigravity (${ACTION_TITLE[key]}) da conta vista em ${name}.`,
      });
    }
  }
  return defs;
}

function buildState() {
  const t = now();
  const out = {};
  const shown = shownAccounts(t);
  for (const key of Object.keys(ACTIONS)) {
    const kind = ACTIONS[key].kind;
    if (shown.length === 0) { out[key] = fallbackState(); continue; }
    const acc = pickAccount(shown, kind, t) || shown.slice().sort((a, b) => Number(b.live) - Number(a.live))[0];
    const others = shown.length - 1;
    out[key] = accountState(acc, kind, t, others > 0 ? ` · +${others} conta${others > 1 ? "s" : ""}` : "");
  }
  for (const acc of pinnable()) {
    const visible = shown.includes(acc);
    for (const key of Object.keys(ACTIONS)) {
      out[`${key}.${acc.id}`] = visible
        ? accountState(acc, ACTIONS[key].kind, t, "")
        : { text: "–", label: `Antigravity · ${whereOf(acc)} · sem dados recentes` };
    }
  }
  return out;
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toastXml(title, message) {
  const lines = String(message).split("\n").filter((l) => l.trim());
  const texts = [title, lines[0], lines.slice(1, 5).join("\n")]
    .filter((x) => typeof x === "string" && x.length > 0)
    .map((x) => `<text>${escapeXml(x)}</text>`).join("");
  return `<toast><visual><binding template="ToastGeneric">${texts}</binding></visual></toast>`;
}

function showToast(title, message) {
  if (deps.showToast) { deps.showToast(title, message); return; }
  if (underJest()) return;
  if (process.platform !== "win32") { console.log(`[antigravity] ${title}: ${message}`); return; }
  const ps = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null
$xml = [Windows.Data.Xml.Dom.XmlDocument]::new()
$xml.LoadXml('${toastXml(title, message)}')
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('OrbitRing').Show([Windows.UI.Notifications.ToastNotification]::new($xml))`;
  const encoded = Buffer.from(ps, "utf16le").toString("base64");
  try {
    execFile("powershell", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], { timeout: 5000, windowsHide: true }, () => {});
  } catch {}
}

function accountLines(acc, t) {
  const head = `${whereOf(acc)}${acc.plan ? ` · plano ${acc.plan}` : ""}${acc.live ? "" : ` · ${staleNote(acc).replace(/^Antigravity · /, "")} · ${formatAge(t - acc.at)}`}`;
  const lines = [head];
  for (const kind of ["gemini", "others"]) {
    const text = groupText(acc, kind, t, true);
    if (text) lines.push(`${GROUP_NAME[kind]}: ${text}${acc.perModel ? " (por modelo)" : ""}`);
  }
  return lines;
}

function usageToast(only) {
  const t = now();
  const shown = only ? [only] : shownAccounts(t).sort((a, b) => Number(b.live) - Number(a.live) || (accountMax(b, null, t) || 0) - (accountMax(a, null, t) || 0));
  if (shown.length === 0) return fallbackState().label.replace(/^Antigravity · /, "");
  if (shown.length === 1) return accountLines(shown[0], t).join("\n");
  const lines = [`${shown.length} contas`];
  for (const acc of shown) {
    const [head, ...rest] = accountLines(acc, t);
    lines.push(`${head} — ${rest.join(" | ") || "sem dados de cota"}`);
  }
  return lines.join("\n");
}

function summary() {
  const t = now();
  return {
    desktop: desktop.state,
    accounts: shownAccounts(t).map((a) => ({
      id: a.id, where: a.where.slice(), plan: a.plan, live: a.live, perModel: a.perModel, source: a.source, at: a.at,
      gemini: bucketsOf(a, "gemini", t), others: bucketsOf(a, "others", t),
    })),
  };
}

module.exports = {
  onLoad(h) {
    host = h && typeof h === "object" ? h : null;
    console.log("[antigravity] Plugin loaded");
    loadCache();
    actionsSnapshot = JSON.stringify(buildActions());
    refresh(false);
    if (timer) clearInterval(timer);
    timer = setInterval(() => { refresh(false); }, REFRESH_MS);
    if (timer.unref) timer.unref();
  },

  onUnload() {
    if (timer) { clearInterval(timer); timer = null; }
    host = null;
    lastSnapshot = "";
    console.log("[antigravity] Plugin unloaded");
  },

  async onAction(actionId) {
    const id = String(actionId);
    const dyn = /^(gemini|others|worst)\.([0-9a-f]{8})$/.exec(id);
    if (!ACTIONS[id] && !dyn) return;
    await refresh(true);
    const only = dyn ? accounts.get(dyn[2]) : null;
    if (dyn && !only) {
      showToast("Antigravity · Uso", "Conta indisponível");
      return { available: false, reason: "account_unavailable" };
    }
    showToast("Antigravity · Uso", usageToast(only));
    return summary();
  },

  getState() {
    return buildState();
  },

  getActions() {
    return buildActions();
  },

  _internals: {
    escapeXml, toastXml, formatRemaining, formatAge, statusFor,
    quota, desktop: desktopLib, cli: cliLib,
  },

  __test: {
    configure(d) {
      deps = d || {};
      locator = null; cli = null;
      phase = "loading";
      desktop = { state: "unknown", reason: "", http: 0 };
      servers = []; lastScanAt = 0;
      wsl.clear(); accounts.clear();
      cacheLoaded = false; cacheSnapshot = ""; cacheSavedAt = 0;
      lastSnapshot = ""; actionsSnapshot = "[]";
    },
    refresh: (force) => refresh(force),
    loadCache,
    usageToast: () => usageToast(null),
    summary,
    sources: () => ({ desktop: { ...desktop }, servers: servers.length, locations: Array.from(wsl, ([id, w]) => ({ id, ...w })) }),
    cliStats: () => (cli ? { ...cli.stats } : null),
  },
};
