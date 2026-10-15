const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const esbuild = require("esbuild");

let tmp, hostEntry, PluginHostClient, PluginLoader;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-plugin-host-"));
  fs.symlinkSync(path.resolve(__dirname, "..", "..", "..", "node_modules"), path.join(tmp, "node_modules"), "junction");
  hostEntry = path.join(tmp, "plugin-host.js");
  const opts = { bundle: true, platform: "node", format: "cjs", logLevel: "silent", external: ["sharp", "koffi"] };
  esbuild.buildSync({ ...opts, entryPoints: [path.join(__dirname, "plugin-host.ts")], outfile: hostEntry });
  esbuild.buildSync({ ...opts, entryPoints: [path.join(__dirname, "plugin-host-client.ts")], outfile: path.join(tmp, "client.cjs") });
  esbuild.buildSync({ ...opts, entryPoints: [path.join(__dirname, "plugin-loader.ts")], outfile: path.join(tmp, "loader.cjs") });
  ({ PluginHostClient } = require(path.join(tmp, "client.cjs")));
  ({ PluginLoader } = require(path.join(tmp, "loader.cjs")));
});
afterAll(() => {
  fs.unlinkSync(path.join(tmp, "node_modules"));
  fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

let spies, clients;
beforeEach(() => {
  spies = ["log", "warn", "error"].map((m) => jest.spyOn(console, m).mockImplementation(() => {}));
  clients = [];
});
afterEach(async () => {
  for (const c of clients) await c.unloadAll();
  spies.forEach((s) => s.mockRestore());
});

const home = () => fs.mkdtempSync(path.join(tmp, "home-"));
function plugin(root, folder, code, manifest = {}) {
  const dir = path.join(root, folder);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({
    id: `test.${folder}`, name: folder, version: "1.0.0", author: "@a", description: "d", main: "index.js",
    orbitApi: "^1.0", permissions: [], actions: [{ id: "a", name: "A" }, { id: "b", name: "B" }], ...manifest,
  }));
  fs.writeFileSync(path.join(dir, "index.js"), code);
  return dir;
}

function client(pluginsDir, opts = {}) {
  const h = path.dirname(pluginsDir);
  const c = new PluginHostClient({
    hostEntry, pluginsDir, locale: "pt-BR", callLimitMs: 400, restartDelayMs: 50,
    env: { ...process.env, USERPROFILE: h, HOME: h, APPDATA: h, LOCALAPPDATA: h, ORBIT_HOME: h },
    ...opts,
  });
  clients.push(c);
  return c;
}

const until = async (fn, ms = 8000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return; await new Promise((r) => setTimeout(r, 25)); }
  throw new Error("condition not met in time");
};

const COUNTER = `
let host, n = 0;
module.exports = {
  onLoad(h) { host = h; },
  getState() { return { a: { text: String(n) } }; },
  getStatus() { return { text: "count " + n, tone: "ok" }; },
  onLocaleChanged(l) { n = l === "es-ES" ? 100 : n; host.stateChanged(); },
  onAction(id) {
    if (id === "pid") return { pid: process.pid, execArgv: process.execArgv };
    n++; host.stateChanged();
    if (n === 2) host.attention({ id: "x", title: "Olha" });
    return { handled: true, n };
  },
};`;

describe("plugin calls are reported around every synchronous call into a plugin", () => {
  test("start and end markers wrap the module, onLoad, getState, getStatus, getActions, onAction and onUnload", async () => {
    const root = path.join(home(), "plugins");
    plugin(root, "p", `module.exports = { onLoad() {}, getState() { return {}; }, getStatus() { return { text: "s", tone: "ok" }; }, getActions() { return []; }, onAction() { return 1; }, onUnload() {} };`);
    const calls = [];
    const loader = new PluginLoader({ pluginsDir: root, onPluginCall: (id, method, start) => calls.push(`${start ? "S" : "E"} ${id} ${method}`) });
    await loader.loadAll();
    loader.getPlugins();
    loader.getPluginStates();
    await loader.executePluginAction("test.p", "a");
    await loader.unload("test.p");
    for (const m of ["require", "onLoad", "getActions", "getStatus", "getState", "onAction", "onUnload"]) {
      expect(calls).toContain(`S test.p ${m}`);
      expect(calls).toContain(`E test.p ${m}`);
    }
    expect(calls.filter((c) => c.startsWith("S")).length).toBe(calls.filter((c) => c.startsWith("E")).length);
  });

  test("a plugin marked unresponsive is listed but its code is never run", async () => {
    const root = path.join(home(), "plugins");
    plugin(root, "p", "global.__ranUnresponsive = true; module.exports = {};");
    const loader = new PluginLoader({ pluginsDir: root, unresponsive: ["test.p"] });
    await loader.loadAll();
    expect(global.__ranUnresponsive).toBeUndefined();
    expect(loader.getPlugins()).toEqual([expect.objectContaining({ id: "test.p", loaded: false, problem: { kind: "unresponsive" } })]);
  });
});

