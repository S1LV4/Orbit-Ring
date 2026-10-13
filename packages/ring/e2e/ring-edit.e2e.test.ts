import { test, expect, Page, Frame } from "@playwright/test";
import * as fs from "fs";
import * as http from "http";
import * as path from "path";
import type { AddressInfo } from "net";

const SRC = path.resolve(__dirname, "..", "src");
const OX = 40, OY = 30, SIZE = 640;
const C = SIZE / 2;
const R1 = 75, R2 = 150, STEP = 28;
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

const PARENT = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;background:#1a1a1e;height:100%}
iframe{position:absolute;left:${OX}px;top:${OY}px;width:${SIZE}px;height:${SIZE}px;border:0}
</style></head><body>
<script>
  window.msgs = [];
  addEventListener("message", e => { if (e.data && e.data.source === "orbit-ring") window.msgs.push(e.data); });
  window.send = cfg => document.querySelector("iframe").contentWindow.postMessage({ target: "orbit-ring", type: "config", cfg }, "*");
</script>
<iframe src="/ring.html"></iframe>
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
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
test.afterAll(async () => { await new Promise(r => server.close(r)); });

type Msg = Record<string, any>;
const GROUPS = [
  { id: "edit", name: "Edição", icon: "edit", actions: ["copy", "paste", "undo"] },
  { id: "nav", name: "Navegação", icon: "compass", actions: ["back", "forward", "refresh"] },
  { id: "win", name: "Janelas", icon: "layers", actions: ["minimize", "maximize", "close"] },
  { id: "media", name: "Mídia", icon: "music", actions: ["playpause", "volmute"] },
  { id: "cap", name: "Captura", icon: "aperture", actions: ["screenshot"] },
  { id: "sys", name: "Sistema", icon: "settings", actions: ["save", "explorer", "find"] },
];
const gAng = (i: number, N = GROUPS.length) => -90 + (i * 360) / N;
const aAng = (gi: number, j: number, n: number, N = GROUPS.length) => gAng(gi, N) + (j - (n - 1) / 2) * STEP;
const local = (ang: number, r: number) => ({ x: C + Math.cos((ang * Math.PI) / 180) * r, y: C + Math.sin((ang * Math.PI) / 180) * r });
const at = (ang: number, r: number) => { const p = local(ang, r); return { x: OX + p.x, y: OY + p.y }; };

interface Ctx { page: Page; ring: Frame; errors: string[] }
async function boot(page: Page, cfg: Msg | null = { edit: true, groups: GROUPS }): Promise<Ctx> {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.setViewportSize({ width: 760, height: 720 });
  await page.goto(base + "/parent.html");
  await expect.poll(() => page.evaluate(() => (window as any).msgs.some((m: Msg) => m.type === "ready"))).toBe(true);
  const ring = page.frames().find(f => /ring\.html/.test(f.url()))!;
  await ring.waitForSelector("#stage .btn.grp");
  if (cfg) { await send(page, cfg); await page.waitForTimeout(450); }
  return { page, ring, errors };
}
const send = (page: Page, cfg: Msg) => page.evaluate(c => (window as any).send(c), cfg);
const msgs = async (page: Page, type?: string): Promise<Msg[]> => {
  await page.waitForTimeout(120);
  return page.evaluate(t => (window as any).msgs.filter((m: Msg) => (t ? m.type === t : m.type !== "ready")), type);
};
const clear = async (page: Page) => { await page.waitForTimeout(120); await page.evaluate(() => { (window as any).msgs.length = 0; }); };
const state = (ring: Frame) => ring.evaluate(() => {
  const w = window as any;
  return { active: w.activeGroup as string | null, hover: w.hover as string | null, ids: w.groups.map((g: any) => g.id) as string[] };
});
const scale = (ring: Frame, key: string) => ring.evaluate(k => ((window as any).sim.nodes[k] || { s: -1 }).s as number, key);
async function hover(page: Page, ang: number, r: number, wait = 350) {
  const p = at(ang, r); await page.mouse.move(p.x, p.y); await page.waitForTimeout(wait);
}
async function openGroup(page: Page, gi: number) {
  await hover(page, gAng(gi), 10, 60);
  await hover(page, gAng(gi), R1, 450);
}
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, hold?: () => Promise<void>) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + (to.x - from.x) * 0.15, from.y + (to.y - from.y) * 0.15, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.waitForTimeout(250);
  if (hold) await hold();
  await page.mouse.up();
  await page.waitForTimeout(150);
}

