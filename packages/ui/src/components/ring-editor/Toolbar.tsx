import { Check, Plus, Redo2, Undo2 } from "lucide-react";
import type { RingTheme } from "@orbitring/shared";
import { RING_MAX_GROUPS } from "./catalog";
import { t } from "../../i18n";

export const THEME_OPTIONS: { accent: string; theme: RingTheme; color: string; label: string; ink: string }[] = [
  { accent: "#C6F432", theme: "dark", color: "#C6F432", label: t("editor.themes.green"), ink: "#0A0A0B" },
  { accent: "#FF6B2B", theme: "orange", color: "#FF6B2B", label: t("editor.themes.orange"), ink: "#0A0A0B" },
  { accent: "#2B8AFF", theme: "neg-orange", color: "#2B8AFF", label: t("editor.themes.blue"), ink: "#0A0A0B" },
  { accent: "#FFFFFF", theme: "neg", color: "#FFFFFF", label: t("editor.themes.negative"), ink: "#0A0A0B" },
  { accent: "#000000", theme: "light", color: "#000000", label: t("editor.themes.white"), ink: "#FAFAFA" },
];

interface ToolbarProps {
  theme: string;
  accent: string;
  liquid: boolean;
  ascii: boolean;
  groupCount: number;
  canUndo: boolean;
  canRedo: boolean;
  onTheme: (theme: RingTheme, accent: string) => void;
  onLiquid: (liquid: boolean) => void;
  onAscii: (ascii: boolean) => void;
  onUndo: () => void;
  onRedo: () => void;
  onAddGroup: () => void;
}

const ICON_BTN =
  "flex h-8 w-8 items-center justify-center rounded-lg text-[#A1A1AA] transition-colors hover:bg-[#1E1E24] hover:text-orbit-text aria-disabled:cursor-not-allowed aria-disabled:text-[#3F3F46] aria-disabled:hover:bg-transparent";

export function Toolbar({
  theme,
  accent,
  liquid,
  ascii,
  groupCount,
  canUndo,
  canRedo,
  onTheme,
  onLiquid,
  onAscii,
  onUndo,
  onRedo,
  onAddGroup,
}: ToolbarProps) {
  const overLimit = groupCount >= RING_MAX_GROUPS;
  return (
    <div
      role="toolbar"
      aria-label={t("editor.toolbar.label")}
      data-testid="ring-toolbar"
      className="flex h-[52px] shrink-0 items-center gap-3 border-b border-[#1F1F24] px-4"
    >
      <div className="flex items-center gap-2.5">
        <span id="re-theme-label" className="text-[12px] font-medium text-[#A1A1AA]">
          {t("editor.toolbar.theme")}
        </span>
        <div role="radiogroup" aria-labelledby="re-theme-label" className="flex items-center gap-2">
          {THEME_OPTIONS.map((opt) => {
            const selected = theme === opt.theme && accent.toLowerCase() === opt.accent.toLowerCase();
            return (
              <button
                key={opt.theme}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={t("editor.toolbar.themeOption", { name: opt.label })}
                data-tip={opt.label}
                data-testid="theme-swatch"
                data-theme={opt.theme}
                onClick={() => onTheme(opt.theme, opt.accent)}
                className={`flex h-6 w-6 items-center justify-center rounded-full border transition-transform ${
                  selected ? "border-transparent" : "border-[#3A3A42] hover:scale-110"
                }`}
                style={{
                  background: opt.color,
                  boxShadow: selected ? "0 0 0 2px #0A0A0B, 0 0 0 4px #FAFAFA" : undefined,
                }}
              >
                {selected && <Check className="h-3.5 w-3.5" strokeWidth={3} style={{ color: opt.ink }} />}
              </button>
            );
          })}
        </div>
      </div>

      <span className="h-5 w-px shrink-0 bg-orbit-border" aria-hidden="true" />

      <button
        type="button"
        role="switch"
        aria-checked={liquid}
        data-testid="liquid-toggle"
        data-tip={t("editor.toolbar.liquidTip")}
        onClick={() => onLiquid(!liquid)}
        className="group/sw flex h-8 items-center gap-2 rounded-lg px-1.5 text-[12px] font-medium text-[#D4D4D8] hover:text-orbit-text"
      >
        <span
          className={`relative h-[18px] w-8 shrink-0 rounded-full transition-colors ${
            liquid ? "bg-(--accent)" : "bg-orbit-border"
          }`}
        >
          <span
            className={`absolute left-0.5 top-0.5 h-3.5 w-3.5 rounded-full transition-transform ${
              liquid ? "translate-x-[14px] bg-orbit-bg" : "bg-[#8B8B95]"
            }`}
          />
        </span>
        <span className="whitespace-nowrap">{t("editor.toolbar.liquid")}</span>
      </button>

      <button
        type="button"
        role="switch"
        aria-checked={ascii}
        data-testid="ascii-toggle"
        data-tip={t("editor.toolbar.asciiTip")}
        onClick={() => onAscii(!ascii)}
        className="group/sw flex h-8 items-center gap-2 rounded-lg px-1.5 text-[12px] font-medium text-[#D4D4D8] hover:text-orbit-text"
      >
        <span
          className={`relative h-[18px] w-8 shrink-0 rounded-full transition-colors ${
            ascii ? "bg-(--accent)" : "bg-orbit-border"
          }`}
        >
          <span
            className={`absolute left-0.5 top-0.5 h-3.5 w-3.5 rounded-full transition-transform ${
              ascii ? "translate-x-[14px] bg-orbit-bg" : "bg-[#8B8B95]"
            }`}
          />
        </span>
        <span className="whitespace-nowrap">{t("editor.toolbar.ascii")}</span>
      </button>

      <div className="flex-1" />

      <div className="flex items-center gap-0.5">
        <button
          type="button"
          aria-label={t("editor.toolbar.undo")}
          aria-disabled={!canUndo}
          data-tip={t("editor.toolbar.undoTip")}
          data-testid="undo"
          onClick={() => canUndo && onUndo()}
          className={ICON_BTN}
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label={t("editor.toolbar.redo")}
          aria-disabled={!canRedo}
          data-tip={t("editor.toolbar.redoTip")}
          data-testid="redo"
          onClick={() => canRedo && onRedo()}
          className={ICON_BTN}
        >
          <Redo2 className="h-4 w-4" />
        </button>
      </div>

      <button
        type="button"
        data-testid="add-group"
        data-tip={
          overLimit
            ? t("editor.toolbar.newGroupHiddenTip", { max: RING_MAX_GROUPS })
            : t("editor.toolbar.newGroupTip")
        }
        onClick={onAddGroup}
        className="flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-orbit-border bg-orbit-card px-3 text-[12px] font-medium text-orbit-text-dim transition-colors hover:border-(--accent) hover:text-(--accent)"
      >
        <Plus className="h-3.5 w-3.5" />
        {t("editor.toolbar.newGroup")}
      </button>
    </div>
  );
}
