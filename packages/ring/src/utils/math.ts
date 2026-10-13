export const D2R = Math.PI / 180;
export const RAMP = " .:-=+*#%@";

export interface Pt { x: number; y: number }

export function spring<K extends string, V extends string>(
  o: Record<K | V, number>, k: K, v: V, tgt: number, st: number, dp: number, reduce: boolean,
): void {
  if (reduce) { o[k] = tgt; o[v] = 0; return; }
  o[v] = (o[v] + (tgt - o[k]) * st) * dp;
  o[k] += o[v];
}
export function polar(a: number, r: number): Pt { return { x: Math.cos(a * D2R) * r, y: Math.sin(a * D2R) * r }; }
export function angDiff(a: number, b: number): number { return ((a - b) % 360 + 540) % 360 - 180; }
export function hash(c: number, r: number): number { const h = Math.sin(c * 127.1 + r * 311.7) * 43758.5453; return h - Math.floor(h); }

export function pointOn(P: Pt[], f: number): Pt {
  let L = 0; const seg: number[] = [];
  for (let i = 1; i < P.length; i++) { const l = Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y); seg.push(l); L += l; }
  let d = Math.max(0, Math.min(1, f)) * L;
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i] || i === seg.length - 1) {
      const t = seg[i] ? Math.min(1, d / seg[i]) : 0;
      return { x: P[i].x + (P[i + 1].x - P[i].x) * t, y: P[i].y + (P[i + 1].y - P[i].y) * t };
    }
    d -= seg[i];
  }
  return { x: 0, y: 0 };
}
export function distSeg(x: number, y: number, a: Pt, b: Pt): number {
  const vx = b.x - a.x, vy = b.y - a.y, l2 = vx * vx + vy * vy;
  let t = l2 ? ((x - a.x) * vx + (y - a.y) * vy) / l2 : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - a.x - vx * t, y - a.y - vy * t);
}

type Memo = HTMLElement & Record<string, unknown>;
export function setStyle(el: HTMLElement, k: string, v: string): void {
  const m = el as Memo;
  if (m["_" + k] !== v) { m["_" + k] = v; (el.style as unknown as Record<string, string>)[k] = v; }
}
export function setClass(el: HTMLElement, c: string): void {
  const m = el as Memo;
  if (m._c !== c) { m._c = c; el.className = c; }
}
