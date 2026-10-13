import { host } from "../state/sim";

export const THEMES = ["dark", "orange", "neg-orange", "neg", "light"] as const;
export type Theme = typeof THEMES[number];
const NON_DEFAULT = ["light", "neg", "orange", "neg-orange"];

export function isTheme(t: unknown): t is Theme { return typeof t === "string" && (THEMES as readonly string[]).includes(t); }

export function setTheme(t: string, save?: boolean): void {
  const root = document.documentElement;
  root.classList.remove(...NON_DEFAULT);
  if (t !== "dark") root.classList.add(t);
  if (save) {
    try { localStorage.setItem("ring-theme", t); } catch (e) {  }
    try { const h = host(); h && h.setTheme && h.setTheme(t); } catch (e) {  }
  }
}

export function currentTheme(): Theme {
  const cl = document.documentElement.classList;
  for (const t of THEMES) if (t !== "dark" && cl.contains(t)) return t;
  return "dark";
}

export function storedTheme(): string {
  let t = "dark";
  try { t = localStorage.getItem("ring-theme") || t; } catch (e) {  }
  return t;
}
