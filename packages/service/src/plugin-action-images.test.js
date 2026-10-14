const fs = require("fs");
const os = require("os");
const path = require("path");

let tmp, pluginsDir, loader, warnSpy, errSpy, logSpy;

function loadPluginLoader() {
  const out = path.join(tmp, "plugin-loader.compiled.js");
  require("esbuild").buildSync({ entryPoints: [path.join(__dirname, "plugin-loader.ts")], bundle: true, platform: "node", format: "cjs", target: "node18", outfile: out, logLevel: "silent" });
  return require(out).PluginLoader;
}

function writePlugin(name, manifestActions, body) {
  const dir = path.join(pluginsDir, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({
    id: `test.${name}`, name, version: "1.0.0", author: "t", description: "d", main: "index.js", actions: manifestActions,
  }));
  fs.writeFileSync(path.join(dir, "index.js"), body);
}

const PLUGIN = `
const ctl = global.__img.games;
module.exports = {
  onLoad(host) { ctl.host = host; },
  getActions() { return ctl.actions; },
  onAction() {},
};`;
const STATIC_PLUGIN = "module.exports = { onAction() {} };";

async function start(opts = {}) {
  const PluginLoader = loadPluginLoader();
  loader = new PluginLoader({ pluginsDir, ...opts });
  await loader.loadAll();
  return loader;
}

const actionsOf = (pluginId) => loader.getPlugins().find((p) => p.id === pluginId).actions;
const imageWarnings = () => warnSpy.mock.calls.map((c) => String(c[0])).filter((m) => m.includes("image dropped"));

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const bytes = (magic, size) => { const b = Buffer.alloc(Math.max(size, 16), 7); Buffer.from(magic).copy(b); return b; };
const png = (size = 300) => "data:image/png;base64," + bytes(PNG_MAGIC, size).toString("base64");
const jpeg = (size = 300) => "data:image/jpeg;base64," + bytes([0xff, 0xd8, 0xff, 0xe0], size).toString("base64");
const webp = (size = 300) => {
  const b = bytes([], size);
  b.write("RIFF", 0, "latin1"); b.write("WEBP", 8, "latin1");
  return "data:image/webp;base64," + b.toString("base64");
};
const KB = 1024;
const ICON = "<circle cx='12' cy='12' r='9'/>";

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-img-test-"));
  pluginsDir = path.join(tmp, "plugins");
  fs.mkdirSync(pluginsDir, { recursive: true });
  global.__img = { games: { actions: [], host: null } };
  logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  jest.resetModules();
});

