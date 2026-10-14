process.env.ORBIT_PLUGIN_LOCALE = "pt-BR";

const path = require("path");
const fs = require("fs");
const { EventEmitter } = require("events");

const PLUGIN_DIR = path.resolve(__dirname, "../../../plugins/powertoys");
const plugin = require(path.join(PLUGIN_DIR, "index.js"));
const { ACTIONS, EVENTS, isKnownEvent, EVENT_SHAPE, SETTINGS_WINDOWS } = require(path.join(PLUGIN_DIR, "actions.js"));
const EN = require(path.join(PLUGIN_DIR, "locales", "en-US.json"));
const { createDetector, parseRegOutput, parseTasklist, parseEnabledMap, UNINSTALL_KEYS } = require(path.join(PLUGIN_DIR, "detect.js"));
const { createHelper, SCRIPT, helperArgs } = require(path.join(PLUGIN_DIR, "helper.js"));
const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN_DIR, "manifest.json"), "utf8"));

const LOCAL = "C:\\Users\\Ana\\AppData\\Local";
const PF = "C:\\Program Files";
const USER_DIR = `${LOCAL}\\PowerToys`;
const MACHINE_DIR = `${PF}\\PowerToys`;
const SETTINGS = `${LOCAL}\\Microsoft\\PowerToys\\settings.json`;
const HKCU = UNINSTALL_KEYS[0].replace(/^HKCU/, "HKEY_CURRENT_USER");
const HKLM = UNINSTALL_KEYS[1].replace(/^HKLM/, "HKEY_LOCAL_MACHINE");

const ENABLED = {
  ColorPicker: true, AlwaysOnTop: true, Awake: true, FancyZones: true, "Measure Tool": true,
  Peek: true, TextExtractor: false, CropAndLock: false, "PowerToys Run": false, CmdPal: true,
};

function generalSettings(extra = {}) {
  return JSON.stringify({ startup: true, enabled: ENABLED, run_elevated: false, powertoys_version: "v0.101.2362", ...extra });
}

function fakeRegistry(entries) {
  return async (args) => {
    const [key] = args;
    if (args.includes("/s")) {
      const prefix = key.startsWith("HKCU") ? "HKCU" : key.includes("WOW6432Node") ? "WOW" : "HKLM";
      const full = key.replace(/^HKCU/, "HKEY_CURRENT_USER").replace(/^HKLM/, "HKEY_LOCAL_MACHINE");
      let out = `\r\n${full}\\SomethingElse\r\n    DisplayName    REG_SZ    Other App 1.0\r\n`;
      for (const e of entries.filter((x) => x.root === prefix)) {
        out += `\r\n${full}\\${e.id}\r\n    DisplayName    REG_SZ    ${e.name}\r\n`;
      }
      return `${out}\r\nFim da pesquisa: 2 correspondência(s) localizada(s).\r\n`;
    }
    const e = entries.find((x) => key.endsWith(`\\${x.id}`));
    if (!e) return "";
    return `\r\n${key}\r\n    DisplayName    REG_SZ    ${e.name}\r\n    DisplayVersion    REG_SZ    ${e.version}\r\n`
      + (e.dir === undefined ? "" : `    InstallLocation    REG_SZ    ${e.dir}\r\n`)
      + "    NoModify    REG_DWORD    0x1\r\n";
  };
}

function machine({ files = {}, registry = [], processes = [], platform = "win32" } = {}) {
  const m = {
    files: { ...files },
    processes: processes.slice(),
    regCalls: [],
    deps: {
      platform,
      env: { LOCALAPPDATA: LOCAL, ProgramFiles: PF, SystemRoot: "C:\\Windows" },
      regQuery: async (args) => { m.regCalls.push(args); return fakeRegistry(registry)(args); },
      exists: (f) => Object.prototype.hasOwnProperty.call(m.files, f),
      readFile: (f) => {
        if (typeof m.files[f] !== "string") throw new Error("ENOENT");
        return m.files[f];
      },
      listProcesses: async () => m.processes.slice(),
    },
  };
  return m;
}

const PER_USER = { root: "HKCU", id: "{28CDFE7F-68F0-403E-B53D-7A6E1E9AAA17}", name: "PowerToys (Preview) x64", dir: `${USER_DIR}\\`, version: "0.101.2362.0" };

function installedMachine(over = {}) {
  return machine({
    files: {
      [`${USER_DIR}\\PowerToys.exe`]: "",
      [SETTINGS]: generalSettings(),
      [`${LOCAL}\\Microsoft\\PowerToys\\ColorPicker\\settings.json`]: JSON.stringify({ properties: { ActivationShortcut: { win: true, ctrl: false, alt: false, shift: true, code: 67 } } }),
      [`${LOCAL}\\Microsoft\\PowerToys\\AlwaysOnTop\\settings.json`]: JSON.stringify({ properties: { hotkey: { value: { win: true, ctrl: true, alt: false, shift: false, code: 84 } } } }),
      [`${LOCAL}\\Microsoft\\PowerToys\\Awake\\settings.json`]: JSON.stringify({ properties: { keepDisplayOn: false, mode: 0 } }),
      ...(over.files || {}),
    },
    registry: over.registry || [PER_USER],
    processes: over.processes || ["PowerToys.exe", "PowerToys.Awake.exe", "PowerToys.ColorPickerUI.exe"],
  });
}

