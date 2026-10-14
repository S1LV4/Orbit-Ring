import { useLayoutEffect } from "preact/hooks";
import { CFG, E, S, sim, host, hostMode } from "../state/sim";
import { CAT, actionLabel } from "../utils/catalog";
import { ED } from "../state/edit";
import { aAng, actId, gAng, gIdx, isAct, slotAng, slotIds } from "../utils/geometry";
import { editKey } from "./useEdit";
import { D2R, angDiff, polar } from "../utils/math";
import { currentTheme, setTheme } from "../utils/themes";

export function pickGroup(ang: number, cur: string | null): string {
  const groups = S.groups, W = 360 / groups.length, ci = gIdx(cur);
  if (ci >= 0 && Math.abs(angDiff(ang, gAng(ci))) < W / 2 + CFG.HYST) return cur as string;
  let best = 0, bd = 1e9;
  groups.forEach((_g, i) => { const d = Math.abs(angDiff(ang, gAng(i))); if (d < bd) { bd = d; best = i; } });
  return groups[best].id;
}
export function setGroup(id: string | null): void { if (id !== S.activeGroup) { S.activeGroup = id; sim.change = sim.f; } }

export function updateSelection(): void {
  if (!S.isOpen || !S.groups.length) return;
  const { R1, R2, DZ, HYST, STEP } = CFG, groups = S.groups, W = 360 / groups.length;
  let mag = Math.hypot(S.dx, S.dy); const MAX = R2 + 40;
  if (mag > MAX) { S.dx *= MAX / mag; S.dy *= MAX / mag; mag = MAX; }
  const ang = Math.atan2(S.dy, S.dx) / D2R;

  if (mag < DZ) { setGroup(null); S.hover = null; return; }
  if (!S.activeGroup) {
    S.hover = pickGroup(ang, S.hover);
    if (mag >= R1 * 0.7) setGroup(S.hover);
    return;
  }
  if (mag < R1 * 0.45) { setGroup(null); S.hover = pickGroup(ang, null); return; }

  let gi = gIdx(S.activeGroup);
  if (mag < R1 + 20 && Math.abs(angDiff(ang, gAng(gi))) > W / 2 + HYST) { setGroup(pickGroup(ang, null)); gi = gIdx(S.activeGroup); }
  const g = groups[gi];
  if (mag < R1 + 18) { S.hover = g.id; return; }

  let best: string | null = null, bd = 1e9; const ids = slotIds(g);
  ids.forEach((aid, j) => { const d = Math.abs(angDiff(ang, slotAng(gi, j))); if (d < bd) { bd = d; best = g.id + ":" + aid; } });
  const hv = S.hover;
  if (isAct(hv) && hv.startsWith(g.id + ":") && hv !== best) {
    const j = ids.indexOf(actId(hv));
    if (j >= 0 && Math.abs(angDiff(ang, slotAng(gi, j))) < STEP / 2 + HYST / 2) best = hv;
  }
  S.hover = bd <= STEP * 1.2 ? best : g.id;
}
export function setDeltaTo(a: number, r: number): void {
  const p = polar(a, r); S.dx = p.x; S.dy = p.y; S.lastMove = performance.now(); updateSelection();
}

