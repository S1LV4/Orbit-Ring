const fs = require("fs");
const path = require("path");
const common = require("./common");
const { sha256, timed, statusFor, clampPct, formatRemaining, formatAge, formatWhen, formatNumber } = common;

let createLocator = null;
try { ({ createLocator } = require("./locations")); } catch { createLocator = null; }

const TAG = "codex-usage";
const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const REFRESH_MS = 60_000;
const LIVE_MIN_MS = 58_000;
const HTTP_TIMEOUT_MS = 5_000;
const FILE_TIMEOUT_MS = 3_000;
const LOCATION_TIMEOUT_MS = 12_000;
const TOKEN_MARGIN_MS = 30_000;
const FRESH_MS = 3 * 60_000;
const TAIL_BYTES = 256 * 1024;
const MAX_ROLLOUT_FILES = 8;
const MAX_DIRS = 40;
const MAX_PINNABLE = 8;
const ACCOUNTS_FILE = "codex-accounts.json";
const AUTH_CLAIM = "https://api.openai.com/auth";

const MARK = (require("./manifest.json").actions.find((a) => a.keepIcon) || {}).icon;
const TIERS = {
  session: { key: "primary", name: "Sessão", long: "Sessão (5h)", defaultMinutes: 300 },
  week: { key: "secondary", name: "Semana", long: "Semana", defaultMinutes: 10080 },
};

let host = null;
let timer = null;
let lastSnapshot = "";
let actionsSnapshot = "[]";
let inflight = null;

let deps = {};
let locator = null;
let locations = [];
let scanned = false;
const locState = new Map();
const authCache = new Map();
const rolloutCache = new Map();
const accounts = new Map();
const blocked = new Map();
let memory = null;

const now = () => (deps.now ? deps.now() : Date.now());
const fsp = () => deps.fsp || fs.promises;

function decodeJwt(token) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (!claims || typeof claims !== "object" || Array.isArray(claims)) return null;
    const exp = typeof claims.exp === "number" && Number.isFinite(claims.exp) ? claims.exp * 1000 : 0;
    return { exp, claims };
  } catch {
    return null;
  }
}

function tokenUsable(token, t) {
  const jwt = decodeJwt(token);
  return !!jwt && jwt.exp > 0 && jwt.exp - TOKEN_MARGIN_MS > t;
}

function planLabel(plan) {
  const p = String(plan || "").toLowerCase();
  if (!p || p === "unknown") return "";
  const known = {
    free: "Free", go: "Go", plus: "Plus", pro: "Pro", prolite: "Pro Lite", promax: "Pro Max",
    team: "Team", business: "Business", enterprise: "Enterprise", edu: "Edu", education: "Edu",
    edu_plus: "Edu Plus", edu_pro: "Edu Pro", free_workspace: "Free", guest: "Guest", ent26: "Enterprise",
  };
  if (known[p]) return known[p];
  if (p.includes("business")) return "Business";
  if (p.includes("enterprise")) return "Enterprise";
  return p.charAt(0).toUpperCase() + p.slice(1).replace(/_/g, " ");
}