afterEach(async () => {
  if (loader) await loader.unloadAll();
  loader = null;
  logSpy.mockRestore();
  warnSpy.mockRestore();
  errSpy.mockRestore();
  delete global.__img;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("image de ações — manifesto", () => {
  test("png, jpeg e webp dentro do limite passam inalterados em getPlugins() e getPluginActions()", async () => {
    const a = png(), b = jpeg(), c = webp(48 * KB);
    writePlugin("covers", [
      { id: "a", name: "A", icon: ICON, image: a },
      { id: "b", name: "B", icon: ICON, image: b },
      { id: "c", name: "C", icon: ICON, image: c },
      { id: "plain", name: "Sem imagem", icon: ICON },
    ], STATIC_PLUGIN);
    await start();
    const acts = actionsOf("test.covers");
    expect(acts.map((x) => x.image)).toEqual([a, b, c, undefined]);
    expect(acts.map((x) => x.icon)).toEqual([ICON, ICON, ICON, ICON]);
    expect(loader.getPluginActions().filter((x) => x.pluginId === "test.covers").map((x) => x.image)).toEqual([a, b, c, undefined]);
    expect("image" in JSON.parse(JSON.stringify(acts[3]))).toBe(false);
    expect(imageWarnings()).toEqual([]);
  });

  test.each([
    ["svg+xml", "data:image/svg+xml;base64," + Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>").toString("base64")],
    ["gif", "data:image/gif;base64," + Buffer.from("GIF89a" + "x".repeat(40)).toString("base64")],
    ["URL http", "https://cdn.example.com/cover.png"],
    ["URL file", "file:///C:/covers/a.png"],
    ["caminho de arquivo", "C:/covers/a.png"],
    ["acima de 48 KB", png(48 * KB + 1)],
    ["base64 malformado (caractere inválido)", "data:image/png;base64,iVBORw0KGgo*AAAA"],
    ["base64 malformado (comprimento)", png().slice(0, -3)],
    ["base64 vazio", "data:image/png;base64,"],
    ["sem ;base64", "data:image/png," + "iVBORw0KGgo"],
    ["parâmetros extras no MIME", png().replace("image/png;", "image/png;charset=utf-8;")],
    ["quebra de linha no fim", png() + String.fromCharCode(10)],
    ["MIME em maiúsculas", png().replace("image/png", "image/PNG")],
    ["bytes que não são do formato declarado", "data:image/png;base64," + Buffer.from("<svg onload=alert(1)>".repeat(4)).toString("base64")],
    ["jpeg declarado como webp", jpeg().replace("image/jpeg", "image/webp")],
    ["não-string", 42],
    ["objeto", { src: png() }],
  ])("%s é descartado: a ação continua, com o ícone, e sai um aviso", async (_name, bad) => {
    writePlugin("covers", [{ id: "a", name: "A", icon: ICON, image: bad }, { id: "ok", name: "OK", icon: ICON, image: png() }], STATIC_PLUGIN);
    await start();
    const acts = actionsOf("test.covers");
    expect(acts.map((x) => x.id)).toEqual(["a", "ok"]);
    expect(acts[0].image).toBeUndefined();
    expect(acts[0].icon).toBe(ICON);
    expect(acts[1].image).toBe(png());
    const w = imageWarnings();
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('"test.covers"');
    expect(w[0]).toContain('"a"');
  });

  test("image: null é ignorado sem aviso", async () => {
    writePlugin("covers", [{ id: "a", name: "A", icon: ICON, image: null }], STATIC_PLUGIN);
    await start();
    expect(actionsOf("test.covers")[0].image).toBeUndefined();
    expect(imageWarnings()).toEqual([]);
  });

  test("teto por plugin: no máximo 16 imagens, o resto cai com aviso (as ações ficam)", async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: "g" + i, name: "G" + i, icon: ICON, image: png(200 + i) }));
    writePlugin("covers", many, STATIC_PLUGIN);
    await start();
    const acts = actionsOf("test.covers");
    expect(acts).toHaveLength(20);
    expect(acts.filter((x) => x.image).map((x) => x.id)).toEqual(many.slice(0, 16).map((x) => x.id));
    expect(imageWarnings()).toHaveLength(4);
    expect(imageWarnings()[0]).toContain("16 images");
  });

  test("teto por plugin: no máximo 400 KB somados", async () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ id: "g" + i, name: "G" + i, icon: ICON, image: png(40 * KB) }));
    writePlugin("covers", many, STATIC_PLUGIN);
    await start();
    const kept = actionsOf("test.covers").filter((x) => x.image);
    expect(kept).toHaveLength(10);
    expect(imageWarnings()).toHaveLength(1);
    expect(imageWarnings()[0]).toContain("400 KB");
    const payload = JSON.stringify({ type: "plugins", plugins: loader.getPlugins() });
    expect(payload.length).toBeLessThan(600 * KB);
  });

  test("o teto é por plugin, não global", async () => {
    for (const name of ["one", "two"]) {
      writePlugin(name, Array.from({ length: 16 }, (_, i) => ({ id: "g" + i, name: "G", icon: ICON, image: png(100) })), STATIC_PLUGIN);
    }
    await start();
    expect(actionsOf("test.one").filter((x) => x.image)).toHaveLength(16);
    expect(actionsOf("test.two").filter((x) => x.image)).toHaveLength(16);
    expect(imageWarnings()).toEqual([]);
  });
});

