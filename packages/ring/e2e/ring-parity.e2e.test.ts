import { test, expect } from "@playwright/test";
import {
  openPair,
  advance,
  move,
  key,
  evalBoth,
  snap,
  stageTree,
  ringState,
  hoverGroup0,
  hoverAction,
  at,
  gAng,
  aAng,
  CENTER,
  R2,
  THEMES,
  CUSTOM_GROUPS,
  LEGACY_URL,
  resolveNewUrl,
  newRingHasLanded,
  Pair,
} from "./parity-harness";

test.setTimeout(90_000);

const NEW = resolveNewUrl();

test.beforeAll(() => {
  console.log(`[parity] legacy = ${LEGACY_URL}`);
  console.log(`[parity] new    = ${NEW.url} (${NEW.label}); ring-bundle.js in src/ring.html: ${newRingHasLanded()}`);
});

test.describe("determinism (legacy vs legacy)", () => {
  let pair: Pair;
  test.beforeAll(async ({ browser }) => {
    pair = await openPair(browser, { newUrl: LEGACY_URL });
  });
  test.afterAll(async () => pair?.close());

  test("idle frame is identical", async () => {
    await advance(pair, 1000);
    const rec = await snap(pair, "00-determinism-idle", { keep: true, maxPct: 0 });
    expect(rec.differing).toBe(0);
  });

  test("hovered action frame is identical", async () => {
    await hoverAction(pair);
    await advance(pair, 800);
    const rec = await snap(pair, "00-determinism-action", { keep: true, maxPct: 0 });
    expect(rec.differing).toBe(0);
  });

  test("structure is identical", async () => {
    const [a, b] = await Promise.all([stageTree(pair.legacy), stageTree(pair.neu)]);
    expect(b).toEqual(a);
  });
});

test.describe("parity: legacy vs new", () => {
  let pair: Pair;
  test.beforeEach(async ({ browser }) => {
    pair = await openPair(browser, { newUrl: NEW.url });
  });
  test.afterEach(async () => pair?.close());

  test("1. idle open ring (+1000 ms)", async () => {
    await advance(pair, 1000);
    await snap(pair, "01-idle", { keep: true });
  });

  test("2. hover group (mouse 40 px up)", async () => {
    await advance(pair, 1000);
    await hoverGroup0(pair);
    await advance(pair, 800);
    await snap(pair, "02-hover-group", { keep: true });
  });

  test("3. active group + hovered action", async () => {
    await advance(pair, 1000);
    await hoverAction(pair);
    await advance(pair, 800);
    await snap(pair, "03-hover-action", { keep: true });
    const [sa, sb] = await Promise.all(
      pair.pages.map((p) => ringState(p).then((s) => ({ g: s.activeGroup, h: s.hover })))
    );
    expect(sb).toEqual(sa);
    expect(sa).toEqual({ g: "edit", h: "edit:paste" });
  });

  test("4. themes (setTheme + accent) while an action is hovered", async () => {
    await advance(pair, 1000);
    await hoverAction(pair);
    await advance(pair, 800);
    for (const t of THEMES) {
      await evalBoth(
        pair,
        `setTheme(${JSON.stringify(t.name)}, false); applyConfig({ accent: ${JSON.stringify(t.accent)} });`
      );
      await advance(pair, 500);
      await snap(pair, `04-theme-${t.name}`);
    }
  });

  test("5. liquid:false", async () => {
    await advance(pair, 1000);
    await hoverAction(pair);
    await advance(pair, 400);
    await evalBoth(pair, `applyConfig({ liquid: false })`);
    await advance(pair, 600);
    await snap(pair, "05-liquid-off");
  });

  test("6. closed state after clicking the hub (+1500 ms)", async () => {
    await advance(pair, 1000);
    await Promise.all(pair.pages.map((p) => p.locator(".btn.hub").click({ position: { x: 30, y: 30 } })));
    await advance(pair, 1500);
    const [oa, ob] = await Promise.all(pair.pages.map((p) => ringState(p).then((s) => s.isOpen)));
    expect(oa).toBe(false);
    expect(ob).toBe(false);
    await snap(pair, "06-closed");
  });

  test("7. custom groups (1-action, 8-action, 2-action) + hovering the 8-action group", async () => {
    await advance(pair, 1000);
    await evalBoth(pair, `applyConfig({ groups: ${JSON.stringify(CUSTOM_GROUPS)} })`);
    await advance(pair, 600);
    await snap(pair, "07a-custom-groups-idle");

    const N = CUSTOM_GROUPS.length;
    const gi = 1;
    const n = CUSTOM_GROUPS[gi].actions.length;
    const g = at(gAng(gi, N), 60);
    await move(pair, g.x, g.y);
    await advance(pair, 500);
    await snap(pair, "07b-custom-groups-active-8");

    for (const j of [0, 4, 7]) {
      const p = at(aAng(gi, N, j, n), R2);
      await move(pair, p.x, p.y);
      await advance(pair, 700);
      await snap(pair, `07c-custom-groups-hover-action-${j}`);
    }
    const [h1, h2] = await Promise.all(pair.pages.map((p) => ringState(p).then((s) => s.hover)));
    expect(h1).toBe("many:terminal");
    expect(h2).toBe(h1);
  });

  test("8. keyboard: ArrowRight x2 then Enter", async () => {
    await advance(pair, 1000);
    await key(pair, "ArrowRight");
    await advance(pair, 300);
    await key(pair, "ArrowRight");
    await advance(pair, 800);
    await snap(pair, "08a-keyboard-arrows", { keep: true });
    await key(pair, "Enter");
    await advance(pair, 800);
    const [sa, sb] = await Promise.all(
      pair.pages.map((p) => ringState(p).then((s) => ({ g: s.activeGroup, h: s.hover })))
    );
    expect(sa.g).toBe("nav");
    expect(sb).toEqual(sa);
    await snap(pair, "08b-keyboard-enter");
  });

  test("9. structural parity of #stage (tag + class tree)", async () => {
    await advance(pair, 1000);
    const [idleA, idleB] = await Promise.all([stageTree(pair.legacy), stageTree(pair.neu)]);
    expect(idleB).toEqual(idleA);
    await hoverAction(pair);
    await advance(pair, 800);
    const [hovA, hovB] = await Promise.all([stageTree(pair.legacy), stageTree(pair.neu)]);
    expect(hovB).toEqual(hovA);
  });

  test("10. no page errors on the new ring", async () => {
    const errors: string[] = [];
    pair.neu.on("pageerror", (e) => errors.push(e.message));
    await advance(pair, 500);
    await hoverAction(pair);
    await advance(pair, 500);
    await move(pair, CENTER.x, CENTER.y);
    await advance(pair, 300);
    await evalBoth(pair, `applyConfig({ groups: ${JSON.stringify(CUSTOM_GROUPS)} })`);
    await advance(pair, 500);
    await hoverGroup0(pair);
    await advance(pair, 300);
    expect(errors).toEqual([]);
  });
});