async function readAuth(loc) {
  const file = path.join(loc.home, ".codex", "auth.json");
  let st;
  try {
    st = await timed(fsp().stat(file).then((s) => ({ ok: s }), (e) => ({ err: e })), FILE_TIMEOUT_MS);
  } catch { st = null; }
  if (!st) return null;
  if (st.err) return st.err.code === "ENOENT" ? { mode: "none" } : null;
  const sig = `${st.ok.size}:${st.ok.mtimeMs}`;
  const hit = authCache.get(file);
  if (hit && hit.sig === sig) return hit.value;

  const raw = await timed(fsp().readFile(file, "utf8"), FILE_TIMEOUT_MS);
  if (typeof raw !== "string") return null;
  let data;
  try { data = JSON.parse(raw); } catch { return null; }
  if (!data || typeof data !== "object") return null;

  const tokens = data.tokens && typeof data.tokens === "object" ? data.tokens : null;
  const access = tokens && typeof tokens.access_token === "string" ? tokens.access_token : "";
  const jwt = decodeJwt(access);
  const idJwt = tokens ? decodeJwt(tokens.id_token) : null;
  const claim = (j) => (j && j.claims[AUTH_CLAIM] && typeof j.claims[AUTH_CLAIM] === "object" ? j.claims[AUTH_CLAIM] : {});
  let accountId = tokens && typeof tokens.account_id === "string" ? tokens.account_id : "";
  if (!accountId) accountId = String(claim(jwt).chatgpt_account_id || claim(idJwt).chatgpt_account_id || "");

  let value;
  if (access || accountId) {
    value = {
      mode: "chatgpt",
      accountId,
      key: accountId ? `acct:${accountId}` : `loc:${loc.id}`,
      token: access,
      exp: jwt ? jwt.exp : 0,
      plan: planLabel(claim(idJwt).chatgpt_plan_type || claim(jwt).chatgpt_plan_type),
      mtimeMs: st.ok.mtimeMs,
    };
  } else if (typeof data.OPENAI_API_KEY === "string" && data.OPENAI_API_KEY.trim()) {
    value = { mode: "apikey" };
  } else {
    value = { mode: "none" };
  }
  authCache.set(file, { sig, value });
  return value;
}

function snapshotWindow(w, at) {
  if (!w || typeof w !== "object" || typeof w.used_percent !== "number" || !Number.isFinite(w.used_percent)) return null;
  let resetsAt;
  if (typeof w.resets_at === "number" && w.resets_at > 0) resetsAt = w.resets_at * 1000;
  else if (typeof w.resets_in_seconds === "number" && w.resets_in_seconds >= 0) resetsAt = at + w.resets_in_seconds * 1000;
  return {
    percent: w.used_percent,
    windowMinutes: typeof w.window_minutes === "number" && w.window_minutes > 0 ? w.window_minutes : null,
    resetsAt,
  };
}

function normalizeCredits(c) {
  if (!c || typeof c !== "object") return null;
  const unlimited = c.unlimited === true;
  const has = c.has_credits === true;
  if (!unlimited && !has) return null;
  return { unlimited, balance: c.balance == null ? null : String(c.balance) };
}

function parseRolloutTail(text, partial, fallbackAt) {
  const lines = String(text).split("\n");
  for (let i = lines.length - 1; i >= (partial ? 1 : 0); i--) {
    const line = lines[i];
    if (!line || line.indexOf('"rate_limits"') === -1) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    const rl = obj && typeof obj === "object"
      ? (obj.payload && typeof obj.payload === "object" && obj.payload.rate_limits) || obj.rate_limits
      : null;
    if (!rl || typeof rl !== "object") continue;
    if (typeof rl.limit_id === "string" && rl.limit_id && rl.limit_id !== "codex") continue;
    const ts = typeof obj.timestamp === "string" ? Date.parse(obj.timestamp) : NaN;
    const at = Number.isFinite(ts) ? ts : fallbackAt;
    const primary = snapshotWindow(rl.primary, at);
    const secondary = snapshotWindow(rl.secondary, at);
    if (!primary && !secondary) continue;
    return { source: "snapshot", at, plan: planLabel(rl.plan_type), primary, secondary, credits: normalizeCredits(rl.credits) };
  }
  return null;
}

async function readTail(file, size) {
  const length = Math.min(size, TAIL_BYTES);
  const start = size - length;
  let fh = null;
  try {
    fh = await fsp().open(file, "r");
    const buf = Buffer.alloc(length);
    const { bytesRead } = await fh.read(buf, 0, length, start);
    return { text: buf.toString("utf8", 0, bytesRead), partial: start > 0 };
  } finally {
    if (fh) { try { await fh.close(); } catch {} }
  }
}

const descending = (a, b) => (a < b ? 1 : a > b ? -1 : 0);

