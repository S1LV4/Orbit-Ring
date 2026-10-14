import { useState } from "react";
import {
  Mouse,
  Keyboard,
  Terminal,
  Play,
  Monitor,
  Search,
  X,
  Layout,
  Globe,
} from "lucide-react";
import { t } from "../i18n";

interface BindingEditorProps {
  config: any;
  lastEvent: any;
  onSave: (binding: any) => void;
  onTest: (action: any) => void;
  onIdentify: () => void;
}

const BUTTONS = ["side1", "side2", "side3", "side4", "dpi", "scroll_left", "scroll_right"] as const;
const BUTTON_LABELS = Object.fromEntries(
  BUTTONS.map((id) => [id, { label: t(`bindings.buttons.${id}.label`), description: t(`bindings.buttons.${id}.description`) }]),
) as Record<string, { label: string; description: string }>;

const ACTION_PRESETS = [
  {
    category: t("bindings.categories.navigate"),
    icon: <Globe className="w-3.5 h-3.5" />,
    actions: [
      { label: t("bindings.presets.back"), action: { type: "keystroke", key: "BrowserBack", modifiers: [], label: t("bindings.presets.back") } },
      { label: t("bindings.presets.forward"), action: { type: "keystroke", key: "BrowserForward", modifiers: [], label: t("bindings.presets.forward") } },
      { label: t("bindings.presets.newTab"), action: { type: "keystroke", key: "t", modifiers: ["ctrl"], label: "Ctrl+T" } },
      { label: t("bindings.presets.closeTab"), action: { type: "keystroke", key: "w", modifiers: ["ctrl"], label: "Ctrl+W" } },
      { label: t("bindings.presets.reopenTab"), action: { type: "keystroke", key: "t", modifiers: ["ctrl", "shift"], label: "Ctrl+Shift+T" } },
    ],
  },
  {
    category: t("bindings.categories.system"),
    icon: <Monitor className="w-3.5 h-3.5" />,
    actions: [
      { label: t("bindings.presets.showDesktop"), action: { type: "system", action: "show_desktop" } },
      { label: t("bindings.presets.taskView"), action: { type: "system", action: "task_view" } },
      { label: t("bindings.presets.screenshot"), action: { type: "system", action: "screenshot" } },
      { label: t("bindings.presets.lockScreen"), action: { type: "system", action: "lock_screen" } },
      { label: t("bindings.presets.openTerminal"), action: { type: "system", action: "open_terminal" } },
    ],
  },
  {
    category: t("bindings.categories.window"),
    icon: <Layout className="w-3.5 h-3.5" />,
    actions: [
      { label: t("bindings.presets.minimize"), action: { type: "system", action: "minimize_window" } },
      { label: t("bindings.presets.maximize"), action: { type: "system", action: "maximize_window" } },
      { label: t("bindings.presets.close"), action: { type: "system", action: "close_window" } },
      { label: t("bindings.presets.desktopLeft"), action: { type: "system", action: "switch_desktop_left" } },
      { label: t("bindings.presets.desktopRight"), action: { type: "system", action: "switch_desktop_right" } },
    ],
  },
  {
    category: t("bindings.categories.media"),
    icon: <Play className="w-3.5 h-3.5" />,
    actions: [
      { label: t("bindings.presets.playPause"), action: { type: "system", action: "media_play_pause" } },
      { label: t("bindings.presets.next"), action: { type: "system", action: "media_next" } },
      { label: t("bindings.presets.previous"), action: { type: "system", action: "media_prev" } },
      { label: t("bindings.presets.volumeUp"), action: { type: "system", action: "volume_up" } },
      { label: t("bindings.presets.volumeDown"), action: { type: "system", action: "volume_down" } },
      { label: t("bindings.presets.mute"), action: { type: "system", action: "volume_mute" } },
    ],
  },
  {
    category: t("bindings.categories.shortcuts"),
    icon: <Keyboard className="w-3.5 h-3.5" />,
    actions: [
      { label: t("bindings.presets.copy"), action: { type: "keystroke", key: "c", modifiers: ["ctrl"], label: "Ctrl+C" } },
      { label: t("bindings.presets.paste"), action: { type: "keystroke", key: "v", modifiers: ["ctrl"], label: "Ctrl+V" } },
      { label: t("bindings.presets.undo"), action: { type: "keystroke", key: "z", modifiers: ["ctrl"], label: "Ctrl+Z" } },
      { label: t("bindings.presets.redo"), action: { type: "keystroke", key: "y", modifiers: ["ctrl"], label: "Ctrl+Y" } },
      { label: t("bindings.presets.save"), action: { type: "keystroke", key: "s", modifiers: ["ctrl"], label: "Ctrl+S" } },
      { label: t("bindings.presets.find"), action: { type: "keystroke", key: "f", modifiers: ["ctrl"], label: "Ctrl+F" } },
    ],
  },
];

