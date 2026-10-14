const fs = require("fs");
const os = require("os");
const path = require("path");
const esbuild = require("esbuild");

let tmp, defaultRing;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-config-defaults-"));
  const out = path.join(tmp, "config-store.cjs");
  esbuild.buildSync({
    entryPoints: [path.join(__dirname, "config-store.ts")],
    bundle: true, platform: "node", format: "cjs", outfile: out, logLevel: "silent",
  });
  ({ defaultRing } = require(out));
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const names = (locale) => defaultRing(locale).groups.map((g) => g.name);

test("a new config names its default groups in the system language", () => {
  expect(names("pt-BR")).toEqual(["Edição", "Navegação", "Janelas", "Mídia", "Captura", "Sistema"]);
  expect(names("en-US")).toEqual(["Editing", "Navigation", "Windows", "Media", "Capture", "System"]);
  expect(names("es-ES")).toEqual(["Edición", "Navegación", "Ventanas", "Multimedia", "Captura", "Sistema"]);
  expect(names("fr-FR")).toEqual(names("en-US"));
});

test("the default groups and settings are the same in every language", () => {
  const strip = (r) => ({ ...r, groups: r.groups.map(({ name, ...g }) => g) });
  expect(strip(defaultRing("en-US"))).toEqual(strip(defaultRing("pt-BR")));
  expect(defaultRing("pt-BR").groups.map((g) => g.id)).toEqual(["edit", "nav", "win", "media", "cap", "sys"]);
});
