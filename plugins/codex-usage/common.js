const nodeFs = require("fs");
const nodeOs = require("os");
const nodePath = require("path");
const nodeHttps = require("https");
const nodeCrypto = require("crypto");
const { exec } = require("child_process");

const sha256 = (s) => nodeCrypto.createHash("sha256").update(String(s)).digest("hex");

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

const i18n = require("./i18n")(__dirname);

function statusFor(percent) {
  return percent > 85 ? "red" : percent >= 60 ? "amber" : "green";
}

const clampPct = (p) => Math.max(0, Math.min(100, Math.round(p)));

function formatRemaining(resetsAt, t) {
  if (typeof resetsAt !== "number" || !Number.isFinite(resetsAt)) return null;
  const mins = Math.max(0, Math.round((resetsAt - t) / 60000));
  if (mins < 1) return i18n.t("common.moments");
  if (mins < 60) return `${mins}min`;
  if (mins < 24 * 60) return `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, "0")}`;
  const hours = Math.round(mins / 60);
  const d = Math.floor(hours / 24), h = hours % 24;
  return h ? `${d}d ${h}h` : `${d}d`;
}

function formatAge(ms) {
  const mins = Math.max(0, Math.floor(ms / 60000));
  if (mins < 1) return i18n.t("common.moments");
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return i18n.t("common.days", { count: days });
}

function formatWhen(ms, t) {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "?";
  const p2 = (n) => String(n).padStart(2, "0");
  const date = i18n.t("common.date", { day: p2(d.getDate()), month: p2(d.getMonth() + 1) });
  const sameYear = d.getFullYear() === new Date(t).getFullYear();
  return `${date}${sameYear ? "" : `/${d.getFullYear()}`} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

function formatNumber(n, digits) {
  try { return Number(n).toLocaleString(i18n.locale, { maximumFractionDigits: digits == null ? 2 : digits }); }
  catch { return String(n); }
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

function showToast(tag, title, message) {
  if (process.env.JEST_WORKER_ID !== undefined) return;
  if (process.platform !== "win32") { console.log(`[${tag}] ${title}: ${message}`); return; }
  const ps = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null
$xml = [Windows.Data.Xml.Dom.XmlDocument]::new()
$xml.LoadXml('${toastXml(title, message)}')
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('OrbitRing').Show([Windows.UI.Notifications.ToastNotification]::new($xml))`;
  const encoded = Buffer.from(ps, "utf16le").toString("base64");
  exec(`powershell -NoProfile -EncodedCommand ${encoded}`, { timeout: 5000, windowsHide: true }, () => {});
}

function httpJson(req) {
  return new Promise((resolve) => {
    let done = false;
    let r = null;
    const ms = req.timeoutMs || 5000;
    const finish = (v) => {
      if (done) return;
      done = true;
      clearTimeout(guard);
      resolve(v);
    };
    const guard = setTimeout(() => { try { if (r) r.destroy(); } catch {} finish({ status: 0, data: null }); }, ms);
    try {
      const u = new URL(req.url);
      const body = typeof req.body === "string" ? Buffer.from(req.body) : null;
      r = nodeHttps.request(
        {
          hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search,
          method: req.method || "GET",
          headers: { ...(req.headers || {}), ...(body ? { "Content-Length": body.length } : {}) },
          timeout: ms,
          agent: false,
        },
        (res) => {
          let text = "";
          let size = 0;
          res.on("data", (c) => { size += c.length; if (size <= 2 * 1024 * 1024) text += c.toString(); });
          res.on("end", () => {
            let data = null;
            try { data = JSON.parse(text); } catch {}
            finish({ status: res.statusCode || 0, data });
          });
          res.on("error", () => finish({ status: 0, data: null }));
        }
      );
      r.on("error", () => finish({ status: 0, data: null }));
      r.on("timeout", () => { try { r.destroy(); } catch {} finish({ status: 0, data: null }); });
      r.end(body || undefined);
    } catch {
      finish({ status: 0, data: null });
    }
  });
}

function createAccountMemory(o) {
  const REMEMBER_MS = 30 * 24 * 3600_000;
  let items = [];
  let loaded = false;

  function load() {
    if (loaded) return;
    loaded = true;
    const dir = o.orbitHome();
    if (!dir) return;
    try {
      const data = JSON.parse(nodeFs.readFileSync(nodePath.join(dir, o.file), "utf8"));
      const t = o.now();
      items = (Array.isArray(data && data.accounts) ? data.accounts : [])
        .filter((a) => a && /^[0-9a-f]{8}$/.test(a.id) && typeof a.name === "string" && t - Number(a.lastSeen || 0) < REMEMBER_MS)
        .map((a) => ({ id: a.id, name: a.name.slice(0, 60), lastSeen: Number(a.lastSeen) }))
        .slice(0, o.max);
    } catch {
      items = [];
    }
  }

  function update(found) {
    const t = o.now();
    const before = JSON.stringify(items.map((r) => [r.id, r.name]));
    let touched = false;
    const next = [];
    for (const acc of found.slice(0, o.max)) {
      const prev = items.find((r) => r.id === acc.id);
      const renew = !prev || t - prev.lastSeen > 24 * 3600_000;
      if (renew) touched = true;
      next.push({ id: acc.id, name: acc.name, lastSeen: renew ? t : prev.lastSeen });
    }
    for (const r of items) {
      if (next.length >= o.max) break;
      if (!next.some((n) => n.id === r.id) && t - r.lastSeen < REMEMBER_MS) next.push(r);
    }
    items = next;
    if (!touched && JSON.stringify(next.map((r) => [r.id, r.name])) === before) return;
    if (next.length === 0 && before === "[]") return;
    const dir = o.orbitHome();
    if (!dir) return;
    try {
      nodeFs.mkdirSync(dir, { recursive: true });
      nodeFs.writeFileSync(nodePath.join(dir, o.file), JSON.stringify({ version: 1, accounts: next }, null, 2));
    } catch {}
  }

  return { load, update, list: () => items.slice(), reset() { items = []; loaded = false; } };
}

function defaultOrbitHome() {
  if (process.env.ORBIT_HOME) return process.env.ORBIT_HOME;
  if (process.env.JEST_WORKER_ID !== undefined) return null;
  return nodePath.join(nodeOs.homedir(), ".orbit");
}

module.exports = {
  sha256, timed, statusFor, clampPct, formatRemaining, formatAge, formatWhen, formatNumber,
  escapeXml, toastXml, showToast, httpJson, createAccountMemory, defaultOrbitHome,
};
