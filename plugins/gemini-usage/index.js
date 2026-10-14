const fs = require("fs");
const path = require("path");
const common = require("./common");
const { sha256, timed, statusFor, clampPct, formatRemaining, formatAge } = common;

let createLocator = null;
try { ({ createLocator } = require("./locations")); } catch { createLocator = null; }

const TAG = "gemini-usage";
const CODE_ASSIST = "https://cloudcode-pa.googleapis.com/v1internal";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
// PUBLIC credentials, not a leak: this is the OAuth client of Google's open-source Gemini CLI,
// published in its repository (google-gemini/gemini-cli, packages/core/src/code_assist/oauth2.ts).
// For an "installed application" the client secret is not confidential:
// https://developers.google.com/identity/protocols/oauth2#installed
// It identifies the Gemini CLI app, not a user; no account can be reached with it alone.
const OAUTH_CLIENT_ID = "681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com";
const OAUTH_CLIENT_SECRET = "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";

const REFRESH_MS = 60_000;
const QUOTA_MIN_MS = 58_000;
const HTTP_TIMEOUT_MS = 5_000;
const FILE_TIMEOUT_MS = 3_000;
const LOCATION_TIMEOUT_MS = 10_000;
const TOKEN_MARGIN_MS = 60_000;
const FRESH_MS = 3 * 60_000;
const KEEP_STALE_MS = 15 * 60_000;
const MAX_PINNABLE = 5;
const ACCOUNTS_FILE = "gemini-accounts.json";
const API_AUTH_TYPES = new Set(["gemini-api-key", "vertex-ai"]);

const i18n = require("./i18n")(__dirname);
const GROUPS = {
  pro: { match: (id) => /pro/i.test(id) },
  flash: { match: (id) => /flash/i.test(id) },
  worst: { match: () => true },
};
const groupName = (id) => i18n.t(`groups.${id}`);
const MARK = (require("./manifest.json").actions.find((a) => a.keepIcon) || {}).icon;

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
const fileCache = new Map();
const accounts = new Map();
const refreshBlocked = new Map();
let memory = null;

const now = () => (deps.now ? deps.now() : Date.now());
const fsp = () => deps.fsp || fs.promises;
const env = () => deps.env || process.env;

async function readText(file) {
  const st = await timed(fsp().stat(file).then((s) => ({ ok: s }), (e) => ({ err: e })), FILE_TIMEOUT_MS);
  if (!st) return null;
  if (st.err) return st.err.code === "ENOENT" || st.err.code === "ENOTDIR" ? { missing: true } : null;
  const sig = `${st.ok.size}:${st.ok.mtimeMs}`;
  const hit = fileCache.get(file);
  if (hit && hit.sig === sig) return hit.value;
  const text = await timed(fsp().readFile(file, "utf8"), FILE_TIMEOUT_MS);
  if (typeof text !== "string") return null;
  const value = { text, mtimeMs: st.ok.mtimeMs, sig };
  fileCache.set(file, { sig, value });
  return value;
}

function parseJson(f) {
  if (!f || f.missing) return null;
  try { const v = JSON.parse(f.text); return v && typeof v === "object" ? v : null; } catch { return null; }
}

async function readLocation(loc) {
  const dir = path.join(loc.home, ".gemini");
  const [credsFile, accountsFile, settingsFile, envFile] = await Promise.all([
    readText(path.join(dir, "oauth_creds.json")),
    readText(path.join(dir, "google_accounts.json")),
    readText(path.join(dir, "settings.json")),
    readText(path.join(dir, ".env")),
  ]);
  if (!credsFile) return null;

  const settings = parseJson(settingsFile) || {};
  const auth = settings.security && settings.security.auth && typeof settings.security.auth === "object" ? settings.security.auth : {};
  const selectedType = String(auth.selectedType || settings.selectedAuthType || "");

  const keyInFile = !!(envFile && !envFile.missing && /^\s*(export\s+)?(GEMINI_API_KEY|GOOGLE_API_KEY)\s*=\s*\S/m.test(envFile.text));
  const e = env();
  const keyInEnv = loc.kind !== "wsl" && !!(e.GEMINI_API_KEY || e.GOOGLE_API_KEY);

  const creds = parseJson(credsFile);
  const access = creds && typeof creds.access_token === "string" ? creds.access_token : "";
  const refresh = creds && typeof creds.refresh_token === "string" ? creds.refresh_token : "";
  const hasLogin = !!(access || refresh);

  if (API_AUTH_TYPES.has(selectedType)) return { mode: "apikey" };
  if (!hasLogin) return { mode: keyInFile || keyInEnv ? "apikey" : "none" };

  const accountsData = parseJson(accountsFile);
  const active = accountsData && typeof accountsData.active === "string" ? accountsData.active.trim().toLowerCase() : "";
  const key = active ? `mail:${sha256(active)}` : refresh ? `rt:${sha256(refresh)}` : `loc:${loc.id}`;
  return {
    mode: "oauth",
    key,
    creds: {
      access,
      refresh,
      expiry: creds && typeof creds.expiry_date === "number" && Number.isFinite(creds.expiry_date) ? creds.expiry_date : 0,
      mtimeMs: credsFile.mtimeMs,
    },
  };
}

