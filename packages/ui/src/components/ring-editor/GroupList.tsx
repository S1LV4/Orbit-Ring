import { useCallback, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { GripVertical, MoreVertical, Plus } from "lucide-react";
import type { RingGroup } from "@orbitring/shared";
import { SvgIcon } from "./SvgIcon";
import { RING_MAX_ACTIONS, RING_MAX_GROUPS, groupIconMarkup } from "./catalog";
import { useDragReorder } from "./useDragReorder";
import { t } from "../../i18n";

interface GroupListProps {
  groups: RingGroup[];
  selectedId: string | null;
  renamingId: string | null;
  onRenamingChange: (id: string | null) => void;
  onSelect: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onMove: (id: string, toIndex: number) => void;
  onRemove: (id: string) => void;
  onMenu: (id: string, x: number, y: number) => void;
  onAdd: () => void;
}

function RenameInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (name: string, viaKeyboard: boolean) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  const ref = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const commit = (viaKeyboard: boolean) => {
    if (done.current) return;
    done.current = true;
    onCommit(value, viaKeyboard);
  };
  return (
    <input
      ref={ref}
      value={value}
      aria-label={t("editor.groups.nameLabel")}
      data-testid="group-rename-input"
      maxLength={40}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => commit(false)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          commit(true);
        } else if (e.key === "Escape") {
          e.preventDefault();
          done.current = true;
          onCancel();
        }
      }}
      className="re-input h-7 min-w-0 flex-1 px-2 text-[13px]"
    />
  );
}

