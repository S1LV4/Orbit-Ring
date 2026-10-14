import { useCallback, useEffect, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { GripVertical, Trash2, X } from "lucide-react";
import type { RingGroup } from "@orbitring/shared";
import { SvgIcon } from "./SvgIcon";
import { ActionIcon } from "./ActionIcon";
import {
  GI,
  GROUP_ICON_IDS,
  GROUP_ICON_LABELS,
  RING_MAX_ACTIONS,
  resolveAction,
  type ActionCatalog,
} from "./catalog";
import { useDragReorder } from "./useDragReorder";

interface GroupInspectorProps {
  group: RingGroup | undefined;
  hasGroups: boolean;
  catalog: ActionCatalog;
  highlightActionId: string | null;
  onRename: (name: string) => void;
  onRenameEnd: (nameAtFocus: string) => void;
  onIcon: (icon: string) => void;
  onRemoveAction: (actionId: string) => void;
  onMoveAction: (actionId: string, toIndex: number) => void;
  onActionMenu: (actionId: string, x: number, y: number) => void;
  onDelete: () => void;
  onGoToLibrary: () => void;
}

export function GroupInspector({
  group,
  hasGroups,
  catalog,
  highlightActionId,
  onRename,
  onRenameEnd,
  onIcon,
  onRemoveAction,
  onMoveAction,
  onActionMenu,
  onDelete,
  onGoToLibrary,
}: GroupInspectorProps) {
  const nameAtFocus = useRef("");
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const focusNext = useRef<string | null>(null);
  const actions = group?.actions ?? [];

  useLayoutEffect(() => {
    const id = focusNext.current;
    if (!id) return;
    const el = rowRefs.current.get(id);
    if (el) {
      focusNext.current = null;
      el.focus({ preventScroll: true });
    }
  });

  useEffect(() => {
    if (!highlightActionId) return;
    rowRefs.current.get(highlightActionId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [highlightActionId]);

  const moveByIndex = useCallback(
    (from: number, to: number) => {
      const a = actions[from];
      if (a) onMoveAction(a, to);
    },
    [actions, onMoveAction],
  );
  const { dragIndex, indicator, rowProps } = useDragReorder(actions.length, moveByIndex);

  if (!group) {
    return (
      <div className="px-4 pb-4 pt-1">
        <p className="rounded-lg border border-dashed border-orbit-border px-4 py-5 text-center text-[12px] leading-relaxed text-[#A1A1AA]">
          {hasGroups
            ? "Selecione um grupo na lista acima ou clique nele no preview para editar."
            : "Crie um grupo para começar a montar o ring."}
        </p>
      </div>
    );
  }

  const onRowKeyDown = (e: KeyboardEvent<HTMLLIElement>, actionId: string, index: number) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const target = index + (e.key === "ArrowUp" ? -1 : 1);
      if (target < 0 || target >= actions.length) return;
      if (e.altKey) {
        focusNext.current = actionId;
        onMoveAction(actionId, target);
      } else {
        rowRefs.current.get(actions[target])?.focus();
      }
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      focusNext.current = actions[index + 1] ?? actions[index - 1] ?? null;
      onRemoveAction(actionId);
    } else if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
      e.preventDefault();
      const r = e.currentTarget.getBoundingClientRect();
      onActionMenu(actionId, r.left + 40, r.bottom - 4);
    }
  };

  const full = actions.length >= RING_MAX_ACTIONS;

  return (
    <div className="space-y-4 px-4 pb-4 pt-1" data-testid="group-inspector">
      <div>
        <label htmlFor="re-group-name" className="re-field-label">
          Nome
        </label>
        <div className="flex items-center gap-2">
          <input
            id="re-group-name"
            data-testid="group-name-input"
            value={group.name}
            maxLength={40}
            placeholder="Nome do grupo"
            autoComplete="off"
            spellCheck={false}
            onFocus={() => {
              nameAtFocus.current = group.name;
            }}
            onChange={(e) => onRename(e.target.value)}
            onBlur={() => onRenameEnd(nameAtFocus.current)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className="re-input h-9 min-w-0 flex-1 px-3 text-[13px]"
          />
          <button
            type="button"
            aria-label={`Excluir grupo ${group.name}`}
            data-tip="Excluir grupo"
            data-testid="group-delete"
            onClick={onDelete}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-orbit-border text-[#8B8B95] transition-colors hover:border-[#F87171]/50 hover:bg-[#F87171]/10 hover:text-[#F87171]"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div>
        <span id="re-icon-label" className="re-field-label">
          Ícone
        </span>
        <div role="radiogroup" aria-labelledby="re-icon-label" className="grid grid-cols-8 gap-1">
          {GROUP_ICON_IDS.map((id) => {
            const active = group.icon === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={GROUP_ICON_LABELS[id] ?? id}
                data-tip={GROUP_ICON_LABELS[id] ?? id}
                data-testid="group-icon-option"
                data-icon={id}
                onClick={() => onIcon(id)}
                className={`flex aspect-square w-full items-center justify-center rounded-lg border transition-colors ${
                  active
                    ? "border-transparent bg-(--accent) text-orbit-bg"
                    : "border-orbit-border bg-[#141417] text-[#A1A1AA] hover:border-[#3A3A42] hover:text-orbit-text"
                }`}
              >
                <SvgIcon markup={GI[id]} size={16} />
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-[12px] font-medium text-[#A1A1AA]">Ações do grupo</span>
          <span
            data-testid="action-counter"
            data-tip={full ? "Limite atingido: remova uma ação para adicionar outra." : `Até ${RING_MAX_ACTIONS} ações por grupo`}
            className={`font-mono text-[11px] tabular-nums ${full ? "text-[#FBBF24]" : "text-[#8B8B95]"}`}
          >
            {actions.length}/{RING_MAX_ACTIONS}
          </span>
        </div>

        {actions.length === 0 ? (
          <div
            data-testid="actions-empty"
            className="rounded-lg border border-dashed border-orbit-border px-3.5 py-4 text-[12px] leading-relaxed text-[#A1A1AA]"
          >
            <p>
              Nenhuma ação ainda. Escolha na{" "}
              <button
                type="button"
                onClick={onGoToLibrary}
                className="rounded-sm font-medium text-(--accent) underline-offset-2 hover:underline"
              >
                Biblioteca de ações
              </button>{" "}
              ou clique no <span className="font-semibold text-orbit-text-dim">+</span> do preview.
            </p>
            <p className="mt-1.5 text-[11px] text-[#8B8B95]">Um grupo vazio não aparece no ring real.</p>
          </div>
        ) : (
          <ol aria-label={`Ações de ${group.name}`} data-testid="group-actions" className="space-y-1">
            {actions.map((actionId, index) => {
              const a = resolveAction(catalog, actionId);
              const flash = highlightActionId === actionId;
              return (
                <li
                  key={actionId}
                  ref={(el) => {
                    if (el) rowRefs.current.set(actionId, el);
                    else rowRefs.current.delete(actionId);
                  }}
                  tabIndex={0}
                  data-testid="group-action"
                  data-action-id={actionId}
                  data-highlight={flash}
                  aria-label={`${a.label}${a.known ? "" : " (indisponível)"}, posição ${index + 1} de ${actions.length}`}
                  {...rowProps(index)}
                  onKeyDown={(e) => onRowKeyDown(e, actionId, index)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onActionMenu(actionId, e.clientX, e.clientY);
                  }}
                  className={`group/act relative flex h-9 items-center gap-2 rounded-lg border bg-[#141417] pl-1 pr-1 transition-colors ${
                    flash ? "border-(--accent) bg-[#1E1E24]" : "border-[#232329] hover:border-orbit-border-light"
                  } ${dragIndex === index ? "opacity-40" : ""}`}
                >
                  {indicator === index && <span className="re-drop-line top-[-3px]" />}
                  {indicator === actions.length && index === actions.length - 1 && (
                    <span className="re-drop-line bottom-[-3px]" />
                  )}
                  <span
                    aria-hidden="true"
                    className="flex h-6 w-4 shrink-0 cursor-grab items-center justify-center text-[#52525B] active:cursor-grabbing"
                  >
                    <GripVertical className="h-3.5 w-3.5" />
                  </span>
                  <ActionIcon action={a} size={15} className={a.known ? "text-[#D4D4D8]" : "text-orbit-text-muted"} />
                  <span
                    className={`min-w-0 flex-1 truncate text-[13px] ${a.known ? "text-orbit-text-dim" : "text-[#8B8B95]"}`}
                  >
                    {a.label}
                  </span>
                  {!a.known && (
                    <span
                      data-testid="action-unavailable"
                      data-tip="Esta ação não existe mais no catálogo (plugin removido ou desativado). Ela não funciona no ring; você pode removê-la."
                      className="shrink-0 text-[11px] italic text-[#8B8B95]"
                    >
                      indisponível
                    </span>
                  )}
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={`Remover ${a.label}`}
                    data-tip="Remover do grupo"
                    data-testid="action-remove"
                    onClick={() => onRemoveAction(actionId)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#8B8B95] hover:bg-[#F87171]/10 hover:text-[#F87171]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
