import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";

export interface Anchor {
  x: number;
  y: number;
  w?: number;
  h?: number;
}

const MARGIN = 8;
const TOP_SAFE = 44;

export function clampToViewport(anchor: Anchor, width: number, height: number): { left: number; top: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = anchor.x;
  if (left + width > vw - MARGIN) left = vw - MARGIN - width;
  if (left < MARGIN) left = MARGIN;
  const below = anchor.y + (anchor.h ?? 0);
  let top = below;
  if (top + height > vh - MARGIN) {
    const above = anchor.y - height;
    top = above >= TOP_SAFE ? above : vh - MARGIN - height;
  }
  if (top < TOP_SAFE) top = TOP_SAFE;
  return { left, top };
}

export function useFloatingStyle(ref: RefObject<HTMLElement>, anchor: Anchor): CSSProperties {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const { x, y, w, h } = anchor;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const place = () => {
      const next = clampToViewport({ x, y, w, h }, el.offsetWidth, el.offsetHeight);
      setPos((p) => (p && p.left === next.left && p.top === next.top ? p : next));
    };
    place();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(place) : null;
    ro?.observe(el);
    window.addEventListener("resize", place);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [ref, x, y, w, h]);

  return {
    position: "fixed",
    left: pos?.left ?? 0,
    top: pos?.top ?? 0,
    opacity: pos ? 1 : 0,
    pointerEvents: pos ? undefined : "none",
  };
}

export function useDismiss(ref: RefObject<HTMLElement>, onClose: () => void): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onDown = (e: MouseEvent) => {
      const el = ref.current;
      if (el && e.target instanceof Node && el.contains(e.target)) return;
      onCloseRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    const onBlur = () => onCloseRef.current();
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", onBlur);
      const el = ref.current;
      const active = document.activeElement;
      const lost = !active || active === document.body || (el != null && el.contains(active));
      if (lost && previous && previous.isConnected && previous.tagName !== "IFRAME") {
        previous.focus({ preventScroll: true });
      }
    };
  }, [ref]);
}

export function isTextInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    return !["checkbox", "radio", "button", "submit", "range", "color"].includes(target.type);
  }
  return false;
}
