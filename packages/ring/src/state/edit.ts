import { signal } from "@preact/signals";

export interface DragState {
  key: string;
  kind: "group" | "action";
  gid: string;
  aid: string | null;
  x: number; y: number;
  orig: string[];
  overHub: boolean;
  dropGid: string | null;
  pointerId: number;
  snap: string;
}

export const ED = {
  on: false,
  selected: null as string | null,
  inside: false,
  drag: null as DragState | null,
};

export const editSig = signal(false);

export const ADD = "+";
export const ADD_LABEL = "Adicionar ação";

export const hasParent = (): boolean => { try { return window.parent !== window; } catch (e) { return false; } };

export function emit(type: string, data?: Record<string, unknown>): void {
  if (!hasParent()) return;
  try { window.parent.postMessage({ source: "orbit-ring", type, ...(data || {}) }, "*"); } catch (e) {  }
}
