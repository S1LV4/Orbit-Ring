import { test, expect, type Page } from "@playwright/test";

async function open(page: Page) {
  await page.routeWebSocket("ws://localhost:9119", (ws) => {
    setTimeout(() => ws.send(JSON.stringify({ type: "plugins", plugins: [] })), 30);
    ws.onMessage(() => {});
  });
  await page.goto("/");
}

const loaded = (img: HTMLImageElement) => img.complete && img.naturalWidth;

test("the splash screen shows the OrbitRing logo", async ({ page }) => {
  await open(page);
  const logo = page.locator("#splash img");
  await expect(logo).toHaveAttribute("src", /orbitring-icon\.webp$/);
  await expect.poll(() => logo.evaluate(loaded)).toBeGreaterThan(0);
  await expect(page.locator("#splash svg")).toHaveCount(0);
});

test("the window icon is the OrbitRing tile", async ({ page }) => {
  await open(page);
  const href = await page.locator("link[rel=icon]").getAttribute("href");
  expect(href).toMatch(/favicon\.webp$/);
  const res = await page.request.get(new URL(href!, page.url()).toString());
  expect(res.ok()).toBe(true);
  expect(res.headers()["content-type"]).toContain("image/webp");
});

test("the sidebar shows the OrbitRing logo next to the app name", async ({ page }) => {
  await open(page);
  const brand = page.getByTestId("brand");
  await expect(brand.locator("h1")).toHaveText("orbitRing");
  const logo = brand.locator("img");
  await expect(logo).toHaveAttribute("src", /orbitring-icon\.webp$/);
  await expect.poll(() => logo.evaluate(loaded)).toBeGreaterThan(0);
});
