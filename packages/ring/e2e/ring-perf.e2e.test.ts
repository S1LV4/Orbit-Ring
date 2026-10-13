import { test, expect, Page } from "@playwright/test";
import { openPair, hoverAction, stageNodeCount, appendReport, resolveNewUrl, ringState, Pair } from "./parity-harness";

test.setTimeout(120_000);

interface Stats {
  median: number;
  p95: number;
  mean: number;
}
interface PerfResult {
  step: Stats;
  stepRender: Stats;
}

function pct(sorted: number[], q: number) {
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[i];
}
function stats(samples: number[]): Stats {
  const s = [...samples].sort((a, b) => a - b);
  return {
    median: pct(s, 0.5),
    p95: pct(s, 0.95),
    mean: s.reduce((a, b) => a + b, 0) / s.length,
  };
}

async function measure(page: Page, iterations = 300): Promise<PerfResult> {
  const raw = await page.evaluate((N: number) => {
    const w = window as any;
    const step: () => void = w.step;
    const render: () => void = w.render;
    if (typeof step !== "function" || typeof render !== "function") {
      throw new Error("window.step / window.render are not exposed");
    }
    for (let i = 0; i < 60; i++) {
      step();
      render();
    }
    const st: number[] = [];
    for (let i = 0; i < N; i++) {
      const t0 = performance.now();
      step();
      step();
      step();
      step();
      step();
      st.push((performance.now() - t0) / 5);
    }
    const sr: number[] = [];
    for (let i = 0; i < N; i++) {
      const t0 = performance.now();
      step();
      render();
      sr.push(performance.now() - t0);
    }
    return { st, sr };
  }, iterations);
  return { step: stats(raw.st), stepRender: stats(raw.sr) };
}

async function measureBest(page: Page, rounds = 3): Promise<PerfResult> {
  let best: PerfResult | null = null;
  for (let r = 0; r < rounds; r++) {
    const m = await measure(page);
    if (!best || m.stepRender.p95 < best.stepRender.p95) best = m;
    await page.waitForTimeout(50);
  }
  return best!;
}

const fmt = (n: number) => n.toFixed(3).padStart(8);

test.describe("performance: legacy vs new", () => {
  let pair: Pair;
  test.beforeAll(async ({ browser }) => {
    pair = await openPair(browser, { newUrl: resolveNewUrl().url, fakeClock: false });
    await Promise.all(pair.pages.map((p) => p.waitForTimeout(300)));
    await hoverAction(pair, 200);
    await Promise.all(pair.pages.map((p) => p.waitForTimeout(600)));
    const [sa, sb] = await Promise.all(
      pair.pages.map((p) => ringState(p).then((s) => ({ g: s.activeGroup, h: s.hover })))
    );
    expect(sa).toEqual({ g: "edit", h: "edit:paste" });
    expect(sb).toEqual(sa);
  });
  test.afterAll(async () => pair?.close());

  test("step() and step()+render() per-frame cost", async () => {
    const legacy = await measureBest(pair.legacy);
    const neu = await measureBest(pair.neu);
    const legacy2 = await measureBest(pair.legacy);
    const L = legacy.stepRender.p95 <= legacy2.stepRender.p95 ? legacy : legacy2;

    const table = [
      "",
      "[perf] per-frame cost in ms (300 samples, best of 3 rounds; step() timed in blocks of 5)",
      "[perf]                    step median  step p95   s+r median   s+r p95   s+r mean",
      `[perf] legacy          ${fmt(L.step.median)}  ${fmt(L.step.p95)}   ${fmt(L.stepRender.median)}  ${fmt(L.stepRender.p95)}  ${fmt(L.stepRender.mean)}`,
      `[perf] new             ${fmt(neu.step.median)}  ${fmt(neu.step.p95)}   ${fmt(neu.stepRender.median)}  ${fmt(neu.stepRender.p95)}  ${fmt(neu.stepRender.mean)}`,
      `[perf] ratio new/legacy p95(step+render) = ${(neu.stepRender.p95 / L.stepRender.p95).toFixed(3)}  (limit 1.5, and <= 16 ms)`,
      "",
    ].join("\n");
    console.log(table);
    test.info().annotations.push({ type: "perf", description: table });
    appendReport({ perf: { legacy: L, new: neu } });

    expect(neu.stepRender.p95, "new p95(step+render) must be <= 16 ms").toBeLessThanOrEqual(16);
    expect(neu.stepRender.p95, "new p95(step+render) must be <= legacy p95 x 1.5").toBeLessThanOrEqual(
      L.stepRender.p95 * 1.5
    );
  });

  test("DOM node count under #stage is equal", async () => {
    const [a, b] = await Promise.all(pair.pages.map(stageNodeCount));
    console.log(`[perf] #stage descendant nodes: legacy=${a} new=${b}`);
    expect(b).toBe(a);
  });
});
