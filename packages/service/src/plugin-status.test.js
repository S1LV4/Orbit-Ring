const fs = require("fs");
const os = require("os");
const path = require("path");
const esbuild = require("esbuild");

let tmp, PluginLoader;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-plugin-status-"));
  const out = path.join(tmp, "plugin-loader.cjs");
  esbuild.buildSync({ entryPoints: [path.join(__dirname, "plugin-loader.ts")], bundle: true, platform: "node", format: "cjs", outfile: out, logLevel: "silent" });
  ({ PluginLoader } = require(out));
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

let loader, logSpy;
async function load(code) {
  const pluginsDir = fs.mkdtempSync(path.join(tmp, "plugins-"));
  const dir = path.join(pluginsDir, "p");
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ id: "test.status", name: "Status", version: "1.0.0", author: "@a", description: "d", main: "index.js", actions: [{ id: "a", name: "A" }] }));
  fs.writeFileSync(path.join(dir, "index.js"), code);
  loader = new PluginLoader({ pluginsDir });
  await loader.loadAll();
  return loader;
}

beforeEach(() => { logSpy = jest.spyOn(console, "log").mockImplementation(() => {}); global.__status = { value: null }; });
afterEach(async () => { if (loader) await loader.unloadAll(); logSpy.mockRestore(); });

const STATUS_PLUGIN = `
module.exports = {
  onLoad(host) { global.__status.host = host; },
  getStatus() { return global.__status.value; },
  onAction(id) { global.__status.ran = id; return { handled: true }; },
};`;

test("a plugin can show a status in the plugin list, with an optional action button", async () => {
  global.__status.value = { text: "Authorized as ada", tone: "ok" };
  await load(STATUS_PLUGIN);
  expect(loader.getPlugins()[0].status).toEqual({ text: "Authorized as ada", tone: "ok" });

  global.__status.value = { text: "Not authorized", tone: "error", action: { id: "authorize", label: "Authorize" } };
  expect(loader.getPlugins()[0].status).toEqual({ text: "Not authorized", tone: "error", action: { id: "authorize", label: "Authorize" } });
  await loader.executePluginAction("test.status", "authorize");
  expect(global.__status.ran).toBe("authorize");
});

test("the status is sanitized: unknown tone, oversized text and bad action ids are cleaned up", async () => {
  global.__status.value = { text: "x".repeat(500), tone: "rainbow", action: { id: "bad id!", label: "Go" } };
  await load(STATUS_PLUGIN);
  const s = loader.getPlugins()[0].status;
  expect(s.tone).toBe("neutral");
  expect(s.text.length).toBe(200);
  expect(s.action).toBeUndefined();
  global.__status.value = "nonsense";
  expect(loader.getPlugins()[0].status).toBeUndefined();
});

test("a plugin without getStatus has no status", async () => {
  await load(`module.exports = { onAction() {} };`);
  expect(loader.getPlugins()[0].status).toBeUndefined();
});

test("when the status changes, the plugin list is announced again; an unchanged status is not", async () => {
  global.__status.value = { text: "Waiting", tone: "warn" };
  await load(STATUS_PLUGIN);
  const announced = [];
  loader.onActionsChanged((id) => announced.push(id));
  loader.onStateChanged(() => {});
  global.__status.host.stateChanged();
  expect(announced).toEqual([]);
  global.__status.value = { text: "Authorized", tone: "ok" };
  global.__status.host.stateChanged();
  expect(announced).toEqual(["test.status"]);
});
