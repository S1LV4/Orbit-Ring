import { test, expect, type Page } from "@playwright/test";

const INSTALLED = [
  { id: "x.steam", name: "Steam", version: "1.0.0", author: "@S1LV4", description: "Biblioteca e jogos", loaded: true,
    actions: [{ id: "library", name: "Biblioteca" }, { id: "store", name: "Loja" }] },
  { id: "x.power", name: "PowerToys", version: "1.0.0", author: "@S1LV4", description: "Atalhos", loaded: true, actions: [],
    status: { text: "Não autorizado", tone: "error", action: { id: "authorize", label: "Autorizar" } } },
];
const CATALOG = [
  { id: "x.codex", name: "Codex", version: "1.0.0", author: "@S1LV4", description: "Uso do Codex", actionCount: 2, installedVersion: null, updateAvailable: false },
  { id: "x.community", name: "Comunidade", version: "0.2.0", author: "@octocat, Maria Souza", description: "Vários autores", actionCount: 1, installedVersion: null, updateAvailable: false },
  { id: "x.power", name: "PowerToys", version: "1.1.0", author: "@S1LV4", description: "Atalhos", actionCount: 22, installedVersion: "1.0.0", updateAvailable: true },
  { id: "x.steam", name: "Steam", version: "1.0.0", author: "@S1LV4", description: "Biblioteca e jogos", actionCount: 18, installedVersion: "1.0.0", updateAvailable: false },
];

async function openPlugins(page: Page, { installed = INSTALLED, catalog = CATALOG }: { installed?: any[]; catalog?: any[] } = {}) {
  const sent: any[] = [];
  const CATALOG = catalog;
  await page.routeWebSocket("ws://127.0.0.1:9119", (ws) => {
    setTimeout(() => ws.send(JSON.stringify({ type: "plugins", plugins: installed })), 30);
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

test("installed list: a plugin's status is shown, and its button runs the plugin action", async ({ page }) => {
  const sent = await openPlugins(page);
  await page.getByRole("tab", { name: /Instalados/ }).click();
  const power = page.locator('[data-testid="installed-plugin"][data-plugin-id="x.power"]');
  await expect(power.getByTestId("plugin-status")).toHaveText("Não autorizado");
  await expect(power.getByTestId("plugin-status")).toHaveAttribute("data-tone", "error");
  await expect(page.locator('[data-plugin-id="x.steam"]').getByTestId("plugin-status")).toHaveCount(0);
  await power.getByRole("button", { name: "Autorizar" }).click();
  await expect.poll(() => sent.filter((m) => m.type === "execute_plugin_action")).toEqual([{ type: "execute_plugin_action", pluginId: "x.power", actionId: "authorize" }]);
});

test("installed list: a newer catalog version is offered right on the installed card", async ({ page }) => {
  const sent = await openPlugins(page);
  await page.getByRole("tab", { name: /Instalados/ }).click();
  const power = page.locator('[data-testid="installed-plugin"][data-plugin-id="x.power"]');
  await expect(power.getByRole("button", { name: "Atualizar para v1.1.0" })).toBeVisible();
  await expect(page.locator('[data-plugin-id="x.steam"]').getByRole("button", { name: /Atualizar/ })).toHaveCount(0);
  await power.getByRole("button", { name: "Atualizar para v1.1.0" }).click();
  expect(sent.filter((m) => m.type === "install_plugin")).toEqual([{ type: "install_plugin", pluginId: "x.power" }]);
});

const entry = (over: Record<string, unknown>) => ({
  id: "x.p", name: "P", version: "1.0.0", author: "@S1LV4", description: "d", actionCount: 1,
  installedVersion: null, updateAvailable: false, orbitApi: "^1.0", compatible: true, permissions: [], ...over,
});

test("the catalog tells what a plugin can do before it is installed", async ({ page }) => {
  await openPlugins(page, { catalog: [
    entry({ id: "x.usage", name: "Uso", permissions: ["commands", "network", "appData", "credentials"] }),
    entry({ id: "x.quiet", name: "Quieto", permissions: [] }),
    entry({ id: "x.old", name: "Antigo", permissions: null }),
  ] });
  const perms = card(page, "x.usage").getByTestId("plugin-permissions");
  await expect(perms.locator("[data-permission]")).toHaveText([
    "executar programas e comandos", "conectar à internet ou a outros apps", "ler dados de outros apps",
    "usar o login de outros apps ou guardar o próprio",
  ]);
  await expect(perms).toContainText("Pode");
  await expect(card(page, "x.quiet").getByTestId("plugin-permissions")).toHaveText("Nenhuma permissão especial");
  const old = card(page, "x.old").getByTestId("plugin-permissions");
  await expect(old).toHaveText("Não declarou as permissões");
  await expect(old).toHaveAttribute("data-undeclared", "true");
  await shot(page, "plugins-permissions");
});

test("a plugin written for a newer OrbitRing cannot be installed, and says why", async ({ page }) => {
  const sent = await openPlugins(page, { catalog: [entry({ id: "x.future", name: "Futuro", orbitApi: "^2.0", compatible: false })] });
  const c = card(page, "x.future");
  await expect(c.getByRole("button", { name: "Instalar" })).toHaveCount(0);
  await expect(c.getByTestId("plugin-incompatible")).toHaveText("Requer um OrbitRing mais novo");
  await expect(c.getByTestId("plugin-incompatible")).toHaveAttribute("title", "Feito para a API de plugins ^2.0; este OrbitRing oferece 1.0.0");
  expect(sent.filter((m) => m.type === "install_plugin")).toEqual([]);
});

test("an installed plugin that is not running says why, and shows its permissions in the details", async ({ page }) => {
  await openPlugins(page, { catalog: [], installed: [
    { id: "x.future", name: "Futuro", version: "2.0.0", author: "@S1LV4", description: "d", loaded: false, actions: [],
      problem: { kind: "incompatible", requires: "^2.0", provides: "1.0.0" }, permissions: ["network"] },
    { id: "x.broken", name: "Quebrado", version: "1.0.0", author: "@S1LV4", description: "d", loaded: false, actions: [],
      problem: { kind: "failed" }, permissions: null },
    { id: "x.stuck", name: "Travado", version: "1.0.0", author: "@S1LV4", description: "d", loaded: false, actions: [],
      problem: { kind: "unresponsive" }, permissions: [] },
  ] });
  await page.getByRole("tab", { name: /Instalados/ }).click();
  const future = page.locator(`[data-testid="installed-plugin"][data-plugin-id="x.future"]`);
  await expect(future.getByTestId("plugin-problem")).toHaveText("Feito para a API de plugins ^2.0; este OrbitRing oferece 1.0.0");
  await expect(future).toContainText("erro");
  const broken = page.locator(`[data-testid="installed-plugin"][data-plugin-id="x.broken"]`);
  await expect(broken.getByTestId("plugin-problem")).toHaveText("Falhou ao iniciar — veja o log do serviço");
  const stuck = page.locator(`[data-testid="installed-plugin"][data-plugin-id="x.stuck"]`);
  await expect(stuck.getByTestId("plugin-problem")).toHaveText("Parou de responder e foi desligado — reinstale ou reinicie o OrbitRing");

  await future.getByRole("button", { name: /ações|ação/ }).click();
  const details = page.getByTestId("plugin-details");
  await expect(details.getByTestId("plugin-permissions").locator("[data-permission]")).toHaveText(["conectar à internet ou a outros apps"]);
  await expect(details.getByRole("button", { name: "Desinstalar" })).toBeVisible();
});
