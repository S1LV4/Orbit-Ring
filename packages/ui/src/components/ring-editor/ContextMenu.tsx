import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import { SvgIcon } from "./SvgIcon";
import { GI, GROUP_ICON_IDS, groupIconLabel } from "./catalog";
import { useDismiss, useFloatingStyle, type Anchor } from "./floating";
import { t } from "../../i18n";

export type MenuEntry =
  | {
      kind: "item";
      label: string;
      icon?: ReactNode;
      danger?: boolean;
      disabled?: boolean;
      note?: string;
      onSelect: () => void;
    }
  | { kind: "separator" }
  | { kind: "label"; label: string }
  | { kind: "icons"; label: string; icon?: ReactNode; value: string; onPick: (icon: string) => void };

interface ContextMenuProps {
  anchor: Anchor;
  title: string;
  entries: MenuEntry[];
  onClose: () => void;
}

const ITEM =
  "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[12px] leading-5 outline-hidden transition-colors";

export function ContextMenu({ anchor, title, entries, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [iconsOpen, setIconsOpen] = useState(false);
  const style = useFloatingStyle(ref, anchor);
  useDismiss(ref, onClose);

  useEffect(() => {
    const first = ref.current?.querySelector<HTMLElement>("[data-menu-item]:not([aria-disabled='true'])");
    first?.focus({ preventScroll: true });
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      ref.current?.querySelectorAll<HTMLElement>("[data-menu-item]:not([aria-disabled='true'])") ?? [],
    );
    if (!items.length) return;
    const i = items.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") next = (i + 1) % items.length;
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") next = (i - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    else if (e.key === "Tab") {
      e.preventDefault();
      onClose();
      return;
    }
    if (next >= 0) {
      e.preventDefault();
      items[next].focus({ preventScroll: true });
    }
  };

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={title}
      data-testid="context-menu"
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      className="re-layer z-120 w-[232px] rounded-xl border border-orbit-border bg-orbit-card p-1 shadow-2xl shadow-black/60"
      style={style}
    >
      <div className="truncate px-2.5 pb-1 pt-1.5 text-[11px] font-medium text-[#8B8B95]">{title}</div>
      {entries.map((entry, i) => {
        if (entry.kind === "separator") {
          return <div key={i} role="separator" className="mx-1 my-1 h-px bg-orbit-border" />;
        }
        if (entry.kind === "label") {
          return (
            <div key={i} className="px-2.5 pb-0.5 pt-1.5 text-[11px] font-medium text-[#8B8B95]">
              {entry.label}
            </div>
          );
        }
        if (entry.kind === "icons") {
          return (
            <div key={i}>
              <button
                type="button"
                role="menuitem"
                data-menu-item
                aria-expanded={iconsOpen}
                onClick={() => setIconsOpen((o) => !o)}
                className={`${ITEM} text-orbit-text-dim hover:bg-[#24242B] focus-visible:bg-[#24242B]`}
              >
                <span className="flex w-4 justify-center text-[#8B8B95]">{entry.icon}</span>
                <span className="flex-1">{entry.label}</span>
                {iconsOpen ? (
                  <ChevronDown className="h-3.5 w-3.5 text-[#8B8B95]" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-[#8B8B95]" />
                )}
              </button>
              {iconsOpen && (
                <div className="grid grid-cols-8 gap-0.5 px-1.5 pb-1.5 pt-1" role="group" aria-label={t("editor.menu.icons")}>
                  {GROUP_ICON_IDS.map((id) => {
                    const active = entry.value === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={active}
                        aria-label={groupIconLabel(id)}
                        data-tip={groupIconLabel(id)}
                        data-menu-item
                        onClick={() => {
                          entry.onPick(id);
                          onClose();
                        }}
                        className={`flex aspect-square w-full items-center justify-center rounded-md transition-colors ${
                          active
                            ? "bg-(--accent) text-orbit-bg"
                            : "text-[#A1A1AA] hover:bg-[#24242B] hover:text-orbit-text"
                        }`}
                      >
                        <SvgIcon markup={GI[id]} size={16} />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        }
        const disabled = !!entry.disabled;
        return (
          <button
            key={i}
            type="button"
            role="menuitem"
            data-menu-item
            aria-disabled={disabled}
            tabIndex={disabled ? -1 : 0}
            onClick={() => {
              if (disabled) return;
              onClose();
              entry.onSelect();
            }}
            className={`${ITEM} ${
              disabled
                ? "cursor-not-allowed text-[#5F5F68]"
                : entry.danger
                  ? "text-[#F87171] hover:bg-[#F87171]/10 focus-visible:bg-[#F87171]/10"
                  : "text-orbit-text-dim hover:bg-[#24242B] focus-visible:bg-[#24242B]"
            }`}
          >
            <span className={`flex w-4 justify-center ${entry.danger || disabled ? "" : "text-[#8B8B95]"}`}>
              {entry.icon}
            </span>
            <span className="min-w-0 flex-1 truncate">{entry.label}</span>
            {entry.note && <span className="shrink-0 text-[11px] text-orbit-text-muted">{entry.note}</span>}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
