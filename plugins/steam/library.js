const path = require("path");
const { parseVdf, vget } = require("./vdf");

const STEAM_KEY = "HKCU\\Software\\Valve\\Steam";
const PROCESS_KEY = `${STEAM_KEY}\\ActiveProcess`;
const APPID = /^[0-9]{1,10}$/;
const MAX_LIBRARIES = 16;
const MAX_MANIFESTS = 4000;
const MAX_ACF_BYTES = 256 * 1024;

const FLAG = {
  UPDATE_REQUIRED: 2, FULLY_INSTALLED: 4, UPDATE_RUNNING: 256, UPDATE_PAUSED: 512, UPDATE_STARTED: 1024,
  VALIDATING: 131072, ADDING_FILES: 262144, PREALLOCATING: 524288, DOWNLOADING: 1048576,
  STAGING: 2097152, COMMITTING: 4194304,
};
const UPDATING_MASK = FLAG.UPDATE_RUNNING | FLAG.UPDATE_STARTED | FLAG.VALIDATING | FLAG.ADDING_FILES
  | FLAG.PREALLOCATING | FLAG.DOWNLOADING | FLAG.STAGING | FLAG.COMMITTING;

const ART_NAMES = ["library_600x900.jpg", "library_capsule.jpg", "header.jpg", "library_header.jpg"];
const ART_MAX_BYTES = 8 * 1024 * 1024;

function isAppId(v) {
  return typeof v === "string" && APPID.test(v) && Number(v) > 0 && Number(v) <= 0xffffffff;
}

function regValue(text, name) {
  for (const raw of String(text || "").split(/\r?\n/)) {
    const m = /^\s{2,}(\S.*?)\s{4}REG_[A-Z_]+\s{4}(.*)$/.exec(raw);
    if (m && m[1].toLowerCase() === name.toLowerCase()) return m[2].trim();
  }
  return null;
}

function regNumber(v) {
  if (typeof v !== "string") return 0;
  const n = /^0x[0-9a-f]+$/i.test(v) ? parseInt(v, 16) : /^[0-9]+$/.test(v) ? parseInt(v, 10) : 0;
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
}

const num = (v) => {
  const n = typeof v === "string" && /^[0-9]{1,18}$/.test(v) ? Number(v) : 0;
  return Number.isFinite(n) ? n : 0;
};

function cleanName(v) {
  if (typeof v !== "string") return null;
  const s = Array.from(v, (ch) => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? " " : ch)).join("")
    .replace(/\s+/g, " ").trim();
  return s ? s.slice(0, 80) : null;
}

