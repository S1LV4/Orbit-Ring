import { test, expect, type Page } from "@playwright/test";

async function open(page: Page) {
  await page.routeWebSocket("ws://127.0.0.1:9119", (ws) => {
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

async function openWithService(page: Page, savedLocale?: string) {
  const sent: any[] = [];
  let locale = savedLocale;
  await page.routeWebSocket("ws://127.0.0.1:9119", (ws) => {
    setTimeout(() => {
      ws.send(JSON.stringify({ type: "plugins", plugins: [] }));
      if (locale) ws.send(JSON.stringify({ type: "locale", locale }));
    }, 30);
    ws.onMessage((raw) => {
      let m: any;
      try { m = JSON.parse(String(raw)); } catch { return; }
      sent.push(m);
      if (m.type === "set_locale") locale = m.locale;
    });
  });
  await page.goto("/");
  return sent;
}

const settingsTab = (page: Page) => page.locator("aside nav button").last();

test.describe("language selector", () => {
  test.use({ locale: "pt-BR" });

  test("lists the system option and every language in its own name", async ({ page }) => {
    await openWithService(page);
    await settingsTab(page).click();
    const select = page.getByTestId("language-select");
    await expect(select).toHaveValue("system");
    await expect(select.locator("option")).toHaveText(["Sistema", "English", "Português (Brasil)", "Español"]);
  });

  test("picking a language saves it and switches the window right away", async ({ page }) => {
    const sent = await openWithService(page);
    await settingsTab(page).click();
    await page.getByTestId("language-select").selectOption("es-ES");
    await expect(page.locator("aside nav button")).toHaveText(["Ring", "Botones", "Dispositivos", "Perfiles", "Plugins", "Ajustes"]);
    await expect(page.locator("html")).toHaveAttribute("lang", "es-ES");
    expect(sent.filter((m) => m.type === "set_locale")).toEqual([{ type: "set_locale", locale: "es-ES" }]);
  });

  test("follows the language the service reports, and back to the system", async ({ page }) => {
    await openWithService(page, "en-US");
    await expect(page.locator("aside nav button").nth(1)).toHaveText("Buttons");
    await settingsTab(page).click();
    await expect(page.getByTestId("language-select")).toHaveValue("en-US");
    await page.getByTestId("language-select").selectOption("system");
    await expect(page.locator("aside nav button").nth(1)).toHaveText("Botões");
  });
});
