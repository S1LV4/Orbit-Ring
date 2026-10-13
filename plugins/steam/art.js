const path = require("path");
const { isAppId } = require("./library");

const CDN = "https://cdn.cloudflare.steamstatic.com/steam/apps";
const CDN_FILES = ["library_600x900.jpg", "header.jpg"];
const RETRY_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 8_000;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_PARALLEL = 2;
const INDEX = "cdn.json";

function cdnUrl(appid, file) {
  if (!isAppId(appid) || !CDN_FILES.includes(file)) return null;
  return `${CDN}/${appid}/${file}`;
}

const isJpeg = (buf) => Buffer.isBuffer(buf) && buf.length > 64 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;

function realHttpGet(url, { timeoutMs, maxBytes }) {
  return new Promise((resolve) => {
    let done = false;
    let hard = null;
    const finish = (v) => {
      if (done) return;
      done = true;
      if (hard) clearTimeout(hard);
      resolve(v);
    };
    try {
      const req = require("https").get(url, { headers: { "User-Agent": "OrbitRing-steam-plugin", Accept: "image/jpeg" }, timeout: timeoutMs }, (res) => {
        const len = Number(res.headers["content-length"] || 0);
        if (res.statusCode !== 200 || len > maxBytes) { res.resume(); req.destroy(); finish(null); return; }
        const chunks = [];
        let size = 0;
        res.on("data", (c) => {
          size += c.length;
          if (size > maxBytes) { req.destroy(); finish(null); return; }
          chunks.push(c);
        });
        res.on("end", () => finish(Buffer.concat(chunks)));
        res.on("error", () => finish(null));
      });
      hard = setTimeout(() => { req.destroy(); finish(null); }, timeoutMs);
      if (hard.unref) hard.unref();
      req.on("timeout", () => { req.destroy(); finish(null); });
      req.on("error", () => finish(null));
    } catch {
      finish(null);
    }
  });
}

function createArtCache(deps) {
  const fs = deps.fs;
  const dir = deps.dir;
  const now = () => deps.now();
  let index = null;
  const inflight = new Map();
  let active = 0;
  const waiting = [];

  function loadIndex() {
    if (index) return index;
    index = {};
    try {
      const data = JSON.parse(fs.readFileSync(path.join(dir, INDEX), "utf8"));
      if (data && typeof data === "object" && data.attempts && typeof data.attempts === "object") {
        for (const k of Object.keys(data.attempts)) {
          if (isAppId(k) && Number.isFinite(data.attempts[k])) index[k] = data.attempts[k];
        }
      }
    } catch {}
    return index;
  }

  function saveIndex() {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, INDEX), JSON.stringify({ attempts: index }));
    } catch {}
  }

  function cached(appid) {
    if (!dir || !isAppId(appid)) return null;
    for (const n of CDN_FILES) {
      const file = path.join(dir, `${appid}_${n}`);
      try {
        const st = fs.statSync(file);
        if (st.isFile() && st.size > 0) return { file, name: `cdn:${n}`, mtimeMs: st.mtimeMs };
      } catch {}
    }
    return null;
  }

  function mayFetch(appid) {
    if (!dir || !isAppId(appid) || typeof deps.httpGet !== "function") return false;
    const at = loadIndex()[appid];
    return !(Number.isFinite(at) && now() >= at && now() - at < RETRY_MS);
  }

  function slot() {
    if (active < MAX_PARALLEL) { active++; return Promise.resolve(); }
    return new Promise((r) => waiting.push(r));
  }
  function release() {
    const next = waiting.shift();
    if (next) next(); else active--;
  }

  async function download(appid) {
    await slot();
    try {
      for (const n of CDN_FILES) {
        const url = cdnUrl(appid, n);
        let buf = null;
        try { buf = await deps.httpGet(url, { timeoutMs: TIMEOUT_MS, maxBytes: MAX_BYTES }); } catch { buf = null; }
        if (!isJpeg(buf) || buf.length > MAX_BYTES) continue;
        const file = path.join(dir, `${appid}_${n}`);
        if (path.dirname(file) !== path.normalize(dir).replace(/[\\/]+$/, "")) continue;
        try {
          fs.mkdirSync(dir, { recursive: true });
          const tmp = `${file}.tmp`;
          fs.writeFileSync(tmp, buf);
          fs.renameSync(tmp, file);
          return cached(appid);
        } catch {
          return null;
        }
      }
      return null;
    } finally {
      release();
    }
  }

  function fetch(appid) {
    const hit = cached(appid);
    if (hit) return Promise.resolve(hit);
    if (!mayFetch(appid)) return Promise.resolve(null);
    if (inflight.has(appid)) return inflight.get(appid);
    loadIndex()[appid] = now();
    saveIndex();
    const p = download(appid).catch(() => null).finally(() => inflight.delete(appid));
    inflight.set(appid, p);
    return p;
  }

  return { cached, mayFetch, fetch };
}

module.exports = { createArtCache, realHttpGet, cdnUrl, isJpeg, CDN_FILES, RETRY_MS, TIMEOUT_MS, MAX_BYTES, MAX_PARALLEL };
