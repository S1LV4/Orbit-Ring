import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  Copy,
  CornerDownRight,
  Pencil,
  Plus,
  Shapes,
  Trash2,
} from "lucide-react";
import type { RingSettings, RingTheme } from "@orbitring/shared";
import "./ring-editor.css";
import { ActionLibrary, LibrarySearch } from "./ActionLibrary";
import { ActionPicker } from "./ActionPicker";
import { ContextMenu, type MenuEntry } from "./ContextMenu";
import { GroupInspector } from "./GroupInspector";
import { GroupList } from "./GroupList";
import { RingPreview, type RingMessage, type RingPreviewConfig } from "./RingPreview";
import { Toast, type ToastData } from "./Toast";
import { Toolbar } from "./Toolbar";
import { TooltipLayer } from "./Tooltip";
import { RING_MAX_ACTIONS, RING_MAX_GROUPS, buildCatalog, resolveAction, type PluginLike } from "./catalog";
import { isTextInput } from "./floating";
import * as ops from "./ops";
import { useRingDraft } from "./useRingDraft";

export interface RingEditorProps {
  settings: RingSettings;
  onSave: (settings: RingSettings) => void;
  plugins?: PluginLike[];
}

interface MenuState {
  x: number;
  y: number;
  groupId: string;
  actionId: string | null;
  origin: "ring" | "list";
}

interface PickerState {
  x: number;
  y: number;
  groupId: string;
  replaceId: string | null;
}

const HEADER_H = 40;
const quote = (s: string) => `“${s || "Sem nome"}”`;

