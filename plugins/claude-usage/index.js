const { createPermissionService } = require("./permission");
const https = require("https");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { exec } = require("child_process");

let createLocator = null;
try { ({ createLocator } = require("./locations")); } catch { createLocator = null; }

const REFRESH_MS = 60_000;
const FETCH_TTL_MS = 55_000;
const KEEP_STALE_MS = 15 * 60_000;
const FILE_TIMEOUT_MS = 3_000;
const MAX_PINNABLE = 8;
const REMEMBER_MS = 30 * 24 * 3600_000;
const ACCOUNTS_FILE = "claude-accounts.json";

const i18n = require("./i18n")(__dirname);
const ACTIONS = {
  show_usage: { tier: "session" },
  usage_gauge: { tier: "weekly" },
};
const DYNAMIC = {
  session: { tier: "session" },
  week: { tier: "weekly" },
};
const tierName = (tier) => i18n.t(`tiers.${tier}`);
const MARK = (require("./manifest.json").actions.find((a) => a.keepIcon) || {}).icon;

let host = null;
let timer = null;
let lastSnapshot = "";
let inflight = null;

let deps = {};
let locator = null;
let locations = [];
let scanned = false;
const accounts = new Map();
const identityCache = new Map();
let remembered = [];
let rememberedLoaded = false;
let actionsSnapshot = "[]";

let legacyUsage = null;
let legacyGood = null;
let legacyGoodAt = 0;

const PLUGIN_ID = "com.orbitring.claude-usage";
const ATTENTION_PREFIX = "claude-permission:";
let permissions = null;
let permissionsUp = false;
let attentionId = null;

const now = () => (deps.now ? deps.now() : Date.now());
const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");

function timed(promise, ms) {
  return new Promise((resolve) => {
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; resolve(null); } }, ms);
    Promise.resolve(promise).then(
      (v) => { if (!done) { done = true; clearTimeout(t); resolve(v); } },
      () => { if (!done) { done = true; clearTimeout(t); resolve(null); } }
    );
  });
}

function makeLocator() {
  if (deps.locator) return deps.locator;
  if (process.env.JEST_WORKER_ID !== undefined) return { discover: async () => [], reset() {} };
  if (createLocator) return createLocator({ markers: [".claude/.credentials.json", ".claude.json"] });
  const local = { id: "win", kind: "windows", home: os.homedir(), label: "Windows", short: "Windows", stale: false };
  return { discover: async () => [local], reset() {} };
}

