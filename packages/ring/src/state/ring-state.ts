import { signal } from "@preact/signals";
import { CFG, E, S, sim, type Group } from "./sim";
import { ED, editSig } from "./edit";
import { CAT, FALLBACK_ICON, iconMarkup, normDisplay, pluginDisplay, pluginImage, pluginState, sanitize, type RawGroup } from "../utils/catalog";
import { actId, gIdx, initNodes, isAct, slotIds } from "../utils/geometry";
import { isTheme, setTheme } from "../utils/themes";
import { applyLocaleSetting } from "../i18n";
import { setStyle } from "../utils/math";
import { cancelDrag, pinSnap } from "../hooks/useEdit";

export const groupsSig = signal<Group[]>([]);
export const iconVersion = signal(0);

let lastRaw: RawGroup[] | null = null;

export function setGroups(gs: Group[]): void {
  S.groups = gs;
  if (S.activeGroup && gIdx(S.activeGroup) < 0) { S.activeGroup = null; S.hover = null; }
  if (S.hover) {
    const act = isAct(S.hover), g = gs[gIdx(act ? S.hover.slice(0, S.hover.indexOf(":")) : S.hover)];
    if (!g || (act && slotIds(g).indexOf(actId(S.hover)) < 0)) S.hover = g && S.activeGroup === g.id ? g.id : null;
  }
  groupsSig.value = gs;
  const old = ED.on ? sim.nodes : null;
  initNodes(true);
  if (old) {
    for (const id in sim.nodes) { if (old[id]) sim.nodes[id] = old[id]; else sim.nodes[id].s = 0; }
  }
}

export function setEdit(on: boolean): void {
  if (ED.on === on) return;
  cancelDrag();
  ED.on = on;
  document.documentElement.classList.toggle("edit", on);
  editSig.value = on;
  if (on) {
    if (!S.isOpen) { S.isOpen = true; S.shownAt = S.lastMove = performance.now(); }
    S.visible = true;
  } else {
    for (const k in E.nodes) { setStyle(E.nodes[k].n, "pointerEvents", ""); setStyle(E.nodes[k].n, "zIndex", ""); }
  }
  setGroups(lastRaw ? sanitize(lastRaw, on) : S.groups);
}

export interface PluginAction {
  id: string; name?: string; icon?: string; iconActive?: string; keepIcon?: boolean;
  image?: string;
}
export interface RingConfig {
  locale?: string;
  theme?: string;
  accent?: string;
  liquid?: boolean;
  ascii?: boolean;
  revealDelay?: number | string;
  reduceMotion?: boolean;
  groups?: RawGroup[];
  pluginActions?: PluginAction[];
  pluginStates?: Record<string, Record<string, unknown>>;
  edit?: boolean;
  selected?: string | null;
}

export function applyConfig(cfg: RingConfig): void {
  if (!cfg) return;
  if (cfg.locale !== undefined && applyLocaleSetting(cfg.locale)) return;
  if (cfg.theme) setTheme(isTheme(cfg.theme) ? cfg.theme : "dark", false);
  if (cfg.accent) {
    document.documentElement.style.setProperty("--acc", cfg.accent);
    document.documentElement.style.setProperty("--glow", /^#[0-9a-f]{6}$/i.test(cfg.accent) ? cfg.accent + "55" : "rgba(198,244,50,.33)");
  }
  if (cfg.liquid != null) CFG.liquid = !!cfg.liquid;
  if (cfg.ascii != null) CFG.ascii = !!cfg.ascii;
  if (cfg.revealDelay != null) CFG.revealDelay = +cfg.revealDelay;
  if (cfg.reduceMotion != null) S.reduce = !!cfg.reduceMotion;
  let applyGroups = !!cfg.groups;
  if (cfg.groups) {
    lastRaw = cfg.groups;
    if (ED.drag && cfg.edit !== false && ED.drag.snap === JSON.stringify(sanitize(cfg.groups, true))) applyGroups = false;
    else cancelDrag();
  }
  if (cfg.edit != null) setEdit(!!cfg.edit);
  if (cfg.selected !== undefined) ED.selected = cfg.selected == null ? null : String(cfg.selected);
  let changed = false;
  if (cfg.pluginActions) {
    cfg.pluginActions.forEach(pa => {
      if (pa.id) {
        const prev = CAT[pa.id], l = pa.name || pa.id;
        const s = iconMarkup(pa.icon) || FALLBACK_ICON, sActive = iconMarkup(pa.iconActive) || null;
        const k = pa.keepIcon === true;
        const img = pluginImage(pa.image);
        if (!prev || prev.s !== s || prev.sActive !== sActive || prev.l !== l || !!prev.k !== k || prev.img !== img) changed = true;
        const entry: typeof CAT[string] = { c: "plugins", a: { type: "system", action: pa.id }, l, s, sActive, k };
        if (img) entry.img = img;
        CAT[pa.id] = entry;
      }
    });
  }
  if (cfg.groups && applyGroups) setGroups(sanitize(cfg.groups, ED.on));
  if (cfg.pluginStates) {
    for (const pid in cfg.pluginStates) {
      const ps: Record<string, unknown> = cfg.pluginStates[pid] || {};
      for (const aid of Object.keys(ps)) {
        const key = "plugin:" + pid + ":" + aid, d = normDisplay(ps[aid]);
        if (!d) continue;
        if (JSON.stringify(pluginDisplay[key] || null) === JSON.stringify(d)) continue;
        pluginDisplay[key] = d;
        if (d.active != null) pluginState[key] = d.active; else delete pluginState[key];
        changed = true;
      }
    }
  }
  if (changed) iconVersion.value++;
  if (ED.on && !ED.inside && !ED.drag) pinSnap();
}
