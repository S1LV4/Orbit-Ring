const fs = require("fs");
const os = require("os");
const path = require("path");

const PLUGINS = path.resolve(__dirname, "../../../plugins");
const COPIES = [
  { plugin: "codex-usage", marker: ".codex" },
  { plugin: "gemini-usage", marker: ".gemini" },
];

const utf16 = (s) => Buffer.from(s, "utf16le");

let tmp, winHome, wslRoot;

function mkHome(distro, user, marker) {
  const home = path.join(wslRoot, distro, "home", user);
  fs.mkdirSync(path.join(home, marker), { recursive: true });
  return home;
}

function spyFsp() {
  const seen = [];
  return {
    seen,
    stat: (p) => { seen.push(String(p)); return fs.promises.stat(p); },
    readdir: (p) => { seen.push(String(p)); return fs.promises.readdir(p); },
  };
}

function fakeExec(reply) {
  const calls = [];
  const fn = (file, args, opts, cb) => {
    const child = { stdinEnded: false, stdin: { end() { child.stdinEnded = true; } }, on() {}, kill() {} };
    calls.push({ file, args, opts, child });
    setImmediate(() => cb(null, reply(), Buffer.alloc(0)));
    return child;
  };
  fn.calls = calls;
  return fn;
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-cg-loc-test-"));
  winHome = path.join(tmp, "win");
  wslRoot = path.join(tmp, "wslroot");
  fs.mkdirSync(winHome, { recursive: true });
  fs.mkdirSync(wslRoot, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("as cópias de locations.js e common.js dos dois plugins são idênticas", () => {
  for (const file of ["locations.js", "common.js"]) {
    const [a, b] = COPIES.map((c) => fs.readFileSync(path.join(PLUGINS, c.plugin, file), "utf8"));
    expect(a === b).toBe(true);
  }
});

describe.each(COPIES)("$plugin/locations.js", ({ plugin, marker }) => {
  const mod = () => require(path.join(PLUGINS, plugin, "locations.js"));

  test("parseWslList: UTF-16LE com BOM / sem BOM / UTF-8, linhas vazias e frases que não são distros", () => {
    const { parseWslList } = mod();
    expect(parseWslList(utf16("﻿Ubuntu-22.04\r\ndocker-desktop\r\n\r\n"))).toEqual(["Ubuntu-22.04", "docker-desktop"]);
    expect(parseWslList(utf16("Debian\r\n"))).toEqual(["Debian"]);
    expect(parseWslList(Buffer.from("Ubuntu\nUbuntu\n"))).toEqual(["Ubuntu"]);
    expect(parseWslList(utf16("Não há distribuições em execução.\r\n"))).toEqual([]);
    expect(parseWslList(null)).toEqual([]);
  });

  test("lista só as distros em execução, sem stdin, escondido e com timeout ≤ 3 s; nada roda dentro da distro", async () => {
    mkHome("Ubuntu-22.04", "devuser", marker);
    const exec = fakeExec(() => utf16("Ubuntu-22.04\r\n"));
    const fsp = spyFsp();
    const loc = mod().createLocator({ markers: [marker], deps: { platform: "win32", homedir: () => winHome, execFile: exec, fsp, wslRoots: [wslRoot] } });
    const found = await loc.discover();

    expect(found.map((l) => [l.id, l.kind, l.label, l.short, l.stale])).toEqual([
      ["win", "windows", "Windows", "Windows", false],
      ["wsl:Ubuntu-22.04:devuser", "wsl", "WSL · Ubuntu", "WSL", false],
    ]);
    expect(found[1].home).toBe(path.join(wslRoot, "Ubuntu-22.04", "home", "devuser"));

    expect(exec.calls).toHaveLength(1);
    const call = exec.calls[0];
    expect(call.file).toBe("wsl.exe");
    expect(call.args).toEqual(["-l", "--running", "-q"]);
    expect(call.opts.timeout).toBeLessThanOrEqual(3000);
    expect(call.opts.windowsHide).toBe(true);
    expect(call.child.stdinEnded).toBe(true);
  });

  test("uma distro PARADA nunca é acessada — nem para ver se tem a pasta da ferramenta", async () => {
    mkHome("Ubuntu-22.04", "devuser", marker);
    mkHome("Stopped-Distro", "someone", marker);
    const exec = fakeExec(() => utf16("Ubuntu-22.04\r\n"));
    const fsp = spyFsp();
    const loc = mod().createLocator({ markers: [marker], deps: { platform: "win32", homedir: () => winHome, execFile: exec, fsp, wslRoots: [wslRoot] } });
    const found = await loc.discover();

    expect(found.map((l) => l.id)).toEqual(["win", "wsl:Ubuntu-22.04:devuser"]);
    expect(fsp.seen.length).toBeGreaterThan(0);
    expect(fsp.seen.filter((p) => p.includes("Stopped-Distro"))).toEqual([]);
    expect(fsp.seen.filter((p) => path.resolve(p) === path.resolve(wslRoot))).toEqual([]);
  });

  test("home sem a pasta da ferramenta não vira local", async () => {
    mkHome("Ubuntu-22.04", "devuser", marker);
    fs.mkdirSync(path.join(wslRoot, "Ubuntu-22.04", "home", "other"), { recursive: true });
    const exec = fakeExec(() => utf16("Ubuntu-22.04\r\n"));
    const loc = mod().createLocator({ markers: [marker], deps: { platform: "win32", homedir: () => winHome, execFile: exec, fsp: spyFsp(), wslRoots: [wslRoot] } });
    expect((await loc.discover()).map((l) => l.id)).toEqual(["win", "wsl:Ubuntu-22.04:devuser"]);
  });

  test("distro que para depois de vista: o local fica, marcado stale, e deixa de ser lido", async () => {
    mkHome("Ubuntu-22.04", "devuser", marker);
    let running = "Ubuntu-22.04\r\n";
    let clock = 1_000_000;
    const exec = fakeExec(() => utf16(running));
    const fsp = spyFsp();
    const loc = mod().createLocator({
      markers: [marker],
      deps: { platform: "win32", homedir: () => winHome, execFile: exec, fsp, wslRoots: [wslRoot], now: () => clock },
    });
    expect((await loc.discover()).map((l) => l.stale)).toEqual([false, false]);

    running = "";
    clock += 120_000;
    fsp.seen.length = 0;
    const after = await loc.discover();
    expect(after.map((l) => [l.id, l.stale])).toEqual([["win", false], ["wsl:Ubuntu-22.04:devuser", true]]);
    expect(fsp.seen.filter((p) => p.includes("Ubuntu-22.04"))).toEqual([]);
  });

  test("wsl.exe que falha ou não existe → só o Windows, sem erro", async () => {
    const failing = (file, args, opts, cb) => { setImmediate(() => cb(new Error("ENOENT"))); return { stdin: { end() {} }, on() {}, kill() {} }; };
    const loc = mod().createLocator({ markers: [marker], deps: { platform: "win32", homedir: () => winHome, execFile: failing, fsp: spyFsp(), wslRoots: [wslRoot] } });
    expect((await loc.discover()).map((l) => l.id)).toEqual(["win"]);
  });
});
