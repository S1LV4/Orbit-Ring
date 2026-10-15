const fs = require("fs");
const os = require("os");
const path = require("path");
const net = require("net");
const Module = require("module");
const vm = require("vm");
const { EventEmitter } = require("events");
const esbuild = require("esbuild");

const CATALOG = path.resolve(__dirname, "..", "..", "..", "plugins");
const folders = fs.readdirSync(CATALOG, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
let pluginApi, apiTmp;
beforeAll(() => {
  apiTmp = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-compat-api-"));
  const out = path.join(apiTmp, "plugin-api.cjs");
  esbuild.buildSync({ entryPoints: [path.join(__dirname, "plugin-api.ts")], bundle: true, platform: "node", format: "cjs", outfile: out, logLevel: "silent" });
  pluginApi = require(out);
});
afterAll(() => fs.rmSync(apiTmp, { recursive: true, force: true }));

const manifestOf = (folder) => JSON.parse(fs.readFileSync(path.join(CATALOG, folder, "manifest.json"), "utf8"));

function jsFiles(dir, rel = "") {
  const out = [];
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const p = path.join(rel, e.name);
    if (e.isDirectory()) out.push(...jsFiles(dir, p));
    else if (e.name.endsWith(".js")) out.push(p);
  }
  return out;
}

test("the catalog is not empty and every folder is a plugin", () => {
  expect(folders.length).toBeGreaterThan(0);
  for (const f of folders) expect(fs.existsSync(path.join(CATALOG, f, "manifest.json"))).toBe(true);
});

test("plugin ids are unique across the catalog", () => {
  const ids = folders.map((f) => manifestOf(f).id);
  expect(new Set(ids).size).toBe(ids.length);
});

