import { useLayoutEffect } from "preact/hooks";
import { A, CFG, E, S, sim, hostMode, type SectorState } from "../state/sim";
import { ADD, ADD_LABEL, ED } from "../state/edit";
import { actionLabel } from "../utils/catalog";
import { actId, gAng, gIdx, isAct, slotAng, slotIds, targets } from "../utils/geometry";
import { D2R, RAMP, angDiff, distSeg, hash, pointOn, setClass, setStyle, spring, type Pt } from "../utils/math";

export function measureChar(): void {
  const stage = document.getElementById("stage");
  const p = document.createElement("pre"); p.className = "asc"; p.textContent = "M".repeat(50);
  (stage || document.body).appendChild(p);
  A.cw = p.getBoundingClientRect().width / 50 || 4.2; p.remove();
}
function sizeSector(el: HTMLElement, rin: number, rout: number): void {
  Object.assign(el.style, { width: 2 * rout + "px", height: 2 * rout + "px", left: (S.CX - rout) + "px", top: (S.CY - rout) + "px" });
  const m = "radial-gradient(circle,transparent " + rin + "px,#000 " + (rin + 1) + "px,#000 " + (rout - 1) + "px,transparent " + rout + "px)";
  (el.style as unknown as Record<string, string>).webkitMaskImage = m; el.style.maskImage = m;
}
export function layout(): void {
  S.CX = innerWidth / 2; S.CY = innerHeight / 2;
  A.box = 2 * (CFG.R2 + 120); A.cols = Math.floor(A.box / A.cw); A.rows = Math.floor(A.box / A.lh);
  if (E.sec1) sizeSector(E.sec1, 34, CFG.R1 + 34);
  if (E.sec2) sizeSector(E.sec2, CFG.R1 + 34, CFG.R2 + 34);
  if (E.goo) Object.assign(E.goo.style, { left: (S.CX - 380) + "px", top: (S.CY - 380) + "px" });
  if (E.stars) Object.assign(E.stars.style, { left: S.CX + "px", top: S.CY + "px" });
  if (E.breathe) Object.assign(E.breathe.style, { left: S.CX + "px", top: S.CY + "px" });
}

function selPath(): Pt[] | null {
  if (!S.visible) return null;
  const O = { x: 0, y: 0 };
  const gKey = S.activeGroup || (S.hover && !isAct(S.hover) ? S.hover : null);
  const g = gKey && sim.nodes[gKey]; if (!g) return null;
  const a = isAct(S.hover) && sim.nodes[S.hover];
  return a ? [O, g, a] : [O, g];
}
const FR = [0.95, 0.8, 0.65, 0.5, 0.35, 0.2, 0.05];
export function step(): void {
  const reduce = S.reduce;
  sim.f++; sim.t += 1 / 60;
  if (S.isOpen && !S.visible) {
    const now = performance.now(), el = now - S.shownAt;
    if (el >= CFG.revealMax || (el >= CFG.revealDelay && now - S.lastMove >= 60)) { S.visible = true; sim.change = sim.f; }
  }
  const T = targets();
  for (const id in T) {
    const n = sim.nodes[id] || (sim.nodes[id] = { x: 0, y: 0, s: 0, vx: 0, vy: 0, vs: 0 });
    if (sim.f - sim.change >= (T[id].d || 0)) sim.tgt[id] = T[id];
    const tg = sim.tgt[id] || T[id], a = isAct(id), st = a ? 0.13 : 0.16, dp = a ? 0.76 : 0.7;
    if (ED.drag && ED.drag.key === id) { n.x = tg.x; n.y = tg.y; n.vx = n.vy = 0; }
    else { spring(n, "x", "vx", tg.x, st, dp, reduce); spring(n, "y", "vy", tg.y, st, dp, reduce); }
    spring(n, "s", "vs", tg.s, st, dp, reduce);
  }
  sim.openP += ((S.visible ? 1 : 0) - sim.openP) * (reduce ? 1 : 0.14);

  const P = selPath(); if (P) sim.lastPath = P;
  sim.drops.forEach((d, i) => {
    const p = P ? pointOn(P, FR[i]) : { x: 0, y: 0 };
    spring(d, "x", "vx", p.x, 0.2, 0.65, reduce); spring(d, "y", "vy", p.y, 0.2, 0.65, reduce);
    spring(d, "s", "vs", P ? 1 : S.visible ? 0.5 : 0, 0.15, 0.7, reduce);
  });
  sim.flow += ((P ? 1 : 0) - sim.flow) * (reduce ? 1 : 0.12);
  sim.burst *= 0.9;
  sim.parts.forEach(pa => { pa.p = (pa.p + (0.004 + 0.014 * sim.flow + sim.burst) * (1 + pa.p * 1.6)) % 1; });
}

