import { test, expect, type Page } from "@playwright/test";

async function open(page: Page) {
  await page.routeWebSocket("ws://localhost:9119", (ws) => {
    setTimeout(() => ws.send(JSON.stringify({ type: "plugins", plugins: [] })), 30);
    ws.onMessage(() => {});
  });
  await page.goto("/");
}

const CASES = [
  { locale: "pt-BR", lang: "pt-BR", nav: ["Ring", "Botões", "Dispositivos", "Perfis", "Plugins", "Configurações"], newGroup: "Novo grupo", firstGroup: "Edição" },
  { locale: "en-US", lang: "en-US", nav: ["Ring", "Buttons", "Devices", "Profiles", "Plugins", "Settings"], newGroup: "New group", firstGroup: "Editing" },
  { locale: "es-ES", lang: "es-ES", nav: ["Ring", "Botones", "Dispositivos", "Perfiles", "Plugins", "Ajustes"], newGroup: "Nuevo grupo", firstGroup: "Edición" },
  { locale: "es-MX", lang: "es-ES", nav: ["Ring", "Botones", "Dispositivos", "Perfiles", "Plugins", "Ajustes"], newGroup: "Nuevo grupo", firstGroup: "Edición" },
  { locale: "fr-FR", lang: "en-US", nav: ["Ring", "Buttons", "Devices", "Profiles", "Plugins", "Settings"], newGroup: "New group", firstGroup: "Editing" },
];

for (const c of CASES) {
  test.describe(`browser language ${c.locale}`, () => {
    test.use({ locale: c.locale });

    test(`the config window follows it (${c.lang})`, async ({ page }) => {
      await open(page);
      await expect(page.locator("html")).toHaveAttribute("lang", c.lang);
      const nav = page.locator("aside nav button");
      await expect(nav).toHaveText(c.nav);
      await expect(page.getByTestId("add-group")).toContainText(c.newGroup);
      await expect(page.getByTestId("group-row").first()).toContainText(c.firstGroup);
    });
  });
}