describe.each(folders)("contract: %s", (folder) => {
  const dir = path.join(CATALOG, folder);
  const m = manifestOf(folder);

  test("manifest has the fields the app reads", () => {
    expect(m.id).toMatch(/^[a-z0-9]+(\.[a-z0-9-]+)+$/);
    expect(typeof m.name === "string" && m.name.trim().length > 0).toBe(true);
    expect(m.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(typeof m.author === "string" && m.author.trim().length > 0).toBe(true);
    expect(typeof m.description === "string" && m.description.trim().length > 0).toBe(true);
    expect(typeof m.main).toBe("string");
    expect(fs.existsSync(path.join(dir, m.main))).toBe(true);
  });

  test("declares the plugin API it was written for, and this app provides it", () => {
    expect(typeof m.orbitApi).toBe("string");
    expect(pluginApi.apiCompatible(m.orbitApi)).toBe(true);
  });

  test("declares its permissions, and the checked ones match the modules its code requires", () => {
    expect(Array.isArray(m.permissions)).toBe(true);
    expect(pluginApi.readPermissions(m)).toEqual(m.permissions);
    const modules = jsFiles(dir).flatMap((rel) =>
      [...fs.readFileSync(path.join(dir, rel), "utf8").matchAll(/\brequire\(\s*["']([^"'.][^"']*)["']\s*\)/g)].map((x) => x[1]));
    const needed = pluginApi.permissionsForModules(modules);
    const declaredChecked = m.permissions.filter((p) => pluginApi.CHECKED_PERMISSIONS.includes(p));
    expect(declaredChecked).toEqual(needed);
  });

  test("actions have unique ids, a name and inner-SVG icons", () => {
    expect(Array.isArray(m.actions)).toBe(true);
    const ids = m.actions.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of m.actions) {
      expect(a.id).toMatch(/^[A-Za-z0-9_.:-]+$/);
      expect(typeof a.name === "string" && a.name.trim().length > 0).toBe(true);
      for (const icon of [a.icon, a.iconActive]) {
        if (icon === undefined) continue;
        expect(typeof icon).toBe("string");
        expect(icon).not.toMatch(/<svg|<script|\son[a-z]+\s*=/i);
      }
    }
  });

  test("code parses and requires only Node built-ins and its own files", () => {
    expect(fs.existsSync(path.join(dir, "node_modules"))).toBe(false);
    for (const rel of jsFiles(dir)) {
      const file = path.join(dir, rel);
      const src = fs.readFileSync(file, "utf8").replace(/^#!.*/, "");
      expect(() => new vm.Script(Module.wrap(src), { filename: file })).not.toThrow();
      for (const [, spec] of src.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g)) {
        if (spec.startsWith(".")) {
          const target = path.resolve(path.dirname(file), spec);
          const found = [target, target + ".js", target + ".json", path.join(target, "index.js")].some((p) => fs.existsSync(p) && fs.statSync(p).isFile());
          if (!found) throw new Error(`${folder}/${rel} requires a missing file: ${spec}`);
        } else if (!Module.builtinModules.includes(spec.replace(/^node:/, ""))) {
          throw new Error(`${folder}/${rel} requires "${spec}", which is not available to an installed plugin`);
        }
      }
    }
  });
});

describe("runtime: install from the catalog and load", () => {
  let tmp, pluginsDir, loader, catalog, saved, spies;

  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-compat-"));
    pluginsDir = path.join(tmp, "home", ".orbit", "plugins");
    saved = {};
    for (const k of ["USERPROFILE", "HOME", "ORBIT_HOME", "APPDATA", "LOCALAPPDATA"]) saved[k] = process.env[k];
    process.env.USERPROFILE = process.env.HOME = path.join(tmp, "home");
    process.env.ORBIT_HOME = path.join(tmp, "home", ".orbit");
    process.env.APPDATA = path.join(tmp, "home", "AppData", "Roaming");
    process.env.LOCALAPPDATA = path.join(tmp, "home", "AppData", "Local");
    fs.mkdirSync(pluginsDir, { recursive: true });

    spies = [
      jest.spyOn(net, "createConnection").mockImplementation(() => {
        const s = new EventEmitter();
        s.write = () => true; s.destroy = () => {}; s.end = () => {}; s.setTimeout = () => s;
        setImmediate(() => s.emit("error", Object.assign(new Error("ENOENT"), { code: "ENOENT" })));
        return s;
      }),
      jest.spyOn(console, "log").mockImplementation(() => {}),
      jest.spyOn(console, "warn").mockImplementation(() => {}),
      jest.spyOn(console, "error").mockImplementation(() => {}),
    ];

    const build = (name) => {
      const out = path.join(tmp, name + ".js");
      esbuild.buildSync({ entryPoints: [path.join(__dirname, name + ".ts")], bundle: true, platform: "node", format: "cjs", outfile: out, logLevel: "silent" });
      return require(out);
    };
    catalog = build("plugin-catalog");
    const { PluginLoader } = build("plugin-loader");
    loader = new PluginLoader({
      pluginsDir,
      hostServices: {
        getClaudeUsage: async () => ({ available: false, reason: "no_credentials" }),
        makeThumbnail: async () => null,
      },
    });
  });

  afterAll(async () => {
    await loader.unloadAll();
    for (const s of spies) s.mockRestore();
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  test("nothing is installed until asked", () => {
    const list = catalog.listCatalog(CATALOG, pluginsDir);
    expect(list.map((p) => p.id).sort()).toEqual(folders.map((f) => manifestOf(f).id).sort());
    expect(list.every((p) => p.installedVersion === null)).toBe(true);
    expect(fs.readdirSync(pluginsDir)).toEqual([]);
  });

  test.each(folders)("%s installs, loads and exposes its manifest actions", async (folder) => {
    const m = manifestOf(folder);
    const dir = catalog.installFromCatalog(CATALOG, m.id, pluginsDir);
    expect(path.dirname(dir)).toBe(pluginsDir);
    expect(await loader.loadFolder(dir)).toBe(true);

    const info = loader.getPlugins().find((p) => p.id === m.id);
    expect(info).toMatchObject({ id: m.id, name: m.name, version: m.version, author: m.author, loaded: true });
    const ids = info.actions.map((a) => a.id);
    for (const a of m.actions) expect(ids).toContain(a.id);
    for (const a of info.actions) expect(a.pluginId).toBe(m.id);

    expect(() => JSON.stringify(loader.getPluginStates())).not.toThrow();
    const entry = catalog.listCatalog(CATALOG, pluginsDir).find((p) => p.id === m.id);
    expect(entry).toMatchObject({ installedVersion: m.version, updateAvailable: false });
  });

  test("every plugin unloads and can be removed", async () => {
    for (const folder of folders) {
      const m = manifestOf(folder);
      const dir = loader.getPluginDir(m.id);
      expect(await loader.unload(m.id)).toBe(true);
      catalog.removeInstalled(dir, pluginsDir);
    }
    expect(loader.getPlugins()).toEqual([]);
    expect(fs.readdirSync(pluginsDir)).toEqual([]);
  });

  test("an unloaded plugin stays down: no connection attempt after onUnload()", async () => {
    for (const folder of folders) {
      const m = manifestOf(folder);
      const dir = catalog.installFromCatalog(CATALOG, m.id, pluginsDir);
      await loader.loadFolder(dir);
      await loader.unload(m.id);
      const calls = net.createConnection.mock.calls.length;
      await new Promise((r) => setTimeout(r, 120));
      expect([folder, net.createConnection.mock.calls.length]).toEqual([folder, calls]);
      catalog.removeInstalled(dir, pluginsDir);
    }
  });
});