function fakeHelper(answers = {}) {
  const h = {
    calls: [],
    stopped: 0,
    existing: new Set(Object.values(EVENTS)),
    fg: ["ok", "explorer"],
    async ping() { h.calls.push(["ping"]); return ["ok"]; },
    async has(name) { h.calls.push(["has", name]); return [h.existing.has(name) ? "ok" : "missing"]; },
    async set(name) {
      h.calls.push(["set", name]);
      if (answers.set) return answers.set(name);
      return [h.existing.has(name) ? "ok" : "missing"];
    },
    async foreground() { h.calls.push(["fg"]); return h.fg; },
    stop() { h.stopped++; },
    sets: () => h.calls.filter((c) => c[0] === "set").map((c) => c[1]),
  };
  return h;
}

function makeHost() {
  const h = { stateChanges: 0, stateChanged() { h.stateChanges++; } };
  return h;
}

async function boot(m, extra = {}) {
  const ctx = {
    helper: extra.helper || fakeHelper(),
    toasts: [],
    launches: [],
    slept: [],
    clock: 1_000_000,
    host: makeHost(),
  };
  plugin.__test.configure({
    ...m.deps,
    helper: ctx.helper,
    showToast: (title, message) => ctx.toasts.push([title, message]),
    launch: extra.launch || ((exe, args) => { ctx.launches.push([exe, args]); return true; }),
    now: () => ctx.clock,
    sleep: async (ms) => { ctx.slept.push(ms); ctx.clock += ms; if (extra.onSleep) extra.onSleep(ctx); },
  });
  plugin.onLoad(ctx.host);
  await plugin.__test.refresh(false);
  return ctx;
}

let logSpy, errSpy;
beforeEach(() => {
  logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  plugin.onUnload();
  plugin.__test.configure({});
  logSpy.mockRestore();
  errSpy.mockRestore();
});

describe("tabela de acionamento", () => {
  test("manifest e tabela listam exatamente as mesmas ações", () => {
    expect(manifest.id).toBe("com.orbitring.powertoys");
    expect(manifest.actions.map((a) => a.id).sort()).toEqual(Object.keys(ACTIONS).sort());
    for (const a of manifest.actions) {
      expect(a.id).toMatch(/^[a-z0-9_]+$/);
      expect(a.name).toMatch(/^PowerToys · /);
      expect(typeof a.description).toBe("string");
      expect(a.icon).not.toMatch(/<svg/i);
      expect(a.icon).toMatch(/^</);
    }
    expect(new Set(manifest.actions.map((a) => a.icon)).size).toBe(manifest.actions.length);
  });

  test("os ids pedidos existem", () => {
    for (const id of ["color_picker", "always_on_top", "awake", "fancyzones_editor", "measure_tool", "text_extractor", "peek",
      "shortcut_guide", "find_my_mouse", "mouse_highlighter", "crop_and_lock_thumbnail", "crop_and_lock_reparent",
      "command_palette", "powertoys_run", "advanced_paste", "workspaces", "zoomit", "settings"]) {
      expect(ACTIONS[id]).toBeDefined();
    }
  });

  test("cada ação tem um mecanismo válido", () => {
    for (const [id, a] of Object.entries(ACTIONS)) {
      if (a.kind === "event") {
        expect(isKnownEvent(a.event)).toBe(true);
        expect(a.event).toMatch(EVENT_SHAPE);
      } else {
        expect(a.kind).toBe("settings");
        expect(SETTINGS_WINDOWS.has(a.window)).toBe(true);
      }
      expect(typeof EN.labels[id]).toBe("string");
      if (id !== "settings") expect(typeof a.module).toBe("string");
    }
  });

  test("nomes de evento conferem com shared_constants.h (v0.101.2362.0)", () => {
    expect(ACTIONS.color_picker.event).toBe("Local\\ShowColorPickerEvent-8c46be2a-3e05-4186-b56b-4ae986ef2525");
    expect(ACTIONS.always_on_top.event).toBe("Local\\AlwaysOnTopPinEvent-892e0aa2-cfa8-4cc4-b196-ddeb32314ce8");
    expect(ACTIONS.fancyzones_editor.event).toBe("Local\\FancyZones-ToggleEditorEvent-1e174338-06a3-472b-874d-073b21c62f14");
    expect(ACTIONS.measure_tool.event).toBe("Local\\MeasureToolEvent-3d46745f-09b3-4671-a577-236be7abd199");
    expect(ACTIONS.text_extractor.event).toBe("Local\\PowerOCREvent-dc864e06-e1af-4ecc-9078-f98bee745e3a");
    expect(ACTIONS.peek.event).toBe("Local\\ShowPeekEvent");
    expect(ACTIONS.command_palette.event).toBe("Local\\PowerToysCmdPal-ShowEvent-62336fcd-8611-4023-9b30-091a6af4cc5a");
    expect(ACTIONS.crop_and_lock_thumbnail.event).not.toBe(ACTIONS.crop_and_lock_reparent.event);
  });

  test("nomes desconhecidos ou perigosos são rejeitados", () => {
    for (const bad of ["", null, undefined, 42, "Local\\Foo", "Global\\ShowPeekEvent", "ShowPeekEvent",
      "Local\\ShowPeekEvent; calc.exe", "Local\\ShowPeekEvent\nset", "Local\\ShowPeekEvent\tx", `${EVENTS.PEEK} `, "$(calc)"]) {
      expect(isKnownEvent(bad)).toBe(false);
    }
    for (const name of Object.values(EVENTS)) expect(name).toMatch(/^Local\\[A-Za-z0-9_-]+$/);
  });
});