function parseAppManifest(text) {
  const root = parseVdf(text);
  const st = vget(root, "AppState");
  if (!st || typeof st !== "object") return null;
  const appid = vget(st, "appid");
  const name = cleanName(vget(st, "name"));
  if (!isAppId(appid) || !name) return null;
  const flags = num(vget(st, "StateFlags"));
  const installdir = vget(st, "installdir");
  return {
    appid: String(Number(appid)),
    name,
    flags,
    lastPlayed: num(vget(st, "LastPlayed")),
    lastUpdated: num(vget(st, "LastUpdated")),
    bytesToDownload: num(vget(st, "BytesToDownload")),
    bytesDownloaded: num(vget(st, "BytesDownloaded")),
    sizeOnDisk: num(vget(st, "SizeOnDisk")),
    installdir: typeof installdir === "string" && installdir && !/[\\/:*?"<>|]|^\.+$/.test(installdir) ? installdir : null,
    updating: (flags & UPDATING_MASK) !== 0,
    paused: (flags & FLAG.UPDATE_PAUSED) !== 0,
  };
}

function downloadProgress(app) {
  const total = app && app.bytesToDownload > 0 ? app.bytesToDownload : 0;
  const done = app && app.bytesDownloaded > 0 ? app.bytesDownloaded : 0;
  if (!total) return { percent: null, done, total: 0 };
  const capped = Math.min(done, total);
  return { percent: Math.floor((capped / total) * 100), done: capped, total };
}

function parseLibraryFolders(text) {
  const root = parseVdf(text);
  const lf = vget(root, "libraryfolders");
  if (!lf || typeof lf !== "object") return [];
  const out = [];
  for (const k of Object.keys(lf)) {
    if (!/^[0-9]+$/.test(k)) continue;
    const v = lf[k];
    const p = typeof v === "string" ? v : v && typeof v === "object" ? vget(v, "path") : null;
    if (typeof p === "string" && p.trim() && path.isAbsolute(p.trim())) out.push(path.normalize(p.trim()));
  }
  return out;
}

function createLibrary(deps) {
  const fs = deps.fs;
  const reg = async (args) => {
    try { return String((await deps.regQuery(args)) || ""); } catch { return ""; }
  };
  const isFile = (f) => { try { return fs.statSync(f).isFile(); } catch { return false; } };
  const isDir = (f) => { try { return fs.statSync(f).isDirectory(); } catch { return false; } };

  async function detect() {
    if (deps.platform !== "win32") return { supported: false, installed: false, dir: null, exe: null };
    const raw = regValue(await reg([STEAM_KEY, "/v", "SteamPath"]), "SteamPath");
    if (!raw || !path.isAbsolute(raw)) return { supported: true, installed: false, dir: null, exe: null };
    const dir = path.normalize(raw).replace(/[\\/]+$/, "");
    const exe = path.join(dir, "steam.exe");
    if (!isFile(exe)) return { supported: true, installed: false, dir: null, exe: null };
    return { supported: true, installed: true, dir, exe };
  }

  async function runningAppId() {
    const id = regNumber(regValue(await reg([STEAM_KEY, "/v", "RunningAppID"]), "RunningAppID"));
    if (!id || id > 0xffffffff) return null;
    const pid = regNumber(regValue(await reg([PROCESS_KEY, "/v", "pid"]), "pid"));
    if (!pid) return null;
    if (typeof deps.pidAlive === "function" && !deps.pidAlive(pid)) return null;
    return String(id);
  }

  function libraryFolders(steamDir) {
    const found = [steamDir];
    for (const file of [path.join(steamDir, "steamapps", "libraryfolders.vdf"), path.join(steamDir, "config", "libraryfolders.vdf")]) {
      let text = null;
      try { text = fs.readFileSync(file, "utf8"); } catch { text = null; }
      if (text === null) continue;
      const list = parseLibraryFolders(text);
      if (list.length) { found.push(...list); break; }
    }
    const out = [];
    const seen = new Set();
    for (const p of found) {
      const clean = p.replace(/[\\/]+$/, "");
      const key = clean.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      if (isDir(path.join(clean, "steamapps"))) out.push(clean);
      if (out.length >= MAX_LIBRARIES) break;
    }
    return out;
  }

  function scanApps(folders) {
    const apps = new Map();
    let budget = MAX_MANIFESTS;
    for (const lib of folders) {
      const dir = path.join(lib, "steamapps");
      let names = [];
      try { names = fs.readdirSync(dir); } catch { names = []; }
      for (const name of names) {
        const m = /^appmanifest_([0-9]{1,10})\.acf$/i.exec(name);
        if (!m) continue;
        if (--budget < 0) return apps;
        const file = path.join(dir, name);
        let text;
        try {
          if (fs.statSync(file).size > MAX_ACF_BYTES) continue;
          text = fs.readFileSync(file, "utf8");
        } catch { continue; }
        const app = parseAppManifest(text);
        if (!app || app.appid !== String(Number(m[1]))) continue;
        if (!apps.has(app.appid)) apps.set(app.appid, { ...app, library: lib });
      }
    }
    return apps;
  }

  function pickLocalArt(steamDir, appid) {
    if (!isAppId(appid)) return null;
    const root = path.join(steamDir, "appcache", "librarycache");
    const hits = new Map();
    const consider = (file, artName) => {
      let st;
      try { st = fs.statSync(file); } catch { return; }
      if (!st.isFile() || st.size <= 0 || st.size > ART_MAX_BYTES) return;
      const prev = hits.get(artName);
      if (!prev || st.mtimeMs > prev.mtimeMs) hits.set(artName, { file, name: artName, mtimeMs: st.mtimeMs });
    };
    const walk = (dir, depth) => {
      let entries = [];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      let subdirs = 0;
      for (const e of entries) {
        if (e.isDirectory()) {
          if (depth < 2 && ++subdirs <= 64) walk(path.join(dir, e.name), depth + 1);
        } else if (ART_NAMES.includes(e.name.toLowerCase())) {
          consider(path.join(dir, e.name), e.name.toLowerCase());
        }
      }
    };
    walk(path.join(root, appid), 0);
    for (const n of ART_NAMES) consider(path.join(root, `${appid}_${n}`), n);
    for (const n of ART_NAMES) if (hits.has(n)) return hits.get(n);
    return null;
  }

  return { detect, runningAppId, libraryFolders, scanApps, pickLocalArt };
}

function recentApps(apps, max) {
  return Array.from(apps.values())
    .filter((a) => a.lastPlayed > 0)
    .sort((a, b) => b.lastPlayed - a.lastPlayed || Number(a.appid) - Number(b.appid))
    .slice(0, max);
}

module.exports = {
  createLibrary, parseAppManifest, parseLibraryFolders, downloadProgress, recentApps,
  regValue, regNumber, isAppId, cleanName, STEAM_KEY, PROCESS_KEY, ART_NAMES, FLAG,
};