test.describe("edit mode protocol", () => {
  test("posts ready, and config{edit:true} switches edit mode on", async ({ page }) => {
    const { ring } = await boot(page, null);
    expect(await ring.evaluate(() => document.documentElement.classList.contains("edit"))).toBe(false);
    expect(await ring.locator('[data-key$=":+"]').count()).toBe(0);
    await send(page, { edit: true, groups: GROUPS });
    await expect.poll(() => ring.evaluate(() => document.documentElement.classList.contains("edit"))).toBe(true);
    expect(await ring.locator('[data-key$=":+"]').count()).toBe(GROUPS.length);
    await send(page, { edit: false });
    await expect.poll(() => ring.evaluate(() => document.documentElement.classList.contains("edit"))).toBe(false);
    expect(await ring.locator('[data-key$=":+"]').count()).toBe(0);
  });

  test("ignores messages without the orbit-ring target", async ({ page }) => {
    const { ring } = await boot(page, null);
    await page.evaluate(() => document.querySelector("iframe")!.contentWindow!.postMessage({ type: "config", cfg: { edit: true } }, "*"));
    await page.waitForTimeout(150);
    expect(await ring.evaluate(() => document.documentElement.classList.contains("edit"))).toBe(false);
  });

  test("click on a group, an action and the hub emits select", async ({ page }) => {
    const { page: p, ring } = await boot(page);
    await openGroup(p, 0);
    await p.mouse.down(); await p.mouse.up();
    expect(await msgs(p, "select")).toEqual([{ source: "orbit-ring", type: "select", groupId: "edit", actionId: null }]);

    await clear(p);
    await hover(p, aAng(0, 1, 3), R2, 450);
    expect((await state(ring)).hover).toBe("edit:paste");
    await p.mouse.down(); await p.mouse.up();
    expect(await msgs(p, "select")).toEqual([{ source: "orbit-ring", type: "select", groupId: "edit", actionId: "paste" }]);

    await clear(p);
    await hover(p, 0, 0, 200);
    await p.mouse.down(); await p.mouse.up();
    expect(await msgs(p, "select")).toEqual([{ source: "orbit-ring", type: "select", groupId: null, actionId: null }]);
    expect(await ring.evaluate(() => (window as any).isOpen)).toBe(true);
  });

  test("never executes an action nor shows the toast", async ({ page }) => {
    const { page: p, ring } = await boot(page);
    await openGroup(p, 0);
    await hover(p, aAng(0, 0, 3), R2, 450);
    await p.mouse.down(); await p.mouse.up();
    await ring.evaluate(() => { const w = window as any; w.fire("edit:copy"); w.release(); });
    await p.keyboard.press("Enter");
    await p.waitForTimeout(100);
    const toast = await ring.evaluate(() => { const t = document.querySelector(".toast")!; return { cls: t.className, txt: t.textContent }; });
    expect(toast).toEqual({ cls: "toast", txt: "" });
    expect(await ring.evaluate(() => (window as any).isOpen)).toBe(true);
    const before = await ring.evaluate(() => document.documentElement.className);
    await p.keyboard.press("t");
    expect(await ring.evaluate(() => document.documentElement.className)).toBe(before);
  });

  test('"+" slot shows only for the active group and emits add-action', async ({ page }) => {
    const { page: p, ring } = await boot(page);
    await openGroup(p, 0);
    expect(await scale(ring, "edit:+")).toBeGreaterThan(0.9);
    expect(await scale(ring, "nav:+")).toBeLessThan(0.1);
    const slot = local(aAng(0, 3, 3), R2);
    const box = await ring.locator('[data-key="edit:+"]').boundingBox();
    expect(Math.abs(box!.x + box!.width / 2 - (OX + slot.x))).toBeLessThan(3);
    expect(Math.abs(box!.y + box!.height / 2 - (OY + slot.y))).toBeLessThan(3);
    const copy = await ring.evaluate(() => { const n = (window as any).sim.nodes["edit:copy"]; return { x: n.x, y: n.y }; });
    const want = local(aAng(0, 0, 3), R2);
    expect(Math.abs(copy.x - (want.x - C))).toBeLessThan(2);
    expect(Math.abs(copy.y - (want.y - C))).toBeLessThan(2);

    await hover(p, aAng(0, 3, 3), R2, 400);
    expect((await state(ring)).hover).toBe("edit:+");
    expect(await ring.locator(".balloon").textContent()).toBe("Adicionar ação");
    expect(await ring.locator('[data-key="edit:+"]').getAttribute("class")).toContain("hot");
    await p.mouse.down(); await p.mouse.up();
    const m = await msgs(p);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ source: "orbit-ring", type: "add-action", groupId: "edit" });
    expect(Math.abs(m[0].x - slot.x)).toBeLessThan(4);
    expect(Math.abs(m[0].y - slot.y)).toBeLessThan(4);
  });

  test("a full group (8 actions) has no + slot", async ({ page }) => {
    const full = { id: "full", name: "Cheio", icon: "edit", actions: ["copy", "paste", "undo", "redo", "cut", "save", "find", "print"] };
    const { ring } = await boot(page, { edit: true, groups: [full, GROUPS[1]] });
    expect(await ring.locator('[data-key="full:+"]').count()).toBe(0);
    expect(await ring.locator('[data-key="nav:+"]').count()).toBe(1);
  });

  test("right click emits context with client coordinates", async ({ page }) => {
    const { page: p } = await boot(page);
    await openGroup(p, 0);
    await p.mouse.click(at(gAng(0), R1).x, at(gAng(0), R1).y, { button: "right" });
    await hover(p, aAng(0, 2, 3), R2, 450);
    await p.mouse.click(at(aAng(0, 2, 3), R2).x, at(aAng(0, 2, 3), R2).y, { button: "right" });
    const m = await msgs(p);
    expect(m.map(x => x.type)).toEqual(["context", "context"]);
    expect(m[0]).toMatchObject({ groupId: "edit", actionId: null });
    expect(Math.abs(m[0].x - local(gAng(0), R1).x)).toBeLessThan(2);
    expect(Math.abs(m[0].y - local(gAng(0), R1).y)).toBeLessThan(2);
    expect(m[1]).toMatchObject({ groupId: "edit", actionId: "undo" });
    expect(Math.abs(m[1].x - local(aAng(0, 2, 3), R2).x)).toBeLessThan(2);
  });

  test("dragging group 0 to group 2's angle emits reorder-groups", async ({ page }) => {
    const { page: p, ring } = await boot(page);
    await openGroup(p, 0);
    await drag(p, at(gAng(0), R1), at(gAng(2), R1), async () => {
      expect(await ring.locator(".btn.hub").getAttribute("class")).toContain("trash");
      expect(await ring.locator('[data-key="edit"]').getAttribute("class")).toContain("dragging");
      expect((await state(ring)).ids).toEqual(["nav", "win", "edit", "media", "cap", "sys"]);
    });
    expect(await msgs(p)).toEqual([{ source: "orbit-ring", type: "reorder-groups", ids: ["nav", "win", "edit", "media", "cap", "sys"] }]);
    expect(await ring.locator(".btn.hub").getAttribute("class")).not.toContain("trash");
  });

  test("a press that moves less than 6 px is a click, not a drag", async ({ page }) => {
    const { page: p } = await boot(page);
    await openGroup(p, 0);
    const g = at(gAng(0), R1);
    await p.mouse.down(); await p.mouse.move(g.x + 3, g.y + 2); await p.mouse.up();
    expect((await msgs(p)).map(m => m.type)).toEqual(["select"]);
  });

  test("dragging an action within its arc emits reorder-actions", async ({ page }) => {
    const { page: p, ring } = await boot(page);
    await openGroup(p, 0);
    await hover(p, aAng(0, 0, 3), R2, 400);
    await drag(p, at(aAng(0, 0, 3), R2), at(aAng(0, 2, 3), R2), async () => {
      expect((await state(ring)).active).toBe("edit");
    });
    expect(await msgs(p)).toEqual([{ source: "orbit-ring", type: "reorder-actions", groupId: "edit", actions: ["paste", "undo", "copy"] }]);
  });

  test("dragging an action onto another group emits move-action", async ({ page }) => {
    const { page: p, ring } = await boot(page);
    await openGroup(p, 0);
    await hover(p, aAng(0, 0, 3), R2, 400);
    await drag(p, at(aAng(0, 0, 3), R2), at(gAng(1), R1), async () => {
      expect(await ring.locator('[data-key="nav"]').getAttribute("class")).toContain("drop-target");
    });
    expect(await msgs(p)).toEqual([{ source: "orbit-ring", type: "move-action", fromGroupId: "edit", toGroupId: "nav", actionId: "copy" }]);
    expect(await ring.evaluate(() => (window as any).groups[0].actions)).toEqual(["copy", "paste", "undo"]);
  });

  test("dropping on the hub emits remove-action / remove-group", async ({ page }) => {
    const { page: p, ring } = await boot(page);
    await openGroup(p, 0);
    await hover(p, aAng(0, 1, 3), R2, 400);
    await drag(p, at(aAng(0, 1, 3), R2), at(0, 0), async () => {
      const cls = await ring.locator(".btn.hub").getAttribute("class");
      expect(cls).toContain("trash"); expect(cls).toContain("hot");
    });
    expect(await msgs(p)).toEqual([{ source: "orbit-ring", type: "remove-action", groupId: "edit", actionId: "paste" }]);

    await clear(p);
    await openGroup(p, 3);
    await drag(p, at(gAng(3), R1), at(0, 0));
    expect(await msgs(p)).toEqual([{ source: "orbit-ring", type: "remove-group", groupId: "media" }]);
    expect((await state(ring)).ids).toEqual(GROUPS.map(g => g.id));
  });

  test("Escape cancels a drag: order restored, no message", async ({ page }) => {
    const { page: p, ring } = await boot(page);
    await openGroup(p, 0);
    await drag(p, at(gAng(0), R1), at(gAng(3), R1), async () => {
      expect((await state(ring)).ids[3]).toBe("edit");
      await p.keyboard.press("Escape");
      expect((await state(ring)).ids).toEqual(GROUPS.map(g => g.id));
    });
    expect(await msgs(p)).toEqual([]);
  });

  test("a config with new groups mid-drag cancels the drag without breaking", async ({ page }) => {
    const { page: p, ring, errors } = await boot(page);
    await openGroup(p, 0);
    await drag(p, at(gAng(0), R1), at(gAng(3), R1), async () => {
      await send(p, { edit: true, groups: GROUPS.slice(1) });
      await p.waitForTimeout(150);
      expect(await ring.locator(".btn.hub").getAttribute("class")).not.toContain("trash");
    });
    expect(await msgs(p)).toEqual([]);
    expect((await state(ring)).ids).toEqual(GROUPS.slice(1).map(g => g.id));
    expect(errors).toEqual([]);
  });

  test("keyboard: undo / redo / delete / escape", async ({ page }) => {
    const { page: p } = await boot(page);
    await openGroup(p, 0);
    await p.mouse.down(); await p.mouse.up();
    await clear(p);
    await p.keyboard.press("Control+z");
    await p.keyboard.press("Control+y");
    await p.keyboard.press("Control+Shift+z");
    await p.keyboard.press("Escape");
    await hover(p, aAng(0, 2, 3), R2, 400);
    await p.keyboard.press("Delete");
    await hover(p, gAng(0), R1, 300);
    await p.keyboard.press("Backspace");
    expect(await msgs(p)).toEqual([
      { source: "orbit-ring", type: "undo" },
      { source: "orbit-ring", type: "redo" },
      { source: "orbit-ring", type: "redo" },
      { source: "orbit-ring", type: "select", groupId: null, actionId: null },
      { source: "orbit-ring", type: "remove-action", groupId: "edit", actionId: "undo" },
      { source: "orbit-ring", type: "remove-group", groupId: "edit" },
    ]);
  });

  test("empty groups are kept while editing (and dropped otherwise)", async ({ page }) => {
    const groups = [...GROUPS.slice(0, 3), { id: "novo", name: "Novo", icon: "brain", actions: [] }];
    const { page: p, ring } = await boot(page, { edit: true, groups, selected: "novo" });
    expect((await state(ring)).ids).toEqual(["edit", "nav", "win", "novo"]);
    expect(await scale(ring, "novo")).toBeGreaterThan(0.8);
    expect((await state(ring)).active).toBe("novo");
    expect(await scale(ring, "novo:+")).toBeGreaterThan(0.9);
    const want = { x: Math.cos((gAng(3, 4) * Math.PI) / 180) * R2, y: Math.sin((gAng(3, 4) * Math.PI) / 180) * R2 };
    const n = await ring.evaluate(() => { const m = (window as any).sim.nodes["novo:+"]; return { x: m.x, y: m.y }; });
    expect(Math.abs(n.x - want.x)).toBeLessThan(2);
    expect(Math.abs(n.y - want.y)).toBeLessThan(2);

    await send(p, { edit: false, groups });
    await p.waitForTimeout(100);
    expect((await state(ring)).ids).toEqual(["edit", "nav", "win"]);
  });

  test("selected pins a group: .sel class, shown while the pointer is away", async ({ page }) => {
    const { page: p, ring } = await boot(page, { edit: true, groups: GROUPS, selected: "win" });
    expect(await ring.locator('[data-key="win"]').getAttribute("class")).toContain("sel");
    expect(await ring.locator(".btn.sel").count()).toBe(1);
    expect((await state(ring)).active).toBe("win");
    expect(await scale(ring, "win:minimize")).toBeGreaterThan(0.9);

    await openGroup(p, 0);
    expect((await state(ring)).active).toBe("edit");
    await p.mouse.move(OX + SIZE + 30, OY + 300, { steps: 6 });
    await p.waitForTimeout(300);
    expect((await state(ring)).active).toBe("win");

    await send(p, { selected: "media" });
    await p.waitForTimeout(200);
    expect((await state(ring)).active).toBe("media");
    await send(p, { selected: null });
    await p.waitForTimeout(200);
    expect((await state(ring)).active).toBe(null);
    expect(await ring.locator(".btn.sel").count()).toBe(0);
  });

  test("groups that drop the active / hovered node do not throw", async ({ page }) => {
    for (const edit of [true, false]) {
      const { page: p, ring, errors } = await boot(page, { edit, groups: GROUPS });
      await openGroup(p, 0);
      await hover(p, aAng(0, 1, 3), R2, 400);
      expect((await state(ring)).hover).toBe("edit:paste");
      await send(p, { groups: GROUPS.slice(1) });
      await p.waitForTimeout(300);
      await send(p, { groups: [{ ...GROUPS[0], actions: ["copy"] }, ...GROUPS.slice(1)] });
      await p.waitForTimeout(300);
      await ring.evaluate(() => { (window as any).step(); (window as any).render(); });
      expect(errors).toEqual([]);
      expect(await ring.locator(".btn.grp").count()).toBe(GROUPS.length);
    }
  });

  test("edit off: no protocol chatter, actions fire normally", async ({ page }) => {
    const { page: p, ring } = await boot(page, { groups: GROUPS });
    await openGroup(p, 0);
    await hover(p, aAng(0, 1, 3), R2, 400);
    await p.mouse.down(); await p.mouse.up();
    await p.mouse.click(at(gAng(0), R1).x, at(gAng(0), R1).y, { button: "right" });
    expect(await msgs(p)).toEqual([]);
    expect(await ring.locator(".toast").textContent()).toBe("Colar");
  });
});

