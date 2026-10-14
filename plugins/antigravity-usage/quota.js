const i18n = require("./i18n")(__dirname);
const HOUR = 3600_000;
const DAY = 24 * HOUR;

const isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v, max = 80) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : "");

function num(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function fractionOf(raw) {
  if (!isObj(raw)) {
    const n = num(raw);
    return n === null ? null : Math.max(0, Math.min(1, n));
  }
  if (typeof raw.case === "string") return raw.case === "remainingFraction" ? fractionOf(num(raw.value)) : null;
  for (const k of ["remainingFraction", "remaining_fraction"]) {
    if (raw[k] !== undefined && raw[k] !== null) return fractionOf(raw[k]);
  }
  return null;
}

function resetOf(v) {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v > 1e11 ? Math.round(v) : Math.round(v * 1000);
  if (typeof v === "string" && v.trim()) {
    const s = v.trim();
    if (/^\d+(\.\d+)?$/.test(s)) return resetOf(Number(s));
    const ms = Date.parse(s.replace(/(\.\d{3})\d+/, "$1"));
    return Number.isFinite(ms) ? ms : null;
  }
  if (isObj(v) && v.seconds !== undefined) {
    const sec = num(v.seconds);
    return sec !== null && sec > 0 ? Math.round(sec * 1000) : null;
  }
  return null;
}

const usedFrom = (fraction) => Math.round((1 - fraction) * 1000) / 10;

function windowName(id, displayName, resetAt, t) {
  const s = `${id || ""} ${displayName || ""}`.toLowerCase();
  if (/week|semana|(^|[^0-9])7 ?d(ay)?s?\b/.test(s)) return "week";
  if (/(^|[^0-9])5 ?h(ours?)?\b|5-hour|five[ -]?hour|session/.test(s)) return "5h";
  if (/dail|\bday\b|(^|[^0-9])24 ?h/.test(s)) return "day";
  if (/month/.test(s)) return "month";
  if (typeof resetAt === "number" && typeof t === "number") {
    const d = resetAt - t;
    if (d > 0 && d <= 5 * HOUR + 10 * 60_000) return "5h";
    if (d > DAY && d <= 7 * DAY + HOUR) return "week";
  }
  return "";
}

const WINDOW_ORDER = ["5h", "day", "week", "month"];
function sortBuckets(list) {
  const rank = (b) => { const i = WINDOW_ORDER.indexOf(b.window); return i < 0 ? 99 : i; };
  return list.slice().sort((a, b) => rank(a) - rank(b));
}

function groupKind(group) {
  const name = str(group.displayName || group.name).toLowerCase();
  if (/gemini/.test(name)) return "gemini";
  if (/claude|gpt|3p|third|anthropic|openai/.test(name)) return "others";
  const ids = (Array.isArray(group.buckets) ? group.buckets : []).map((b) => (isObj(b) ? str(b.bucketId || b.id).toLowerCase() : ""));
  if (ids.some((i) => /^gemini/.test(i))) return "gemini";
  return "others";
}

function emptyResult() {
  return { groups: { gemini: [], others: [] }, plan: "", perModel: false, email: "" };
}

const count = (r) => r.groups.gemini.length + r.groups.others.length;
const hasData = (r) => !!r && [...r.groups.gemini, ...r.groups.others].some((b) => typeof b.used === "number");

function parseSummary(body, t) {
  const out = emptyResult();
  let root = body;
  if (isObj(root) && isObj(root.response)) root = root.response;
  if (isObj(root) && isObj(root.summary)) root = root.summary;
  if (isObj(root) && isObj(root.command) && isObj(root.command.data)) root = root.command.data;
  if (!isObj(root) || !Array.isArray(root.groups)) return out;
  for (const group of root.groups) {
    if (!isObj(group) || !Array.isArray(group.buckets)) continue;
    const kind = groupKind(group);
    for (const b of group.buckets) {
      if (!isObj(b) || b.disabled === true) continue;
      const id = str(b.bucketId || b.id, 40);
      const display = str(b.displayName || b.window, 40);
      const direct = fractionOf({ remainingFraction: b.remainingFraction, remaining_fraction: b.remaining_fraction });
      const fraction = direct !== null ? direct : fractionOf(b.remaining);
      const rem = isObj(b.remaining) ? b.remaining : {};
      const resetAt = resetOf(b.resetTime ?? b.reset_time ?? rem.resetTime ?? rem.reset_time);
      if (!id && !display && fraction === null) continue;
      out.groups[kind].push({
        id,
        window: windowName(id, display, resetAt, t) || display || id || "limite",
        used: fraction === null ? null : usedFrom(fraction),
        resetAt,
      });
    }
  }
  out.groups.gemini = sortBuckets(out.groups.gemini);
  out.groups.others = sortBuckets(out.groups.others);
  return out;
}

function planOf(status) {
  const planStatus = isObj(status.planStatus) ? status.planStatus : {};
  const info = isObj(planStatus.planInfo) ? planStatus.planInfo : {};
  const tier = isObj(status.userTier) ? status.userTier : {};
  return str(tier.name, 28) || str(info.planDisplayName, 28) || str(info.displayName, 28) || str(info.planName, 28) || str(status.planName, 28);
}

function poolModels(rows, t) {
  const groups = { gemini: new Map(), others: new Map() };
  for (const r of rows) {
    const kind = /gemini/i.test(r.label) ? "gemini" : "others";
    const window = windowName("", "", r.resetAt, t) || "cota";
    const cur = groups[kind].get(window);
    if (!cur || r.used > cur.used) groups[kind].set(window, { id: "", window, used: r.used, resetAt: r.resetAt, model: r.label });
  }
  return { gemini: sortBuckets([...groups.gemini.values()]), others: sortBuckets([...groups.others.values()]) };
}

function parseUserStatus(body, t) {
  const out = emptyResult();
  const status = isObj(body) ? body.userStatus : null;
  if (!isObj(status)) return out;
  out.plan = planOf(status);
  out.email = typeof status.email === "string" ? status.email.trim().toLowerCase() : "";
  out.perModel = true;
  const data = isObj(status.cascadeModelConfigData) ? status.cascadeModelConfigData : {};
  const rows = [];
  for (const m of Array.isArray(data.clientModelConfigs) ? data.clientModelConfigs : []) {
    if (!isObj(m)) continue;
    const label = str(m.label, 40) || str(m.modelName, 40);
    const q = m.quotaInfo ?? m.quota_info;
    if (!label || !isObj(q)) continue;
    const resetAt = resetOf(q.resetTime ?? q.reset_time);
    let fraction = fractionOf(q);
    if (fraction === null) {
      if (resetAt === null || resetAt <= t) continue;
      fraction = 0;
    }
    rows.push({ label, used: usedFrom(fraction), resetAt });
  }
  out.groups = poolModels(rows, t);
  return out;
}

function parseModelBuckets(body, t) {
  const out = emptyResult();
  out.perModel = true;
  const rows = [];
  if (isObj(body) && Array.isArray(body.buckets)) {
    for (const b of body.buckets) {
      if (!isObj(b)) continue;
      const label = str(b.modelId, 40);
      const fraction = fractionOf(b.remainingFraction);
      if (!label || fraction === null) continue;
      rows.push({ label, used: usedFrom(fraction), resetAt: resetOf(b.resetTime) });
    }
  }
  out.groups = poolModels(rows, t);
  return out;
}

function statusFor(percent) {
  return percent > 85 ? "red" : percent >= 60 ? "amber" : "green";
}

function formatRemaining(resetAt, t) {
  if (typeof resetAt !== "number") return null;
  const mins = Math.max(0, Math.round((resetAt - t) / 60000));
  if (mins < 1) return "instantes";
  if (mins < 60) return `${mins}min`;
  if (mins < 24 * 60) return `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, "0")}`;
  const hours = Math.round(mins / 60);
  const d = Math.floor(hours / 24), h = hours % 24;
  return h ? `${d}d ${h}h` : `${d}d`;
}

function formatAge(ms) {
  const mins = Math.max(0, Math.floor(ms / 60000));
  if (mins < 1) return i18n.t("age.justNow");
  if (mins < 60) return i18n.t("age.minutes", { count: mins });
  if (mins < 48 * 60) return i18n.t("age.hours", { count: Math.floor(mins / 60) });
  return i18n.t("age.days", { count: Math.floor(mins / (24 * 60)) });
}

module.exports = {
  isObj, str, num, fractionOf, resetOf, usedFrom, windowName, sortBuckets, groupKind, hasData, count,
  parseSummary, parseUserStatus, parseModelBuckets, statusFor, formatRemaining, formatAge,
};
