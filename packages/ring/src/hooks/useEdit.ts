import { CFG, E, S, sim } from "../state/sim";
import { ADD, ED, emit } from "../state/edit";
import { actId, gAng, gIdx, isAct } from "../utils/geometry";
import { D2R, angDiff } from "../utils/math";
import { back, setDeltaTo, setGroup, updateSelection } from "./useSelection";

const DRAG_START = 6;
const HUB_R = 34;
const DROP_R = 30;

interface Hit { kind: "group" | "action" | "add" | "hub" | "bg"; key: string | null; gid: string | null; aid: string | null }
const MISS: Hit = { kind: "bg", key: null, gid: null, aid: null };

function hit(t: EventTarget | null): Hit {
  const el = t instanceof Element ? t : null;
  if (!el) return MISS;
  if (E.hB && E.hB.contains(el)) return { kind: "hub", key: null, gid: null, aid: null };
  const b = el.closest("[data-key]"), key = b && b.getAttribute("data-key"), n = key ? sim.nodes[key] : null;
  if (!key || !n || n.s < 0.5) return MISS;
  if (!isAct(key)) return gIdx(key) < 0 ? MISS : { kind: "group", key, gid: key, aid: null };
  const gid = key.slice(0, key.indexOf(":")), aid = actId(key);
  return { kind: aid === ADD ? "add" : "action", key, gid, aid };
}

let press: { h: Hit; x: number; y: number; id: number } | null = null;

export function pinSnap(): void {
  const gi = gIdx(ED.selected);
  if (gi < 0) { back(); return; }
  if (S.activeGroup !== ED.selected) { setGroup(null); S.hover = null; }
  setDeltaTo(gAng(gi), CFG.R1);
}

function startDrag(): boolean {
  if (!press) return false;
  const h = press.h, gi = gIdx(h.gid);
  if ((h.kind !== "group" && h.kind !== "action") || gi < 0 || !h.key || !h.gid) return false;
  const g = S.groups[gi];
  if (h.kind === "action" && (!h.aid || g.actions.indexOf(h.aid) < 0)) return false;
  const snap = JSON.stringify(S.groups);
  if (h.kind === "group") back();
  else { setGroup(h.gid); S.hover = null; }
  ED.drag = {
    key: h.key, kind: h.kind, gid: h.gid, aid: h.aid, x: press.x - S.CX, y: press.y - S.CY,
    orig: h.kind === "group" ? S.groups.map(x => x.id) : g.actions.slice(),
    overHub: false, dropGid: null, pointerId: press.id, snap,
  };
  try { document.documentElement.setPointerCapture(press.id); } catch (e) {  }
  return true;
}

function move<T>(arr: T[], from: number, to: number): void {
  if (from === to || from < 0) return;
  arr.splice(to, 0, arr.splice(from, 1)[0]);
}

function updateDrag(x: number, y: number): void {
  const dg = ED.drag; if (!dg) return;
  dg.x = x; dg.y = y; dg.dropGid = null;
  dg.overHub = Math.hypot(x, y) < HUB_R;
  if (dg.overHub) return;
  const ang = Math.atan2(y, x) / D2R, gs = S.groups;
  if (dg.kind === "group") {
    const N = gs.length, idx = Math.round((((ang + 90) % 360 + 360) % 360) / (360 / N)) % N;
    move(gs, gIdx(dg.gid), idx);
    return;
  }
  const gi = gIdx(dg.gid), g = gs[gi], aid = dg.aid as string; if (!g) return;
  for (const o of gs) {
    const n = sim.nodes[o.id];
    if (o !== g && n && Math.hypot(x - n.x, y - n.y) < DROP_R && o.actions.indexOf(aid) < 0 && o.actions.length < CFG.MA) { dg.dropGid = o.id; return; }
  }
  const n = g.actions.length;
  const idx = Math.max(0, Math.min(n - 1, Math.round(angDiff(ang, gAng(gi)) / CFG.STEP + (n - 1) / 2)));
  move(g.actions, g.actions.indexOf(aid), idx);
}

