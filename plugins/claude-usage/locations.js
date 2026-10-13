const nodeFs = require("fs");
const nodeOs = require("os");
const nodePath = require("path");
const nodeCp = require("child_process");

const DISCOVER_TTL_MS = 55_000;
const FORCE_MIN_MS = 5_000;
const WSL_LIST_TIMEOUT_MS = 3_000;
const FS_TIMEOUT_MS = 2_500;
const MAX_HOMES_PER_DISTRO = 8;
const DISTRO_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const USER_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,63}$/;

function withTimeout(promise, ms, fallback) {
  return new Promise((resolve) => {
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; resolve(fallback); } }, ms);
    Promise.resolve(promise).then(
      (v) => { if (!done) { done = true; clearTimeout(t); resolve(v); } },
      () => { if (!done) { done = true; clearTimeout(t); resolve(fallback); } }
    );
  });
}

function parseWslList(out) {
  if (out == null) return [];
  let text;
  if (Buffer.isBuffer(out)) {
    const utf16 = out.length >= 2 && (out.includes(0) || (out[0] === 0xff && out[1] === 0xfe));
    text = out.toString(utf16 ? "utf16le" : "utf8");
  } else {
    text = String(out);
  }
  const seen = new Set();
  const names = [];
  for (const raw of text.replace(/\uFEFF/g, "").replace(/\0/g, "").split(/\r?\n/)) {
    const name = raw.trim();
    if (!DISTRO_NAME.test(name) || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    names.push(name);
  }
  return names;
}

function shortDistro(name) {
  const s = String(name).replace(/[-_ ]?\d+(\.\d+)*([-_ ]?LTS)?$/i, "");
  return s || String(name);
}

function createLocator(opts) {
  const o = opts || {};
  const deps = o.deps || {};
  const markers = Array.isArray(o.markers) ? o.markers : [];
  const platform = deps.platform || process.platform;
  const homedir = deps.homedir || nodeOs.homedir;
  const execFile = deps.execFile || nodeCp.execFile;
  const fsp = deps.fsp || nodeFs.promises;
  const now = deps.now || Date.now;
  const wslRoots = deps.wslRoots || ["\\\\wsl.localhost", "\\\\wsl$"];
  const join = platform === "win32" ? nodePath.win32.join : nodePath.join;

  const known = new Map();
  let cached = null;
  let cachedAt = 0;
  let inflight = null;

  function listRunningDistros() {
    return new Promise((resolve) => {
      let settled = false;
      let child = null;
      let guard = null;
      const finish = (v) => {
        if (settled) return;
        settled = true;
        if (guard) clearTimeout(guard);
        resolve(v);
      };
      guard = setTimeout(() => {
        try { if (child && typeof child.kill === "function") child.kill(); } catch {}
        finish([]);
      }, WSL_LIST_TIMEOUT_MS + 500);
      try {
        child = execFile(
          "wsl.exe",
          ["-l", "--running", "-q"],
          { timeout: WSL_LIST_TIMEOUT_MS, windowsHide: true, encoding: "buffer", maxBuffer: 64 * 1024 },
          (err, stdout) => finish(err ? [] : parseWslList(stdout))
        );
        try { if (child && child.stdin) child.stdin.end(); } catch {}
        if (child && typeof child.on === "function") child.on("error", () => finish([]));
      } catch {
        finish([]);
      }
    });
  }

  function exists(p) {
    return withTimeout(fsp.stat(p).then(() => true), FS_TIMEOUT_MS, false);
  }

  async function hasMarker(home) {
    if (markers.length === 0) return true;
    const hits = await Promise.all(markers.map((m) => exists(join(home, ...String(m).split("/")))));
    return hits.some(Boolean);
  }

  async function scanDistro(distro) {
    for (const root of wslRoots) {
      const base = join(root, distro);
      const users = await withTimeout(fsp.readdir(join(base, "home")), FS_TIMEOUT_MS, null);
      if (!users) continue;
      const candidates = users
        .filter((u) => typeof u === "string" && USER_NAME.test(u))
        .slice(0, MAX_HOMES_PER_DISTRO)
        .map((u) => ({ user: u, home: join(base, "home", u) }));
      candidates.push({ user: "root", home: join(base, "root") });
      const found = await Promise.all(candidates.map(async (c) => ((await hasMarker(c.home)) ? c : null)));
      return found.filter(Boolean).map((c) => ({
        id: `wsl:${distro}:${c.user}`, kind: "wsl", home: c.home, distro, user: c.user,
      }));
    }
    return [];
  }

  function relabel() {
    const wsl = Array.from(known.values()).filter((l) => l.kind === "wsl");
    const distros = new Set(wsl.map((l) => l.distro));
    for (const l of wsl) {
      const sameShort = new Set(
        wsl.filter((x) => shortDistro(x.distro).toLowerCase() === shortDistro(l.distro).toLowerCase()).map((x) => x.distro)
      );
      const name = sameShort.size > 1 ? l.distro : shortDistro(l.distro);
      const users = wsl.filter((x) => x.distro === l.distro).length;
      const user = users > 1 ? ` (${l.user})` : "";
      l.label = `WSL · ${name}${user}`;
      l.short = wsl.length === 1 ? "WSL" : distros.size === 1 ? `WSL${user}` : `WSL ${name}${user}`;
    }
  }

  async function run() {
    const found = [];
    found.push(platform === "win32"
      ? { id: "win", kind: "windows", home: homedir(), label: "Windows", short: "Windows" }
      : { id: "local", kind: "local", home: homedir(), label: "Local", short: "Local" });

    if (platform === "win32") {
      const distros = await listRunningDistros();
      const per = await Promise.all(distros.map((d) => scanDistro(d).catch(() => [])));
      for (const list of per) found.push(...list);
    }

    const live = new Set(found.map((l) => l.id));
    for (const l of found) {
      const prev = known.get(l.id);
      if (prev) Object.assign(prev, l, { stale: false });
      else known.set(l.id, { ...l, stale: false });
    }
    for (const l of known.values()) if (!live.has(l.id)) l.stale = true;
    relabel();
    return Array.from(known.values(), (l) => ({ ...l }));
  }

  function discover(force) {
    const t = now();
    if (cached && t - cachedAt < (force ? FORCE_MIN_MS : DISCOVER_TTL_MS)) return Promise.resolve(cached);
    if (inflight) return inflight;
    inflight = run()
      .then((list) => { cached = list; cachedAt = now(); return list; })
      .catch(() => cached || [])
      .finally(() => { inflight = null; });
    return inflight;
  }

  function reset() { known.clear(); cached = null; cachedAt = 0; }

  return { discover, reset };
}

module.exports = { createLocator, parseWslList, shortDistro, withTimeout };