async function readJson(file) {
  const raw = await timed(fs.promises.readFile(file, "utf8"), FILE_TIMEOUT_MS);
  if (typeof raw !== "string") return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function readIdentity(home) {
  const file = path.join(home, ".claude.json");
  const st = await timed(fs.promises.stat(file), FILE_TIMEOUT_MS);
  if (!st) return null;
  const sig = `${st.size}:${st.mtimeMs}`;
  const hit = identityCache.get(file);
  if (hit && hit.sig === sig) return hit.value;
  const data = await readJson(file);
  const a = data && typeof data === "object" ? data.oauthAccount : null;
  const value = a && typeof a === "object" && typeof a.accountUuid === "string" && a.accountUuid
    ? {
      uuid: a.accountUuid,
      org: typeof a.organizationUuid === "string" ? a.organizationUuid : "",
      email: typeof a.emailAddress === "string" ? a.emailAddress : "",
    }
    : null;
  if (data) identityCache.set(file, { sig, value });
  return value;
}

function planLabel(subscriptionType, rateLimitTier) {
  const tier = String(rateLimitTier || "").toLowerCase();
  const sub = String(subscriptionType || "").toLowerCase();
  const mult = /max_(\d+)x/.exec(tier);
  if (mult) return `Max ${mult[1]}x`;
  if (sub === "max" || /claude_max/.test(tier)) return "Max";
  if (sub === "pro" || /claude_pro|_pro$/.test(tier)) return "Pro";
  if (sub === "team") return "Team";
  if (sub === "enterprise") return "Enterprise";
  if (sub === "free") return "Free";
  return "";
}

async function readLocation(loc) {
  const data = await readJson(path.join(loc.home, ".claude", ".credentials.json"));
  if (!data || typeof data !== "object") return null;
  const oauth = data.claudeAiOauth && typeof data.claudeAiOauth === "object" ? data.claudeAiOauth : data;
  const token = oauth.accessToken || oauth.access_token;
  if (typeof token !== "string" || !token) return null;
  const identity = await readIdentity(loc.home);
  return {
    locId: loc.id,
    token,
    tokenHash: sha256(token),
    expiresAt: typeof oauth.expiresAt === "number" && Number.isFinite(oauth.expiresAt) ? oauth.expiresAt : 0,
    plan: planLabel(oauth.subscriptionType, oauth.rateLimitTier),
    identity,
  };
}

function newAccount(key) {
  return {
    key,
    id: sha256(key).slice(0, 8),
    email: "",
    plan: "",
    sources: [],
    usage: null, lastGood: null, lastGoodAt: 0, fetchedAt: 0, inflight: null,
  };
}

async function scan(force) {
  if (!locator) locator = makeLocator();
  locations = (await locator.discover(force)) || [];
  const live = locations.filter((l) => !l.stale);
  const liveIds = new Set(live.map((l) => l.id));
  const reads = (await Promise.all(live.map((l) => readLocation(l).catch(() => null)))).filter(Boolean);

  for (const acc of accounts.values()) acc.sources = acc.sources.filter((s) => !liveIds.has(s.locId));

  const byToken = () => {
    const m = new Map();
    for (const acc of accounts.values()) for (const s of acc.sources) m.set(s.tokenHash, acc);
    return m;
  };
  const attach = (acc, r) => {
    acc.sources.push({ locId: r.locId, token: r.token, tokenHash: r.tokenHash, expiresAt: r.expiresAt });
    if (r.identity && r.identity.email) acc.email = r.identity.email;
    if (r.plan) acc.plan = r.plan;
  };
  for (const r of reads.filter((x) => x.identity)) {
    const key = `${r.identity.uuid}/${r.identity.org}`;
    if (!accounts.has(key)) accounts.set(key, newAccount(key));
    attach(accounts.get(key), r);
  }
  for (const r of reads.filter((x) => !x.identity)) {
    let acc = byToken().get(r.tokenHash);
    if (!acc) {
      const key = `tok:${r.tokenHash}`;
      if (!accounts.has(key)) accounts.set(key, newAccount(key));
      acc = accounts.get(key);
    }
    attach(acc, r);
  }
  for (const [key, acc] of accounts) if (acc.sources.length === 0) accounts.delete(key);
  scanned = true;
}

const locById = (id) => locations.find((l) => l.id === id);
const isLocal = (locId) => { const l = locById(locId); return !!l && l.kind !== "wsl"; };
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

const emailLocal = (acc) => String(acc.email || "").split("@")[0].slice(0, 24);

function accountName(acc, list, withPlan) {
  const base = locNames(acc);
  const clash = list.some((o) => o !== acc && locNames(o) === base);
  const extra = [];
  if (clash) extra.push(emailLocal(acc) || i18n.t("accountId", { id: acc.id.slice(0, 4) }));
  if (withPlan && acc.plan) extra.push(acc.plan);
  return extra.length ? `${base} (${extra.join(", ")})` : base;
}

function orbitHome() {
  return process.env.ORBIT_HOME || path.join(os.homedir(), ".orbit");
}

function loadRemembered() {
  if (rememberedLoaded) return;
  rememberedLoaded = true;
  try {
    const data = JSON.parse(fs.readFileSync(path.join(orbitHome(), ACCOUNTS_FILE), "utf8"));
    const t = now();
    remembered = (Array.isArray(data && data.accounts) ? data.accounts : [])
      .filter((a) => a && /^[0-9a-f]{8}$/.test(a.id) && typeof a.name === "string" && t - Number(a.lastSeen || 0) < REMEMBER_MS)
      .map((a) => ({ id: a.id, name: a.name.slice(0, 60), lastSeen: Number(a.lastSeen) }))
      .slice(0, MAX_PINNABLE);
  } catch {
    remembered = [];
  }
}

function updateRemembered(list) {
  if (!scanned) return;
  const t = now();
  const before = JSON.stringify(remembered.map((r) => [r.id, r.name]));
  let touched = false;
  const next = [];
  for (const acc of list.slice(0, MAX_PINNABLE)) {
    if (acc.key.startsWith("tok:")) continue;
    const prev = remembered.find((r) => r.id === acc.id);
    const renew = !prev || t - prev.lastSeen > 24 * 3600_000;
    if (renew) touched = true;
    next.push({ id: acc.id, name: accountName(acc, list, false), lastSeen: renew ? t : prev.lastSeen });
  }
  for (const r of remembered) {
    if (next.length >= MAX_PINNABLE) break;
    if (!next.some((n) => n.id === r.id) && t - r.lastSeen < REMEMBER_MS) next.push(r);
  }
  remembered = next;
  if (!touched && JSON.stringify(next.map((r) => [r.id, r.name])) === before) return;
  if (next.length === 0 && before === "[]") return;
  try {
    fs.mkdirSync(orbitHome(), { recursive: true });
    fs.writeFileSync(path.join(orbitHome(), ACCOUNTS_FILE), JSON.stringify({ version: 1, accounts: next }, null, 2));
  } catch {}
}

function pinnable() {
  const list = accountList();
  const out = list.slice(0, MAX_PINNABLE).map((acc) => ({ id: acc.id, name: accountName(acc, list, false), acc }));
  for (const r of remembered) {
    if (out.length >= MAX_PINNABLE) break;
    if (!out.some((o) => o.id === r.id)) out.push({ id: r.id, name: r.name, acc: null });
  }
  return out.length >= 2 ? out : [];
}

function buildActions() {
  const defs = [];
  for (const p of pinnable()) {
    for (const kind of Object.keys(DYNAMIC)) {
      const d = DYNAMIC[kind];
      defs.push({
        id: `${kind}.${p.id}`,
        name: i18n.t("dyn.name", { tier: tierName(d.tier), account: p.name }),
        icon: MARK,
        keepIcon: true,
        stateful: true,
        description: i18n.t(kind === "session" ? "dyn.descSession" : "dyn.descWeek", { account: p.name }),
      });
    }
  }
  return defs;
}

function fetchUsageApi(token) {
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: "api.anthropic.com",
        path: "/api/oauth/usage",
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": "claude-code/1.0 orbitring-plugin",
          Accept: "application/json",
        },
        timeout: 10000,
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => { body += chunk.toString(); });
        res.on("end", () => {
          if (res.statusCode !== 200) { resolve({ status: res.statusCode || 0, data: null }); return; }
          try { resolve({ status: 200, data: JSON.parse(body) }); } catch { resolve({ status: 200, data: null }); }
        });
      }
    );
    req.on("error", () => resolve({ status: 0, data: null }));
    req.on("timeout", () => { req.destroy(); resolve({ status: 0, data: null }); });
    req.end();
  });
}

