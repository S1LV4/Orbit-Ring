import { test } from "@playwright/test";
import * as path from "path";

const RING_HTML = `file:///${path.resolve(__dirname, "..", "src", "ring.html").replace(/\\/g, "/")}`;
function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

test("loop: showcase repeating forever", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 800 });
  await page.goto(RING_HTML);
  await page.waitForSelector("#stage > *", { timeout: 10000 });
  await delay(2000);

  while (true) {
    const cx = 400, cy = 400;

    await page.mouse.move(cx, cy);
    await delay(1500);

    const angles = [
      { name: "edit",   x: 0,    y: -75 },
      { name: "nav",    x: 65,   y: -38 },
      { name: "win",    x: 65,   y: 38  },
      { name: "media",  x: 0,    y: 75  },
      { name: "cap",    x: -65,  y: 38  },
      { name: "sys",    x: -65,  y: -38 },
    ];

    for (const g of angles) {
      await page.mouse.move(cx + g.x, cy + g.y, { steps: 10 });
      await delay(1200);

      await page.mouse.move(cx + g.x * 1.5, cy + g.y * 1.5, { steps: 8 });
      await delay(800);

      const perpX = -g.y / 75 * 30, perpY = g.x / 75 * 30;
      await page.mouse.move(cx + g.x * 2 + perpX, cy + g.y * 2 + perpY, { steps: 8 });
      await delay(700);
      await page.mouse.move(cx + g.x * 2 - perpX, cy + g.y * 2 - perpY, { steps: 16 });
      await delay(700);

      await page.mouse.move(cx, cy, { steps: 8 });
      await delay(600);
    }

    await delay(1000);

    await page.goto(RING_HTML);
    await page.waitForSelector("#stage > *", { timeout: 10000 });
    await delay(2000);
  }
});