export function resolveFire(): string | null {
  if (ED.on) return null;
  if (isAct(S.hover)) return S.hover;
  const g = S.groups[gIdx(S.activeGroup)];
  if (g && g.actions.length === 1) return g.id + ":" + g.actions[0];
  return null;
}
export function release(): void { if (ED.on) return; const k = resolveFire(); if (k) fire(k); else hostClose(); }
export function fire(key: string): void {
  if (ED.on || !isAct(key)) return; const aid = actId(key); const c = CAT[aid];
  const n = sim.nodes[key]; if (n) n.vs += 0.3;
  sim.burst = 0.035; flash(actionLabel(aid));
  const action = c ? c.a : { type: "system", action: aid };
  try { host()!.executeAction!(action); } catch (e) {  }
}
export function flash(txt: string): void {
  const t = E.toast; if (!t) return;
  t.textContent = txt; t.classList.remove("show"); void t.offsetWidth; t.classList.add("show");
}
export function back(): void { setGroup(null); S.hover = null; S.dx = S.dy = 0; }
export function open(showNow: boolean): void {
  S.isOpen = true; S.visible = !!showNow || CFG.revealDelay <= 0; S.activeGroup = null; S.hover = null; S.dx = S.dy = 0;
  S.shownAt = S.lastMove = performance.now(); sim.change = sim.f; sim.openP = 0;
  for (const id in sim.nodes) sim.nodes[id] = { x: 0, y: 0, s: 0, vx: 0, vy: 0, vs: 0 };
}
export function reset(): void {
  S.isOpen = false; S.visible = false; S.activeGroup = null; S.hover = null; S.dx = S.dy = 0; sim.openP = 0; sim.lastPath = null;
  for (const id in sim.nodes) sim.nodes[id] = { x: 0, y: 0, s: 0, vx: 0, vy: 0, vs: 0 };
  sim.drops.forEach(d => Object.assign(d, { x: 0, y: 0, vx: 0, vy: 0, s: 0, vs: 0 }));
}
export function hostClose(): void {
  if (hostMode) { try { host()!.close!(); } catch (e) {  } }
  else reset();
}
export function hubClick(e: Event): void {
  e.stopPropagation();
  if (ED.on) return;
  if (S.activeGroup) back(); else if (S.isOpen) hostClose(); else open(true);
}

function cycle(dir: number): void {
  if (!S.activeGroup) { const N = S.groups.length; let i = gIdx(S.hover); i = i < 0 ? 0 : (i + dir + N) % N; setDeltaTo(gAng(i), CFG.R1 * 0.5); }
  else {
    const gi = gIdx(S.activeGroup), g = S.groups[gi], n = g.actions.length;
    let j = isAct(S.hover) ? g.actions.indexOf(actId(S.hover)) : -1; j = j < 0 ? 0 : (j + dir + n) % n; setDeltaTo(aAng(gi, j), CFG.R2);
  }
}
function commit(): void {
  if (isAct(S.hover)) return fire(S.hover);
  if (!S.activeGroup && S.hover) {
    const gi = gIdx(S.hover), g = S.groups[gi]; setDeltaTo(gAng(gi), CFG.R1);
    if (g.actions.length === 1) fire(g.id + ":" + g.actions[0]);
  }
}
function pickIndex(i: number): void {
  if (!S.activeGroup) { if (i < S.groups.length) setDeltaTo(gAng(i), CFG.R1); }
  else { const gi = gIdx(S.activeGroup); if (i < S.groups[gi].actions.length) { setDeltaTo(aAng(gi, i), CFG.R2); if (S.hover) fire(S.hover); } }
}
export function onKeyDown(e: KeyboardEvent): void {
  if (ED.on) { editKey(e); return; }
  if (e.key === "t" || e.key === "T") { setTheme(currentTheme() === "light" ? "dark" : "light", true); return; }
  if (!S.isOpen || !S.groups.length) return;
  S.visible = true; const k = e.key;
  if (k === "Escape") { e.preventDefault(); if (S.activeGroup) back(); else hostClose(); return; }
  if (k === "Backspace") { e.preventDefault(); back(); return; }
  if (k.startsWith("Arrow")) { e.preventDefault(); cycle(k === "ArrowRight" || k === "ArrowDown" ? 1 : -1); return; }
  if (k === "Enter" || k === " ") { e.preventDefault(); commit(); return; }
  if (/^[1-9]$/.test(k)) pickIndex(+k - 1);
}

export function useSelection(): void {
  useLayoutEffect(() => {
    addEventListener("keydown", onKeyDown);
    return () => removeEventListener("keydown", onKeyDown);
  }, []);
}