function place(el: HTMLElement, m: { x: number; y: number; s: number }, op: number): void {
  const sc = Math.max(0, m.s), o = Math.min(1, Math.max(0, sc * 1.4 - 0.2)) * op;
  setStyle(el, "transform", "translate(" + (S.CX + m.x).toFixed(1) + "px," + (S.CY + m.y).toFixed(1) + "px) scale(" + sc.toFixed(3) + ")");
  setStyle(el, "opacity", o.toFixed(3));
}
function editNode(el: HTMLElement, key: string): void {
  const tg = sim.tgt[key];
  setStyle(el, "pointerEvents", tg && tg.s === 0 ? "none" : "");
  setStyle(el, "zIndex", ED.drag && ED.drag.key === key ? "12" : "");
}
function drawSector(el: HTMLElement, st: SectorState, ang: number, w: number, on: boolean): void {
  if (on) {
    if (!st.on || st.a == null) { st.a = ang; st.w = w; }
    else { st.a += angDiff(ang, st.a) * (S.reduce ? 1 : 0.35); st.w += (w - st.w) * (S.reduce ? 1 : 0.35); }
  }
  st.on = on; setStyle(el, "opacity", on ? "1" : "0");
  if (st.a != null) {
    const from = st.a + 90 - st.w / 2;
    setStyle(el, "background", "conic-gradient(from " + from.toFixed(1) + "deg,var(--sec) 0deg " + st.w.toFixed(1) + "deg,transparent " + st.w.toFixed(1) + "deg)");
  }
}

