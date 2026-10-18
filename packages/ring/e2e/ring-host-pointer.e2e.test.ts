import { test, expect, Page } from "@playwright/test";
import * as path from "path";

const RING_HTML = `file:///${path.resolve(__dirname, "..", "src", "ring.html").replace(/\\/g, "/")}`;
const CENTER = { x: 330, y: 280 };

async function openHostRing(page: Page) {
  await page.setViewportSize({ width: 1400, height: 860 });
  await page.addInitScript(() => {
    const cb: Record<string, (d?: unknown) => void> = {};
    const w = window as unknown as Record<string, unknown>;
    w.__ring = { cb, sent: [] as unknown[] };
    w.ring = {
      executeAction: (a: unknown) => (w.__ring as { sent: unknown[] }).sent.push(a),
      close: () => {},
      hideWindow: () => {},
      onShow: (f: () => void) => { cb.show = f; },
      onHide: (f: () => void) => { cb.hide = f; },
      onRelease: (f: () => void) => { cb.release = f; },
      onConfig: (f: () => void) => { cb.config = f; },
      hidden: () => {
        const hub = document.querySelector(".btn.hub");
        (w.__ring as { hiddenWith?: unknown }).hiddenWith = {
          hubOpen: !!hub?.classList.contains("open"),
          groupsShown: document.querySelectorAll(".btn.grp.active, .btn.grp.hot").length,
        };
      },
    };
  });
  await page.goto(RING_HTML);
  await page.waitForSelector("#stage > *", { timeout: 5000 });
  await page.mouse.move(CENTER.x, CENTER.y);
  await page.evaluate((c) => {
    const r = (window as unknown as { __ring: { cb: Record<string, (d?: unknown) => void> } }).__ring;
    r.cb.show({ cx: c.x, cy: c.y, inset: { l: 0, t: 0, r: 0, b: 0 } });
  }, CENTER);
  await page.waitForTimeout(100);
}

const frames = (page: Page, n: number) =>
  page.evaluate((k) => { const w = window as unknown as { step(): void; render(): void }; for (let i = 0; i < k; i++) w.step(); w.render(); }, n);

test.describe("Ring in the app follows the real pointer", () => {
  test("the ring is drawn around the point the main process asked for, not the window centre", async ({ page }) => {
    await openHostRing(page);
    await frames(page, 30);
    const hub = await page.locator(".btn.hub").boundingBox();
    expect(hub).not.toBeNull();
    expect(Math.abs(hub!.x + hub!.width / 2 - CENTER.x)).toBeLessThan(2);
    expect(Math.abs(hub!.y + hub!.height / 2 - CENTER.y)).toBeLessThan(2);
    for (const sel of [".asc.acc", ".toast"]) {
      const left = await page.locator(sel).evaluate((el) => parseFloat((el as HTMLElement).style.left));
      expect(left).toBe(CENTER.x);
    }
  });

  test("moving the real pointer selects a group without any delta from the service", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await openHostRing(page);
    await page.mouse.move(CENTER.x, CENTER.y - 80, { steps: 6 });
    await frames(page, 10);
    const sel = await page.evaluate(() => {
      const w = window as unknown as { dx: number; dy: number; activeGroup: string | null };
      return { dx: w.dx, dy: w.dy, activeGroup: w.activeGroup };
    });
    expect(sel.dx).toBeCloseTo(0, 0);
    expect(sel.dy).toBeCloseTo(-80, 0);
    expect(sel.activeGroup).not.toBeNull();
    expect(await page.locator(".btn.grp.active").count()).toBe(1);
    expect(errors).toEqual([]);
  });

  test("the ring is visible the moment it is shown, even while the pointer keeps moving", async ({ page }) => {
    await openHostRing(page);
    await page.evaluate(() => (window as unknown as { __ring: { cb: Record<string, () => void> } }).__ring.cb.hide());
    const visible = await page.evaluate(() => {
      const w = window as unknown as { __ring: { cb: Record<string, (d?: unknown) => void> }; visible: boolean };
      w.__ring.cb.show({ cx: 330, cy: 280 });
      return w.visible;
    });
    expect(visible).toBe(true);
  });

  test("on close the window is hidden only after an empty frame was painted, so the next open never flashes the old ring", async ({ page }) => {
    await openHostRing(page);
    await page.mouse.move(CENTER.x, CENTER.y - 80, { steps: 6 });
    await frames(page, 10);
    await page.evaluate(() => (window as unknown as { __ring: { cb: Record<string, () => void> } }).__ring.cb.hide());
    await page.waitForFunction(() => (window as unknown as { __ring: { hiddenWith?: unknown } }).__ring.hiddenWith);
    const hiddenWith = await page.evaluate(() => (window as unknown as { __ring: { hiddenWith: unknown } }).__ring.hiddenWith);
    expect(hiddenWith).toEqual({ hubOpen: false, groupsShown: 0 });
  });

  test("a pointer far outside the ring still points at a group", async ({ page }) => {
    await openHostRing(page);
    await page.mouse.move(CENTER.x + 900, CENTER.y, { steps: 6 });
    await frames(page, 10);
    expect(await page.evaluate(() => (window as unknown as { activeGroup: string | null }).activeGroup)).not.toBeNull();
  });
});