async function listRollouts(codexDir) {
  let budget = MAX_DIRS;
  const ls = async (dir) => {
    if (budget-- <= 0) return [];
    const names = await timed(fsp().readdir(dir), FILE_TIMEOUT_MS);
    return Array.isArray(names) ? names.filter((n) => typeof n === "string") : [];
  };
  const isRollout = (n) => /^rollout-.*\.jsonl$/.test(n);
  const found = [];
  const sessions = path.join(codexDir, "sessions");
  outer:
  for (const y of (await ls(sessions)).filter((n) => /^\d{4}$/.test(n)).sort(descending)) {
    for (const m of (await ls(path.join(sessions, y))).filter((n) => /^\d{2}$/.test(n)).sort(descending)) {
      for (const d of (await ls(path.join(sessions, y, m))).filter((n) => /^\d{2}$/.test(n)).sort(descending)) {
        const dir = path.join(sessions, y, m, d);
        for (const f of (await ls(dir)).filter(isRollout).sort(descending)) {
          found.push(path.join(dir, f));
          if (found.length >= MAX_ROLLOUT_FILES) break outer;
        }
        if (budget <= 0) break outer;
      }
    }
  }
  const archived = path.join(codexDir, "archived_sessions");
  for (const f of (await ls(archived)).filter(isRollout).sort(descending).slice(0, 4)) found.push(path.join(archived, f));
  return found;
}

async function readSnapshot(loc) {
  const files = await listRollouts(path.join(loc.home, ".codex"));
  const stats = (await Promise.all(files.map(async (file) => {
    const st = await timed(fsp().stat(file), FILE_TIMEOUT_MS);
    return st ? { file, size: st.size, mtimeMs: st.mtimeMs } : null;
  }))).filter(Boolean).sort((a, b) => b.mtimeMs - a.mtimeMs);

  let best = null;
  for (const f of stats) {
    if (best && best.at >= f.mtimeMs) break;
    const sig = `${f.size}:${f.mtimeMs}`;
    let entry = rolloutCache.get(f.file);
    if (!entry || entry.sig !== sig) {
      const tail = f.size > 0 ? await timed(readTail(f.file, f.size), FILE_TIMEOUT_MS) : { text: "", partial: false };
      if (!tail) continue;
      entry = { sig, snap: parseRolloutTail(tail.text, tail.partial, f.mtimeMs) };
      rolloutCache.set(f.file, entry);
    }
    if (entry.snap && (!best || entry.snap.at > best.at)) best = entry.snap;
  }
  const keep = new Set(files);
  for (const k of rolloutCache.keys()) if (k.startsWith(path.join(loc.home, ".codex")) && !keep.has(k)) rolloutCache.delete(k);
  return best;
}

function makeLocator() {
  if (deps.locator) return deps.locator;
  if (process.env.JEST_WORKER_ID !== undefined) return { discover: async () => [], reset() {} };
  if (createLocator) return createLocator({ markers: [".codex"] });
  const local = { id: "win", kind: "windows", home: require("os").homedir(), label: "Windows", short: "Windows", stale: false };
  return { discover: async () => [local], reset() {} };
}

function newAccount(key) {
  return {
    key,
    id: sha256(key.startsWith("acct:") ? key.slice(5) : key).slice(0, 8),
    plan: "",
    sources: [],
    live: null,
    liveError: "",
    lastCallAt: 0,
    inflight: null,
  };
}

