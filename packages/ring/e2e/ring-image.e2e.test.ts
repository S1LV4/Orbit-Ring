import { test, expect, Page } from "@playwright/test";
import * as path from "path";

const RING_HTML = `file:///${path.resolve(__dirname, "..", "src", "ring.html").replace(/\\/g, "/")}`;
const C = 320;
const ICON = "<circle cx='12' cy='12' r='9'/>";
const GROUPS = [
  { id: "games", name: "Jogos", icon: "aperture", actions: ["plugin:steam:a", "plugin:steam:b", "plugin:steam:c", "plugin:steam:plain", "copy"] },
  { id: "edit", name: "Edição", icon: "edit", actions: ["copy", "paste", "undo"] },
  { id: "nav", name: "Navegação", icon: "compass", actions: ["back", "forward"] },
];
const KEY = (aid: string) => `games:${aid}`;

type Cfg = Record<string, unknown>;
const apply = (page: Page, cfg: Cfg) => page.evaluate(c => (window as any).applyConfig(c), cfg);
const settle = (page: Page) => page.evaluate(() => { for (let i = 0; i < 90; i++) (window as any).step(); (window as any).render(); });

const picture = (page: Page, mime: string, w = 96, h = 96, color = "#c2410c") => page.evaluate(([m, pw, ph, col]) => {
  const cv = document.createElement("canvas");
  cv.width = pw as number; cv.height = ph as number;
  const g = cv.getContext("2d")!;
  g.fillStyle = col as string; g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = "#1d4ed8"; g.fillRect(0, 0, cv.width / 2, cv.height / 2);
  return cv.toDataURL(m as string, 0.9);
}, [mime, w, h, color] as const);

interface Shot {
  hasImg: boolean; src: string | null; svgIcons: number; html: string;
  imgBox: [number, number]; btnBox: [number, number]; radius: string; wrapRadius: string; overflow: string;
  objectFit: string; draggable: boolean | null; decoding: string | null; alt: string | null; complete: boolean; natural: number;
  pointerEvents: string; wrapClass: string; filter: string; text: string | null; textClass: string; scrimBg: string; textColor: string;
  gauge: { value: string | null; cls: string; r: string } | null; btnClass: string; border: string;
}
const inspect = (page: Page, key: string): Promise<Shot> => page.evaluate(k => {
  const b = document.querySelector(`[data-key="${k}"]`) as HTMLElement;
  const img = b.querySelector("img.pimg") as HTMLImageElement | null;
  const wrap = b.querySelector(".pimgw") as HTMLElement | null;
  const txt = b.querySelector(".ptxt") as HTMLElement | null;
  const gauge = b.querySelector("svg.gauge") as SVGElement | null;
  const arc = gauge && (gauge.querySelector(".arc") || gauge.querySelector(".trk"));
  return {
    hasImg: !!img, src: img ? img.getAttribute("src") : null,
    svgIcons: b.querySelectorAll("svg:not(.gauge)").length, html: b.innerHTML,
    imgBox: img ? [img.offsetWidth, img.offsetHeight] : [0, 0], btnBox: [b.offsetWidth, b.offsetHeight],
    radius: img ? getComputedStyle(img).borderRadius : "", wrapRadius: wrap ? getComputedStyle(wrap).borderRadius : "",
    overflow: wrap ? getComputedStyle(wrap).overflow : "", objectFit: img ? getComputedStyle(img).objectFit : "",
    draggable: img ? img.draggable : null, decoding: img ? img.getAttribute("decoding") : null, alt: img ? img.getAttribute("alt") : null,
    complete: !!img && img.complete, natural: img ? img.naturalWidth : 0,
    pointerEvents: img ? getComputedStyle(img).pointerEvents : "", wrapClass: wrap ? wrap.className : "",
    filter: img ? getComputedStyle(img).filter : "", text: txt ? txt.textContent : null, textClass: txt ? txt.className : "",
    scrimBg: txt ? getComputedStyle(txt).backgroundImage : "", textColor: txt ? getComputedStyle(txt).color : "",
    gauge: gauge ? { value: gauge.getAttribute("data-value"), cls: gauge.getAttribute("class") || "", r: arc ? getComputedStyle(arc).getPropertyValue("r") : "" } : null,
    btnClass: b.className, border: getComputedStyle(b).borderTopWidth,
  };
}, key);

async function openRing(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.setViewportSize({ width: 640, height: 640 });
  await page.goto(RING_HTML);
  await page.waitForSelector("#stage .btn.grp");
  return errors;
}

