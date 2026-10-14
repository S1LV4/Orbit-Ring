import { test, expect, type Page } from "@playwright/test";

const INSTALLED = [
  { id: "x.steam", name: "Steam", version: "1.0.0", author: "@S1LV4", description: "Biblioteca e jogos", loaded: true,
    actions: [{ id: "library", name: "Biblioteca" }, { id: "store", name: "Loja" }] },
  { id: "x.power", name: "PowerToys", version: "1.0.0", author: "@S1LV4", description: "Atalhos", loaded: true, actions: [] },
];
const CATALOG = [
  { id: "x.codex", name: "Codex", version: "1.0.0", author: "@S1LV4", description: "Uso do Codex", actionCount: 2, installedVersion: null, updateAvailable: false },
  { id: "x.community", name: "Comunidade", version: "0.2.0", author: "@octocat, Maria Souza", description: "Vários autores", actionCount: 1, installedVersion: null, updateAvailable: false },
  { id: "x.power", name: "PowerToys", version: "1.1.0", author: "@S1LV4", description: "Atalhos", actionCount: 22, installedVersion: "1.0.0", updateAvailable: true },
  { id: "x.steam", name: "Steam", version: "1.0.0", author: "@S1LV4", description: "Biblioteca e jogos", actionCount: 18, installedVersion: "1.0.0", updateAvailable: false },
];

async function openPlugins(page: Page) {
  const sent: any[] = [];
  await page.routeWebSocket("ws://localhost:9119", (ws) => {
    setTimeout(() => ws.send(JSON.stringify({ type: "plugins", plugins: INSTALLED })), 30);
    ws.onMessage((raw) => {
      let m: any;
      try { m = JSON.parse(String(raw)); } catch { return; }
      sent.push(m);
      if (m.type === "get_plugin_catalog") ws.send(JSON.stringify({ type: "plugin_catalog", plugins: CATALOG }));
      if (m.type === "install_plugin") {
        const next = CATALOG.map((p) => (p.id === m.pluginId ? { ...p, installedVersion: p.version, updateAvailable: false } : p));
        ws.send(JSON.stringify({ type: "plugin_catalog", plugins: next }));
      }
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Plugins", exact: true }).click();
  return sent;
}

const card = (page: Page, id: string) => page.locator(`[data-testid="catalog-plugin"][data-plugin-id="${id}"]`);
const shot = async (page: Page, name: string) => {
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/${name}.png` });
};

test("credits: the app credit and every @handle link to GitHub with an avatar", async ({ page }) => {
  await openPlugins(page);
  const app = page.locator("aside a[href='https://github.com/S1LV4']");
  await expect(app).toHaveText("@S1LV4");
  await expect(app.locator("img")).toHaveAttribute("src", /^https:\/\/github\.com\/S1LV4\.png/);
  await expect(page.locator("aside a[href='https://github.com/S1LV4/Orbit-Ring']")).toBeVisible();

  const community = card(page, "x.community");
  await expect(community.locator("a[href='https://github.com/octocat']")).toHaveText("@octocat");
  await expect(community).toContainText("Maria Souza");
  await expect(community.locator("a")).toHaveCount(1);
});

test("two lists with counts; the catalog is a grid and installs nothing without a click", async ({ page }) => {
  const sent = await openPlugins(page);
  await expect(page.getByRole("tab", { name: /Catálogo/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("count-catalog")).toHaveText("4");
  await expect(page.getByTestId("count-installed")).toHaveText("2");
  await expect(page.getByTestId("catalog-plugin")).toHaveCount(4);
  await expect(page.getByTestId("installed-plugin")).toHaveCount(0);

  const a = await card(page, "x.codex").boundingBox();
  const b = await card(page, "x.community").boundingBox();
  expect(Math.abs(a!.y - b!.y)).toBeLessThan(2);
  expect(b!.x).toBeGreaterThan(a!.x + a!.width - 1);

  await expect(card(page, "x.steam")).toContainText("instalado");
  await expect(card(page, "x.steam").getByRole("button")).toHaveCount(0);
  await expect(card(page, "x.power").getByRole("button", { name: "Atualizar" })).toBeVisible();
  expect(sent.filter((m) => m.type === "install_plugin")).toEqual([]);
  await shot(page, "plugins-catalog");

  await card(page, "x.codex").getByRole("button", { name: "Instalar" }).click();
  await expect(card(page, "x.codex")).toContainText("instalado");
  expect(sent.filter((m) => m.type === "install_plugin")).toEqual([{ type: "install_plugin", pluginId: "x.codex" }]);
});

test("installed list: details on demand, uninstall asks before sending remove_plugin", async ({ page }) => {
  const sent = await openPlugins(page);
  await page.getByRole("tab", { name: /Instalados/ }).click();
  await expect(page.getByTestId("installed-plugin")).toHaveCount(2);
  await expect(page.getByTestId("catalog-plugin")).toHaveCount(0);
  await expect(page.getByTestId("plugin-details")).toHaveCount(0);

  await page.getByRole("button", { name: "2 ações" }).click();
  const details = page.getByTestId("plugin-details");
  await expect(details).toContainText("Biblioteca");
  await expect(details).toContainText("Loja");
  await shot(page, "plugins-installed");

  await details.getByRole("button", { name: "Desinstalar" }).click();
  await expect(details.getByText("Apagar a pasta deste plugin?")).toBeVisible();
  expect(sent.filter((m) => m.type === "remove_plugin")).toEqual([]);
  await details.getByRole("button", { name: "Cancelar" }).click();
  await details.getByRole("button", { name: "Desinstalar" }).click();
  await details.getByRole("button", { name: "Desinstalar" }).click();
  expect(sent.filter((m) => m.type === "remove_plugin")).toEqual([{ type: "remove_plugin", pluginId: "x.steam" }]);
});
