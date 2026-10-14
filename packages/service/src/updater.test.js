const fs = require("fs");
const os = require("os");
const path = require("path");
const { EventEmitter } = require("events");
const esbuild = require("esbuild");

let tmp, startUpdater;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-updater-"));
  const out = path.join(tmp, "updater.cjs");
  esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, "..", "..", "ring", "src", "updater.ts")],
    bundle: true, platform: "node", format: "cjs", outfile: out, logLevel: "silent",
  });
  ({ startUpdater } = require(out));
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

function fakeUpdater({ fail = false } = {}) {
  const u = new EventEmitter();
  u.autoDownload = false;
  u.autoInstallOnAppQuit = false;
  u.checks = 0;
  u.installs = [];
  u.checkForUpdates = () => {
    u.checks++;
    return fail ? Promise.reject(new Error("HttpError: 404")) : Promise.resolve(null);
  };
  u.quitAndInstall = (...args) => u.installs.push(args);
  return u;
}

function fakeTimers() {
  const t = { intervals: [], cleared: [] };
  t.setInterval = (fn, ms) => { t.intervals.push({ fn, ms }); return t.intervals.length; };
  t.clearInterval = (id) => t.cleared.push(id);
  return t;
}

function start(over = {}) {
  const updater = over.updater ?? fakeUpdater();
  const timers = fakeTimers();
  const statuses = [];
  const ctl = startUpdater({ updater, enabled: true, timers, onStatus: (s) => statuses.push(s), ...over });
  return { updater, timers, statuses, ctl, last: () => statuses[statuses.length - 1] };
}

const flush = () => new Promise((r) => setImmediate(r));

test("does nothing in development: no check, no listeners, no timer", async () => {
  const { updater, timers, ctl, last } = start({ enabled: false });
  await flush();
  expect(updater.checks).toBe(0);
  expect(updater.eventNames()).toEqual([]);
  expect(timers.intervals).toEqual([]);
  expect(last()).toEqual({ state: "disabled" });
  ctl.install();
  expect(updater.installs).toEqual([]);
});

test("downloads in the background and installs on quit", async () => {
  const { updater } = start();
  await flush();
  expect(updater.autoDownload).toBe(true);
  expect(updater.autoInstallOnAppQuit).toBe(true);
});

test("checks at start-up and every 6 hours", async () => {
  const { updater, timers } = start();
  await flush();
  expect(updater.checks).toBe(1);
  expect(timers.intervals.map((i) => i.ms)).toEqual([6 * 60 * 60 * 1000]);
  timers.intervals[0].fn();
  await flush();
  expect(updater.checks).toBe(2);
});

test("reports each step of an update through onStatus", async () => {
  const { updater, last } = start();
  await flush();
  updater.emit("checking-for-update");
  expect(last()).toEqual({ state: "checking" });
  updater.emit("update-not-available", { version: "1.1.0" });
  expect(last()).toEqual({ state: "none" });
  updater.emit("update-available", { version: "1.2.0" });
  expect(last()).toEqual({ state: "downloading", version: "1.2.0", percent: 0 });
  updater.emit("download-progress", { percent: 41.7 });
  expect(last()).toEqual({ state: "downloading", version: "1.2.0", percent: 42 });
  updater.emit("update-downloaded", { version: "1.2.0" });
  expect(last()).toEqual({ state: "ready", version: "1.2.0" });
});

test("a failed check is a status, never an exception (e.g. the repository is private)", async () => {
  const { updater, last } = start({ updater: fakeUpdater({ fail: true }) });
  await flush();
  expect(updater.checks).toBe(1);
  expect(last()).toEqual({ state: "error", message: "HttpError: 404" });
  updater.emit("error", new Error("net::ERR_INTERNET_DISCONNECTED"));
  expect(last()).toEqual({ state: "error", message: "net::ERR_INTERNET_DISCONNECTED" });
});

test("does not check again while a download is in progress or waiting to install", async () => {
  const { updater, ctl } = start();
  await flush();
  updater.emit("update-available", { version: "1.2.0" });
  await ctl.check();
  updater.emit("update-downloaded", { version: "1.2.0" });
  await ctl.check();
  expect(updater.checks).toBe(1);
});

test("an error after the download keeps the downloaded update ready", async () => {
  const { updater, last } = start();
  await flush();
  updater.emit("update-downloaded", { version: "1.2.0" });
  updater.emit("error", new Error("late"));
  expect(last()).toEqual({ state: "ready", version: "1.2.0" });
});

test("install restarts into the new version only when one is ready", async () => {
  const { updater, ctl } = start();
  await flush();
  ctl.install();
  expect(updater.installs).toEqual([]);
  updater.emit("update-downloaded", { version: "1.2.0" });
  ctl.install();
  expect(updater.installs).toEqual([[true, true]]);
});

test("stop clears the timer", async () => {
  const { timers, ctl } = start();
  await flush();
  ctl.stop();
  expect(timers.cleared).toEqual([1]);
});

describe("updateMenuItem", () => {
  let updateMenuItem;
  beforeAll(() => ({ updateMenuItem } = require(path.join(tmp, "updater.cjs"))));

  test("maps every status to the tray item the user sees", () => {
    expect(updateMenuItem({ state: "disabled" })).toBeNull();
    for (const state of ["idle", "none"]) {
      expect(updateMenuItem({ state })).toEqual({ key: "tray.checkUpdates", enabled: true, action: "check" });
    }
    expect(updateMenuItem({ state: "error", message: "x" })).toEqual({ key: "tray.checkUpdates", enabled: true, action: "check" });
    expect(updateMenuItem({ state: "checking" })).toEqual({ key: "tray.checkingUpdates", enabled: false, action: null });
    expect(updateMenuItem({ state: "downloading", version: "1.2.0", percent: 42 }))
      .toEqual({ key: "tray.downloadingUpdate", params: { version: "1.2.0", percent: 42 }, enabled: false, action: null });
    expect(updateMenuItem({ state: "ready", version: "1.2.0" }))
      .toEqual({ key: "tray.restartToUpdate", params: { version: "1.2.0" }, enabled: true, action: "install" });
  });
});