function makeLocator() {
  if (deps.locator) return deps.locator;
  if (process.env.JEST_WORKER_ID !== undefined) return { discover: async () => [], reset() {} };
  if (createLocator) return createLocator({ markers: [".gemini"] });
  const local = { id: "win", kind: "windows", home: require("os").homedir(), label: "Windows", short: "Windows", stale: false };
  return { discover: async () => [local], reset() {} };
}

function newAccount(key) {
  return {
    key,
    id: sha256(key).slice(0, 8),
    sources: [],
    mem: null,
    project: "",
    tier: "",
    usage: null,
    error: "",
    lastCallAt: 0,
    inflight: null,
  };
}

async function scan(force) {
  if (!locator) locator = makeLocator();
  locations = (await locator.discover(force)) || [];
  const live = locations.filter((l) => !l.stale);

  await Promise.all(live.map(async (loc) => {
    const result = await timed(readLocation(loc), LOCATION_TIMEOUT_MS);
    if (result) locState.set(loc.id, result);
  }));
  const knownIds = new Set(locations.map((l) => l.id));
  for (const id of locState.keys()) if (!knownIds.has(id)) locState.delete(id);

  for (const acc of accounts.values()) acc.sources = [];
  for (const loc of locations) {
    const st = locState.get(loc.id);
    if (!st || st.mode !== "oauth") continue;
    if (!accounts.has(st.key)) accounts.set(st.key, newAccount(st.key));
    accounts.get(st.key).sources.push({ locId: loc.id, ...st.creds });
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

function accountName(acc, list) {
  const base = locNames(acc);
  const same = list.filter((o) => locNames(o) === base);
  return same.length > 1 ? `${base} (conta ${same.indexOf(acc) + 1})` : base;
}

function apiKeyLocations() {
  return locations.filter((l) => { const st = locState.get(l.id); return st && st.mode === "apikey"; });
}

const http = (req) => {
  const fn = deps.http || common.httpJson;
  return Promise.resolve().then(() => fn({ timeoutMs: HTTP_TIMEOUT_MS, ...req })).catch(() => ({ status: 0, data: null }));
};

function parseFraction(v) {
  if (typeof v === "string" && v.trim() === "") return null;
  if (typeof v !== "number" && typeof v !== "string") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1, n));
}

function mapQuota(data, t) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const raw = Array.isArray(data.buckets) ? data.buckets : [];
  const buckets = [];
  let unknown = 0;
  for (const b of raw) {
    if (!b || typeof b !== "object" || typeof b.modelId !== "string" || !b.modelId) continue;
    const f = parseFraction(b.remainingFraction);
    if (f === null) { unknown++; continue; }
    const ms = typeof b.resetTime === "string" ? Date.parse(b.resetTime) : NaN;
    buckets.push({
      modelId: b.modelId,
      tokenType: typeof b.tokenType === "string" ? b.tokenType : "",
      used: 100 - f * 100,
      resetsAt: Number.isFinite(ms) ? ms : undefined,
    });
  }
  return { at: t, buckets, unknown };
}

function worstBucket(usage, groupId, t) {
  let best = null;
  for (const b of usage.buckets) {
    if (!GROUPS[groupId].match(b.modelId)) continue;
    const renewed = typeof b.resetsAt === "number" && b.resetsAt <= t;
    const view = renewed ? { ...b, used: 0, resetsAt: undefined, renewed: true } : b;
    if (!best || view.used > best.used) best = view;
  }
  return best;
}

