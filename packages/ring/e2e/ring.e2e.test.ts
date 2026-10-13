import { test, expect, Page } from "@playwright/test";
import * as path from "path";

const RING_HTML = `file:///${path.resolve(__dirname, "..", "src", "ring.html").replace(/\\/g, "/")}`;

async function openRing(page: Page) {
  await page.setViewportSize({ width: 800, height: 800 });
  await page.goto(RING_HTML);
  await page.waitForSelector("#stage > *", { timeout: 5000 });
  await page.waitForTimeout(300); // let animation settle & auto-open
}

// ═══════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════

test.describe("Ring initialization", () => {
  test("loads without errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await openRing(page);
    expect(errors).toHaveLength(0);
  });

  test("stage element exists", async ({ page }) => {
    await openRing(page);
    const stage = await page.$("#stage");
    expect(stage).not.toBeNull();
  });

  test("hub button exists", async ({ page }) => {
    await openRing(page);
    const hub = await page.$(".btn.hub");
    expect(hub).not.toBeNull();
  });

  test("group buttons are created", async ({ page }) => {
    await openRing(page);
    const groupBtns = await page.$$(".btn.grp");
    expect(groupBtns.length).toBeGreaterThanOrEqual(6);
  });

  test("ring starts in open state (fallback mode)", async ({ page }) => {
    await openRing(page);
    // In fallback mode (no window.ring), the ring opens automatically
    // The hub should have the 'open' class
    const hubClass = await page.evaluate(() => document.querySelector(".btn.hub")?.className);
    expect(hubClass).toContain("open");
  });
});

// ═══════════════════════════════════════════
// HUB TOGGLE
// ═══════════════════════════════════════════

test.describe("Hub toggle", () => {
  test("clicking hub toggles ring state", async ({ page }) => {
    await openRing(page);
    // Hub should be open initially
    const wasOpen = await page.evaluate(() => document.querySelector(".btn.hub")?.classList.contains("open"));
    expect(wasOpen).toBe(true);
    // Click hub to close
    await page.click(".btn.hub");
    await page.waitForTimeout(200);
    // Force a render cycle
    await page.evaluate(() => { (window as any).step(); (window as any).render(); });
    const isNowOpen = await page.evaluate(() => document.querySelector(".btn.hub")?.classList.contains("open"));
    expect(isNowOpen).toBe(false);
  });

  test("hub gets 'open' class when ring is open", async ({ page }) => {
    await openRing(page);
    // Force render to apply the class
    await page.evaluate(() => { (window as any).step(); (window as any).render(); });
    const hubClass = await page.evaluate(() => document.querySelector(".btn.hub")?.className);
    expect(hubClass).toContain("open");
  });

  test("closing ring hides group buttons", async ({ page }) => {
    await openRing(page);
    // Click hub to close
    await page.click(".btn.hub");
    await page.waitForTimeout(200);
    // Run several steps to let spring physics converge
    await page.evaluate(() => { for (let i = 0; i < 60; i++) (window as any).step(); (window as any).render(); });
    // Group buttons should have scale near 0 (opacity near 0)
    const opacity = await page.evaluate(() => {
      const grp = document.querySelector(".btn.grp")?.closest(".pos") as HTMLElement;
      return grp ? parseFloat(grp.style.opacity || "1") : 1;
    });
    expect(opacity).toBeLessThan(0.3);
  });
});

// ═══════════════════════════════════════════
// GROUP INTERACTIONS
// ═══════════════════════════════════════════

test.describe("Group interactions", () => {
  test("moving mouse toward a group highlights it", async ({ page }) => {
    await openRing(page);
    // Move mouse upward from center (400,400) to select top group
    await page.mouse.move(400, 325);
    await page.waitForTimeout(200);
    await page.evaluate(() => { (window as any).step(); (window as any).render(); });
    const hasHot = await page.evaluate(() => !!document.querySelector(".btn.grp.hot"));
    expect(hasHot).toBe(true);
  });

  test("moving mouse far enough auto-activates a group", async ({ page }) => {
    await openRing(page);
    // Move mouse far upward to auto-activate the top group ("edit" at -90°)
    await page.mouse.move(400, 320);
    await page.waitForTimeout(200);
    await page.evaluate(() => { (window as any).step(); (window as any).render(); });
    const hasActive = await page.evaluate(() => !!document.querySelector(".btn.grp.active"));
    expect(hasActive).toBe(true);
  });

  test("group gets 'active' class when selected", async ({ page }) => {
    await openRing(page);
    // Move mouse far upward to auto-activate
    await page.mouse.move(400, 320);
    await page.waitForTimeout(200);
    await page.evaluate(() => { for (let i = 0; i < 10; i++) (window as any).step(); (window as any).render(); });
    const cls = await page.evaluate(() => {
      const btns = document.querySelectorAll(".btn.grp.active");
      return btns.length;
    });
    expect(cls).toBeGreaterThanOrEqual(1);
  });

  test("moving mouse back to center deactivates group", async ({ page }) => {
    await openRing(page);
    // Activate a group first
    await page.mouse.move(400, 320);
    await page.waitForTimeout(200);
    // Move back to center (dead zone)
    await page.mouse.move(400, 400);
    await page.waitForTimeout(200);
    await page.evaluate(() => { for (let i = 0; i < 10; i++) (window as any).step(); (window as any).render(); });
    const hasActive = await page.evaluate(() => !!document.querySelector(".btn.grp.active"));
    expect(hasActive).toBe(false);
  });
});