async function scan(force) {
  if (!locator) locator = makeLocator();
  locations = (await locator.discover(force)) || [];
  const live = locations.filter((l) => !l.stale);

  await Promise.all(live.map(async (loc) => {
    const result = await timed((async () => {
      const [auth, snapshot] = await Promise.all([
        readAuth(loc).catch(() => null),
        readSnapshot(loc).then((s) => ({ s }), () => null),
      ]);
      return { auth, snapshot };
    })(), LOCATION_TIMEOUT_MS);
    if (!result) return;
    const prev = locState.get(loc.id) || { auth: null, snapshot: null };
    locState.set(loc.id, {
      auth: result.auth || prev.auth,
      snapshot: result.snapshot ? result.snapshot.s : prev.snapshot,
    });
  }));
  const knownIds = new Set(locations.map((l) => l.id));
  for (const id of locState.keys()) if (!knownIds.has(id)) locState.delete(id);

  for (const acc of accounts.values()) acc.sources = [];
  for (const loc of locations) {
    const st = locState.get(loc.id);
    const a = st && st.auth;
    if (!a || a.mode !== "chatgpt") continue;
    if (!accounts.has(a.key)) accounts.set(a.key, newAccount(a.key));
    const acc = accounts.get(a.key);
    acc.sources.push({ locId: loc.id, token: a.token, exp: a.exp, mtimeMs: a.mtimeMs, accountId: a.accountId });
    if (a.plan) acc.plan = a.plan;
  }
  for (const [key, acc] of accounts) if (acc.sources.length === 0) accounts.delete(key);
  scanned = true;
}

const locById = (id) => locations.find((l) => l.id === id);
const isStale = (acc) => acc.sources.length > 0 && acc.sources.every((s) => { const l = locById(s.locId); return !l || l.stale; });

function accountList() {
  const order = (acc) => Math.min(...acc.sources.map((s) => {
    const i = locations.findIndex((l) => l.id === s.locId);
    return i < 0 ? 999 : i;
  }));
  return Array.from(accounts.values()).sort((a, b) => order(a) - order(b) || a.id.localeCompare(b.id));
}

function locNames(acc) {
  const names = [];
  for (const l of locations) if (acc.sources.some((s) => s.locId === l.id) && !names.includes(l.short)) names.push(l.short);
  return names.join(" + ") || "?";
}

function apiKeyLocations() {
  return locations.filter((l) => { const st = locState.get(l.id); return st && st.auth && st.auth.mode === "apikey"; });
}

function liveWindow(w, t) {
  if (!w || typeof w !== "object" || typeof w.used_percent !== "number" || !Number.isFinite(w.used_percent)) return null;
  let resetsAt;
  if (typeof w.reset_at === "number" && w.reset_at > 0) resetsAt = w.reset_at * 1000;
  else if (typeof w.reset_after_seconds === "number" && w.reset_after_seconds >= 0) resetsAt = t + w.reset_after_seconds * 1000;
  const secs = typeof w.limit_window_seconds === "number" ? w.limit_window_seconds : 0;
  if (w.used_percent === 0 && secs > 0 && typeof w.reset_after_seconds === "number" && w.reset_after_seconds >= secs) resetsAt = undefined;
  return { percent: w.used_percent, windowMinutes: secs > 0 ? Math.floor((secs + 59) / 60) : null, resetsAt };
}

function mapLiveUsage(data, t) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  if (!("rate_limit" in data) && !("plan_type" in data)) return null;
  const rl = data.rate_limit && typeof data.rate_limit === "object" ? data.rate_limit : null;
  return {
    source: "live",
    at: t,
    plan: planLabel(data.plan_type),
    primary: rl ? liveWindow(rl.primary_window, t) : null,
    secondary: rl ? liveWindow(rl.secondary_window, t) : null,
    credits: normalizeCredits(data.credits),
  };
}

