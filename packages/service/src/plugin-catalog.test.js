const fs = require("fs");
const os = require("os");
const path = require("path");
const esbuild = require("esbuild");

let buildDir, tmp, catalog, installed, mod;

function plugin(root, folder, manifest, files = {}) {
  const dir = path.join(root, folder);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
  for (const [f, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), text);
  }
  return dir;
}
const read = (...p) => fs.readFileSync(path.join(...p), "utf8");

beforeAll(() => {
  buildDir = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-catalog-build-"));
  const out = path.join(buildDir, "m.js");
  esbuild.buildSync({
    entryPoints: [path.join(__dirname, "plugin-catalog.ts")],
    bundle: true, platform: "node", format: "cjs", outfile: out, logLevel: "silent",
  });
  mod = require(out);
});
afterAll(() => fs.rmSync(buildDir, { recursive: true, force: true }));

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-catalog-"));
  catalog = path.join(tmp, "catalog");
  installed = path.join(tmp, "home", "plugins");
  fs.mkdirSync(catalog, { recursive: true });
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

test("compareVersions orders dotted versions numerically", () => {
  expect(mod.compareVersions("1.10.0", "1.9.9")).toBeGreaterThan(0);
  expect(mod.compareVersions("1.0", "1.0.0")).toBe(0);
  expect(mod.compareVersions("1.2.3", "1.3.0")).toBeLessThan(0);
  expect(mod.compareVersions(undefined, "0")).toBe(0);
});

test("no catalog folder → empty catalog, and listing installs nothing", () => {
  expect(mod.listCatalog(undefined, installed)).toEqual([]);
  expect(mod.listCatalog(path.join(tmp, "missing"), installed)).toEqual([]);
  plugin(catalog, "alpha", { id: "x.alpha", name: "Alpha", version: "1.0.0" });
  mod.listCatalog(catalog, installed);
  expect(fs.existsSync(installed)).toBe(false);
});

test("lists catalog plugins sorted by name, with author and installed state", () => {
  plugin(catalog, "zeta", { id: "x.zeta", name: "Zeta", version: "2.0.0", author: "@S1LV4", description: "Z", actions: [{ id: "a" }, { id: "b" }] });
  plugin(catalog, "alpha", { id: "x.alpha", name: "Alpha", version: "1.3.0", author: "@S1LV4, @other" });
  plugin(catalog, "beta", { id: "x.beta", name: "Beta", version: "1.0.0" });
  fs.mkdirSync(path.join(catalog, "not-a-plugin"));
  fs.writeFileSync(path.join(catalog, "README.md"), "x");
  plugin(installed, "my-alpha", { id: "x.alpha", name: "Alpha", version: "1.2.0" });
  plugin(installed, "beta", { id: "x.beta", name: "Beta", version: "1.0.0" });

  const list = mod.listCatalog(catalog, installed);
  expect(list.map((p) => p.name)).toEqual(["Alpha", "Beta", "Zeta"]);
  expect(list[0]).toEqual({
    id: "x.alpha", name: "Alpha", version: "1.3.0", author: "@S1LV4, @other", description: "",
    actionCount: 0, installedVersion: "1.2.0", updateAvailable: true, orbitApi: "^1.0.0", compatible: true, permissions: null,
  });
  expect(list[1]).toMatchObject({ installedVersion: "1.0.0", updateAvailable: false });
  expect(list[2]).toMatchObject({ author: "@S1LV4", actionCount: 2, installedVersion: null, updateAvailable: false });
  expect(JSON.stringify(list)).not.toContain(catalog.replace(/\\/g, "\\\\"));
});

test("install copies the whole folder into the plugins folder", () => {
  plugin(catalog, "alpha", { id: "x.alpha", name: "Alpha", version: "1.0.0" }, { "index.js": "A", "hook/h.js": "H" });
  const dir = mod.installFromCatalog(catalog, "x.alpha", installed);
  expect(dir).toBe(path.join(installed, "alpha"));
  expect(read(dir, "index.js")).toBe("A");
  expect(read(dir, "hook", "h.js")).toBe("H");
  expect(mod.listCatalog(catalog, installed)[0].installedVersion).toBe("1.0.0");
});

test("update replaces shipped files in place and keeps what the user added", () => {
  plugin(catalog, "alpha", { id: "x.alpha", name: "Alpha", version: "1.3.0" }, { "index.js": "new" });
  plugin(installed, "my-alpha", { id: "x.alpha", name: "Alpha", version: "1.2.9" }, { "index.js": "old", "token.json": "keep" });
  const dir = mod.installFromCatalog(catalog, "x.alpha", installed);
  expect(dir).toBe(path.join(installed, "my-alpha"));
  expect(read(dir, "index.js")).toBe("new");
  expect(read(dir, "token.json")).toBe("keep");
  expect(fs.existsSync(path.join(installed, "alpha"))).toBe(false);
});

test("install refuses an unknown id and a folder name taken by another plugin", () => {
  plugin(catalog, "alpha", { id: "x.alpha", name: "Alpha", version: "1.0.0" }, { "index.js": "A" });
  expect(() => mod.installFromCatalog(catalog, "x.nope", installed)).toThrow(/not in the catalog/);
  plugin(installed, "alpha", { id: "someone.else", name: "Other", version: "9" }, { "index.js": "theirs" });
  expect(() => mod.installFromCatalog(catalog, "x.alpha", installed)).toThrow(/already exists/);
  expect(read(installed, "alpha", "index.js")).toBe("theirs");
});

test("remove deletes only a direct child of the plugins folder", () => {
  const dir = plugin(installed, "alpha", { id: "x.alpha", name: "Alpha", version: "1.0.0" }, { "index.js": "A" });
  const outside = plugin(tmp, "outside", { id: "x.out", name: "Out", version: "1" });
  expect(() => mod.removeInstalled(outside, installed)).toThrow(/outside/);
  expect(() => mod.removeInstalled(installed, installed)).toThrow(/outside/);
  expect(() => mod.removeInstalled(path.join(dir, "nested"), installed)).toThrow(/outside/);
  expect(fs.existsSync(outside)).toBe(true);
  mod.removeInstalled(dir, installed);
  expect(fs.existsSync(dir)).toBe(false);
  expect(fs.existsSync(catalog)).toBe(true);
});
