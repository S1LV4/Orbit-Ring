const { ACTIONS, SETTINGS_WINDOWS, isKnownEvent } = require("./actions");
const { createDetector, realDeps } = require("./detect");
const { createHelper } = require("./helper");

const REFRESH_MS = 60_000;
const INSTALL_TTL_MS = 5 * 60_000;
const NOT_INSTALLED_RECHECK_MS = 10_000;
const FOREGROUND_DELAY_MS = 150;
const RUNNER_WAIT_MS = 10_000;
const RUNNER_POLL_MS = 400;
const TOAST_REPEAT_MS = 3_000;

const TITLE = "PowerToys";
const i18n = require("./i18n")(__dirname);
const t = i18n.t;
const label = (id) => t(`labels.${id}`);
const PEEK_HOSTS = new Set(["explorer", "powertoys.peek.ui"]);
const AWAKE_MODES = ["off", "indefinite", "timed", "until"];

let host = null;
let timer = null;
let deps = {};
let detector = null;
let helper = null;
let info = null;
let infoAt = 0;
let awake = null;
let hotkeys = {};
let inflight = null;
let lastSnapshot = "";
let lastToast = { key: "", at: 0 };

const now = () => (deps.now ? deps.now() : Date.now());
const sleep = (ms) => (deps.sleep ? deps.sleep(ms) : new Promise((r) => { const t = setTimeout(r, ms); if (t.unref) t.unref(); }));
const underJest = () => process.env.JEST_WORKER_ID !== undefined;

function inertDeps() {
  return {
    platform: process.platform,
    env: {},
    regQuery: async () => "",
    exists: () => false,
    readFile: () => { throw new Error("not available under test"); },
    listProcesses: async () => [],
  };
}

function getDetector() {
  if (!detector) {
    const base = underJest() ? inertDeps() : realDeps();
    const merged = { ...base };
    for (const k of Object.keys(base)) if (deps[k] !== undefined) merged[k] = deps[k];
    detector = createDetector(merged);
  }
  return detector;
}

function getHelper() {
  if (deps.helper) return deps.helper;
  if (!helper) {
    const spawn = deps.spawn || (underJest() ? () => { throw new Error("no real processes under test"); } : undefined);
    helper = createHelper({ spawn, env: deps.env || process.env });
  }
  return helper;
}

function launch(exe, args) {
  if (deps.launch) return deps.launch(exe, args);
  if (underJest()) return false;
  try {
    const child = require("child_process").spawn(exe, args, { detached: true, stdio: "ignore", windowsHide: false });
    child.on("error", () => {});
    child.unref();
    return true;
  } catch (e) {
    console.error("[powertoys] não foi possível iniciar", exe, e && e.message);
    return false;
  }
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
  const texts = [title, message]
    .filter((t) => typeof t === "string" && t.length > 0)
    .map((t) => `<text>${escapeXml(t)}</text>`).join("");
  return `<toast><visual><binding template="ToastGeneric">${texts}</binding></visual></toast>`;
}

const TOAST_SCRIPT = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null
$xml = [Windows.Data.Xml.Dom.XmlDocument]::new()
$xml.LoadXml($env:ORBIT_TOAST_XML)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('OrbitRing').Show([Windows.UI.Notifications.ToastNotification]::new($xml))`;

function showToast(message) {
  const t = now();
  if (lastToast.key === message && t - lastToast.at < TOAST_REPEAT_MS) return;
  lastToast = { key: message, at: t };
  if (deps.showToast) { deps.showToast(TITLE, message); return; }
  if (process.platform !== "win32") { console.log(`[powertoys] ${message}`); return; }
  if (underJest()) return;
  try {
    const encoded = Buffer.from(TOAST_SCRIPT, "utf16le").toString("base64");
    require("child_process").execFile(
      "powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
      { timeout: 5000, windowsHide: true, env: { ...process.env, ORBIT_TOAST_XML: toastXml(TITLE, message) } },
      () => {}
    );
  } catch {}
}

const VK_NAMES = {
  8: "Backspace", 9: "Tab", 13: "Enter", 27: "Esc", 32: "space", 33: "PgUp", 34: "PgDn", 35: "End", 36: "Home",
  37: "←", 38: "↑", 39: "→", 40: "↓", 44: "PrtSc", 45: "Ins", 46: "Del",
  186: ";", 187: "=", 188: ",", 189: "-", 190: ".", 191: "/", 192: "`", 219: "[", 220: "\\", 221: "]", 222: "'",
};

