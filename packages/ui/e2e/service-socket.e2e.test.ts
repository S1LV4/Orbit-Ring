import { test, expect, type Page } from "@playwright/test";

const TOKEN = "c".repeat(64);
const SERVICE = /^ws:\/\/[^/]+:9119\//;

async function capture(page: Page) {
  const seen: { url: string; protocols: string[] }[] = [];
  await page.routeWebSocket(SERVICE, (ws) => {
    seen.push({ url: ws.url(), protocols: ws.protocols() });
    ws.onMessage(() => {});
  });
  return seen;
}

test("the config window connects to the service on 127.0.0.1 with the token from its preload", async ({ page }) => {
  await page.addInitScript((token) => {
    (window as unknown as { orbit: { serviceToken: () => string } }).orbit = { serviceToken: () => token };
  }, TOKEN);
  const seen = await capture(page);
  await page.goto("/");
  await expect.poll(() => seen.length).toBeGreaterThan(0);
  expect(seen[0].url).toBe("ws://127.0.0.1:9119/");
  expect(seen[0].protocols).toEqual(["orbitring", `token.${TOKEN}`]);
});

test("the token is read again on every connection, so a restarted service is reached", async ({ page }) => {
  await page.addInitScript(() => {
    let n = 0;
    (window as unknown as { orbit: { serviceToken: () => string } }).orbit = { serviceToken: () => String(++n).repeat(64) };
  });
  const seen: string[][] = [];
  await page.routeWebSocket(SERVICE, (ws) => {
    seen.push(ws.protocols());
    if (seen.length === 1) ws.close();
    else ws.onMessage(() => {});
  });
  await page.goto("/");
  await expect.poll(() => seen.length, { timeout: 10000 }).toBeGreaterThan(1);
  expect(seen[0][1]).toBe(`token.${"1".repeat(64)}`);
  expect(seen[1][1]).toBe(`token.${"2".repeat(64)}`);
});

test("outside the app window there is no token and the socket offers none", async ({ page }) => {
  const seen = await capture(page);
  await page.goto("/");
  await expect.poll(() => seen.length).toBeGreaterThan(0);
  expect(seen[0].protocols).toEqual(["orbitring"]);
});