export function RingEditor({ settings, onSave, plugins }: RingEditorProps) {
  const { draft, update, undo, redo, canUndo, canRedo, breakCoalescing, externalVersion } = useRingDraft(
    settings,
    onSave,
  );
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const catalog = useMemo(() => buildCatalog(plugins ?? []), [plugins]);

  const [selectedId, setSelectedId] = useState<string | null>(() => draft.groups[0]?.id ?? null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  const [highlight, setHighlight] = useState<{ groupId: string; actionId: string } | null>(null);
  const [query, setQuery] = useState("");

  const toastSeq = useRef(0);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([null, null, null]);
  const searchRef = useRef<HTMLInputElement>(null);

  const groups = draft.groups;
  const selected = ops.findGroup(draft, selectedId);

  useEffect(() => {
    if (selectedId != null && !groups.some((g) => g.id === selectedId)) {
      setSelectedId(groups[0]?.id ?? null);
    }
  }, [groups, selectedId]);
  useEffect(() => {
    if (externalVersion === 0) return;
    setSelectedId((id) => (id != null && draftRef.current.groups.some((g) => g.id === id) ? id : draftRef.current.groups[0]?.id ?? null));
    setMenu(null);
    setPicker(null);
    setRenamingId(null);
    setToast(null);
  }, [externalVersion]);

  useEffect(
    () => () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    },
    [],
  );

  const dismissToast = useCallback(() => setToast(null), []);
  const notify = useCallback((message: string, extra?: Partial<ToastData>) => {
    toastSeq.current += 1;
    setToast({ key: toastSeq.current, message, ...extra });
  }, []);

  const scrollToSection = useCallback((index: number, instant = false) => {
    const scroller = scrollerRef.current;
    const body = sectionRefs.current[index];
    if (!scroller || !body) return;
    scroller.scrollTo({ top: Math.max(0, body.offsetTop - HEADER_H * (index + 1)), behavior: instant ? "auto" : "smooth" });
  }, []);

  const stepHistory = useCallback(
    (dir: "undo" | "redo") => {
      const before = draftRef.current;
      const after = dir === "undo" ? undo() : redo();
      if (!after) return;
      setToast(null);
      setMenu(null);
      setPicker(null);
      setRenamingId(null);
      const restored = after.groups.find((g) => !before.groups.some((b) => b.id === g.id));
      if (restored) setSelectedId(restored.id);
    },
    [undo, redo],
  );
  const handleUndo = useCallback(() => stepHistory("undo"), [stepHistory]);
  const handleRedo = useCallback(() => stepHistory("redo"), [stepHistory]);

  const notifyUndoable = useCallback(
    (message: string) => notify(message, { actionLabel: "Desfazer", onAction: handleUndo }),
    [notify, handleUndo],
  );

  const selectGroup = useCallback((id: string | null) => {
    setSelectedId(id);
    setRenamingId((r) => (r === id ? r : null));
  }, []);

  const addGroup = useCallback(() => {
    const d = draftRef.current;
    const id = ops.newGroupId(d);
    const name = ops.uniqueName(d, "Novo grupo");
    setToast(null);
    update((cur) => ops.addGroup(cur, { id, name, icon: "settings", actions: [] }));
    setSelectedId(id);
    setRenamingId(id);
    scrollToSection(0);
    if (d.groups.length >= RING_MAX_GROUPS) {
      notify(`O ring mostra até ${RING_MAX_GROUPS} grupos — ${quote(name)} fica salvo, mas oculto.`, { tone: "warn" });
    }
  }, [update, notify, scrollToSection]);

  const deleteGroup = useCallback(
    (id: string) => {
      const d = draftRef.current;
      const index = d.groups.findIndex((g) => g.id === id);
      if (index < 0) return;
      const g = d.groups[index];
      if (!update((cur) => ops.removeGroup(cur, id))) return;
      setRenamingId(null);
      setSelectedId((sel) => (sel === id ? (d.groups[index + 1] ?? d.groups[index - 1])?.id ?? null : sel));
      notifyUndoable(`Grupo ${quote(g.name)} excluído`);
    },
    [update, notifyUndoable],
  );

  const duplicateGroup = useCallback(
    (id: string) => {
      const d = draftRef.current;
      const newId = ops.newGroupId(d);
      setToast(null);
      if (!update((cur) => ops.duplicateGroup(cur, id, newId))) return;
      setSelectedId(newId);
      if (d.groups.length >= RING_MAX_GROUPS) {
        notify(`O ring mostra até ${RING_MAX_GROUPS} grupos — os que passam disso ficam ocultos.`, { tone: "warn" });
      }
    },
    [update, notify],
  );

  const moveGroup = useCallback(
    (id: string, toIndex: number) => {
      setToast(null);
      update((cur) => ops.moveGroupTo(cur, id, toIndex));
    },
    [update],
  );

  const renameGroup = useCallback(
    (id: string, name: string, coalesce: boolean) => {
      setToast(null);
      update((cur) => ops.renameGroup(cur, id, name), coalesce ? { coalesce: `rename:${id}` } : undefined);
    },
    [update],
  );

  const setIcon = useCallback(
    (id: string, icon: string) => {
      setToast(null);
      update((cur) => ops.setGroupIcon(cur, id, icon));
    },
    [update],
  );

  const refusalMessage = useCallback(
    (reason: "full" | "duplicate" | "no-group" | "invalid", groupId: string, actionId: string) => {
      const g = ops.findGroup(draftRef.current, groupId);
      const label = resolveAction(catalog, actionId).label;
      if (reason === "full") return `${quote(g?.name ?? "")} já tem ${RING_MAX_ACTIONS} ações — remova uma para adicionar outra.`;
      if (reason === "duplicate") return `${quote(label)} já está em ${quote(g?.name ?? "")}.`;
      return "Selecione um grupo primeiro.";
    },
    [catalog],
  );

  const addAction = useCallback(
    (groupId: string, actionId: string) => {
      const refusal = ops.canAddAction(draftRef.current, groupId, actionId);
      if (refusal) {
        notify(refusalMessage(refusal, groupId, actionId), { tone: "warn" });
        return false;
      }
      setToast(null);
      return update((cur) => ops.addAction(cur, groupId, actionId));
    },
    [update, notify, refusalMessage],
  );

  const removeAction = useCallback(
    (groupId: string, actionId: string) => {
      const g = ops.findGroup(draftRef.current, groupId);
      if (!g || !g.actions.includes(actionId)) return;
      if (!update((cur) => ops.removeAction(cur, groupId, actionId))) return;
      notifyUndoable(`${quote(resolveAction(catalog, actionId).label)} removida de ${quote(g.name)}`);
    },
    [update, notifyUndoable, catalog],
  );

  const moveActionToGroup = useCallback(
    (fromId: string, toId: string, actionId: string) => {
      const refusal = ops.canMoveAction(draftRef.current, fromId, toId, actionId);
      if (refusal === "invalid") return;
      if (refusal) {
        notify(refusalMessage(refusal, toId, actionId), { tone: "warn" });
        return;
      }
      setToast(null);
      update((cur) => ops.moveAction(cur, fromId, toId, actionId));
    },
    [update, notify, refusalMessage],
  );

  const flashAction = useCallback((groupId: string, actionId: string) => {
    setHighlight({ groupId, actionId });
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlight(null), 1800);
  }, []);

  const onRingMessage = useCallback(
    (msg: RingMessage) => {
      const d = draftRef.current;
      switch (msg.type) {
        case "select": {
          if (msg.groupId == null) {
            selectGroup(null);
            return;
          }
          const g = ops.findGroup(d, msg.groupId);
          if (!g) return;
          selectGroup(g.id);
          if (msg.actionId && g.actions.includes(msg.actionId)) flashAction(g.id, msg.actionId);
          return;
        }
        case "add-action": {
          const g = ops.findGroup(d, msg.groupId);
          if (!g) return;
          selectGroup(g.id);
          setMenu(null);
          if (g.actions.length >= RING_MAX_ACTIONS) {
            setPicker(null);
            notify(`${quote(g.name)} já tem ${RING_MAX_ACTIONS} ações — remova uma para adicionar outra.`, { tone: "warn" });
            return;
          }
          setPicker({ x: msg.x + 14, y: msg.y + 14, groupId: g.id, replaceId: null });
          return;
        }
        case "context": {
          const g = ops.findGroup(d, msg.groupId);
          if (!g) return;
          if (msg.actionId && !g.actions.includes(msg.actionId)) return;
          selectGroup(g.id);
          setPicker(null);
          setMenu({ x: msg.x, y: msg.y, groupId: g.id, actionId: msg.actionId, origin: "ring" });
          return;
        }
        case "reorder-groups":
          setToast(null);
          update((cur) => ops.reorderGroups(cur, msg.ids));
          return;
        case "reorder-actions":
          setToast(null);
          update((cur) => ops.reorderActions(cur, msg.groupId, msg.actions));
          return;
        case "move-action":
          moveActionToGroup(msg.fromGroupId, msg.toGroupId, msg.actionId);
          return;
        case "remove-action":
          removeAction(msg.groupId, msg.actionId);
          return;
        case "remove-group":
          deleteGroup(msg.groupId);
          return;
        case "undo":
          handleUndo();
          return;
        case "redo":
          handleRedo();
          return;
        case "ready":
          return;
      }
    },
    [selectGroup, flashAction, notify, update, moveActionToGroup, removeAction, deleteGroup, handleUndo, handleRedo],
  );

  const overlayOpen = !!menu || !!picker;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || overlayOpen || isTextInput(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && !e.altKey && key === "z") {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if (mod && !e.altKey && !e.shiftKey && key === "y") {
        e.preventDefault();
        handleRedo();
      } else if (!mod && !e.altKey && e.key === "/") {
        e.preventDefault();
        scrollToSection(2, true);
        searchRef.current?.focus({ preventScroll: true });
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [overlayOpen, handleUndo, handleRedo, scrollToSection]);

  const previewCfg = useMemo<RingPreviewConfig>(
    () => ({
      groups,
      accent: draft.accent,
      theme: draft.theme,
      liquid: draft.liquid,
      ascii: draft.ascii !== false,
      edit: true,
      selected: selected?.id ?? null,
      pluginActions: catalog.pluginActions,
    }),
    [groups, draft.accent, draft.theme, draft.liquid, draft.ascii, selected?.id, catalog.pluginActions],
  );

  const menuGroup = menu ? ops.findGroup(draft, menu.groupId) : undefined;
  const menuValid = !!menu && !!menuGroup && (menu.actionId == null || menuGroup.actions.includes(menu.actionId));
  useEffect(() => {
    if (menu && !menuValid) setMenu(null);
  }, [menu, menuValid]);

  let menuEntries: MenuEntry[] = [];
  let menuTitle = "";
  if (menu && menuGroup && menuValid) {
    const g = menuGroup;
    const index = groups.indexOf(g);
    if (menu.actionId == null) {
      const vertical = menu.origin === "list";
      menuTitle = g.name || "Sem nome";
      menuEntries = [
        {
          kind: "item",
          label: "Renomear",
          icon: <Pencil className="h-3.5 w-3.5" />,
          note: "F2",
          onSelect: () => {
            setSelectedId(g.id);
            setRenamingId(g.id);
            scrollToSection(0);
          },
        },
        {
          kind: "icons",
          label: "Trocar ícone",
          icon: <Shapes className="h-3.5 w-3.5" />,
          value: g.icon,
          onPick: (icon) => setIcon(g.id, icon),
        },
        { kind: "item", label: "Duplicar", icon: <Copy className="h-3.5 w-3.5" />, onSelect: () => duplicateGroup(g.id) },
        {
          kind: "item",
          label: vertical ? "Mover para cima" : "Mover para a esquerda",
          icon: vertical ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowLeft className="h-3.5 w-3.5" />,
          disabled: index === 0,
          onSelect: () => moveGroup(g.id, index - 1),
        },
        {
          kind: "item",
          label: vertical ? "Mover para baixo" : "Mover para a direita",
          icon: vertical ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />,
          disabled: index === groups.length - 1,
          onSelect: () => moveGroup(g.id, index + 1),
        },
        { kind: "separator" },
        {
          kind: "item",
          label: "Excluir",
          icon: <Trash2 className="h-3.5 w-3.5" />,
          danger: true,
          note: "Del",
          onSelect: () => deleteGroup(g.id),
        },
      ];
    } else {
      const actionId = menu.actionId;
      const others = groups.filter((o) => o.id !== g.id);
      menuTitle = `${resolveAction(catalog, actionId).label} · ${g.name || "Sem nome"}`;
      menuEntries = [
        {
          kind: "item",
          label: "Trocar por…",
          icon: <ArrowLeftRight className="h-3.5 w-3.5" />,
          onSelect: () => setPicker({ x: menu.x, y: menu.y, groupId: g.id, replaceId: actionId }),
        },
      ];
      if (others.length) {
        menuEntries.push({ kind: "separator" }, { kind: "label", label: "Mover para" });
        for (const o of others) {
          const refusal = ops.canMoveAction(draft, g.id, o.id, actionId);
          menuEntries.push({
            kind: "item",
            label: o.name || "Sem nome",
            icon: <CornerDownRight className="h-3.5 w-3.5" />,
            disabled: !!refusal,
            note: refusal === "full" ? "cheio" : refusal === "duplicate" ? "já contém" : undefined,
            onSelect: () => moveActionToGroup(g.id, o.id, actionId),
          });
        }
      }
      menuEntries.push(
        { kind: "separator" },
        {
          kind: "item",
          label: "Remover",
          icon: <Trash2 className="h-3.5 w-3.5" />,
          danger: true,
          onSelect: () => removeAction(g.id, actionId),
        },
      );
    }
  }

  const pickerGroup = picker ? ops.findGroup(draft, picker.groupId) : undefined;
  const pickerValid =
    !!picker && !!pickerGroup && (picker.replaceId == null || pickerGroup.actions.includes(picker.replaceId));
  useEffect(() => {
    if (picker && !pickerValid) setPicker(null);
  }, [picker, pickerValid]);

  const overLimit = groups.length > RING_MAX_GROUPS;

  return (
    <div className="ring-editor flex h-[calc(100vh-2.25rem)] min-h-[420px] min-w-0" data-testid="ring-editor">
      <div className="relative flex min-w-0 flex-1 flex-col">
        <Toolbar
          theme={draft.theme}
          accent={draft.accent}
          liquid={draft.liquid}
          ascii={draft.ascii !== false}
          groupCount={groups.length}
          canUndo={canUndo}
          canRedo={canRedo}
          onTheme={(theme: RingTheme, accent: string) => {
            setToast(null);
            update((cur) => (cur.theme === theme && cur.accent === accent ? cur : { ...cur, theme, accent }));
          }}
          onLiquid={(liquid) => {
            setToast(null);
            update((cur) => (cur.liquid === liquid ? cur : { ...cur, liquid }));
          }}
          onAscii={(ascii) => {
            setToast(null);
            update((cur) => ((cur.ascii !== false) === ascii ? cur : { ...cur, ascii }));
          }}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onAddGroup={addGroup}
        />
        <div className="min-h-0 flex-1 px-2 pt-2">
          <RingPreview cfg={previewCfg} onMessage={onRingMessage} />
        </div>
        <p
          data-testid="preview-hint"
          className="shrink-0 px-4 pb-3.5 pt-2 text-center text-[12px] leading-relaxed text-[#8B8B95]"
          style={{ textWrap: "balance" }}
        >
          Clique num grupo para editar · arraste para reordenar · solte no centro para remover · botão direito para
          mais opções
        </p>
        <Toast toast={toast} onDismiss={dismissToast} />
      </div>

      <aside
        aria-label="Grupos e ações"
        className="flex w-80 shrink-0 flex-col border-l border-orbit-border bg-[#111114]"
      >
        <div ref={scrollerRef} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain" data-testid="panel-scroll">
          <div className="re-section-header flex items-center gap-2 pl-4 pr-2" style={{ top: 0, bottom: HEADER_H * 2 }}>
            <button type="button" onClick={() => scrollToSection(0)} className="re-section-title">
              Grupos
            </button>
            <span
              data-testid="group-counter"
              data-tip={
                overLimit
                  ? `O ring mostra só os ${RING_MAX_GROUPS} primeiros grupos; os demais ficam ocultos.`
                  : `O ring mostra até ${RING_MAX_GROUPS} grupos`
              }
              className={`font-mono text-[11px] tabular-nums ${overLimit ? "text-[#FBBF24]" : "text-[#8B8B95]"}`}
            >
              {groups.length}/{RING_MAX_GROUPS}
            </span>
            <span className="flex-1" />
            <button
              type="button"
              aria-label="Novo grupo"
              data-tip="Novo grupo"
              data-testid="add-group-panel"
              onClick={addGroup}
              className="flex h-7 w-7 items-center justify-center rounded-md text-[#A1A1AA] hover:bg-[#1E1E24] hover:text-(--accent)"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div ref={(el) => (sectionRefs.current[0] = el)}>
            <GroupList
              groups={groups}
              selectedId={selected?.id ?? null}
              renamingId={renamingId}
              onRenamingChange={(id) => {
                if (id) setSelectedId(id);
                setRenamingId(id);
              }}
              onSelect={selectGroup}
              onRename={(id, name) => renameGroup(id, name, false)}
              onMove={moveGroup}
              onRemove={deleteGroup}
              onMenu={(id, x, y) => {
                setPicker(null);
                setMenu({ x, y, groupId: id, actionId: null, origin: "list" });
              }}
              onAdd={addGroup}
            />
          </div>

          <div
            className="re-section-header flex items-center gap-2 border-t border-[#232329] px-4"
            style={{ top: HEADER_H, bottom: HEADER_H }}
          >
            <button type="button" onClick={() => scrollToSection(1)} className="re-section-title shrink-0">
              Grupo selecionado
            </button>
            <span className="min-w-0 flex-1 truncate text-right text-[12px] text-[#8B8B95]" data-testid="selected-name">
              {selected ? selected.name || "Sem nome" : "nenhum"}
            </span>
          </div>
          <div ref={(el) => (sectionRefs.current[1] = el)}>
            <GroupInspector
              group={selected}
              hasGroups={groups.length > 0}
              catalog={catalog}
              highlightActionId={highlight && highlight.groupId === selected?.id ? highlight.actionId : null}
              onRename={(name) => selected && renameGroup(selected.id, name, true)}
              onRenameEnd={(nameAtFocus) => {
                breakCoalescing();
                if (!selected) return;
                const trimmed = selected.name.trim();
                if (!trimmed) renameGroup(selected.id, nameAtFocus.trim() || "Grupo", true);
                else if (trimmed !== selected.name) renameGroup(selected.id, trimmed, true);
                breakCoalescing();
              }}
              onIcon={(icon) => selected && setIcon(selected.id, icon)}
              onRemoveAction={(actionId) => selected && removeAction(selected.id, actionId)}
              onMoveAction={(actionId, toIndex) => {
                if (!selected) return;
                setToast(null);
                update((cur) => ops.moveActionTo(cur, selected.id, actionId, toIndex));
              }}
              onActionMenu={(actionId, x, y) => {
                if (!selected) return;
                setPicker(null);
                setMenu({ x, y, groupId: selected.id, actionId, origin: "list" });
              }}
              onDelete={() => selected && deleteGroup(selected.id)}
              onGoToLibrary={() => {
                scrollToSection(2, true);
                searchRef.current?.focus({ preventScroll: true });
              }}
            />
          </div>

          <div
            className="re-section-header flex items-center gap-2 border-t border-[#232329] px-4"
            style={{ top: HEADER_H * 2, bottom: 0 }}
          >
            <button type="button" onClick={() => scrollToSection(2)} className="re-section-title">
              Biblioteca de ações
            </button>
            <span className="flex-1" />
            <span className="font-mono text-[11px] tabular-nums text-[#8B8B95]" data-tip="Ações disponíveis">
              {catalog.byId.size}
            </span>
          </div>
          <div ref={(el) => (sectionRefs.current[2] = el)} style={{ minHeight: `calc(100vh - 2.25rem - ${HEADER_H * 3}px)` }}>
            <div className="sticky z-9 bg-[#111114] px-4 pb-2 pt-1" style={{ top: HEADER_H * 3 }}>
              <LibrarySearch query={query} onQueryChange={setQuery} searchRef={searchRef} />
              {selected ? (
                <p className="mt-1.5 truncate text-[11px] text-[#8B8B95]">
                  Clique para adicionar a <span className="text-[#D4D4D8]">{selected.name || "Sem nome"}</span>
                  {selected.actions.length >= RING_MAX_ACTIONS && <span className="text-[#FBBF24]"> · grupo cheio</span>}
                </p>
              ) : (
                <p className="mt-1.5 text-[11px] text-[#8B8B95]">Selecione um grupo para adicionar ações.</p>
              )}
            </div>
            <ActionLibrary
              catalog={catalog}
              groups={groups}
              selected={selected}
              query={query}
              onToggle={(actionId) => {
                if (!selected) return;
                if (selected.actions.includes(actionId)) removeAction(selected.id, actionId);
                else addAction(selected.id, actionId);
              }}
            />
          </div>
        </div>
      </aside>

      {menu && menuValid && (
        <ContextMenu
          key={`${menu.groupId}:${menu.actionId ?? ""}:${menu.x}:${menu.y}`}
          anchor={{ x: menu.x, y: menu.y }}
          title={menuTitle}
          entries={menuEntries}
          onClose={() => setMenu(null)}
        />
      )}
      {picker && pickerGroup && pickerValid && (
        <ActionPicker
          key={`${picker.groupId}:${picker.replaceId ?? ""}:${picker.x}:${picker.y}`}
          anchor={{ x: picker.x, y: picker.y }}
          catalog={catalog}
          group={pickerGroup}
          replaceId={picker.replaceId}
          onPick={(actionId) => {
            const p = picker;
            setPicker(null);
            if (p.replaceId) {
              setToast(null);
              update((cur) => ops.replaceAction(cur, p.groupId, p.replaceId as string, actionId));
            } else {
              addAction(p.groupId, actionId);
            }
            flashAction(p.groupId, actionId);
          }}
          onClose={() => setPicker(null)}
        />
      )}
      <TooltipLayer />
    </div>
  );
}
