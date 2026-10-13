const path = require("path");
const { createLibrary, recentApps, downloadProgress, isAppId } = require("./library");
const { createArtCache, realHttpGet } = require("./art");

const MANIFEST = require("./manifest.json");
const MARK = (MANIFEST.actions.find((a) => a.id === "playing") || {}).icon;
const STATIC_IDS = MANIFEST.actions.map((a) => a.id);

const MAX_GAMES = 8;
const TICK_MS = 5_000;
const POLL_RUNNING_MS = 5_000;
const POLL_IDLE_MS = 15_000;
const SCAN_MS = 60_000;
const SCAN_DOWNLOADING_MS = 5_000;
const INSTALL_TTL_MS = 5 * 60_000;
const INSTALL_MISSING_MS = 60_000;
const NOT_INSTALLED_RECHECK_MS = 10_000;
const LOAD_WAIT_MS = 2_500;
const THUMB_SIZE = 96;
const THUMB_RETRY_MS = 10 * 60_000;
const IMAGE_MAX_BYTES = 48 * 1024;
const EXEC_TIMEOUT_MS = 4_000;
const TOAST_REPEAT_MS = 3_000;

const TITLE = "Steam";
const NOT_WINDOWS_LABEL = "Steam: só no Windows por enquanto";
const NOT_INSTALLED_LABEL = "Steam não instalado";
const GAME_ID = /^game\.([0-9]{1,10})$/;
const STEAM_URL = /^steam:\/\/[a-z0-9]+(\/[a-z0-9]+){0,3}$/;
const IMAGE_URI = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

const URLS = {
  playing: "steam://open/games",
  downloads: "steam://open/downloads",
  library: "steam://open/games",
  store: "steam://store",
  friends: "steam://open/friends",
  big_picture: "steam://open/bigpicture",
  status_online: "steam://friends/status/online",
  status_away: "steam://friends/status/away",
  status_invisible: "steam://friends/status/invisible",
  status_offline: "steam://friends/status/offline",
};
const IDLE_LABELS = {
  library: "abrir a biblioteca",
  store: "abrir a loja",
  friends: "abrir a lista de amigos",
  big_picture: "abrir o modo Big Picture",
  status_online: "ficar online",
  status_away: "ficar ausente",
  status_invisible: "ficar invisível",
  status_offline: "ficar offline no chat",
};

let host = null;
let timer = null;
let deps = {};
let lib = null;
let artCache = null;
let generation = 0;
const children = new Set();

let info = null;
let infoAt = 0;
let folders = [];
let apps = new Map();
let scanAt = 0;
let recent = [];
let running = null;
let runningAt = 0;
let polledOnce = false;
const thumbs = new Map();
let lastActions = "";
let lastState = "";
let lastToast = { key: "", at: 0 };
let scanning = null;

const now = () => (deps.now ? deps.now() : Date.now());
const underJest = () => process.env.JEST_WORKER_ID !== undefined;
const log = (...a) => { if (!underJest() || deps.log) (deps.log || console.log)("[steam]", ...a); };

function sysExe(name) {
  const root = process.env.SystemRoot || process.env.windir;
  return root ? path.join(root, "System32", name) : name;
}

function execText(file, args, env) {
  return new Promise((resolve) => {
    try {
      const child = require("child_process").execFile(
        file, args, { timeout: EXEC_TIMEOUT_MS, windowsHide: true, maxBuffer: 256 * 1024, env: env || process.env },
        (err, stdout) => { children.delete(child); resolve(err ? "" : String(stdout || "")); }
      );
      children.add(child);
    } catch {
      resolve("");
    }
  });
}

const PROCESS_START_SCRIPT = "$d=$env:ORBIT_STEAM_DIR; if($d){ Get-Process | Where-Object { $_.Path -and $_.Path.StartsWith($d,[StringComparison]::OrdinalIgnoreCase) } | Sort-Object StartTime | Select-Object -First 1 | ForEach-Object { [DateTimeOffset]::new($_.StartTime).ToUnixTimeMilliseconds() } }";

