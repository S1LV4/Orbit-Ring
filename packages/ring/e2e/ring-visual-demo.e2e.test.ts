import { test, expect, Page } from "@playwright/test";
import * as path from "path";

const RING_HTML = `file:///${path.resolve(__dirname, "..", "src", "ring.html").replace(/\\/g, "/")}`;

async function openRing(page: Page) {
  await page.goto(RING_HTML);
  await page.waitForFunction(() => typeof (window as any).pol === "function", null, { timeout: 5000 });
}

async function simulateDelta(page: Page, targetDx: number, targetDy: number, steps: number, pauseMs: number) {
  const stepDx = targetDx / steps;
  const stepDy = targetDy / steps;
  for (let i = 0; i < steps; i++) {
    await page.evaluate(({ dx, dy }) => {
      (window as any).deltaX += dx;
      (window as any).deltaY += dy;
      (window as any).updateFromDelta();
    }, { dx: stepDx, dy: stepDy });
    await page.waitForTimeout(pauseMs);
  }
}

test.describe("Visual Demo — watch the ring in action", () => {

  test("demo: open ring, hover each group slowly", async ({ page }) => {
    await openRing(page);
    await page.setViewportSize({ width: 800, height: 800 });
    await page.waitForTimeout(1000);

    await page.evaluate(() => {
      (window as any).isOpen = true;
      (window as any).sim.change = (window as any).sim.f;
      (window as any).sim.openP = 1;
      var T = (window as any)._targets();
      for (var id in T) {
        (window as any).sim.nodes[id] = { x: T[id].x, y: T[id].y, s: T[id].s, vx: 0, vy: 0, vs: 0 };
        (window as any).sim.tgt[id] = T[id];
      }
    });
    await page.waitForTimeout(2000);

    const groups = await page.evaluate(() => (window as any).groups.map((g: any) => g.id));
    for (const gid of groups) {
      await page.evaluate((id: string) => { (window as any).hover = id; }, gid);
      await page.waitForTimeout(1200);
    }
    await page.evaluate(() => { (window as any).hover = null; });
    await page.waitForTimeout(1000);
  });

  test("demo: single gesture — drag to group, then to action", async ({ page }) => {
    await openRing(page);
    await page.setViewportSize({ width: 800, height: 800 });
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      (window as any).isOpen = true;
      (window as any).sim.change = (window as any).sim.f;
      (window as any).sim.openP = 1;
      var T = (window as any)._targets();
      for (var id in T) {
        (window as any).sim.nodes[id] = { x: T[id].x, y: T[id].y, s: T[id].s, vx: 0, vy: 0, vs: 0 };
        (window as any).sim.tgt[id] = T[id];
      }
      (window as any).deltaX = 0;
      (window as any).deltaY = 0;
    });
    await page.waitForTimeout(1500);

    await simulateDelta(page, 0, -50, 15, 100);
    await page.waitForTimeout(1500);

    await simulateDelta(page, 0, -40, 12, 100);
    await page.waitForTimeout(2000);

    await simulateDelta(page, -40, 0, 10, 120);
    await page.waitForTimeout(1500);
    await simulateDelta(page, 80, 0, 20, 120);
    await page.waitForTimeout(1500);

    const state = await page.evaluate(() => ({
      activeGroup: (window as any).activeGroup,
      hover: (window as any).hover,
    }));
    expect(state.activeGroup).toBe("edit");
  });

  test("demo: visit multiple groups", async ({ page }) => {
    await openRing(page);
    await page.setViewportSize({ width: 800, height: 800 });
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      (window as any).isOpen = true;
      (window as any).sim.change = (window as any).sim.f;
      (window as any).sim.openP = 1;
      var T = (window as any)._targets();
      for (var id in T) {
        (window as any).sim.nodes[id] = { x: T[id].x, y: T[id].y, s: T[id].s, vx: 0, vy: 0, vs: 0 };
        (window as any).sim.tgt[id] = T[id];
      }
    });
    await page.waitForTimeout(1500);

    await page.evaluate(() => { (window as any).deltaX = 0; (window as any).deltaY = 0; (window as any).activeGroup = null; (window as any).hover = null; });
    await simulateDelta(page, 0, -70, 15, 80);
    await page.waitForTimeout(2000);

    await page.evaluate(() => { (window as any).deltaX = 0; (window as any).deltaY = 0; (window as any).activeGroup = null; (window as any).hover = null; (window as any).sim.change = (window as any).sim.f; });
    await simulateDelta(page, 55, -40, 15, 80);
    await page.waitForTimeout(2000);

    await page.evaluate(() => { (window as any).deltaX = 0; (window as any).deltaY = 0; (window as any).activeGroup = null; (window as any).hover = null; (window as any).sim.change = (window as any).sim.f; });
    await simulateDelta(page, 55, 40, 15, 80);
    await page.waitForTimeout(2000);

    await page.evaluate(() => { (window as any).isOpen = false; (window as any).activeGroup = null; (window as any).hover = null; });
    await page.waitForTimeout(1500);
  });
});
