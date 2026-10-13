import { test, expect, Page } from "@playwright/test";
import * as path from "path";

const RING_HTML = `file:///${path.resolve(__dirname, "..", "src", "ring.html").replace(/\\/g, "/")}`;

async function openRing(page: Page) {
  await page.goto(RING_HTML);
  await page.waitForFunction(() => typeof (window as any).pol === "function", null, { timeout: 5000 });
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

test("showcase: all groups and actions one by one", async ({ page }) => {
  await openRing(page);
  await page.setViewportSize({ width: 800, height: 800 });

  // Open ring with nodes at final positions
  await page.evaluate(() => {
    const w = window as any;
    w.isOpen = true;
    w.sim.change = w.sim.f;
    w.sim.openP = 1;
    var T = w._targets();
    for (var id in T) {
      w.sim.nodes[id] = { x: T[id].x, y: T[id].y, s: T[id].s, vx: 0, vy: 0, vs: 0 };
      w.sim.tgt[id] = T[id];
    }
  });
  await delay(1500);

  // Get all groups
  const groups: { id: string; name: string; actions: string[] }[] = await page.evaluate(() =>
    (window as any).groups.map((g: any) => ({ id: g.id, name: g.name, actions: g.actions }))
  );

  for (const group of groups) {
    // Hover group
    await page.evaluate((gid: string) => {
      const w = window as any;
      w.activeGroup = null;
      w.hover = gid;
    }, group.id);
    await delay(1500);

    // Activate group (enter subgroup)
    await page.evaluate((gid: string) => {
      const w = window as any;
      w.sim.change = w.sim.f;
      w.activeGroup = gid;
      w.hover = null;
      w.sim.grpP = 0;
      // Snap action nodes to targets
      var T = w._targets();
      for (var id in T) {
        w.sim.nodes[id] = { x: T[id].x, y: T[id].y, s: T[id].s, vx: 0, vy: 0, vs: 0 };
        w.sim.tgt[id] = T[id];
      }
    }, group.id);
    await delay(1200);

    // Hover each action one by one
    for (const aid of group.actions) {
      await page.evaluate((actionId: string) => {
        (window as any).hover = actionId;
      }, aid);
      await delay(1200);
    }

    // Clear hover
    await page.evaluate(() => { (window as any).hover = null; });
    await delay(800);
  }

  // Close ring
  await page.evaluate(() => {
    const w = window as any;
    w.isOpen = false;
    w.activeGroup = null;
    w.hover = null;
  });
  await delay(1500);
});
