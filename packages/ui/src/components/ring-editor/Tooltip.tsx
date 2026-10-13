import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface TipState {
  text: string;
  rect: DOMRect;
}

const SHOW_DELAY_MS = 350;

export function TooltipLayer() {
  const [tip, setTip] = useState<TipState | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let current: Element | null = null;

    const hide = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      current = null;
      setTip(null);
    };
    const arm = (el: Element, delay: number) => {
      if (el === current) return;
      hide();
      current = el;
      timer = setTimeout(() => {
        if (!el.isConnected) return;
        const text = el.getAttribute("data-tip");
        if (text) setTip({ text, rect: el.getBoundingClientRect() });
      }, delay);
    };
    const find = (t: EventTarget | null) => (t instanceof Element ? t.closest("[data-tip]") : null);

    const onOver = (e: MouseEvent) => {
      const el = find(e.target);
      if (el) arm(el, SHOW_DELAY_MS);
      else if (current) hide();
    };
    const onFocus = (e: FocusEvent) => {
      const el = find(e.target);
      if (el && e.target instanceof Element && e.target.matches(":focus-visible")) arm(el, 150);
    };
    document.addEventListener("mouseover", onOver);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", hide);
    document.addEventListener("mousedown", hide, true);
    document.addEventListener("keydown", hide, true);
    document.addEventListener("scroll", hide, true);
    document.addEventListener("dragstart", hide, true);
    document.documentElement.addEventListener("mouseleave", hide);
    window.addEventListener("blur", hide);
    return () => {
      hide();
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("mousedown", hide, true);
      document.removeEventListener("keydown", hide, true);
      document.removeEventListener("scroll", hide, true);
      document.removeEventListener("dragstart", hide, true);
      document.documentElement.removeEventListener("mouseleave", hide);
      window.removeEventListener("blur", hide);
    };
  }, []);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!tip || !box) {
      setPos(null);
      return;
    }
    const w = box.offsetWidth;
    const h = box.offsetHeight;
    const gap = 6;
    let left = tip.rect.left + tip.rect.width / 2 - w / 2;
    left = Math.max(8, Math.min(window.innerWidth - 8 - w, left));
    let top = tip.rect.bottom + gap;
    if (top + h > window.innerHeight - 8) top = tip.rect.top - gap - h;
    setPos({ left, top: Math.max(8, top) });
  }, [tip]);

  if (!tip) return null;
  return createPortal(
    <div
      ref={boxRef}
      role="tooltip"
      className="re-layer pointer-events-none fixed z-[200] max-w-[260px] rounded-md border border-[#33333B] bg-[#1E1E24] px-2 py-1 text-[11px] leading-snug text-[#efeee7] shadow-lg shadow-black/40"
      style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden" }}
    >
      {tip.text}
    </div>,
    document.body,
  );
}