async function realProcessStart(dir) {
  const encoded = Buffer.from(PROCESS_START_SCRIPT, "utf16le").toString("base64");
  const out = await execText(sysExe("WindowsPowerShell\\v1.0\\powershell.exe"),
    ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], { ...process.env, ORBIT_STEAM_DIR: dir });
  const m = /^\s*([0-9]{12,14})\s*$/m.exec(out);
  return m ? Number(m[1]) : null;
}

function realPidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return !!e && e.code === "EPERM"; }
}

function openerCommand(url) {
  return [sysExe("rundll32.exe"), ["url.dll,FileProtocolHandler", url]];
}

function realOpen(url) {
  try {
    const [file, args] = openerCommand(url);
    const child = require("child_process").spawn(file, args, { detached: true, stdio: "ignore", windowsHide: true });
    child.on("error", () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

function world() {
  const jest = underJest();
  const d = deps;
  return {
    platform: d.platform !== undefined ? d.platform : process.platform,
    fs: d.fs || require("fs"),
    regQuery: d.regQuery || (jest ? async () => "" : (args) => execText(sysExe("reg.exe"), ["query", ...args])),
    pidAlive: d.pidAlive || (jest ? () => true : realPidAlive),
    processStart: d.processStart || (jest ? async () => null : realProcessStart),
    httpGet: d.httpGet || (jest ? null : realHttpGet),
    dataDir: d.dataDir !== undefined ? d.dataDir : (jest ? null : path.join(require("os").homedir(), ".orbit", "plugin-data", "steam")),
    open: d.open || (jest ? () => false : realOpen),
  };
}

function getLib() {
  if (!lib) {
    const w = world();
    lib = createLibrary({ platform: w.platform, fs: w.fs, regQuery: w.regQuery, pidAlive: w.pidAlive });
  }
  return lib;
}

function getArtCache() {
  if (!artCache) {
    const w = world();
    artCache = createArtCache({ fs: w.fs, dir: w.dataDir, httpGet: w.httpGet, now });
  }
  return artCache;
}

function escapeXml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
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
  if (underJest()) return;
  if (process.platform !== "win32") { console.log(`[steam] ${message}`); return; }
  const xml = `<toast><visual><binding template="ToastGeneric"><text>${escapeXml(TITLE)}</text><text>${escapeXml(message)}</text></binding></visual></toast>`;
  execText(sysExe("WindowsPowerShell\\v1.0\\powershell.exe"),
    ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(TOAST_SCRIPT, "utf16le").toString("base64")],
    { ...process.env, ORBIT_TOAST_XML: xml });
}

function fmtDuration(ms) {
  const min = Math.max(0, Math.floor(ms / 60_000));
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;
}

function fmtPlayedAgo(lastPlayedSec, nowMs) {
  const diff = nowMs - lastPlayedSec * 1000;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "jogado agora há pouco";
  if (min < 60) return `jogado há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `jogado há ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "jogado ontem";
  if (d < 60) return `jogado há ${d} dias`;
  const mo = Math.floor(d / 30);
  if (mo < 24) return `jogado há ${mo} meses`;
  return `jogado há ${Math.floor(d / 365)} anos`;
}

function fmtBytes(n) {
  const gb = n / (1024 ** 3);
  if (gb >= 1) return `${gb.toFixed(1).replace(".", ",")} GB`;
  return `${Math.max(0, Math.round(n / (1024 ** 2)))} MB`;
}

function validImage(v) {
  if (typeof v !== "string" || v.length > IMAGE_MAX_BYTES * 2) return null;
  const m = IMAGE_URI.exec(v);
  if (!m) return null;
  return Math.floor((m[2].length * 3) / 4) <= IMAGE_MAX_BYTES ? v : null;
}

const ready = () => !!(info && info.supported && info.installed);

function downloadingApp() {
  let best = null;
  for (const a of apps.values()) {
    if (!a.updating) continue;
    if (!best || (best.paused && !a.paused)) best = a;
  }
  return best;
}

function downloadState(app) {
  const p = downloadProgress(app);
  if (p.percent === null) return { text: "…", label: `${app.name} · preparando download` };
  const base = { value: p.percent, text: `${p.percent}%` };
  if (app.paused) return { ...base, label: `${app.name} · pausado em ${p.percent}%` };
  if (p.done >= p.total) return { ...base, label: `${app.name} · instalando` };
  return { ...base, label: `${app.name} · ${p.percent}% · ${fmtBytes(p.done)} de ${fmtBytes(p.total)}` };
}

function sessionText() {
  if (!running) return null;
  return running.since ? fmtDuration(now() - running.since) : null;
}

function buildState() {
  const out = {};
  if (!ready()) {
    const label = info && !info.supported ? NOT_WINDOWS_LABEL : info ? NOT_INSTALLED_LABEL : "verificando o Steam…";
    for (const id of STATIC_IDS) out[id] = { text: "–", label };
    return out;
  }
  for (const id of Object.keys(IDLE_LABELS)) out[id] = { label: IDLE_LABELS[id] };

  if (running) {
    const app = apps.get(running.appid);
    const name = app ? app.name : "jogo";
    const dur = sessionText();
    out.playing = { active: true, label: dur ? `${name} · ${dur}` : `${name} · em execução` };
  } else {
    out.playing = { active: false, label: "nada em execução" };
  }

  const dl = downloadingApp();
  out.downloads = dl ? downloadState(dl) : { label: "nada baixando" };

  for (const id of recent) {
    const app = apps.get(id);
    if (!app) continue;
    if (running && running.appid === id) {
      const dur = sessionText();
      out[`game.${id}`] = { active: true, label: dur ? `em execução · ${dur}` : "em execução" };
    } else if (app.updating) {
      const p = downloadProgress(app);
      out[`game.${id}`] = p.percent === null
        ? { active: false, label: "atualizando" }
        : { active: false, value: p.percent, label: `${app.paused ? "atualização pausada em" : "atualizando"} ${p.percent}%` };
    } else {
      out[`game.${id}`] = { active: false, label: `${app.name} · ${fmtPlayedAgo(app.lastPlayed, now())}` };
    }
  }
  return out;
}

function buildActions() {
  if (!ready()) return [];
  const out = [];
  for (const id of recent) {
    const app = apps.get(id);
    if (!app) continue;
    const def = { id: `game.${id}`, name: app.name, icon: MARK, stateful: true, description: `Inicia ${app.name} pelo Steam.` };
    const t = thumbs.get(id);
    if (t && t.image) def.image = t.image;
    out.push(def);
  }
  return out;
}

function publish() {
  const a = JSON.stringify(buildActions());
  if (a !== lastActions) {
    lastActions = a;
    if (host && typeof host.actionsChanged === "function") {
      try { host.actionsChanged(); } catch {}
    }
  }
  const s = JSON.stringify(buildState());
  if (s !== lastState) {
    lastState = s;
    if (host && typeof host.stateChanged === "function") {
      try { host.stateChanged(); } catch {}
    }
  }
}

async function refreshInstall() {
  const gen = generation;
  const next = await getLib().detect();
  if (gen !== generation) return;
  info = next;
  infoAt = now();
  if (!ready()) {
    folders = []; apps = new Map(); recent = []; running = null; thumbs.clear();
  }
}

async function ensureThumb(appid, gen) {
  const cache = getArtCache();
  let art = getLib().pickLocalArt(info.dir, appid) || cache.cached(appid);
  if (!art) {
    if (cache.mayFetch(appid)) {
      cache.fetch(appid).then(async (hit) => {
        if (!hit || gen !== generation || !recent.includes(appid)) return;
        await makeThumb(appid, hit, gen);
        if (gen === generation) publish();
      }).catch(() => {});
    }
    if (!thumbs.has(appid)) thumbs.set(appid, { key: "", image: null, art: null, at: now() });
    return;
  }
  await makeThumb(appid, art, gen);
}

async function makeThumb(appid, art, gen) {
  const key = `${art.file}|${art.mtimeMs}`;
  const prev = thumbs.get(appid);
  if (prev && prev.key === key && (prev.image || now() - prev.at < THUMB_RETRY_MS)) return;
  let image = null;
  if (host && typeof host.makeThumbnail === "function") {
    try { image = validImage(await host.makeThumbnail(art.file, { size: THUMB_SIZE })); } catch { image = null; }
  }
  if (gen !== generation) return;
  thumbs.set(appid, { key, image, art: art.name, at: now() });
}

function scan() {
  if (scanning) return scanning;
  const gen = generation;
  scanning = (async () => {
    if (!ready()) return;
    const l = getLib();
    folders = l.libraryFolders(info.dir);
    apps = l.scanApps(folders);
    scanAt = now();
    let list = recentApps(apps, MAX_GAMES).map((a) => a.appid);
    if (running && apps.has(running.appid) && !list.includes(running.appid)) {
      list = [running.appid, ...list].slice(0, MAX_GAMES);
    }
    recent = list;
    for (const id of Array.from(thumbs.keys())) if (!recent.includes(id)) thumbs.delete(id);
    await Promise.all(recent.map((id) => ensureThumb(id, gen).catch(() => {})));
  })().catch((e) => { log("erro ao ler a biblioteca:", e && e.message); }).finally(() => { scanning = null; });
  return scanning;
}

async function pollRunning() {
  if (!ready()) return;
  const gen = generation;
  const id = await getLib().runningAppId();
  if (gen !== generation) return;
  runningAt = now();
  const prev = running ? running.appid : null;
  const first = !polledOnce;
  polledOnce = true;
  if (id === prev) return;
  if (!id) { running = null; scanAt = 0; return; }
  running = { appid: id, since: first ? null : now(), asked: false };
  scanAt = 0;
}

function resolveSessionStart() {
  const session = running;
  if (!session || session.asked) return;
  const app = apps.get(session.appid);
  if (!app) return;
  session.asked = true;
  if (!app.installdir) return;
  const gen = generation;
  const dir = path.join(app.library, "steamapps", "common", app.installdir) + path.sep;
  Promise.resolve().then(() => world().processStart(dir)).then((ms) => {
    if (gen !== generation || running !== session) return;
    if (typeof ms === "number" && Number.isFinite(ms) && ms > 0 && ms <= now() && now() - ms < 7 * 24 * 3600_000) {
      session.since = ms;
      publish();
    }
  }).catch(() => {});
}

async function tick(force) {
  const t = now();
  if (force || !info || t - infoAt >= (ready() ? INSTALL_TTL_MS : INSTALL_MISSING_MS)) await refreshInstall();
  if (ready()) {
    if (force || t - runningAt >= (running ? POLL_RUNNING_MS : POLL_IDLE_MS)) await pollRunning();
    if (force || !scanAt || t - scanAt >= (downloadingApp() ? SCAN_DOWNLOADING_MS : SCAN_MS)) await scan();
    resolveSessionStart();
  }
  publish();
}

function openLink(url) {
  if (typeof url !== "string" || !STEAM_URL.test(url)) return { handled: false, reason: "unsafe_link" };
  let ok = false;
  try { ok = world().open(url) !== false; } catch { ok = false; }
  if (!ok) {
    showToast("Não foi possível abrir o Steam.");
    return { handled: false, reason: "open_failed" };
  }
  return { handled: true };
}

async function runAction(actionId) {
  const game = GAME_ID.exec(actionId);
  if (!game && !Object.prototype.hasOwnProperty.call(URLS, actionId)) return { handled: false, reason: "unknown_action" };

  if (!info || (!info.installed && info.supported && now() - infoAt >= NOT_INSTALLED_RECHECK_MS)) await tick(true);
  if (!info || !info.supported) {
    showToast(NOT_WINDOWS_LABEL);
    return { handled: false, reason: "not_windows" };
  }
  if (!info.installed) {
    showToast(`${NOT_INSTALLED_LABEL}.`);
    return { handled: false, reason: "not_installed" };
  }

  if (!game) return openLink(URLS[actionId]);

  const appid = String(Number(game[1]));
  if (!isAppId(appid) || !recent.includes(appid) || !apps.has(appid)) return { handled: false, reason: "unknown_game" };
  if (running && running.appid === appid) {
    showToast(`${apps.get(appid).name} já está em execução.`);
    return { handled: false, reason: "already_running" };
  }
  const result = openLink(`steam://rungameid/${appid}`);
  if (result.handled) runningAt = 0;
  return result;
}

module.exports = {
  async onLoad(h) {
    host = h && typeof h === "object" ? h : null;
    const gen = ++generation;
    log("Plugin loaded");
    const first = tick(true).then(() => {
      if (gen !== generation || !info) return;
      if (!info.supported) log(NOT_WINDOWS_LABEL);
      else if (!info.installed) log(NOT_INSTALLED_LABEL);
      else log(`Steam em ${info.dir} · ${folders.length} biblioteca(s) · ${apps.size} app(s) instalados · ${recent.length} jogos recentes`);
    }).catch((e) => { log("erro na verificação inicial:", e && e.message); });
    let waitTimer = null;
    await Promise.race([first, new Promise((r) => { waitTimer = setTimeout(r, deps.loadWaitMs !== undefined ? deps.loadWaitMs : LOAD_WAIT_MS); if (waitTimer.unref) waitTimer.unref(); })]);
    if (waitTimer) clearTimeout(waitTimer);
    if (gen !== generation) return;
    if (timer) clearInterval(timer);
    if (!deps.noTimer) {
      timer = setInterval(() => { tick(false).catch(() => {}); }, TICK_MS);
      if (timer.unref) timer.unref();
    }
  },

  onUnload() {
    generation++;
    if (timer) { clearInterval(timer); timer = null; }
    for (const c of children) { try { c.kill(); } catch {} }
    children.clear();
    host = null;
    lastActions = ""; lastState = "";
    log("Plugin unloaded");
  },

  async onAction(actionId) {
    try {
      return await runAction(String(actionId));
    } catch (e) {
      log("erro na ação", String(actionId).slice(0, 40), e && e.message);
      return { handled: false, reason: "error" };
    }
  },

  getState() {
    return buildState();
  },

  getActions() {
    return buildActions();
  },

  _internals: {
    fmtDuration, fmtPlayedAgo, fmtBytes, validImage, openerCommand, downloadState,
    URLS, MARK, MAX_GAMES, NOT_INSTALLED_LABEL, NOT_WINDOWS_LABEL, STEAM_URL,
  },

  __test: {
    configure(d) {
      generation++;
      if (timer) { clearInterval(timer); timer = null; }
      deps = d || {};
      lib = null; artCache = null;
      info = null; infoAt = 0; folders = []; apps = new Map(); scanAt = 0; recent = [];
      running = null; runningAt = 0; polledOnce = false; thumbs.clear();
      lastActions = ""; lastState = ""; lastToast = { key: "", at: 0 }; scanning = null;
    },
    tick: (force) => tick(force !== false),
    info: () => info,
    folders: () => folders.slice(),
    recent: () => recent.map((id) => ({ appid: id, name: apps.get(id).name, art: (thumbs.get(id) || {}).art || null })),
    running: () => (running ? { appid: running.appid, since: running.since } : null),
  },
};