describe("image de ações — dinâmicas (getActions())", () => {
  const ctl = () => global.__img.games;

  test("imagens válidas passam; inválidas caem e a ação continua com o ícone", async () => {
    writePlugin("games", [], PLUGIN);
    ctl().actions = [
      { id: "app.550", name: "Left 4 Dead 2", icon: ICON, image: webp() },
      { id: "app.620", name: "Portal 2", icon: ICON, image: "https://example.com/x.jpg" },
      { id: "app.730", name: "CS2", icon: ICON, image: "data:image/svg+xml;base64,PHN2Zy8+" },
      { id: "app.440", name: "TF2", icon: ICON, image: png(48 * KB + 1) },
      { id: "app.570", name: "Dota 2", icon: ICON },
    ];
    await start();
    const acts = actionsOf("test.games");
    expect(acts.map((x) => x.id)).toEqual(["app.550", "app.620", "app.730", "app.440", "app.570"]);
    expect(acts.map((x) => x.image)).toEqual([webp(), undefined, undefined, undefined, undefined]);
    expect(acts.every((x) => x.icon === ICON)).toBe(true);
    expect(imageWarnings()).toHaveLength(3);
  });

  test("um aviso por plugin+ação, não um por actionsChanged()", async () => {
    writePlugin("games", [], PLUGIN);
    ctl().actions = [{ id: "app.1", name: "Um", icon: ICON, image: "nope" }];
    await start();
    for (let i = 0; i < 5; i++) {
      ctl().actions = [{ id: "app.1", name: "Um " + i, icon: ICON, image: "nope" + i }];
      ctl().host.actionsChanged();
    }
    expect(imageWarnings()).toHaveLength(1);
    ctl().actions = [...ctl().actions, { id: "app.2", name: "Dois", icon: ICON, image: "nope" }];
    ctl().host.actionsChanged();
    expect(imageWarnings()).toHaveLength(2);
  });

  test("trocar só a imagem conta como mudança (re-emite plugins)", async () => {
    writePlugin("games", [], PLUGIN);
    ctl().actions = [{ id: "app.1", name: "Um", icon: ICON }];
    await start();
    const changed = jest.fn();
    loader.onActionsChanged(changed);
    ctl().actions = [{ id: "app.1", name: "Um", icon: ICON, image: png() }];
    ctl().host.actionsChanged();
    expect(changed).toHaveBeenCalledTimes(1);
    expect(actionsOf("test.games")[0].image).toBe(png());
    ctl().host.actionsChanged();
    expect(changed).toHaveBeenCalledTimes(1);
    ctl().actions = [{ id: "app.1", name: "Um", icon: ICON, image: jpeg() }];
    ctl().host.actionsChanged();
    expect(changed).toHaveBeenCalledTimes(2);
    expect(actionsOf("test.games")[0].image).toBe(jpeg());
  });

  test("o teto de 16 imagens soma manifesto + dinâmicas (manifesto primeiro)", async () => {
    writePlugin("games", Array.from({ length: 10 }, (_, i) => ({ id: "m" + i, name: "M" + i, icon: ICON, image: png(100) })), PLUGIN);
    ctl().actions = Array.from({ length: 10 }, (_, i) => ({ id: "d" + i, name: "D" + i, icon: ICON, image: png(100) }));
    await start();
    const acts = actionsOf("test.games");
    expect(acts).toHaveLength(20);
    expect(acts.filter((x) => x.image).map((x) => x.id)).toEqual([...Array.from({ length: 10 }, (_, i) => "m" + i), "d0", "d1", "d2", "d3", "d4", "d5"]);
    ctl().actions = ctl().actions.map((a) => ({ ...a, name: a.name + "!" }));
    ctl().host.actionsChanged();
    expect(actionsOf("test.games").filter((x) => x.image)).toHaveLength(16);
  });

  test("400 KB somados também valem para as dinâmicas", async () => {
    writePlugin("games", [], PLUGIN);
    ctl().actions = Array.from({ length: 12 }, (_, i) => ({ id: "d" + i, name: "D" + i, icon: ICON, image: jpeg(45 * KB) }));
    await start();
    expect(actionsOf("test.games").filter((x) => x.image)).toHaveLength(8);
  });
});

describe("host.makeThumbnail", () => {
  test("o serviço injetado em hostServices chega ao onLoad(host) do plugin", async () => {
    writePlugin("games", [], PLUGIN);
    const makeThumbnail = jest.fn(async () => png());
    await start({ hostServices: { makeThumbnail } });
    const host = global.__img.games.host;
    expect(typeof host.makeThumbnail).toBe("function");
    await expect(host.makeThumbnail("C:/x.png", { size: 64 })).resolves.toBe(png());
    expect(makeThumbnail).toHaveBeenCalledWith("C:/x.png", { size: 64 });
  });

  test("sem o serviço, host.makeThumbnail é undefined (plugins devem tolerar)", async () => {
    writePlugin("games", [], PLUGIN);
    await start();
    expect(global.__img.games.host.makeThumbnail).toBeUndefined();
  });
});