async function fetchLive(acc) {
  const t = now();
  if (acc.lastCallAt && t - acc.lastCallAt < LIVE_MIN_MS) return;
  for (const s of acc.sources) if (blocked.has(s.locId) && blocked.get(s.locId) !== s.mtimeMs) blocked.delete(s.locId);
  const usable = acc.sources
    .filter((s) => !blocked.has(s.locId) && tokenUsable(s.token, t))
    .sort((a, b) => b.exp - a.exp);
  if (usable.length === 0) {
    if (acc.sources.some((s) => blocked.has(s.locId))) acc.liveError = "unauthorized";
    else acc.liveError = "expired";
    return;
  }
  const src = usable[0];
  acc.lastCallAt = t;
  const headers = { Authorization: `Bearer ${src.token}`, "User-Agent": "codex-cli", Accept: "application/json", Connection: "close" };
  if (src.accountId) headers["ChatGPT-Account-Id"] = src.accountId;
  const http = deps.http || common.httpJson;
  let res;
  try { res = await http({ method: "GET", url: USAGE_URL, headers, timeoutMs: HTTP_TIMEOUT_MS }); }
  catch { res = { status: 0, data: null }; }
  const usage = res && res.status === 200 ? mapLiveUsage(res.data, now()) : null;
  if (usage) {
    acc.live = usage;
    acc.liveError = "";
  } else if (res && (res.status === 401 || res.status === 403)) {
    blocked.set(src.locId, src.mtimeMs);
    acc.liveError = "unauthorized";
  } else {
    acc.liveError = "api_error";
  }
}

function refreshAccount(acc) {
  if (acc.inflight) return acc.inflight;
  acc.inflight = fetchLive(acc)
    .catch((e) => { console.error(`[${TAG}] refresh error:`, e && e.message); })
    .finally(() => { acc.inflight = null; });
  return acc.inflight;
}

function usageOf(acc) {
  let best = acc.live;
  for (const s of acc.sources) {
    const st = locState.get(s.locId);
    const snap = st && st.snapshot;
    if (snap && (!best || snap.at > best.at)) best = { ...snap, locId: s.locId };
  }
  return best || null;
}

function refresh(force) {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      await scan(force);
      const list = accountList();
      if (memory) memory.update(list.filter((a) => a.key.startsWith("acct:")).map((a) => ({ id: a.id, name: locNames(a) })));
      syncActions();
      notifyIfChanged();
      await Promise.all(list.map((acc) => refreshAccount(acc)));
    } catch (e) {
      console.error(`[${TAG}] refresh error:`, e && e.message);
    } finally {
      inflight = null;
    }
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

const planOf = (acc, usage) => (usage && usage.plan) || acc.plan || "";

function accountName(acc, usage) {
  const plan = planOf(acc, usage);
  return `${locNames(acc)}${plan ? ` (${plan})` : ""}`;
}

const isFresh = (usage, t) => usage.source === "live" && t - usage.at < FRESH_MS;

function windowView(usage, tierId, t) {
  const tier = TIERS[tierId];
  const w = usage[tier.key];
  if (!w) return null;
  const age = t - usage.at;
  const windowMs = (w.windowMinutes || tier.defaultMinutes) * 60_000;
  const reset = typeof w.resetsAt === "number" && w.resetsAt <= t;
  return {
    percent: reset ? 0 : w.percent,
    resetsAt: reset ? undefined : w.resetsAt,
    reset,
    colored: isFresh(usage, t) || age <= windowMs,
  };
}

function windowText(name, view, usage, t) {
  let s = `${name} ${clampPct(view.percent)}%`;
  if (view.reset) return `${s} · sem uso desde ${formatWhen(usage.at, t)}`;
  const left = formatRemaining(view.resetsAt, t);
  if (left) s += ` · renova em ${left}`;
  if (!isFresh(usage, t)) s += ` · lido há ${formatAge(t - usage.at)}`;
  return s;
}

function noDataReason(acc) {
  if (acc.liveError === "api_error") return "falha na API de uso";
  return "abra o Codex para atualizar";
}

function accountTierState(acc, tierId, t) {
  const usage = usageOf(acc);
  const name = accountName(acc, usage);
  const tier = TIERS[tierId];
  const stale = isStale(acc) ? " · WSL parado" : "";
  if (!usage) {
    if (!acc.liveError) return { text: "…", label: `Codex · ${name} · carregando uso…` };
    return { text: "–", label: `Codex · ${name} · sem dados de uso (${noDataReason(acc)})${stale}` };
  }
  const view = windowView(usage, tierId, t);
  if (!view) return { text: "–", label: `Codex · ${name} · ${tier.name} sem limite informado${stale}` };
  const pct = clampPct(view.percent);
  const st = { value: pct, text: `${pct}%`, label: `Codex · ${name} · ${windowText(tier.name, view, usage, t)}${stale}` };
  if (view.colored) st.status = statusFor(view.percent);
  return st;
}