function unavailable(reason) {
  return { available: false, reason, session: { percent: 0 }, weekly: { percent: 0 } };
}

function apiTier(t) {
  const percent = t && typeof t.utilization === "number" ? t.utilization : 0;
  const ms = t && t.resets_at ? new Date(t.resets_at).getTime() : NaN;
  return { percent, resetsAt: Number.isFinite(ms) ? ms : undefined };
}

function normalizeTier(t) {
  const percent = t && typeof t.percent === "number" && Number.isFinite(t.percent) ? t.percent : 0;
  const resetsAt = t && typeof t.resetsAt === "number" && Number.isFinite(t.resetsAt) ? t.resetsAt : undefined;
  return { percent, resetsAt };
}

async function hostUsage() {
  if (!host || typeof host.getClaudeUsage !== "function") return null;
  try {
    const u = await host.getClaudeUsage();
    if (u && typeof u === "object") {
      return u.available
        ? { available: true, session: normalizeTier(u.session), weekly: normalizeTier(u.weekly) }
        : unavailable(u.reason || "api_error");
    }
  } catch (e) {
    console.error("[claude-usage] host.getClaudeUsage() failed, using own fetch:", e && e.message);
  }
  return null;
}

async function loadAccountUsage(acc) {
  const sources = acc.sources.slice();
  let skipLocal = false;
  if (sources.some((s) => isLocal(s.locId))) {
    const u = await hostUsage();
    if (u) {
      if (u.available || u.reason === "api_error") return u;
      if (u.reason === "unauthorized") {
        if (sources.every((s) => isLocal(s.locId))) return u;
        skipLocal = true;
      }
    }
  }
  const t = now();
  const fresh = (s) => (s.expiresAt === 0 || s.expiresAt > t ? 1 : 0);
  sources.sort((a, b) => fresh(b) - fresh(a) || b.expiresAt - a.expiresAt);
  const fetchUsage = deps.fetchUsage || fetchUsageApi;
  const tried = new Set();
  let reason = "unauthorized";
  for (const s of sources) {
    if ((skipLocal && isLocal(s.locId)) || tried.has(s.tokenHash)) continue;
    tried.add(s.tokenHash);
    let res;
    try { res = await fetchUsage(s.token); } catch { res = { status: 0, data: null }; }
    if (res && res.data && typeof res.data === "object") {
      return { available: true, session: apiTier(res.data.five_hour), weekly: apiTier(res.data.seven_day) };
    }
    if (res && (res.status === 401 || res.status === 403)) { reason = "unauthorized"; continue; }
    return unavailable("api_error");
  }
  return unavailable(reason);
}