export function BindingEditor({
  config,
  lastEvent,
  onSave,
  onTest,
  onIdentify,
}: BindingEditorProps) {
  const [selectedButton, setSelectedButton] = useState<string | null>(null);
  const [identifying, setIdentifying] = useState(false);

  const bindings = config?.defaultProfile?.bindings ?? [];

  const getActionLabel = (button: string): string => {
    const binding = bindings.find((b: any) => b.button === button);
    if (!binding || binding.action.type === "none") return t("bindings.noAction");
    if (binding.action.label) return binding.action.label;
    if (binding.action.type === "system") return binding.action.action.replace(/_/g, " ");
    if (binding.action.type === "command") return binding.action.command;
    return binding.action.type;
  };

  const handleIdentify = () => {
    setIdentifying(true);
    onIdentify();
  };

  if (identifying && lastEvent?.action === "press") {
    setSelectedButton(lastEvent.button);
    setIdentifying(false);
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-base font-semibold flex items-center gap-2 text-orbit-text">
          <Mouse className="w-4 h-4 text-orbit-text-muted" />
          {t("bindings.title")}
        </h2>
        <button
          onClick={handleIdentify}
          className={`orbit-btn flex items-center gap-2 border ${
            identifying
              ? "text-orbit-bg animate-pulse"
              : "border-orbit-border text-orbit-text-muted hover:border-(--accent) hover:text-(--accent)"
          }`}
          style={identifying ? { background: "var(--accent)", borderColor: "var(--accent)" } : undefined}
        >
          <Search className="w-3.5 h-3.5" />
          <span className="text-xs font-mono">{identifying ? t("bindings.identifying") : t("bindings.identify")}</span>
        </button>
      </div>

      <div className="grid grid-cols-[260px_1fr] gap-5">
        <div className="space-y-1">
          {Object.entries(BUTTON_LABELS).map(([key, { label, description }]) => (
            <button
              key={key}
              onClick={() => setSelectedButton(key)}
              className={`w-full text-left p-3 rounded-lg border transition-all duration-150 ${
                selectedButton === key
                  ? "border-(--accent)"
                  : lastEvent?.button === key && lastEvent?.action === "press"
                  ? "border-(--accent) opacity-60"
                  : "border-orbit-border bg-orbit-card hover:border-orbit-border-light"
              }`}
              style={selectedButton === key ? { background: `color-mix(in srgb, var(--accent) 8%, #17171B)` } : undefined}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-orbit-text-dim">{label}</div>
                  <div className="text-[10px] font-mono text-orbit-text-muted mt-0.5">{description}</div>
                </div>
                <div className="text-[10px] font-mono text-orbit-border-light">{getActionLabel(key)}</div>
              </div>
            </button>
          ))}
        </div>

        <div>
          {selectedButton ? (
            <div className="space-y-4">
              <h3 className="text-[10px] font-mono uppercase tracking-widest text-orbit-text-muted">
                {t("bindings.actionFor", { button: BUTTON_LABELS[selectedButton]?.label ?? selectedButton })}
              </h3>
              {ACTION_PRESETS.map((category) => (
                <div key={category.category}>
                  <h4 className="text-[10px] font-mono uppercase tracking-wider mb-2 flex items-center gap-2"
                      style={{ color: "var(--accent)" }}>
                    {category.icon}
                    {category.category}
                  </h4>
                  <div className="grid grid-cols-3 gap-1.5">
                    {category.actions.map((preset) => (
                      <button
                        key={preset.label}
                        onClick={() => {
                          onSave({ button: selectedButton, action: preset.action });
                          onTest(preset.action);
                        }}
                        className="p-2.5 text-left orbit-card hover:border-(--accent) transition-colors"
                      >
                        <div className="text-xs text-orbit-text-dim">{preset.label}</div>
                        {"label" in preset.action && (
                          <div className="text-[10px] font-mono text-orbit-border-light mt-0.5">
                            {(preset.action as any).label}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              <div>
                <h4 className="text-[10px] font-mono uppercase tracking-wider mb-2 flex items-center gap-2"
                    style={{ color: "var(--accent)" }}>
                  <Terminal className="w-3.5 h-3.5" />
                  {t("bindings.customShortcut")}
                </h4>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder={t("bindings.customPlaceholder")}
                    className="orbit-input flex-1 font-mono text-xs"
                    onKeyDown={(e) => {
                      e.preventDefault();
                      const modifiers: string[] = [];
                      if (e.ctrlKey) modifiers.push("ctrl");
                      if (e.shiftKey) modifiers.push("shift");
                      if (e.altKey) modifiers.push("alt");
                      if (e.metaKey) modifiers.push("meta");
                      const key = e.key.length === 1 ? e.key : e.code;
                      const label = [...modifiers.map((m) => m.charAt(0).toUpperCase() + m.slice(1)), key].join("+");
                      (e.target as HTMLInputElement).value = label;
                      onSave({
                        button: selectedButton,
                        action: { type: "keystroke", key, modifiers, label },
                      });
                    }}
                  />
                </div>
                <p className="text-[10px] font-mono text-orbit-border-light mt-1.5">
                  {t("bindings.customHint")}
                </p>
              </div>

              <button
                onClick={() =>
                  onSave({ button: selectedButton, action: { type: "none" } })
                }
                className="text-[10px] font-mono text-red-400/60 hover:text-red-400 flex items-center gap-1 mt-4 transition-colors"
              >
                <X className="w-3 h-3" />
                {t("bindings.removeAction")}
              </button>
            </div>
          ) : (
            <div className="text-center py-16 text-orbit-text-muted">
              <Keyboard className="w-10 h-10 mx-auto mb-3 opacity-15" />
              <p className="text-sm text-orbit-text-dim">{t("bindings.selectButton")}</p>
              <p className="text-[10px] font-mono mt-2 text-orbit-border-light">
                {t("bindings.selectHint")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