describe("plugin host process", () => {
  test("plugins run in their own process with a memory limit, not in the service", async () => {
    const root = path.join(home(), "plugins");
    plugin(root, "counter", COUNTER);
    const c = client(root);
    await c.loadAll();
    const r = await c.executePluginAction("test.counter", "pid");
    expect(r.pid).not.toBe(process.pid);
    expect(r.pid).toBe(c.hostPid());
    expect(r.execArgv).toContain("--max-old-space-size=512");
  });

  (process.platform === "win32" ? test : test.skip)("plugins in the host can encrypt secrets (DPAPI works in the host process)", async () => {
    const root = path.join(home(), "plugins");
    plugin(root, "vault", `let host; module.exports = { onLoad(h) { host = h; }, onAction() {
      const blob = host.protectSecret("secret-example");
      return { blob, back: host.unprotectSecret(blob) };
    } };`);
    const c = client(root);
    await c.loadAll();
    const r = await c.executePluginAction("test.vault", "a");
    expect(typeof r.blob).toBe("string");
    expect(r.blob).not.toContain("secret-example");
    expect(r.back).toBe("secret-example");
  });

  test("the plugin list, states, status and attention are mirrored in the service", async () => {
    const root = path.join(home(), "plugins");
    const dir = plugin(root, "counter", COUNTER);
    const c = client(root);
    const events = { states: 0, actions: 0, attention: [] };
    c.onStateChanged(() => events.states++);
    c.onActionsChanged(() => events.actions++);
    c.onAttentionChanged((items) => events.attention.push(items));
    await c.loadAll();
    expect(c.getPlugins()).toEqual([expect.objectContaining({ id: "test.counter", loaded: true, status: { text: "count 0", tone: "ok" } })]);
    expect(c.getPluginDir("test.counter")).toBe(dir);
    expect(c.getPluginActions().map((a) => a.id)).toEqual(["a", "b"]);
    expect(c.getPluginStates()).toEqual({ "test.counter": { a: { text: "0" } } });

    await expect(c.executePluginAction("test.counter", "a")).resolves.toEqual({ handled: true, n: 1 });
    await until(() => c.getPluginStates()["test.counter"].a.text === "1");
    expect(events.states).toBeGreaterThan(0);
    await until(() => c.getPlugins()[0].status.text === "count 1");

    await c.executePluginAction("test.counter", "a");
    await until(() => c.getAttention().length === 1);
    expect(c.getAttention()[0]).toMatchObject({ id: "x", title: "Olha", pluginId: "test.counter" });
    expect(events.attention.length).toBeGreaterThan(0);
  });

  test("the language reaches the plugins in the host", async () => {
    const root = path.join(home(), "plugins");
    plugin(root, "counter", COUNTER);
    const c = client(root);
    await c.loadAll();
    c.setLocale("es-ES");
    expect(c.getLocale()).toBe("es-ES");
    await until(() => c.getPluginStates()["test.counter"]?.a.text === "100");
  });

  test("install and remove: a folder loads on demand and unloads", async () => {
    const root = path.join(home(), "plugins");
    const c = client(root);
    await c.loadAll();
    expect(c.getPlugins()).toEqual([]);
    const dir = plugin(root, "late", COUNTER);
    expect(await c.loadFolder(dir)).toBe(true);
    expect(c.getPlugins().map((p) => p.id)).toEqual(["test.late"]);
    expect(await c.unload("test.late")).toBe(true);
    expect(c.getPlugins()).toEqual([]);
    expect(c.getPluginDir("test.late")).toBeNull();
    expect(c.getPluginsDir()).toBe(root);
  });

  test("a plugin stuck in a synchronous call is cut off; the others keep working", async () => {
    const root = path.join(home(), "plugins");
    plugin(root, "counter", COUNTER);
    plugin(root, "stuck", `let stuck = false; module.exports = { getState() { if (stuck) for (;;) {} return {}; }, onAction() { stuck = true; return { handled: true }; } };`);
    const c = client(root);
    await c.loadAll();
    const firstPid = c.hostPid();
    await c.executePluginAction("test.stuck", "a");
    await until(() => c.getPlugins().find((p) => p.id === "test.stuck")?.problem?.kind === "unresponsive");
    expect(c.hostPid()).not.toBe(firstPid);
    expect(c.getPlugins().find((p) => p.id === "test.counter")).toMatchObject({ loaded: true });
    await expect(c.executePluginAction("test.counter", "a")).resolves.toEqual({ handled: true, n: 1 });
    expect(spies.flatMap((s) => s.mock.calls).flat().map(String).join("\n")).toMatch(/test\.stuck.*getState.*stopped responding/);
  });

  test("a plugin that kills the host is turned off and the host comes back", async () => {
    const root = path.join(home(), "plugins");
    plugin(root, "counter", COUNTER);
    plugin(root, "killer", `module.exports = { onAction() { process.exit(3); } };`);
    const c = client(root);
    await c.loadAll();
    const r = await c.executePluginAction("test.killer", "a");
    expect(r).toEqual({ handled: false, failed: true });
    await until(() => c.getPlugins().find((p) => p.id === "test.killer")?.problem?.kind === "unresponsive");
    await expect(c.executePluginAction("test.counter", "a")).resolves.toEqual({ handled: true, n: 1 });
  });

  test("an uncaught error from a plugin's own timer turns that plugin off, not the others", async () => {
    const root = path.join(home(), "plugins");
    plugin(root, "counter", COUNTER);
    plugin(root, "thrower", `module.exports = { onAction() { setTimeout(() => { throw new Error("late boom"); }, 5); return { handled: true }; } };`);
    plugin(root, "rejecter", `module.exports = { onAction() { Promise.reject(new Error("lost promise")); return { handled: true }; } };`);
    const c = client(root);
    await c.loadAll();
    await c.executePluginAction("test.thrower", "a");
    await until(() => c.getPlugins().find((p) => p.id === "test.thrower")?.problem?.kind === "unresponsive");
    await c.executePluginAction("test.rejecter", "a");
    await until(() => c.getPlugins().find((p) => p.id === "test.rejecter")?.problem?.kind === "unresponsive");
    expect(c.getPlugins().find((p) => p.id === "test.counter")).toMatchObject({ loaded: true });
    await expect(c.executePluginAction("test.counter", "a")).resolves.toEqual({ handled: true, n: 1 });
  });

  test("an unresponsive plugin can be removed, and a reinstall gets a fresh chance", async () => {
    const root = path.join(home(), "plugins");
    const dir = plugin(root, "stuck", `let stuck = false; module.exports = { getState() { if (stuck) for (;;) {} return {}; }, onAction() { stuck = true; return {}; } };`);
    const c = client(root);
    await c.loadAll();
    await c.executePluginAction("test.stuck", "a");
    await until(() => c.getPlugins().find((p) => p.id === "test.stuck")?.problem?.kind === "unresponsive");
    expect(c.getPluginDir("test.stuck")).toBe(dir);
    expect(await c.unload("test.stuck")).toBe(true);
    expect(await c.loadFolder(dir)).toBe(true);
    expect(c.getPlugins().find((p) => p.id === "test.stuck")).toMatchObject({ loaded: true });
  });

  test("a host that keeps dying stops being restarted", async () => {
    const root = path.join(home(), "plugins");
    plugin(root, "bomb", `setTimeout(() => process.exit(1), 10); module.exports = {};`);
    const c = client(root, { maxRestarts: 3 });
    await c.loadAll();
    await until(() => c.isGivenUp(), 15000);
    expect(spies.flatMap((s) => s.mock.calls).flat().map(String).join("\n")).toMatch(/plugin host keeps exiting/);
  });

  test("shutting down stops the host process", async () => {
    const root = path.join(home(), "plugins");
    plugin(root, "counter", COUNTER);
    const c = client(root);
    await c.loadAll();
    const pid = c.hostPid();
    await c.unloadAll();
    await until(() => { try { process.kill(pid, 0); return false; } catch { return true; } });
  });

  test("a state that changes without stateChanged() still reaches the service", async () => {
    const root = path.join(home(), "plugins");
    plugin(root, "quiet", `let n = 0; module.exports = { onLoad() { setTimeout(() => { n = 7; }, 50); }, getState() { return { a: { text: String(n) } }; } };`);
    const c = client(root);
    await c.loadAll();
    await until(() => c.getPluginStates()["test.quiet"]?.a.text === "7", 5000);
  });

  test("the host does not outlive the service that started it, even with plugin timers running", async () => {
    const root = path.join(home(), "plugins");
    plugin(root, "ticker", `const t = setInterval(() => {}, 1000); module.exports = { onUnload() { clearInterval(t); } };`);
    const script = path.join(tmp, "parent.cjs");
    fs.writeFileSync(script, `
      const { PluginHostClient } = require(${JSON.stringify(path.join(tmp, "client.cjs"))});
      const c = new PluginHostClient({ hostEntry: ${JSON.stringify(hostEntry)}, pluginsDir: ${JSON.stringify(root)} });
      c.loadAll().then(() => console.log("HOST " + c.hostPid()));
      setInterval(() => {}, 1000);
    `);
    const parent = spawn(process.execPath, [script], { stdio: ["ignore", "pipe", "ignore"], env: { ...process.env, USERPROFILE: path.dirname(root), HOME: path.dirname(root) } });
    let out = "";
    parent.stdout.on("data", (d) => { out += d; });
    await until(() => /HOST \d+/.test(out));
    const pid = Number(/HOST (\d+)/.exec(out)[1]);
    parent.kill();
    await until(() => { try { process.kill(pid, 0); return false; } catch { return true; } });
  });
});
