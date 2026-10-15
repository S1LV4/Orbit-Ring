const fs = require("fs");
const os = require("os");
const path = require("path");
const esbuild = require("esbuild");

let tmp, PluginLoader;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-plugin-timeouts-"));
  const out = path.join(tmp, "plugin-loader.cjs");
  esbuild.buildSync({ entryPoints: [path.join(__dirname, "plugin-loader.ts")], bundle: true, platform: "node", format: "cjs", outfile: out, logLevel: "silent" });
  ({ PluginLoader } = require(out));
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

let spies;
beforeEach(() => {
  spies = ["log", "warn", "error"].map((m) => jest.spyOn(console, m).mockImplementation(() => {}));
  global.__t = { unloaded: 0 };
});
afterEach(() => spies.forEach((s) => s.mockRestore()));

const TIMEOUTS = { load: 80, action: 80, unload: 80 };
const NEVER = "new Promise(() => {})";
const logged = () => spies.flatMap((s) => s.mock.calls).flat().map(String).join("\n");

let n = 0;
async function load(code, timeouts = TIMEOUTS) {
  const root = fs.mkdtempSync(path.join(tmp, "plugins-"));
  const folder = `p${++n}`;
  const dir = path.join(root, folder);
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({
    id: `test.${folder}`, name: folder, version: "1.0.0", author: "@a", description: "d", main: "index.js",
    orbitApi: "^1.0", actions: [{ id: "a", name: "A" }],
  }));
  fs.writeFileSync(path.join(dir, "index.js"), code);
  const loader = new PluginLoader({ pluginsDir: root, timeouts });
  await loader.loadAll();
  return { loader, id: `test.${folder}` };
}

test("an onLoad that never finishes does not block the app: the plugin is marked failed and told to stop", async () => {
  const started = Date.now();
  const { loader, id } = await load(`module.exports = { onLoad() { return ${NEVER}; }, onUnload() { global.__t.unloaded++; } };`);
  expect(Date.now() - started).toBeLessThan(2000);
  expect(loader.getPlugins()).toEqual([expect.objectContaining({ id, loaded: false, problem: { kind: "failed" } })]);
  expect(global.__t.unloaded).toBe(1);
  expect(logged()).toMatch(/onLoad\(\) did not finish/);
});

test("other plugins still load after one hangs in onLoad", async () => {
  const root = fs.mkdtempSync(path.join(tmp, "plugins-"));
  for (const [folder, code] of [["a-hang", `module.exports = { onLoad() { return ${NEVER}; } };`], ["b-fine", "module.exports = {};"]]) {
    fs.mkdirSync(path.join(root, folder));
    fs.writeFileSync(path.join(root, folder, "manifest.json"), JSON.stringify({ id: `test.${folder}`, name: folder, version: "1.0.0", author: "@a", description: "d", main: "index.js", orbitApi: "^1.0", actions: [] }));
    fs.writeFileSync(path.join(root, folder, "index.js"), code);
  }
  const loader = new PluginLoader({ pluginsDir: root, timeouts: TIMEOUTS });
  await loader.loadAll();
  expect(loader.getPlugins().find((p) => p.id === "test.b-fine")).toMatchObject({ loaded: true });
});

test("an action that never finishes resolves as timed out", async () => {
  const { loader, id } = await load(`module.exports = { onAction() { return ${NEVER}; } };`);
  const started = Date.now();
  await expect(loader.executePluginAction(id, "a")).resolves.toEqual({ handled: false, timedOut: true });
  expect(Date.now() - started).toBeLessThan(2000);
  expect(logged()).toMatch(/action "a" did not finish/);
});

test("a fast action still returns its own result", async () => {
  const { loader, id } = await load(`module.exports = { onAction(a) { return { handled: true, a }; } };`);
  await expect(loader.executePluginAction(id, "a")).resolves.toEqual({ handled: true, a: "a" });
});

test("an onUnload that never finishes does not stop the plugin from being removed", async () => {
  const { loader, id } = await load(`module.exports = { onUnload() { return ${NEVER}; } };`);
  const started = Date.now();
  expect(await loader.unload(id)).toBe(true);
  expect(Date.now() - started).toBeLessThan(2000);
  expect(loader.getPlugins()).toEqual([]);
  expect(logged()).toMatch(/onUnload\(\) did not finish/);
});

test("shutting down is not held up by a plugin that never finishes onUnload", async () => {
  const { loader } = await load(`module.exports = { onUnload() { return ${NEVER}; } };`);
  const started = Date.now();
  await loader.unloadAll();
  expect(Date.now() - started).toBeLessThan(2000);
  expect(loader.getPlugins()).toEqual([]);
});

test("the default limits are generous and bounded", () => {
  expect(PluginLoader.DEFAULT_TIMEOUTS).toEqual({ load: 15000, action: 15000, unload: 5000 });
});
