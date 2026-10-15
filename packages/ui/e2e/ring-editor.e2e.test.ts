import { test, expect, type Page } from "@playwright/test";

interface Group { id: string; name: string; icon: string; actions: string[] }
interface Ring { groups: Group[]; theme: string; size: number; accent: string; speed: number; liquid: boolean }

const FIXTURE: Ring = {
  groups: [
    { id: "edit", name: "Edição", icon: "edit", actions: ["copy", "paste", "undo", "plugin:gone:old"] },
    { id: "nav", name: "Navegação", icon: "compass", actions: ["back", "forward", "refresh"] },
    { id: "win", name: "Janelas", icon: "layers", actions: ["minimize", "maximize", "close"] },
    { id: "media", name: "Mídia", icon: "music", actions: ["playpause", "volmute"] },
    { id: "full", name: "Cheio", icon: "settings", actions: ["save", "explorer", "find", "cut", "redo", "print", "saveas", "lock"] },
    { id: "empty", name: "Rascunho", icon: "brain", actions: [] },
  ],
  theme: "dark",
  size: 320,
  accent: "#C6F432",
  speed: 1,
  liquid: true,
};

const FIXTURE_PLUGINS = [
  {
    id: "obs",
    name: "OBS Studio",
    version: "1.0.0",
    loaded: true,
    actions: [
      { id: "rec", name: "Gravar", icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/></svg>' },
      { id: "scene", name: "Próxima cena", icon: '<rect x="3" y="5" width="18" height="14" rx="2"/>' },
    ],
  },
];

interface Mock {
  saves: Ring[];
  last: () => Ring;
  push: (ring: Ring) => void;
}

async function openEditor(page: Page, opts: { echo?: boolean; ring?: Ring } = {}): Promise<Mock> {
  const saves: Ring[] = [];
  const ring = opts.ring ?? FIXTURE;
  let push: (ring: Ring) => void = () => {};
  await page.routeWebSocket("ws://127.0.0.1:9119", (ws) => {
    push = (r) => ws.send(JSON.stringify({ type: "ring_config", ring: r }));
    setTimeout(() => {
      ws.send(JSON.stringify({ type: "ring_config", ring }));
      ws.send(JSON.stringify({ type: "plugins", plugins: FIXTURE_PLUGINS }));
    }, 30);
    ws.onMessage((raw) => {
      let msg: { type?: string; ring?: Ring };
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (msg.type !== "save_ring" || !msg.ring) return;
      saves.push(msg.ring);
      if (opts.echo !== false) {
        const echoed = msg.ring;
        setTimeout(() => ws.send(JSON.stringify({ type: "ring_config", ring: echoed })), 50);
      }
    });
  });
  await page.goto("/");
  await page.waitForSelector("#splash", { state: "detached", timeout: 15000 });
  await expect(rows(page)).toHaveCount(ring.groups.length);
  await expect(page.getByTestId("library-category").filter({ hasText: "Plugin · OBS Studio" })).toHaveCount(1);
  return { saves, last: () => saves[saves.length - 1], push: (r) => push(r) };
}

const rows = (page: Page) => page.getByTestId("group-row");
const row = (page: Page, id: string) => page.locator(`[data-testid="group-row"][data-group-id="${id}"]`);
const rowOrder = (page: Page) => rows(page).evaluateAll((els) => els.map((e) => e.getAttribute("data-group-id")));
const groupActions = (page: Page) =>
  page.getByTestId("group-action").evaluateAll((els) => els.map((e) => e.getAttribute("data-action-id")));
const libraryItem = (page: Page, actionId: string) =>
  page.locator(`[data-testid="library-item"][data-action-id="${actionId}"]`);

const settle = (page: Page) => page.waitForTimeout(600);

async function ringMessage(page: Page, msg: Record<string, unknown>) {
  const frame = page.frame({ url: /ring\/ring\.html/ });
  if (!frame) throw new Error("ring iframe not found");
  await frame.evaluate((m) => window.parent.postMessage({ source: "orbit-ring", ...m }, "*"), msg);
}

async function search(page: Page, text: string) {
  await page.getByTestId("library-search").fill(text);
}

test.describe("Ring editor", () => {
  test("initial render makes no save, and renders plugin + unknown actions", async ({ page }) => {
    const mock = await openEditor(page);
    await page.waitForTimeout(2200);
    expect(mock.saves).toHaveLength(0);

    await expect(page.getByTestId("group-counter")).toHaveText("6/8");
    await expect(page.getByTestId("preview-hint")).toBeVisible();
    await expect(row(page, "empty").getByTestId("badge-empty")).toBeVisible();
    const unknown = page.locator('[data-testid="group-action"][data-action-id="plugin:gone:old"]');
    await expect(unknown).toContainText("plugin:gone:old");
    await expect(unknown.getByTestId("action-unavailable")).toHaveText("indisponível");

    await row(page, "nav").click();
    await search(page, "gravar");
    await expect(libraryItem(page, "plugin:obs:rec")).toBeVisible();
    await settle(page);
    expect(mock.saves).toHaveLength(0);

    await row(page, "edit").click();
    await page.locator('[data-action-id="plugin:gone:old"] [data-testid="action-remove"]').click();
    await settle(page);
    expect(mock.saves).toHaveLength(1);
    expect(mock.last().groups[0].actions).toEqual(["copy", "paste", "undo"]);
  });

  test("ASCII effect switch: on by default, turning it off saves ascii:false and reaches the preview", async ({ page }) => {
    const mock = await openEditor(page);
    const sw = page.getByTestId("ascii-toggle");
    await expect(sw).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("liquid-toggle")).toHaveAttribute("aria-checked", "true");
    const frame = page.frame({ url: /ring\/ring\.html/ })!;
    const asciiChars = () => frame.evaluate(() => Array.from(document.querySelectorAll(".asc")).reduce((n, e) => n + (e.textContent || "").trim().length, 0));
    await expect.poll(asciiChars).toBeGreaterThan(0);

    await sw.click();
    await expect(sw).toHaveAttribute("aria-checked", "false");
    await settle(page);
    expect(mock.saves).toHaveLength(1);
    expect(mock.last()).toMatchObject({ ascii: false, liquid: true });
    await expect.poll(asciiChars).toBe(0);

    await sw.click();
    await settle(page);
    expect(mock.last()).toMatchObject({ ascii: true });
    await expect.poll(asciiChars).toBeGreaterThan(0);
  });

  test("add group produces exactly one debounced save with the new group", async ({ page }) => {
    const mock = await openEditor(page);
    await page.getByTestId("add-group").click();
    await expect(rows(page)).toHaveCount(7);
    expect(mock.saves).toHaveLength(0);
    await expect(page.getByTestId("group-rename-input")).toBeFocused();
    await page.keyboard.press("Escape");
    await settle(page);
    expect(mock.saves).toHaveLength(1);
    const g = mock.last().groups;
    expect(g).toHaveLength(7);
    expect(g[6]).toMatchObject({ name: "Novo grupo", actions: [] });
    expect(Object.keys(mock.last()).sort()).toEqual(["accent", "ascii", "groups", "liquid", "size", "speed", "theme"]);
    await expect(page.getByTestId("group-counter")).toHaveText("7/8");
  });

  test("typing a name survives the echo of every intermediate save", async ({ page }) => {
    const mock = await openEditor(page, { echo: true });
    await row(page, "nav").click();
    const input = page.getByTestId("group-name-input");
    await input.click();
    await input.press("Control+A");
    await input.pressSequentially("Abc", { delay: 230 });
    await settle(page);
    await expect(input).toHaveValue("Abc");
    await expect(row(page, "nav").getByTestId("group-name")).toHaveText("Abc");
    expect(mock.saves.length).toBeGreaterThanOrEqual(2);
    expect(mock.last().groups[1].name).toBe("Abc");
    await page.waitForTimeout(400);
    await expect(input).toHaveValue("Abc");

    await input.blur();
    await page.getByTestId("undo").click();
    await expect(row(page, "nav").getByTestId("group-name")).toHaveText("Navegação");
  });

  test("inline rename: F2, Enter commits, Escape cancels", async ({ page }) => {
    const mock = await openEditor(page);
    await row(page, "win").click();
    await row(page, "win").press("F2");
    const input = page.getByTestId("group-rename-input");
    await input.fill("Windows");
    await input.press("Escape");
    await expect(row(page, "win").getByTestId("group-name")).toHaveText("Janelas");
    await row(page, "win").dblclick();
    await page.getByTestId("group-rename-input").fill("Windows");
    await page.getByTestId("group-rename-input").press("Enter");
    await expect(row(page, "win").getByTestId("group-name")).toHaveText("Windows");
    await settle(page);
    expect(mock.saves).toHaveLength(1);
    expect(mock.last().groups[2].name).toBe("Windows");
  });

  test("library: add and remove, reuse across groups, 9th action refused", async ({ page }) => {
    const mock = await openEditor(page);

    await row(page, "nav").click();
    await search(page, "copiar");
    const copy = libraryItem(page, "copy");
    await expect(copy).toHaveAttribute("data-added", "false");
    await copy.click();
    await expect(copy).toHaveAttribute("data-added", "true");
    await settle(page);
    expect(mock.last().groups[1].actions).toEqual(["back", "forward", "refresh", "copy"]);
    expect(mock.last().groups[0].actions).toContain("copy");

    await copy.click();
    await expect(copy).toHaveAttribute("data-added", "false");
    await expect(page.getByTestId("toast")).toContainText("removida");
    await settle(page);
    expect(mock.last().groups[1].actions).toEqual(["back", "forward", "refresh"]);

    await search(page, "edicao");
    await expect(page.locator('[data-testid="library-category"][data-category="Edição"]')).toBeVisible();
    await search(page, "zzzz");
    await expect(page.getByTestId("library-empty")).toContainText("Nenhum resultado");

    await row(page, "full").click();
    await expect(page.getByTestId("action-counter")).toHaveText("8/8");
    await search(page, "copiar");
    await expect(copy).toHaveAttribute("aria-disabled", "true");
    const before = mock.saves.length;
    await copy.click({ force: true });
    await settle(page);
    expect(mock.saves.length).toBe(before);
    expect(await groupActions(page)).toHaveLength(8);
  });

  test("reorder groups with the keyboard", async ({ page }) => {
    const mock = await openEditor(page);
    await row(page, "edit").click();
    await row(page, "edit").press("ArrowDown");
    await expect(row(page, "nav")).toHaveAttribute("data-selected", "true");
    await expect(row(page, "nav")).toBeFocused();
    await page.keyboard.press("Alt+ArrowDown");
    expect(await rowOrder(page)).toEqual(["edit", "win", "nav", "media", "full", "empty"]);
    await expect(row(page, "nav")).toBeFocused();
    await page.keyboard.press("Alt+ArrowUp");
    await page.keyboard.press("Alt+ArrowUp");
    expect(await rowOrder(page)).toEqual(["nav", "edit", "win", "media", "full", "empty"]);
    await settle(page);
    expect(mock.last().groups.map((g) => g.id)).toEqual(["nav", "edit", "win", "media", "full", "empty"]);
  });

  test("delete a group, then undo restores it (toast and Ctrl+Z)", async ({ page }) => {
    const mock = await openEditor(page);
    await row(page, "nav").click();
    await row(page, "nav").press("Delete");
    await expect(rows(page)).toHaveCount(5);
    const toast = page.getByTestId("toast");
    await expect(toast).toContainText("Grupo “Navegação” excluído");
    await toast.getByRole("button", { name: "Desfazer" }).click();
    expect(await rowOrder(page)).toEqual(["edit", "nav", "win", "media", "full", "empty"]);
    await expect(row(page, "nav")).toHaveAttribute("data-selected", "true");
    await settle(page);
    expect(mock.last()).toEqual({ ...FIXTURE, ascii: true });

    await row(page, "win").click();
    await row(page, "win").press("Delete");
    await expect(rows(page)).toHaveCount(5);
    await page.keyboard.press("Control+z");
    await expect(rows(page)).toHaveCount(6);
    await page.keyboard.press("Control+Shift+z");
    await expect(rows(page)).toHaveCount(5);
    await page.keyboard.press("Control+z");
    await settle(page);
    expect(mock.last()).toEqual({ ...FIXTURE, ascii: true });
  });

  test("an external config replaces the draft and resets history", async ({ page }) => {
    const mock = await openEditor(page, { echo: false });
    await row(page, "nav").click();
    await row(page, "nav").press("Delete");
    await settle(page);
    expect(mock.saves).toHaveLength(1);
    await expect(page.getByTestId("undo")).toHaveAttribute("aria-disabled", "false");
    const external = { ...FIXTURE, groups: FIXTURE.groups.slice(2, 4) };
    mock.push(external);
    await expect(rows(page)).toHaveCount(2);
    await expect(page.getByTestId("undo")).toHaveAttribute("aria-disabled", "true");
    await expect(row(page, "win")).toHaveAttribute("data-selected", "true");
    await settle(page);
    expect(mock.saves).toHaveLength(1);
  });

  test("ring messages: select, add-action, reorder, move, remove, undo", async ({ page }) => {
    const mock = await openEditor(page);

    await ringMessage(page, { type: "select", groupId: "media", actionId: "volmute" });
    await expect(row(page, "media")).toHaveAttribute("data-selected", "true");
    await expect(page.getByTestId("selected-name")).toHaveText("Mídia");
    await expect(page.locator('[data-testid="group-action"][data-action-id="volmute"]')).toHaveAttribute(
      "data-highlight",
      "true",
    );
    await ringMessage(page, { type: "select", groupId: "does-not-exist", actionId: null });
    await expect(row(page, "media")).toHaveAttribute("data-selected", "true");
    await settle(page);
    expect(mock.saves).toHaveLength(0);

    await ringMessage(page, { type: "add-action", groupId: "nav", x: 300, y: 200 });
    const picker = page.getByTestId("action-picker");
    await expect(picker).toBeVisible();
    await expect(page.getByTestId("picker-search")).toBeFocused();
    await expect(page.getByTestId("picker-title")).toContainText("Navegação");
    const preview = page.getByTestId("ring-preview");
    const scale = Number(await preview.getAttribute("data-scale"));
    const frameBox = (await page.locator("iframe").boundingBox())!;
    const pickerBox = (await picker.boundingBox())!;
    expect(Math.abs(pickerBox.x - (frameBox.x + 300 * scale))).toBeLessThan(40);
    expect(Math.abs(pickerBox.y - (frameBox.y + 200 * scale))).toBeLessThan(40);
    await page.keyboard.type("mudo");
    await page.keyboard.press("Enter");
    await expect(picker).toBeHidden();
    await expect(row(page, "nav")).toHaveAttribute("data-selected", "true");
    expect(await groupActions(page)).toEqual(["back", "forward", "refresh", "volmute"]);

    await ringMessage(page, { type: "add-action", groupId: "nav", x: 300, y: 200 });
    await expect(picker).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Escape");
    await expect(picker).toBeHidden();
    await ringMessage(page, { type: "add-action", groupId: "full", x: 300, y: 200 });
    await expect(page.getByTestId("toast")).toContainText("já tem 8 ações");
    await expect(picker).toBeHidden();
    await expect(row(page, "full")).toHaveAttribute("data-selected", "true");
    await ringMessage(page, { type: "select", groupId: "nav", actionId: null });

    await ringMessage(page, { type: "reorder-groups", ids: ["nav", "edit"] });
    expect(await rowOrder(page)).toEqual(["edit", "nav", "win", "media", "full", "empty"]);
    await ringMessage(page, { type: "reorder-groups", ids: ["win", "edit", "nav", "media", "full", "empty"] });
    await expect.poll(() => rowOrder(page)).toEqual(["win", "edit", "nav", "media", "full", "empty"]);

    await ringMessage(page, { type: "reorder-actions", groupId: "nav", actions: ["volmute", "back", "forward", "refresh"] });
    await expect.poll(() => groupActions(page)).toEqual(["volmute", "back", "forward", "refresh"]);

    await ringMessage(page, { type: "move-action", fromGroupId: "nav", toGroupId: "win", actionId: "back" });
    await expect.poll(() => groupActions(page)).toEqual(["volmute", "forward", "refresh"]);
    await ringMessage(page, { type: "move-action", fromGroupId: "nav", toGroupId: "full", actionId: "forward" });
    await expect(page.getByTestId("toast")).toContainText("já tem 8 ações");
    await ringMessage(page, { type: "move-action", fromGroupId: "nav", toGroupId: "media", actionId: "volmute" });
    await expect(page.getByTestId("toast")).toContainText("já está em");
    expect(await groupActions(page)).toEqual(["volmute", "forward", "refresh"]);

    await ringMessage(page, { type: "remove-action", groupId: "nav", actionId: "refresh" });
    await expect.poll(() => groupActions(page)).toEqual(["volmute", "forward"]);
    await expect(page.getByTestId("toast")).toContainText("Desfazer");

    await settle(page);
    const saved = mock.last().groups;
    expect(saved.map((g) => g.id)).toEqual(["win", "edit", "nav", "media", "full", "empty"]);
    expect(saved[0].actions).toEqual(["minimize", "maximize", "close", "back"]);
    expect(saved[2].actions).toEqual(["volmute", "forward"]);
    expect(saved[4].actions).toHaveLength(8);

    await ringMessage(page, { type: "undo" });
    await expect.poll(() => groupActions(page)).toEqual(["volmute", "forward", "refresh"]);
    await ringMessage(page, { type: "redo" });
    await expect.poll(() => groupActions(page)).toEqual(["volmute", "forward"]);

    await ringMessage(page, { type: "remove-group", groupId: "empty" });
    await expect(rows(page)).toHaveCount(5);
    await expect(page.getByTestId("toast")).toContainText("Grupo “Rascunho” excluído");

    await page.evaluate(() => window.postMessage({ source: "orbit-ring", type: "remove-group", groupId: "win" }, "*"));
    await page.waitForTimeout(200);
    await expect(rows(page)).toHaveCount(5);
  });

  test("ring context menus: group and action", async ({ page }) => {
    const mock = await openEditor(page);
    const menu = page.getByTestId("context-menu");

    await ringMessage(page, { type: "context", groupId: "win", actionId: null, x: 200, y: 300 });
    await expect(menu).toBeVisible();
    for (const label of ["Renomear", "Trocar ícone", "Duplicar", "Mover para a esquerda", "Mover para a direita", "Excluir"]) {
      await expect(menu.getByRole("menuitem", { name: label })).toBeVisible();
    }
    await menu.getByRole("menuitem", { name: "Trocar ícone" }).click();
    await menu.getByRole("menuitemradio", { name: "Mídia" }).click();
    await expect(menu).toBeHidden();
    await settle(page);
    expect(mock.last().groups[2].icon).toBe("music");

    await ringMessage(page, { type: "context", groupId: "win", actionId: null, x: 200, y: 300 });
    await menu.getByRole("menuitem", { name: "Duplicar" }).click();
    await expect(rows(page)).toHaveCount(7);
    await expect(rows(page).nth(3).getByTestId("group-name")).toHaveText("Janelas (cópia)");

    await ringMessage(page, { type: "context", groupId: "edit", actionId: "paste", x: 260, y: 260 });
    await expect(menu.getByRole("menuitem", { name: "Remover" })).toBeVisible();
    await menu.getByRole("menuitem", { name: "Trocar por…" }).click();
    await expect(page.getByTestId("picker-title")).toContainText("Trocar “Colar” por…");
    await page.keyboard.type("recortar");
    await page.keyboard.press("Enter");
    expect(await groupActions(page)).toEqual(["copy", "cut", "undo", "plugin:gone:old"]);

    await ringMessage(page, { type: "context", groupId: "edit", actionId: "cut", x: 260, y: 260 });
    await expect(menu.getByRole("menuitem", { name: "Cheio" })).toHaveAttribute("aria-disabled", "true");
    await menu.getByRole("menuitem", { name: "Navegação" }).click();
    await settle(page);
    expect(mock.last().groups[0].actions).toEqual(["copy", "undo", "plugin:gone:old"]);
    expect(mock.last().groups[1].actions).toEqual(["back", "forward", "refresh", "cut"]);

    await ringMessage(page, { type: "context", groupId: "edit", actionId: "copy", x: 260, y: 260 });
    await expect(menu).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
  });

  test("groups beyond the 8th are kept but marked hidden", async ({ page }) => {
    const many: Ring = {
      ...FIXTURE,
      groups: Array.from({ length: 8 }, (_, i) => ({ id: `g${i}`, name: `Grupo ${i + 1}`, icon: "edit", actions: ["copy"] })),
    };
    const mock = await openEditor(page, { ring: many });
    await expect(page.getByTestId("group-counter")).toHaveText("8/8");
    await expect(page.getByTestId("badge-hidden")).toHaveCount(0);
    await page.getByTestId("add-group").click();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("group-counter")).toHaveText("9/8");
    await expect(rows(page).nth(8).getByTestId("badge-hidden")).toHaveText("oculto");
    await expect(page.getByTestId("toast")).toContainText("oculto");
    await settle(page);
    expect(mock.last().groups).toHaveLength(9);
  });
});