test.describe("plugin action images", () => {
  test("an action with a valid image renders a circular <img> with that src; no SVG icon", async ({ page }) => {
    const errors = await openRing(page);
    const [png, jpeg, webp] = [await picture(page, "image/png"), await picture(page, "image/jpeg", 60, 90), await picture(page, "image/webp", 120, 56)];
    expect(png).toMatch(/^data:image\/png;base64,/); expect(jpeg).toMatch(/^data:image\/jpeg;base64,/); expect(webp).toMatch(/^data:image\/webp;base64,/);
    await apply(page, {
      pluginActions: [
        { id: "plugin:steam:a", name: "PNG", icon: ICON, image: png },
        { id: "plugin:steam:b", name: "JPEG", icon: ICON, image: jpeg },
        { id: "plugin:steam:c", name: "WebP", icon: ICON, image: webp },
        { id: "plugin:steam:plain", name: "Sem imagem", icon: ICON },
      ],
      groups: GROUPS,
    });
    await settle(page);
    for (const [aid, uri] of [["plugin:steam:a", png], ["plugin:steam:b", jpeg], ["plugin:steam:c", webp]] as const) {
      const s = await inspect(page, KEY(aid));
      expect(s.hasImg).toBe(true);
      expect(s.src).toBe(uri);
      expect(s.svgIcons).toBe(0);
      expect(s.btnBox).toEqual([48, 48]);
      expect(s.imgBox).toEqual([46, 46]);
      expect(s.border).toBe("1px");
      expect(s.radius).toBe("50%"); expect(s.wrapRadius).toBe("50%"); expect(s.overflow).toBe("hidden");
      expect(s.objectFit).toBe("cover");
      expect(s.draggable).toBe(false);
      expect(s.decoding).toBe("async");
      expect(s.alt).toBe("");
      expect(s.pointerEvents).toBe("none");
      expect(s.text).toBeNull(); expect(s.gauge).toBeNull();
    }
    await expect.poll(async () => (await inspect(page, KEY("plugin:steam:b"))).natural).toBe(60);
    expect((await inspect(page, KEY("plugin:steam:a"))).complete).toBe(true);
    expect(errors).toEqual([]);
  });

  test("actions without an image are unchanged (18px SVG icon, no <img>)", async ({ page }) => {
    await openRing(page);
    await apply(page, {
      pluginActions: [{ id: "plugin:steam:a", name: "A", icon: ICON, image: await picture(page, "image/png") }, { id: "plugin:steam:plain", name: "Sem imagem", icon: ICON }],
      groups: GROUPS,
    });
    await settle(page);
    for (const aid of ["plugin:steam:plain", "copy"]) {
      const s = await inspect(page, KEY(aid));
      expect(s.hasImg).toBe(false);
      expect(s.svgIcons).toBe(1);
      expect(s.html).not.toContain("pimg");
      expect(s.btnBox).toEqual([48, 48]);
    }
    expect((await inspect(page, KEY("plugin:steam:plain"))).html).toBe(`<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"></circle></svg>`);
    expect(await page.locator("#stage img").count()).toBe(1);
    expect(await page.locator(".btn.grp img, .btn.hub img").count()).toBe(0);
  });

  test("an invalid image falls back to the SVG icon and never reaches the DOM", async ({ page }) => {
    const errors = await openRing(page);
    const requests: string[] = [];
    page.on("request", r => { if (!r.url().startsWith("file:") && !r.url().startsWith("data:")) requests.push(r.url()); });
    const png = await picture(page, "image/png");
    const bad: unknown[] = [
      "data:image/svg+xml;base64," + Buffer.from("<svg xmlns='http://www.w3.org/2000/svg' onload='window.__pwn=1'/>").toString("base64"),
      "data:image/gif;base64,R0lGODlhAQABAAAAACw=",
      "https://example.invalid/cover.png",
      "http://127.0.0.1:9/cover.png",
      "file:///C:/Windows/win.ini",
      "javascript:window.__pwn=1",
      "data:text/html;base64," + Buffer.from("<script>window.__pwn=1</script>").toString("base64"),
      "data:image/png;base64," + "A".repeat(80_000),
      "data:image/png;base64,AAAA\"><img src=x onerror=window.__pwn=1>",
      png + " ", " " + png, png.replace("image/png", "image/PNG"), png.replace(";base64", ""),
      42, { src: png }, null, "",
    ];
    for (const image of bad) {
      await apply(page, { pluginActions: [{ id: "plugin:steam:a", name: "A", icon: ICON, image }], groups: GROUPS });
      const s = await inspect(page, KEY("plugin:steam:a"));
      expect(`${String(image).slice(0, 40)} → img:${s.hasImg}`).toBe(`${String(image).slice(0, 40)} → img:false`);
      expect(s.svgIcons).toBe(1);
      expect(s.html).toContain("<circle");
    }
    expect(await page.locator("#stage img").count()).toBe(0);
    expect(await page.evaluate(() => (window as any).__pwn)).toBeUndefined();
    expect(requests).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("the image can arrive, change and go away after the buttons exist", async ({ page }) => {
    await openRing(page);
    const [one, two] = [await picture(page, "image/png", 96, 96, "#15803d"), await picture(page, "image/webp", 96, 96, "#a21caf")];
    await apply(page, { pluginActions: [{ id: "plugin:steam:a", name: "A", icon: ICON }], groups: GROUPS });
    expect((await inspect(page, KEY("plugin:steam:a"))).hasImg).toBe(false);
    await apply(page, { pluginActions: [{ id: "plugin:steam:a", name: "A", icon: ICON, image: one }] });
    expect((await inspect(page, KEY("plugin:steam:a"))).src).toBe(one);
    await apply(page, { pluginActions: [{ id: "plugin:steam:a", name: "A", icon: ICON, image: two }] });
    expect((await inspect(page, KEY("plugin:steam:a"))).src).toBe(two);
    await apply(page, { pluginActions: [{ id: "plugin:steam:a", name: "A", icon: ICON }] });
    const s = await inspect(page, KEY("plugin:steam:a"));
    expect(s.hasImg).toBe(false); expect(s.svgIcons).toBe(1);
  });

  test("gauge arc and text state draw on top of the picture; text sits on a dark scrim", async ({ page }) => {
    await openRing(page);
    const png = await picture(page, "image/png");
    await apply(page, {
      pluginActions: [
        { id: "plugin:steam:a", name: "A", icon: ICON, image: png },
        { id: "plugin:steam:b", name: "B", icon: ICON, image: png, keepIcon: true },
        { id: "plugin:steam:c", name: "C", icon: ICON, image: png },
        { id: "plugin:steam:plain", name: "Sem imagem", icon: ICON },
      ],
      groups: GROUPS, theme: "light",
    });
    await apply(page, { pluginStates: { steam: {
      a: { value: 42, text: "42%", status: "green" },
      b: { value: 80, text: "80%", status: "amber" },
      c: { value: 10 },
      plain: { value: 42, text: "42%", status: "green" },
    } } });
    await settle(page);
    const a = await inspect(page, KEY("plugin:steam:a"));
    expect(a.hasImg).toBe(true); expect(a.src).toBe(png);
    expect(a.text).toBe("42%");
    expect(a.textClass).toContain("pscrim");
    expect(a.scrimBg).toContain("linear-gradient");
    expect(a.textColor).toBe("rgb(250, 250, 250)");
    expect(a.gauge).toEqual({ value: "42", cls: "gauge st-green", r: "22.7px" });
    expect(a.btnBox).toEqual([48, 48]); expect(a.imgBox).toEqual([46, 46]);
    const pos = await page.evaluate(k => {
      const b = document.querySelector(`[data-key="${k}"]`) as HTMLElement, t = b.querySelector(".ptxt") as HTMLElement;
      return { parent: (t.parentElement as HTMLElement).className, top: t.offsetTop, h: t.offsetHeight, w: t.offsetWidth };
    }, KEY("plugin:steam:a"));
    expect(pos.parent).toContain("pimgw");
    expect(pos.top + pos.h).toBe(46); expect(pos.top).toBeGreaterThan(22); expect(pos.w).toBe(46);

    const b = await inspect(page, KEY("plugin:steam:b"));
    expect(b.hasImg).toBe(true); expect(b.svgIcons).toBe(0);
    expect(b.textClass).toBe("ptxt pscrim st-amber");
    expect(b.textColor).toBe("rgb(245, 165, 36)");
    expect(b.gauge!.cls).toBe("gauge st-amber");

    const c = await inspect(page, KEY("plugin:steam:c"));
    expect(c.hasImg).toBe(true); expect(c.text).toBeNull(); expect(c.gauge!.value).toBe("10");

    const plain = await inspect(page, KEY("plugin:steam:plain"));
    expect(plain.hasImg).toBe(false);
    expect(plain.textClass).toBe("ptxt st-green");
    expect(plain.scrimBg).toBe("none");
    expect(plain.gauge!.r).toBe("20.5px");
  });

  test('the unavailable state (text "–") dims the picture', async ({ page }) => {
    await openRing(page);
    const png = await picture(page, "image/png");
    await apply(page, { pluginActions: [{ id: "plugin:steam:a", name: "A", icon: ICON, image: png }, { id: "plugin:steam:b", name: "B", icon: ICON, image: png }], groups: GROUPS });
    await apply(page, { pluginStates: { steam: { a: { text: "–", label: "indisponível" }, b: { text: "12h" } } } });
    const a = await inspect(page, KEY("plugin:steam:a")), b = await inspect(page, KEY("plugin:steam:b"));
    expect(a.wrapClass).toBe("pimgw off");
    expect(a.filter).toBe("grayscale(1) opacity(0.5)");
    expect(a.text).toBe("–");
    expect(b.wrapClass).toBe("pimgw");
    expect(b.filter).toBe("none");
    await apply(page, { pluginStates: { steam: { a: { text: "3h" } } } });
    expect((await inspect(page, KEY("plugin:steam:a"))).filter).toBe("none");
  });

  test("hover still marks the picture button hot, and the balloon shows its name", async ({ page }) => {
    await openRing(page);
    const png = await picture(page, "image/png");
    await apply(page, { pluginActions: [{ id: "plugin:steam:a", name: "Left 4 Dead 2", icon: ICON, image: png }], groups: [{ id: "games", name: "Jogos", icon: "aperture", actions: ["plugin:steam:a"] }, GROUPS[1], GROUPS[2]] });
    await page.mouse.move(C, C - 10); await page.waitForTimeout(60);
    await page.mouse.move(C, C - 75); await page.waitForTimeout(450);
    await page.mouse.move(C, C - 150, { steps: 5 }); await page.waitForTimeout(450);
    const s = await inspect(page, "games:plugin:steam:a");
    expect(s.btnClass).toBe("btn hot");
    expect(s.hasImg).toBe(true);
    expect(await page.evaluate(() => (window as any).hover)).toBe("games:plugin:steam:a");
    await expect(page.locator(".balloon")).toHaveText("Left 4 Dead 2");
    const shot = await page.screenshot({ clip: { x: C - 4, y: C - 150 - 14, width: 8, height: 8 } });
    expect(shot.length).toBeGreaterThan(0);
    const colour = await page.evaluate(async () => {
      const img = document.querySelector("img.pimg") as HTMLImageElement;
      await img.decode();
      const cv = document.createElement("canvas"); cv.width = cv.height = 4;
      const g = cv.getContext("2d")!; g.drawImage(img, 0, 0, 4, 4);
      return Array.from(g.getImageData(3, 3, 1, 1).data);
    });
    expect(colour[0]).toBeGreaterThan(150);
  });

  test("edit mode keeps working with picture buttons: + slot, drag to reorder", async ({ page }) => {
    const errors = await openRing(page);
    const png = await picture(page, "image/png");
    const groups = [{ id: "games", name: "Jogos", icon: "aperture", actions: ["plugin:steam:a", "plugin:steam:b", "copy"] }, GROUPS[1], GROUPS[2]];
    await apply(page, {
      edit: true, selected: "games", groups,
      pluginActions: [{ id: "plugin:steam:a", name: "A", icon: ICON, image: png }, { id: "plugin:steam:b", name: "B", icon: ICON, image: png }],
    });
    await page.waitForTimeout(450);
    expect(await page.evaluate(() => document.documentElement.classList.contains("edit"))).toBe(true);
    expect(await page.locator('[data-key="games:+"]').count()).toBe(1);
    expect(await page.locator('[data-key="games:+"] img').count()).toBe(0);
    expect((await inspect(page, "games:plugin:steam:a")).hasImg).toBe(true);
    const pt = (j: number) => { const ang = (-90 + (j - 1) * 28) * Math.PI / 180; return { x: C + Math.cos(ang) * 150, y: C + Math.sin(ang) * 150 }; };
    await page.mouse.move(C, C - 75); await page.waitForTimeout(400);
    const from = pt(0), to = pt(1);
    await page.mouse.move(from.x, from.y, { steps: 4 }); await page.waitForTimeout(250);
    expect(await page.evaluate(() => (window as any).hover)).toBe("games:plugin:steam:a");
    await page.mouse.down();
    await page.mouse.move(from.x + (to.x - from.x) * 0.2, from.y + (to.y - from.y) * 0.2, { steps: 3 });
    await page.waitForTimeout(80);
    expect((await inspect(page, "games:plugin:steam:a")).btnClass).toContain("dragging");
    await page.mouse.move(to.x, to.y, { steps: 12 }); await page.waitForTimeout(250);
    const order = await page.evaluate(() => (window as any).groups.find((g: any) => g.id === "games").actions);
    expect(order).toEqual(["plugin:steam:b", "plugin:steam:a", "copy"]);
    expect((await inspect(page, "games:plugin:steam:a")).hasImg).toBe(true);
    await page.mouse.up(); await page.waitForTimeout(200);
    expect((await inspect(page, "games:plugin:steam:a")).src).toBe(png);
    expect(errors).toEqual([]);
  });
});