function endDrag(commit: boolean): void {
  const dg = ED.drag; if (!dg) return;
  ED.drag = null;
  try { document.documentElement.releasePointerCapture(dg.pointerId); } catch (e) {  }
  const g = S.groups[gIdx(dg.gid)];
  const restore = () => {
    if (dg.kind === "group") S.groups.sort((a, b) => dg.orig.indexOf(a.id) - dg.orig.indexOf(b.id));
    else if (g) g.actions.splice(0, g.actions.length, ...dg.orig);
  };
  if (!commit) { restore(); return; }
  if (dg.kind === "group") {
    if (dg.overHub) { restore(); emit("remove-group", { groupId: dg.gid }); return; }
    const ids = S.groups.map(x => x.id);
    if (ids.join("|") !== dg.orig.join("|")) emit("reorder-groups", { ids });
    return;
  }
  if (dg.overHub) { restore(); emit("remove-action", { groupId: dg.gid, actionId: dg.aid }); return; }
  if (dg.dropGid) { restore(); emit("move-action", { fromGroupId: dg.gid, toGroupId: dg.dropGid, actionId: dg.aid }); return; }
  if (g && g.actions.join("|") !== dg.orig.join("|")) emit("reorder-actions", { groupId: dg.gid, actions: g.actions.slice() });
}

export function cancelDrag(): void { if (ED.drag) { endDrag(false); press = null; } }

function click(h: Hit): void {
  if (h.kind === "add" && h.key) {
    const b = E.nodes[h.key], r = b && b.b.getBoundingClientRect();
    if (r) emit("add-action", { groupId: h.gid, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
    return;
  }
  emit("select", { groupId: h.kind === "group" || h.kind === "action" ? h.gid : null, actionId: h.kind === "action" ? h.aid : null });
}

function onDown(e: PointerEvent): void {
  if (!ED.on) return;
  ED.inside = true;
  if (e.button !== 0 || ED.drag) return;
  press = { h: hit(e.target), x: e.clientX, y: e.clientY, id: e.pointerId };
}
function onMove(e: PointerEvent): void {
  if (!ED.on) return;
  ED.inside = true;
  if (!press || e.pointerId !== press.id) return;
  if (!ED.drag) {
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < DRAG_START) return;
    if (!startDrag()) return;
  }
  updateDrag(e.clientX - S.CX, e.clientY - S.CY);
}
function onUp(e: PointerEvent): void {
  if (!ED.on) { press = null; return; }
  if (ED.drag) {
    if (e.pointerId !== ED.drag.pointerId) return;
    updateDrag(e.clientX - S.CX, e.clientY - S.CY);
    endDrag(true);
    S.dx = e.clientX - S.CX; S.dy = e.clientY - S.CY; S.lastMove = performance.now(); updateSelection();
  } else if (press && e.button === 0 && e.pointerId === press.id) click(press.h);
  press = null;
}
function onCancel(): void { if (ED.drag) cancelDrag(); press = null; }
function onLeave(): void {
  ED.inside = false;
  if (ED.on && !ED.drag) { press = null; pinSnap(); }
}
function onContext(e: MouseEvent): void {
  if (!ED.on) return;
  e.preventDefault();
  const h = hit(e.target);
  if (h.kind === "group" || h.kind === "action") emit("context", { groupId: h.gid, actionId: h.aid, x: e.clientX, y: e.clientY });
}

export function editKey(e: KeyboardEvent): void {
  const k = e.key, mod = e.ctrlKey || e.metaKey;
  if (k === "Escape") {
    e.preventDefault();
    if (ED.drag) cancelDrag(); else emit("select", { groupId: null, actionId: null });
    return;
  }
  if (mod && (k === "z" || k === "Z")) { e.preventDefault(); emit(e.shiftKey ? "redo" : "undo"); return; }
  if (mod && (k === "y" || k === "Y")) { e.preventDefault(); emit("redo"); return; }
  if (k === "Delete" || k === "Backspace") {
    e.preventDefault();
    const hv = S.hover; if (ED.drag || !hv) return;
    if (!isAct(hv)) { emit("remove-group", { groupId: hv }); return; }
    const aid = actId(hv);
    if (aid !== ADD) emit("remove-action", { groupId: hv.slice(0, hv.indexOf(":")), actionId: aid });
  }
}

export function initEdit(): void {
  addEventListener("pointerdown", onDown);
  addEventListener("pointermove", onMove);
  addEventListener("pointerup", onUp);
  addEventListener("pointercancel", onCancel);
  addEventListener("contextmenu", onContext);
  const root = document.documentElement;
  root.addEventListener("pointerleave", onLeave);
  root.addEventListener("mouseleave", onLeave);
}
