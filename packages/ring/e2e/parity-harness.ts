import { Browser, BrowserContext, Page, expect, test } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const { PNG } = require("playwright-core/lib/utilsBundle") as {
  PNG: {
    sync: {
      read(buf: Buffer): { width: number; height: number; data: Buffer };
      write(png: any): Buffer;
    };
    new (opts: { width: number; height: number }): { width: number; height: number; data: Buffer };
  };
};

export const RING_DIR = path.resolve(__dirname, "..");
export const OUT_DIR = path.join(RING_DIR, "test-results", "parity");

function toFileUrl(p: string) {
  return `file:///${path.resolve(p).replace(/\\/g, "/")}`;
}

export const LEGACY_URL = toFileUrl(path.join(__dirname, "fixtures", "ring-legacy.html"));
export const SRC_RING_HTML = path.join(RING_DIR, "src", "ring.html");

export function resolveNewUrl(): { url: string; label: string } {
  const env = process.env.PARITY_NEW;
  if (env === "legacy") return { url: LEGACY_URL, label: "legacy(self)" };
  if (env && /^[a-z]+:\/\//i.test(env)) return { url: env, label: env };
  if (env) return { url: toFileUrl(env), label: env };
  return { url: toFileUrl(SRC_RING_HTML), label: "src/ring.html" };
}

export function newRingHasLanded(): boolean {
  try {
    return /ring-bundle\.js/.test(fs.readFileSync(SRC_RING_HTML, "utf8"));
  } catch {
    return false;
  }
}

export const VIEW = { width: 800, height: 800 };
export const CENTER = { x: VIEW.width / 2, y: VIEW.height / 2 };
export const R1 = 75;
export const R2 = 150;
export const STEP = 28;
const D2R = Math.PI / 180;

export function gAng(gi: number, N: number) {
  return -90 + (gi * 360) / N;
}
export function aAng(gi: number, N: number, j: number, n: number) {
  return gAng(gi, N) + (j - (n - 1) / 2) * STEP;
}
export function at(angleDeg: number, r: number) {
  return { x: CENTER.x + Math.cos(angleDeg * D2R) * r, y: CENTER.y + Math.sin(angleDeg * D2R) * r };
}

export interface Pair {
  legacy: Page;
  neu: Page;
  pages: Page[];
  contexts: BrowserContext[];
  fakeClock: boolean;
  close(): Promise<void>;
}

async function preparePage(ctx: BrowserContext, url: string, fakeClock: boolean): Promise<Page> {
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    try {
      localStorage.clear();
    } catch {
    }
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  if (fakeClock) {
    await page.clock.install({ time: 0 });
    await page.clock.pauseAt(1000);
  }
  await page.goto(url);
  await page.waitForSelector("#stage .btn.hub", { timeout: 5000 });
  return page;
}

export async function openPair(browser: Browser, opts: { newUrl?: string; fakeClock?: boolean } = {}): Promise<Pair> {
  const fakeClock = opts.fakeClock !== false;
  const newUrl = opts.newUrl ?? resolveNewUrl().url;
  const mk = () =>
    browser.newContext({
      viewport: VIEW,
      deviceScaleFactor: 1,
      reducedMotion: "no-preference",
      colorScheme: "dark",
    });
  const c1 = await mk();
  const c2 = await mk();
  const legacy = await preparePage(c1, LEGACY_URL, fakeClock);
  const neu = await preparePage(c2, newUrl, fakeClock);
  return {
    legacy,
    neu,
    pages: [legacy, neu],
    contexts: [c1, c2],
    fakeClock,
    async close() {
      await c1.close();
      await c2.close();
    },
  };
}

export async function both<T>(pair: Pair, fn: (page: Page) => Promise<T>): Promise<[T, T]> {
  const a = await fn(pair.legacy);
  const b = await fn(pair.neu);
  return [a, b];
}

export async function advance(pair: Pair, ms: number) {
  if (ms <= 0) return;
  if (pair.fakeClock) await both(pair, (p) => p.clock.runFor(ms));
  else await Promise.all(pair.pages.map((p) => p.waitForTimeout(ms)));
}

export async function move(pair: Pair, x: number, y: number) {
  await both(pair, (p) => p.mouse.move(x, y));
}

export async function key(pair: Pair, k: string) {
  await both(pair, (p) => p.keyboard.press(k));
}

export async function evalBoth(pair: Pair, js: string) {
  await both(pair, (p) => p.evaluate(js));
}

export interface DiffResult {
  width: number;
  height: number;
  total: number;
  differing: number;
  pct: number;
  maxChannelDelta: number;
  composite: Buffer;
}

export function comparePng(legacyBuf: Buffer, newBuf: Buffer, tolerance = 8): DiffResult {
  const a = PNG.sync.read(legacyBuf);
  const b = PNG.sync.read(newBuf);
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`screenshot size mismatch: legacy ${a.width}x${a.height} vs new ${b.width}x${b.height}`);
  }
  const { width, height } = a;
  const out = new PNG({ width: width * 3, height });
  let differing = 0;
  let maxDelta = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const dr = Math.abs(a.data[i] - b.data[i]);
      const dg = Math.abs(a.data[i + 1] - b.data[i + 1]);
      const db = Math.abs(a.data[i + 2] - b.data[i + 2]);
      const da = Math.abs(a.data[i + 3] - b.data[i + 3]);
      const d = Math.max(dr, dg, db, da);
      if (d > maxDelta) maxDelta = d;
      const bad = d > tolerance;
      if (bad) differing++;
      const o1 = (y * width * 3 + x) * 4;
      const o2 = (y * width * 3 + width + x) * 4;
      const o3 = (y * width * 3 + width * 2 + x) * 4;
      out.data[o1] = a.data[i];
      out.data[o1 + 1] = a.data[i + 1];
      out.data[o1 + 2] = a.data[i + 2];
      out.data[o1 + 3] = 255;
      out.data[o2] = b.data[i];
      out.data[o2 + 1] = b.data[i + 1];
      out.data[o2 + 2] = b.data[i + 2];
      out.data[o2 + 3] = 255;
      if (bad) {
        out.data[o3] = 255;
        out.data[o3 + 1] = 0;
        out.data[o3 + 2] = 0;
      } else {
        const g = Math.round((0.299 * a.data[i] + 0.587 * a.data[i + 1] + 0.114 * a.data[i + 2]) * 0.35);
        out.data[o3] = g;
        out.data[o3 + 1] = g;
        out.data[o3 + 2] = g;
      }
      out.data[o3 + 3] = 255;
    }
  }
  const total = width * height;
  return {
    width,
    height,
    total,
    differing,
    pct: (differing / total) * 100,
    maxChannelDelta: maxDelta,
    composite: PNG.sync.write(out),
  };
}

