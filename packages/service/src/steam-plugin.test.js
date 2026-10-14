process.env.ORBIT_PLUGIN_LOCALE = "pt-BR";

const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");

const PLUGIN_DIR = path.resolve(__dirname, "../../../plugins/steam");
const plugin = require(path.join(PLUGIN_DIR, "index.js"));
const { parseVdf, vget } = require(path.join(PLUGIN_DIR, "vdf.js"));
const lib = require(path.join(PLUGIN_DIR, "library.js"));
const art = require(path.join(PLUGIN_DIR, "art.js"));
const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN_DIR, "manifest.json"), "utf8"));

const CANARY_USER = "0x7c0ffee1";
const CANARY_ACCOUNT = "canary_account_xyz";
const T0 = Date.UTC(2026, 9, 13, 12, 0, 0);
const SEC0 = Math.floor(T0 / 1000);
const DAY = 86400;

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);
const flush = async () => { for (let i = 0; i < 12; i++) await new Promise((r) => setImmediate(r)); };

let tmp;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-steam-test-")); });
afterEach(() => {
  plugin.onUnload();
  plugin.__test.configure({});
  fs.rmSync(tmp, { recursive: true, force: true });
});

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function acf(a) {
  const kv = {
    appid: a.appid, universe: "1", name: a.name, StateFlags: a.flags === undefined ? 4 : a.flags,
    installdir: a.installdir || a.name, LastUpdated: a.lastUpdated || 0, LastPlayed: a.lastPlayed || 0,
    SizeOnDisk: 1000, BytesToDownload: a.total || 0, BytesDownloaded: a.done || 0,
  };
  let out = '"AppState"\n{\n';
  for (const k of Object.keys(kv)) out += `\t"${k}"\t\t"${String(kv[k]).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"\n`;
  return `${out}\t"InstalledDepots"\n\t{\n\t\t"${a.appid}1"\n\t\t{\n\t\t\t"manifest"\t\t"123"\n\t\t}\n\t}\n}\n`;
}

const esc = (p) => p.replace(/\\/g, "\\\\");

function machine({ apps = [], installed = true, platform = "win32", secondLibrary = false, running = 0, pid = 4242, host = {} } = {}) {
  const steam = path.join(tmp, "Steam");
  const second = path.join(tmp, "DriveD", "SteamLibrary");
  const dataDir = path.join(tmp, "plugin-data", "steam");
  if (installed) write(path.join(steam, "steam.exe"), "");
  fs.mkdirSync(path.join(steam, "steamapps"), { recursive: true });
  if (secondLibrary) fs.mkdirSync(path.join(second, "steamapps"), { recursive: true });
  write(path.join(steam, "steamapps", "libraryfolders.vdf"),
    `"libraryfolders"\n{\n\t"0"\n\t{\n\t\t"path"\t\t"${esc(steam)}"\n\t\t"apps"\n\t\t{\n\t\t\t"550"\t\t"1"\n\t\t}\n\t}\n`
    + (secondLibrary ? `\t"1"\n\t{\n\t\t"path"\t\t"${esc(second)}"\n\t}\n` : "") + "}\n");
  write(path.join(steam, "userdata", "123456", "config", "localconfig.vdf"), `"UserLocalConfigStore"\n{\n\t"PersonaName"\t\t"${CANARY_ACCOUNT}"\n}\n`);
  write(path.join(steam, "config", "loginusers.vdf"), `"users"\n{\n\t"7656119"\n\t{\n\t\t"AccountName"\t\t"${CANARY_ACCOUNT}"\n\t}\n}\n`);

  const m = {
    steam, second, dataDir,
    t: T0,
    running, pid, pidAlive: true,
    regCalls: [], http: [], opened: [], toasts: [], logs: [], thumbCalls: [], processStartCalls: [],
    httpAnswer: () => null,
    processStart: null,
    stateChanges: 0, actionsChanges: 0,
    setApp(a) {
      const root = a.lib === 1 ? second : steam;
      write(path.join(root, "steamapps", `appmanifest_${a.appid}.acf`), acf(a));
      for (const rel of Object.keys(a.art || {})) write(path.join(steam, "appcache", "librarycache", String(a.appid), rel), a.art[rel]);
    },
  };
  for (const a of apps) m.setApp(a);

  m.host = {
    stateChanged() { m.stateChanges++; },
    actionsChanged() { m.actionsChanges++; },
    makeThumbnail: async (input, opts) => {
      m.thumbCalls.push([input, opts]);
      return `data:image/webp;base64,${Buffer.from(`thumb:${path.basename(input)}`).toString("base64")}`;
    },
    ...host,
  };
  for (const k of Object.keys(m.host)) if (m.host[k] === undefined) delete m.host[k];

  m.deps = {
    platform,
    noTimer: true,
    dataDir,
    now: () => m.t,
    log: (...a) => m.logs.push(a.join(" ")),
    regQuery: async (args) => {
      m.regCalls.push(args);
      const [key, flag, name] = args;
      const full = key.replace(/^HKCU/, "HKEY_CURRENT_USER");
      const values = /ActiveProcess$/.test(key)
        ? { pid: ["REG_DWORD", `0x${m.pid.toString(16)}`], ActiveUser: ["REG_DWORD", CANARY_USER] }
        : { SteamPath: ["REG_SZ", steam.replace(/\\/g, "/")], RunningAppID: ["REG_DWORD", `0x${m.running.toString(16)}`], AutoLoginUser: ["REG_SZ", CANARY_ACCOUNT] };
      const names = flag === "/v" ? [name] : Object.keys(values);
      let out = `\r\n${full}\r\n`;
      for (const n of names) if (values[n]) out += `    ${n}    ${values[n][0]}    ${values[n][1]}\r\n`;
      return `${out}\r\n`;
    },
    pidAlive: () => m.pidAlive,
    processStart: async (dir) => { m.processStartCalls.push(dir); return m.processStart; },
    httpGet: async (url, opts) => { m.http.push([url, opts]); return m.httpAnswer(url); },
    open: (url) => { m.opened.push(url); return true; },
    showToast: (title, message) => m.toasts.push([title, message]),
  };
  m.load = async () => {
    plugin.__test.configure(m.deps);
    await plugin.onLoad(m.host);
    await flush();
  };
  m.tick = async () => { await plugin.__test.tick(true); await flush(); };
  return m;
}

const pristine = { readdirSync: fs.readdirSync, statSync: fs.statSync, existsSync: fs.existsSync };
function snapshot(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of pristine.readdirSync.call(fs, d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) { out.push(`${f}/`); walk(f); } else {
        const st = pristine.statSync.call(fs, f);
        out.push(`${f}|${st.size}|${st.mtimeMs}`);
      }
    }
  };
  if (pristine.existsSync.call(fs, dir)) walk(dir);
  return out.sort();
}

