process.env.ORBIT_PLUGIN_LOCALE = "pt-BR";

const fs = require("fs");
const os = require("os");
const path = require("path");

const { createLocator, parseWslList, shortDistro } = require("../../../plugins/claude-usage/locations.js");

const utf16 = (s) => Buffer.from(s, "utf16le");

let tmp, winHome, wslRoot;

function mkHome(distro, user, files = { ".claude/.credentials.json": "{}" }) {
  const home = user === "root" ? path.join(wslRoot, distro, "root") : path.join(wslRoot, distro, "home", user);
  fs.mkdirSync(path.join(wslRoot, distro, "home"), { recursive: true });
  fs.mkdirSync(home, { recursive: true });
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(home, rel)), { recursive: true });
    fs.writeFileSync(path.join(home, rel), body);
  }
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
    calls.push({ file, args, opts });
    const child = { stdinEnded: false, killed: false, stdin: { end() { child.stdinEnded = true; } }, on() {}, kill() { child.killed = true; } };
    fn.child = child;
    if (Buffer.isBuffer(reply)) setImmediate(() => cb(null, reply, Buffer.alloc(0)));
    else reply(cb);
    return child;
  };
  fn.calls = calls;
  return fn;
}

function locator(execFile, extra = {}) {
  const fsp = spyFsp();
  const loc = createLocator({
    markers: [".claude/.credentials.json", ".claude.json"],
    deps: { platform: "win32", homedir: () => winHome, execFile, fsp, wslRoots: [wslRoot], ...extra },
  });
  return { loc, fsp };
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-loc-test-"));
  winHome = path.join(tmp, "win");
  wslRoot = path.join(tmp, "wslroot");
  fs.mkdirSync(winHome, { recursive: true });
  fs.mkdirSync(wslRoot, { recursive: true });
});