function refreshAccount(acc, force) {
  if (acc.inflight) return acc.inflight;
  if (acc.fetchedAt && now() - acc.fetchedAt < (force ? 5000 : FETCH_TTL_MS)) return Promise.resolve();
  acc.inflight = (async () => {
    try {
      const next = await loadAccountUsage(acc);
      acc.fetchedAt = now();
      if (next.available) {
        acc.lastGood = next;
        acc.lastGoodAt = now();
        acc.usage = next;
      } else if (acc.lastGood && (isStale(acc) || (next.reason === "api_error" && now() - acc.lastGoodAt < KEEP_STALE_MS))) {
        acc.usage = acc.lastGood;
      } else {
        acc.usage = next;
      }
    } catch (e) {
      console.error("[claude-usage] refresh error:", e && e.message);
      if (!acc.usage) acc.usage = unavailable("api_error");
    } finally {
      acc.inflight = null;
    }
  })();
  return acc.inflight;
}

async function refreshLegacy() {
  const next = (await hostUsage()) || unavailable("no_credentials");
  if (next.available) {
    legacyGood = next;
    legacyGoodAt = now();
    legacyUsage = next;
  } else if (next.reason === "api_error" && legacyGood && now() - legacyGoodAt < KEEP_STALE_MS) {
    legacyUsage = legacyGood;
  } else {
    legacyUsage = next;
  }
}