function formatHotkey(h) {
  if (!h || typeof h !== "object" || typeof h.code !== "number" || h.code <= 0) return "";
  const c = h.code;
  let key = VK_NAMES[c] === "space" ? t("keys.space") : VK_NAMES[c] || "";
  if (!key && ((c >= 48 && c <= 57) || (c >= 65 && c <= 90))) key = String.fromCharCode(c);
  if (!key && c >= 96 && c <= 105) key = `Num${c - 96}`;
  if (!key && c >= 112 && c <= 135) key = `F${c - 111}`;
  if (!key) return "";
  const parts = [];
  if (h.win) parts.push("Win");
  if (h.ctrl) parts.push("Ctrl");
  if (h.alt) parts.push("Alt");
  if (h.shift) parts.push("Shift");
  parts.push(key);
  return parts.join("+");
}

function readExtras() {
  const det = getDetector();
  const files = new Map();
  const moduleSettings = (folder) => {
    if (!files.has(folder)) files.set(folder, det.readModuleSettings(folder));
    return files.get(folder);
  };
  const next = {};
  for (const id of Object.keys(ACTIONS)) {
    const p = ACTIONS[id].hotkey;
    if (!p) continue;
    let v = moduleSettings(p[0]);
    for (let i = 1; v && i < p.length; i++) v = v[p[i]];
    const text = formatHotkey(v);
    if (text) next[id] = text;
  }
  hotkeys = next;
  const a = moduleSettings("Awake");
  const props = a && a.properties && typeof a.properties === "object" ? a.properties : null;
  awake = props && typeof props.mode === "number" ? { mode: props.mode, keepDisplayOn: props.keepDisplayOn === true } : null;
}

function refreshEnabledSync() {
  if (!info || !info.installed) return;
  const general = getDetector().readGeneral();
  info = { ...info, enabled: general.enabled, runElevated: general.runElevated };
}

function refresh(full) {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const det = getDetector();
      const t = now();
      if (full || !info || !info.installed || t - infoAt >= INSTALL_TTL_MS) {
        info = await det.detect();
        infoAt = t;
      } else {
        info = await det.update(info);
      }
      if (info.installed) readExtras(); else { hotkeys = {}; awake = null; }
    } catch (e) {
      console.error("[powertoys] falha na verificação:", e && e.message);
    } finally {
      inflight = null;
    }
    notifyIfChanged();
  })();
  return inflight;
}

function notifyIfChanged() {
  const snap = JSON.stringify(buildState());
  if (snap === lastSnapshot) return;
  lastSnapshot = snap;
  if (host && typeof host.stateChanged === "function") {
    try { host.stateChanged(); } catch {}
  }
}

function moduleEnabled(def) {
  if (!def.module) return true;
  const map = info && info.enabled;
  if (!map || typeof map[def.module] !== "boolean") return null;
  return map[def.module];
}

function actionState(id, def) {
  if (!info) return { text: "…", label: t("checking") };
  if (!info.supported) return { text: "–", label: t("notWindows") };
  if (!info.installed) return { text: "–", label: t("notInstalled") };
  if (moduleEnabled(def) === false) {
    const st = { text: "–", label: t("disabled", { label: label(id) }) };
    if (def.stateful) st.active = false;
    return st;
  }
  const stopped = info.running ? "" : t("stopped");
  if (id === "settings") {
    return { label: t("settings", { version: info.version ? ` ${info.version}` : "", stopped }) };
  }
  if (id === "awake") {
    const mode = awake ? awake.mode : 0;
    const active = !!(info.running && info.awakeRunning && mode >= 1 && mode <= 3);
    const what = active ? `${t(`awake.modes.${AWAKE_MODES[mode]}`)}${awake.keepDisplayOn ? t("awake.screenOn") : ""}` : t("awake.modes.off");
    return { active, label: t("awake.state", { what, stopped }) };
  }
  const key = hotkeys[id] ? ` · ${hotkeys[id]}` : "";
  return { label: `${label(id)}${key}${stopped}` };
}

function buildState() {
  const out = {};
  for (const id of Object.keys(ACTIONS)) out[id] = actionState(id, ACTIONS[id]);
  return out;
}

async function waitForEvent(name) {
  const h = getHelper();
  const deadline = now() + RUNNER_WAIT_MS;
  for (;;) {
    const r = await h.has(name);
    if (r[0] === "ok") return true;
    if (r[0] !== "missing" || now() >= deadline) return false;
    await sleep(RUNNER_POLL_MS);
  }
}

async function runnerRunning() {
  const procs = await getDetector().listProcesses();
  return procs.includes("powertoys.exe");
}