describe("detecção da instalação", () => {
  test("instalação por usuário (registro HKCU + pasta padrão)", async () => {
    const m = installedMachine();
    const info = await createDetector(m.deps).detect();
    expect(info).toMatchObject({
      supported: true, installed: true, exe: `${USER_DIR}\\PowerToys.exe`, version: "0.101.2362.0",
      source: "registry", running: true, awakeRunning: true, runElevated: false,
    });
    expect(info.enabled).toEqual(ENABLED);
    expect(m.regCalls.filter((a) => a.includes("/s")).map((a) => a[0])).toEqual(UNINSTALL_KEYS);
  });

  test("instalação para a máquina, sem entrada no registro", async () => {
    const m = machine({ files: { [`${MACHINE_DIR}\\PowerToys.exe`]: "", [SETTINGS]: generalSettings() }, processes: [] });
    const info = await createDetector(m.deps).detect();
    expect(info).toMatchObject({ installed: true, exe: `${MACHINE_DIR}\\PowerToys.exe`, source: "machine", version: "0.101.2362", running: false });
  });

  test("pasta padrão do usuário, sem registro", async () => {
    const m = machine({ files: { [`${USER_DIR}\\PowerToys.exe`]: "" } });
    const info = await createDetector(m.deps).detect();
    expect(info).toMatchObject({ installed: true, source: "per-user", version: null, enabled: null });
  });

  test("somente pelo registro: pasta personalizada", async () => {
    const m = machine({
      files: { "D:\\Apps\\PT\\PowerToys.exe": "" },
      registry: [{ root: "HKLM", id: "{FEC7CE70-8256-48A8-99DB-27A34F12A6EF}", name: "PowerToys (Preview)", dir: "D:\\Apps\\PT\\", version: "0.99.1" }],
    });
    const info = await createDetector(m.deps).detect();
    expect(info).toMatchObject({ installed: true, exe: "D:\\Apps\\PT\\PowerToys.exe", version: "0.99.1", source: "registry" });
  });

  test("entrada WOW6432Node também é lida", async () => {
    const m = machine({
      files: { "E:\\PT32\\PowerToys.exe": "" },
      registry: [{ root: "WOW", id: "{AAAAAAAA-0000-0000-0000-000000000000}", name: "PowerToys (Preview)", dir: "E:\\PT32", version: "0.90.0" }],
    });
    expect(await createDetector(m.deps).detect()).toMatchObject({ installed: true, exe: "E:\\PT32\\PowerToys.exe" });
  });

  test("entrada de registro órfã (sem PowerToys.exe) não conta como instalado", async () => {
    const m = machine({ registry: [PER_USER] });
    expect(await createDetector(m.deps).detect()).toMatchObject({ supported: true, installed: false, exe: null });
  });

  test("outros programas com nome parecido são ignorados", async () => {
    const m = machine({
      files: { "C:\\X\\PowerToys.exe": "" },
      registry: [{ root: "HKLM", id: "Fake", name: "Not PowerToys", dir: "C:\\X", version: "1" },
        { root: "HKLM", id: "Fake2", name: "PowerToysX Clone", dir: "C:\\X", version: "1" }],
    });
    expect((await createDetector(m.deps).detect()).installed).toBe(false);
  });

  test("não instalado", async () => {
    const m = machine();
    expect(await createDetector(m.deps).detect()).toMatchObject({ supported: true, installed: false, running: false, enabled: null });
  });

  test("fora do Windows nada é consultado", async () => {
    const m = machine({ platform: "linux", files: { [`${USER_DIR}\\PowerToys.exe`]: "" }, registry: [PER_USER] });
    expect(await createDetector(m.deps).detect()).toMatchObject({ supported: false, installed: false });
    expect(m.regCalls).toHaveLength(0);
  });

  test("leitores que falham não derrubam a detecção", async () => {
    const m = installedMachine();
    m.deps.regQuery = async () => { throw new Error("reg.exe bloqueado"); };
    m.deps.listProcesses = async () => { throw new Error("tasklist bloqueado"); };
    const info = await createDetector(m.deps).detect();
    expect(info).toMatchObject({ installed: true, source: "per-user", running: false });
  });

  test("parseRegOutput / parseTasklist", () => {
    const blocks = parseRegOutput(`\r\n${HKCU}\\{X}\r\n    DisplayName    REG_SZ    PowerToys (Preview) x64\r\n    InstallLocation    REG_SZ    C:\\A B\\PowerToys\\\r\n\r\n${HKLM}\\Y\r\n    DisplayName    REG_SZ    Z\r\n`);
    expect(blocks).toEqual([
      { key: `${HKCU}\\{X}`, values: { DisplayName: "PowerToys (Preview) x64", InstallLocation: "C:\\A B\\PowerToys\\" } },
      { key: `${HKLM}\\Y`, values: { DisplayName: "Z" } },
    ]);
    expect(parseRegOutput("")).toEqual([]);
    expect(parseTasklist('"PowerToys.exe","42152","Console","1","12.345 K"\r\n"PowerToys.Awake.exe","1","Console","1","1 K"\r\nINFO: nada\r\n'))
      .toEqual(["PowerToys.exe", "PowerToys.Awake.exe"]);
    expect(parseTasklist("INFORMAÇÕES: nenhuma tarefa em execução corresponde aos critérios especificados.")).toEqual([]);
  });
});

