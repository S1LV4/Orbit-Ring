const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const CATALOG = path.resolve(__dirname, "..", "..", "..", "plugins");
const HELPER = fs.readFileSync(path.resolve(__dirname, "..", "plugin-kit", "i18n.js"), "utf8").replace(/\r\n/g, "\n");
const LOCALES = ["en-US", "pt-BR", "es-ES"];
const folders = fs.readdirSync(CATALOG, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();

function leaves(obj, prefix = "") {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !("other" in v)) Object.assign(out, leaves(v, key));
    else out[key] = v;
  }
  return out;
}
const placeholders = (v) => [...String(typeof v === "string" ? v : v.other).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

function jsFiles(dir, rel = "") {
  const out = [];
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const p = path.join(rel, e.name);
    if (e.isDirectory()) { if (e.name !== "locales") out.push(...jsFiles(dir, p)); }
    else if (e.name.endsWith(".js") && e.name !== "i18n.js") out.push(p);
  }
  return out;
}

function scan(file) {
  const text = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const accented = [], keys = [];
  const visit = (n) => {
    if (ts.isCallExpression(n)) {
      const callee = n.expression.getText(sf);
      if (/(^|\.)t$/.test(callee) && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) keys.push(n.arguments[0].text);
      if (/^console\.|\.log$|\blog$|\bwarn$/.test(callee)) return;
    }
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n))
      && /[À-ÿ]/.test(n.text)) {
      accented.push(`${path.basename(file)}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1} ${JSON.stringify(n.text.slice(0, 60))}`);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return { accented, keys };
}

describe.each(folders)("plugin %s speaks every app language", (folder) => {
  const dir = path.join(CATALOG, folder);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
  const read = (tag) => {
    const f = path.join(dir, "locales", `${tag}.json`);
    return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null;
  };

  test("a plugin that translates in code carries the shared i18n helper unchanged", () => {
    const own = path.join(dir, "i18n.js");
    const usesT = jsFiles(dir).some((f) => scan(path.join(dir, f)).keys.length > 0);
    if (usesT) expect(fs.existsSync(own)).toBe(true);
    if (fs.existsSync(own)) expect(fs.readFileSync(own, "utf8").replace(/\r\n/g, "\n")).toBe(HELPER);
  });

  test("has a dictionary per app language with the same keys and placeholders as en-US", () => {
    const base = leaves(read("en-US"));
    expect(Object.keys(base).length).toBeGreaterThan(0);
    for (const tag of LOCALES.slice(1)) {
      const other = leaves(read(tag));
      expect([tag, Object.keys(other).sort()]).toEqual([tag, Object.keys(base).sort()]);
      for (const [k, v] of Object.entries(base)) expect([tag, k, placeholders(other[k])]).toEqual([tag, k, placeholders(v)]);
    }
  });

  test("the manifest is the English text and every action is named in each language", () => {
    const ids = (manifest.actions || []).map((a) => a.id).sort();
    for (const tag of LOCALES) {
      const m = (read(tag) || {}).manifest || {};
      expect([tag, typeof m.name, typeof m.description]).toEqual([tag, "string", "string"]);
      expect([tag, Object.keys(m.actions || {}).sort()]).toEqual([tag, ids]);
      for (const id of ids) expect([tag, id, typeof m.actions[id].name]).toEqual([tag, id, "string"]);
    }
    const en = read("en-US").manifest;
    expect(manifest.name).toBe(en.name);
    expect(manifest.description).toBe(en.description);
    for (const a of manifest.actions || []) {
      expect([a.id, a.name]).toEqual([a.id, en.actions[a.id].name]);
      if (a.description !== undefined || en.actions[a.id].description !== undefined) expect([a.id, a.description]).toEqual([a.id, en.actions[a.id].description]);
    }
  });

  test("code carries no hard-coded Portuguese and every key it asks for exists", () => {
    const base = leaves(read("en-US"));
    const results = jsFiles(dir).map((f) => scan(path.join(dir, f)));
    expect(results.flatMap((r) => r.accented)).toEqual([]);
    expect(results.flatMap((r) => r.keys).filter((k) => !(k in base))).toEqual([]);
  });
});
