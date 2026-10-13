import type { RingGroup, RingSettings } from "@orbitring/shared";
import { RING_MAX_ACTIONS } from "./catalog";

export type Draft = RingSettings;

function withGroups(d: Draft, groups: RingGroup[]): Draft {
  return { ...d, groups };
}

function mapGroup(d: Draft, id: string, fn: (g: RingGroup) => RingGroup): Draft {
  let changed = false;
  const groups = d.groups.map((g) => {
    if (g.id !== id) return g;
    const n = fn(g);
    if (n !== g) changed = true;
    return n;
  });
  return changed ? withGroups(d, groups) : d;
}

export function findGroup(d: Draft, id: string | null | undefined): RingGroup | undefined {
  return id == null ? undefined : d.groups.find((g) => g.id === id);
}

export function newGroupId(d: Draft): string {
  let id: string;
  do {
    id = "grp_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  } while (d.groups.some((g) => g.id === id));
  return id;
}

export function uniqueName(d: Draft, base: string): string {
  const names = new Set(d.groups.map((g) => g.name));
  if (!names.has(base)) return base;
  for (let i = 2; ; i++) {
    const n = `${base} ${i}`;
    if (!names.has(n)) return n;
  }
}

export function addGroup(d: Draft, group: RingGroup, index?: number): Draft {
  const groups = d.groups.slice();
  const at = index == null ? groups.length : Math.max(0, Math.min(groups.length, index));
  groups.splice(at, 0, group);
  return withGroups(d, groups);
}

export function removeGroup(d: Draft, id: string): Draft {
  if (!d.groups.some((g) => g.id === id)) return d;
  return withGroups(d, d.groups.filter((g) => g.id !== id));
}

export function renameGroup(d: Draft, id: string, name: string): Draft {
  return mapGroup(d, id, (g) => (g.name === name ? g : { ...g, name }));
}

export function setGroupIcon(d: Draft, id: string, icon: string): Draft {
  return mapGroup(d, id, (g) => (g.icon === icon ? g : { ...g, icon }));
}

export function duplicateGroup(d: Draft, id: string, newId: string): Draft {
  const i = d.groups.findIndex((g) => g.id === id);
  if (i < 0) return d;
  const src = d.groups[i];
  const copy: RingGroup = {
    ...src,
    id: newId,
    name: uniqueName(d, `${src.name} (cópia)`),
    actions: src.actions.slice(),
  };
  return addGroup(d, copy, i + 1);
}

export function moveGroupTo(d: Draft, id: string, index: number): Draft {
  const from = d.groups.findIndex((g) => g.id === id);
  if (from < 0) return d;
  const to = Math.max(0, Math.min(d.groups.length - 1, index));
  if (to === from) return d;
  const groups = d.groups.slice();
  const [m] = groups.splice(from, 1);
  groups.splice(to, 0, m);
  return withGroups(d, groups);
}

function isPermutation(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  if (new Set(b).size !== b.length) return false;
  const sa = a.slice().sort();
  const sb = b.slice().sort();
  return sa.every((v, i) => v === sb[i]);
}

export function reorderGroups(d: Draft, ids: readonly string[]): Draft {
  const current = d.groups.map((g) => g.id);
  if (!isPermutation(current, ids)) return d;
  if (current.every((v, i) => v === ids[i])) return d;
  const byId = new Map(d.groups.map((g) => [g.id, g] as const));
  return withGroups(d, ids.map((id) => byId.get(id) as RingGroup));
}

export type AddRefusal = "no-group" | "full" | "duplicate";

export function canAddAction(d: Draft, groupId: string | null | undefined, actionId: string): AddRefusal | null {
  const g = findGroup(d, groupId);
  if (!g) return "no-group";
  if (g.actions.includes(actionId)) return "duplicate";
  if (g.actions.length >= RING_MAX_ACTIONS) return "full";
  return null;
}

export function addAction(d: Draft, groupId: string, actionId: string, index?: number): Draft {
  if (canAddAction(d, groupId, actionId)) return d;
  return mapGroup(d, groupId, (g) => {
    const actions = g.actions.slice();
    const at = index == null ? actions.length : Math.max(0, Math.min(actions.length, index));
    actions.splice(at, 0, actionId);
    return { ...g, actions };
  });
}

export function removeAction(d: Draft, groupId: string, actionId: string): Draft {
  return mapGroup(d, groupId, (g) =>
    g.actions.includes(actionId) ? { ...g, actions: g.actions.filter((a) => a !== actionId) } : g,
  );
}

export function replaceAction(d: Draft, groupId: string, oldId: string, newId: string): Draft {
  if (oldId === newId) return d;
  return mapGroup(d, groupId, (g) => {
    if (!g.actions.includes(oldId) || g.actions.includes(newId)) return g;
    return { ...g, actions: g.actions.map((a) => (a === oldId ? newId : a)) };
  });
}

export function reorderActions(d: Draft, groupId: string, actions: readonly string[]): Draft {
  return mapGroup(d, groupId, (g) => {
    if (!isPermutation(g.actions, actions)) return g;
    if (g.actions.every((v, i) => v === actions[i])) return g;
    return { ...g, actions: actions.slice() };
  });
}

export function moveActionTo(d: Draft, groupId: string, actionId: string, index: number): Draft {
  return mapGroup(d, groupId, (g) => {
    const from = g.actions.indexOf(actionId);
    if (from < 0) return g;
    const to = Math.max(0, Math.min(g.actions.length - 1, index));
    if (to === from) return g;
    const actions = g.actions.slice();
    actions.splice(from, 1);
    actions.splice(to, 0, actionId);
    return { ...g, actions };
  });
}

export type MoveRefusal = "invalid" | "full" | "duplicate";

export function canMoveAction(d: Draft, fromId: string, toId: string, actionId: string): MoveRefusal | null {
  const from = findGroup(d, fromId);
  const to = findGroup(d, toId);
  if (!from || !to || from === to || !from.actions.includes(actionId)) return "invalid";
  if (to.actions.includes(actionId)) return "duplicate";
  if (to.actions.length >= RING_MAX_ACTIONS) return "full";
  return null;
}

export function moveAction(d: Draft, fromId: string, toId: string, actionId: string): Draft {
  if (canMoveAction(d, fromId, toId, actionId)) return d;
  return addAction(removeAction(d, fromId, actionId), toId, actionId);
}