describe("mapa de módulos ativados", () => {
  test("lê somente booleanos, aceita BOM", () => {
    expect(parseEnabledMap(`\uFEFF${JSON.stringify({ enabled: { ColorPicker: true, Peek: false, Odd: "yes" } })}`)).toEqual({ ColorPicker: true, Peek: false });
  });

  test("ausente ou corrompido → null", () => {
    expect(parseEnabledMap("{ not json")).toBeNull();
    expect(parseEnabledMap("")).toBeNull();
    expect(parseEnabledMap(JSON.stringify({ startup: true }))).toBeNull();
    expect(parseEnabledMap(JSON.stringify({ enabled: [true] }))).toBeNull();
    expect(parseEnabledMap("null")).toBeNull();
  });

  test("settings.json corrompido: instalado, módulos tratados como disponíveis", async () => {
    const ctx = await boot(installedMachine({ files: { [SETTINGS]: "{{{{" } }));
    expect(plugin.__test.info()).toMatchObject({ installed: true, enabled: null });
    expect(plugin.getState().text_extractor.label).toBe("Extrator de Texto");
    expect(await plugin.onAction("text_extractor")).toEqual({ handled: true });
    expect(ctx.helper.sets()).toEqual([EVENTS.TEXT_EXTRACTOR]);
  });

  test("settings.json ausente", async () => {
    const m = installedMachine();
    delete m.files[SETTINGS];
    await boot(m);
    expect(plugin.__test.info()).toMatchObject({ installed: true, enabled: null, version: "0.101.2362.0" });
  });
});

describe("estado das ações", () => {
  test("antes da primeira verificação", () => {
    plugin.__test.configure(installedMachine().deps);
    expect(plugin.getState().color_picker).toEqual({ text: "…", label: "PowerToys · verificando instalação…" });
  });

  test("instalado: módulo ativo mostra o atalho, módulo desativado fica marcado", async () => {
    const ctx = await boot(installedMachine());
    const st = plugin.getState();
    expect(Object.keys(st).sort()).toEqual(Object.keys(ACTIONS).sort());
    expect(st.color_picker).toEqual({ label: "Color Picker · Win+Shift+C" });
    expect(st.always_on_top).toEqual({ label: "Always On Top · Win+Ctrl+T" });
    expect(st.fancyzones_editor).toEqual({ label: "Editor do FancyZones" });
    expect(st.text_extractor).toEqual({ text: "–", label: "Extrator de Texto · desativado no PowerToys" });
    expect(st.crop_and_lock_thumbnail.label).toBe("Crop And Lock (miniatura) · desativado no PowerToys");
    expect(st.zoomit).toEqual({ label: "ZoomIt (zoom)" });
    expect(st.settings).toEqual({ label: "PowerToys 0.101.2362.0 · configurações" });
    expect(ctx.host.stateChanges).toBe(1);
    expect(plugin.getActions()).toEqual([]);
  });

  test("não instalado: todas as ações explicam como instalar", async () => {
    const ctx = await boot(machine());
    const st = plugin.getState();
    for (const id of Object.keys(ACTIONS)) {
      expect(st[id]).toEqual({ text: "–", label: "PowerToys não instalado · instale com: winget install Microsoft.PowerToys" });
    }
    expect(plugin.getActions()).toEqual([]);
    expect(ctx.host.stateChanges).toBe(1);
  });

  test("fora do Windows", async () => {
    const ctx = await boot(machine({ platform: "darwin" }));
    expect(plugin.getState().peek).toEqual({ text: "–", label: "PowerToys só existe no Windows" });
    expect(await plugin.onAction("peek")).toEqual({ handled: false, reason: "not_windows" });
    expect(ctx.helper.calls).toEqual([]);
  });

  test("runner parado aparece no balão", async () => {
    await boot(installedMachine({ processes: [] }));
    expect(plugin.getState().color_picker.label).toBe("Color Picker · Win+Shift+C · PowerToys parado");
    expect(plugin.getState().settings.label).toBe("PowerToys 0.101.2362.0 · configurações · PowerToys parado");
  });

  test("stateChanged quando um módulo é desativado no PowerToys ou o PowerToys é removido", async () => {
    const m = installedMachine();
    const ctx = await boot(m);
    await plugin.__test.refresh(false);
    expect(ctx.host.stateChanges).toBe(1);

    m.files[SETTINGS] = generalSettings({ enabled: { ...ENABLED, ColorPicker: false } });
    await plugin.__test.refresh(false);
    expect(ctx.host.stateChanges).toBe(2);
    expect(plugin.getState().color_picker.text).toBe("–");

    delete m.files[`${USER_DIR}\\PowerToys.exe`];
    await plugin.__test.refresh(true);
    expect(ctx.host.stateChanges).toBe(3);
    expect(plugin.getState().color_picker.label).toMatch(/não instalado/);
  });

  test("a parte de registro é reaproveitada entre verificações (5 min)", async () => {
    const m = installedMachine();
    const ctx = await boot(m);
    const before = m.regCalls.length;
    await plugin.__test.refresh(false);
    expect(m.regCalls.length).toBe(before);
    ctx.clock += 5 * 60_000;
    await plugin.__test.refresh(false);
    expect(m.regCalls.length).toBeGreaterThan(before);
  });

  test("speaks the app language: key names follow it", () => {
    const f = plugin._internals.formatHotkey;
    try {
      plugin.onLocaleChanged("en-US");
      expect(f({ ctrl: true, code: 32 })).toBe("Ctrl+Space");
      plugin.onLocaleChanged("es-ES");
      expect(f({ ctrl: true, code: 32 })).toBe("Ctrl+Espacio");
    } finally {
      plugin.onLocaleChanged("pt-BR");
    }
  });

  test("formatHotkey", () => {
    const f = plugin._internals.formatHotkey;
    expect(f({ win: true, ctrl: true, alt: false, shift: true, code: 77 })).toBe("Win+Ctrl+Shift+M");
    expect(f({ win: false, ctrl: true, alt: false, shift: false, code: 32 })).toBe("Ctrl+Espaço");
    expect(f({ win: false, ctrl: false, alt: true, shift: false, code: 113 })).toBe("Alt+F2");
    expect(f({ win: false, ctrl: false, alt: false, shift: false, code: 0 })).toBe("");
    expect(f({ win: true, code: 255 })).toBe("");
    expect(f(null)).toBe("");
  });
});