async function fireEvent(id, def) {
  if (!isKnownEvent(def.event)) return { handled: false, reason: "unsafe_event" };
  const h = getHelper();

  if (def.foreground) await sleep(FOREGROUND_DELAY_MS);

  if (def.guard === "explorer") {
    const fg = await h.foreground();
    if (fg[0] === "ok" && !PEEK_HOSTS.has(String(fg[1] || "").toLowerCase())) {
      showToast(t("toast.selectFile", { label: label(id) }));
      return { handled: false, reason: "needs_explorer" };
    }
  }

  let r = await h.set(def.event);
  if (r[0] === "missing") {
    if (await runnerRunning()) {
      showToast(t("toast.noResponseModule", { label: label(id) }));
      return { handled: false, reason: "event_missing" };
    }
    if (info.runElevated || !info.exe || !launch(info.exe, [])) {
      showToast(t("toast.notRunning"));
      return { handled: false, reason: "not_running" };
    }
    if (!(await waitForEvent(def.event))) {
      showToast(t("toast.startedLate", { label: label(id) }));
      return { handled: false, reason: "not_running" };
    }
    r = await h.set(def.event);
  }
  if (r[0] === "ok") return { handled: true };
  if (r[0] === "denied") {
    showToast(t("toast.admin"));
    return { handled: false, reason: "access_denied" };
  }
  if (r[0] === "missing") {
    showToast(t("toast.noResponse", { label: label(id) }));
    return { handled: false, reason: "event_missing" };
  }
  showToast(t("toast.failed", { label: label(id) }));
  return { handled: false, reason: r[0] === "bad" ? "unsafe_event" : "helper_failed" };
}

function openSettings(def) {
  if (!SETTINGS_WINDOWS.has(def.window) || !info.exe) return { handled: false, reason: "unsafe_window" };
  if (!launch(info.exe, [`--open-settings=${def.window}`])) {
    showToast(t("toast.settingsFailed"));
    return { handled: false, reason: "launch_failed" };
  }
  return { handled: true };
}

async function runAction(actionId) {
  const def = Object.prototype.hasOwnProperty.call(ACTIONS, actionId) ? ACTIONS[actionId] : null;
  if (!def) return { handled: false, reason: "unknown_action" };

  if (!info || (!info.installed && info.supported && now() - infoAt >= NOT_INSTALLED_RECHECK_MS)) await refresh(true);
  else refreshEnabledSync();

  if (!info || !info.supported) {
    showToast(t("notWindows"));
    return { handled: false, reason: "not_windows" };
  }
  if (!info.installed) {
    showToast(t("notInstalled"));
    return { handled: false, reason: "not_installed" };
  }
  if (moduleEnabled(def) === false) {
    showToast(t("toast.disabled", { label: label(actionId) }));
    notifyIfChanged();
    return { handled: false, reason: "module_disabled" };
  }

  const result = def.kind === "settings" ? openSettings(def) : await fireEvent(actionId, def);
  refresh(false);
  return result;
}

module.exports = {
  onLoad(h) {
    host = h && typeof h === "object" ? h : null;
    if (host && host.locale) i18n.setLocale(host.locale);
    console.log("[powertoys] Plugin loaded");
    refresh(true).then(() => {
      if (!info) return;
      if (!info.supported) console.log("[powertoys] Windows only");
      else if (!info.installed) console.log("[powertoys] PowerToys not installed");
      else console.log(`[powertoys] PowerToys ${info.version || "?"} em ${info.dir} (${info.running ? "em execução" : "parado"})`);
    });
    if (timer) clearInterval(timer);
    timer = setInterval(() => { refresh(false); }, REFRESH_MS);
    if (timer.unref) timer.unref();
  },

  onUnload() {
    if (timer) { clearInterval(timer); timer = null; }
    if (helper) { helper.stop(); helper = null; }
    if (deps.helper && typeof deps.helper.stop === "function") deps.helper.stop();
    host = null;
    lastSnapshot = "";
    console.log("[powertoys] Plugin unloaded");
  },

  async onAction(actionId) {
    try {
      return await runAction(String(actionId));
    } catch (e) {
      console.error("[powertoys] erro na ação", actionId, e && e.message);
      return { handled: false, reason: "error" };
    }
  },

  onLocaleChanged(locale) {
    i18n.setLocale(locale);
    lastSnapshot = "";
    if (host && typeof host.stateChanged === "function") host.stateChanged();
  },

  getState() {
    return buildState();
  },

  getActions() {
    return [];
  },

  _internals: { formatHotkey, escapeXml, toastXml },

  __test: {
    configure(d) {
      deps = d || {};
      detector = null;
      if (helper) { helper.stop(); helper = null; }
      info = null; infoAt = 0; awake = null; hotkeys = {}; inflight = null;
      lastSnapshot = ""; lastToast = { key: "", at: 0 };
    },
    refresh: (full) => refresh(full),
    info: () => info,
  },
};
