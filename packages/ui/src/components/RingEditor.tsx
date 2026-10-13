import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Copy, Clipboard, Undo2, Save, Camera, Terminal,
  Play, Monitor, Volume2, VolumeX, SkipForward, SkipBack,
  Search, Maximize2, Minimize2, X, Lock,
  FolderOpen, RefreshCw, Printer, FileDown, ArrowLeft, ArrowRight,
  Scissors, RotateCcw, ZoomIn, ZoomOut,
  Keyboard, Plus, ChevronDown, ChevronRight,
  Trash2, Pencil, Compass, Layers, Music, Aperture, Settings, Headphones,
  Bot, Brain, Cpu, Eye, Sparkles, CheckCircle, XCircle, Activity, Puzzle,
} from "lucide-react";
import type { RingSettings, RingGroup } from "@m-ring/shared";

// ── Context menu ──
function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: { label: string; danger?: boolean; onClick: () => void }[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);
  return (
    <div ref={ref} className="fixed z-50 py-1 min-w-[140px] rounded-lg border border-[#2A2A30] bg-[#17171B] shadow-xl"
      style={{ left: x, top: y }}>
      {items.map((item, i) => (
        <button key={i} onClick={() => { item.onClick(); onClose(); }}
          className={`w-full text-left px-3 py-1.5 text-[11px] transition-colors ${
            item.danger ? "text-red-400 hover:bg-red-400/10" : "text-[#efeee7] hover:bg-[#2A2A30]"
          }`}>{item.label}</button>
      ))}
    </div>
  );
}

// ── Action catalog ──
const ACTIONS = [
  { id: "copy", label: "Copy", icon: Copy, cat: "Edit" },
  { id: "paste", label: "Paste", icon: Clipboard, cat: "Edit" },
  { id: "undo", label: "Undo", icon: Undo2, cat: "Edit" },
  { id: "redo", label: "Redo", icon: RotateCcw, cat: "Edit" },
  { id: "cut", label: "Cut", icon: Scissors, cat: "Edit" },
  { id: "save", label: "Save", icon: Save, cat: "Edit" },
  { id: "find", label: "Find", icon: Search, cat: "Edit" },
  { id: "back", label: "Back", icon: ArrowLeft, cat: "Navigate" },
  { id: "forward", label: "Forward", icon: ArrowRight, cat: "Navigate" },
  { id: "refresh", label: "Refresh", icon: RefreshCw, cat: "Navigate" },
  { id: "zoomin", label: "Zoom +", icon: ZoomIn, cat: "Navigate" },
  { id: "zoomout", label: "Zoom -", icon: ZoomOut, cat: "Navigate" },
  { id: "screenshot", label: "Screenshot", icon: Camera, cat: "System" },
  { id: "terminal", label: "Terminal", icon: Terminal, cat: "System" },
  { id: "desktop", label: "Desktop", icon: Monitor, cat: "System" },
  { id: "lock", label: "Lock", icon: Lock, cat: "System" },
  { id: "explorer", label: "Explorer", icon: FolderOpen, cat: "System" },
  { id: "playpause", label: "Play/Pause", icon: Play, cat: "Media" },
  { id: "next", label: "Next", icon: SkipForward, cat: "Media" },
  { id: "prev", label: "Previous", icon: SkipBack, cat: "Media" },
  { id: "volup", label: "Vol +", icon: Volume2, cat: "Media" },
  { id: "volmute", label: "Mute", icon: VolumeX, cat: "Media" },
  { id: "maximize", label: "Maximize", icon: Maximize2, cat: "Window" },
  { id: "minimize", label: "Minimize", icon: Minimize2, cat: "Window" },
  { id: "close", label: "Close", icon: X, cat: "Window" },
  { id: "print", label: "Print", icon: Printer, cat: "Window" },
  { id: "saveas", label: "Save As", icon: FileDown, cat: "Window" },
  { id: "discord_mute", label: "Discord Mute", icon: VolumeX, cat: "Discord" },
  // AI Agents
  { id: "agent_claude", label: "Claude Code", icon: Brain, cat: "AI Agents" },
  { id: "agent_codex", label: "Codex CLI", icon: Bot, cat: "AI Agents" },
  { id: "agent_cursor", label: "Cursor", icon: Cpu, cat: "AI Agents" },
  { id: "agent_gemini", label: "Gemini CLI", icon: Sparkles, cat: "AI Agents" },
  { id: "agent_copilot", label: "GitHub Copilot", icon: Eye, cat: "AI Agents" },
  { id: "agent_approve", label: "Aprovar Agente", icon: CheckCircle, cat: "AI Agents" },
  { id: "agent_decline", label: "Recusar Agente", icon: XCircle, cat: "AI Agents" },
  { id: "agent_status", label: "Status Agentes", icon: Activity, cat: "AI Agents" },
  { id: "discord_deafen", label: "Discord Deafen", icon: Volume2, cat: "Discord" },
  { id: "discord_screen", label: "Discord Screen", icon: Monitor, cat: "Discord" },
];

