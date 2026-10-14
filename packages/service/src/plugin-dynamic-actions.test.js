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

const DYNAMIC_PLUGIN = `
const ctl = global.__dyn.accounts;
module.exports = {
  onLoad(host) { ctl.host = host; },
  getActions() { if (ctl.throwActions) throw new Error("boom"); return ctl.actions; },
  getState() { if (ctl.throwState) throw new Error("boom"); return ctl.state; },
  onAction(id) { ctl.executed.push(id); return { ran: id }; },
};`;

async function start() {
  const PluginLoader = loadPluginLoader();
  loader = new PluginLoader({ pluginsDir, locale: "pt-BR" });
  await loader.loadAll();
  return loader;
}

const ids = (pluginId) => loader.getPlugins().find((p) => p.id === pluginId).actions.map((a) => a.id);

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-dyn-test-"));
  pluginsDir = path.join(tmp, "plugins");
  fs.mkdirSync(pluginsDir, { recursive: true });
  global.__dyn = { accounts: { actions: [], state: {}, executed: [], host: null } };
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
  delete global.__dyn;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("ações dinâmicas", () => {
  const MANIFEST = [{ id: "show_usage", name: "Uso", stateful: true }];

  test("são listadas depois das do manifesto, com pluginId, em getPlugins() e getPluginActions()", async () => {
    writePlugin("accounts", MANIFEST, DYNAMIC_PLUGIN);
    global.__dyn.accounts.actions = [
      { id: "session.3e880fae", name: "Claude · Sessão · WSL", icon: "<circle cx='12' cy='12' r='9'/>", stateful: true, description: "d" },
      { id: "week.3e880fae", name: "Claude · Semana · WSL" },
    ];
    await start();
    expect(ids("test.accounts")).toEqual(["show_usage", "session.3e880fae", "week.3e880fae"]);
    const listed = loader.getPluginActions().filter((a) => a.pluginId === "test.accounts");
    expect(listed.map((a) => a.id)).toEqual(["show_usage", "session.3e880fae", "week.3e880fae"]);
    expect(listed[1]).toEqual({
      id: "session.3e880fae", name: "Claude · Sessão · WSL", icon: "<circle cx='12' cy='12' r='9'/>",
      iconActive: undefined, stateful: true, description: "d", pluginId: "test.accounts",
    });
  });

  test("keepIcon (ícone acima do texto) passa do manifesto e do getActions() só quando é true", async () => {
    writePlugin("accounts", [
      { id: "show_usage", name: "Uso", icon: "<path fill='currentColor' stroke='none' d='M0 0h4v4z'/>", keepIcon: true, stateful: true },
      { id: "approve", name: "Aprovar", icon: "<circle cx='12' cy='12' r='9'/>" },
    ], DYNAMIC_PLUGIN);
    global.__dyn.accounts.actions = [
      { id: "session.aaaaaaaa", name: "A", icon: "<path fill='currentColor' stroke='none' d='M0 0h4v4z'/>", keepIcon: true },
      { id: "session.bbbbbbbb", name: "B", keepIcon: "yes" },
      { id: "session.cccccccc", name: "C", keepIcon: false },
    ];
    await start();
    const actions = loader.getPlugins().find((p) => p.id === "test.accounts").actions;
    expect(actions.map((a) => [a.id, a.keepIcon])).toEqual([
      ["show_usage", true], ["approve", undefined],
      ["session.aaaaaaaa", true], ["session.bbbbbbbb", undefined], ["session.cccccccc", undefined],
    ]);
    expect(actions[0].icon).toBe("<path fill='currentColor' stroke='none' d='M0 0h4v4z'/>");
    expect(JSON.parse(JSON.stringify(actions[1]))).not.toHaveProperty("keepIcon");
  });

  test("validação: charset do id, colisão com o manifesto, duplicados, sem nome, não-objetos e teto de 16", async () => {
    writePlugin("accounts", MANIFEST, DYNAMIC_PLUGIN);
    global.__dyn.accounts.actions = [
      { id: "ok.one", name: "ok" },
      { id: "Upper", name: "x" },
      { id: "com espaço", name: "x" },
      { id: "a:b", name: "x" },
      { id: "", name: "x" },
      { id: "show_usage", name: "colide com o manifesto" },
      { id: "ok.one", name: "duplicado" },
      { id: "sem-nome" },
      { id: "nome-vazio", name: "   " },
      null, "texto", 42,
      ...Array.from({ length: 30 }, (_, i) => ({ id: `n-${i}`, name: `N ${i}` })),
    ];
    await start();
    const got = ids("test.accounts");
    expect(got.slice(0, 2)).toEqual(["show_usage", "ok.one"]);
    expect(got).toHaveLength(1 + 16);
    expect(got.slice(2)).toEqual(Array.from({ length: 15 }, (_, i) => `n-${i}`));
  });

  test("getActions() que não devolve array ou que lança → sem ações dinâmicas, plugin e vizinhos seguem", async () => {
    writePlugin("accounts", MANIFEST, DYNAMIC_PLUGIN);
    writePlugin("vizinho", [{ id: "a", name: "A", stateful: true }], `module.exports = { getState() { return { a: true }; } };`);
    global.__dyn.accounts.actions = { not: "an array" };
    await start();
    expect(ids("test.accounts")).toEqual(["show_usage"]);

    global.__dyn.accounts.throwActions = true;
    global.__dyn.accounts.host.actionsChanged();
    expect(ids("test.accounts")).toEqual(["show_usage"]);
    expect(ids("test.vizinho")).toEqual(["a"]);

    global.__dyn.accounts.throwState = true;
    expect(loader.getPluginStates()).toEqual({ "test.vizinho": { a: true } });
  });

  test("host.actionsChanged(): relê a lista e avisa o serviço só quando ela mudou", async () => {
    writePlugin("accounts", MANIFEST, DYNAMIC_PLUGIN);
    await start();
    const changed = [];
    loader.onActionsChanged((id) => changed.push(id));
    const ctl = global.__dyn.accounts;

    ctl.host.actionsChanged();
    expect(changed).toEqual([]);

    ctl.actions = [{ id: "session.aaaaaaaa", name: "A" }];
    ctl.host.actionsChanged();
    expect(changed).toEqual(["test.accounts"]);
    expect(ids("test.accounts")).toEqual(["show_usage", "session.aaaaaaaa"]);

    ctl.host.actionsChanged();
    expect(changed).toHaveLength(1);

    ctl.actions = [{ id: "session.aaaaaaaa", name: "A (renomeada)" }];
    ctl.host.actionsChanged();
    expect(changed).toHaveLength(2);
    expect(loader.getPlugins()[0].actions[1].name).toBe("A (renomeada)");
  });

  test("estados: só chaves do manifesto + dinâmicas atuais; ação retirada lê 'indisponível'", async () => {
    writePlugin("accounts", MANIFEST, DYNAMIC_PLUGIN);
    const ctl = global.__dyn.accounts;
    ctl.actions = [{ id: "session.aaaaaaaa", name: "A" }, { id: "session.bbbbbbbb", name: "B" }];
    ctl.state = {
      show_usage: { value: 10, text: "10%" },
      "session.aaaaaaaa": { value: 150, text: "123456", label: "A", status: "purple" },
      "session.bbbbbbbb": true,
      "session.cccccccc": { text: "x" },
      intruso: { text: "x" },
    };
    await start();
    expect(loader.getPluginStates()["test.accounts"]).toEqual({
      show_usage: { value: 10, text: "10%" },
      "session.aaaaaaaa": { value: 100, text: "1234", label: "A" },
      "session.bbbbbbbb": true,
    });

    ctl.actions = [{ id: "session.aaaaaaaa", name: "A" }];
    delete ctl.state["session.bbbbbbbb"];
    ctl.host.actionsChanged();
    expect(loader.getPluginStates()["test.accounts"]["session.bbbbbbbb"]).toEqual({ text: "–", label: "indisponível" });

    ctl.state["session.bbbbbbbb"] = { text: "–", label: "Claude · WSL · conta indisponível" };
    expect(loader.getPluginStates()["test.accounts"]["session.bbbbbbbb"]).toEqual({ text: "–", label: "Claude · WSL · conta indisponível" });

    ctl.actions.push({ id: "session.bbbbbbbb", name: "B" });
    ctl.state["session.bbbbbbbb"] = { value: 5 };
    ctl.host.actionsChanged();
    expect(ids("test.accounts")).toEqual(["show_usage", "session.aaaaaaaa", "session.bbbbbbbb"]);
    expect(loader.getPluginStates()["test.accounts"]["session.bbbbbbbb"]).toEqual({ value: 5 });
  });

  test("execução: ids do manifesto e dinâmicos chegam ao plugin; id indisponível não chega", async () => {
    writePlugin("accounts", MANIFEST, DYNAMIC_PLUGIN);
    const ctl = global.__dyn.accounts;
    ctl.actions = [{ id: "session.aaaaaaaa", name: "A" }];
    await start();

    expect(await loader.executePluginAction("test.accounts", "show_usage")).toEqual({ ran: "show_usage" });
    expect(await loader.executePluginAction("test.accounts", "session.aaaaaaaa")).toEqual({ ran: "session.aaaaaaaa" });
    expect(await loader.executePluginAction("test.accounts", "session.zzzzzzzz")).toEqual({ handled: false, unavailable: true });

    ctl.actions = [];
    ctl.host.actionsChanged();
    expect(await loader.executePluginAction("test.accounts", "session.aaaaaaaa")).toEqual({ handled: false, unavailable: true });
    expect(ctl.executed).toEqual(["show_usage", "session.aaaaaaaa"]);
  });

  test("plugin sem getActions() mantém o comportamento antigo (qualquer id é repassado)", async () => {
    writePlugin("antigo", [{ id: "a", name: "A" }], `module.exports = { onAction(id) { return "ran:" + id; } };`);
    await start();
    expect(ids("test.antigo")).toEqual(["a"]);
    expect(await loader.executePluginAction("test.antigo", "fora_do_manifesto")).toBe("ran:fora_do_manifesto");
  });
});

