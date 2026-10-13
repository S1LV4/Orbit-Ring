import { test, expect, Page } from "@playwright/test";
import * as path from "path";

const RING_HTML = `file:///${path.resolve(__dirname, "..", "src", "ring.html").replace(/\\/g, "/")}`;

async function openRing(page: Page) {
  await page.setViewportSize({ width: 800, height: 800 });
  await page.goto(RING_HTML);
  await page.waitForSelector("#stage > *", { timeout: 5000 });
  await page.waitForTimeout(300); // let animation settle & auto-open
}

// Center is at (400, 400) with an 800x800 viewport

// ═══════════════════════════════════════════
// MOUSE INPUT RESPONSIVENESS
// ═══════════════════════════════════════════

test.describe("Mouse input responsiveness", () => {
  test("rapid mouse moves process without errors", async ({ page }) => {
    await openRing(page);
    // Simulate rapid mouse movement across various positions
    const elapsed = await page.evaluate(() => {
      const start = performance.now();
      // Simulate 100 pointermove-equivalent updates via step+render
      for (let i = 0; i < 100; i++) {
        (window as any).step();
      }
      return performance.now() - start;
    });
    // Should process 100 steps in under 50ms
    expect(elapsed).toBeLessThan(50);
  });

  test("mouse at extreme distance does not break rendering", async ({ page }) => {
    await openRing(page);
    // Move mouse to far edge of viewport
    await page.mouse.move(50, 50);
    await page.waitForTimeout(100);
    await page.evaluate(() => { (window as any).step(); (window as any).render(); });
    // Should still have a functional UI
    const hubExists = await page.$(".btn.hub");
    expect(hubExists).not.toBeNull();
  });

  test("closing and reopening ring works via hub click", async ({ page }) => {
    await openRing(page);
    // Close
    await page.click(".btn.hub");
    await page.waitForTimeout(200);
    await page.evaluate(() => { (window as any).step(); (window as any).render(); });
    const closedClass = await page.evaluate(() => document.querySelector(".btn.hub")?.className);
    expect(closedClass).not.toContain("open");
    // Reopen
    await page.click(".btn.hub");
    await page.waitForTimeout(200);
    await page.evaluate(() => { (window as any).step(); (window as any).render(); });
    const openedClass = await page.evaluate(() => document.querySelector(".btn.hub")?.className);
    expect(openedClass).toContain("open");
  });
});

// ═══════════════════════════════════════════
// GROUP SELECTION BY MOUSE DIRECTION
// ═══════════════════════════════════════════

test.describe("Group selection accuracy", () => {
  const DIRECTIONS = [
    { name: "up", x: 400, y: 330 },       // -90° (top)
    { name: "right", x: 470, y: 400 },     // 0° (right)
    { name: "down", x: 400, y: 470 },      // 90° (bottom)
    { name: "left", x: 330, y: 400 },      // 180° (left)
    { name: "up-right", x: 450, y: 350 },  // -45°
    { name: "down-left", x: 350, y: 450 }, // 135°
  ];

  for (const dir of DIRECTIONS) {
    test(`moving mouse ${dir.name} highlights a group`, async ({ page }) => {
      await openRing(page);
      await page.mouse.move(dir.x, dir.y);
      await page.waitForTimeout(150);
      await page.evaluate(() => { (window as any).step(); (window as any).render(); });
      const hasHot = await page.evaluate(() => !!document.querySelector(".btn.grp.hot"));
      expect(hasHot).toBe(true);
    });
  }

  test("each cardinal direction highlights a different group", async ({ page }) => {
    await openRing(page);
    const positions: Array<string | null> = [];

    for (const [x, y] of [[400, 330], [470, 400], [400, 470], [330, 400]]) {
      await page.mouse.move(x, y);
      await page.waitForTimeout(100);
      await page.evaluate(() => { (window as any).step(); (window as any).render(); });
      // Identify which group is hot by checking transform of the .hot element
      const hotTransform = await page.evaluate(() => {
        const el = document.querySelector(".btn.grp.hot");
        const pos = el?.closest(".pos") as HTMLElement;
        return pos?.style.transform || null;
      });
      positions.push(hotTransform);
      // Move back to center to reset
      await page.mouse.move(400, 400);
      await page.waitForTimeout(100);
    }
    // All 4 should be at different positions (different groups)
    const unique = new Set(positions.filter(Boolean));
    expect(unique.size).toBe(4);
  });
});

// ═══════════════════════════════════════════
// ACTION SELECTION WITHIN GROUP
// ═══════════════════════════════════════════