function refresh(force) {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      await scan(force);
      const list = accountList();
      updateRemembered(list);
      syncActions();
      if (list.length === 0) await refreshLegacy();
      else await Promise.all(list.map((acc) => refreshAccount(acc, force)));
    } catch (e) {
      console.error("[claude-usage] refresh error:", e && e.message);
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

function statusFor(percent) {
  return percent > 85 ? "red" : percent >= 60 ? "amber" : "green";
}

function formatRemaining(resetsAt, t) {
  if (typeof resetsAt !== "number") return null;
  const mins = Math.max(0, Math.round((resetsAt - t) / 60000));
  if (mins < 1) return i18n.t("moments");
  if (mins < 60) return `${mins}min`;
  if (mins < 24 * 60) return `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, "0")}`;
  const hours = Math.round(mins / 60);
  const d = Math.floor(hours / 24), h = hours % 24;
  return h ? `${d}d ${h}h` : `${d}d`;
}

function reasonText(reason) {
  if (reason === "no_credentials") return i18n.t("reasons.noCredentials");
  if (reason === "unauthorized") return i18n.t("reasons.unauthorized");
  return i18n.t("reasons.api");
}

function unavailableLabel(reason) {
  return i18n.t("state.unavailable", { reason: reasonText(reason) });
}

function tierSummary(name, tier, t) {
  const pct = Math.round(tier.percent);
  const left = formatRemaining(tier.resetsAt, t);
  return i18n.t("summary.usage", { tier: name, percent: pct, left: left ? i18n.t("summary.renews", { left }) : "" });
}

function gauge(tier, label) {
  const pct = Math.max(0, Math.min(100, Math.round(tier.percent)));
  return { value: pct, text: `${pct}%`, status: statusFor(tier.percent), label };
}

const staleNote = (acc) => (acc && isStale(acc) ? i18n.t("staleWsl") : "");

function accountTierState(acc, usage, tier, tierLabel, name, t) {
  const who = name ? `${name} · ` : "";
  if (!usage) return { text: "…", label: i18n.t("state.loading", { who }) };
  if (!usage.available) {
    return { text: "–", label: name ? i18n.t("state.unavailableFor", { who, reason: reasonText(usage.reason) }) : unavailableLabel(usage.reason) };
  }
  return gauge(usage[tier], i18n.t("state.usage", { who, summary: tierSummary(tierLabel, usage[tier], t), stale: staleNote(acc) }));
}

function buildState() {
  const t = now();
  const out = {};
  const list = accountList();
  for (const id of Object.keys(ACTIONS)) {
    const { tier } = ACTIONS[id];
    const name = tierName(tier);
    if (list.length === 0) {
      out[id] = accountTierState(null, legacyUsage, tier, name, "", t);
    } else if (list.length === 1) {
      out[id] = accountTierState(list[0], list[0].usage, tier, name, "", t);
    } else {
      const ready = list.filter((a) => a.usage && a.usage.available);
      if (ready.length === 0) {
        const failed = list.find((a) => a.usage);
        out[id] = failed
          ? { text: "–", label: unavailableLabel(failed.usage.reason) }
          : { text: "…", label: i18n.t("state.loading", { who: "" }) };
      } else {
        const worst = ready.reduce((m, a) => (a.usage[tier].percent > m.usage[tier].percent ? a : m), ready[0]);
        const others = list.length - 1;
        const st = accountTierState(worst, worst.usage, tier, name, accountName(worst, list, true), t);
        st.label += i18n.t("moreAccounts", { count: others });
        out[id] = st;
      }
    }
  }
  for (const p of pinnable()) {
    for (const kind of Object.keys(DYNAMIC)) {
      const d = DYNAMIC[kind];
      out[`${kind}.${p.id}`] = p.acc
        ? accountTierState(p.acc, p.acc.usage, d.tier, tierName(d.tier), accountName(p.acc, list, true), t)
        : { text: "–", label: i18n.t("state.accountUnavailable", { name: p.name }) };
    }
  }
  Object.assign(out, buildApprovalState());
  return out;
}

function buildApprovalState() {
  const pending = permissions ? permissions.pending() : [];
  if (pending.length === 0) {
    const label = permissions && !permissionsUp
      ? i18n.t("approvals.portBusy")
      : i18n.t("approvals.nothing");
    return { approve: { active: false, label }, decline: { active: false, label } };
  }
  const summary = pending[0].summary;
  return {
    approve: {
      active: true,
      status: "amber",
      text: pending.length > 1 ? String(pending.length) : undefined,
      label: i18n.t("approvals.approve", { summary }),
    },
    decline: { active: true, status: "red", label: i18n.t("approvals.decline", { summary }) },
  };
}

function syncAttention() {
  const oldest = permissions ? permissions.pending()[0] : null;
  const nextId = oldest ? ATTENTION_PREFIX + oldest.id : null;
  if (nextId === attentionId) return;
  const prevId = attentionId;
  attentionId = nextId;
  if (!host || typeof host.attention !== "function") return;
  try {
    if (prevId) {
      if (typeof host.clearAttention === "function") host.clearAttention(prevId);
      else host.attention(null);
    }
    if (oldest) {
      host.attention({
        id: nextId,
        title: i18n.t("approvals.attentionTitle"),
        text: oldest.summary,
        pluginId: PLUGIN_ID,
        actionIds: ["approve", "decline"],
        timeoutMs: permissions.timeoutMs + 5000,
      });
    }
  } catch (e) {
    console.error("[claude-code] host.attention() failed:", e && e.message);
  }
}

function onPermissionsChanged() {
  syncAttention();
  notifyIfChanged();
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
    .filter((t) => typeof t === "string" && t.length > 0)
    .map((t) => `<text>${escapeXml(t)}</text>`).join("");
  return `<toast><visual><binding template="ToastGeneric">${texts}</binding></visual></toast>`;
}

function showToast(title, message) {
  if (deps.showToast) { deps.showToast(title, message); return; }
  if (process.platform !== "win32") {
    console.log(`[claude-usage] ${title}: ${message}`);
    return;
  }
  if (process.env.JEST_WORKER_ID !== undefined) return;
  const ps = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null
$xml = [Windows.Data.Xml.Dom.XmlDocument]::new()
$xml.LoadXml('${toastXml(title, message)}')
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('OrbitRing').Show([Windows.UI.Notifications.ToastNotification]::new($xml))`;
  const encoded = Buffer.from(ps, "utf16le").toString("base64");
  exec(`powershell -NoProfile -EncodedCommand ${encoded}`, { timeout: 5000, windowsHide: true }, () => {});
}

function toastMessage(u) {
  if (!u || !u.available) return unavailableLabel(u && u.reason).replace(/^Claude · /, "");
  const t = now();
  return `${tierSummary(i18n.t("tiers.sessionLong"), u.session, t)}\n${tierSummary(i18n.t("tiers.weeklyLong"), u.weekly, t)}`;
}

function accountLine(acc, list) {
  const name = accountName(acc, list, true);
  const u = acc.usage;
  if (!u || !u.available) return i18n.t("line.unavailable", { name, reason: reasonText(u && u.reason) });
  const t = now();
  const part = (label, tier) => {
    const left = formatRemaining(tier.resetsAt, t);
    return i18n.t("line.part", { tier: label, percent: Math.round(tier.percent), left: left ? ` (${left})` : "" });
  };
  return `${name}: ${part(tierName("session"), u.session)} · ${part(tierName("weekly"), u.weekly)}${staleNote(acc)}`;
}

function usageToast(only) {
  const list = accountList();
  if (only) return `${accountName(only, list, true)}\n${toastMessage(only.usage)}`;
  if (list.length === 0) return toastMessage(legacyUsage);
  if (list.length === 1) {
    const where = locNames(list[0]);
    const body = toastMessage(list[0].usage);
    return list[0].sources.length > 1 || where !== "Windows" ? `${body}\n${where}${list[0].plan ? ` · ${list[0].plan}` : ""}` : body;
  }
  return list.map((acc) => accountLine(acc, list)).join("\n");
}

module.exports = {
  async onLoad(h) {
    host = h && typeof h === "object" ? h : null;
    if (host && host.locale) i18n.setLocale(host.locale);
    console.log("[claude-usage] Plugin loaded");
    loadRemembered();
    actionsSnapshot = JSON.stringify(buildActions());
    refresh(false);
    if (timer) clearInterval(timer);
    timer = setInterval(() => { refresh(false); }, REFRESH_MS);
    if (timer.unref) timer.unref();

    if (permissions) await permissions.stop();
    permissions = createPermissionService({ env: process.env, onChange: onPermissionsChanged });
    permissionsUp = await permissions.start();
    notifyIfChanged();
  },

  async onUnload() {
    if (timer) { clearInterval(timer); timer = null; }
    const p = permissions;
    if (p) {
      await p.stop();
      permissions = null;
      permissionsUp = false;
      syncAttention();
    }
    host = null;
    lastSnapshot = "";
    console.log("[claude-usage] Plugin unloaded");
  },

  async onAction(actionId) {
    if (actionId === "approve" || actionId === "decline") {
      if (!permissions) return { handled: false };
      const result = actionId === "approve" ? permissions.approve() : permissions.decline();
      if (!result.handled) console.log(`[claude-code] ${actionId}: nenhum pedido pendente`);
      return result;
    }
    const dyn = /^(session|week)\.([0-9a-f]{8})$/.exec(String(actionId));
    if (!ACTIONS[actionId] && !dyn) return;
    await refresh(true);
    if (dyn) {
      const acc = accountList().find((a) => a.id === dyn[2]);
      if (!acc) {
        const known = remembered.find((r) => r.id === dyn[2]);
        showToast(i18n.t("toast.title"), i18n.t("toast.accountUnavailable", { name: known ? known.name : i18n.t("toast.account") }));
        return { available: false, reason: "account_unavailable" };
      }
      showToast(i18n.t("toast.title"), usageToast(acc));
      return acc.usage;
    }
    showToast(i18n.t("toast.title"), usageToast(null));
    const list = accountList();
    return list.length === 0 ? legacyUsage : list.length === 1 ? list[0].usage : list.map((a) => a.usage);
  },

  onLocaleChanged(locale) {
    i18n.setLocale(locale);
    lastSnapshot = "";
    syncActions();
    syncAttention();
    if (host && typeof host.stateChanged === "function") host.stateChanged();
  },

  getState() {
    return buildState();
  },

  getActions() {
    return buildActions();
  },

  _internals: {
    formatRemaining, statusFor, escapeXml, toastMessage, toastXml, planLabel,
    getPermissionPort: () => (permissions ? permissions.getPort() : 0),
    getPendingPermissions: () => (permissions ? permissions.pending() : []),
  },

  __test: {
    configure(d) { deps = d || {}; locator = null; },
    refresh: (force) => refresh(force),
    usageToast: () => usageToast(null),
    accounts: () => accountList().map((a) => ({ id: a.id, locations: a.sources.map((s) => s.locId), plan: a.plan, stale: isStale(a) })),
  },
};