export interface SnapOptions {
  keep?: boolean;
  maxPct?: number;
  tolerance?: number;
  settleMs?: number;
}

export interface SnapRecord {
  scenario: string;
  differing: number;
  total: number;
  pct: number;
  maxChannelDelta: number;
  passed: boolean;
  files: string[];
}

export const records: SnapRecord[] = [];

export async function snap(pair: Pair, scenario: string, opts: SnapOptions = {}): Promise<SnapRecord> {
  const maxPct = opts.maxPct ?? 0.05;
  const tolerance = opts.tolerance ?? 8;
  const settleMs = opts.settleMs ?? 400;
  if (settleMs > 0) await Promise.all(pair.pages.map((p) => p.waitForTimeout(settleMs)));
  await Promise.all(
    pair.pages.map((p) =>
      p.evaluate(() => {
        const s = document.getElementById("stage")!;
        s.style.display = "none";
        void s.offsetHeight;
        s.style.display = "";
      })
    )
  );
  await Promise.all(pair.pages.map((p) => p.waitForTimeout(150)));
  const shot = (p: Page) => p.screenshot({ fullPage: false, animations: "disabled", caret: "hide", type: "png" });
  const [legacyBuf, newBuf] = await both(pair, shot);
  const res = comparePng(legacyBuf, newBuf, tolerance);
  const passed = res.pct <= maxPct;
  const files: string[] = [];
  if (opts.keep || !passed) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const safe = scenario.replace(/[^a-z0-9_-]+/gi, "_");
    const f1 = path.join(OUT_DIR, `${safe}-legacy.png`);
    const f2 = path.join(OUT_DIR, `${safe}-new.png`);
    const f3 = path.join(OUT_DIR, `${safe}-diff.png`);
    fs.writeFileSync(f1, legacyBuf);
    fs.writeFileSync(f2, newBuf);
    fs.writeFileSync(f3, res.composite);
    files.push(f1, f2, f3);
  }
  const rec: SnapRecord = {
    scenario,
    differing: res.differing,
    total: res.total,
    pct: res.pct,
    maxChannelDelta: res.maxChannelDelta,
    passed,
    files,
  };
  records.push(rec);
  const line = `[parity] ${scenario}: ${res.differing}/${res.total} px differ (${res.pct.toFixed(4)}%), max channel delta ${res.maxChannelDelta}${passed ? "" : "  <-- FAIL"}`;
  console.log(line);
  test.info().annotations.push({ type: "parity", description: line });
  appendReport(rec);
  expect(res.pct, `${scenario}: differing pixels ${res.differing}/${res.total} = ${res.pct.toFixed(4)}% (limit ${maxPct}%)`).toBeLessThanOrEqual(maxPct);
  return rec;
}