describe("Awake", () => {
  const awakeFile = `${LOCAL}\\Microsoft\\PowerToys\\Awake\\settings.json`;

  test("inativo no modo passivo", async () => {
    await boot(installedMachine());
    expect(plugin.getState().awake).toEqual({ active: false, label: "Awake · inativo · clique para abrir as configurações" });
  });

  test("ativo quando o modo mantém o computador acordado", async () => {
    const m = installedMachine({ files: { [awakeFile]: JSON.stringify({ properties: { mode: 1, keepDisplayOn: true } }) } });
    const ctx = await boot(m);
    expect(plugin.getState().awake).toEqual({ active: true, label: "Awake · ativo (indefinido) · tela ligada · clique para abrir as configurações" });

    m.files[awakeFile] = JSON.stringify({ properties: { mode: 2, keepDisplayOn: false } });
    await plugin.__test.refresh(false);
    expect(plugin.getState().awake.label).toMatch(/ativo \(temporizado\)/);
    expect(ctx.host.stateChanges).toBe(2);

    m.files[awakeFile] = JSON.stringify({ properties: { mode: 0 } });
    await plugin.__test.refresh(false);
    expect(plugin.getState().awake.active).toBe(false);
    expect(ctx.host.stateChanges).toBe(3);
  });

  test("processo do Awake parado → inativo, mesmo com o modo configurado", async () => {
    await boot(installedMachine({
      files: { [awakeFile]: JSON.stringify({ properties: { mode: 1 } }) },
      processes: ["PowerToys.exe"],
    }));
    expect(plugin.getState().awake.active).toBe(false);
  });

  test("módulo desativado", async () => {
    await boot(installedMachine({ files: { [SETTINGS]: generalSettings({ enabled: { ...ENABLED, Awake: false } }) } }));
    expect(plugin.getState().awake).toEqual({ text: "–", label: "Awake · desativado no PowerToys", active: false });
  });

  test("o clique só abre a página de configurações — nenhum arquivo é escrito, nenhum evento", async () => {
    const ctx = await boot(installedMachine());
    expect(await plugin.onAction("awake")).toEqual({ handled: true });
    expect(ctx.launches).toEqual([[`${USER_DIR}\\PowerToys.exe`, ["--open-settings=Awake"]]]);
    expect(ctx.helper.calls).toEqual([]);
  });
});

