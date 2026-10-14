const fs = require("fs");
const os = require("os");
const path = require("path");
const esbuild = require("esbuild");

const HELPER = path.resolve(__dirname, "..", "plugin-kit", "i18n.js");
let tmp, PluginLoader, catalog;

const build = (name) => {
  const out = path.join(tmp, name + ".cjs");
  esbuild.buildSync({ entryPoints: [path.join(__dirname, name + ".ts")], bundle: true, platform: "node", format: "cjs", outfile: out, logLevel: "silent" });
  return require(out);
};

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-plugin-locale-"));
  ({ PluginLoader } = build("plugin-loader"));
  catalog = build("plugin-catalog");
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

function writePlugin(root, { locales = {}, code } = {}) {
  const dir = path.join(root, "hello");
  fs.mkdirSync(path.join(dir, "locales"), { recursive: true });
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({
    id: "test.hello", name: "Hello", version: "1.0.0", author: "@octocat", description: "Says hello", main: "index.js",
    actions: [{ id: "wave", name: "Wave", description: "Waves" }, { id: "bow", name: "Bow" }],
  }));
  for (const [tag, json] of Object.entries(locales)) fs.writeFileSync(path.join(dir, "locales", `${tag}.json`), JSON.stringify(json));
  fs.writeFileSync(path.join(dir, "index.js"), code ?? `
    const seen = (global.__hello = { locales: [] });
    module.exports = {
      onLoad(host) { seen.host = host; seen.locales.push(host.locale); },
      onLocaleChanged(locale) { seen.locales.push("changed:" + locale); },
      onAction() {},
    };`);
  return dir;
}

const LOCALES = {
  "en-US": { manifest: { name: "Hello", description: "Says hello", actions: { wave: { name: "Wave", description: "Waves" } } } },
  "pt-BR": { manifest: { name: "Olá", description: "Diz olá", actions: { wave: { name: "Acenar", description: "Acena" } } } },
};

describe("the plugin loader and languages", () => {
  let dir, pluginsDir, loader, logSpy;
  beforeEach(async () => {
    pluginsDir = fs.mkdtempSync(path.join(tmp, "plugins-"));
    dir = writePlugin(pluginsDir, { locales: LOCALES });
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    loader = new PluginLoader({ pluginsDir, locale: "pt-BR" });
    await loader.loadAll();
  });
  afterEach(async () => { await loader.unloadAll(); logSpy.mockRestore(); });

  test("hands the current language to the plugin", () => {
    expect(global.__hello.locales).toEqual(["pt-BR"]);
    expect(global.__hello.host.locale).toBe("pt-BR");
  });

  test("shows the plugin and action names in that language, falling back to the manifest", () => {
    const [p] = loader.getPlugins();
    expect(p).toMatchObject({ name: "Olá", description: "Diz olá" });
    expect(p.actions.map((a) => [a.id, a.name, a.description])).toEqual([["wave", "Acenar", "Acena"], ["bow", "Bow", undefined]]);
    expect(loader.getPluginActions().map((a) => a.name)).toEqual(["Acenar", "Bow"]);
  });

  test("a language change reaches the plugin and re-announces its actions", () => {
    const announced = [];
    loader.onActionsChanged((id) => announced.push(id));
    loader.setLocale("es-ES");
    expect(global.__hello.locales).toEqual(["pt-BR", "changed:es-ES"]);
    expect(global.__hello.host.locale).toBe("es-ES");
    expect(loader.getPlugins()[0].name).toBe("Hello");
    expect(announced).toEqual(["test.hello"]);
  });

  test("the same language again changes nothing", () => {
    const announced = [];
    loader.onActionsChanged((id) => announced.push(id));
    loader.setLocale("pt-BR");
    expect(global.__hello.locales).toEqual(["pt-BR"]);
    expect(announced).toEqual([]);
  });
});

