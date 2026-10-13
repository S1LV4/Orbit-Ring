const path = require("path");

const UNINSTALL_KEYS = [
  "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
  "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
  "HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
];
const RUNNER_EXE = "PowerToys.exe";
const EXEC_TIMEOUT_MS = 5_000;
const KEY_SHAPE = /^HKEY_(CURRENT_USER|LOCAL_MACHINE)\\[A-Za-z0-9\\ _.{}()-]{1,300}$/;

const wpath = path.win32;

function execFileText(file, args) {
  return new Promise((resolve) => {
    try {
      require("child_process").execFile(
        file, args, { timeout: EXEC_TIMEOUT_MS, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
        (err, stdout) => resolve(err ? "" : String(stdout || ""))
      );
    } catch {
      resolve("");
    }
  });
}

function realDeps() {
  const fs = require("fs");
  const sys = (exe) => {
    const root = process.env.SystemRoot || process.env.windir;
    return root ? path.join(root, "System32", exe) : exe;
  };
  return {
    platform: process.platform,
    env: process.env,
    regQuery: (args) => execFileText(sys("reg.exe"), ["query", ...args]),
    exists: (file) => { try { return fs.statSync(file).isFile(); } catch { return false; } },
    readFile: (file) => fs.readFileSync(file, "utf8"),
    listProcesses: async () => parseTasklist(await execFileText(sys("tasklist.exe"), ["/FI", "IMAGENAME eq PowerToys*", "/FO", "CSV", "/NH"])),
  };
}

function parseTasklist(text) {
  const out = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const m = /^"([^"]+\.exe)"/i.exec(line.trim());
    if (m) out.push(m[1]);
  }
  return out;
}

function parseRegOutput(text) {
  const blocks = [];
  let cur = null;
  for (const raw of String(text || "").split(/\r?\n/)) {
    if (/^HKEY_/.test(raw)) {
      cur = { key: raw.trim(), values: {} };
      blocks.push(cur);
      continue;
    }
    if (!cur) continue;
    const m = /^\s{2,}(\S.*?)\s{4}REG_[A-Z_]+\s{4}(.*)$/.exec(raw);
    if (m) cur.values[m[1]] = m[2].trim();
  }
  return blocks;
}

function parseEnabledMap(text) {
  let data;
  try { data = JSON.parse(String(text).replace(/^﻿/, "")); } catch { return null; }
  const map = data && typeof data === "object" ? data.enabled : null;
  if (!map || typeof map !== "object" || Array.isArray(map)) return null;
  const out = {};
  for (const k of Object.keys(map)) if (typeof map[k] === "boolean") out[k] = map[k];
  return out;
}

function parseJson(text) {
  try {
    const v = JSON.parse(String(text).replace(/^﻿/, ""));
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

function createDetector(deps) {
  const d = deps;
  const env = d.env || {};

  const settingsRoot = () => (env.LOCALAPPDATA ? wpath.join(env.LOCALAPPDATA, "Microsoft", "PowerToys") : null);

  function readJsonFile(file) {
    try { return parseJson(d.readFile(file)); } catch { return null; }
  }

  async function registryCandidates() {
    const found = [];
    for (const root of UNINSTALL_KEYS) {
      let listing = "";
      try { listing = await d.regQuery([root, "/s", "/v", "DisplayName"]); } catch { listing = ""; }
      for (const block of parseRegOutput(listing)) {
        const name = block.values.DisplayName;
        if (typeof name !== "string" || !/^PowerToys\b/i.test(name)) continue;
        if (!KEY_SHAPE.test(block.key)) continue;
        let detail = "";
        try { detail = await d.regQuery([block.key]); } catch { detail = ""; }
        const values = (parseRegOutput(detail)[0] || { values: {} }).values;
        const dir = values.InstallLocation;
        if (typeof dir === "string" && dir.trim()) {
          found.push({ dir: dir.trim().replace(/^"|"$/g, ""), version: values.DisplayVersion || null, source: "registry" });
        }
      }
    }
    return found;
  }

  function defaultCandidates() {
    const out = [];
    if (env.LOCALAPPDATA) out.push({ dir: wpath.join(env.LOCALAPPDATA, "PowerToys"), version: null, source: "per-user" });
    for (const pf of [env.ProgramFiles, env.ProgramW6432]) {
      if (pf) out.push({ dir: wpath.join(pf, "PowerToys"), version: null, source: "machine" });
    }
    return out;
  }

  function readGeneral() {
    const root = settingsRoot();
    const data = root ? readJsonFile(wpath.join(root, "settings.json")) : null;
    let enabled = null;
    if (data) enabled = parseEnabledMap(JSON.stringify(data));
    const version = data && typeof data.powertoys_version === "string" ? data.powertoys_version.replace(/^v/i, "") : null;
    return { enabled, version, runElevated: !!(data && data.run_elevated === true) };
  }

  function readModuleSettings(folder) {
    const root = settingsRoot();
    if (!root || typeof folder !== "string" || /[\\/:*?"<>|]/.test(folder)) return null;
    return readJsonFile(wpath.join(root, folder, "settings.json"));
  }

  async function listProcesses() {
    try {
      const list = await d.listProcesses();
      return Array.isArray(list) ? list.map((n) => String(n).toLowerCase()) : [];
    } catch {
      return [];
    }
  }

  async function detect() {
    if (d.platform !== "win32") {
      return { supported: false, installed: false, exe: null, dir: null, version: null, source: null, running: false, awakeRunning: false, enabled: null, runElevated: false };
    }
    const candidates = [...(await registryCandidates()), ...defaultCandidates()];
    let hit = null;
    const seen = new Set();
    for (const c of candidates) {
      const key = c.dir.replace(/[\\/]+$/, "").toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const exe = wpath.join(c.dir, RUNNER_EXE);
      let ok = false;
      try { ok = !!d.exists(exe); } catch { ok = false; }
      if (ok) { hit = { ...c, exe }; break; }
    }
    if (!hit) {
      return { supported: true, installed: false, exe: null, dir: null, version: null, source: null, running: false, awakeRunning: false, enabled: null, runElevated: false };
    }
    const general = readGeneral();
    const sameDir = candidates.find((c) => c.version && c.dir.replace(/[\\/]+$/, "").toLowerCase() === hit.dir.replace(/[\\/]+$/, "").toLowerCase());
    const procs = await listProcesses();
    return {
      supported: true,
      installed: true,
      exe: hit.exe,
      dir: hit.dir,
      version: hit.version || (sameDir && sameDir.version) || general.version || null,
      source: hit.source,
      running: procs.includes("powertoys.exe"),
      awakeRunning: procs.includes("powertoys.awake.exe"),
      enabled: general.enabled,
      runElevated: general.runElevated,
    };
  }

  async function update(info) {
    if (!info || !info.installed) return info;
    const general = readGeneral();
    const procs = await listProcesses();
    return {
      ...info,
      version: info.version || general.version || null,
      running: procs.includes("powertoys.exe"),
      awakeRunning: procs.includes("powertoys.awake.exe"),
      enabled: general.enabled,
      runElevated: general.runElevated,
    };
  }

  return { detect, update, readGeneral, readModuleSettings, listProcesses };
}

module.exports = { createDetector, realDeps, parseRegOutput, parseTasklist, parseEnabledMap, UNINSTALL_KEYS, KEY_SHAPE };
