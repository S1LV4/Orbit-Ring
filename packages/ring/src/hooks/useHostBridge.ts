import { E, S, host, hostMode } from "../state/sim";
import { ED, emit, hasParent } from "../state/edit";
import { DEFAULT_GROUPS, sanitize } from "../utils/catalog";
import { initNodes } from "../utils/geometry";
import { setTheme, storedTheme } from "../utils/themes";
import { applyConfig, setGroups, type RingConfig } from "../state/ring-state";
import { layout, render } from "./usePhysics";
import { initEdit } from "./useEdit";
import { fire, open, release, reset, resolveFire, updateSelection } from "./useSelection";

function followPointer(e: PointerEvent): void {
  if (!S.isOpen || ED.drag) return;
  S.dx = e.clientX - S.CX; S.dy = e.clientY - S.CY; S.lastMove = performance.now(); updateSelection();
}

export function initHostBridge(): void {
  setTheme(storedTheme(), false);

  if (hostMode) {
    const h = host()!;
    h.onConfig && h.onConfig(cfg => { applyConfig(cfg as RingConfig); if (S.isOpen) initNodes(S.visible); });
    h.onShow!((d) => {
      const show = d as { cx?: number; cy?: number; inset?: Partial<typeof S.inset> } | undefined;
      const i = show?.inset;
      S.inset = { l: +(i?.l || 0), t: +(i?.t || 0), r: +(i?.r || 0), b: +(i?.b || 0) };
      S.center = Number.isFinite(show?.cx) && Number.isFinite(show?.cy) ? { x: show!.cx!, y: show!.cy! } : null;
      layout();
      if (!S.groups.length) setGroups(sanitize(DEFAULT_GROUPS));
      open(true);
    });
    h.onRelease && h.onRelease(release);
    h.onHide && h.onHide(() => {
      reset(); render();
      requestAnimationFrame(() => requestAnimationFrame(() => h.hidden?.()));
    });
    addEventListener("pointerup", e => { if (e.button === 0 && S.isOpen && S.visible) release(); });
    addEventListener("pointermove", followPointer);
  } else {
    setGroups(sanitize(DEFAULT_GROUPS)); open(true);
    addEventListener("pointermove", followPointer);
    addEventListener("pointerup", e => {
      if (S.isOpen && !(E.hB && E.hB.contains(e.target as Node))) { const k = resolveFire(); if (k) fire(k); }
    });
    initEdit();
    if (hasParent()) {
      addEventListener("message", e => {
        if (e.source !== window.parent) return;
        const d = e.data as { target?: string; type?: string; cfg?: RingConfig } | null;
        if (!d || d.target !== "orbit-ring") return;
        if (d.type === "config" && d.cfg) applyConfig(d.cfg);
      });
      emit("ready");
    }
  }
}