function tierPercent(acc, tierId, t) {
  const usage = usageOf(acc);
  const view = usage ? windowView(usage, tierId, t) : null;
  return view ? view.percent : -1;
}

function emptyState() {
  if (!scanned) return { text: "…", label: "Codex · carregando uso…" };
  if (apiKeyLocations().length > 0) return { text: "–", label: "Codex com chave de API · sem cota para mostrar" };
  return { text: "–", label: "Codex · não conectado (faça login com `codex`)" };
}

function pinnable() {
  const list = accountList();
  const out = list.slice(0, MAX_PINNABLE).map((acc) => ({ id: acc.id, name: locNames(acc), acc }));
  for (const r of memory ? memory.list() : []) {
    if (out.length >= MAX_PINNABLE) break;
    if (!out.some((o) => o.id === r.id)) out.push({ id: r.id, name: r.name, acc: null });
  }
  return out.length >= 2 ? out : [];
}

function buildActions() {
  const defs = [];
  for (const p of pinnable()) {
    for (const tierId of Object.keys(TIERS)) {
      const tier = TIERS[tierId];
      defs.push({
        id: `${tierId}.${p.id}`,
        name: `Codex · ${tier.name} · ${p.name}`,
        icon: MARK,
        keepIcon: true,
        stateful: true,
        description: `Uso ${tierId === "session" ? "da sessão de 5h" : "semanal"} da conta do Codex em ${p.name}.`,
      });
    }
  }
  return defs;
}

function buildState() {
  const t = now();
  const out = {};
  const list = accountList();
  for (const tierId of Object.keys(TIERS)) {
    if (list.length === 0) {
      out[tierId] = emptyState();
    } else if (list.length === 1) {
      out[tierId] = accountTierState(list[0], tierId, t);
    } else {
      const worst = list.reduce((m, a) => (tierPercent(a, tierId, t) > tierPercent(m, tierId, t) ? a : m), list[0]);
      const st = accountTierState(worst, tierId, t);
      const others = list.length - 1;
      st.label += ` · +${others} conta${others > 1 ? "s" : ""}`;
      out[tierId] = st;
    }
  }
  for (const p of pinnable()) {
    for (const tierId of Object.keys(TIERS)) {
      out[`${tierId}.${p.id}`] = p.acc
        ? accountTierState(p.acc, tierId, t)
        : { text: "–", label: `Codex · ${p.name} · conta indisponível` };
    }
  }
  return out;
}

function creditsText(usage) {
  const c = usage && usage.credits;
  if (!c) return "";
  if (c.unlimited) return "créditos ilimitados";
  const n = Number(c.balance);
  return c.balance != null && Number.isFinite(n) ? `créditos: ${formatNumber(n, 2)}` : "com créditos";
}

function sourceText(acc, usage, t) {
  if (isFresh(usage, t)) return "ao vivo";
  const loc = usage.locId ? locById(usage.locId) : null;
  const where = loc && acc.sources.length > 1 ? ` em ${loc.short}` : "";
  return `lido há ${formatAge(t - usage.at)}${where}`;
}

function accountDetail(acc) {
  const t = now();
  const usage = usageOf(acc);
  const stale = isStale(acc) ? " · WSL parado" : "";
  if (!usage) return `${accountName(acc, null)}\nSem dados de uso (${noDataReason(acc)})${stale}`;
  const line = (tierId) => {
    const tier = TIERS[tierId];
    const view = windowView(usage, tierId, t);
    if (!view) return `${tier.long}: sem limite informado`;
    if (view.reset) return `${tier.long}: 0% · sem uso desde ${formatWhen(usage.at, t)}`;
    const left = formatRemaining(view.resetsAt, t);
    return `${tier.long}: ${clampPct(view.percent)}%${left ? ` · renova em ${left}` : ""}`;
  };
  const plan = planOf(acc, usage);
  const tail = [locNames(acc), plan, sourceText(acc, usage, t), creditsText(usage)].filter(Boolean).join(" · ");
  return `${line("session")}\n${line("week")}\n${tail}${stale}`;
}

