const fs = require("fs");
const os = require("os");
const path = require("path");
const esbuild = require("esbuild");

let tmp, api, PluginLoader, catalog;

const build = (name) => {
  const out = path.join(tmp, name + ".cjs");
  esbuild.buildSync({ entryPoints: [path.join(__dirname, name + ".ts")], bundle: true, platform: "node", format: "cjs", outfile: out, logLevel: "silent" });
  return require(out);
};

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-plugin-api-"));
  api = build("plugin-api");
  ({ PluginLoader } = build("plugin-loader"));
  catalog = build("plugin-catalog");
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

let spies;
beforeEach(() => {
  spies = ["log", "warn", "error"].map((m) => jest.spyOn(console, m).mockImplementation(() => {}));
  global.__api = { ran: false };
});
afterEach(() => spies.forEach((s) => s.mockRestore()));

function plugin(root, folder, manifest, code = "global.__api.ran = true; module.exports = {};") {
  const dir = path.join(root, folder);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({
    id: `test.${folder}`, name: folder, version: "1.0.0", author: "@a", description: "d", main: "index.js",
    actions: [{ id: "a", name: "A" }], ...manifest,
  }));
  fs.writeFileSync(path.join(dir, "index.js"), code);
  return dir;
}
const dirFor = (prefix) => fs.mkdtempSync(path.join(tmp, prefix));

describe("orbitApi ranges", () => {
  test("the app announces the plugin API version it provides", () => {
    expect(api.PLUGIN_API_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test.each([
    ["^1", "1.0.0", true], ["^1.x", "1.4.2", true], ["^1.0", "1.0.0", true], ["^1.2", "1.4.0", true],
    ["^1.2.3", "1.2.3", true], ["^1.2.3", "1.2.4", true],
    ["^1.5", "1.4.0", false], ["^1.2.3", "1.2.2", false], ["^2", "1.9.9", false], ["^1", "2.0.0", false],
  ])("%s with API %s → %s", (range, version, ok) => {
    expect(api.apiCompatible(range, version)).toBe(ok);
  });

  test.each(["", "1.0.0", ">=1", "^", "^a.b", "^1.2.3.4", "^-1", null, 3, {}])("an unreadable range (%p) is refused", (range) => {
    expect(api.apiCompatible(range, "1.0.0")).toBe(false);
  });

  test("a plugin without orbitApi was written for API 1", () => {
    expect(api.requiredApi({})).toBe("^1.0.0");
    expect(api.requiredApi({ orbitApi: "^1.3" })).toBe("^1.3");
  });
});

describe("loader", () => {
  test("a compatible plugin loads", async () => {
    const root = dirFor("plugins-");
    plugin(root, "ok", { orbitApi: `^${api.PLUGIN_API_VERSION}` });
    const loader = new PluginLoader({ pluginsDir: root });
    await loader.loadAll();
    expect(global.__api.ran).toBe(true);
    expect(loader.getPlugins()).toEqual([expect.objectContaining({ id: "test.ok", loaded: true })]);
    expect(loader.getPlugins()[0].problem).toBeUndefined();
    await loader.unloadAll();
  });

  test("an incompatible plugin is not run, and is listed with the versions involved", async () => {
    const root = dirFor("plugins-");
    plugin(root, "future", { orbitApi: "^99.0" });
    const loader = new PluginLoader({ pluginsDir: root });
    await loader.loadAll();
    expect(global.__api.ran).toBe(false);
    expect(loader.getPlugins()).toEqual([expect.objectContaining({
      id: "test.future", loaded: false, actions: [],
      problem: { kind: "incompatible", requires: "^99.0", provides: api.PLUGIN_API_VERSION },
    })]);
    expect(loader.getPluginActions()).toEqual([]);
    expect(loader.getPluginStates()).toEqual({});
  });

  test("an incompatible plugin can still be removed", async () => {
    const root = dirFor("plugins-");
    const dir = plugin(root, "future", { orbitApi: "^99.0" });
    const loader = new PluginLoader({ pluginsDir: root });
    await loader.loadAll();
    expect(loader.getPluginDir("test.future")).toBe(dir);
    expect(await loader.unload("test.future")).toBe(true);
    expect(loader.getPlugins()).toEqual([]);
  });

  test("a plugin whose onLoad throws is listed as failed and can be removed", async () => {
    const root = dirFor("plugins-");
    const dir = plugin(root, "broken", {}, "module.exports = { onLoad() { throw new Error('boom'); } };");
    const loader = new PluginLoader({ pluginsDir: root });
    await loader.loadAll();
    expect(loader.getPlugins()).toEqual([expect.objectContaining({ id: "test.broken", loaded: false, problem: { kind: "failed" } })]);
    expect(loader.getPluginDir("test.broken")).toBe(dir);
    expect(await loader.unload("test.broken")).toBe(true);
    expect(loader.getPlugins()).toEqual([]);
  });

  test("a plugin whose main file throws on require is listed as failed", async () => {
    const root = dirFor("plugins-");
    plugin(root, "syntax", {}, "throw new Error('bad module');");
    const loader = new PluginLoader({ pluginsDir: root });
    await loader.loadAll();
    expect(loader.getPlugins()).toEqual([expect.objectContaining({ id: "test.syntax", loaded: false, problem: { kind: "failed" } })]);
  });

  test("an update that fixes a failed plugin replaces the failed entry", async () => {
    const root = dirFor("plugins-");
    const dir = plugin(root, "broken", {}, "module.exports = { onLoad() { throw new Error('boom'); } };");
    const loader = new PluginLoader({ pluginsDir: root });
    await loader.loadAll();
    await loader.unload("test.broken");
    fs.writeFileSync(path.join(dir, "fixed.js"), "module.exports = {};");
    const m = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ ...m, main: "fixed.js" }));
    expect(await loader.loadFolder(dir)).toBe(true);
    expect(loader.getPlugins()).toEqual([expect.objectContaining({ id: "test.broken", loaded: true })]);
  });
});

