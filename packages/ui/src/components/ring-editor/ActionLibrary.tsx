import { useMemo, useState, type RefObject } from "react";
import { Check, ChevronDown, ChevronRight, Plus, Search, X } from "lucide-react";
import type { RingGroup } from "@orbitring/shared";
import { ActionIcon } from "./ActionIcon";
import { RING_MAX_ACTIONS, filterCategories, type ActionCatalog, type ActionDef } from "./catalog";
import { t } from "../../i18n";

interface ActionLibraryProps {
  catalog: ActionCatalog;
  groups: RingGroup[];
  selected: RingGroup | undefined;
  onToggle: (actionId: string) => void;
  query: string;
}

interface LibrarySearchProps {
  query: string;
  onQueryChange: (q: string) => void;
  searchRef: RefObject<HTMLInputElement>;
}

export function LibrarySearch({
  query,
  onQueryChange,
  searchRef,
}: LibrarySearchProps) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-orbit-text-muted" />
      <input
        ref={searchRef}
        type="text"
        role="searchbox"
        data-testid="library-search"
        value={query}
        placeholder={t("editor.library.search")}
        aria-label={t("editor.library.searchLabel")}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && query) {
            e.preventDefault();
            onQueryChange("");
          }
        }}
        className="re-input h-9 w-full pl-8 pr-9 text-[13px]"
      />
      {query ? (
        <button
          type="button"
          aria-label={t("editor.library.clear")}
          onClick={() => {
            onQueryChange("");
            searchRef.current?.focus();
          }}
          className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-[#8B8B95] hover:bg-orbit-border hover:text-orbit-text"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : (
        <kbd
          aria-hidden="true"
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-sm border border-orbit-border px-1.5 font-mono text-[11px] leading-4 text-orbit-text-muted"
        >
          /
        </kbd>
      )}
    </div>
  );
}

export function ActionLibrary({ catalog, groups, selected, onToggle, query }: ActionLibraryProps) {
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const first = catalog.categories[0]?.name;
    return first ? { [first]: true } : {};
  });

  const searching = query.trim().length > 0;
  const categories = useMemo(() => filterCategories(catalog, query), [catalog, query]);

  const usage = useMemo(() => {
    const m = new Map<string, { id: string; name: string }[]>();
    for (const g of groups) {
      for (const a of g.actions) {
        const list = m.get(a);
        if (list) list.push({ id: g.id, name: g.name || t("editor.main.unnamed") });
        else m.set(a, [{ id: g.id, name: g.name || t("editor.main.unnamed") }]);
      }
    }
    return m;
  }, [groups]);

  const inSelected = useMemo(() => new Set(selected?.actions ?? []), [selected]);
  const full = !!selected && selected.actions.length >= RING_MAX_ACTIONS;

  if (categories.length === 0) {
    return (
      <div className="px-4 pb-6 pt-2" data-testid="library-empty">
        <div className="rounded-lg border border-dashed border-orbit-border px-4 py-6 text-center">
          <p className="text-[13px] text-orbit-text-dim">{t("editor.library.noResults")}</p>
          <p className="mt-1 wrap-break-word text-[12px] text-[#8B8B95]">{t("editor.library.noResultsFor", { query: query.trim() })}</p>
        </div>
      </div>
    );
  }

  const renderItem = (a: ActionDef) => {
    const added = inSelected.has(a.id);
    const disabled = !added && (!selected || full);
    const others = (usage.get(a.id) ?? []).filter((u) => u.id !== selected?.id).map((u) => u.name);
    const tip = !selected
      ? t("editor.library.selectGroup")
      : added
        ? t("editor.library.removeFrom", { group: selected.name })
        : full
          ? t("editor.library.full", { group: selected.name, max: RING_MAX_ACTIONS })
          : t("editor.library.addTo", { group: selected.name });
    return (
      <li key={a.id}>
        <button
          type="button"
          data-testid="library-item"
          data-action-id={a.id}
          data-added={added}
          aria-pressed={added}
          aria-disabled={disabled}
          data-tip={a.description ? `${tip} — ${a.description}` : tip}
          onClick={() => {
            if (!disabled) onToggle(a.id);
          }}
          className={`group/item flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors ${
            disabled ? "cursor-not-allowed opacity-45" : added ? "bg-[#1A1A1F] hover:bg-[#1E1E24]" : "hover:bg-orbit-card"
          }`}
        >
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center ${
              added ? "text-(--accent)" : "text-[#A1A1AA]"
            }`}
          >
            <ActionIcon action={a} size={16} />
          </span>
          <span className="min-w-0 flex-1">
            <span className={`block truncate text-[13px] leading-4 ${added ? "text-orbit-text" : "text-[#D4D4D8]"}`}>
              {a.label}
            </span>
            {others.length > 0 && (
              <span className="mt-0.5 block truncate text-[11px] leading-4 text-[#8B8B95]">
                {added ? t("editor.library.alsoIn") : t("editor.library.in")}
                {others.join(", ")}
              </span>
            )}
          </span>
          <span className="flex h-5 w-5 shrink-0 items-center justify-center">
            {added ? (
              <Check className="h-4 w-4 text-(--accent)" aria-hidden="true" />
            ) : (
              !disabled && (
                <Plus
                  className="h-3.5 w-3.5 text-[#8B8B95] opacity-0 transition-opacity group-hover/item:opacity-100 group-focus-visible/item:opacity-100"
                  aria-hidden="true"
                />
              )
            )}
          </span>
        </button>
      </li>
    );
  };

  return (
    <div className="px-2 pb-4" data-testid="action-library">
      {categories.map((c) => {
        const isOpen = searching || !!open[c.name];
        const addedCount = c.actions.reduce((n, a) => n + (inSelected.has(a.id) ? 1 : 0), 0);
        return (
          <section key={c.name} data-testid="library-category" data-category={c.name}>
            <button
              type="button"
              aria-expanded={isOpen}
              disabled={searching}
              onClick={() => setOpen((o) => ({ ...o, [c.name]: !o[c.name] }))}
              className="flex h-8 w-full items-center gap-1.5 rounded-lg px-2 text-left transition-colors enabled:hover:bg-orbit-card"
            >
              {isOpen ? (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-orbit-text-muted" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-orbit-text-muted" />
              )}
              <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[#D4D4D8]">{c.name}</span>
              {addedCount > 0 && (
                <span
                  data-tip={t("editor.library.inCategory", { count: addedCount })}
                  className="shrink-0 rounded-full bg-[rgba(var(--accent-rgb),0.14)] px-1.5 font-mono text-[11px] leading-4 text-(--accent)"
                >
                  {addedCount}
                </span>
              )}
              <span className="w-5 shrink-0 text-right font-mono text-[11px] tabular-nums text-[#8B8B95]">
                {c.actions.length}
              </span>
            </button>
            {isOpen && <ul className="pb-1.5 pt-0.5">{c.actions.map(renderItem)}</ul>}
          </section>
        );
      })}
    </div>
  );
}
