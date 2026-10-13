const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const PLUGINS = path.join(ROOT, "plugins");
const MAX_LEN = 4000;
const SHAPES = new Set(["path", "circle", "rect", "line", "polyline", "polygon", "ellipse", "g"]);

function parseFragment(src) {
  const out = [];
  const stack = [];
  let i = 0;
  const fail = (msg) => { throw new Error(`${msg} at ${i}: …${src.slice(Math.max(0, i - 15), i + 25)}…`); };
  while (i < src.length) {
    if (src[i] !== "<") {
      if (/\s/.test(src[i])) { i++; continue; }
      fail("text outside a tag");
    }
    if (src[i + 1] === "/") {
      const m = /^<\/([A-Za-z][\w:.-]*)\s*>/.exec(src.slice(i));
      if (!m) fail("malformed closing tag");
      if (stack.pop() !== m[1]) fail(`unbalanced </${m[1]}>`);
      i += m[0].length;
      continue;
    }
    const open = /^<([A-Za-z][\w:.-]*)/.exec(src.slice(i));
    if (!open) fail("malformed tag (comments, CDATA and <? are not allowed)");
    i += open[0].length;
    const attrs = {};
    for (;;) {
      const ws = /^\s*/.exec(src.slice(i))[0];
      i += ws.length;
      if (src.startsWith("/>", i)) { i += 2; break; }
      if (src[i] === ">") { i++; stack.push(open[1]); break; }
      if (!ws) fail("missing whitespace before attribute");
      const a = /^([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/.exec(src.slice(i));
      if (!a) fail("malformed attribute (must be quoted)");
      if (a[1] in attrs) fail(`duplicate attribute ${a[1]}`);
      attrs[a[1]] = a[2] !== undefined ? a[2] : a[3];
      i += a[0].length;
    }
    out.push({ name: open[1], attrs });
  }
  if (stack.length) fail(`unclosed <${stack[stack.length - 1]}>`);
  return out;
}

function lint(icon) {
  expect(typeof icon).toBe("string");
  expect(icon.length).toBeGreaterThan(0);
  expect(icon.length).toBeLessThanOrEqual(MAX_LEN);
  expect(icon).not.toMatch(/<\s*svg\b/i);
  expect(icon).not.toMatch(/<\s*\/?\s*(script|foreignObject|style|iframe|image|use|a|animate|set)\b/i);
  expect(icon).not.toMatch(/javascript:|data:|&/i);
  const els = parseFragment(icon);
  expect(els.length).toBeGreaterThan(0);
  for (const el of els) {
    expect(SHAPES.has(el.name) ? el.name : `<${el.name}> is not an allowed shape`).toBe(el.name);
    for (const [k, v] of Object.entries(el.attrs)) {
      expect(k).not.toMatch(/^on/i);
      expect(k).not.toMatch(/href$|^style$|^xmlns/i);
      expect(v).not.toMatch(/url\s*\(|expression\s*\(/i);
    }
  }
  return els;
}

const IMAGE_URI = /^data:image[/](png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
const IMAGE_MAX_BYTES = 48 * 1024;
const IMAGES_MAX_PER_PLUGIN = 16;
const IMAGES_MAX_TOTAL_BYTES = 400 * 1024;

function lintImage(image) {
  expect(typeof image).toBe("string");
  const m = IMAGE_URI.exec(image);
  expect(m ? "data URI ok" : `not a data:image/(png|jpeg|webp);base64 URI: ${String(image).slice(0, 40)}…`).toBe("data URI ok");
  expect(m[2].length % 4).toBe(0);
  const buf = Buffer.from(m[2], "base64");
  expect(buf.toString("base64")).toBe(m[2]);
  expect(buf.length).toBeLessThanOrEqual(IMAGE_MAX_BYTES);
  const magic = m[1] === "png" ? buf.subarray(0, 8).toString("hex") === "89504e470d0a1a0a"
    : m[1] === "jpeg" ? buf.subarray(0, 3).toString("hex") === "ffd8ff"
    : buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP";
  expect(magic ? "magic ok" : `bytes are not a ${m[1]}`).toBe("magic ok");
  return buf.length;
}

const manifests = fs.readdirSync(PLUGINS, { withFileTypes: true })
  .filter((d) => d.isDirectory() && fs.existsSync(path.join(PLUGINS, d.name, "manifest.json")))
  .map((d) => ({ dir: d.name, manifest: JSON.parse(fs.readFileSync(path.join(PLUGINS, d.name, "manifest.json"), "utf8")) }));

function sharedBrand() {
  const src = fs.readFileSync(path.join(ROOT, "packages", "shared", "src", "ring-catalog.ts"), "utf8");
  const block = /export const BRAND = \{([\s\S]*?)\n\} as const;/.exec(src);
  if (!block) throw new Error("BRAND not found in ring-catalog.ts");
  const out = {};
  for (const m of block[1].matchAll(/^(\w+):'([^']*)',$/gm)) out[m[1]] = m[2];
  return out;
}
const sq = (s) => s.replace(/"/g, "'");

describe("parseFragment (the lint's own parser)", () => {
  test("accepts well-formed shapes, single or double quoted", () => {
    expect(parseFragment(`<circle cx='12' cy="12" r='9'/><g><path d='M0 0'/></g>`).map((e) => e.name)).toEqual(["circle", "g", "path"]);
  });
  test.each([
    ["unquoted attribute", "<circle r=9/>"],
    ["unclosed tag", "<g><path d='M0 0'/>"],
    ["unbalanced close", "<path d='M0 0'></g>"],
    ["never closed", "<path d='M0 0'"],
    ["text content", "<path d='M0 0'/>hello"],
    ["comment", "<!-- x --><path d='M0 0'/>"],
    ["duplicate attribute", "<path d='M0 0' d='M1 1'/>"],
    ["attributes glued together", "<path d='M0 0'fill='red'/>"],
  ])("rejects %s", (_name, bad) => {
    expect(() => parseFragment(bad)).toThrow();
  });
  test("the lint rejects executable or wrapped markup", () => {
    for (const bad of [
      "<svg viewBox='0 0 24 24'><path d='M0 0'/></svg>",
      "<path d='M0 0' onload='alert(1)'/>",
      "<script>alert(1)</script>",
      "<a href='javascript:alert(1)'><path d='M0 0'/></a>",
      "<foreignObject><path d='M0 0'/></foreignObject>",
      "<path d='M0 0' style='fill:url(x)'/>",
      "<text x='0' y='0'/>",
    ]) {
      let threw = false;
      try { lint(bad); } catch { threw = true; }
      expect(`${bad} → ${threw ? "rejected" : "ACCEPTED"}`).toBe(`${bad} → rejected`);
    }
  });
});

describe("lintImage (the image contract)", () => {
  const PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  test("accepts a png / jpeg / webp data URI", () => {
    expect(lintImage("data:image/png;base64," + PNG_1PX)).toBeGreaterThan(40);
    expect(lintImage("data:image/jpeg;base64," + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73]).toString("base64"))).toBe(9);
    expect(lintImage("data:image/webp;base64," + Buffer.from("RIFF0000WEBPVP8 ").toString("base64"))).toBe(16);
  });
  test("rejects everything else", () => {
    for (const bad of [
      "data:image/svg+xml;base64," + Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>").toString("base64"),
      "data:image/gif;base64," + Buffer.from("GIF89a0000000000").toString("base64"),
      "data:image/png," + PNG_1PX,
      "data:image/png;base64," + PNG_1PX + " ",
      "data:image/png;base64," + PNG_1PX.slice(0, -2),
      "data:image/png;base64," + Buffer.from("<svg onload=alert(1)>").toString("base64"),
      "data:image/webp;base64," + PNG_1PX,
      "data:text/html;base64," + Buffer.from("<script>alert(1)</script>").toString("base64"),
      "https://example.com/cover.png",
      "file:///C:/cover.png",
      "cover.png",
      "<image href='x'/>",
      "data:image/png;base64," + Buffer.concat([Buffer.from(PNG_1PX, "base64"), Buffer.alloc(IMAGE_MAX_BYTES)]).toString("base64"),
      42,
    ]) {
      let threw = false;
      try { lintImage(bad); } catch { threw = true; }
      expect(`${String(bad).slice(0, 48)} → ${threw ? "rejected" : "ACCEPTED"}`).toBe(`${String(bad).slice(0, 48)} → rejected`);
    }
  });
  test("icons still may not carry pictures or data: URIs", () => {
    for (const bad of [
      "<image href='data:image/png;base64," + PNG_1PX + "'/>",
      "<path d='M0 0' fill='url(data:image/png;base64,AAAA)'/>",
      "data:image/png;base64," + PNG_1PX,
    ]) {
      let threw = false;
      try { lint(bad); } catch { threw = true; }
      expect(threw).toBe(true);
    }
  });
});

describe("plugin manifest icons", () => {
  test("there are manifests to lint", () => {
    expect(manifests.length).toBeGreaterThanOrEqual(5);
  });

  for (const { dir, manifest } of manifests) {
    describe(dir, () => {
      test("carries at most 16 images / 400 KB in total", () => {
        const sizes = (manifest.actions || []).filter((a) => a.image !== undefined).map((a) => lintImage(a.image));
        expect(sizes.length).toBeLessThanOrEqual(IMAGES_MAX_PER_PLUGIN);
        expect(sizes.reduce((n, s) => n + s, 0)).toBeLessThanOrEqual(IMAGES_MAX_TOTAL_BYTES);
      });
      for (const a of manifest.actions || []) {
        for (const field of ["icon", "iconActive"]) {
          if (a[field] === undefined) continue;
          test(`${a.id}.${field} is safe, well-formed inner SVG markup`, () => {
            lint(a[field]);
          });
        }
        if (a.image !== undefined) {
          test(`${a.id}.image is a png/jpeg/webp base64 data URI within 48 KB, on an action that keeps an icon`, () => {
            lintImage(a.image);
            expect(typeof a.icon).toBe("string");
          });
        }
        if (a.keepIcon !== undefined) {
          test(`${a.id}.keepIcon is a boolean on an action that has an icon`, () => {
            expect(typeof a.keepIcon).toBe("boolean");
            expect(typeof a.icon).toBe("string");
          });
        }
      }
    });
  }
});

describe("brand marks", () => {
  const BRAND = sharedBrand();
  const EXPECTED = {
    "claude-usage": { mark: "claude", ids: ["show_usage", "usage_gauge"] },
    "codex-usage": { mark: "openai", ids: ["session", "week"] },
    "antigravity-usage": { mark: "antigravity", ids: ["gemini", "others", "worst"] },
    "gemini-usage": { mark: "gemini", ids: ["pro", "flash", "worst"] },
  };

  test("the shared BRAND map has every mark, each a single filled currentColor path", () => {
    expect(Object.keys(BRAND).sort()).toEqual(["antigravity", "claude", "copilot", "cursor", "gemini", "openai"]);
    for (const k of Object.keys(BRAND)) {
      const els = lint(BRAND[k]);
      expect(els).toHaveLength(1);
      expect(els[0].name).toBe("path");
      expect(els[0].attrs.fill).toBe("currentColor");
      expect(els[0].attrs.stroke).toBe("none");
      expect(els[0].attrs.d.length).toBeGreaterThan(100);
    }
  });

  for (const dir of Object.keys(EXPECTED)) {
    const { mark, ids } = EXPECTED[dir];
    test(`${dir}: gauges carry the ${mark} mark (literal copy of BRAND.${mark}) and keepIcon`, () => {
      const m = manifests.find((x) => x.dir === dir);
      expect(m).toBeDefined();
      for (const id of ids) {
        const a = m.manifest.actions.find((x) => x.id === id);
        expect(a).toBeDefined();
        expect(a.icon).toBe(sq(BRAND[mark]));
        expect(a.keepIcon).toBe(true);
      }
    });
  }

  test("claude-usage: approve / decline keep their glyphs and replace-the-icon text", () => {
    const m = manifests.find((x) => x.dir === "claude-usage").manifest;
    for (const id of ["approve", "decline"]) {
      const a = m.actions.find((x) => x.id === id);
      expect(a.keepIcon).toBeUndefined();
      expect(a.icon).not.toBe(sq(BRAND.claude));
    }
  });

  test("per-account actions built by getActions() reuse the manifest mark", () => {
    for (const dir of Object.keys(EXPECTED)) {
      const src = fs.readFileSync(path.join(PLUGINS, dir, "index.js"), "utf8");
      expect(src).toContain('const MARK = (require("./manifest.json").actions.find((a) => a.keepIcon) || {}).icon;');
      expect(src).toMatch(/icon: MARK,\s+keepIcon: true,/);
    }
  });
});