export function appendReport(rec: unknown) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.appendFileSync(path.join(OUT_DIR, "report.jsonl"), JSON.stringify(rec) + "\n");
}

export type Tree = { t: string; c: string; k: Tree[] };

export async function stageTree(page: Page): Promise<Tree> {
  return page.evaluate(() => {
    const walk = (el: Element): any => ({
      t: el.tagName.toLowerCase(),
      c: Array.from(el.classList).sort().join(" "),
      k: Array.from(el.children).map(walk),
    });
    return walk(document.getElementById("stage")!);
  });
}

export interface RingState {
  isOpen: boolean;
  visible: boolean;
  activeGroup: string | null;
  hover: string | null;
  dx: number;
  dy: number;
}
export async function ringState(page: Page): Promise<RingState> {
  return page.evaluate(
    "({ isOpen: !!isOpen, visible: !!visible, activeGroup: activeGroup ?? null, hover: hover ?? null, dx: +dx, dy: +dy })"
  ) as Promise<RingState>;
}

export async function stageNodeCount(page: Page): Promise<number> {
  return page.evaluate(() => document.getElementById("stage")!.querySelectorAll("*").length);
}

export const DEFAULT_N = 6;

export async function hoverGroup0(pair: Pair) {
  await move(pair, CENTER.x, CENTER.y - 40);
}

export async function hoverAction(pair: Pair, settle = 300) {
  const p1 = at(gAng(0, DEFAULT_N), 60);
  await move(pair, p1.x, p1.y);
  await advance(pair, settle);
  const p2 = at(aAng(0, DEFAULT_N, 1, 3), R2);
  await move(pair, p2.x, p2.y);
}

export const THEMES: Array<{ name: string; accent: string }> = [
  { name: "dark", accent: "#C6F432" },
  { name: "orange", accent: "#FF6B2B" },
  { name: "neg-orange", accent: "#2B8AFF" },
  { name: "neg", accent: "#FFFFFF" },
  { name: "light", accent: "#000000" },
];

export const CUSTOM_GROUPS = [
  { id: "solo", name: "Solo", icon: "aperture", actions: ["screenshot"] },
  {
    id: "many",
    name: "Many",
    icon: "music",
    actions: ["copy", "paste", "undo", "redo", "cut", "save", "find", "terminal"],
  },
  { id: "pair", name: "Pair", icon: "layers", actions: ["minimize", "maximize"] },
];