const GROUP_ICON_OPTIONS = [
  { id: "edit", icon: Pencil, label: "Edit" },
  { id: "compass", icon: Compass, label: "Navigate" },
  { id: "layers", icon: Layers, label: "Windows" },
  { id: "music", icon: Music, label: "Media" },
  { id: "aperture", icon: Aperture, label: "Capture" },
  { id: "settings", icon: Settings, label: "System" },
  { id: "discord", icon: Headphones, label: "Discord" },
  { id: "brain", icon: Brain, label: "AI" },
];

// Each color maps to a ring theme + accent
const THEME_OPTIONS = [
  { accent: "#C6F432", theme: "dark",       color: "#C6F432", label: "Verde" },
  { accent: "#FF6B2B", theme: "orange",     color: "#FF6B2B", label: "Laranja" },
  { accent: "#2B8AFF", theme: "neg-orange", color: "#2B8AFF", label: "Azul" },
  { accent: "#FFFFFF", theme: "neg",        color: "#FFFFFF", label: "Negativo" },
  { accent: "#000000", theme: "light",      color: "#000000", label: "Branco" },
];

// Ring preview — inline HTML loaded in iframe
function RingPreview({ groups, accent, theme, liquid }: { groups: RingGroup[]; accent: string; theme: string; liquid: boolean }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const sendConfig = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    try {
      const w = win as any;
      if (typeof w.applyConfig === "function") {
        w.applyConfig({ groups, accent, theme, liquid });
        if (typeof w.setTheme === "function") w.setTheme(theme, false);
      }
    } catch (e) { console.error("ring preview:", e); }
  }, [groups, accent, theme, liquid]);

  useEffect(() => {
    // Small delay to let iframe script execute
    const t = setTimeout(sendConfig, 200);
    return () => clearTimeout(t);
  }, [sendConfig]);

  const src = "/ring-preview.html";

  return (
    <div className="relative w-full h-full overflow-hidden">
      <iframe
        ref={iframeRef}
        src={src}
        onLoad={sendConfig}
        className="border-0"
        style={{ width: "640px", height: "640px", transformOrigin: "top left", pointerEvents: "auto" }}
      />
    </div>
  );
}

interface RingEditorProps {
  settings: RingSettings;
  onSave: (settings: RingSettings) => void;
  plugins?: { id: string; name: string; actions: { id: string; name: string; description?: string }[] }[];
}