export function GroupList({
  groups,
  selectedId,
  renamingId,
  onRenamingChange,
  onSelect,
  onRename,
  onMove,
  onRemove,
  onMenu,
  onAdd,
}: GroupListProps) {
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const focusNext = useRef<string | null>(null);

  useLayoutEffect(() => {
    const id = focusNext.current;
    if (!id) return;
    const el = rowRefs.current.get(id);
    if (el) {
      focusNext.current = null;
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: "nearest" });
    }
  });

  const moveByIndex = useCallback(
    (from: number, to: number) => {
      const g = groups[from];
      if (g) onMove(g.id, to);
    },
    [groups, onMove],
  );
  const { dragIndex, indicator, rowProps } = useDragReorder(groups.length, moveByIndex);

  const onRowKeyDown = (e: KeyboardEvent<HTMLDivElement>, g: RingGroup, index: number) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const delta = e.key === "ArrowUp" ? -1 : 1;
      const target = index + delta;
      if (target < 0 || target >= groups.length) return;
      if (e.altKey) {
        focusNext.current = g.id;
        onMove(g.id, target);
      } else {
        focusNext.current = groups[target].id;
        onSelect(groups[target].id);
      }
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      const target = groups[e.key === "Home" ? 0 : groups.length - 1];
      focusNext.current = target.id;
      onSelect(target.id);
    } else if (e.key === "F2") {
      e.preventDefault();
      onRenamingChange(g.id);
    } else if (e.key === "Delete") {
      e.preventDefault();
      const neighbour = groups[index + 1] ?? groups[index - 1];
      focusNext.current = neighbour?.id ?? null;
      onRemove(g.id);
    } else if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
      e.preventDefault();
      const r = e.currentTarget.getBoundingClientRect();
      onMenu(g.id, r.left + 40, r.bottom - 4);
    }
  };

  if (groups.length === 0) {
    return (
      <div className="px-4 pb-4 pt-1">
        <div className="rounded-lg border border-dashed border-orbit-border px-4 py-5 text-center">
          <p className="text-[12px] leading-relaxed text-[#A1A1AA]">{t("editor.groups.none")}</p>
          <button
            type="button"
            onClick={onAdd}
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-orbit-border bg-orbit-card px-3 py-1.5 text-[12px] font-medium text-orbit-text-dim hover:border-(--accent) hover:text-(--accent)"
          >
            <Plus className="h-3.5 w-3.5" /> {t("editor.groups.createFirst")}
          </button>
        </div>
      </div>
    );
  }

  const tabStopId = groups.some((g) => g.id === selectedId) ? selectedId : groups[0].id;

  return (
    <div role="listbox" aria-label={t("editor.groups.list")} data-testid="group-list" className="px-2 pb-2">
      {groups.map((g, index) => {
        const selected = g.id === selectedId;
        const hidden = index >= RING_MAX_GROUPS;
        const empty = g.actions.length === 0;
        const renaming = renamingId === g.id;
        const drag = rowProps(index);
        return (
          <div
            key={g.id}
            ref={(el) => {
              if (el) rowRefs.current.set(g.id, el);
              else rowRefs.current.delete(g.id);
            }}
            role="option"
            aria-selected={selected}
            aria-label={t(hidden ? "editor.groups.rowHidden" : "editor.groups.row", { name: g.name || t("editor.groups.unnamed"), count: g.actions.length, max: RING_MAX_ACTIONS })}
            tabIndex={g.id === tabStopId ? 0 : -1}
            data-testid="group-row"
            data-group-id={g.id}
            data-selected={selected}
            {...drag}
            draggable={!renaming}
            onClick={() => onSelect(g.id)}
            onDoubleClick={() => onRenamingChange(g.id)}
            onKeyDown={(e) => onRowKeyDown(e, g, index)}
            onContextMenu={(e) => {
              e.preventDefault();
              onSelect(g.id);
              onMenu(g.id, e.clientX, e.clientY);
            }}
            className={`group/row relative flex h-10 cursor-default items-center gap-2 rounded-lg pl-1 pr-1 transition-colors ${
              selected ? "bg-[#1E1E24]" : "hover:bg-orbit-card"
            } ${dragIndex === index ? "opacity-40" : ""}`}
          >
            {indicator === index && <span className="re-drop-line -top-px" />}
            {indicator === groups.length && index === groups.length - 1 && <span className="re-drop-line -bottom-px" />}
            <span
              aria-hidden="true"
              className={`flex h-6 w-4 shrink-0 cursor-grab items-center justify-center text-[#52525B] transition-opacity active:cursor-grabbing ${
                selected ? "opacity-100" : "opacity-0 group-hover/row:opacity-100"
              }`}
            >
              <GripVertical className="h-3.5 w-3.5" />
            </span>
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                selected ? "bg-(--accent) text-orbit-bg" : "bg-[#1A1A1F] text-[#A1A1AA]"
              } ${hidden ? "opacity-50" : ""}`}
            >
              <SvgIcon markup={groupIconMarkup(g.icon)} size={15} />
            </span>
            {renaming ? (
              <RenameInput
                initial={g.name}
                onCommit={(name, viaKeyboard) => {
                  const trimmed = name.trim();
                  if (trimmed && trimmed !== g.name) onRename(g.id, trimmed);
                  if (viaKeyboard) focusNext.current = g.id;
                  onRenamingChange(null);
                }}
                onCancel={() => {
                  focusNext.current = g.id;
                  onRenamingChange(null);
                }}
              />
            ) : (
              <span
                data-testid="group-name"
                className={`min-w-0 flex-1 truncate text-[13px] ${
                  selected ? "font-medium text-orbit-text" : hidden ? "text-[#8B8B95]" : "text-[#D4D4D8]"
                }`}
              >
                {g.name || <span className="italic text-orbit-text-muted">{t("editor.groups.unnamed")}</span>}
              </span>
            )}
            {!renaming && hidden && (
              <span
                data-testid="badge-hidden"
                data-tip={t("editor.groups.hiddenTip", { max: RING_MAX_GROUPS })}
                className="shrink-0 rounded-sm border border-[#3A3A42] px-1.5 py-px text-[11px] leading-4 text-[#A1A1AA]"
              >
                {t("editor.groups.hidden")}
              </span>
            )}
            {!renaming &&
              (empty ? (
                <span
                  data-testid="badge-empty"
                  data-tip={t("editor.groups.emptyTip")}
                  className="shrink-0 rounded-sm border border-[#4A3F1D] px-1.5 py-px text-[11px] leading-4 text-[#D9B95B]"
                >
                  {t("editor.groups.empty")}
                </span>
              ) : (
                <span
                  data-testid="group-count"
                  data-tip={t("editor.groups.countTip", { count: g.actions.length, max: RING_MAX_ACTIONS })}
                  className="w-5 shrink-0 text-right font-mono text-[11px] tabular-nums text-[#8B8B95]"
                >
                  {g.actions.length}
                </span>
              ))}
            {!renaming && (
              <button
                type="button"
                tabIndex={-1}
                aria-label={t("editor.groups.options", { name: g.name })}
                data-tip={t("editor.groups.moreOptions")}
                data-testid="group-menu-button"
                onClick={(e) => {
                  e.stopPropagation();
                  const r = e.currentTarget.getBoundingClientRect();
                  onSelect(g.id);
                  onMenu(g.id, r.right - 232, r.bottom + 4);
                }}
                onDoubleClick={(e) => e.stopPropagation()}
                className={`flex h-7 w-6 shrink-0 items-center justify-center rounded-md text-[#8B8B95] transition-opacity hover:bg-orbit-border hover:text-orbit-text ${
                  selected ? "opacity-100" : "opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100"
                }`}
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