describe("plugin real do Claude no loader", () => {
  const PLUGIN_SRC = path.resolve(__dirname, "../../../plugins/claude-usage");
  const saved = {};

  beforeEach(() => {
    for (const k of ["ORBIT_HOME", "ORBIT_CLAUDE_PORT"]) saved[k] = process.env[k];
    process.env.ORBIT_HOME = path.join(tmp, "orbit");
    process.env.ORBIT_CLAUDE_PORT = "0";
  });
  afterEach(() => {
    for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  });

  test("contas lembradas viram ações dinâmicas já no carregamento; estado 'conta indisponível' passa pelo loader", async () => {
    fs.mkdirSync(process.env.ORBIT_HOME, { recursive: true });
    fs.writeFileSync(path.join(process.env.ORBIT_HOME, "claude-accounts.json"), JSON.stringify({
      version: 1,
      accounts: [{ id: "3e880fae", name: "Windows", lastSeen: Date.now() }, { id: "0badc0de", name: "WSL", lastSeen: Date.now() }],
    }));
    const dest = path.join(pluginsDir, "claude-usage");
    fs.mkdirSync(dest, { recursive: true });
    fs.cpSync(PLUGIN_SRC, dest, { recursive: true });

    await start();
    const id = "com.orbitring.claude-usage";
    expect(ids(id)).toEqual([
      "show_usage", "usage_gauge", "approve", "decline",
      "session.3e880fae", "week.3e880fae", "session.0badc0de", "week.0badc0de",
    ]);
    expect(loader.getPluginStates()[id]["week.0badc0de"]).toEqual({ text: "–", label: "Claude · WSL · conta indisponível" });
  });
});
