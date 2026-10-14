import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Search } from "lucide-react";
import type { RingGroup } from "@orbitring/shared";
import { ActionIcon } from "./ActionIcon";
import { filterCategories, resolveAction, type ActionCatalog, type ActionDef } from "./catalog";
import { useDismiss, useFloatingStyle, type Anchor } from "./floating";
import { t } from "../../i18n";

interface ActionPickerProps {
  anchor: Anchor;
  catalog: ActionCatalog;
  group: RingGroup;
  replaceId?: string | null;
  onPick: (actionId: string) => void;
  onClose: () => void;
}

export function ActionPicker({ anchor, catalog, group, replaceId, onPick, onClose }: ActionPickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const style = useFloatingStyle(ref, anchor);
  useDismiss(ref, onClose);

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  const categories = useMemo(() => filterCategories(catalog, query), [catalog, query]);
  const taken = useMemo(() => new Set(group.actions), [group.actions]);
  const pickable = useMemo(() => {
    const out: ActionDef[] = [];
    for (const c of categories) for (const a of c.actions) if (!taken.has(a.id)) out.push(a);
    return out;
  }, [categories, taken]);

  useEffect(() => setActive(0), [query]);
  const activeId = pickable[Math.min(active, pickable.length - 1)]?.id ?? null;

  useEffect(() => {
    if (!activeId) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-action-id="${CSS.escape(activeId)}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (pickable.length) setActive((i) => (Math.min(i, pickable.length - 1) + 1) % pickable.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (pickable.length) setActive((i) => (Math.min(i, pickable.length - 1) - 1 + pickable.length) % pickable.length);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(Math.max(0, pickable.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeId) onPick(activeId);
    } else if (e.key === "Tab") {
      e.preventDefault();
    }
  };

  const title = replaceId
    ? t("editor.picker.replaceTitle", { action: resolveAction(catalog, replaceId).label })
    : t("editor.picker.addTitle", { group: group.name || t("editor.main.unnamed") });

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={title}
      data-testid="action-picker"
      onKeyDown={onKeyDown}
      className="re-layer z-110 flex max-h-[min(400px,calc(100vh-60px))] w-[280px] flex-col overflow-hidden rounded-xl border border-orbit-border bg-orbit-card shadow-2xl shadow-black/60"
      style={style}
    >
      <div className="border-b border-orbit-border p-2">
        <div className="truncate px-1 pb-1.5 text-[11px] font-medium text-[#A1A1AA]" data-testid="picker-title">
          {title}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-orbit-text-muted" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="re-picker-list"
            aria-activedescendant={activeId ? `re-pick-${activeId}` : undefined}
            aria-label={t("editor.picker.search")}
            data-testid="picker-search"
            value={query}
            placeholder={t("editor.picker.placeholder")}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
            className="re-input h-8 w-full pl-8 pr-2 text-[13px]"
          />
        </div>
      </div>

      <div ref={listRef} id="re-picker-list" role="listbox" aria-label={t("editor.picker.list")} className="min-h-0 flex-1 overflow-y-auto p-1">
        {categories.length === 0 && (
          <p className="px-3 py-6 text-center text-[12px] text-[#8B8B95]" data-testid="picker-empty">
            {t("editor.picker.noResults", { query: query.trim() })}
          </p>
        )}
        {categories.map((c) => (
          <div key={c.name} role="group" aria-label={c.name}>
            <div className="px-2 pb-0.5 pt-2 text-[11px] font-semibold text-[#8B8B95]">{c.name}</div>
            {c.actions.map((a) => {
              const isTaken = taken.has(a.id);
              const isActive = a.id === activeId;
              return (
                <div
                  key={a.id}
                  id={`re-pick-${a.id}`}
                  role="option"
                  aria-selected={isActive}
                  aria-disabled={isTaken}
                  data-testid="picker-item"
                  data-action-id={a.id}
                  data-active={isActive}
                  onMouseMove={() => {
                    const i = pickable.indexOf(a);
                    if (i >= 0 && i !== active) setActive(i);
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    if (!isTaken) onPick(a.id);
                  }}
                  className={`flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] ${
                    isTaken
                      ? "cursor-not-allowed text-[#5F5F68]"
                      : isActive
                        ? "cursor-pointer bg-[#26262E] text-orbit-text"
                        : "cursor-pointer text-[#D4D4D8]"
                  }`}
                >
                  <ActionIcon action={a} size={15} className={isActive ? "text-(--accent)" : ""} />
                  <span className="min-w-0 flex-1 truncate">{a.label}</span>
                  {isTaken && (
                    <span className="shrink-0 text-[11px] text-orbit-text-muted">
                      {a.id === replaceId ? t("editor.picker.current") : t("editor.picker.inGroup")}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 border-t border-orbit-border px-3 py-1.5 text-[11px] text-[#8B8B95]">
        <span>
          <kbd className="font-mono text-[#A1A1AA]">↑↓</kbd> {t("editor.picker.navigate")}
        </span>
        <span>
          <kbd className="font-mono text-[#A1A1AA]">Enter</kbd> {t("editor.picker.choose")}
        </span>
        <span>
          <kbd className="font-mono text-[#A1A1AA]">Esc</kbd> {t("editor.picker.close")}
        </span>
      </div>
    </div>,
    document.body,
  );
}