describe("loader bookkeeping", () => {
  test("unloading everything also forgets the plugins that were not running", async () => {
    const root = dirFor("plugins-");
    plugin(root, "future", { orbitApi: "^99.0" });
    const loader = new PluginLoader({ pluginsDir: root });
    await loader.loadAll();
    await loader.unloadAll();
    expect(loader.getPlugins()).toEqual([]);
    expect(loader.getPluginDir("test.future")).toBeNull();
  });

  test("a second folder with the id of a plugin that was refused is skipped, not run", async () => {
    const root = dirFor("plugins-");
    plugin(root, "a-future", { id: "test.same", orbitApi: "^99.0" });
    plugin(root, "b-copy", { id: "test.same", orbitApi: "^1.0" });
    const loader = new PluginLoader({ pluginsDir: root });
    await loader.loadAll();
    expect(global.__api.ran).toBe(false);
    expect(loader.getPlugins()).toEqual([expect.objectContaining({ id: "test.same", loaded: false })]);
  });
});

describe("catalog", () => {
  test("each entry says which API it needs and whether this app provides it", () => {
    const cat = dirFor("catalog-");
    plugin(cat, "now", { orbitApi: "^1.0" });
    plugin(cat, "legacy", {});
    plugin(cat, "future", { orbitApi: "^99.0" });
    const byId = Object.fromEntries(catalog.listCatalog(cat, dirFor("installed-")).map((e) => [e.id, e]));
    expect(byId["test.now"]).toMatchObject({ orbitApi: "^1.0", compatible: true });
    expect(byId["test.legacy"]).toMatchObject({ orbitApi: "^1.0.0", compatible: true });
    expect(byId["test.future"]).toMatchObject({ orbitApi: "^99.0", compatible: false });
  });

  test("installing an incompatible plugin is refused and copies nothing", () => {
    const cat = dirFor("catalog-");
    const installed = dirFor("installed-");
    plugin(cat, "future", { orbitApi: "^99.0" });
    expect(() => catalog.installFromCatalog(cat, "test.future", installed)).toThrow(/\^99\.0/);
    expect(fs.readdirSync(installed)).toEqual([]);
  });
});

describe("permissions", () => {
  test("the app knows four permissions", () => {
    expect(api.PLUGIN_PERMISSIONS).toEqual(["commands", "network", "appData", "credentials"]);
  });

  test("a declared list is cleaned: unknown names dropped, duplicates removed, fixed order", () => {
    expect(api.readPermissions({ permissions: ["network", "telepathy", "commands", "network"] })).toEqual(["commands", "network"]);
    expect(api.readPermissions({ permissions: [] })).toEqual([]);
  });

  test("a plugin that does not declare its permissions is reported as undeclared, not as harmless", () => {
    expect(api.readPermissions({})).toBeNull();
    expect(api.readPermissions({ permissions: "commands" })).toBeNull();
  });

  test.each([
    ["child_process", ["commands"]], ["node:child_process", ["commands"]],
    ["http", ["network"]], ["https", ["network"]], ["http2", ["network"]], ["net", ["network"]], ["node:net", ["network"]],
    ["tls", ["network"]], ["dgram", ["network"]],
    ["fs", []], ["path", []], ["os", []], ["crypto", []], ["worker_threads", []],
  ])("requiring %s needs %p", (mod, perms) => {
    expect(api.permissionsForModules([mod])).toEqual(perms);
  });

  test("the Node modules a plugin requires tell which checked permissions it needs", () => {
    expect(api.permissionsForModules(["fs", "path", "child_process", "https", "node:net"])).toEqual(["commands", "network"]);
    expect(api.permissionsForModules(["fs", "path", "os", "crypto"])).toEqual([]);
    expect(api.permissionsForModules(["http2", "tls", "dgram"])).toEqual(["network"]);
  });

  test("the loader lists each plugin's permissions, or null when undeclared", async () => {
    const root = dirFor("plugins-");
    plugin(root, "declared", { orbitApi: "^1.0", permissions: ["network", "commands"] });
    plugin(root, "silent", { orbitApi: "^1.0" });
    plugin(root, "future", { orbitApi: "^99.0", permissions: ["credentials"] });
    const loader = new PluginLoader({ pluginsDir: root });
    await loader.loadAll();
    const byId = Object.fromEntries(loader.getPlugins().map((p) => [p.id, p]));
    expect(byId["test.declared"].permissions).toEqual(["commands", "network"]);
    expect(byId["test.silent"].permissions).toBeNull();
    expect(byId["test.future"].permissions).toEqual(["credentials"]);
    await loader.unloadAll();
  });

  test("the catalog shows a plugin's permissions before it is installed", () => {
    const cat = dirFor("catalog-");
    plugin(cat, "declared", { permissions: ["appData", "commands"] });
    plugin(cat, "silent", {});
    const byId = Object.fromEntries(catalog.listCatalog(cat, dirFor("installed-")).map((e) => [e.id, e]));
    expect(byId["test.declared"].permissions).toEqual(["commands", "appData"]);
    expect(byId["test.silent"].permissions).toBeNull();
  });
});