const CAPSULE = { "library_600x900.jpg": JPEG };
const game = (appid, name, daysAgo, extra = {}) => ({ appid, name, lastPlayed: SEC0 - daysAgo * DAY, art: CAPSULE, ...extra });

describe("VDF parser", () => {
  test("nested blocks, both tab styles and comments", () => {
    const text = '"root"\n{\n\t"a"\t\t"1"\n    "b"    "two words"\n\t// comment\n\t"sub"\n\t{\n\t\t"deep"\n\t\t{\n\t\t\t"x"\t"y"\n\t\t}\n\t}\n}\n';
    expect(JSON.parse(JSON.stringify(parseVdf(text)))).toEqual({ root: { a: "1", b: "two words", sub: { deep: { x: "y" } } } });
  });

  test("escaped quotes and backslashes; one-line and unquoted forms", () => {
    const v = parseVdf('"AppState" { "name" "Say \\"hi\\"" "path" "C:\\\\Games\\\\X" bare word2 }');
    expect(v.AppState.name).toBe('Say "hi"');
    expect(v.AppState.path).toBe("C:\\Games\\X");
    expect(v.AppState.bare).toBe("word2");
  });

  test("vget is case-insensitive", () => {
    expect(vget({ LastPlayed: "5" }, "lastplayed")).toBe("5");
    expect(vget(null, "x")).toBeUndefined();
  });

  test.each([
    ["empty", ""],
    ["not a string", 42],
    ["only braces", "{ } } {"],
    ["a lone word", "garbage"],
    ["huge input", "x".repeat(3 * 1024 * 1024)],
  ])("garbage (%s) yields null", (_n, input) => {
    expect(parseVdf(input)).toBeNull();
  });

  test.each([
    ["binary", "\u0001\u0002{{{}}}}}}\u0000\"\\"],
    ["unbalanced", '"a" { "b" { "c" "d" } } } } "e" { {'],
    ["key without value", '"a" { "b" } "c"'],
    ["html", "<html><body>404</body></html>"],
  ])("garbage (%s) never throws and never yields an app", (_n, input) => {
    expect(() => parseVdf(input)).not.toThrow();
    expect(lib.parseAppManifest(input)).toBeNull();
    expect(lib.parseLibraryFolders(input)).toEqual([]);
  });

  test("a truncated file keeps what was complete", () => {
    const v = parseVdf('"AppState"\n{\n\t"appid"\t\t"550"\n\t"name"\t\t"Left 4 De');
    expect(v.AppState.appid).toBe("550");
    expect(v.AppState.name).toBeUndefined();
  });

  test("absurd nesting does not overflow the stack", () => {
    expect(() => parseVdf('"a" {'.repeat(5000))).not.toThrow();
  });

  test("appmanifest → app record; bad ones are dropped", () => {
    const a = lib.parseAppManifest(acf({ appid: 550, name: "Left 4 Dead 2", lastPlayed: 123, flags: 1026, total: 200, done: 50 }));
    expect(a).toMatchObject({ appid: "550", name: "Left 4 Dead 2", lastPlayed: 123, updating: true, paused: false, bytesToDownload: 200, bytesDownloaded: 50 });
    expect(lib.parseAppManifest(acf({ appid: "55x", name: "X" }))).toBeNull();
    expect(lib.parseAppManifest('"AppState" { "appid" "5" }')).toBeNull();
    expect(lib.parseAppManifest('"Other" { "appid" "5" "name" "x" }')).toBeNull();
    expect(lib.parseAppManifest("garbage")).toBeNull();
    expect(lib.parseAppManifest(acf({ appid: 7, name: "line\nbreak\u0007 name" })).name).toBe("line break name");
    expect(lib.parseAppManifest(acf({ appid: 7, name: "N", installdir: "..\\..\\Windows" })).installdir).toBeNull();
    expect(lib.parseAppManifest(acf({ appid: 7, name: "N", flags: 1538 }))).toMatchObject({ updating: true, paused: true });
    expect(lib.parseAppManifest(acf({ appid: 7, name: "N", flags: 6 }))).toMatchObject({ updating: false });
  });
});

describe("install check", () => {
  test("Steam missing: every action dimmed, no dynamic actions, a press shows one toast and opens nothing", async () => {
    const m = machine({ installed: false, apps: [game(550, "Left 4 Dead 2", 1)] });
    await m.load();
    expect(plugin.__test.info()).toMatchObject({ supported: true, installed: false });
    expect(plugin.getActions()).toEqual([]);
    const st = plugin.getState();
    expect(Object.keys(st).sort()).toEqual(manifest.actions.map((a) => a.id).sort());
    for (const id of Object.keys(st)) expect(st[id]).toEqual({ text: "–", label: "Steam não instalado" });

    expect(await plugin.onAction("library")).toEqual({ handled: false, reason: "not_installed" });
    expect(await plugin.onAction("game.550")).toEqual({ handled: false, reason: "not_installed" });
    expect(m.toasts).toEqual([["Steam", "Steam não instalado."]]);
    expect(m.opened).toEqual([]);
  });

  test("registry value present but steam.exe gone → not installed", async () => {
    const m = machine({ apps: [game(550, "L4D2", 1)] });
    fs.rmSync(path.join(m.steam, "steam.exe"));
    await m.load();
    expect(plugin.__test.info().installed).toBe(false);
  });

  test("not Windows: says so and never queries a registry", async () => {
    const m = machine({ platform: "linux" });
    await m.load();
    expect(plugin.getState().playing).toEqual({ text: "–", label: "Steam: só no Windows por enquanto" });
    expect(plugin.getActions()).toEqual([]);
    expect(await plugin.onAction("store")).toEqual({ handled: false, reason: "not_windows" });
    expect(m.regCalls).toEqual([]);
    expect(m.opened).toEqual([]);
  });

  test("installing Steam later is noticed on the next full check", async () => {
    const m = machine({ installed: false, apps: [game(550, "L4D2", 1)] });
    await m.load();
    write(path.join(m.steam, "steam.exe"), "");
    m.t += 61_000;
    await plugin.__test.tick(false);
    await flush();
    expect(plugin.getActions().map((a) => a.id)).toEqual(["game.550"]);
    expect(m.actionsChanges).toBeGreaterThanOrEqual(1);
  });

  test("with nothing injected the plugin is inert under jest (no registry, no network, no cache dir)", async () => {
    plugin.__test.configure({ noTimer: true });
    await plugin.onLoad({});
    expect(plugin.getActions()).toEqual([]);
    expect(plugin.getState().playing.text).toBe("–");
  });
});