test.describe("plugin display state", () => {
  const SVG_FULL = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="5"/></svg>';
  const groups = [
    { id: "ai", name: "IA", icon: "brain", actions: ["plugin:claude:session", "plugin:claude:week"] },
    { id: "edit", name: "Edição", icon: "edit", actions: ["copy", "paste"] },
  ];
  const pluginActions = [
    { id: "plugin:claude:session", name: "Sessão", icon: SVG_FULL },
    { id: "plugin:claude:week", name: "Semana", icon: '<path d="M4 4h16v16H4z"/>', iconActive: SVG_FULL },
  ];

  test("value / text / label / status render, states may arrive before the actions", async ({ page }) => {
    const { page: p, ring } = await boot(page, null);
    await send(p, { pluginStates: { claude: {
      session: { value: 39, text: "39%", status: "green", label: "Claude · Sessão 39% · Semana 6%" },
      week: { value: 96, status: "red", active: true },
    } } });
    await send(p, { pluginActions, groups });
    await p.waitForTimeout(300);

    const s = ring.locator('[data-key="ai:plugin:claude:session"]');
    expect(await s.locator(".ptxt").textContent()).toBe("39%");
    expect(await s.locator(".ptxt").getAttribute("class")).toContain("st-green");
    expect(await s.locator("svg").count()).toBe(1);
    expect(await s.locator("svg.gauge circle.arc").getAttribute("stroke-dasharray")).toBe("39 100");
    expect(await s.locator("svg.gauge circle.arc").getAttribute("pathLength")).toBe("100");
    expect(await s.locator("svg.gauge circle.trk").count()).toBe(1);

    const w = ring.locator('[data-key="ai:plugin:claude:week"]');
    expect(await w.locator(".ptxt").count()).toBe(0);
    expect(await w.locator("svg.gauge.st-red circle.arc").getAttribute("stroke-dasharray")).toBe("96 100");
    expect(await w.locator("svg.gauge circle.arc").evaluate(el => getComputedStyle(el).stroke)).toBe("rgb(240, 68, 56)");
    expect(await w.locator("svg:not(.gauge)").innerHTML()).toBe('<circle cx="12" cy="12" r="5"></circle>');

    await openGroup(p, 0);
    await hover(p, -90 - STEP / 2, R2, 450);
    expect(await ring.evaluate(() => (window as any).hover)).toBe("ai:plugin:claude:session");
    expect(await ring.locator(".balloon").textContent()).toBe("Claude · Sessão 39% · Semana 6%");
    await hover(p, -90 + STEP / 2, R2, 450);
    expect(await ring.locator(".balloon").textContent()).toBe("Semana");

    await send(p, { pluginStates: { claude: { session: { value: 80, text: "80%", status: "amber" }, week: false } } });
    await p.waitForTimeout(100);
    expect(await s.locator("svg.gauge.st-amber circle.arc").getAttribute("stroke-dasharray")).toBe("80 100");
    expect(await s.locator(".ptxt").textContent()).toBe("80%");
    expect(await w.locator("svg.gauge").count()).toBe(0);
    expect(await w.locator("svg").innerHTML()).toBe('<path d="M4 4h16v16H4z"></path>');
  });

  test("full <svg> plugin icons are normalised to inner markup", async ({ page }) => {
    const { page: p, ring } = await boot(page, { pluginActions, groups });
    const cat = await ring.evaluate(() => (window as any).CAT["plugin:claude:session"].s);
    expect(cat).toBe('<circle cx="12" cy="12" r="5"/>');
    const btn = ring.locator('[data-key="ai:plugin:claude:session"]');
    expect(await btn.locator("svg svg").count()).toBe(0);
    expect(await btn.locator("svg > circle").count()).toBe(1);
    await send(p, { pluginActions: [{ id: "plugin:claude:session", name: "Sessão", icon: '<rect x="4" y="4" width="16" height="16"/>' }] });
    await p.waitForTimeout(100);
    expect(await btn.locator("svg > rect").count()).toBe(1);
  });
});

