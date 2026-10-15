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
const SKIP = new Set(["com.orbitring.discord", ...(process.env.ORBIT_SYSTEM_TEST_SKIP || "").split(",").map((s) => s.trim()).filter(Boolean)]);

const manifests = fs.readdirSync(CATALOG, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => JSON.parse(fs.readFileSync(path.join(CATALOG, e.name, "manifest.json"), "utf8")));

let child = null, orphan = null, ws = null, home = null, serviceLog = "", passed = 0;

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
const URL = (port) => `ws://127.0.0.1:${port}`;
const LISTENING = (port) => `Service running on ${URL(port)}`;
const tokenProtocols = (token) => ["orbitring", `token.${token}`];

function handshake(url, protocols, origin) {
  return new Promise((resolve) => {
    const c = new WebSocket(url, protocols, origin ? { origin } : {});
    const done = (result) => { try { c.terminate(); } catch {} resolve(result); };
    c.once("open", () => done({ open: true, protocol: c.protocol }));
    c.once("unexpected-response", (_req, res) => done({ open: false, status: res.statusCode }));
    c.once("error", (e) => done({ open: false, error: e.code || e.message }));
  });
}

const lanAddress = () => Object.values(os.networkInterfaces()).flat()
  .find((a) => a && a.family === "IPv4" && !a.internal)?.address;

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
    ORBIT_NO_INPUT_HOOK: "1", ORBIT_PARENT_PID: String(process.pid),
  };
  delete env.ORBIT_HOME;

  console.log("service");
  child = spawn(process.execPath, [SERVICE], { env, cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  let exited = null;
  child.on("exit", (code) => { exited = code; });
  const collect = (d) => { serviceLog += d; };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  for (let i = 0; i < 100 && exited === null && !serviceLog.includes(LISTENING(PORT)); i++) await new Promise((r) => setTimeout(r, 200));
  assert(exited === null && serviceLog.includes(LISTENING(PORT)), "built service starts and listens on 127.0.0.1");
  for (let i = 0; i < 25 && !/mouse hook disabled/i.test(serviceLog); i++) await new Promise((r) => setTimeout(r, 200));
  assert(/mouse hook disabled/i.test(serviceLog), "the service under test leaves the real mouse alone (no global hook)");

  console.log("socket security");
  const tokenFile = path.join(home, ".orbit", "service-token");
  assert(fs.existsSync(tokenFile), "the service writes its per-start token to ~/.orbit/service-token");
  const token = fs.readFileSync(tokenFile, "utf8").trim();
  assert(/^[0-9a-f]{64}$/.test(token), "the service token is 32 random bytes");
  const noToken = await handshake(URL(PORT));
  assert(!noToken.open && noToken.status === 401, "a client without the token is refused (401)");
  const onlyProtocol = await handshake(URL(PORT), ["orbitring"]);
  assert(!onlyProtocol.open, "a client offering the subprotocol but no token is refused");
  const wrong = await handshake(URL(PORT), tokenProtocols("0".repeat(64)));
  assert(!wrong.open && wrong.status === 401, "a client with a wrong token is refused (401)");
  const site = await handshake(URL(PORT), tokenProtocols(token), "https://example.com");
  assert(!site.open && site.status === 401, "a web page is refused even with the token (Origin check)");
  const sandboxed = await handshake(URL(PORT), tokenProtocols(token), "null");
  assert(!sandboxed.open, "a sandboxed iframe (Origin: null) is refused");
  const lan = lanAddress();
  if (lan) {
    const remote = await handshake(`ws://${lan}:${PORT}`, tokenProtocols(token));
    assert(!remote.open && remote.status === undefined, `the service does not listen on the network address ${lan}`);
  } else console.log("  --  no non-loopback IPv4 address on this machine: network bind not checked");
  const good = await handshake(URL(PORT), tokenProtocols(token), "file://");
  assert(good.open && good.protocol === "orbitring", "a window with the token is accepted and the token is not echoed back");

  const clash = spawn(process.execPath, [SERVICE], { env, cwd: ROOT, stdio: "ignore", windowsHide: true });
  const clashExit = await new Promise((resolve) => {
    const t = setTimeout(() => { clash.kill(); resolve("still running"); }, STEP_TIMEOUT);
    clash.on("exit", (code) => { clearTimeout(t); resolve(code); });
  });
  assert(clashExit !== "still running", "a second service on a busy port exits");
  assert(fs.readFileSync(tokenFile, "utf8").trim() === token, "a service that could not listen leaves the running service's token alone");

  ws = new WebSocket(URL(PORT), tokenProtocols(token));
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

  console.log("language");
  await until(() => last.locale, "language on connect");
  assert(last.locale.locale === "system", "a fresh install follows the system language");
  last.locale = null;
  send({ type: "set_locale", locale: "es-ES" });
  await until(() => last.locale, "language broadcast");
  assert(last.locale.locale === "es-ES", "a picked language is saved and broadcast to every window");
  last.config_loaded = null;
  send({ type: "get_config" });
  await until(() => last.config_loaded, "config after language change");
  assert(last.config_loaded.config.locale === "es-ES", "the picked language persists in the config");
  last.plugin_catalog = null;
  send({ type: "get_plugin_catalog" });
  await until(() => last.plugin_catalog, "catalog in Spanish");
  const discord = last.plugin_catalog.plugins.find((p) => p.id === "com.orbitring.discord");
  assert(discord && discord.name === "Control de voz de Discord", "the plugin catalog follows the picked language");
  const beforeLocaleError = errors.length;
  send({ type: "set_locale", locale: "fr-FR" });
  await until(() => errors.length > beforeLocaleError, "error for an unknown language");
  ok("an unknown language is refused with an error");
  send({ type: "set_locale", locale: "system" });

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

  console.log("orphan protection");
  const parent = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { stdio: "ignore", windowsHide: true });
  const orphanPort = PORT + 1;
  orphan = spawn(process.execPath, [SERVICE], {
    env: { ...env, ORBIT_WS_PORT: String(orphanPort), ORBIT_PARENT_PID: String(parent.pid) },
    cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  let orphanLog = "", orphanExit = null;
  orphan.stdout.on("data", (d) => { orphanLog += d; });
  orphan.on("exit", (code) => { orphanExit = code; });
  for (let i = 0; i < 100 && orphanExit === null && !orphanLog.includes(LISTENING(orphanPort)); i++) await new Promise((r) => setTimeout(r, 200));
  assert(orphanExit === null, "a second service starts with a separate parent process");
  parent.kill();
  for (let i = 0; i < 50 && orphanExit === null; i++) await new Promise((r) => setTimeout(r, 200));
  assert(orphanExit !== null, "the service exits on its own when the process that started it is gone");
}

function cleanup() {
  try { if (ws) ws.terminate(); } catch {}
  try { if (child && child.exitCode === null) child.kill(); } catch {}
  try { if (orphan && orphan.exitCode === null) orphan.kill(); } catch {}
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