afterEach(() => {
  jest.useRealTimers();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("parseWslList: saída de `wsl.exe -l --running -q`", () => {
  test("UTF-16LE com BOM, CRLF e linhas vazias", () => {
    expect(parseWslList(utf16("﻿Ubuntu-22.04\r\ndocker-desktop\r\n\r\n"))).toEqual(["Ubuntu-22.04", "docker-desktop"]);
  });

  test("UTF-16LE sem BOM e UTF-8 (WSL_UTF8=1)", () => {
    expect(parseWslList(utf16("Debian\r\n"))).toEqual(["Debian"]);
    expect(parseWslList(Buffer.from("Debian\nUbuntu\n", "utf8"))).toEqual(["Debian", "Ubuntu"]);
  });

  test("vazio, nulo e duplicados", () => {
    expect(parseWslList(Buffer.alloc(0))).toEqual([]);
    expect(parseWslList(null)).toEqual([]);
    expect(parseWslList(utf16("Ubuntu\r\nubuntu\r\n"))).toEqual(["Ubuntu"]);
  });

  test("frases de erro localizadas não viram nome de distro", () => {
    expect(parseWslList(utf16("Não há distribuições em execução.\r\n"))).toEqual([]);
    expect(parseWslList(utf16("There are no running distributions.\r\n"))).toEqual([]);
    expect(parseWslList(utf16("..\\evil\r\nC:\\x\r\n"))).toEqual([]);
  });

  test("shortDistro", () => {
    expect(shortDistro("Ubuntu-22.04")).toBe("Ubuntu");
    expect(shortDistro("Debian")).toBe("Debian");
    expect(shortDistro("docker-desktop")).toBe("docker-desktop");
  });
});

describe("createLocator", () => {
  test("Windows + distro em execução: só os homes com dados do Claude; wsl.exe chamado sem stdin e com timeout", async () => {
    const home = mkHome("Ubuntu-22.04", "dev");
    mkHome("Ubuntu-22.04", "visitante", {});
    const exec = fakeExec(utf16("Ubuntu-22.04\r\n"));
    const { loc } = locator(exec);

    const list = await loc.discover();
    expect(list).toEqual([
      { id: "win", kind: "windows", home: winHome, label: "Windows", short: "Windows", stale: false },
      { id: "wsl:Ubuntu-22.04:dev", kind: "wsl", home, distro: "Ubuntu-22.04", user: "dev", label: "WSL · Ubuntu", short: "WSL", stale: false },
    ]);
    expect(exec.calls).toHaveLength(1);
    expect(exec.calls[0].file).toBe("wsl.exe");
    expect(exec.calls[0].args).toEqual(["-l", "--running", "-q"]);
    expect(exec.calls[0].opts.timeout).toBeLessThanOrEqual(3000);
    expect(exec.calls[0].opts.windowsHide).toBe(true);
    expect(exec.child.stdinEnded).toBe(true);
  });

  test("distro PARADA nunca é acessada, mesmo existindo no compartilhamento", async () => {
    mkHome("Ubuntu-22.04", "dev");
    mkHome("Parada", "dev");
    const { loc, fsp } = locator(fakeExec(utf16("Ubuntu-22.04\r\n")));

    const list = await loc.discover();
    expect(list.map((l) => l.id)).toEqual(["win", "wsl:Ubuntu-22.04:dev"]);
    expect(fsp.seen.length).toBeGreaterThan(0);
    expect(fsp.seen.filter((p) => p.includes("Parada"))).toEqual([]);
  });

  test("nenhuma distro em execução / wsl.exe falha / wsl.exe ausente → só Windows, sem tocar no compartilhamento", async () => {
    mkHome("Ubuntu-22.04", "dev");
    const cases = [
      fakeExec(Buffer.alloc(0)),
      fakeExec((cb) => setImmediate(() => cb(Object.assign(new Error("exit 1"), { code: 1 }), utf16("Ubuntu-22.04\r\n")))),
      () => { throw Object.assign(new Error("spawn wsl.exe ENOENT"), { code: "ENOENT" }); },
    ];
    for (const exec of cases) {
      const { loc, fsp } = locator(exec);
      expect((await loc.discover()).map((l) => l.id)).toEqual(["win"]);
      expect(fsp.seen).toEqual([]);
    }
  });

  test("wsl.exe que nunca responde: a descoberta termina sozinha (timeout) e mata o processo", async () => {
    jest.useFakeTimers();
    const exec = fakeExec(() => {});
    const { loc, fsp } = locator(exec);
    const p = loc.discover();
    await jest.advanceTimersByTimeAsync(4000);
    expect((await p).map((l) => l.id)).toEqual(["win"]);
    expect(exec.child.killed).toBe(true);
    expect(fsp.seen).toEqual([]);
  });

  test("compartilhamento lento (readdir pendurado) não trava: a distro é ignorada", async () => {
    jest.useFakeTimers();
    const fsp = { stat: () => new Promise(() => {}), readdir: () => new Promise(() => {}) };
    const { loc } = locator(fakeExec(utf16("Ubuntu-22.04\r\n")), { fsp });
    const p = loc.discover();
    await jest.advanceTimersByTimeAsync(3000);
    expect((await p).map((l) => l.id)).toEqual(["win"]);
  });

  test("distro que para depois de vista continua na lista como stale e não é mais lida", async () => {
    mkHome("Ubuntu-22.04", "dev");
    let running = utf16("Ubuntu-22.04\r\n");
    let t = 1_000_000;
    const exec = fakeExec((cb) => setImmediate(() => cb(null, running)));
    const { loc, fsp } = locator(exec, { now: () => t });

    expect((await loc.discover()).map((l) => [l.id, l.stale])).toEqual([["win", false], ["wsl:Ubuntu-22.04:dev", false]]);

    running = Buffer.alloc(0);
    fsp.seen.length = 0;
    t += 61_000;
    const after = await loc.discover();
    expect(after.map((l) => [l.id, l.stale])).toEqual([["win", false], ["wsl:Ubuntu-22.04:dev", true]]);
    expect(after[1].label).toBe("WSL · Ubuntu");
    expect(fsp.seen).toEqual([]);

    running = utf16("Ubuntu-22.04\r\n");
    t += 61_000;
    expect((await loc.discover()).map((l) => l.stale)).toEqual([false, false]);
  });

  test("redescobre no máximo a cada ~60 s; forçado, no máximo a cada 5 s", async () => {
    let t = 1_000_000;
    const exec = fakeExec(Buffer.alloc(0));
    const { loc } = locator(exec, { now: () => t });
    await loc.discover();
    t += 30_000;
    await loc.discover();
    expect(exec.calls).toHaveLength(1);
    await loc.discover(true);
    expect(exec.calls).toHaveLength(2);
    t += 1_000;
    await loc.discover(true);
    expect(exec.calls).toHaveLength(2);
    t += 60_000;
    await loc.discover();
    expect(exec.calls).toHaveLength(3);
  });

  test("rótulos: dois usuários na mesma distro, duas distros de mesmo nome curto, e root", async () => {
    mkHome("Ubuntu-22.04", "ana");
    mkHome("Ubuntu-22.04", "root", { ".claude.json": "{}" });
    mkHome("Ubuntu-24.04", "ana");
    mkHome("Debian", "ana");
    const { loc } = locator(fakeExec(utf16("Ubuntu-22.04\r\nUbuntu-24.04\r\nDebian\r\n")));
    const list = await loc.discover();
    expect(list.map((l) => [l.id, l.label, l.short])).toEqual([
      ["win", "Windows", "Windows"],
      ["wsl:Ubuntu-22.04:ana", "WSL · Ubuntu-22.04 (ana)", "WSL Ubuntu-22.04 (ana)"],
      ["wsl:Ubuntu-22.04:root", "WSL · Ubuntu-22.04 (root)", "WSL Ubuntu-22.04 (root)"],
      ["wsl:Ubuntu-24.04:ana", "WSL · Ubuntu-24.04", "WSL Ubuntu-24.04"],
      ["wsl:Debian:ana", "WSL · Debian", "WSL Debian"],
    ]);
  });

  test("fora do Windows: só o home local, sem chamar wsl.exe", async () => {
    const exec = fakeExec(utf16("Ubuntu\r\n"));
    const loc = createLocator({ markers: [".claude.json"], deps: { platform: "linux", homedir: () => winHome, execFile: exec } });
    expect(await loc.discover()).toEqual([{ id: "local", kind: "local", home: winHome, label: "Local", short: "Local", stale: false }]);
    expect(exec.calls).toHaveLength(0);
  });
});