async function refreshToken(acc) {
  for (const s of acc.sources) if (refreshBlocked.has(s.locId) && refreshBlocked.get(s.locId) !== s.mtimeMs) refreshBlocked.delete(s.locId);
  const candidates = acc.sources.filter((s) => s.refresh && !refreshBlocked.has(s.locId)).sort((a, b) => b.mtimeMs - a.mtimeMs);
  if (candidates.length === 0) return { error: "expired" };
  const src = candidates[0];
  const body = new URLSearchParams({
    client_id: OAUTH_CLIENT_ID,
    client_secret: OAUTH_CLIENT_SECRET,
    refresh_token: src.refresh,
    grant_type: "refresh_token",
  }).toString();
  const res = await http({
    method: "POST", url: TOKEN_URL, body,
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", Connection: "close" },
  });
  if (res.status === 200 && res.data && typeof res.data.access_token === "string" && res.data.access_token) {
    const secs = Number(res.data.expires_in);
    acc.mem = { token: res.data.access_token, expiry: now() + (Number.isFinite(secs) && secs > 0 ? secs : 3600) * 1000 };
    return { token: acc.mem.token, fromFile: false };
  }
  if (res.status === 400 || res.status === 401) {
    refreshBlocked.set(src.locId, src.mtimeMs);
    return { error: "expired" };
  }
  return { error: "api_error" };
}

async function getToken(acc) {
  const t = now();
  if (acc.mem && acc.mem.expiry - TOKEN_MARGIN_MS > t) return { token: acc.mem.token, fromFile: false };
  acc.mem = null;
  const stored = acc.sources.filter((s) => s.access && s.expiry - TOKEN_MARGIN_MS > t).sort((a, b) => b.expiry - a.expiry)[0];
  if (stored) return { token: stored.access, fromFile: true };
  return refreshToken(acc);
}

function codeAssist(method, token, body) {
  return http({
    method: "POST",
    url: `${CODE_ASSIST}:${method}`,
    body: JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "GeminiCLI/orbitring-plugin",
      Connection: "close",
    },
  });
}

async function fetchQuotaWith(acc, token) {
  if (!acc.project) {
    const e = env();
    const envProject = e.GOOGLE_CLOUD_PROJECT || e.GOOGLE_CLOUD_PROJECT_ID || undefined;
    const res = await codeAssist("loadCodeAssist", token, {
      cloudaicompanionProject: envProject,
      metadata: { ideType: "IDE_UNSPECIFIED", platform: "PLATFORM_UNSPECIFIED", pluginType: "GEMINI", duetProject: envProject },
    });
    if (res.status !== 200 || !res.data || typeof res.data !== "object") return { status: res.status };
    const p = res.data.cloudaicompanionProject;
    acc.project = (typeof p === "string" && p) || (p && typeof p === "object" && typeof p.id === "string" && p.id) || envProject || "";
    const tier = res.data.paidTier && res.data.paidTier.name ? res.data.paidTier : res.data.currentTier;
    acc.tier = tier && typeof tier.name === "string" ? tier.name.slice(0, 40) : "";
    if (!acc.project) return { status: 200, noProject: true };
  }
  const res = await codeAssist("retrieveUserQuota", token, { project: acc.project });
  const usage = res.status === 200 ? mapQuota(res.data, now()) : null;
  if (usage) return { usage };
  if (res.status === 403 || res.status === 404) acc.project = "";
  return { status: res.status };
}

async function fetchAccount(acc) {
  const t = now();
  if (acc.lastCallAt && t - acc.lastCallAt < QUOTA_MIN_MS) return;
  acc.lastCallAt = t;

  let tok = await getToken(acc);
  if (tok.error) { acc.error = tok.error; return; }
  let r = await fetchQuotaWith(acc, tok.token);
  if (r.status === 401) {
    acc.mem = null;
    tok = tok.fromFile ? await refreshToken(acc) : { error: "expired" };
    if (tok.error) { acc.error = tok.error; return; }
    r = await fetchQuotaWith(acc, tok.token);
  }
  if (r.usage) { acc.usage = r.usage; acc.error = ""; return; }
  acc.error = r.noProject ? "no_project" : r.status === 401 ? "expired" : "api_error";
}

function refreshAccount(acc) {
  if (acc.inflight) return acc.inflight;
  acc.inflight = fetchAccount(acc)
    .catch((e) => { console.error(`[${TAG}] refresh error:`, e && e.message); acc.error = acc.error || "api_error"; })
    .finally(() => { acc.inflight = null; });
  return acc.inflight;
}

