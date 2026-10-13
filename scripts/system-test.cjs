const { spawn } = require("child_process");
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");
const WebSocket = require("ws");

const ROOT = path.resolve(__dirname, "..");
const SERVICE = path.join(ROOT, "packages", "service", "dist", "index.js");
const CATALOG = path.join(ROOT, "plugins");
const PORT = Number(process.env.ORBIT_SYSTEM_TEST_PORT) || 9129;
const STEP_TIMEOUT = 20000;
const SKIP = new Set((process.env.ORBIT_SYSTEM_TEST_SKIP || "").split(",").map((s) => s.trim()).filter(Boolean));

const manifests = fs.readdirSync(CATALOG, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => JSON.parse(fs.readFileSync(path.join(CATALOG, e.name, "manifest.json"), "utf8")));

let child = null, ws = null, home = null, serviceLog = "", passed = 0;

function ok(label) { passed++; console.log(`  ok  ${label}`); }
function assert(cond, label) { if (!cond) throw new Error(`FAILED: ${label}`); ok(label); }

const portFree = () => new Promise((resolve) => {
  const s = net.connect(PORT, "127.0.0.1");
  s.once("connect", () => { s.destroy(); resolve(false); });
  s.once("error", () => resolve(true));
});

const last = {};
const errors = [];
let waiters = [];
function until(fn, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for: ${label}`)), STEP_TIMEOUT);
    const check = () => { if (!fn()) return false; clearTimeout(timer); resolve(); return true; };
    if (!check()) waiters.push(check);
  });
}
const send = (m) => ws.send(JSON.stringify(m));

async function main() {
  if (!fs.existsSync(SERVICE)) throw new Error(`${SERVICE} not found — run "npm run build" first`);
  if (!(await portFree())) throw new Error(`port ${PORT} is in use — set ORBIT_SYSTEM_TEST_PORT to a free one`);

  home = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-system-"));
  const pluginsDir = path.join(home, ".orbit", "plugins");
  const env = {
    ...process.env,
    USERPROFILE: home, HOME: home,
    APPDATA: path.join(home, "AppData", "Roaming"), LOCALAPPDATA: path.join(home, "AppData", "Local"),
    ORBIT_PLUGIN_CATALOG: CATALOG, ORBIT_WS_PORT: String(PORT),
  };
  delete env.ORBIT_HOME;

  console.log("service");
  child = spawn(process.execPath, [SERVICE], { env, cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  let exited = null;
  child.on("exit", (code) => { exited = code; });
  const collect = (d) => { serviceLog += d; };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  for (let i = 0; i < 100 && exited === null && !serviceLog.includes(`ws://localhost:${PORT}`); i++) await new Promise((r) => setTimeout(r, 200));
  assert(exited === null && serviceLog.includes(`ws://localhost:${PORT}`), "built service starts and listens");

  ws = new WebSocket(`ws://localhost:${PORT}`);
  ws.on("message", (raw) => {
    const m = JSON.parse(String(raw));
    last[m.type] = m;
    if (m.type === "error") errors.push(m.message);
    waiters = waiters.filter((w) => !w());
  });
  await new Promise((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); });
  await until(() => last.config_loaded && last.ring_config && last.plugins && last.plugin_states, "initial state");
  ok("a client receives config, ring settings and plugin lists on connect");
  assert(Array.isArray(last.plugins.plugins) && last.plugins.plugins.length === 0, "a fresh install has no plugins (the catalog is opt-in)");

  console.log("settings");
  const ring = last.ring_config.ring;
  assert(ring && Array.isArray(ring.groups), "default ring settings have groups");
  const flipped = { ...ring, ascii: ring.ascii === false };
  last.ring_config = null;
  send({ type: "save_ring", ring: flipped });
  await until(() => last.ring_config && last.ring_config.ring.ascii === flipped.ascii, "ring settings saved and broadcast");
  ok("saved ring settings are broadcast back");
  last.config_loaded = null;
  send({ type: "get_config" });
  await until(() => last.config_loaded, "config after save");
  assert(JSON.stringify(last.config_loaded.config).includes(`"ascii":${flipped.ascii}`), "saved ring settings persist in the config");

  console.log("plugin catalog");
  send({ type: "get_plugin_catalog" });
  await until(() => last.plugin_catalog, "catalog");
  const entry = (id) => last.plugin_catalog.plugins.find((p) => p.id === id);
  assert(last.plugin_catalog.plugins.length === manifests.length, `catalog lists the ${manifests.length} plugins of plugins/`);
  assert(last.plugin_catalog.plugins.every((p) => p.installedVersion === null), "listing the catalog installs nothing");
  assert(!fs.existsSync(pluginsDir) || fs.readdirSync(pluginsDir).length === 0, "plugins folder is still empty");

  console.log("install");
  const loaded = (id) => last.plugins.plugins.find((p) => p.id === id);
  const installed = [];
  for (const m of manifests) {
    if (SKIP.has(m.id)) { console.log(`  --  ${m.name}: skipped (ORBIT_SYSTEM_TEST_SKIP)`); continue; }
    send({ type: "install_plugin", pluginId: m.id });
    await until(() => loaded(m.id) && entry(m.id).installedVersion === m.version, `install ${m.id}`);
    const ids = loaded(m.id).actions.map((a) => a.id);
    const missing = m.actions.map((a) => a.id).filter((id) => !ids.includes(id));
    assert(loaded(m.id).loaded === true && missing.length === 0, `${m.name} ${m.version}: loaded with its ${m.actions.length} manifest actions`);
    installed.push(m);
  }
  last.plugin_states = null;
  send({ type: "get_plugin_states" });
  await until(() => last.plugin_states, "plugin states");
  assert(last.plugin_states.states && typeof last.plugin_states.states === "object", "plugin states are served");

  console.log("remove");
  for (const m of installed) {
    send({ type: "remove_plugin", pluginId: m.id });
    await until(() => !loaded(m.id) && entry(m.id).installedVersion === null, `remove ${m.id}`);
  }
  assert(fs.readdirSync(pluginsDir).length === 0, "every installed plugin was unloaded and its folder deleted");

  const before = errors.length;
  send({ type: "install_plugin", pluginId: "does.not.exist" });
  await until(() => errors.length > before, "error for unknown plugin");
  ok("an unknown plugin id is refused with an error");
  assert(exited === null, "service is still running at the end");
}

function cleanup() {
  try { if (ws) ws.terminate(); } catch {}
  try { if (child && child.exitCode === null) child.kill(); } catch {}
  if (home) setTimeout(() => { try { fs.rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {} }, 300);
}

main().then(
  () => { console.log(`\nsystem test passed (${passed} checks)`); cleanup(); setTimeout(() => process.exit(0), 800); },
  (e) => {
    console.error(`\n${e.message}`);
    if (errors.length) console.error("service errors:", errors.join(" | "));
    console.error("--- service log (tail) ---\n" + serviceLog.split("\n").slice(-40).join("\n"));
    cleanup();
    setTimeout(() => process.exit(1), 800);
  },
);
