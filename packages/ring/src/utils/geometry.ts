import { CFG, S, sim, type Group, type Target } from "../state/sim";
import { ADD, ED } from "../state/edit";
import { polar } from "./math";

export function gIdx(id: string | null): number {
  for (let i = 0; i < S.groups.length; i++) if (S.groups[i].id === id) return i;
  return -1;
}
export function gAng(i: number): number { return -90 + i * 360 / S.groups.length; }
export function aAng(gi: number, j: number): number {
  const n = S.groups[gi].actions.length;
  return gAng(gi) + (j - (n - 1) / 2) * CFG.STEP;
}
export function slotIds(g: Group): string[] {
  return ED.on && g.actions.length < CFG.MA ? g.actions.concat(ADD) : g.actions;
}
export function slotAng(gi: number, j: number): number {
  return S.groups[gi].actions.length ? aAng(gi, j) : gAng(gi);
}
export function isAct(key: string | null): key is string { return !!key && key.indexOf(":") > 0; }
export function actId(key: string): string { return key.slice(key.indexOf(":") + 1); }

export function targets(): Record<string, Target> {
  const T: Record<string, Target> = {};
  const { groups, activeGroup, visible, hover } = S;
  groups.forEach((g, gi) => {
    const act = activeGroup === g.id, other = !!activeGroup && !act;
    const p = polar(gAng(gi), visible ? CFG.R1 : 0);
    const s = !visible ? 0 : other ? 0.84 : (!activeGroup && hover === g.id ? 1.1 : 1);
    T[g.id] = { x: p.x, y: p.y, s, d: visible && !activeGroup ? gi : 0 };
    slotIds(g).forEach((aid, j) => {
      const key = g.id + ":" + aid;
      if (act && visible) { const q = polar(slotAng(gi, j), CFG.R2); T[key] = { x: q.x, y: q.y, s: hover === key ? 1.12 : 1, d: j * 2 }; }
      else T[key] = { x: p.x, y: p.y, s: 0, d: 0 };
    });
  });
  const dg = ED.drag;
  if (dg && T[dg.key]) T[dg.key] = { x: dg.x, y: dg.y, s: dg.overHub || dg.dropGid ? 0.8 : 1.15, d: 0 };
  return T;
}

export function initNodes(snapToTarget: boolean): void {
  sim.nodes = {}; sim.tgt = {}; const T = targets();
  for (const id in T) {
    const t = T[id];
    sim.nodes[id] = snapToTarget ? { x: t.x, y: t.y, s: t.s, vx: 0, vy: 0, vs: 0 } : { x: 0, y: 0, s: 0, vx: 0, vy: 0, vs: 0 };
    sim.tgt[id] = t;
  }
}