describe("library folders and recent games", () => {
  test("finds games on a second drive listed in libraryfolders.vdf", async () => {
    const m = machine({ secondLibrary: true, apps: [game(550, "Left 4 Dead 2", 2), game(1203620, "Enshrouded", 1, { lib: 1 })] });
    await m.load();
    expect(plugin.__test.folders()).toEqual([m.steam, m.second]);
    expect(plugin.getActions().map((a) => [a.id, a.name])).toEqual([["game.1203620", "Enshrouded"], ["game.550", "Left 4 Dead 2"]]);
  });

  test("falls back to config\\libraryfolders.vdf, accepts the old flat format, skips missing folders", () => {
    const m = machine({ secondLibrary: true });
    fs.rmSync(path.join(m.steam, "steamapps", "libraryfolders.vdf"));
    write(path.join(m.steam, "config", "libraryfolders.vdf"),
      `"LibraryFolders"\n{\n\t"TimeNextStatsReport"\t\t"1"\n\t"1"\t\t"${esc(m.second)}"\n\t"2"\t\t"${esc(path.join(tmp, "Gone"))}"\n\t"3"\t\t"relative\\\\path"\n}\n`);
    const l = lib.createLibrary({ platform: "win32", fs, regQuery: async () => "" });
    expect(l.libraryFolders(m.steam)).toEqual([m.steam, m.second]);
  });

  test("an unreadable libraryfolders.vdf still leaves the Steam folder itself", () => {
    const m = machine();
    write(path.join(m.steam, "steamapps", "libraryfolders.vdf"), "\u0000\u0001 not vdf {{{");
    const l = lib.createLibrary({ platform: "win32", fs, regQuery: async () => "" });
    expect(l.libraryFolders(m.steam)).toEqual([m.steam]);
  });

  test("the 8 most recently played, newest first; never-played apps are left out", async () => {
    const apps = [];
    for (let i = 1; i <= 11; i++) apps.push(game(1000 + i, `Game ${i}`, i));
    apps.push({ appid: 228980, name: "Steamworks Common Redistributables", lastPlayed: 0 });
    const m = machine({ apps });
    await m.load();
    const acts = plugin.getActions();
    expect(acts.map((a) => a.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map((i) => `game.${1000 + i}`));
    expect(acts.length).toBe(plugin._internals.MAX_GAMES);
    for (const a of acts) {
      expect(a.id).toMatch(/^[a-z0-9_.-]{1,64}$/);
      expect(a.icon).toBe(manifest.actions[0].icon);
      expect(a.stateful).toBe(true);
    }
    expect(plugin.getState()["game.1003"]).toEqual({ active: false, label: "Game 3 · jogado há 3 dias" });
  });

  test("a manifest whose appid disagrees with its file name, or that is garbage, is ignored", async () => {
    const m = machine({ apps: [game(550, "Left 4 Dead 2", 1)] });
    write(path.join(m.steam, "steamapps", "appmanifest_777.acf"), acf({ appid: 778, name: "Liar", lastPlayed: SEC0 }));
    write(path.join(m.steam, "steamapps", "appmanifest_888.acf"), "\u0000garbage");
    write(path.join(m.steam, "steamapps", "appmanifest_abc.acf"), acf({ appid: 9, name: "Nope", lastPlayed: SEC0 }));
    await m.load();
    expect(plugin.getActions().map((a) => a.id)).toEqual(["game.550"]);
  });

  test("playing another game reorders the list and tells the host once", async () => {
    const m = machine({ apps: [game(1, "A", 1), game(2, "B", 2)] });
    await m.load();
    const before = m.actionsChanges;
    await m.tick();
    expect(m.actionsChanges).toBe(before);
    m.setApp(game(2, "B", 0));
    await m.tick();
    expect(plugin.getActions().map((a) => a.id)).toEqual(["game.2", "game.1"]);
    expect(m.actionsChanges).toBe(before + 1);
  });

  test("speaks the app language: English and Spanish too, numbers formatted for it", () => {
    const f = (sec) => plugin._internals.fmtPlayedAgo(SEC0 - sec, T0);
    try {
      plugin.onLocaleChanged("en-US");
      expect(f(5 * 60)).toBe("played 5 min ago");
      expect(f(3 * DAY)).toBe("played 3 days ago");
      expect(plugin._internals.fmtBytes(4.25 * 1024 ** 3)).toBe("4.3 GB");
      plugin.onLocaleChanged("es-ES");
      expect(f(30 * 3600)).toBe("jugado ayer");
      expect(plugin._internals.fmtBytes(4.25 * 1024 ** 3)).toBe("4,3 GB");
    } finally {
      plugin.onLocaleChanged("pt-BR");
    }
  });

  test("played-ago wording", () => {
    const f = (sec) => plugin._internals.fmtPlayedAgo(SEC0 - sec, T0);
    expect(f(20)).toBe("jogado agora há pouco");
    expect(f(5 * 60)).toBe("jogado há 5 min");
    expect(f(3 * 3600)).toBe("jogado há 3 h");
    expect(f(30 * 3600)).toBe("jogado ontem");
    expect(f(3 * DAY)).toBe("jogado há 3 dias");
    expect(f(90 * DAY)).toBe("jogado há 3 meses");
    expect(f(800 * DAY)).toBe("jogado há 2 anos");
  });
});

describe("cover art selection", () => {
  const pick = (m, appid) => {
    const hit = lib.createLibrary({ platform: "win32", fs, regQuery: async () => "" }).pickLocalArt(m.steam, String(appid));
    return hit ? path.relative(path.join(m.steam, "appcache", "librarycache"), hit.file).replace(/\\/g, "/") : null;
  };

  test("flat layout: the vertical capsule wins over the header; logo and hero are never used", () => {
    const m = machine({ apps: [{ appid: 550, name: "L", lastPlayed: 1, art: { "header.jpg": JPEG, "library_600x900.jpg": JPEG, "logo.png": JPEG, "library_hero.jpg": JPEG } }] });
    expect(pick(m, 550)).toBe("550/library_600x900.jpg");
  });

  test("hashed subfolders (newer clients): library_capsule.jpg found one and two levels down", () => {
    const m = machine({ apps: [
      { appid: 1203620, name: "E", lastPlayed: 1, art: { "0f64/library_capsule.jpg": JPEG, "7463/library_header.jpg": JPEG, "5dbe/logo.png": JPEG } },
      { appid: 9, name: "N", lastPlayed: 1, art: { "aa/bb/library_capsule.jpg": JPEG } },
    ] });
    expect(pick(m, 1203620)).toBe("1203620/0f64/library_capsule.jpg");
    expect(pick(m, 9)).toBe("9/aa/bb/library_capsule.jpg");
  });

  test("order of preference: 600x900, capsule, header, library_header", () => {
    const m = machine({ apps: [
      { appid: 1, name: "a", lastPlayed: 1, art: { "x/library_capsule.jpg": JPEG, "header.jpg": JPEG } },
      { appid: 2, name: "b", lastPlayed: 1, art: { "x/library_header.jpg": JPEG, "header.jpg": JPEG } },
      { appid: 3, name: "c", lastPlayed: 1, art: { "x/library_header.jpg": JPEG } },
      { appid: 4, name: "d", lastPlayed: 1, art: { "logo.png": JPEG, "library_hero.jpg": JPEG, "abc.jpg": JPEG } },
    ] });
    expect(pick(m, 1)).toBe("1/x/library_capsule.jpg");
    expect(pick(m, 2)).toBe("2/header.jpg");
    expect(pick(m, 3)).toBe("3/x/library_header.jpg");
    expect(pick(m, 4)).toBeNull();
  });

  test("three levels down is out of reach; empty files are ignored; old <appid>_name files work", () => {
    const m = machine({ apps: [
      { appid: 1, name: "a", lastPlayed: 1, art: { "a/b/c/library_600x900.jpg": JPEG } },
      { appid: 2, name: "b", lastPlayed: 1, art: { "library_600x900.jpg": Buffer.alloc(0), "header.jpg": JPEG } },
    ] });
    write(path.join(m.steam, "appcache", "librarycache", "3_library_600x900.jpg"), JPEG);
    expect(pick(m, 1)).toBeNull();
    expect(pick(m, 2)).toBe("2/header.jpg");
    expect(pick(m, 3)).toBe("3_library_600x900.jpg");
    expect(pick(m, "../550")).toBeNull();
  });

  test("the same name in two hashed folders: the newest file is used", () => {
    const m = machine({ apps: [{ appid: 5, name: "a", lastPlayed: 1, art: { "old/library_capsule.jpg": JPEG, "new/library_capsule.jpg": JPEG } }] });
    const root = path.join(m.steam, "appcache", "librarycache", "5");
    fs.utimesSync(path.join(root, "old", "library_capsule.jpg"), new Date(T0 - 5000_000), new Date(T0 - 5000_000));
    fs.utimesSync(path.join(root, "new", "library_capsule.jpg"), new Date(T0), new Date(T0));
    expect(pick(m, 5)).toBe("5/new/library_capsule.jpg");
  });
});

describe("thumbnails (image contract)", () => {
  test("each game action carries what host.makeThumbnail returned for its best art, at 96 px", async () => {
    const m = machine({ apps: [game(550, "Left 4 Dead 2", 1), { appid: 9, name: "Nine", lastPlayed: SEC0 - 5 * DAY, art: { "h/library_header.jpg": JPEG } }] });
    await m.load();
    const acts = plugin.getActions();
    expect(Buffer.from(acts[0].image.split(",")[1], "base64").toString()).toBe("thumb:library_600x900.jpg");
    expect(Buffer.from(acts[1].image.split(",")[1], "base64").toString()).toBe("thumb:library_header.jpg");
    expect(m.thumbCalls.map((c) => c[1])).toEqual([{ size: 96 }, { size: 96 }]);
    for (const c of m.thumbCalls) expect(path.isAbsolute(c[0])).toBe(true);
    expect(plugin.__test.recent().map((g) => g.art)).toEqual(["library_600x900.jpg", "library_header.jpg"]);
  });

  test("thumbnails are rebuilt only when the art file changes", async () => {
    const m = machine({ apps: [game(550, "Left 4 Dead 2", 1)] });
    await m.load();
    await m.tick();
    await m.tick();
    expect(m.thumbCalls.length).toBe(1);
    const file = path.join(m.steam, "appcache", "librarycache", "550", "library_600x900.jpg");
    fs.utimesSync(file, new Date(T0 + 60_000), new Date(T0 + 60_000));
    await m.tick();
    expect(m.thumbCalls.length).toBe(2);
  });

  test("host without makeThumbnail → actions without image (Steam mark only)", async () => {
    const m = machine({ apps: [game(550, "Left 4 Dead 2", 1)], host: { makeThumbnail: undefined } });
    await m.load();
    const [a] = plugin.getActions();
    expect(a).toEqual({ id: "game.550", name: "Left 4 Dead 2", icon: manifest.actions[0].icon, stateful: true, description: "Inicia Left 4 Dead 2 pelo Steam." });
    expect("image" in a).toBe(false);
  });

  test.each([
    ["null", async () => null],
    ["a rejection", async () => { throw new Error("boom"); }],
    ["a file path instead of a data URI", async (f) => f],
    ["an svg data URI", async () => "data:image/svg+xml;base64,PHN2Zy8+"],
    ["an oversized image", async () => `data:image/webp;base64,${Buffer.alloc(49 * 1024, 1).toString("base64")}`],
    ["a non-string", async () => ({ uri: "x" })],
  ])("makeThumbnail answering %s → action without image", async (_n, fn) => {
    const m = machine({ apps: [game(550, "Left 4 Dead 2", 1)], host: { makeThumbnail: fn } });
    await m.load();
    const [a] = plugin.getActions();
    expect(a.id).toBe("game.550");
    expect(a.image).toBeUndefined();
    expect(a.icon).toBe(manifest.actions[0].icon);
  });

  test("a failed thumbnail is not retried on every scan, only after a while", async () => {
    let calls = 0;
    const m = machine({ apps: [game(550, "L", 1)], host: { makeThumbnail: async () => { calls++; return null; } } });
    await m.load();
    await m.tick();
    expect(calls).toBe(1);
    m.t += 11 * 60_000;
    await m.tick();
    expect(calls).toBe(2);
  });

  test("the plugin never reads image files itself: 16-image / 400 KB budget cannot be exceeded", async () => {
    const apps = [];
    for (let i = 1; i <= 12; i++) apps.push(game(100 + i, `G${i}`, i));
    const big = `data:image/webp;base64,${Buffer.alloc(47 * 1024, 1).toString("base64")}`;
    const m = machine({ apps, host: { makeThumbnail: async () => big } });
    await m.load();
    const imgs = plugin.getActions().filter((a) => a.image);
    expect(imgs.length).toBe(8);
    expect(imgs.reduce((n, a) => n + Buffer.from(a.image.split(",")[1], "base64").length, 0)).toBeLessThanOrEqual(400 * 1024);
  });
});

describe("CDN fallback", () => {
  const noArt = (appid, name, daysAgo) => ({ appid, name, lastPlayed: SEC0 - daysAgo * DAY });

  test("no local art → library_600x900.jpg from the public CDN, cached, then thumbnailed", async () => {
    const m = machine({ apps: [noArt(550, "Left 4 Dead 2", 1)] });
    m.httpAnswer = () => JPEG;
    await m.load();
    expect(m.http).toEqual([["https://cdn.cloudflare.steamstatic.com/steam/apps/550/library_600x900.jpg", { timeoutMs: 8000, maxBytes: 2 * 1024 * 1024 }]]);
    const cachedFile = path.join(m.dataDir, "550_library_600x900.jpg");
    expect(fs.readFileSync(cachedFile).equals(JPEG)).toBe(true);
    expect(m.thumbCalls).toEqual([[cachedFile, { size: 96 }]]);
    expect(plugin.getActions()[0].image).toMatch(/^data:image\/webp;base64,/);
    expect(plugin.__test.recent()[0].art).toBe("cdn:library_600x900.jpg");
    expect(fs.readdirSync(m.dataDir).sort()).toEqual(["550_library_600x900.jpg", "cdn.json"]);
  });

  test("capsule missing on the CDN → header.jpg", async () => {
    const m = machine({ apps: [noArt(550, "L", 1)] });
    m.httpAnswer = (url) => (url.endsWith("/header.jpg") ? JPEG : null);
    await m.load();
    expect(m.http.map((h) => h[0])).toEqual([
      "https://cdn.cloudflare.steamstatic.com/steam/apps/550/library_600x900.jpg",
      "https://cdn.cloudflare.steamstatic.com/steam/apps/550/header.jpg",
    ]);
    expect(fs.existsSync(path.join(m.dataDir, "550_header.jpg"))).toBe(true);
    expect(plugin.getActions()[0].image).toBeDefined();
  });

  test("at most once a day per app, failure included; the cached file is reused without the network", async () => {
    const m = machine({ apps: [noArt(550, "L", 1)] });
    await m.load();
    expect(m.http.length).toBe(2);
    expect(plugin.getActions()[0].image).toBeUndefined();
    m.t += 23 * 3600_000;
    await m.tick();
    plugin.__test.configure(m.deps);
    await plugin.onLoad(m.host);
    await flush();
    expect(m.http.length).toBe(2);

    m.t += 2 * 3600_000;
    m.httpAnswer = () => JPEG;
    await m.tick();
    expect(m.http.length).toBe(3);
    expect(plugin.getActions()[0].image).toBeDefined();

    m.t += 40 * 24 * 3600_000;
    plugin.__test.configure(m.deps);
    await plugin.onLoad(m.host);
    await flush();
    expect(m.http.length).toBe(3);
    expect(plugin.getActions()[0].image).toBeDefined();
  });

  test.each([
    ["not a JPEG", Buffer.from("<html>404 not found</html>".repeat(10))],
    ["bigger than 2 MB", Buffer.concat([JPEG, Buffer.alloc(2 * 1024 * 1024)])],
    ["too small to be an image", Buffer.from([0xff, 0xd8, 0xff])],
    ["not a buffer", "ÿØÿ plain string"],
  ])("a response that is %s is not cached", async (_n, body) => {
    const m = machine({ apps: [noArt(550, "L", 1)] });
    m.httpAnswer = () => body;
    await m.load();
    expect(fs.readdirSync(m.dataDir)).toEqual(["cdn.json"]);
    expect(plugin.getActions()[0].image).toBeUndefined();
  });

  test("a download that throws or hangs past the first scan does not break the action list", async () => {
    const m = machine({ apps: [noArt(550, "L", 1), game(551, "M", 2)] });
    let release;
    m.deps.httpGet = (url) => { m.http.push([url]); return new Promise((r) => { release = r; }); };
    await m.load();
    expect(plugin.getActions().map((a) => [a.id, !!a.image])).toEqual([["game.550", false], ["game.551", true]]);
    const before = m.actionsChanges;
    release(JPEG);
    await flush();
    expect(plugin.getActions()[0].image).toBeDefined();
    expect(m.actionsChanges).toBe(before + 1);
  });

  test("never more than two downloads at a time", async () => {
    const apps = [];
    for (let i = 1; i <= 6; i++) apps.push(noArt(200 + i, `G${i}`, i));
    const m = machine({ apps });
    let active = 0, peak = 0;
    m.deps.httpGet = async (url) => {
      m.http.push([url]);
      active++; peak = Math.max(peak, active);
      await new Promise((r) => setImmediate(r));
      active--;
      return JPEG;
    };
    await m.load();
    for (let i = 0; i < 10; i++) await flush();
    expect(m.http.length).toBe(6);
    expect(peak).toBe(2);
    expect(plugin.getActions().every((a) => a.image)).toBe(true);
  });

  test("only public appids reach the network; URLs are built from digits only", () => {
    expect(art.cdnUrl("550", "header.jpg")).toBe("https://cdn.cloudflare.steamstatic.com/steam/apps/550/header.jpg");
    for (const bad of ["55a", "../550", "550/..", "", "0", "99999999999", 550, null]) expect(art.cdnUrl(bad, "header.jpg")).toBeNull();
    expect(art.cdnUrl("550", "../../x.jpg")).toBeNull();
    expect(art.TIMEOUT_MS).toBeLessThanOrEqual(10_000);
    expect(art.MAX_PARALLEL).toBe(2);
    expect(art.RETRY_MS).toBe(24 * 3600_000);
  });

  test("without a cache dir or an HTTP client nothing is attempted", async () => {
    const m = machine({ apps: [noArt(550, "L", 1)] });
    m.deps.dataDir = null;
    await m.load();
    expect(m.http).toEqual([]);
    expect(fs.existsSync(m.dataDir)).toBe(false);
    expect(plugin.getActions().map((a) => a.id)).toEqual(["game.550"]);
  });
});

describe("actions", () => {
  test("static actions open the documented steam:// links", async () => {
    const m = machine({ apps: [game(550, "L", 1)] });
    await m.load();
    const expected = {
      playing: "steam://open/games", downloads: "steam://open/downloads", library: "steam://open/games",
      store: "steam://store", friends: "steam://open/friends", big_picture: "steam://open/bigpicture",
      status_online: "steam://friends/status/online", status_away: "steam://friends/status/away",
      status_invisible: "steam://friends/status/invisible", status_offline: "steam://friends/status/offline",
    };
    expect(Object.keys(expected).sort()).toEqual(manifest.actions.map((a) => a.id).sort());
    for (const id of Object.keys(expected)) {
      m.opened.length = 0;
      expect(await plugin.onAction(id)).toEqual({ handled: true });
      expect(m.opened).toEqual([expected[id]]);
    }
  });

  test("a game press opens steam://rungameid/<appid> — and the command is rundll32 with the link as ONE argument", async () => {
    const m = machine({ apps: [game(550, "Left 4 Dead 2", 1)] });
    await m.load();
    expect(await plugin.onAction("game.550")).toEqual({ handled: true });
    expect(m.opened).toEqual(["steam://rungameid/550"]);
    const [file, args] = plugin._internals.openerCommand("steam://rungameid/550");
    expect(path.basename(file).toLowerCase()).toBe("rundll32.exe");
    expect(args).toEqual(["url.dll,FileProtocolHandler", "steam://rungameid/550"]);
  });

  test.each([
    "game.551",
    "game.550 & calc.exe",
    "game.550&calc",
    "game.550/../../x",
    "game.-550",
    "game.5.5.0",
    "game.",
    "game.99999999999",
    "game.550\n",
    "GAME.550",
    "rungameid/550",
    "__proto__",
    "constructor",
    "",
  ])("unsafe or unknown action id %j opens nothing", async (id) => {
    const m = machine({ apps: [game(550, "Left 4 Dead 2", 1)] });
    await m.load();
    const r = await plugin.onAction(id);
    expect(r.handled).toBe(false);
    expect(m.opened).toEqual([]);
  });

  test("only links shaped like steam://word/word… pass the last gate", () => {
    const ok = plugin._internals.STEAM_URL;
    for (const u of Object.values(plugin._internals.URLS)) expect(u).toMatch(ok);
    expect("steam://rungameid/550").toMatch(ok);
    for (const bad of ["steam://rungameid/550 -silent", "steam://run/550//-novid/", "steam://rungameid/550&calc", "http://x", "steam://open/games\"", "steam://a/b/c/d/e", "steam://exit\r\n"]) {
      expect(bad).not.toMatch(ok);
    }
  });

  test("a failing opener is reported, not thrown", async () => {
    const m = machine({ apps: [game(550, "L", 1)] });
    m.deps.open = () => { throw new Error("no handler"); };
    await m.load();
    expect(await plugin.onAction("store")).toEqual({ handled: false, reason: "open_failed" });
    expect(m.toasts).toEqual([["Steam", "Não foi possível abrir o Steam."]]);
  });

  test("pressing the game that is already running starts nothing", async () => {
    const m = machine({ apps: [game(550, "Left 4 Dead 2", 1)], running: 550 });
    await m.load();
    expect(await plugin.onAction("game.550")).toEqual({ handled: false, reason: "already_running" });
    expect(m.opened).toEqual([]);
    expect(m.toasts).toEqual([["Steam", "Left 4 Dead 2 já está em execução."]]);
  });
});

describe("running game", () => {
  test("nothing running", async () => {
    const m = machine({ apps: [game(550, "L", 1)] });
    await m.load();
    expect(plugin.getState().playing).toEqual({ active: false, label: "nada em execução" });
  });

  test("a game seen starting: session time counts from then (1h12 after 72 minutes)", async () => {
    const m = machine({ apps: [game(550, "Left 4 Dead 2", 1), game(9, "Other", 2)] });
    await m.load();
    m.running = 550;
    m.t += 15_000;
    await m.tick();
    expect(plugin.getState().playing).toEqual({ active: true, label: "Left 4 Dead 2 · 0 min" });
    expect(plugin.getState()["game.550"]).toEqual({ active: true, label: "em execução · 0 min" });
    expect(plugin.getState()["game.9"].active).toBe(false);
    const changes = m.stateChanges;
    m.t += 72 * 60_000;
    await m.tick();
    expect(plugin.getState().playing).toEqual({ active: true, label: "Left 4 Dead 2 · 1h12" });
    expect(plugin.getState()["game.550"]).toEqual({ active: true, label: "em execução · 1h12" });
    expect(m.stateChanges).toBeGreaterThan(changes);

    m.running = 0;
    await m.tick();
    expect(plugin.getState().playing).toEqual({ active: false, label: "nada em execução" });
    expect(plugin.getState()["game.550"].active).toBe(false);
  });

  test("already running when the plugin loads: no invented time…", async () => {
    const m = machine({ apps: [game(550, "Left 4 Dead 2", 1)], running: 550 });
    await m.load();
    expect(plugin.getState().playing).toEqual({ active: true, label: "Left 4 Dead 2 · em execução" });
    expect(plugin.getState()["game.550"]).toEqual({ active: true, label: "em execução" });
  });

  test("…unless the game's process start time is known (asked once, for its install folder only)", async () => {
    const m = machine({ apps: [game(550, "Left 4 Dead 2", 1, { installdir: "Left 4 Dead 2" })], running: 550 });
    m.processStart = T0 - 3 * 3600_000 - 5 * 60_000;
    await m.load();
    expect(m.processStartCalls).toEqual([path.join(m.steam, "steamapps", "common", "Left 4 Dead 2") + path.sep]);
    expect(plugin.getState().playing).toEqual({ active: true, label: "Left 4 Dead 2 · 3h05" });
    expect(plugin.getState()["game.550"]).toEqual({ active: true, label: "em execução · 3h05" });
    await m.tick(); await m.tick();
    expect(m.processStartCalls.length).toBe(1);
    m.running = 0; await m.tick();
    m.running = 550; await m.tick();
    expect(m.processStartCalls.length).toBe(2);
  });

  test("an absurd process start time (future, or weeks ago) is ignored", async () => {
    const m = machine({ apps: [game(550, "L4D2", 1)] });
    await m.load();
    m.processStart = T0 + 3600_000;
    m.running = 550;
    await m.tick();
    expect(plugin.getState().playing.label).toBe("L4D2 · 0 min");
  });

  test("the running game gets a button even when it was never played before", async () => {
    const apps = [];
    for (let i = 1; i <= 8; i++) apps.push(game(100 + i, `G${i}`, i));
    apps.push({ appid: 999, name: "Brand New", lastPlayed: 0, art: CAPSULE });
    const m = machine({ apps });
    await m.load();
    m.running = 999;
    await m.tick();
    const ids = plugin.getActions().map((a) => a.id);
    expect(ids[0]).toBe("game.999");
    expect(ids.length).toBe(8);
    expect(plugin.getState()["game.999"].active).toBe(true);
  });

  test("a game that is not an installed Steam app (non-Steam shortcut) still shows as running", async () => {
    const m = machine({ apps: [game(550, "L", 1)], running: 2147483649 });
    await m.load();
    expect(plugin.getState().playing).toEqual({ active: true, label: "jogo · em execução" });
  });

  test("a stale RunningAppID of a closed or crashed client is ignored", async () => {
    const m = machine({ apps: [game(550, "L", 1)], running: 550, pid: 0 });
    await m.load();
    expect(plugin.getState().playing.active).toBe(false);
    m.pid = 4242; m.pidAlive = false;
    await m.tick();
    expect(plugin.getState().playing.active).toBe(false);
    m.pidAlive = true;
    await m.tick();
    expect(plugin.getState().playing.active).toBe(true);
  });

  test("polling pace: 15 s while idle, 5 s while a game runs; manifests every 60 s", async () => {
    const m = machine({ apps: [game(550, "L", 1)] });
    await m.load();
    const polls = () => m.regCalls.filter((a) => a[2] === "RunningAppID").length;
    const p0 = polls();
    m.t += 5_000; await plugin.__test.tick(false);
    m.t += 5_000; await plugin.__test.tick(false);
    expect(polls()).toBe(p0);
    m.t += 5_000; await plugin.__test.tick(false);
    expect(polls()).toBe(p0 + 1);
    m.running = 550;
    m.t += 15_000; await plugin.__test.tick(false);
    expect(plugin.getState().playing.active).toBe(true);
    const p1 = polls();
    m.t += 5_000; await plugin.__test.tick(false);
    m.t += 5_000; await plugin.__test.tick(false);
    expect(polls()).toBe(p1 + 2);

    m.running = 0;
    m.t += 5_000; await plugin.__test.tick(false);
    m.t += 5_000; await plugin.__test.tick(false);
    m.setApp(game(777, "New", 0));
    m.t += 30_000; await plugin.__test.tick(false);
    expect(plugin.getActions().map((a) => a.id)).not.toContain("game.777");
    m.t += 31_000; await plugin.__test.tick(false);
    expect(plugin.getActions().map((a) => a.id)).toContain("game.777");
  });
});

describe("downloads", () => {
  test("progress maths", () => {
    const p = (done, total) => lib.downloadProgress({ bytesDownloaded: done, bytesToDownload: total });
    expect(p(0, 0)).toEqual({ percent: null, done: 0, total: 0 });
    expect(p(500, 0)).toEqual({ percent: null, done: 500, total: 0 });
    expect(p(0, 1000)).toEqual({ percent: 0, done: 0, total: 1000 });
    expect(p(429, 1000).percent).toBe(42);
    expect(p(999, 1000).percent).toBe(99);
    expect(p(1000, 1000).percent).toBe(100);
    expect(p(5000, 1000)).toEqual({ percent: 100, done: 1000, total: 1000 });
    expect(lib.downloadProgress(null)).toEqual({ percent: null, done: 0, total: 0 });
  });

  test("nothing downloading", async () => {
    const m = machine({ apps: [game(550, "L", 1)] });
    await m.load();
    expect(plugin.getState().downloads).toEqual({ label: "nada baixando" });
  });

  test("gauge of the app being updated; its own button says 'atualizando 42%'", async () => {
    const GB = 1024 ** 3;
    const m = machine({ apps: [game(550, "Left 4 Dead 2", 1), game(1808500, "ARC Raiders", 2, { flags: 1026, total: 10 * GB, done: Math.round(4.2 * GB) })] });
    await m.load();
    expect(plugin.getState().downloads).toEqual({ value: 42, text: "42%", label: "ARC Raiders · 42% · 4,2 GB de 10,0 GB" });
    expect(plugin.getState()["game.1808500"]).toEqual({ active: false, value: 42, label: "atualizando 42%" });
    expect(plugin.getState()["game.550"].label).toBe("Left 4 Dead 2 · jogado ontem");
  });

  test("unknown total → no value, '…'; finished bytes → 'instalando'; paused says so", async () => {
    const m = machine({ apps: [game(1, "Alpha", 1, { flags: 1026, total: 0, done: 0 })] });
    await m.load();
    expect(plugin.getState().downloads).toEqual({ text: "…", label: "Alpha · preparando download" });
    expect(plugin.getState()["game.1"]).toEqual({ active: false, label: "atualizando" });

    m.setApp(game(1, "Alpha", 1, { flags: 1026, total: 500, done: 500 }));
    await m.tick();
    expect(plugin.getState().downloads).toEqual({ value: 100, text: "100%", label: "Alpha · instalando" });

    m.setApp(game(1, "Alpha", 1, { flags: 1538, total: 1000, done: 250 }));
    await m.tick();
    expect(plugin.getState().downloads).toEqual({ value: 25, text: "25%", label: "Alpha · pausado em 25%" });
    expect(plugin.getState()["game.1"].label).toBe("atualização pausada em 25%");

    m.setApp(game(1, "Alpha", 1, { flags: 4, total: 1000, done: 1000 }));
    await m.tick();
    expect(plugin.getState().downloads).toEqual({ label: "nada baixando" });
  });

  test("an active download wins over a paused one; a merely queued update (flags 2/6) is not a download", async () => {
    const m = machine({ apps: [
      game(1, "Paused", 1, { flags: 1538, total: 100, done: 10 }),
      game(2, "Active", 2, { flags: 1026, total: 100, done: 60 }),
      game(3, "Queued", 3, { flags: 6, total: 100, done: 0 }),
    ] });
    await m.load();
    expect(plugin.getState().downloads.label).toBe("Active · 60% · 0 MB de 0 MB");
    expect(plugin.getState()["game.3"].label).toBe("Queued · jogado há 3 dias");
  });

  test("while a download is active the manifests are re-read every 5 s", async () => {
    const m = machine({ apps: [game(1, "Alpha", 1, { flags: 1026, total: 1000, done: 100 })] });
    await m.load();
    m.setApp(game(1, "Alpha", 1, { flags: 1026, total: 1000, done: 300 }));
    m.t += 5_000;
    await plugin.__test.tick(false);
    expect(plugin.getState().downloads.value).toBe(30);
  });
});

describe("read-only and privacy", () => {
  async function fullRun() {
    const apps = [game(550, "Left 4 Dead 2", 1), { appid: 9, name: "No Art", lastPlayed: SEC0 - 2 * DAY }, game(7, "Updating", 3, { flags: 1026, total: 100, done: 5, lib: 1 })];
    const m = machine({ apps, secondLibrary: true });
    m.httpAnswer = () => JPEG;
    const before = [snapshot(m.steam), snapshot(m.second)];
    const outsideBefore = fs.readdirSync(tmp).sort();
    await m.load();
    m.running = 550;
    m.t += 20_000;
    await m.tick();
    await plugin.onAction("game.9");
    await plugin.onAction("downloads");
    m.t += 90_000;
    await m.tick();
    return { m, before, outsideBefore };
  }

  test("the Steam folder and the libraries are never written to; files appear only in the cache dir", async () => {
    const { m, before, outsideBefore } = await fullRun();
    expect(snapshot(m.steam)).toEqual(before[0]);
    expect(snapshot(m.second)).toEqual(before[1]);
    expect(fs.readdirSync(tmp).sort()).toEqual([...outsideBefore, "plugin-data"].sort());
    expect(fs.readdirSync(path.join(tmp, "plugin-data"))).toEqual(["steam"]);
    expect(fs.readdirSync(m.dataDir).sort()).toEqual(["9_library_600x900.jpg", "cdn.json"]);
  });

  test("only SteamPath, RunningAppID and ActiveProcess\\pid are ever queried, one value at a time", async () => {
    const { m } = await fullRun();
    expect(m.regCalls.length).toBeGreaterThan(3);
    for (const args of m.regCalls) {
      expect(args.length).toBe(3);
      expect(args[1]).toBe("/v");
      expect([`${lib.STEAM_KEY}|SteamPath`, `${lib.STEAM_KEY}|RunningAppID`, `${lib.PROCESS_KEY}|pid`]).toContain(`${args[0]}|${args[2]}`);
    }
  });

  test("localconfig.vdf, loginusers.vdf and userdata are never opened", async () => {
    const touched = [];
    const spies = ["readFileSync", "statSync", "readdirSync", "openSync", "existsSync"].map((fn) => {
      const real = fs[fn];
      return jest.spyOn(fs, fn).mockImplementation((...a) => { touched.push(String(a[0])); return real.apply(fs, a); });
    });
    try {
      await fullRun();
    } finally {
      for (const s of spies) s.mockRestore();
    }
    const steamTouched = touched.filter((f) => f.includes(`${path.sep}Steam${path.sep}`));
    expect(steamTouched.length).toBeGreaterThan(5);
    for (const f of steamTouched) expect(f).not.toMatch(/userdata|localconfig|loginusers|ssfn|\.crash/i);
  });

  test("nothing account-identifying reaches state, action names, logs, toasts, the network or the cache", async () => {
    const out = [];
    const spies = ["log", "warn", "error", "info"].map((fn) => jest.spyOn(console, fn).mockImplementation((...a) => { out.push(a.join(" ")); }));
    let m;
    try {
      ({ m } = await fullRun());
      plugin.onUnload();
    } finally {
      for (const s of spies) s.mockRestore();
    }
    const cache = fs.readdirSync(m.dataDir).map((f) => f + fs.readFileSync(path.join(m.dataDir, f)).toString("latin1")).join("\n");
    const everything = [
      JSON.stringify(plugin.getState()), JSON.stringify(plugin.getActions()), JSON.stringify(plugin.__test.recent()),
      out.join("\n"), m.logs.join("\n"), JSON.stringify(m.toasts), JSON.stringify(m.http), JSON.stringify(m.opened),
      JSON.stringify(m.thumbCalls), JSON.stringify(m.processStartCalls), cache,
    ].join("\n");
    expect(m.logs.length).toBeGreaterThan(0);
    for (const secret of [CANARY_USER, CANARY_ACCOUNT, "123456", "7656119", "PersonaName", "ActiveUser"]) expect(everything).not.toContain(secret);
    for (const [url] of m.http) expect(url).toMatch(/^https:\/\/cdn\.cloudflare\.steamstatic\.com\/steam\/apps\/[0-9]+\/(library_600x900|header)\.jpg$/);
  });
});

describe("lifecycle", () => {
  test("getState()/getActions() answer from memory: no registry, disk or host work", async () => {
    const m = machine({ apps: [game(550, "L", 1)] });
    await m.load();
    const reg = m.regCalls.length, thumbs = m.thumbCalls.length;
    const spy = jest.spyOn(fs, "readFileSync");
    for (let i = 0; i < 20; i++) { plugin.getState(); plugin.getActions(); }
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    expect(m.regCalls.length).toBe(reg);
    expect(m.thumbCalls.length).toBe(thumbs);
  });

  test("onLoad does not wait forever for a slow registry", async () => {
    const m = machine({ apps: [game(550, "L", 1)] });
    m.deps.regQuery = () => new Promise(() => {});
    m.deps.loadWaitMs = 20;
    plugin.__test.configure(m.deps);
    await plugin.onLoad(m.host);
    expect(plugin.getState().playing).toEqual({ text: "–", label: "verificando o Steam…" });
    expect(plugin.getActions()).toEqual([]);
  });

  test("results arriving after onUnload are dropped and the host is not called again", async () => {
    const m = machine({ apps: [{ appid: 550, name: "L", lastPlayed: SEC0 - DAY }] });
    let release;
    m.deps.httpGet = () => new Promise((r) => { release = r; });
    await m.load();
    plugin.onUnload();
    const a = m.actionsChanges, s = m.stateChanges;
    release(JPEG);
    await flush();
    expect(m.actionsChanges).toBe(a);
    expect(m.stateChanges).toBe(s);
  });

  test("a real timer is started on load and cleared on unload", async () => {
    const m = machine({ apps: [game(550, "L", 1)] });
    delete m.deps.noTimer;
    const set = jest.spyOn(global, "setInterval");
    const clear = jest.spyOn(global, "clearInterval");
    plugin.__test.configure(m.deps);
    await plugin.onLoad(m.host);
    expect(set).toHaveBeenCalledTimes(1);
    plugin.onUnload();
    expect(clear).toHaveBeenCalledWith(set.mock.results[0].value);
    set.mockRestore(); clear.mockRestore();
  });

  test("works with a host that has nothing but stateChanged, and with no host at all", async () => {
    const m = machine({ apps: [game(550, "L", 1)] });
    plugin.__test.configure(m.deps);
    await plugin.onLoad({ stateChanged() {} });
    expect(plugin.getActions().map((a) => a.id)).toEqual(["game.550"]);
    plugin.onUnload();
    plugin.__test.configure(m.deps);
    await plugin.onLoad();
    expect(plugin.getActions().map((a) => a.id)).toEqual(["game.550"]);
  });
});

describe("manifest", () => {
  test("identity and action ids", () => {
    expect(manifest.id).toBe("com.orbitring.steam");
    expect(manifest.name).toBe("Steam");
    expect(manifest.main).toBe("index.js");
    expect(manifest.actions.map((a) => a.id)).toEqual([
      "playing", "downloads", "library", "store", "friends", "big_picture",
      "status_online", "status_away", "status_invisible", "status_offline",
    ]);
    for (const a of manifest.actions) {
      expect(a.name.startsWith("Steam · ")).toBe(true);
      expect(a.stateful).toBe(true);
      expect(a.image).toBeUndefined();
    }
  });

  test("the Steam mark is the Simple Icons 16.35.0 path, verbatim, as a filled currentColor path", () => {
    const mark = manifest.actions.find((a) => a.id === "playing").icon;
    const m = /^<path fill='currentColor' stroke='none' d='([^']+)'\/>$/.exec(mark);
    expect(m).not.toBeNull();
    expect(crypto.createHash("sha256").update(m[1]).digest("hex")).toBe("b6bfcb5b506049a25eaa7603d37298b1bd63d70cd61ae4e9d79b33aee5097fb4");
    expect(manifest.actions.find((a) => a.id === "downloads").icon).toBe(mark);
    expect(manifest.actions.find((a) => a.id === "downloads").keepIcon).toBe(true);
    expect(plugin._internals.MARK).toBe(mark);
  });

  test("dynamic ids never collide with manifest ids and stay within the loader's cap", async () => {
    const apps = [];
    for (let i = 1; i <= 30; i++) apps.push(game(i, `G${i}`, i));
    const m = machine({ apps });
    await m.load();
    const ids = plugin.getActions().map((a) => a.id);
    expect(ids.length).toBeLessThanOrEqual(16);
    for (const id of ids) expect(manifest.actions.map((a) => a.id)).not.toContain(id);
  });
});