describe("roteamento das ações", () => {
  test("cada ação de evento dispara exatamente o evento da tabela", async () => {
    const all = {};
    for (const a of Object.values(ACTIONS)) if (a.module) all[a.module] = true;
    const ctx = await boot(installedMachine({ files: { [SETTINGS]: generalSettings({ enabled: all }) } }));
    for (const [id, a] of Object.entries(ACTIONS)) {
      if (a.kind !== "event") continue;
      ctx.helper.calls.length = 0;
      expect(await plugin.onAction(id)).toEqual({ handled: true });
      expect(ctx.helper.sets()).toEqual([a.event]);
    }
    expect(ctx.toasts).toEqual([]);
    expect(ctx.launches).toEqual([]);
  });

  test("settings abre o painel pelo CLI documentado", async () => {
    const ctx = await boot(installedMachine());
    expect(await plugin.onAction("settings")).toEqual({ handled: true });
    expect(ctx.launches).toEqual([[`${USER_DIR}\\PowerToys.exe`, ["--open-settings=Dashboard"]]]);
    expect(ctx.helper.calls).toEqual([]);
  });

  test("ações desconhecidas ou maliciosas não chegam ao helper", async () => {
    const ctx = await boot(installedMachine());
    for (const id of ["nope", "", "__proto__", "constructor", "toString", "color_picker; calc", "Local\\ShowPeekEvent", "../settings"]) {
      expect(await plugin.onAction(id)).toEqual({ handled: false, reason: "unknown_action" });
    }
    expect(await plugin.onAction(undefined)).toEqual({ handled: false, reason: "unknown_action" });
    expect(ctx.helper.calls).toEqual([]);
    expect(ctx.launches).toEqual([]);
  });

  test("não instalado: um único aviso e nada mais", async () => {
    const ctx = await boot(machine());
    expect(await plugin.onAction("color_picker")).toEqual({ handled: false, reason: "not_installed" });
    expect(await plugin.onAction("color_picker")).toEqual({ handled: false, reason: "not_installed" });
    expect(ctx.toasts).toEqual([["PowerToys", "PowerToys não instalado · instale com: winget install Microsoft.PowerToys"]]);
    expect(ctx.helper.calls).toEqual([]);
    expect(ctx.launches).toEqual([]);
    ctx.clock += 5_000;
    await plugin.onAction("settings");
    expect(ctx.toasts).toHaveLength(2);
  });

  test("PowerToys instalado depois: o próximo clique já encontra", async () => {
    const m = machine();
    const ctx = await boot(m);
    expect((await plugin.onAction("color_picker")).reason).toBe("not_installed");
    m.files[`${USER_DIR}\\PowerToys.exe`] = "";
    m.files[SETTINGS] = generalSettings();
    m.processes.push("PowerToys.exe");
    ctx.clock += 11_000;
    expect(await plugin.onAction("color_picker")).toEqual({ handled: true });
    expect(ctx.helper.sets()).toEqual([EVENTS.COLOR_PICKER]);
  });

  test("módulo desativado: avisa e não dispara nem ativa nada", async () => {
    const ctx = await boot(installedMachine());
    expect(await plugin.onAction("text_extractor")).toEqual({ handled: false, reason: "module_disabled" });
    expect(ctx.toasts).toEqual([["PowerToys", "Extrator de Texto está desativado. Ative o módulo nas Configurações do PowerToys."]]);
    expect(ctx.helper.calls).toEqual([]);
    expect(ctx.launches).toEqual([]);
  });

  test("o mapa de módulos é relido a cada clique", async () => {
    const m = installedMachine();
    const ctx = await boot(m);
    m.files[SETTINGS] = generalSettings({ enabled: { ...ENABLED, TextExtractor: true, ColorPicker: false } });
    expect(await plugin.onAction("text_extractor")).toEqual({ handled: true });
    expect((await plugin.onAction("color_picker")).reason).toBe("module_disabled");
    expect(ctx.helper.sets()).toEqual([EVENTS.TEXT_EXTRACTOR]);
  });

  test("ações sobre a janela ativa esperam um pouco antes de disparar", async () => {
    const ctx = await boot(installedMachine());
    await plugin.onAction("color_picker");
    expect(ctx.slept).toEqual([]);
    await plugin.onAction("always_on_top");
    expect(ctx.slept).toEqual([150]);
  });

  test("Peek só dispara com o Explorador (ou o próprio Peek) em primeiro plano", async () => {
    const ctx = await boot(installedMachine());
    ctx.helper.fg = ["ok", "Code"];
    expect(await plugin.onAction("peek")).toEqual({ handled: false, reason: "needs_explorer" });
    expect(ctx.helper.sets()).toEqual([]);
    expect(ctx.toasts[0][1]).toMatch(/Explorador de Arquivos/);

    ctx.helper.fg = ["ok", "explorer"];
    expect(await plugin.onAction("peek")).toEqual({ handled: true });
    ctx.helper.fg = ["ok", "PowerToys.Peek.UI"];
    expect(await plugin.onAction("peek")).toEqual({ handled: true });
    ctx.helper.fg = ["err"];
    expect(await plugin.onAction("peek")).toEqual({ handled: true });
    expect(ctx.helper.sets()).toEqual([EVENTS.PEEK, EVENTS.PEEK, EVENTS.PEEK]);
  });

  test("evento ausente com o PowerToys em execução", async () => {
    const ctx = await boot(installedMachine());
    ctx.helper.existing.delete(EVENTS.COLOR_PICKER);
    expect(await plugin.onAction("color_picker")).toEqual({ handled: false, reason: "event_missing" });
    expect(ctx.launches).toEqual([]);
    expect(ctx.toasts[0][1]).toMatch(/^Color Picker não respondeu/);
  });

  test("PowerToys elevado recusa o acionamento", async () => {
    const ctx = await boot(installedMachine(), { helper: fakeHelper({ set: () => ["denied"] }) });
    expect(await plugin.onAction("color_picker")).toEqual({ handled: false, reason: "access_denied" });
    expect(ctx.toasts[0][1]).toMatch(/administrador/);
  });

  test("helper indisponível", async () => {
    const ctx = await boot(installedMachine(), { helper: fakeHelper({ set: () => ["timeout"] }) });
    expect(await plugin.onAction("color_picker")).toEqual({ handled: false, reason: "helper_failed" });
    expect(ctx.toasts[0][1]).toBe("Não foi possível acionar Color Picker.");
  });

  test("um erro inesperado não escapa de onAction", async () => {
    const h = fakeHelper();
    h.set = async () => { throw new Error("boom"); };
    await boot(installedMachine(), { helper: h });
    expect(await plugin.onAction("color_picker")).toEqual({ handled: false, reason: "error" });
  });
});

