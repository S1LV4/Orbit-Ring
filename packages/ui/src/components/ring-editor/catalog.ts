import {
  CAT,
  GI,
  RING_CATEGORIES,
  GROUP_ICON_LABELS,
  RING_MAX_ACTIONS,
  RING_MAX_GROUPS,
  FALLBACK_ICON,
  pluginImage,
} from "@orbitring/shared/src/ring-catalog";

export { GI, GROUP_ICON_LABELS, RING_MAX_ACTIONS, RING_MAX_GROUPS, FALLBACK_ICON, pluginImage };

export interface PluginActionLike {
  id: string;
  name: string;
  icon?: string;
  iconActive?: string;
  keepIcon?: boolean;
  image?: string;
  description?: string;
}
export interface PluginLike {
  id: string;
  name: string;
  actions?: PluginActionLike[];
}

export interface ActionDef {
  id: string;
  label: string;
  category: string;
  icon: string;
  image?: string;
  description?: string;
  known: boolean;
  search: string;
}

export interface ActionCategory {
  name: string;
  actions: ActionDef[];
}

export interface RingPluginAction {
  id: string;
  name: string;
  icon?: string;
  iconActive?: string;
  keepIcon?: boolean;
  image?: string;
}

export interface ActionCatalog {
  byId: Map<string, ActionDef>;
  categories: ActionCategory[];
  pluginActions: RingPluginAction[];
}

export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function toInnerMarkup(icon: string | undefined | null): string | undefined {
  if (typeof icon !== "string") return undefined;
  let s = icon.trim();
  if (!s) return undefined;
  s = s.replace(/^<\?xml[^>]*\?>\s*/i, "");
  const m = /^<svg\b[^>]*>([\s\S]*)<\/svg>\s*$/i.exec(s);
  if (m) s = m[1].trim();
  s = s
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<foreignObject\b[\s\S]*?<\/foreignObject\s*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href\s*=\s*["']?)\s*javascript:[^"'\s>]*/gi, "$1#");
  return s || undefined;
}

export function pluginActionId(pluginId: string, actionId: string): string {
  return `plugin:${pluginId}:${actionId}`;
}

function def(id: string, label: string, category: string, icon: string, description?: string): ActionDef {
  return {
    id,
    label,
    category,
    icon,
    description,
    known: true,
    search: normalizeText(`${label} ${id} ${category}`),
  };
}

export function buildCatalog(plugins: readonly PluginLike[] = []): ActionCatalog {
  const byId = new Map<string, ActionDef>();
  const buckets = new Map<string, ActionDef[]>();
  const order: string[] = [...RING_CATEGORIES];
  const push = (d: ActionDef) => {
    if (byId.has(d.id)) return;
    byId.set(d.id, d);
    let list = buckets.get(d.category);
    if (!list) {
      list = [];
      buckets.set(d.category, list);
      if (!order.includes(d.category)) order.push(d.category);
    }
    list.push(d);
  };

  for (const id of Object.keys(CAT)) {
    const e = CAT[id];
    if (id.startsWith("plugin:")) continue;
    push(def(id, e.l || id, e.c || "Outros", e.s || FALLBACK_ICON));
  }

  const pluginActions: RingPluginAction[] = [];
  for (const p of plugins) {
    if (!p || !p.id) continue;
    const category = `Plugin · ${p.name || p.id}`;
    for (const a of p.actions ?? []) {
      if (!a || !a.id) continue;
      const id = pluginActionId(p.id, a.id);
      const icon = toInnerMarkup(a.icon);
      const iconActive = toInnerMarkup(a.iconActive);
      const image = pluginImage(a.image);
      const d = def(id, a.name || a.id, category, icon ?? FALLBACK_ICON, a.description);
      if (image) d.image = image;
      push(d);
      const pa: RingPluginAction = { id, name: a.name || a.id, icon, iconActive };
      if (a.keepIcon === true) pa.keepIcon = true;
      if (image) pa.image = image;
      pluginActions.push(pa);
    }
  }

  const categories = order
    .map((name) => ({ name, actions: buckets.get(name) ?? [] }))
    .filter((c) => c.actions.length > 0);
  return { byId, categories, pluginActions };
}

export function resolveAction(catalog: ActionCatalog, id: string): ActionDef {
  return (
    catalog.byId.get(id) ?? {
      id,
      label: id,
      category: "Indisponível",
      icon: FALLBACK_ICON,
      known: false,
      search: normalizeText(id),
    }
  );
}

export function filterCategories(catalog: ActionCatalog, query: string): ActionCategory[] {
  const terms = normalizeText(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return catalog.categories;
  const out: ActionCategory[] = [];
  for (const c of catalog.categories) {
    const actions = c.actions.filter((a) => terms.every((t) => a.search.includes(t)));
    if (actions.length) out.push({ name: c.name, actions });
  }
  return out;
}

export function groupIconMarkup(icon: string | undefined): string {
  return (icon && GI[icon]) || FALLBACK_ICON;
}

export const GROUP_ICON_IDS: string[] = Object.keys(GI);
