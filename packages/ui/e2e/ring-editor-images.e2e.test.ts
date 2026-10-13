import { test, expect, type Page } from "@playwright/test";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const ICON = '<circle cx="12" cy="12" r="9"/>';
const act = (id: string) => `plugin:steam:${id}`;

const RING = {
  groups: [
    { id: "games", name: "Jogos", icon: "aperture", actions: [act("cover"), act("svg"), "copy"] },
    { id: "edit", name: "Edição", icon: "edit", actions: ["copy", "paste", "undo"] },
  ],
  theme: "dark", size: 320, accent: "#C6F432", speed: 1, liquid: true,
};

const PLUGINS = [{
  id: "steam", name: "Steam", version: "1.0.0", loaded: true,
  actions: [
    { id: "cover", name: "Left 4 Dead 2", icon: ICON, image: PNG },
    { id: "svg", name: "Biblioteca", icon: ICON },
    { id: "bad-svg", name: "SVG disfarçado", icon: ICON, image: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIG9ubG9hZD0nd2luZG93Ll9fcHduPTEnLz4=" },
    { id: "bad-url", name: "URL remota", icon: ICON, image: "https://example.invalid/cover.png" },
    { id: "bad-html", name: "Markup", icon: ICON, image: 'data:image/png;base64,AAAA"><img src=x onerror=window.__pwn=1>' },
  ],
}];

async function openEditor(page: Page) {
  const saves: unknown[] = [];
  await page.routeWebSocket("ws://localhost:9119", (ws) => {
    setTimeout(() => {
      ws.send(JSON.stringify({ type: "ring_config", ring: RING }));
      ws.send(JSON.stringify({ type: "plugins", plugins: PLUGINS }));
    }, 30);
    ws.onMessage((raw) => {
      try { const m = JSON.parse(String(raw)); if (m.type === "save_ring") saves.push(m.ring); } catch {  }
    });
  });
  await page.goto("/");
  await page.waitForSelector("#splash", { state: "detached", timeout: 15000 });
  await expect(page.getByTestId("library-category").filter({ hasText: "Plugin · Steam" })).toHaveCount(1);
  return saves;
}

const libraryItem = (page: Page, id: string) => page.locator(`[data-testid="library-item"][data-action-id="${act(id)}"]`);

test.describe("Ring editor — action pictures", () => {
  test("library: a valid image is shown as a round thumbnail, everything else keeps the SVG", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (r) => { if (/example\.invalid/.test(r.url())) requests.push(r.url()); });
    await openEditor(page);
    await page.getByTestId("library-category").filter({ hasText: "Plugin · Steam" }).getByRole("button").first().click();

    const img = libraryItem(page, "cover").locator("img[data-action-image]");
    await expect(img).toHaveCount(1);
    expect(await img.getAttribute("src")).toBe(PNG);
    expect(await img.getAttribute("draggable")).toBe("false");
    const style = await img.evaluate((el) => {
      const cs = getComputedStyle(el), r = el.getBoundingClientRect();
      return { radius: parseFloat(cs.borderTopLeftRadius), fit: cs.objectFit, w: r.width, h: r.height };
    });
    expect(style.w).toBe(style.h);
    expect(style.radius).toBeGreaterThanOrEqual(style.w / 2);
    expect(style.fit).toBe("cover");
    await expect(libraryItem(page, "cover").locator("svg circle[r='9']")).toHaveCount(0);

    for (const id of ["svg", "bad-svg", "bad-url", "bad-html"]) {
      await expect(libraryItem(page, id)).toHaveCount(1);
      await expect(libraryItem(page, id).locator("img")).toHaveCount(0);
      await expect(libraryItem(page, id).locator("svg circle[r='9']")).toHaveCount(1);
    }
    expect(await page.evaluate(() => (window as unknown as { __pwn?: number }).__pwn)).toBeUndefined();
    expect(requests).toEqual([]);
  });

  test("inspector list and the ring preview draw the same picture; nothing is saved by rendering", async ({ page }) => {
    const saves = await openEditor(page);
    await page.locator('[data-testid="group-row"][data-group-id="games"]').click();
    const item = page.locator(`[data-testid="group-action"][data-action-id="${act("cover")}"]`);
    await expect(item.locator("img[data-action-image]")).toHaveCount(1);
    expect(await item.locator("img[data-action-image]").getAttribute("src")).toBe(PNG);
    await expect(page.locator(`[data-testid="group-action"][data-action-id="${act("svg")}"] img`)).toHaveCount(0);

    const frame = page.frameLocator("iframe");
    const pimg = frame.locator(`[data-key="games:${act("cover")}"] img.pimg`);
    await expect(pimg).toHaveCount(1);
    expect(await pimg.getAttribute("src")).toBe(PNG);
    await expect(frame.locator(`[data-key="games:${act("svg")}"] img`)).toHaveCount(0);
    await expect(frame.locator("img.pimg")).toHaveCount(1);

    await page.waitForTimeout(900);
    expect(saves).toHaveLength(0);
  });
});
