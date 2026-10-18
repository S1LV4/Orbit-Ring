export interface Node { x: number; y: number; s: number; vx: number; vy: number; vs: number }
export interface Target { x: number; y: number; s: number; d: number }
export interface Drop { x: number; y: number; vx: number; vy: number; s: number; vs: number }
export interface Part { p: number; arm: number; sz: number; tw: number; white: boolean }
export interface SectorState { a: number | null; w: number; on: boolean }

export interface Group { id: string; name: string; icon: string; actions: string[] }

export const CFG = {
  R1: 75, R2: 150, STEP: 28,
  DZ: 22,
  HYST: 8,
  revealDelay: 120,
  revealMax: 320,
  liquid: true, ascii: true, MA: 8,
};

export const sim = {
  f: 0, t: 0, change: 0,
  nodes: {} as Record<string, Node>,
  tgt: {} as Record<string, Target>,
  drops: [] as Drop[],
  openP: 0, flow: 0, burst: 0,
  parts: [] as Part[],
  lastPath: null as { x: number; y: number }[] | null,
  sec1: { a: null, w: 60, on: false } as SectorState,
  sec2: { a: null, w: 28, on: false } as SectorState,
};
for (let i = 0; i < 7; i++) sim.drops.push({ x: 0, y: 0, vx: 0, vy: 0, s: 0, vs: 0 });
for (let i = 0; i < 30; i++) {
  const h = Math.sin(i * 91.7) * 43758.5453, r = h - Math.floor(h);
  sim.parts.push({ p: i / 30, arm: i % 2, sz: 1.4 + r * 2, tw: r * 6.28, white: i % 3 === 0 });
}
export const DROP_SIZES = [12, 11, 10, 10, 10, 11, 12];

export const S = {
  groups: [] as Group[],
  isOpen: false, visible: false,
  activeGroup: null as string | null,
  hover: null as string | null,
  dx: 0, dy: 0, shownAt: 0, lastMove: 0,
  CX: 0, CY: 0, center: null as { x: number; y: number } | null,
  inset: { l: 0, t: 0, r: 0, b: 0 },
  reduce: typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches,
};

export const A = { cw: 4.2, lh: 8, box: 440, cols: 0, rows: 0 };

export interface NodeRef { n: HTMLElement; b: HTMLElement; base: string }
export const E = {
  ascDim: null as HTMLElement | null, ascMid: null as HTMLElement | null, ascAcc: null as HTMLElement | null,
  sec1: null as HTMLElement | null, sec2: null as HTMLElement | null,
  goo: null as HTMLElement | null, hubDrop: null as HTMLElement | null,
  drops: [] as HTMLElement[],
  stars: null as HTMLElement | null, star: [] as HTMLElement[],
  breathe: null as HTMLElement | null,
  layer: null as HTMLElement | null,
  hN: null as HTMLElement | null, hB: null as HTMLElement | null,
  vcur: null as HTMLElement | null, bal: null as HTMLElement | null, toast: null as HTMLElement | null,
  nodes: {} as Record<string, NodeRef>,
};

export interface RingHost {
  executeAction?: (a: unknown) => void;
  close?: () => void;
  setTheme?: (t: string) => void;
  onConfig?: (cb: (cfg: unknown) => void) => void;
  onShow?: (cb: (d?: unknown) => void) => void;
  onRelease?: (cb: () => void) => void;
  onHide?: (cb: () => void) => void;
  hidden?: () => void;
}
export const host = (): RingHost | undefined => (window as unknown as { ring?: RingHost }).ring;
export const hostMode = !!(host() && typeof host()!.onShow === "function");
