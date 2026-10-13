import { test } from "@playwright/test";
import * as path from "path";

const RING_HTML = `file:///${path.resolve(__dirname, "..", "src", "ring.html").replace(/\\/g, "/")}`;
function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

test("loop: showcase repeating forever", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 800 });
  await page.goto(RING_HTML);
  // Wait for #stage to have children (DOM built)
  await page.waitForSelector("#stage > *", { timeout: 10000 });
  await delay(2000); // let animation loop start and settle

  while (true) {
    // In browser preview mode, the ring auto-opens with mouse interaction.
    // Simulate mouse movement to trigger hover on each group.
    const cx = 400, cy = 400;

    // Move to center to reset
    await page.mouse.move(cx, cy);
    await delay(1500);

    // Visit each group (6 groups at 60° intervals starting at -90°)
    const angles = [
      { name: "edit",   x: 0,    y: -75 },
      { name: "nav",    x: 65,   y: -38 },
      { name: "win",    x: 65,   y: 38  },
      { name: "media",  x: 0,    y: 75  },
      { name: "cap",    x: -65,  y: 38  },
      { name: "sys",    x: -65,  y: -38 },
    ];

    for (const g of angles) {
      // Move to group position
      await page.mouse.move(cx + g.x, cy + g.y, { steps: 10 });
      await delay(1200);

      // Move further out to trigger subgroup
      await page.mouse.move(cx + g.x * 1.5, cy + g.y * 1.5, { steps: 8 });
      await delay(800);

      // Sweep through actions
      const perpX = -g.y / 75 * 30, perpY = g.x / 75 * 30;
      await page.mouse.move(cx + g.x * 2 + perpX, cy + g.y * 2 + perpY, { steps: 8 });
      await delay(700);
      await page.mouse.move(cx + g.x * 2 - perpX, cy + g.y * 2 - perpY, { steps: 16 });
      await delay(700);

      // Return to center
      await page.mouse.move(cx, cy, { steps: 8 });
      await delay(600);
    }

    // Pause before next cycle
    await delay(1000);

    // Reload to pick up file changes
    await page.goto(RING_HTML);
    await page.waitForSelector("#stage > *", { timeout: 10000 });
    await delay(2000);
  }
});