describe("PowerToys parado", () => {
  test("inicia o runner, espera o evento existir e então dispara", async () => {
    const m = installedMachine({ processes: [] });
    const helper = fakeHelper();
    helper.existing.clear();
    const ctx = await boot(m, {
      helper,
      onSleep: (c) => { if (c.slept.length === 3) helper.existing.add(EVENTS.COLOR_PICKER); },
    });
    expect(await plugin.onAction("color_picker")).toEqual({ handled: true });
    expect(ctx.launches).toEqual([[`${USER_DIR}\\PowerToys.exe`, []]]);
    expect(ctx.slept).toEqual([400, 400, 400]);
    expect(helper.calls.map((c) => c[0])).toEqual(["set", "has", "has", "has", "has", "set"]);
    expect(ctx.toasts).toEqual([]);
  });

  test("o evento nunca aparece: desiste depois do prazo e avisa", async () => {
    const helper = fakeHelper();
    helper.existing.clear();
    const ctx = await boot(installedMachine({ processes: [] }), { helper });
    expect(await plugin.onAction("color_picker")).toEqual({ handled: false, reason: "not_running" });
    expect(ctx.launches).toHaveLength(1);
    expect(ctx.slept.reduce((a, b) => a + b, 0)).toBe(10_000);
    expect(ctx.toasts[0][1]).toMatch(/^PowerToys não está em execução/);
    expect(helper.sets()).toHaveLength(1);
  });

  test("não foi possível iniciar o runner", async () => {
    const helper = fakeHelper();
    helper.existing.clear();
    const ctx = await boot(installedMachine({ processes: [] }), { helper, launch: () => false });
    expect(await plugin.onAction("color_picker")).toEqual({ handled: false, reason: "not_running" });
    expect(ctx.toasts).toEqual([["PowerToys", "PowerToys não está em execução. Abra o PowerToys e tente de novo."]]);
  });

  test("com 'executar como administrador' o runner não é iniciado sozinho (evita o UAC)", async () => {
    const helper = fakeHelper();
    helper.existing.clear();
    const ctx = await boot(installedMachine({ processes: [], files: { [SETTINGS]: generalSettings({ run_elevated: true }) } }), { helper });
    expect(await plugin.onAction("color_picker")).toEqual({ handled: false, reason: "not_running" });
    expect(ctx.launches).toEqual([]);
  });
});

function fakeChild(behaviour = {}) {
  const c = new EventEmitter();
  c.stdout = new EventEmitter();
  c.killed = false;
  c.written = [];
  c.stdin = Object.assign(new EventEmitter(), {
    ended: false,
    write(data) {
      c.written.push(data);
      if (behaviour.silent || c.killed) return true;
      for (const line of String(data).split("\n").filter(Boolean)) {
        const [id, cmd, arg] = line.split("\t");
        let r = "err";
        if (cmd === "ping") r = "ok";
        else if (cmd === "has" || cmd === "set") r = behaviour.missing ? "missing" : "ok";
        else if (cmd === "fg") r = "ok\texplorer";
        c.last = { id, cmd, arg };
        const reply = `${id}\t${r}\r\n`;
        setImmediate(() => { c.stdout.emit("data", Buffer.from(reply.slice(0, 2))); c.stdout.emit("data", Buffer.from(reply.slice(2))); });
      }
      return true;
    },
    end() { c.stdin.ended = true; },
  });
  c.kill = () => { if (c.killed) return; c.killed = true; setImmediate(() => c.emit("exit", null, "SIGTERM")); };
  return c;
}

function fakeTimers() {
  let seq = 0;
  const timers = new Map();
  return {
    setTimeout: (fn, ms) => { const id = ++seq; timers.set(id, { fn, ms }); return id; },
    clearTimeout: (id) => { timers.delete(id); },
    fire(ms) {
      for (const [id, t] of Array.from(timers)) if (t.ms === ms) { timers.delete(id); t.fn(); }
    },
    count: (ms) => Array.from(timers.values()).filter((t) => t.ms === ms).length,
  };
}

function helperRig(behaviour) {
  const rig = { children: [], spawns: [], timers: fakeTimers() };
  rig.helper = createHelper({
    spawn: (file, args, opts) => { rig.spawns.push({ file, args, opts }); const c = fakeChild(behaviour); rig.children.push(c); return c; },
    env: { SystemRoot: "C:\\Windows" },
    setTimeout: rig.timers.setTimeout,
    clearTimeout: rig.timers.clearTimeout,
    idleMs: 300_000,
    requestTimeoutMs: 4_000,
  });
  return rig;
}

