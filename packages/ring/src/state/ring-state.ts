import { signal } from "@preact/signals";

/** Index of the currently hovered button, or -1 */
export const hovered = signal(-1);

/** Whether the ring is currently visible */
export const visible = signal(false);

/** Smooth animated line strength per button (mutated by animation loop) */
export const lineSmooth: { str: number }[] = Array.from({ length: 8 }, () => ({ str: 0 }));

/** Target line strength per button */
export const lineTargets: { str: number }[] = Array.from({ length: 8 }, () => ({ str: 0 }));

/** Mutable state object for animation values (avoids ESM live binding issues with esbuild IIFE) */
export const anim = {
  centerGlow: 0,
  centerGlowTarget: 0,
  mouseX: 160,
  mouseY: 160,
};

/** Constants */
export const CX = 160;
export const CY = 160;
export const HOVER_RADIUS = 40;
export const LINE_FADE_RADIUS = 120;