const STAR_CH = [".", "·", "+", "*"];
const BH = { RH: 33, tilt: -12, squash: 0.17, halo: 36 };
let asciiCleared = false;
function renderAscii(P: Pt[] | null): void {
  if (!E.ascDim || !E.ascMid || !E.ascAcc) return;
  if (!CFG.ascii) {
    if (!asciiCleared) { E.ascDim.textContent = E.ascMid.textContent = E.ascAcc.textContent = ""; asciiCleared = true; }
    return;
  }
  asciiCleared = false;
  const visible = S.visible;
  const t = sim.t, cw = A.cw, C = A.cols, R = A.rows, half = A.box / 2, N = RAMP.length - 2, op = Math.max(0, sim.openP);
  const tilt = BH.tilt * D2R, cT = Math.cos(tilt), sT = Math.sin(tilt), RH = BH.RH;
  const ROUT = visible ? CFG.R2 + 55 : 118, SPAN = ROUT - RH;
  const boost = 1 + sim.burst * 25 + sim.flow * 0.3;
  const rot = t * 0.02, cR = Math.cos(rot), sR = Math.sin(rot);
  const dim: string[] = [], mid: string[] = [], acc: string[] = [];
  const put = (v: number, hot: boolean) => v > 0.5 ? (hot ? 3 : 2) : v > 0.2 ? 2 : 1;
  for (let r = 0; r < R; r++) {
    let ld = "", lm = "", la = "";
    for (let c = 0; c < C; c++) {
      const x = (c - C / 2 + 0.5) * cw, y = (r - R / 2 + 0.5) * A.lh, d = Math.hypot(x, y);
      let ch = " ", L = 0;
      if (P) {
        let gd = 99; for (let i = 1; i < P.length; i++) gd = Math.min(gd, distSeg(x, y, P[i - 1], P[i]));
        if (gd < 12) {
          const v = (1 - gd / 12) * (0.55 + 0.45 * Math.sin(t * 6 + d * 0.15));
          if (v > 0.15) { ch = RAMP[1 + Math.floor(Math.min(v, 1) * N)]; L = 3; }
        }
      }
      if (!L && d > RH - 6) {
        const u = x * cT + y * sT, w = -x * sT + y * cT;
        const wz = w / BH.squash, rr = Math.hypot(u, wz);
        if (rr > RH + 2 && rr < ROUT && !(d < RH + 2 && w < 0)) {
          const th = Math.atan2(wz, u), k = (rr - RH) / SPAN;
          const om = t * 2.6 * boost * Math.pow(42 / rr, 1.5);
          const streak = 0.5 + 0.5 * Math.sin(th * 5 - om * 5 + rr * 0.22 + hash(Math.floor(rr / 6), 0) * 6);
          const beam = 0.72 - 0.28 * Math.cos(th);
          const v = (Math.pow(1 - k, 1.4) * 0.75 + Math.exp(-k * 6) * 1.1) * (0.55 + 0.45 * streak) * beam;
          if (v > 0.08) { ch = RAMP[1 + Math.floor(Math.min(v * 1.1, 1) * N)]; L = put(v, visible); }
        }
        if (!L && d < RH + BH.halo) {
          const a = Math.atan2(y, x), q = d - RH;
          const lens = 0.25 + 0.75 * Math.pow(Math.abs(w) / Math.max(d, 1), 0.6);
          const ring = Math.exp(-Math.max(0, q - 3) / 10) * lens;
          const photon = Math.exp(-Math.pow((q - 3) / 2.4, 2));
          const swirl = 0.55 + 0.45 * Math.sin(a * 6 - t * 1.8 * boost + q * 0.4);
          const v = (ring * 1.2 * swirl + photon * 1.3) * (0.85 - 0.15 * Math.cos(a));
          if (v > 0.09 && q > 0) { ch = RAMP[1 + Math.floor(Math.min(v, 1) * N)]; L = put(v, visible); }
        }
      }
      if (!L && d < half && d > RH + BH.halo) {
        const pull = 1 - (RH * RH * 1.6) / (d * d), sx = x * pull, sy = y * pull;
        const gx = Math.floor((sx * cR - sy * sR) / 7), gy = Math.floor((sx * sR + sy * cR) / 9), h = hash(gx, gy);
        if (h < 0.03) {
          const tw = 0.5 + 0.5 * Math.sin(t * (1 + h * 40) + h * 900), vig = 1 - d / half;
          const b = tw * vig * (0.6 + 0.4 * op);
          if (b > 0.12) { ch = STAR_CH[Math.min(3, Math.floor(b * (h < 0.006 ? 4 : 2.6)))]; L = b > 0.55 ? 2 : 1; }
        }
      }
      ld += L === 1 ? ch : " "; lm += L === 2 ? ch : " "; la += L === 3 ? ch : " ";
    }
    dim.push(ld); mid.push(lm); acc.push(la);
  }
  E.ascDim.textContent = dim.join("\n"); E.ascMid.textContent = mid.join("\n"); E.ascAcc.textContent = acc.join("\n");
}