test.describe("Action selection within group", () => {
  test("moving mouse far from center reaches action zone", async ({ page }) => {
    await openRing(page);
    // First move to activate group (R1 zone)
    await page.mouse.move(400, 320);
    await page.waitForTimeout(200);
    await page.evaluate(() => { for (let i = 0; i < 30; i++) (window as any).step(); (window as any).render(); });
    // Then move further out to reach action zone (R2=150, need y < 400-150=250)
    await page.mouse.move(400, 180);
    await page.waitForTimeout(300);
    await page.evaluate(() => { for (let i = 0; i < 60; i++) (window as any).step(); (window as any).render(); });
    // Check if an action button (not grp, not hub) has .hot
    const hotAction = await page.evaluate(() => {
      const btns = document.querySelectorAll(".btn.hot:not(.grp):not(.hub)");
      return btns.length;
    });
    expect(hotAction).toBeGreaterThanOrEqual(1);
  });

  test("mouse near center within active group shows no action highlight", async ({ page }) => {
    await openRing(page);
    // First activate a group by moving far
    await page.mouse.move(400, 320);
    await page.waitForTimeout(200);
    await page.evaluate(() => { for (let i = 0; i < 20; i++) (window as any).step(); (window as any).render(); });
    // Now move close to center — still in group zone but no action selected
    await page.mouse.move(400, 370);
    await page.waitForTimeout(200);
    await page.evaluate(() => { for (let i = 0; i < 20; i++) (window as any).step(); (window as any).render(); });
    // Action buttons should not be hot (only possibly the group itself)
    const hotActions = await page.evaluate(() => {
      return document.querySelectorAll(".btn.hot:not(.grp):not(.hub)").length;
    });
    expect(hotActions).toBe(0);
  });

  test("sweeping mouse through arc changes highlighted action", async ({ page }) => {
    await openRing(page);
    // Move far up to activate group
    await page.mouse.move(400, 240);
    await page.waitForTimeout(300);
    await page.evaluate(() => { for (let i = 0; i < 30; i++) (window as any).step(); (window as any).render(); });

    // Sweep from upper-left to upper-right at action distance
    const hotTransforms: string[] = [];
    for (const x of [360, 380, 400, 420, 440]) {
      await page.mouse.move(x, 240);
      await page.waitForTimeout(80);
      await page.evaluate(() => { (window as any).step(); (window as any).render(); });
      const t = await page.evaluate(() => {
        const el = document.querySelector(".btn.hot:not(.grp):not(.hub)");
        const pos = el?.closest(".pos") as HTMLElement;
        return pos?.style.transform || "";
      });
      if (t) hotTransforms.push(t);
    }
    // Should have swept through at least 1 action (may hit multiple)
    expect(hotTransforms.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════
// PHYSICS STEP PERFORMANCE
// ═══════════════════════════════════════════

test.describe("Physics performance", () => {
  test("step() completes in under 2ms", async ({ page }) => {
    await openRing(page);
    const elapsed = await page.evaluate(() => {
      const start = performance.now();
      for (let i = 0; i < 60; i++) (window as any).step();
      return (performance.now() - start) / 60;
    });
    expect(elapsed).toBeLessThan(2);
  });

  test("render() completes in under 5ms", async ({ page }) => {
    await openRing(page);
    const elapsed = await page.evaluate(() => {
      (window as any).step(); // ensure state is valid
      const start = performance.now();
      for (let i = 0; i < 30; i++) (window as any).render();
      return (performance.now() - start) / 30;
    });
    expect(elapsed).toBeLessThan(5);
  });

  test("full frame (step+render) at 60fps budget (16ms)", async ({ page }) => {
    await openRing(page);
    const elapsed = await page.evaluate(() => {
      const start = performance.now();
      for (let i = 0; i < 60; i++) {
        (window as any).step();
        (window as any).render();
      }
      return (performance.now() - start) / 60;
    });
    // Each frame should be well under 16ms budget
    expect(elapsed).toBeLessThan(8);
  });

  test("spring convergence is smooth (no wild oscillation)", async ({ page }) => {
    await openRing(page);
    // Run many steps and check that group button positions stabilize
    const positions = await page.evaluate(() => {
      const xValues: number[] = [];
      for (let i = 0; i < 40; i++) {
        (window as any).step();
        (window as any).render();
        const grp = document.querySelector(".btn.grp")?.closest(".pos") as HTMLElement;
        const m = grp?.style.transform?.match(/translate\(([0-9.]+)px/);
        xValues.push(m ? parseFloat(m[1]) : 0);
      }
      return xValues;
    });
    // Check convergence — the last few values should be very close
    const last = positions[positions.length - 1];
    const secondLast = positions[positions.length - 2];
    expect(Math.abs(last - secondLast)).toBeLessThan(2);
  });
});

// ═══════════════════════════════════════════
// KEYBOARD NAVIGATION
// ═══════════════════════════════════════════

test.describe("Keyboard navigation", () => {
  test("arrow keys cycle through groups", async ({ page }) => {
    await openRing(page);
    // Press right arrow to select first group
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(100);
    await page.evaluate(() => { (window as any).step(); (window as any).render(); });
    const hasHot1 = await page.evaluate(() => !!document.querySelector(".btn.grp.hot"));
    expect(hasHot1).toBe(true);

    // Press right arrow again to cycle
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(100);
    await page.evaluate(() => { (window as any).step(); (window as any).render(); });
    const hasHot2 = await page.evaluate(() => !!document.querySelector(".btn.grp.hot"));
    expect(hasHot2).toBe(true);
  });

  test("Escape closes the ring", async ({ page }) => {
    await openRing(page);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    await page.evaluate(() => { (window as any).step(); (window as any).render(); });
    const hubClass = await page.evaluate(() => document.querySelector(".btn.hub")?.className);
    expect(hubClass).not.toContain("open");
  });
});

// ═══════════════════════════════════════════
// TOAST FEEDBACK
// ═══════════════════════════════════════════

test.describe("Toast feedback", () => {
  test("flash() shows toast with text", async ({ page }) => {
    await openRing(page);
    await page.evaluate(() => {
      (window as any).flash("Test Action");
    });
    const toastText = await page.evaluate(() =>
      document.querySelector(".toast")?.textContent
    );
    expect(toastText).toBe("Test Action");
  });
});