export function RingEditor({ settings, onSave, plugins = [] }: RingEditorProps) {
  const [groups, setGroups] = useState<RingGroup[]>(settings.groups ?? []);
  const [theme, setTheme] = useState(settings.theme ?? "dark");
  const [size, setSize] = useState(settings.size ?? 320);
  const [accent, setAccent] = useState(settings.accent ?? "#C6F432");
  const [speed, setSpeed] = useState(settings.speed ?? 1);
  const [liquid, setLiquid] = useState(settings.liquid ?? true);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(
    settings.groups?.[0]?.id ?? null
  );
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({ Edit: true });
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; items: { label: string; danger?: boolean; onClick: () => void }[] } | null>(null);
  const [dragGroup, setDragGroup] = useState<string | null>(null);

  // Merge static actions with plugin actions
  const allActions = useMemo(() => {
    const pluginActions = plugins.flatMap(p =>
      p.actions.map(a => ({
        id: `plugin:${p.id}:${a.id}`,
        label: a.name,
        icon: Puzzle,
        cat: `Plugin: ${p.name}`,
      }))
    );
    return [...ACTIONS, ...pluginActions];
  }, [plugins]);
  const allCategories = useMemo(() => [...new Set(allActions.map(a => a.cat))], [allActions]);

  useEffect(() => {
    if (settings.groups) setGroups(settings.groups);
    if (settings.theme) setTheme(settings.theme);
    if (settings.size) setSize(settings.size);
    if (settings.accent) setAccent(settings.accent);
    if (settings.speed != null) setSpeed(settings.speed);
    if (settings.liquid != null) setLiquid(settings.liquid);
    if (settings.groups?.[0] && !selectedGroup) setSelectedGroup(settings.groups[0].id);
  }, [settings]);

  const save = (g: RingGroup[], t = theme, sz = size, ac = accent, sp = speed, lq = liquid) => {
    onSave({ groups: g, theme: t, size: sz, accent: ac, speed: sp, liquid: lq });
  };

  const updateGroups = (g: RingGroup[]) => { setGroups(g); save(g); };
  const updateTheme = (t: string) => { setTheme(t); save(groups, t); };
  const updateAccent = (ac: string) => { setAccent(ac); save(groups, theme, size, ac); };

  const addGroup = () => {
    const id = "grp_" + Date.now();
    const g = [...groups, { id, name: "New Group", icon: "settings", actions: [] }];
    updateGroups(g);
    setSelectedGroup(id);
  };

  const removeGroup = (id: string) => {
    const g = groups.filter((x) => x.id !== id);
    updateGroups(g);
    if (selectedGroup === id) setSelectedGroup(g[0]?.id ?? null);
  };

  const renameGroup = (id: string, name: string) => {
    updateGroups(groups.map((g) => (g.id === id ? { ...g, name } : g)));
  };

  const setGroupIcon = (id: string, icon: string) => {
    updateGroups(groups.map((g) => (g.id === id ? { ...g, icon } : g)));
  };

  const addActionToGroup = (groupId: string, actionId: string) => {
    updateGroups(
      groups.map((g) =>
        g.id === groupId && !g.actions.includes(actionId)
          ? { ...g, actions: [...g.actions, actionId] }
          : g
      )
    );
  };

  const removeActionFromGroup = (groupId: string, actionId: string) => {
    updateGroups(
      groups.map((g) =>
        g.id === groupId ? { ...g, actions: g.actions.filter((a) => a !== actionId) } : g
      )
    );
  };

  const usedActions = new Set(groups.flatMap((g) => g.actions));
  const currentGroup = groups.find((g) => g.id === selectedGroup);
  const getAction = (id: string) => allActions.find((a) => a.id === id);

  return (
    <div className="flex h-full">
      {/* Center: Ring Preview */}
      <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden">
        {/* Top bar */}
        <div className="absolute top-12 left-0 right-0 flex items-center justify-center gap-3 z-10">
          <div className="flex gap-1.5 p-1.5 rounded-full bg-[#17171B]/80 border border-[#2A2A30] backdrop-blur">
            {THEME_OPTIONS.map((opt) => {
              const isSelected = accent === opt.accent;
              return (
                <button key={opt.accent} title={opt.label}
                  onClick={() => { setAccent(opt.accent); setTheme(opt.theme); save(groups, opt.theme, size, opt.accent); }}
                  className={`w-5 h-5 rounded-full border transition-all ${isSelected ? "scale-125 border-[#efeee7]" : "border-[#3A3A42] opacity-60 hover:opacity-100 hover:scale-110"}`}
                  style={{ background: opt.color }} />
              );
            })}
          </div>
          <button onClick={addGroup}
            className="flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-medium bg-[#17171B]/80 border border-[#2A2A30] text-[#71717A] hover:text-[var(--accent)] hover:border-[var(--accent)] backdrop-blur transition-colors">
            <Plus className="w-3 h-3" /> Add group
          </button>
        </div>

        {/* Ring iframe */}
        <div style={{ width: "640px", height: "640px" }}>
          <RingPreview groups={groups} accent={accent} theme={theme} liquid={liquid} />
        </div>
      </div>

      {/* Right sidebar */}
      <div className="w-64 bg-[#111114] border-l border-[#2A2A30] flex flex-col overflow-hidden">
        {/* Groups list */}
        <div className="border-b border-[#2A2A30]">
          <div className="px-4 py-3">
            <h3 className="text-[11px] font-semibold text-[#efeee7] uppercase tracking-wider">Groups</h3>
          </div>
          <div className="px-2 pb-2 space-y-0.5 max-h-[200px] overflow-y-auto">
            {groups.map((g, idx) => {
              const gi = GROUP_ICON_OPTIONS.find((o) => o.id === g.icon);
              const Icon = gi?.icon ?? Settings;
              const isSelected = selectedGroup === g.id;
              return (
                <button key={g.id} draggable
                  onClick={() => setSelectedGroup(g.id)}
                  onDragStart={() => setDragGroup(g.id)}
                  onDragEnd={() => setDragGroup(null)}
                  onDragOver={(e) => { e.preventDefault(); }}
                  onDrop={(e) => { e.preventDefault(); if (dragGroup && dragGroup !== g.id) { const ng=[...groups]; const fi=ng.findIndex(x=>x.id===dragGroup); const ti=ng.findIndex(x=>x.id===g.id); if(fi>=0&&ti>=0){const[m]=ng.splice(fi,1);ng.splice(ti,0,m);updateGroups(ng)} } setDragGroup(null); }}
                  onContextMenu={(e) => { e.preventDefault(); setCtxMenu({x:e.clientX,y:e.clientY,items:[{label:"Duplicar",onClick:()=>{updateGroups([...groups,{...g,id:"grp_"+Date.now(),name:g.name+" (cópia)"}])}},{label:"Remover",danger:true,onClick:()=>removeGroup(g.id)}]}); }}
                  className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs cursor-grab active:cursor-grabbing transition-all ${
                    isSelected ? "bg-[#1E1E24] text-[#FAFAFA]" : "text-[#71717A] hover:text-[#efeee7] hover:bg-[#1A1A1E]"}`}>
                  <span className="text-[9px] font-mono w-3 opacity-40">{idx+1}</span>
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" style={isSelected ? {color:accent} : undefined} />
                  <span className="truncate flex-1 text-left">{g.name}</span>
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{background:idx<8?accent:"#444"}} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected group editor */}
        {currentGroup && (
          <div className="border-b border-[#2A2A30] px-4 py-3 space-y-3">
            <div className="flex items-center gap-2">
              <input value={currentGroup.name} onChange={(e) => renameGroup(currentGroup.id, e.target.value)}
                className="orbit-input flex-1 text-xs" />
              <button onClick={() => removeGroup(currentGroup.id)} className="text-[#555] hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
            <div className="flex gap-0.5">
              {GROUP_ICON_OPTIONS.map((o) => { const I=o.icon; return (
                <button key={o.id} onClick={() => setGroupIcon(currentGroup.id, o.id)} title={o.label}
                  className={`w-6 h-6 rounded flex items-center justify-center transition-all ${currentGroup.icon===o.id?"text-[#0A0A0B]":"text-[#555] hover:text-[#efeee7]"}`}
                  style={currentGroup.icon===o.id?{background:accent}:undefined}><I className="w-3 h-3" /></button>
              );})}
            </div>
            <div className="flex flex-wrap gap-1">
              {currentGroup.actions.map((aid) => { const a=getAction(aid); if(!a) return null; const Icon=a.icon; return (
                <div key={aid} className="group flex items-center gap-1 px-2 py-1 rounded-md bg-[#1A1A1E] border border-[#2A2A30] text-[#efeee7] text-[10px] cursor-context-menu"
                  onContextMenu={(e) => { e.preventDefault(); const avail=ACTIONS.filter(act=>!currentGroup.actions.includes(act.id)&&act.id!==aid);
                    setCtxMenu({x:e.clientX,y:e.clientY,items:[...avail.slice(0,8).map(act=>({label:act.label,onClick:()=>{updateGroups(groups.map(g=>g.id===currentGroup.id?{...g,actions:g.actions.map(a2=>a2===aid?act.id:a2)}:g))}})),{label:"Remover",danger:true,onClick:()=>removeActionFromGroup(currentGroup.id,aid)}]}); }}>
                  <Icon className="w-3 h-3 opacity-50" />{a.label}
                  <button onClick={()=>removeActionFromGroup(currentGroup.id,aid)} className="opacity-0 group-hover:opacity-100 text-[#555] hover:text-red-400 ml-0.5"><X className="w-2.5 h-2.5" /></button>
                </div>
              );})}
            </div>
          </div>
        )}

        {/* Action catalog */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 py-3">
            <h3 className="text-[11px] font-semibold text-[#efeee7] uppercase tracking-wider">Actions</h3>
          </div>
          {allCategories.map((cat) => {
            const isOpen = openCats[cat] ?? false;
            const catActions = allActions.filter((a) => a.cat === cat);
            return (
              <div key={cat}>
                <button onClick={() => setOpenCats((o) => ({ ...o, [cat]: !o[cat] }))}
                  className="w-full flex items-center gap-2 px-4 py-2 text-[10px] font-medium uppercase tracking-wider hover:bg-[#1A1A1E] transition-colors"
                  style={{ color: accent }}>
                  {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}{cat}
                </button>
                {isOpen && <div className="pb-1 px-2">
                  {catActions.map((act) => { const inGroup=usedActions.has(act.id); const Icon=act.icon; return (
                    <button key={act.id} disabled={inGroup||!selectedGroup}
                      onClick={() => { if(selectedGroup&&!inGroup) addActionToGroup(selectedGroup,act.id); }}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left transition-all ${inGroup?"opacity-20 cursor-not-allowed":"hover:bg-[#1A1A1E] cursor-pointer"}`}>
                      <Icon className="w-3.5 h-3.5 text-[#888]" />
                      <span className="text-[11px] text-[#ccc]">{act.label}</span>
                    </button>
                  );})}
                </div>}
              </div>
            );
          })}
        </div>
      </div>
      {ctxMenu && <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxMenu.items} onClose={() => setCtxMenu(null)} />}
    </div>
  );
}