export function render(): void {
  const t = sim.t, P = selPath();
  const { groups, activeGroup, hover, visible, isOpen, CX, CY } = S;
  if (sim.f % 2 === 0) renderAscii(P);

  if (E.goo) setStyle(E.goo, "opacity", CFG.liquid && isOpen ? "1" : "0");
  if (E.hubDrop) setStyle(E.hubDrop, "transform", "scale(" + Math.max(0, sim.openP).toFixed(3) + ")");
  sim.drops.forEach((d, i) => {
    const el = E.drops[i]; if (!el) return;
    setStyle(el, "left", (380 + d.x).toFixed(1) + "px"); setStyle(el, "top", (380 + d.y).toFixed(1) + "px");
    setStyle(el, "transform", "scale(" + Math.max(0, d.s).toFixed(3) + ")");
  });

  const tilt = -18 * D2R, cT = Math.cos(tilt), sT = Math.sin(tilt), LP = sim.lastPath, fl = sim.flow;
  sim.parts.forEach((pa, i) => {
    const s = E.star[i]; if (!s) return;
    const q = pa.p, ir = 100 - q * 65, ia = pa.arm * Math.PI + q * 5 + t * 0.5;
    const ex = ir * Math.cos(ia), ey = ir * Math.sin(ia) * 0.42;
    let x = ex * cT - ey * sT, y = ex * sT + ey * cT;
    if (LP && fl > 0.01) {
      const pt = pointOn(LP, 1 - q), L = Math.hypot(pt.x, pt.y) || 1, j = (pa.sz - 2) * 2.5 * (1 - q);
      x += (pt.x - pt.y / L * j - x) * fl; y += (pt.y + pt.x / L * j - y) * fl;
    }
    const fade = Math.min(1, q * 6) * Math.min(1, (1 - q) * 6);
    const op = (0.35 + 0.65 * fl) * fade * (0.7 + 0.3 * Math.sin(t * 6 + pa.tw)) * Math.max(0, sim.openP) * (CFG.liquid ? 1 : 0);
    const sz = pa.sz * (0.55 + 0.6 * (1 - q)) * (1 + 0.3 * fl);
    setStyle(s, "transform", "translate(" + (x - sz / 2).toFixed(1) + "px," + (y - sz / 2).toFixed(1) + "px)");
    setStyle(s, "width", sz.toFixed(1) + "px"); setStyle(s, "height", sz.toFixed(1) + "px"); setStyle(s, "opacity", op.toFixed(3));
  });

  const N = groups.length || 1, gKey = activeGroup || (hover && !isAct(hover) ? hover : null), gi = gIdx(gKey);
  if (E.sec1) drawSector(E.sec1, sim.sec1, gi >= 0 ? gAng(gi) : 0, 360 / N, visible && gi >= 0);
  if (E.sec2) {
    if (isAct(hover) && activeGroup) {
      const ai = gIdx(activeGroup), ag = groups[ai], j = ag ? slotIds(ag).indexOf(actId(hover)) : -1;
      drawSector(E.sec2, sim.sec2, j >= 0 ? slotAng(ai, j) : 0, CFG.STEP, visible && j >= 0);
    } else drawSector(E.sec2, sim.sec2, 0, CFG.STEP, false);
  }
  if (E.sec1) setStyle(E.sec1, "filter", activeGroup ? "opacity(.55)" : "none");

  if (E.breathe) setClass(E.breathe, "breathe" + (isOpen ? "" : " on"));
  if (E.hN) place(E.hN, { x: 0, y: 0, s: 1 }, 1);
  const ed = ED.on, dg = ED.drag, dcls = dg ? " dragging" + (dg.overHub || dg.dropGid ? " over" : "") : "";
  if (E.hB) setClass(E.hB, "btn hub" + (isOpen ? " open" : "") + (activeGroup && visible ? " in-group" : "")
    + (dg ? " trash" + (dg.overHub ? " hot" : "") : ""));

  groups.forEach(g => {
    const m = sim.nodes[g.id], el = E.nodes[g.id]; if (!m || !el) return;
    const act = activeGroup === g.id, other = !!activeGroup && !act, drop = !!dg && dg.dropGid === g.id;
    setClass(el.b, el.base + (act ? " active" : "") + ((hover === g.id || act) && visible ? " hot" : "")
      + (ed ? (ED.selected === g.id ? " sel" : "") + (drop ? " drop-target" : "") + (dg && dg.key === g.id ? dcls : "") : ""));
    place(el.n, m, other && !drop ? 0.45 : 1);
    if (ed) editNode(el.n, g.id);
    slotIds(g).forEach(aid => {
      const key = g.id + ":" + aid, mi = sim.nodes[key], ea = E.nodes[key]; if (!mi || !ea) return;
      setClass(ea.b, ea.base + (hover === key ? " hot" : "") + (dg && dg.key === key ? dcls : "")); place(ea.n, mi, 1);
      if (ed) editNode(ea.n, key);
    });
  });

  if (E.vcur) {
    if (hostMode && visible) {
      const mag = Math.hypot(S.dx, S.dy);
      setStyle(E.vcur, "transform", "translate(" + (CX + S.dx).toFixed(1) + "px," + (CY + S.dy).toFixed(1) + "px)");
      setStyle(E.vcur, "opacity", mag < CFG.DZ ? "0.3" : "0.9");
    } else setStyle(E.vcur, "opacity", "0");
  }

  if (E.bal) {
    let txt = "", n = null as { x: number; y: number; s: number } | null | undefined;
    if (visible && hover) {
      n = sim.nodes[hover]; const _aid = isAct(hover) ? actId(hover) : null;
      txt = _aid ? (ed && _aid === ADD ? ADD_LABEL : actionLabel(_aid)) : (groups[gIdx(hover)] || {}).name || "";
    }
    if (!txt || !n || n.s < 0.5) { setStyle(E.bal, "opacity", "0"); }
    else {
      const d = Math.hypot(n.x, n.y) || 1, ux = n.x / d, uy = n.y / d, bx = CX + n.x + ux * 34, by = CY + n.y + uy * 34;
      const tx = ux > 0.35 ? "0" : ux < -0.35 ? "-100%" : "-50%", ty = Math.abs(ux) > 0.35 ? "-50%" : (uy < 0 ? "-100%" : "0");
      if (E.bal.textContent !== txt) {
        E.bal.style.maxWidth = ""; E.bal.style.whiteSpace = ""; (E.bal as unknown as Record<string, string>)._maxWidth = ""; (E.bal as unknown as Record<string, string>)._whiteSpace = "";
        E.bal.textContent = txt; balW = E.bal.offsetWidth; balH = E.bal.offsetHeight;
      }
      const M = 6, I = S.inset, W = innerWidth - I.r, H = innerHeight - I.b, X0 = I.l + M, Y0 = I.t + M;
      let w = balW, wrap = "", fx = tx === "0" ? 0 : tx === "-100%" ? -1 : -0.5, tX = tx, bX = bx, bY = by, tY = ty;
      const room = fx === 0 ? W - M - bx : fx === -1 ? bx - X0 : Math.min(bx - X0, W - M - bx) * 2;
      if (w > room) {
        if (room >= 120) { w = Math.floor(room); wrap = w + "px"; }
        else {
          fx = -0.5; tX = "-50%"; bX = CX + n.x; tY = uy <= 0 ? "-100%" : "0"; bY = CY + n.y + (uy <= 0 ? -34 : 34);
          if (w > W - M - X0) { w = W - M - X0; wrap = w + "px"; }
        }
      }
      setStyle(E.bal, "maxWidth", wrap); setStyle(E.bal, "whiteSpace", wrap ? "normal" : "");
      const h = wrap ? E.bal.offsetHeight : balH;
      const fy = tY === "-50%" ? -0.5 : tY === "-100%" ? -1 : 0;
      const left = bX + fx * w, top = bY + fy * h;
      const ox = left < X0 ? X0 - left : left + w > W - M ? W - M - (left + w) : 0;
      const oy = top < Y0 ? Y0 - top : top + h > H - M ? H - M - (top + h) : 0;
      setStyle(E.bal, "transform", "translate(" + bX.toFixed(1) + "px," + bY.toFixed(1) + "px) translate(" + tX + "," + tY + ")" +
        (ox || oy ? " translate(" + ox.toFixed(1) + "px," + oy.toFixed(1) + "px)" : ""));
      setStyle(E.bal, "opacity", "1");
    }
  }
}

let balW = 0, balH = 0;

let last = 0, accum = 0; const DT = 1000 / 60;
function loop(ts: number): void {
  requestAnimationFrame(loop);
  if (!last) last = ts; accum += Math.min(100, ts - last); last = ts;
  let k = 0; while (accum >= DT && k < 4) { if (S.groups.length) step(); accum -= DT; k++; }
  if (k) render();
}
export function startLoop(): void { requestAnimationFrame(loop); }

export function usePhysics(onMounted: () => void): void {
  useLayoutEffect(() => {
    measureChar(); layout();
    addEventListener("resize", layout);
    onMounted();
    startLoop();
    return () => removeEventListener("resize", layout);
  }, []);
}
