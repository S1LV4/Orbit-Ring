import { useState, useRef, useCallback } from "react";
import {
  Copy, Clipboard, Undo2, Save, Camera, Terminal,
  Play, Monitor, Volume2, VolumeX, SkipForward, SkipBack,
  Search, Maximize2, Minimize2, X, Layout, Globe, Lock,
  FolderOpen, RefreshCw, Printer, FileDown, ArrowLeft, ArrowRight,
  Keyboard, Scissors, RotateCcw, ZoomIn, ZoomOut,
  Settings, GripVertical, Plus, ChevronDown, ChevronRight,
} from "lucide-react";

// ── Action catalog ──
const CATEGORIES = [
  {
    name: "Edição",
    open: true,
    actions: [
      { id: "copy", label: "Copiar", icon: Copy, action: { type: "keystroke", key: "c", modifiers: ["ctrl"] } },
      { id: "paste", label: "Colar", icon: Clipboard, action: { type: "keystroke", key: "v", modifiers: ["ctrl"] } },
      { id: "undo", label: "Desfazer", icon: Undo2, action: { type: "keystroke", key: "z", modifiers: ["ctrl"] } },
      { id: "redo", label: "Refazer", icon: RotateCcw, action: { type: "keystroke", key: "y", modifiers: ["ctrl"] } },
      { id: "cut", label: "Recortar", icon: Scissors, action: { type: "keystroke", key: "x", modifiers: ["ctrl"] } },
      { id: "save", label: "Salvar", icon: Save, action: { type: "keystroke", key: "s", modifiers: ["ctrl"] } },
      { id: "find", label: "Buscar", icon: Search, action: { type: "keystroke", key: "f", modifiers: ["ctrl"] } },
    ],
  },
  {
    name: "Navegação",
    open: false,
    actions: [
      { id: "back", label: "Voltar", icon: ArrowLeft, action: { type: "keystroke", key: "BrowserBack", modifiers: [] } },
      { id: "forward", label: "Avançar", icon: ArrowRight, action: { type: "keystroke", key: "BrowserForward", modifiers: [] } },
      { id: "refresh", label: "Atualizar", icon: RefreshCw, action: { type: "keystroke", key: "F5", modifiers: [] } },
      { id: "zoomin", label: "Zoom +", icon: ZoomIn, action: { type: "keystroke", key: "+", modifiers: ["ctrl"] } },
      { id: "zoomout", label: "Zoom -", icon: ZoomOut, action: { type: "keystroke", key: "-", modifiers: ["ctrl"] } },
    ],
  },
  {
    name: "Sistema",
    open: false,
    actions: [
      { id: "screenshot", label: "Screenshot", icon: Camera, action: { type: "system", action: "screenshot" } },
      { id: "terminal", label: "Terminal", icon: Terminal, action: { type: "system", action: "open_terminal" } },
      { id: "desktop", label: "Mostrar Desktop", icon: Monitor, action: { type: "system", action: "show_desktop" } },
      { id: "lock", label: "Bloquear Tela", icon: Lock, action: { type: "system", action: "lock_screen" } },
      { id: "explorer", label: "Explorador", icon: FolderOpen, action: { type: "system", action: "open_file_manager" } },
    ],
  },
  {
    name: "Mídia",
    open: false,
    actions: [
      { id: "playpause", label: "Play/Pause", icon: Play, action: { type: "system", action: "media_play_pause" } },
      { id: "next", label: "Próxima", icon: SkipForward, action: { type: "system", action: "media_next" } },
      { id: "prev", label: "Anterior", icon: SkipBack, action: { type: "system", action: "media_prev" } },
      { id: "volup", label: "Volume +", icon: Volume2, action: { type: "system", action: "volume_up" } },
      { id: "volmute", label: "Mudo", icon: VolumeX, action: { type: "system", action: "volume_mute" } },
    ],
  },
  {
    name: "Janela",
    open: false,
    actions: [
      { id: "maximize", label: "Maximizar", icon: Maximize2, action: { type: "system", action: "maximize_window" } },
      { id: "minimize", label: "Minimizar", icon: Minimize2, action: { type: "system", action: "minimize_window" } },
      { id: "close", label: "Fechar Janela", icon: X, action: { type: "system", action: "close_window" } },
      { id: "print", label: "Imprimir", icon: Printer, action: { type: "keystroke", key: "p", modifiers: ["ctrl"] } },
      { id: "saveas", label: "Salvar como", icon: FileDown, action: { type: "keystroke", key: "s", modifiers: ["ctrl", "shift"] } },
    ],
  },
];