describe("helper de eventos (PowerShell)", () => {
  test("início preguiçoso, oculto, sem perfil; um único processo para vários pedidos", async () => {
    const rig = helperRig();
    expect(rig.spawns).toHaveLength(0);
    expect(rig.helper.isRunning()).toBe(false);

    expect(await rig.helper.set(EVENTS.COLOR_PICKER)).toEqual(["ok"]);
    expect(await rig.helper.has(EVENTS.PEEK)).toEqual(["ok"]);
    expect(await rig.helper.ping()).toEqual(["ok"]);
    expect(await rig.helper.foreground()).toEqual(["ok", "explorer"]);
    expect(rig.spawns).toHaveLength(1);
    expect(rig.helper.startCount()).toBe(1);

    const { file, args, opts } = rig.spawns[0];
    expect(file.toLowerCase()).toMatch(/system32[\\/]windowspowershell[\\/]v1\.0[\\/]powershell\.exe$/);
    expect(args).toEqual(expect.arrayContaining(["-NoProfile", "-NonInteractive", "-EncodedCommand"]));
    expect(opts.windowsHide).toBe(true);
    expect(Buffer.from(args[args.indexOf("-EncodedCommand") + 1], "base64").toString("utf16le")).toBe(SCRIPT);
    expect(helperArgs()).toEqual(args);
    expect(rig.children[0].written).toEqual([
      `1\tset\t${EVENTS.COLOR_PICKER}\n`, `2\thas\t${EVENTS.PEEK}\n`, "3\tping\n", "4\tfg\n",
    ]);
  });

  test("o script nunca avalia a entrada e revalida o nome do evento", () => {
    expect(SCRIPT).not.toMatch(/Invoke-Expression|\biex\b|ScriptBlock|Invoke-Command|Start-Process/i);
    expect(SCRIPT).toContain("OpenExisting($arg)");
    expect(SCRIPT).toContain("'^Local\\\\[A-Za-z0-9_-]{1,120}$'");
    expect(SCRIPT.match(/\.Set\(\)/g)).toHaveLength(1);
  });

  test("encerra sozinho depois do tempo ocioso e reinicia sob demanda", async () => {
    const rig = helperRig();
    await rig.helper.ping();
    expect(rig.timers.count(300_000)).toBe(1);
    await rig.helper.ping();
    expect(rig.timers.count(300_000)).toBe(1);

    rig.timers.fire(300_000);
    expect(rig.helper.isRunning()).toBe(false);
    expect(rig.children[0].killed).toBe(true);
    expect(rig.children[0].stdin.ended).toBe(true);

    expect(await rig.helper.set(EVENTS.PEEK)).toEqual(["ok"]);
    expect(rig.spawns).toHaveLength(2);
    expect(rig.helper.isRunning()).toBe(true);
  });

  test("stop() mata o processo e responde o que estava pendente", async () => {
    const rig = helperRig({ silent: true });
    const p = rig.helper.set(EVENTS.PEEK);
    expect(rig.helper.isRunning()).toBe(true);
    rig.helper.stop();
    expect(await p).toEqual(["dead"]);
    expect(rig.children[0].killed).toBe(true);
    expect(rig.helper.isRunning()).toBe(false);
    expect(rig.timers.count(300_000)).toBe(0);
    expect(rig.timers.count(4_000)).toBe(0);
  });

  test("pedido sem resposta: tempo esgotado, helper descartado, próximo pedido reinicia", async () => {
    const rig = helperRig({ silent: true });
    const p = rig.helper.set(EVENTS.PEEK);
    rig.timers.fire(4_000);
    expect(await p).toEqual(["timeout"]);
    expect(rig.children[0].killed).toBe(true);
    rig.helper.ping();
    expect(rig.spawns).toHaveLength(2);
    rig.helper.stop();
  });

  test("processo que morre sozinho é substituído", async () => {
    const rig = helperRig();
    await rig.helper.ping();
    rig.children[0].emit("exit", 1, null);
    expect(rig.helper.isRunning()).toBe(false);
    expect(await rig.helper.ping()).toEqual(["ok"]);
    expect(rig.spawns).toHaveLength(2);
  });

  test("spawn que falha não lança", async () => {
    const helper = createHelper({ spawn: () => { throw new Error("ENOENT"); }, env: {} });
    expect(await helper.set(EVENTS.PEEK)).toEqual(["dead"]);
    expect(helper.isRunning()).toBe(false);
  });

  test("evento inexistente é repassado como 'missing'", async () => {
    const rig = helperRig({ missing: true });
    expect(await rig.helper.has(EVENTS.ZOOMIT_ZOOM)).toEqual(["missing"]);
    rig.helper.stop();
  });

  test("o plugin cria o helper só no primeiro clique e o mata em onUnload", async () => {
    const children = [];
    const m = installedMachine();
    plugin.__test.configure({
      ...m.deps,
      spawn: () => { const c = fakeChild(); children.push(c); return c; },
      showToast: () => {},
      launch: () => true,
      sleep: async () => {},
    });
    plugin.onLoad(makeHost());
    await plugin.__test.refresh(false);
    expect(children).toHaveLength(0);

    expect(await plugin.onAction("color_picker")).toEqual({ handled: true });
    expect(await plugin.onAction("fancyzones_editor")).toEqual({ handled: true });
    expect(children).toHaveLength(1);
    expect(children[0].written.map((w) => w.split("\t").slice(1).join(" ").trim())).toEqual([
      `set ${EVENTS.COLOR_PICKER}`, `set ${EVENTS.FANCYZONES_EDITOR}`,
    ]);

    plugin.onUnload();
    expect(children[0].killed).toBe(true);
  });
});

describe("toast", () => {
  test("o texto é escapado como XML", () => {
    const { toastXml, escapeXml } = plugin._internals;
    expect(escapeXml(`<a href="x">Tom & 'Jerry'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;Tom &amp; &apos;Jerry&apos;&lt;/a&gt;");
    expect(toastXml("PowerToys", "a < b")).toBe('<toast><visual><binding template="ToastGeneric"><text>PowerToys</text><text>a &lt; b</text></binding></visual></toast>');
  });
});
