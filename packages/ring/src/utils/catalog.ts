import { CFG, type Group } from "../state/sim";
import { CAT, GI, DEFAULT_GROUPS as BASE_GROUPS, FALLBACK_ICON, RING_MAX_GROUPS, pluginImage, type RingCatalogEntry, type RingCatalog } from "@orbitring/shared/src/ring-catalog";
import { t } from "../i18n";

export { CAT, GI, FALLBACK_ICON, pluginImage };
export const DEFAULT_GROUPS = BASE_GROUPS.map((g) => ({ ...g, name: t.dyn(`catalog.defaultGroups.${g.id}`) }));
export type CatEntry = RingCatalogEntry;
export type Catalog = RingCatalog;

export interface RawGroup { id: string | number; name?: string; icon?: string; actions?: string[] }
export function sanitize(gs: RawGroup[] | undefined | null, keepEmpty?: boolean): Group[] {
  return (gs || []).slice(0, RING_MAX_GROUPS).map(g => ({ id: String(g.id), name: g.name || String(g.id), icon: g.icon as string,
    actions: (g.actions || []).slice(0, CFG.MA) })).filter(g => keepEmpty || g.actions.length);
}

export function iconMarkup(s: string | null | undefined): string {
  if (!s) return "";
  const m = /^\s*(?:<\?xml[^>]*>\s*)?<svg\b[^>]*>([\s\S]*)<\/svg>\s*$/i.exec(s);
  return m ? m[1] : s;
}

export const pluginState: Record<string, boolean> = {};

export interface PluginDisplay {
  active?: boolean;
  value?: number;
  text?: string;
  label?: string;
  status?: "green" | "amber" | "red";
}
export const pluginDisplay: Record<string, PluginDisplay> = {};
export function normDisplay(v: unknown): PluginDisplay | null {
  if (typeof v === "boolean") return { active: v };
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>, d: PluginDisplay = {};
  if (typeof o.active === "boolean") d.active = o.active;
  if (typeof o.value === "number" && isFinite(o.value)) d.value = Math.max(0, Math.min(100, o.value));
  if (typeof o.text === "string" && o.text) d.text = o.text;
  if (typeof o.label === "string" && o.label) d.label = o.label;
  if (o.status === "green" || o.status === "amber" || o.status === "red") d.status = o.status;
  return d;
}

export function actionSvg(aid: string): string {
  const c = CAT[aid];
  if (!c) return FALLBACK_ICON;
  return c.sActive && pluginState[aid] === true ? c.sActive : c.s;
}
export function actionImage(aid: string): string | undefined {
  const c = CAT[aid];
  return c ? c.img : undefined;
}
export function keepsIcon(aid: string): boolean {
  const c = CAT[aid];
  return !!(c && c.k);
}
export function actionLabel(aid: string): string {
  const d = pluginDisplay[aid], c = CAT[aid];
  if (d && d.label) return d.label;
  if (c && c.l) return c.l;
  return c && t.has(`catalog.actions.${aid}`) ? t.dyn(`catalog.actions.${aid}`) : aid;
}