test("the catalog lists plugins in the chosen language", () => {
  const catalogDir = fs.mkdtempSync(path.join(tmp, "catalog-"));
  writePlugin(catalogDir, { locales: LOCALES });
  const installed = fs.mkdtempSync(path.join(tmp, "installed-"));
  expect(catalog.listCatalog(catalogDir, installed, "pt-BR")[0]).toMatchObject({ name: "Olá", description: "Diz olá" });
  expect(catalog.listCatalog(catalogDir, installed, "es-ES")[0]).toMatchObject({ name: "Hello", description: "Says hello" });
  expect(catalog.listCatalog(catalogDir, installed)[0]).toMatchObject({ name: "Hello" });
});

describe("the i18n helper every plugin carries", () => {
  let createI18n, dir, saved;
  beforeAll(() => {
    createI18n = require(HELPER);
    dir = fs.mkdtempSync(path.join(tmp, "helper-"));
    fs.mkdirSync(path.join(dir, "locales"));
    fs.writeFileSync(path.join(dir, "locales", "en-US.json"), JSON.stringify({ hi: "Hi, {name}", games: { one: "{count} game", other: "{count} games" }, onlyEn: "only en" }));
    fs.writeFileSync(path.join(dir, "locales", "pt-BR.json"), JSON.stringify({ hi: "Oi, {name}", games: { one: "{count} jogo", other: "{count} jogos" } }));
  });
  beforeEach(() => { saved = process.env.ORBIT_PLUGIN_LOCALE; delete process.env.ORBIT_PLUGIN_LOCALE; });
  afterEach(() => { if (saved === undefined) delete process.env.ORBIT_PLUGIN_LOCALE; else process.env.ORBIT_PLUGIN_LOCALE = saved; });

  test("starts in English and switches by tag or language", () => {
    const i18n = createI18n(dir);
    i18n.setLocale("en-US");
    expect(i18n.locale).toBe("en-US");
    expect(i18n.t("hi", { name: "Ada" })).toBe("Hi, Ada");
    expect(i18n.setLocale("pt-PT")).toBe("pt-BR");
    expect(i18n.t("hi", { name: "Ada" })).toBe("Oi, Ada");
    expect(i18n.setLocale("fr-FR")).toBe("en-US");
    expect(i18n.setLocale(undefined)).toBe("en-US");
  });

  test("plural forms, fallback to English, then to the key", () => {
    const i18n = createI18n(dir);
    i18n.setLocale("pt-BR");
    expect(i18n.t("games", { count: 1 })).toBe("1 jogo");
    expect(i18n.t("games", { count: 5 })).toBe("5 jogos");
    expect(i18n.t("onlyEn")).toBe("only en");
    expect(i18n.t("missing.key")).toBe("missing.key");
  });

  test("formats numbers for the language", () => {
    const i18n = createI18n(dir);
    i18n.setLocale("en-US");
    expect(i18n.number(4.2, { maximumFractionDigits: 1 })).toBe("4.2");
    i18n.setLocale("pt-BR");
    expect(i18n.number(4.2, { maximumFractionDigits: 1 })).toBe("4,2");
  });

  test("ORBIT_PLUGIN_LOCALE sets the starting language (tests pin it)", () => {
    process.env.ORBIT_PLUGIN_LOCALE = "pt-BR";
    const other = fs.mkdtempSync(path.join(tmp, "helper-env-"));
    fs.mkdirSync(path.join(other, "locales"));
    fs.copyFileSync(path.join(dir, "locales", "pt-BR.json"), path.join(other, "locales", "pt-BR.json"));
    expect(createI18n(other).locale).toBe("pt-BR");
  });

  test("every file of a plugin shares one instance, so a language change reaches all of them", () => {
    const a = createI18n(dir), b = createI18n(dir);
    expect(b).toBe(a);
    a.setLocale("pt-BR");
    expect(b.t("hi", { name: "Ada" })).toBe("Oi, Ada");
    a.setLocale("en-US");
  });

  test("a plugin without locales still answers with keys", () => {
    const empty = fs.mkdtempSync(path.join(tmp, "empty-"));
    expect(createI18n(empty).t("x")).toBe("x");
  });
});