// All actions flat for lookup
const ALL_ACTIONS = CATEGORIES.flatMap((c) => c.actions);

// Ring slot positions (8 slots in a circle)
const SLOTS = 8;
const CX = 200, CY = 200, R = 120;
const slotPositions = Array.from({ length: SLOTS }, (_, i) => {
  const ang = (i / SLOTS) * Math.PI * 2 - Math.PI / 2;
  return { x: CX + Math.cos(ang) * R, y: CY + Math.sin(ang) * R, ang };
});

interface RingEditorProps {
  onSave?: (slots: (string | null)[]) => void;
}

export function RingEditor({ onSave }: RingEditorProps) {
  const [slots, setSlots] = useState<(string | null)[]>([
    "copy", "paste", "undo", "save", "screenshot", "terminal", "playpause", "desktop",
  ]);
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({ Edição: true });
  const [dragItem, setDragItem] = useState<string | null>(null);
  const [hoverSlot, setHoverSlot] = useState<number | null>(null);
  const [dragOverRing, setDragOverRing] = useState(false);

  const getAction = (id: string | null) => ALL_ACTIONS.find((a) => a.id === id);

  const handleDragStart = (actionId: string) => (e: React.DragEvent) => {
    setDragItem(actionId);
    e.dataTransfer.setData("text/plain", actionId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleSlotDragStart = (slotIndex: number) => (e: React.DragEvent) => {
    const id = slots[slotIndex];
    if (!id) return;
    setDragItem(id);
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
    // Remove from slot
    setSlots((s) => { const n = [...s]; n[slotIndex] = null; return n; });
  };

  const handleSlotDrop = (slotIndex: number) => (e: React.DragEvent) => {
    e.preventDefault();
    const actionId = e.dataTransfer.getData("text/plain");
    if (!actionId) return;

    setSlots((s) => {
      const n = [...s];
      // If this action is already in another slot, remove it
      const existingIdx = n.indexOf(actionId);
      if (existingIdx >= 0) n[existingIdx] = null;
      n[slotIndex] = actionId;
      return n;
    });
    setDragItem(null);
    setHoverSlot(null);
  };

  const handleRemoveSlot = (slotIndex: number) => {
    setSlots((s) => { const n = [...s]; n[slotIndex] = null; return n; });
  };

  const toggleCat = (name: string) => {
    setOpenCats((o) => ({ ...o, [name]: !o[name] }));
  };

  return (
    <div className="flex h-full">
      {/* Ring visual editor */}
      <div className="flex-1 flex items-center justify-center">
        <div
          className="relative"
          style={{ width: 400, height: 400 }}
          onDragOver={(e) => { e.preventDefault(); setDragOverRing(true); }}
          onDragLeave={() => setDragOverRing(false)}
          onDrop={() => setDragOverRing(false)}
        >
          {/* Center dot */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center z-10">
            <X className="w-3 h-3 text-zinc-500" />
          </div>

          {/* Connection lines */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 400 400">
            {slotPositions.map((pos, i) => (
              <line
                key={i}
                x1={CX} y1={CY}
                x2={pos.x} y2={pos.y}
                stroke={hoverSlot === i ? "rgba(139,92,246,0.3)" : "rgba(255,255,255,0.04)"}
                strokeWidth={hoverSlot === i ? 2 : 1}
                strokeDasharray={slots[i] ? "none" : "4 4"}
              />
            ))}
          </svg>

          {/* Slots */}
          {slotPositions.map((pos, i) => {
            const action = getAction(slots[i]);
            const Icon = action?.icon;
            const isEmpty = !action;
            const isHovered = hoverSlot === i;

            return (
              <div key={i} className="absolute" style={{ left: pos.x - 30, top: pos.y - 30 }}>
                {/* Drop zone */}
                <div
                  className={`w-[60px] h-[60px] rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 ${
                    isEmpty
                      ? `border-2 border-dashed ${isHovered && dragItem ? "border-violet-500 bg-violet-500/10 scale-110" : "border-zinc-700 hover:border-zinc-500"}`
                      : `border-2 ${isHovered ? "border-violet-500 shadow-lg shadow-violet-500/20 scale-110" : "border-zinc-700 hover:border-zinc-500"} bg-zinc-800`
                  }`}
                  draggable={!isEmpty}
                  onDragStart={handleSlotDragStart(i)}
                  onDragOver={(e) => { e.preventDefault(); setHoverSlot(i); }}
                  onDragLeave={() => setHoverSlot(null)}
                  onDrop={handleSlotDrop(i)}
                  onDoubleClick={() => handleRemoveSlot(i)}
                  title={isEmpty ? "Arraste uma ação aqui" : `${action.label} (duplo-click para remover)`}
                >
                  {Icon ? (
                    <Icon className="w-5 h-5 text-zinc-300" />
                  ) : (
                    <Plus className="w-4 h-4 text-zinc-600" />
                  )}
                </div>

                {/* Label */}
                {action && (
                  <div
                    className="absolute whitespace-nowrap text-[10px] text-zinc-400 pointer-events-none"
                    style={{
                      left: Math.cos(pos.ang) > 0.3 ? 68 : Math.cos(pos.ang) < -0.3 ? "auto" : "50%",
                      right: Math.cos(pos.ang) < -0.3 ? 68 : "auto",
                      top: Math.abs(Math.cos(pos.ang)) <= 0.3
                        ? (Math.sin(pos.ang) > 0 ? 66 : -18)
                        : "50%",
                      transform: Math.abs(Math.cos(pos.ang)) <= 0.3
                        ? "translateX(-50%)"
                        : "translateY(-50%)",
                    }}
                  >
                    {action.label}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Action catalog sidebar */}
      <div className="w-72 bg-zinc-900 border-l border-zinc-800 overflow-y-auto">
        <div className="p-3 border-b border-zinc-800">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-zinc-400" />
            Ações Disponíveis
          </h3>
          <p className="text-[10px] text-zinc-500 mt-1">
            Arraste para os slots do ring
          </p>
        </div>

        {CATEGORIES.map((cat) => {
          const isOpen = openCats[cat.name] ?? cat.open;
          return (
            <div key={cat.name}>
              <button
                onClick={() => toggleCat(cat.name)}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-semibold text-violet-400 hover:bg-zinc-800/50 transition-colors uppercase tracking-wider"
              >
                {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                {cat.name}
              </button>

              {isOpen && (
                <div className="pb-1">
                  {cat.actions.map((act) => {
                    const inRing = slots.includes(act.id);
                    const Icon = act.icon;
                    return (
                      <div
                        key={act.id}
                        draggable
                        onDragStart={handleDragStart(act.id)}
                        className={`flex items-center gap-3 px-3 py-2 mx-1 rounded-lg cursor-grab active:cursor-grabbing transition-all ${
                          inRing
                            ? "opacity-40"
                            : "hover:bg-zinc-800 active:bg-violet-900/20"
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          inRing ? "bg-zinc-800" : "bg-zinc-800 border border-zinc-700"
                        }`}>
                          <Icon className="w-4 h-4 text-zinc-300" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-zinc-300 truncate">{act.label}</div>
                        </div>
                        <GripVertical className="w-3 h-3 text-zinc-600 flex-shrink-0" />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
