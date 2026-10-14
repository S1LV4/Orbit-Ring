const fs = require("fs");
const os = require("os");
const path = require("path");
const esbuild = require("esbuild");

let tmp, DeviceManager;

const STUBS = {
  "win32-mouse-hook": `
    const calls = (globalThis.__hookCalls = { start: 0, stop: 0 });
    module.exports = {
      startMouseHook: () => { calls.start++; },
      stopMouseHook: () => { calls.stop++; },
      lockCursor() {}, unlockCursor() {}, moveCursorLock() {},
    };`,
  "node-hid": `module.exports = { devices: () => [] };`,
};

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-device-hook-"));
  for (const [name, code] of Object.entries(STUBS)) fs.writeFileSync(path.join(tmp, `${name}.js`), code);
  const out = path.join(tmp, "device-manager.cjs");
  await esbuild.build({
    entryPoints: [path.join(__dirname, "device-manager.ts")],
    bundle: true, platform: "node", format: "cjs", outfile: out, logLevel: "silent",
    plugins: [{
      name: "stubs",
      setup(build) {
        build.onResolve({ filter: /(^node-hid$|win32-mouse-hook$)/ }, (a) => ({
          path: path.join(tmp, `${a.path.includes("node-hid") ? "node-hid" : "win32-mouse-hook"}.js`),
        }));
      },
    }],
  });
  ({ DeviceManager } = require(out));
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

let platform, saved, logSpy;
beforeEach(() => {
  globalThis.__hookCalls && Object.assign(globalThis.__hookCalls, { start: 0, stop: 0 });
  platform = process.platform;
  Object.defineProperty(process, "platform", { value: "win32" });
  saved = process.env.ORBIT_NO_INPUT_HOOK;
  logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  Object.defineProperty(process, "platform", { value: platform });
  if (saved === undefined) delete process.env.ORBIT_NO_INPUT_HOOK; else process.env.ORBIT_NO_INPUT_HOOK = saved;
  logSpy.mockRestore();
});

test("the app installs the global mouse hook on Windows", () => {
  delete process.env.ORBIT_NO_INPUT_HOOK;
  const dm = new DeviceManager();
  dm.start();
  dm.stop();
  expect(globalThis.__hookCalls.start).toBe(1);
});

test("ORBIT_NO_INPUT_HOOK=1 keeps a service started by tests off the real mouse", () => {
  process.env.ORBIT_NO_INPUT_HOOK = "1";
  const dm = new DeviceManager();
  dm.start();
  dm.stop();
  expect(globalThis.__hookCalls.start).toBe(0);
  expect(logSpy.mock.calls.flat().join(" ")).toMatch(/mouse hook disabled/i);
});
