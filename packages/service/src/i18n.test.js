const fs = require("fs");
const os = require("os");
const path = require("path");
const esbuild = require("esbuild");

const LOCALES_DIR = path.resolve(__dirname, "..", "..", "shared", "locales");
let tmp, i18n;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-i18n-"));
  const out = path.join(tmp, "i18n.js");
  esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, "..", "..", "shared", "src", "i18n.ts")],
    bundle: true, platform: "node", format: "cjs", outfile: out, logLevel: "silent",
  });
  i18n = require(out);
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

function leaves(obj, prefix = "") {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !("other" in v)) Object.assign(out, leaves(v, key));
    else out[key] = v;
  }
  return out;
}
const placeholders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("dictionaries", () => {
  test("live in one folder per BCP 47 tag, one JSON file per namespace", () => {
    const tags = fs.readdirSync(LOCALES_DIR).filter((d) => fs.statSync(path.join(LOCALES_DIR, d)).isDirectory());
    expect(i18n.DEFAULT_LOCALE).toBe("en-US");
    expect(tags).toContain(i18n.DEFAULT_LOCALE);
    for (const tag of tags) {
      expect(tag).toMatch(/^[a-z]{2,3}(-[A-Z]{2})?$/);
      expect(Intl.getCanonicalLocales(tag)).toEqual([tag]);
      for (const f of fs.readdirSync(path.join(LOCALES_DIR, tag))) expect(f).toMatch(/^[a-z][a-z-]*\.json$/);
    }
    expect(i18n.LOCALES.slice().sort()).toEqual(tags.slice().sort());
  });

  test("every message is a non-empty string or a CLDR plural object", () => {
    for (const locale of i18n.LOCALES) {
      for (const [key, v] of Object.entries(leaves(i18n.MESSAGES[locale]))) {
        if (typeof v === "string") { expect([key, v.trim().length > 0]).toEqual([key, true]); continue; }
        expect(Object.keys(v).every((c) => ["zero", "one", "two", "few", "many", "other"].includes(c))).toBe(true);
        expect(typeof v.other).toBe("string");
      }
    }
  });

  test("every locale has the same keys and placeholders as the default one", () => {
    const base = leaves(i18n.MESSAGES[i18n.DEFAULT_LOCALE]);
    for (const locale of i18n.LOCALES) {
      const other = leaves(i18n.MESSAGES[locale]);
      expect([locale, Object.keys(other).sort()]).toEqual([locale, Object.keys(base).sort()]);
      for (const [key, v] of Object.entries(base)) {
        const a = typeof v === "string" ? v : v.other;
        const b = typeof other[key] === "string" ? other[key] : other[key].other;
        expect([locale, key, placeholders(b)]).toEqual([locale, key, placeholders(a)]);
      }
    }
  });
});

describe("resolveLocale", () => {
  test("picks the first supported preference, by exact tag or by language", () => {
    expect(i18n.resolveLocale(["pt-BR"])).toBe("pt-BR");
    expect(i18n.resolveLocale(["pt-br"])).toBe("pt-BR");
    expect(i18n.resolveLocale(["pt-PT", "en-US"])).toBe("pt-BR");
    expect(i18n.resolveLocale("pt")).toBe("pt-BR");
  });

  test("ships pt-BR, en-US and es-ES, and maps regional variants to them", () => {
    expect(i18n.LOCALES.slice().sort()).toEqual(["en-US", "es-ES", "pt-BR"]);
    expect(i18n.resolveLocale(["en-US"])).toBe("en-US");
    expect(i18n.resolveLocale(["en-GB"])).toBe("en-US");
    expect(i18n.resolveLocale(["es-MX", "pt-BR"])).toBe("es-ES");
    expect(i18n.resolveLocale(["fr-FR", "es-AR"])).toBe("es-ES");
  });

  test("falls back to the default locale", () => {
    expect(i18n.resolveLocale([])).toBe(i18n.DEFAULT_LOCALE);
    expect(i18n.resolveLocale(undefined)).toBe(i18n.DEFAULT_LOCALE);
    expect(i18n.resolveLocale(["xx-YY", "", null])).toBe(i18n.DEFAULT_LOCALE);
  });
});

describe("createTranslator", () => {
  const msgs = {
    "pt-BR": { a: { hello: "Olá, {name}", items: { one: "{count} item", other: "{count} itens" } } },
    "en-US": { a: { only: "only en" } },
    "xx-XX": { a: { hello: "Hi, {name}" } },
  };

  test("looks a key up by its dotted path and fills placeholders", () => {
    const t = i18n.createTranslator("pt-BR", msgs);
    expect(t("a.hello", { name: "Ada" })).toBe("Olá, Ada");
    expect(t("a.hello")).toBe("Olá, {name}");
  });

  test("chooses the plural form with the locale's CLDR rules", () => {
    const t = i18n.createTranslator("pt-BR", msgs);
    expect(t("a.items", { count: 1 })).toBe("1 item");
    expect(t("a.items", { count: 0 })).toBe("0 item");
    expect(t("a.items", { count: 3 })).toBe("3 itens");
  });

  test("falls back to the default locale, then to the key itself", () => {
    const t = i18n.createTranslator("xx-XX", msgs);
    expect(t("a.hello", { name: "Ada" })).toBe("Hi, Ada");
    expect(t("a.only")).toBe("only en");
    expect(t("a.missing")).toBe("a.missing");
    expect(t("a")).toBe("a");
  });

  test("translates with each bundled locale", () => {
    expect(i18n.createTranslator("en-US")("tray.quit")).toBe("Quit");
    expect(i18n.createTranslator("es-ES")("tray.quit")).toBe("Salir");
    expect(i18n.createTranslator("en-US")("profiles.actionCount", { count: 1 })).toBe("1 action");
    expect(i18n.createTranslator("es-ES")("profiles.actionCount", { count: 2 })).toBe("2 acciones");
  });

  test("uses the bundled dictionaries by default, English first", () => {
    const t = i18n.createTranslator(i18n.DEFAULT_LOCALE);
    expect(t("tray.quit")).toBe("Quit");
    expect(t("catalog.actions.copy")).toBe("Copy");
    expect(t("catalog.categories.edit")).toBe("Editing");
    expect(i18n.createTranslator("pt-BR")("tray.quit")).toBe("Sair");
  });
});
