const fs = require("fs");
const os = require("os");
const path = require("path");
const esbuild = require("esbuild");

let tmp, ConfigStore;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-config-locale-"));
  const out = path.join(tmp, "config-store.cjs");
  esbuild.buildSync({
    entryPoints: [path.join(__dirname, "config-store.ts")],
    bundle: true, platform: "node", format: "cjs", outfile: out, logLevel: "silent",
  });
  ({ ConfigStore } = require(out));
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const file = () => path.join(fs.mkdtempSync(path.join(tmp, "home-")), "config.json");

test("the language follows the system until the user picks one", () => {
  expect(new ConfigStore(file()).getLocale()).toBe("system");
});

test("a picked language is saved and survives a restart", () => {
  const f = file();
  expect(new ConfigStore(f).setLocale("es-ES")).toBe(true);
  expect(new ConfigStore(f).getLocale()).toBe("es-ES");
  expect(JSON.parse(fs.readFileSync(f, "utf8")).locale).toBe("es-ES");
  expect(new ConfigStore(f).setLocale("system")).toBe(true);
  expect(new ConfigStore(f).getLocale()).toBe("system");
});

test("an unknown language is refused and leaves the setting alone", () => {
  const f = file();
  const store = new ConfigStore(f);
  store.setLocale("pt-BR");
  expect(store.setLocale("fr-FR")).toBe(false);
  expect(store.setLocale(42)).toBe(false);
  expect(new ConfigStore(f).getLocale()).toBe("pt-BR");
});

test("a hand-edited invalid value reads as system", () => {
  const f = file();
  new ConfigStore(f).setLocale("es-ES");
  const cfg = JSON.parse(fs.readFileSync(f, "utf8"));
  cfg.locale = "klingon";
  fs.writeFileSync(f, JSON.stringify(cfg));
  expect(new ConfigStore(f).getLocale()).toBe("system");
});
