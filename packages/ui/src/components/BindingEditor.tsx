import { useState } from "react";
import {
  Mouse,
  Keyboard,
  Terminal,
  Volume2,
  Play,
  Camera,
  Monitor,
  ChevronRight,
  Zap,
  Search,
  ArrowLeft,
  ArrowRight,
  Maximize2,
  Minimize2,
  X,
  Layout,
  Globe,
  Mail,
  Lock,
  Sun,
  Moon,
} from "lucide-react";

interface BindingEditorProps {
  config: any;
  lastEvent: any;
  onSave: (binding: any) => void;
  onTest: (action: any) => void;
  onIdentify: () => void;
}

const BUTTON_LABELS: Record<string, { label: string; description: string }> = {
  side1: { label: "Botão Lateral 1", description: "Thumb / Back" },
  side2: { label: "Botão Lateral 2", description: "Forward" },
  side3: { label: "Botão Lateral 3", description: "Extra" },
  side4: { label: "Botão Lateral 4", description: "Extra" },
  dpi: { label: "Botão DPI", description: "Geralmente no topo" },
  scroll_left: { label: "Scroll Esquerda", description: "Scroll tilt" },
  scroll_right: { label: "Scroll Direita", description: "Scroll tilt" },
};

const ACTION_PRESETS = [
  {
    category: "Navegação",
    icon: <Globe className="w-4 h-4" />,
    actions: [
      { label: "Voltar", action: { type: "keystroke", key: "BrowserBack", modifiers: [], label: "Back" } },
      { label: "Avançar", action: { type: "keystroke", key: "BrowserForward", modifiers: [], label: "Forward" } },
      { label: "Nova aba", action: { type: "keystroke", key: "t", modifiers: ["ctrl"], label: "Ctrl+T" } },
      { label: "Fechar aba", action: { type: "keystroke", key: "w", modifiers: ["ctrl"], label: "Ctrl+W" } },
      { label: "Reabrir aba", action: { type: "keystroke", key: "t", modifiers: ["ctrl", "shift"], label: "Ctrl+Shift+T" } },
    ],
  },
  {
    category: "Sistema",
    icon: <Monitor className="w-4 h-4" />,
    actions: [
      { label: "Mostrar Desktop", action: { type: "system", action: "show_desktop" } },
      { label: "Task View", action: { type: "system", action: "task_view" } },
      { label: "Screenshot", action: { type: "system", action: "screenshot" } },
      { label: "Bloquear Tela", action: { type: "system", action: "lock_screen" } },
      { label: "Abrir Terminal", action: { type: "system", action: "open_terminal" } },
    ],
  },
  {
    category: "Janela",
    icon: <Layout className="w-4 h-4" />,
    actions: [
      { label: "Minimizar", action: { type: "system", action: "minimize_window" } },
      { label: "Maximizar", action: { type: "system", action: "maximize_window" } },
      { label: "Fechar", action: { type: "system", action: "close_window" } },
      { label: "Desktop Esquerda", action: { type: "system", action: "switch_desktop_left" } },
      { label: "Desktop Direita", action: { type: "system", action: "switch_desktop_right" } },
    ],
  },
  {
    category: "Mídia",
    icon: <Play className="w-4 h-4" />,
    actions: [
      { label: "Play / Pause", action: { type: "system", action: "media_play_pause" } },
      { label: "Próxima", action: { type: "system", action: "media_next" } },
      { label: "Anterior", action: { type: "system", action: "media_prev" } },
      { label: "Volume +", action: { type: "system", action: "volume_up" } },
      { label: "Volume -", action: { type: "system", action: "volume_down" } },
      { label: "Mudo", action: { type: "system", action: "volume_mute" } },
    ],
  },
  {
    category: "Atalhos",
    icon: <Keyboard className="w-4 h-4" />,
    actions: [
      { label: "Copiar", action: { type: "keystroke", key: "c", modifiers: ["ctrl"], label: "Ctrl+C" } },
      { label: "Colar", action: { type: "keystroke", key: "v", modifiers: ["ctrl"], label: "Ctrl+V" } },
      { label: "Desfazer", action: { type: "keystroke", key: "z", modifiers: ["ctrl"], label: "Ctrl+Z" } },
      { label: "Refazer", action: { type: "keystroke", key: "y", modifiers: ["ctrl"], label: "Ctrl+Y" } },
      { label: "Salvar", action: { type: "keystroke", key: "s", modifiers: ["ctrl"], label: "Ctrl+S" } },
      { label: "Buscar", action: { type: "keystroke", key: "f", modifiers: ["ctrl"], label: "Ctrl+F" } },
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
    if (!binding || binding.action.type === "none") return "Sem ação";
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
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Mouse className="w-5 h-5 text-zinc-400" />
          Configurar Botões
        </h2>
        <button
          onClick={handleIdentify}
          className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors ${
            identifying
              ? "bg-violet-600 text-white animate-pulse"
              : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
          }`}
        >
          <Search className="w-4 h-4" />
          {identifying ? "Pressione um botão..." : "Identificar Botão"}
        </button>
      </div>

      <div className="grid grid-cols-[280px_1fr] gap-6">
        {/* Button list */}
        <div className="space-y-1.5">
          {Object.entries(BUTTON_LABELS).map(([key, { label, description }]) => (
            <button
              key={key}
              onClick={() => setSelectedButton(key)}
              className={`w-full text-left p-3 rounded-lg border transition-all ${
                selectedButton === key
                  ? "bg-violet-600/10 border-violet-600/50 text-violet-300"
                  : lastEvent?.button === key && lastEvent?.action === "press"
                  ? "bg-emerald-600/10 border-emerald-600/30"
                  : "bg-zinc-900 border-zinc-800 hover:border-zinc-700"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{label}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">{description}</div>
                </div>
                <div className="text-xs text-zinc-500">{getActionLabel(key)}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Action picker */}
        <div>
          {selectedButton ? (
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-zinc-400">
                Ação para: {BUTTON_LABELS[selectedButton]?.label ?? selectedButton}
              </h3>
              {ACTION_PRESETS.map((category) => (
                <div key={category.category}>
                  <h4 className="text-xs font-medium text-zinc-500 mb-2 flex items-center gap-2">
                    {category.icon}
                    {category.category}
                  </h4>
                  <div className="grid grid-cols-3 gap-2">
                    {category.actions.map((preset) => (
                      <button
                        key={preset.label}
                        onClick={() => {
                          onSave({ button: selectedButton, action: preset.action });
                          onTest(preset.action);
                        }}
                        className="p-2.5 text-left bg-zinc-900 border border-zinc-800 rounded-lg hover:border-violet-600/50 hover:bg-violet-600/5 transition-colors"
                      >
                        <div className="text-sm">{preset.label}</div>
                        {"label" in preset.action && (
                          <div className="text-xs text-zinc-500 mt-0.5">
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
                <h4 className="text-xs font-medium text-zinc-500 mb-2 flex items-center gap-2">
                  <Terminal className="w-4 h-4" />
                  Atalho Personalizado
                </h4>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Ex: ctrl+shift+p"
                    className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm focus:border-violet-600 focus:outline-none"
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
                <p className="text-xs text-zinc-600 mt-1">
                  Pressione a combinação de teclas desejada
                </p>
              </div>

              {/* Remove binding */}
              <button
                onClick={() =>
                  onSave({ button: selectedButton, action: { type: "none" } })
                }
                className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 mt-4"
              >
                <X className="w-3 h-3" />
                Remover ação deste botão
              </button>
            </div>
          ) : (
            <div className="text-center py-16 text-zinc-500">
              <Keyboard className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Selecione um botão para configurar</p>
              <p className="text-xs mt-1">
                Ou clique "Identificar Botão" e pressione o botão no mouse
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
