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

interface BindingEditorProps {
  config: any;
  lastEvent: any;
  onSave: (binding: any) => void;
  onTest: (action: any) => void;
  onIdentify: () => void;
}

const BUTTON_LABELS: Record<string, { label: string; description: string }> = {
  side1: { label: "Side Button 1", description: "Thumb / Back" },
  side2: { label: "Side Button 2", description: "Forward" },
  side3: { label: "Side Button 3", description: "Extra" },
  side4: { label: "Side Button 4", description: "Extra" },
  dpi: { label: "DPI Button", description: "Usually on top" },
  scroll_left: { label: "Scroll Left", description: "Scroll tilt" },
  scroll_right: { label: "Scroll Right", description: "Scroll tilt" },
};

const ACTION_PRESETS = [
  {
    category: "Navigate",
    icon: <Globe className="w-3.5 h-3.5" />,
    actions: [
      { label: "Back", action: { type: "keystroke", key: "BrowserBack", modifiers: [], label: "Back" } },
      { label: "Forward", action: { type: "keystroke", key: "BrowserForward", modifiers: [], label: "Forward" } },
      { label: "New Tab", action: { type: "keystroke", key: "t", modifiers: ["ctrl"], label: "Ctrl+T" } },
      { label: "Close Tab", action: { type: "keystroke", key: "w", modifiers: ["ctrl"], label: "Ctrl+W" } },
      { label: "Reopen Tab", action: { type: "keystroke", key: "t", modifiers: ["ctrl", "shift"], label: "Ctrl+Shift+T" } },
    ],
  },
  {
    category: "System",
    icon: <Monitor className="w-3.5 h-3.5" />,
    actions: [
      { label: "Show Desktop", action: { type: "system", action: "show_desktop" } },
      { label: "Task View", action: { type: "system", action: "task_view" } },
      { label: "Screenshot", action: { type: "system", action: "screenshot" } },
      { label: "Lock Screen", action: { type: "system", action: "lock_screen" } },
      { label: "Open Terminal", action: { type: "system", action: "open_terminal" } },
    ],
  },
  {
    category: "Window",
    icon: <Layout className="w-3.5 h-3.5" />,
    actions: [
      { label: "Minimize", action: { type: "system", action: "minimize_window" } },
      { label: "Maximize", action: { type: "system", action: "maximize_window" } },
      { label: "Close", action: { type: "system", action: "close_window" } },
      { label: "Desktop Left", action: { type: "system", action: "switch_desktop_left" } },
      { label: "Desktop Right", action: { type: "system", action: "switch_desktop_right" } },
    ],
  },
  {
    category: "Media",
    icon: <Play className="w-3.5 h-3.5" />,
    actions: [
      { label: "Play / Pause", action: { type: "system", action: "media_play_pause" } },
      { label: "Next", action: { type: "system", action: "media_next" } },
      { label: "Previous", action: { type: "system", action: "media_prev" } },
      { label: "Volume +", action: { type: "system", action: "volume_up" } },
      { label: "Volume -", action: { type: "system", action: "volume_down" } },
      { label: "Mute", action: { type: "system", action: "volume_mute" } },
    ],
  },
  {
    category: "Shortcuts",
    icon: <Keyboard className="w-3.5 h-3.5" />,
    actions: [
      { label: "Copy", action: { type: "keystroke", key: "c", modifiers: ["ctrl"], label: "Ctrl+C" } },
      { label: "Paste", action: { type: "keystroke", key: "v", modifiers: ["ctrl"], label: "Ctrl+V" } },
      { label: "Undo", action: { type: "keystroke", key: "z", modifiers: ["ctrl"], label: "Ctrl+Z" } },
      { label: "Redo", action: { type: "keystroke", key: "y", modifiers: ["ctrl"], label: "Ctrl+Y" } },
      { label: "Save", action: { type: "keystroke", key: "s", modifiers: ["ctrl"], label: "Ctrl+S" } },
      { label: "Find", action: { type: "keystroke", key: "f", modifiers: ["ctrl"], label: "Ctrl+F" } },
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
    if (!binding || binding.action.type === "none") return "No action";
    if (binding.action.label) return binding.action.label;
    if (binding.action.type === "system") return binding.action.action.replace(/_/g, " ");
    if (binding.action.type === "command") return binding.action.command;
    return binding.action.type;
  };

  const handleIdentify = () => {
    setIdentifying(true);
    onIdentify();
  };

  // Auto-select button from live event
  if (identifying && lastEvent?.action === "press") {
    setSelectedButton(lastEvent.button);
    setIdentifying(false);
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-base font-semibold flex items-center gap-2 text-[#FAFAFA]">
          <Mouse className="w-4 h-4 text-[#71717A]" />
          Button Bindings
        </h2>
        <button
          onClick={handleIdentify}
          className={`orbit-btn flex items-center gap-2 border ${
            identifying
              ? "text-[#0A0A0B] animate-pulse"
              : "border-[#2A2A30] text-[#71717A] hover:border-[var(--accent)] hover:text-[var(--accent)]"
          }`}
          style={identifying ? { background: "var(--accent)", borderColor: "var(--accent)" } : undefined}
        >
          <Search className="w-3.5 h-3.5" />
          <span className="text-xs font-mono">{identifying ? "press a button..." : "Identify"}</span>
        </button>
      </div>

      <div className="grid grid-cols-[260px_1fr] gap-5">
        {/* Button list */}
        <div className="space-y-1">
          {Object.entries(BUTTON_LABELS).map(([key, { label, description }]) => (
            <button
              key={key}
              onClick={() => setSelectedButton(key)}
              className={`w-full text-left p-3 rounded-lg border transition-all duration-150 ${
                selectedButton === key
                  ? "border-[var(--accent)]"
                  : lastEvent?.button === key && lastEvent?.action === "press"
                  ? "border-[var(--accent)] opacity-60"
                  : "border-[#2A2A30] bg-[#17171B] hover:border-[#33333B]"
              }`}
              style={selectedButton === key ? { background: `color-mix(in srgb, var(--accent) 8%, #17171B)` } : undefined}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-[#efeee7]">{label}</div>
                  <div className="text-[10px] font-mono text-[#71717A] mt-0.5">{description}</div>
                </div>
                <div className="text-[10px] font-mono text-[#33333B]">{getActionLabel(key)}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Action picker */}
        <div>
          {selectedButton ? (
            <div className="space-y-4">
              <h3 className="text-[10px] font-mono uppercase tracking-widest text-[#71717A]">
                Action for: {BUTTON_LABELS[selectedButton]?.label ?? selectedButton}
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
                        className="p-2.5 text-left orbit-card hover:border-[var(--accent)] transition-colors"
                      >
                        <div className="text-xs text-[#efeee7]">{preset.label}</div>
                        {"label" in preset.action && (
                          <div className="text-[10px] font-mono text-[#33333B] mt-0.5">
                            {(preset.action as any).label}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {/* Custom keystroke */}
              <div>
                <h4 className="text-[10px] font-mono uppercase tracking-wider mb-2 flex items-center gap-2"
                    style={{ color: "var(--accent)" }}>
                  <Terminal className="w-3.5 h-3.5" />
                  Custom Shortcut
                </h4>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. ctrl+shift+p"
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
                <p className="text-[10px] font-mono text-[#33333B] mt-1.5">
                  press the key combination you want
                </p>
              </div>

              {/* Remove binding */}
              <button
                onClick={() =>
                  onSave({ button: selectedButton, action: { type: "none" } })
                }
                className="text-[10px] font-mono text-red-400/60 hover:text-red-400 flex items-center gap-1 mt-4 transition-colors"
              >
                <X className="w-3 h-3" />
                remove action
              </button>
            </div>
          ) : (
            <div className="text-center py-16 text-[#71717A]">
              <Keyboard className="w-10 h-10 mx-auto mb-3 opacity-15" />
              <p className="text-sm text-[#efeee7]">Select a button to configure</p>
              <p className="text-[10px] font-mono mt-2 text-[#33333B]">
                or click "Identify" and press a button on your mouse
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