function usageOf(acc, t) {
  if (!acc.usage) return null;
  if (!acc.error) return acc.usage;
  if (isStale(acc)) return acc.usage;
  if (acc.error === "api_error" && t - acc.usage.at < KEEP_STALE_MS) return acc.usage;
  return null;
}

function refresh(force) {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      await scan(force);
      const list = accountList();
      if (memory) memory.update(list.filter((a) => !a.key.startsWith("loc:")).map((a) => ({ id: a.id, name: accountName(a, list) })));
      syncActions();
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

function errorText(error) {
  if (error === "expired") return i18n.t("errors.expired");
  if (error === "no_project") return i18n.t("errors.noProject");
  return i18n.t("errors.api");
}

function bucketText(groupId, b, usage, t) {
  let s = i18n.t("bucket.usage", { group: groupName(groupId), percent: clampPct(b.used), model: b.modelId });
  if (b.renewed) return s + i18n.t("bucket.renewed");
  const left = formatRemaining(b.resetsAt, t);
  if (left) s += i18n.t("bucket.renews", { left });
  if (t - usage.at >= FRESH_MS) s += i18n.t("bucket.read", { age: formatAge(t - usage.at) });
  return s;
}

function accountGroupState(acc, groupId, list, t) {
  const name = accountName(acc, list);
  const stale = isStale(acc) ? i18n.t("staleWsl") : "";
  const usage = usageOf(acc, t);
  if (!usage) {
    if (!acc.error) return { text: "…", label: i18n.t("state.loading", { name }) };
    return { text: "–", label: i18n.t("state.error", { name, error: errorText(acc.error), stale }) };
  }
  const b = worstBucket(usage, groupId, t);
  if (!b) return { text: "–", label: i18n.t("state.noQuota", { name, group: groupName(groupId), stale }) };
  const pct = clampPct(b.used);
  return { value: pct, text: `${pct}%`, status: statusFor(b.used), label: i18n.t("state.usage", { name, bucket: bucketText(groupId, b, usage, t), stale }) };
}

function groupPercent(acc, groupId, t) {
  const usage = usageOf(acc, t);
  const b = usage ? worstBucket(usage, groupId, t) : null;
  return b ? b.used : -1;
}

function emptyState() {
  if (!scanned) return { text: "…", label: i18n.t("empty.loading") };
  if (apiKeyLocations().length > 0) return { text: "–", label: i18n.t("empty.apiKey") };
  return { text: "–", label: i18n.t("empty.notConnected") };
}

function pinnable() {
  const list = accountList();
  const out = list.slice(0, MAX_PINNABLE).map((acc) => ({ id: acc.id, name: accountName(acc, list), acc }));
  for (const r of memory ? memory.list() : []) {
    if (out.length >= MAX_PINNABLE) break;
    if (!out.some((o) => o.id === r.id)) out.push({ id: r.id, name: r.name, acc: null });
  }
  return out.length >= 2 ? out : [];
}

function buildActions() {
  const defs = [];
  for (const p of pinnable()) {
    for (const groupId of Object.keys(GROUPS)) {
      defs.push({
        id: `${groupId}.${p.id}`,
        name: i18n.t("dyn.name", { group: groupName(groupId), account: p.name }),
        icon: MARK,
        keepIcon: true,
        stateful: true,
        description: groupId === "worst"
          ? i18n.t("dyn.descWorst", { account: p.name })
          : i18n.t("dyn.descGroup", { group: groupName(groupId), account: p.name }),
      });
    }
  }
  return defs;
}

function buildState() {
  const t = now();
  const out = {};
  const list = accountList();
  for (const groupId of Object.keys(GROUPS)) {
    if (list.length === 0) {
      out[groupId] = emptyState();
    } else if (list.length === 1) {
      out[groupId] = accountGroupState(list[0], groupId, list, t);
    } else {
      const worst = list.reduce((m, a) => (groupPercent(a, groupId, t) > groupPercent(m, groupId, t) ? a : m), list[0]);
      const st = accountGroupState(worst, groupId, list, t);
      const others = list.length - 1;
      st.label += i18n.t("moreAccounts", { count: others });
      out[groupId] = st;
    }
  }
  for (const p of pinnable()) {
    for (const groupId of Object.keys(GROUPS)) {
      out[`${groupId}.${p.id}`] = p.acc
        ? accountGroupState(p.acc, groupId, list, t)
        : { text: "–", label: i18n.t("state.accountUnavailable", { name: p.name }) };
    }
  }
  return out;
}

function accountDetail(acc, list) {
  const t = now();
  const name = accountName(acc, list);
  const stale = isStale(acc) ? i18n.t("staleWsl") : "";
  const usage = usageOf(acc, t);
  if (!usage) return `${name}\n${acc.error ? errorText(acc.error) : i18n.t("detail.loading")}${stale}`;
  const line = (groupId) => {
    const b = worstBucket(usage, groupId, t);
    if (!b) return i18n.t("detail.noQuota", { group: groupName(groupId) });
    const left = b.renewed ? i18n.t("detail.renewed") : formatRemaining(b.resetsAt, t);
    const tail = left ? (b.renewed ? ` · ${left}` : i18n.t("detail.renews", { left })) : "";
    return i18n.t("detail.usage", { group: groupName(groupId), percent: clampPct(b.used), model: b.modelId, left: tail });
  };
  const when = t - usage.at < FRESH_MS ? i18n.t("detail.live") : i18n.t("detail.read", { age: formatAge(t - usage.at) });
  const tail = [name, acc.tier, when].filter(Boolean).join(" · ");
  return `${line("pro")}\n${line("flash")}\n${tail}${stale}`;
}

function accountLine(acc, list) {
  const t = now();
  const name = accountName(acc, list);
  const usage = usageOf(acc, t);
  if (!usage) return `${name}: ${acc.error ? errorText(acc.error) : i18n.t("detail.loading")}`;
  const part = (groupId) => {
    const b = worstBucket(usage, groupId, t);
    return `${groupName(groupId)} ${b ? `${clampPct(b.used)}%` : "–"}`;
  };
  return `${name}: ${part("pro")} · ${part("flash")}${isStale(acc) ? i18n.t("staleWsl") : ""}`;
}

function usageToast(only) {
  const list = accountList();
  if (only) return accountDetail(only, list);
  const keys = apiKeyLocations().map((l) => i18n.t("apiKeyLine", { place: l.short }));
  if (list.length === 0) return emptyState().label;
  if (list.length === 1) return [accountDetail(list[0], list), ...keys].join("\n");
  return [...list.map((a) => accountLine(a, list)), ...keys].join("\n");
}

function toast(message) {
  if (deps.showToast) { deps.showToast(i18n.t("toast.title"), message); return; }
  common.showToast(TAG, i18n.t("toast.title"), message);
}

module.exports = {
  onLoad(h) {
    host = h && typeof h === "object" ? h : null;
    if (host && host.locale) i18n.setLocale(host.locale);
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
    const dyn = /^(pro|flash|worst)\.([0-9a-f]{8})$/.exec(String(actionId));
    if (!GROUPS[actionId] && !dyn) return;
    await refresh(true);
    const t = now();
    if (dyn) {
      const acc = accountList().find((a) => a.id === dyn[2]);
      if (!acc) {
        const known = (memory ? memory.list() : []).find((r) => r.id === dyn[2]);
        toast(i18n.t("toast.accountUnavailable", { name: known ? known.name : i18n.t("toast.account") }));
        return { available: false, reason: "account_unavailable" };
      }
      toast(usageToast(acc));
      return { available: !!usageOf(acc, t) };
    }
    toast(usageToast(null));
    return { available: accountList().some((a) => !!usageOf(a, t)) };
  },

  onLocaleChanged(locale) {
    i18n.setLocale(locale);
    lastSnapshot = "";
    syncActions();
    if (host && typeof host.stateChanged === "function") host.stateChanged();
  },

  getState() {
    return buildState();
  },

  getActions() {
    return buildActions();
  },

  _internals: { parseFraction, mapQuota, CODE_ASSIST, TOKEN_URL },

  __test: {
    configure(d) {
      deps = d || {};
      locator = null; locations = []; scanned = false; inflight = null;
      locState.clear(); fileCache.clear(); accounts.clear(); refreshBlocked.clear();
      memory = null; lastSnapshot = ""; actionsSnapshot = "[]";
    },
    refresh: (force) => refresh(force),
    usageToast: () => usageToast(null),
    accounts: () => accountList().map((a) => ({
      id: a.id, locations: a.sources.map((s) => s.locId), error: a.error, hasUsage: !!a.usage, stale: isStale(a),
    })),
  },
};