function accountLine(acc) {
  const t = now();
  const usage = usageOf(acc);
  const name = accountName(acc, usage);
  if (!usage) return `${name}: sem dados de uso (${noDataReason(acc)})`;
  const part = (tierId) => {
    const view = windowView(usage, tierId, t);
    if (!view) return `${TIERS[tierId].name} –`;
    const left = view.reset ? null : formatRemaining(view.resetsAt, t);
    return `${TIERS[tierId].name} ${clampPct(view.percent)}%${left ? ` (${left})` : ""}`;
  };
  const extra = [sourceText(acc, usage, t), creditsText(usage)].filter(Boolean).join(" · ");
  return `${name}: ${part("session")} · ${part("week")} · ${extra}${isStale(acc) ? " · WSL parado" : ""}`;
}

function usageToast(only) {
  if (only) return accountDetail(only);
  const list = accountList();
  const keys = apiKeyLocations().map((l) => `${l.short}: chave de API (sem cota para mostrar)`);
  if (list.length === 0) return emptyState().label.replace(/^Codex · /, "");
  if (list.length === 1) return [accountDetail(list[0]), ...keys].join("\n");
  return [...list.map(accountLine), ...keys].join("\n");
}

function toast(message) {
  if (deps.showToast) { deps.showToast("Codex · Uso", message); return; }
  common.showToast(TAG, "Codex · Uso", message);
}

module.exports = {
  onLoad(h) {
    host = h && typeof h === "object" ? h : null;
    console.log(`[${TAG}] Plugin loaded`);
    memory = common.createAccountMemory({
      file: ACCOUNTS_FILE, max: MAX_PINNABLE, now,
      orbitHome: () => (deps.orbitHome !== undefined ? deps.orbitHome : common.defaultOrbitHome()),
    });
    memory.load();
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
    console.log(`[${TAG}] Plugin unloaded`);
  },

  async onAction(actionId) {
    const dyn = /^(session|week)\.([0-9a-f]{8})$/.exec(String(actionId));
    if (!TIERS[actionId] && !dyn) return;
    await refresh(true);
    if (dyn) {
      const acc = accountList().find((a) => a.id === dyn[2]);
      if (!acc) {
        const known = (memory ? memory.list() : []).find((r) => r.id === dyn[2]);
        toast(`${known ? known.name : "Conta"}: conta indisponível`);
        return { available: false, reason: "account_unavailable" };
      }
      toast(usageToast(acc));
      return { available: !!usageOf(acc) };
    }
    toast(usageToast(null));
    return { available: accountList().some((a) => !!usageOf(a)) };
  },

  getState() {
    return buildState();
  },

  getActions() {
    return buildActions();
  },

  _internals: { decodeJwt, tokenUsable, planLabel, parseRolloutTail, mapLiveUsage, USAGE_URL, TAIL_BYTES },

  __test: {
    configure(d) {
      deps = d || {};
      locator = null; locations = []; scanned = false; inflight = null;
      locState.clear(); authCache.clear(); rolloutCache.clear(); accounts.clear(); blocked.clear();
      memory = null; lastSnapshot = ""; actionsSnapshot = "[]";
    },
    refresh: (force) => refresh(force),
    usageToast: () => usageToast(null),
    accounts: () => accountList().map((a) => {
      const u = usageOf(a);
      return { id: a.id, locations: a.sources.map((s) => s.locId), plan: planOf(a, u), source: u ? u.source : null, stale: isStale(a) };
    }),
  },
};