test.describe("brand marks (filled icons) and keepIcon layout", () => {
  const MARK = '<path fill="currentColor" stroke="none" d="M12 2 22 22H2Z"/>';
  const MARK_SQ = "<path fill='currentColor' stroke='none' d='M12 2 22 22H2Z'/>";
  const groups = [
    { id: "ai", name: "IA", icon: "brain", actions: ["plugin:ai:gauge", "plugin:ai:plain", "plugin:ai:launch", "agent_claude", "copy"] },
    { id: "edit", name: "Edição", icon: "edit", actions: ["copy", "paste"] },
  ];
  const pluginActions = [
    { id: "plugin:ai:gauge", name: "Uso", icon: `<svg viewBox="0 0 24 24" fill="none">${MARK_SQ}</svg>`, keepIcon: true },
    { id: "plugin:ai:plain", name: "Temp", icon: '<circle cx="12" cy="12" r="5"/>' },
    { id: "plugin:ai:launch", name: "Abrir", icon: MARK, keepIcon: true },
  ];
  const geo = (btn: any) => btn.evaluate((el: Element) => {
    const b = el.getBoundingClientRect(), k = b.width / 48, cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    const rel = (sel: string) => {
      const n = el.querySelector(sel); if (!n) return null;
      const r = n.getBoundingClientRect();
      return { l: (r.left - cx) / k, r: (r.right - cx) / k, t: (r.top - cy) / k, b: (r.bottom - cy) / k, w: r.width / k, cx: (r.left + r.right) / 2 / k - cx / k, cy: (r.top + r.bottom) / 2 / k - cy / k };
    };
    return { icon: rel("svg:not(.gauge)"), text: rel(".ptxt") };
  });
  const paint = (l: any) => l.evaluate((el: Element) => { const c = getComputedStyle(el); return { fill: c.fill, stroke: c.stroke }; });

  test("a filled brand icon survives normalisation and renders filled in the button colour", async ({ page }) => {
    const { ring, errors } = await boot(page, { pluginActions, groups });
    expect(await ring.evaluate(() => (window as any).CAT["plugin:ai:gauge"].s)).toBe(MARK_SQ);
    const btn = ring.locator('[data-key="ai:plugin:ai:launch"]');
    const color = await btn.evaluate(el => getComputedStyle(el).color);
    expect(await paint(btn.locator("svg > path"))).toEqual({ fill: color, stroke: "none" });
    expect(await paint(ring.locator('[data-key="ai:plugin:ai:gauge"] svg > path'))).toEqual({ fill: color, stroke: "none" });
    const agent = ring.locator('[data-key="ai:agent_claude"] svg > path');
    expect(await agent.count()).toBe(1);
    expect(await paint(agent)).toEqual({ fill: color, stroke: "none" });
    expect(await paint(ring.locator('[data-key="ai:copy"] svg > rect'))).toEqual({ fill: "none", stroke: color });
    expect(errors).toEqual([]);
  });

  test("keepIcon + text: icon stacked above the text, inside the arc; without keepIcon text replaces the icon", async ({ page }) => {
    const { page: p, ring } = await boot(page, { pluginActions, groups });
    await send(p, { pluginStates: { ai: {
      gauge: { value: 67, text: "100%", status: "amber" },
      plain: { value: 40, text: "40%", status: "green" },
    } } });
    await openGroup(p, 0);

    const g = ring.locator('[data-key="ai:plugin:ai:gauge"]');
    expect(await g.locator(".pstk").count()).toBe(1);
    expect(await g.locator(".pstk > svg > path").count()).toBe(1);
    expect(await g.locator(".pstk > .ptxt").textContent()).toBe("100%");
    expect(await g.locator(".pstk > .ptxt").getAttribute("class")).toContain("st-amber");
    expect(await g.locator("svg.gauge.st-amber circle.arc").getAttribute("stroke-dasharray")).toBe("67 100");
    expect(await g.locator(".pstk > .ptxt").evaluate(el => getComputedStyle(el).color)).toBe("rgb(245, 165, 36)");
    expect((await paint(g.locator(".pstk > svg > path"))).fill).toBe(await g.evaluate(el => getComputedStyle(el).color));

    const { icon: ic, text: tx } = await geo(g);
    expect(ic.w).toBeGreaterThanOrEqual(13); expect(ic.w).toBeLessThanOrEqual(14);
    expect(ic.b).toBeLessThanOrEqual(tx.t + 0.5);
    expect(Math.abs(ic.cx)).toBeLessThan(0.75);
    expect(Math.abs(tx.cx)).toBeLessThan(0.75);
    expect(Math.abs((ic.t + tx.b) / 2)).toBeLessThan(2);
    const inner = (20.5 - 1.25) * (50 / 48);
    for (const r of [ic, tx]) for (const [x, y] of [[r.l, r.t], [r.r, r.t], [r.l, r.b], [r.r, r.b]]) {
      expect(Math.hypot(x, y)).toBeLessThan(inner);
    }

    const pl = ring.locator('[data-key="ai:plugin:ai:plain"]');
    expect(await pl.locator(".pstk").count()).toBe(0);
    expect(await pl.locator(".ptxt").textContent()).toBe("40%");
    expect(await pl.locator("svg:not(.gauge)").count()).toBe(0);
    expect(await pl.locator(".ptxt").evaluate(el => getComputedStyle(el).fontSize)).toBe("11px");
  });

  test("no layout change without a text state: keepIcon actions and plain actions keep the 18px icon", async ({ page }) => {
    const { page: p, ring } = await boot(page, { pluginActions, groups });
    await openGroup(p, 0);
    const size = async (key: string) => {
      const btn = ring.locator(`[data-key="${key}"]`);
      expect(await btn.locator(".pstk, .ptxt, svg.gauge").count()).toBe(0);
      expect(await btn.locator("svg").count()).toBe(1);
      const s = (await geo(btn)).icon;
      return { w: s.w, dx: s.cx, dy: s.cy };
    };
    const ref = await size("ai:copy");
    expect(ref.w).toBeCloseTo(18, 1);
    for (const key of ["ai:plugin:ai:gauge", "ai:plugin:ai:launch", "ai:agent_claude"]) {
      const s = await size(key);
      expect(s.w).toBeCloseTo(18, 1); expect(Math.abs(s.dx)).toBeLessThan(0.1); expect(Math.abs(s.dy)).toBeLessThan(0.1);
    }
    await send(p, { pluginStates: { ai: { gauge: { value: 30 }, launch: { text: "7" } } } });
    await p.waitForTimeout(100);
    const g = ring.locator('[data-key="ai:plugin:ai:gauge"]');
    expect(await g.locator(".pstk").count()).toBe(0);
    expect(await g.locator("svg.gauge").count()).toBe(1);
    expect((await geo(g)).icon.w).toBeCloseTo(18, 1);
    const l = ring.locator('[data-key="ai:plugin:ai:launch"]');
    expect(await l.locator(".pstk").count()).toBe(1);
    await send(p, { pluginActions: [{ id: "plugin:ai:launch", name: "Abrir", icon: MARK }] });
    await p.waitForTimeout(100);
    expect(await l.locator(".pstk").count()).toBe(0);
    expect(await l.locator(".ptxt").textContent()).toBe("7");
  });
});