// ═══════════════════════════════════════════
// ACTION INTERACTIONS
// ═══════════════════════════════════════════

test.describe("Action interactions", () => {
  test("moving mouse far from center shows action buttons with hot class", async ({ page }) => {
    await openRing(page);
    // First move to activate group (R1 zone)
    await page.mouse.move(400, 320);
    await page.waitForTimeout(200);
    await page.evaluate(() => { for (let i = 0; i < 30; i++) (window as any).step(); (window as any).render(); });
    // Then move further out to reach action zone (R2=150, need y < 400-150=250)
    await page.mouse.move(400, 180);
    await page.waitForTimeout(300);
    await page.evaluate(() => { for (let i = 0; i < 60; i++) (window as any).step(); (window as any).render(); });
    // Check if any action button got the .hot class
    const hasHotAction = await page.evaluate(() => {
      // Action buttons are .btn but not .grp and not .hub
      const btns = document.querySelectorAll(".btn.hot:not(.grp):not(.hub)");
      return btns.length;
    });
    expect(hasHotAction).toBeGreaterThanOrEqual(1);
  });

  test("balloon shows action label when hovering action", async ({ page }) => {
    await openRing(page);
    // Move far up to reach action zone
    await page.mouse.move(400, 240);
    await page.waitForTimeout(300);
    await page.evaluate(() => { for (let i = 0; i < 30; i++) (window as any).step(); (window as any).render(); });
    const balloon = await page.evaluate(() => {
      const b = document.querySelector(".balloon") as HTMLElement;
      return { text: b?.textContent || "", opacity: b?.style.opacity || "0" };
    });
    // Balloon should be visible with some text
    expect(balloon.text.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════
// CONFIG APPLICATION
// ═══════════════════════════════════════════

test.describe("Config application", () => {
  test("applyConfig changes accent color CSS variable", async ({ page }) => {
    await openRing(page);
    await page.evaluate(() => {
      (window as any).applyConfig({ accent: "#FF0000" });
    });
    const acc = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--acc").trim()
    );
    expect(acc).toBe("#FF0000");
  });

  test("applyConfig sets light theme class", async ({ page }) => {
    await openRing(page);
    await page.evaluate(() => {
      (window as any).applyConfig({ theme: "light" });
    });
    const hasLight = await page.evaluate(() =>
      document.documentElement.classList.contains("light")
    );
    expect(hasLight).toBe(true);
  });

  test("applyConfig sets dark theme (removes light class)", async ({ page }) => {
    await openRing(page);
    await page.evaluate(() => {
      (window as any).applyConfig({ theme: "light" });
      (window as any).applyConfig({ theme: "dark" });
    });
    const hasLight = await page.evaluate(() =>
      document.documentElement.classList.contains("light")
    );
    expect(hasLight).toBe(false);
  });

  test("applyConfig updates groups and reinitializes nodes", async ({ page }) => {
    await openRing(page);
    const newGroups = [
      { id: "custom", name: "Custom", icon: "edit", actions: ["copy"] },
    ];
    await page.evaluate((g: any) => {
      (window as any).applyConfig({ groups: g });
    }, newGroups);
    // After applying new config, there should be exactly 1 group button
    await page.evaluate(() => { (window as any).step(); (window as any).render(); });
    const groupBtns = await page.$$(".btn.grp");
    expect(groupBtns.length).toBe(1);
  });

  test("applyConfig toggles liquid mode off (hides goo layer)", async ({ page }) => {
    await openRing(page);
    await page.evaluate(() => {
      (window as any).applyConfig({ liquid: false });
      (window as any).step(); (window as any).render();
    });
    const gooOpacity = await page.evaluate(() => {
      const goo = document.querySelector(".goo") as HTMLElement;
      return goo?.style.opacity || "1";
    });
    expect(gooOpacity).toBe("0");
  });
});

// ═══════════════════════════════════════════
// PHYSICS SIMULATION
// ═══════════════════════════════════════════

test.describe("Physics simulation", () => {
  test("step() can be called without errors", async ({ page }) => {
    await openRing(page);
    const ok = await page.evaluate(() => {
      try { for (let i = 0; i < 10; i++) (window as any).step(); return true; }
      catch (e) { return false; }
    });
    expect(ok).toBe(true);
  });

  test("render() can be called without errors", async ({ page }) => {
    await openRing(page);
    const ok = await page.evaluate(() => {
      try { (window as any).step(); (window as any).render(); return true; }
      catch (e) { return false; }
    });
    expect(ok).toBe(true);
  });

  test("nodes converge to targets over many steps", async ({ page }) => {
    await openRing(page);
    // Run 100 steps, then check that group buttons are positioned away from center
    await page.evaluate(() => {
      for (let i = 0; i < 100; i++) (window as any).step();
      (window as any).render();
    });
    // After 100 steps, group buttons should be positioned (non-zero transform)
    const positions = await page.evaluate(() => {
      const grps = document.querySelectorAll(".btn.grp");
      return Array.from(grps).map(g => {
        const pos = g.closest(".pos") as HTMLElement;
        return pos?.style.transform || "";
      });
    });
    // At least one group should have a non-trivial transform
    const hasPositioned = positions.some(t => t && !t.includes("scale(0"));
    expect(hasPositioned).toBe(true);
  });

  test("galaxy flow responds to hover", async ({ page }) => {
    await openRing(page);
    // Move mouse to center (no hover)
    await page.mouse.move(400, 400);
    await page.evaluate(() => { for (let i = 0; i < 30; i++) (window as any).step(); });
    // Now move mouse to select a group (triggers flow)
    await page.mouse.move(400, 325);
    await page.waitForTimeout(100);
    await page.evaluate(() => { for (let i = 0; i < 50; i++) (window as any).step(); (window as any).render(); });
    // Check that at least one star particle has non-zero opacity
    const starVisible = await page.evaluate(() => {
      const stars = document.querySelectorAll(".star");
      return Array.from(stars).some(s => parseFloat((s as HTMLElement).style.opacity || "0") > 0.01);
    });
    expect(starVisible).toBe(true);
  });
});

// ═══════════════════════════════════════════
// ASCII TERRAIN RENDERING
// ═══════════════════════════════════════════

test.describe("ASCII terrain", () => {
  test("ASCII pre elements are populated after render", async ({ page }) => {
    await openRing(page);
    await page.evaluate(() => {
      (window as any).step();
      (window as any).render();
    });
    const dimText = await page.evaluate(() =>
      document.querySelector(".asc")?.textContent?.length || 0
    );
    expect(dimText).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════
// BREATHE ANIMATION
// ═══════════════════════════════════════════

test.describe("Breathe animation", () => {
  test("breathe is hidden when ring is open", async ({ page }) => {
    await openRing(page);
    await page.evaluate(() => { (window as any).step(); (window as any).render(); });
    const cls = await page.evaluate(() =>
      document.querySelector(".breathe")?.className
    );
    expect(cls).not.toContain("on");
  });

  test("breathe is visible when ring is closed", async ({ page }) => {
    await openRing(page);
    // Close the ring via hub click
    await page.click(".btn.hub");
    await page.waitForTimeout(100);
    await page.evaluate(() => { (window as any).step(); (window as any).render(); });
    const cls = await page.evaluate(() =>
      document.querySelector(".breathe")?.className
    );
    expect(cls).toContain("on");
  });
});

// ═══════════════════════════════════════════
// MOUSE-BASED SELECTION (replaces delta-based)
// ═══════════════════════════════════════════

test.describe("Mouse-based selection", () => {
  test("mouse at center (dead zone) selects nothing", async ({ page }) => {
    await openRing(page);
    await page.mouse.move(400, 400); // center = dead zone
    await page.waitForTimeout(200);
    await page.evaluate(() => { (window as any).step(); (window as any).render(); });
    const hasHot = await page.evaluate(() => !!document.querySelector(".btn.grp.hot"));
    expect(hasHot).toBe(false);
  });

  test("moving mouse up selects top group", async ({ page }) => {
    await openRing(page);
    // Move upward from center
    await page.mouse.move(400, 340);
    await page.waitForTimeout(200);
    await page.evaluate(() => { (window as any).step(); (window as any).render(); });
    const hasHot = await page.evaluate(() => !!document.querySelector(".btn.grp.hot"));
    expect(hasHot).toBe(true);
  });

  test("different mouse directions highlight different groups", async ({ page }) => {
    await openRing(page);

    // Move up
    await page.mouse.move(400, 330);
    await page.waitForTimeout(100);
    await page.evaluate(() => { (window as any).step(); (window as any).render(); });
    const hotUp = await page.evaluate(() => {
      const el = document.querySelector(".btn.grp.hot");
      return el?.closest(".pos")?.getAttribute("style") || "";
    });

    // Move right
    await page.mouse.move(470, 400);
    await page.waitForTimeout(100);
    await page.evaluate(() => { (window as any).step(); (window as any).render(); });
    const hotRight = await page.evaluate(() => {
      const el = document.querySelector(".btn.grp.hot");
      return el?.closest(".pos")?.getAttribute("style") || "";
    });

    // The highlighted group should be at different positions
    expect(hotUp).not.toBe(hotRight);
  });
});
