const fs = require("fs");
const os = require("os");
const path = require("path");
const esbuild = require("esbuild");

const WM_MOUSEMOVE = 0x0200;
const WM_XBUTTONDOWN = 0x020b;
const WM_XBUTTONUP = 0x020c;
const XBUTTON2 = 2 << 16;

const PROC_STUB = `
  const calls = (globalThis.__win32 = { cursor: [], next: 0 });
  module.exports = {
    readHookInfo: (l) => globalThis.__infos[l],
    callNextHook: () => { calls.next++; return 0; },
    setCursorPos: (x, y) => { calls.cursor.push([x, y]); },
  };`;

const timedWindowsStub = (report, quit) => `
  const fs = require("fs");
  const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  let proc = null, events = [], next = 0, written = false;
  function schedule() {
    const t0 = Date.now();
    const at = (ms, w, info) => events.push({ due: t0 + ms, w, info: { x: 0, y: 0, mouseData: 0, flags: 0, time: ms, ...info } });
    at(20, ${WM_XBUTTONDOWN}, { mouseData: ${XBUTTON2} });
    for (let ms = 40; ms < 800; ms += 2) at(ms, ${WM_MOUSEMOVE}, { x: ms });
    at(820, ${WM_XBUTTONUP}, { mouseData: ${XBUTTON2} });
  }
  function deliver(e) { e.delay = Date.now() - e.due; e.result = proc(0, e.w, events.indexOf(e) + 1); }
  function finish() {
    if (next < events.length || written) return;
    written = true;
    fs.writeFileSync(${JSON.stringify(report)}, JSON.stringify(events.map(({ due, delay, result }) => ({ due, delay, result }))));
  }
  module.exports = {
    installMouseHook: (p) => { proc = p; schedule(); return 1; },
    removeMouseHook: () => { fs.writeFileSync(${JSON.stringify(quit)} + ".removed", ""); },
    callNextHook: () => 0,
    readHookInfo: (l) => events[l - 1].info,
    waitMessage: () => {
      if (fs.existsSync(${JSON.stringify(quit)})) return false;
      if (next >= events.length) { finish(); return false; }
      const wait = events[next].due - Date.now();
      if (wait > 0) sleep(wait);
      deliver(events[next++]);
      return true;
    },
    currentThreadId: () => 4242,
    postQuit: (id) => { (globalThis.__quit = globalThis.__quit || []).push(id); fs.writeFileSync(${JSON.stringify(quit)}, ""); },
    setCursorPos: () => {},
  };`;

let tmp;
beforeAll(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-mouse-hook-")); });
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));

async function bundle(entries, stubCode, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const stub = path.join(dir, "win32-user32-stub.js");
  fs.writeFileSync(stub, stubCode);
  await esbuild.build({
    entryPoints: entries.map((e) => path.join(__dirname, e)).filter((e) => fs.existsSync(e)),
    bundle: true, platform: "node", format: "cjs", outdir: dir, logLevel: "silent",
    plugins: [{
      name: "fake-windows",
      setup(build) { build.onResolve({ filter: /win32-user32$/ }, () => ({ path: stub })); },
    }],
  });
  return dir;
}

const until = async (fn, ms = 5000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return; await new Promise((r) => setTimeout(r, 10)); }
  throw new Error("timed out");
};

describe("hook procedure", () => {
  let createMouseHookProc;
  beforeAll(async () => {
    const dir = await bundle(["mouse-hook-proc.ts"], PROC_STUB, path.join(tmp, "proc"));
    ({ createMouseHookProc } = require(path.join(dir, "mouse-hook-proc.js")));
  });

  let out, hook;
  beforeEach(() => {
    globalThis.__win32 && Object.assign(globalThis.__win32, { cursor: [], next: 0 });
    out = [];
    hook = createMouseHookProc((o) => out.push(o));
  });
  const send = (w, info) => {
    globalThis.__infos = { 1: { x: 10, y: 20, mouseData: 0, flags: 0, time: 7, ...info } };
    return hook(0, w, 1);
  };

  test("side2 is reported and swallowed so the app under the cursor never sees it", () => {
    expect(send(WM_XBUTTONDOWN, { mouseData: XBUTTON2 })).toBe(1);
    expect(out).toEqual([{ kind: "button", event: { button: "side2", action: "press", x: 10, y: 20, timestamp: 7 } }]);
    expect(globalThis.__win32.next).toBe(0);
  });

  test("side1 is reported and passed on", () => {
    send(WM_XBUTTONUP, { mouseData: 1 << 16 });
    expect(out[0].event).toMatchObject({ button: "side1", action: "release" });
    expect(globalThis.__win32.next).toBe(1);
  });

  test("a move always passes straight through: the cursor is never held or moved by the hook", () => {
    globalThis.__infos = {};
    expect(hook(0, WM_MOUSEMOVE, 1)).toBe(0);
    expect(out).toEqual([]);
    expect(globalThis.__win32.cursor).toEqual([]);
    expect(globalThis.__win32.next).toBe(1);
  });
});

describe("hook thread", () => {
  let hook, report;
  beforeAll(async () => {
    report = path.join(tmp, "thread", "report.json");
    const dir = await bundle(["win32-mouse-hook.ts", "mouse-hook-worker.ts"], timedWindowsStub(report, path.join(tmp, "thread", "quit")), path.join(tmp, "thread"));
    hook = require(path.join(dir, "win32-mouse-hook.js"));
  });

  let spies;
  beforeEach(() => { spies = ["log", "warn", "error"].map((m) => jest.spyOn(console, m).mockImplementation(() => {})); });
  afterEach(() => spies.forEach((s) => s.mockRestore()));

  test("Windows gets an answer for every mouse event even while the service's main thread is busy", async () => {
    const buttons = [];
    hook.startMouseHook((e) => buttons.push(`${e.button}:${e.action}`));
    await until(() => buttons.length > 0);

    const blockStart = Date.now();
    while (Date.now() - blockStart < 300) {}
    const blockEnd = Date.now();

    await until(() => fs.existsSync(report));
    await until(() => buttons.length === 2);
    hook.stopMouseHook();

    const events = JSON.parse(fs.readFileSync(report, "utf8"));
    const duringBlock = events.filter((e) => e.due >= blockStart && e.due < blockEnd - 30);
    expect(duringBlock.length).toBeGreaterThan(50);
    expect(Math.max(...duringBlock.map((e) => e.delay))).toBeLessThan(30);
    expect(buttons).toEqual(["side2:press", "side2:release"]);
    expect(events[0].result).toBe(1);
  });

  test("stopping the hook makes its thread quit and remove the hook", async () => {
    globalThis.__quit = [];
    const quit = path.join(tmp, "thread", "quit");
    for (const f of [quit, quit + ".removed"]) fs.rmSync(f, { force: true });
    hook.startMouseHook(() => {});
    await until(() => spies[0].mock.calls.flat().join(" ").includes("hook installed"));
    hook.stopMouseHook();
    expect(globalThis.__quit).toEqual([4242]);
    await until(() => fs.existsSync(quit + ".removed"));
  });
});
