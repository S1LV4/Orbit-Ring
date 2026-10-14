import { test, expect, type Page } from "@playwright/test";
import * as fs from "fs";
import * as http from "http";
import * as path from "path";
import type { AddressInfo } from "net";

const SRC = path.resolve(__dirname, "..", "src");
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

const PARENT = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<script>
  window.send = cfg => document.querySelector("iframe").contentWindow.postMessage({ target: "orbit-ring", type: "config", cfg }, "*");
</script>
<iframe src="/ring.html" style="width:640px;height:640px;border:0"></iframe>
</body></html>`;

let server: http.Server, base = "";
test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = (req.url || "/").split("?")[0];
    if (url === "/parent.html") { res.writeHead(200, { "content-type": "text/html" }); res.end(PARENT); return; }
    const file = path.join(SRC, path.normalize(url).replace(/^([\\/])+/, ""));
    if (!file.startsWith(SRC) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(fs.readFileSync(file));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
test.afterAll(async () => { await new Promise((r) => server.close(r)); });

const ringLang = (page: Page) => page.frameLocator("iframe").locator("html");
const send = (page: Page, cfg: Record<string, unknown>) => page.evaluate((c) => (window as any).send(c), cfg);

test("the ring switches to the language the app sends, and back to the system", async ({ page }) => {
  await page.goto(`${base}/parent.html`);
  await expect(ringLang(page)).toHaveAttribute("lang", "pt-BR");

  await send(page, { locale: "es-ES" });
  await expect(ringLang(page)).toHaveAttribute("lang", "es-ES");

  await send(page, { locale: "system" });
  await expect(ringLang(page)).toHaveAttribute("lang", "pt-BR");
});

test("the same language again does not reload the ring", async ({ page }) => {
  await page.goto(`${base}/parent.html`);
  await expect(ringLang(page)).toHaveAttribute("lang", "pt-BR");
  await page.frames()[1].evaluate(() => { (window as any).__marker = 1; });
  await send(page, { locale: "system" });
  await page.waitForTimeout(500);
  expect(await page.frames()[1].evaluate(() => (window as any).__marker)).toBe(1);
});
