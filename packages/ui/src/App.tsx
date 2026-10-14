import { useState, useEffect } from "react";
import { AuthorCredit } from "./components/AuthorCredit";
import {
  Mouse,
  Settings,
  Layers,
  Zap,
  CircleDot,
  Puzzle,
  Wifi,
  WifiOff,
  Loader2,
} from "lucide-react";
import { useWebSocket } from "./hooks/useWebSocket";
import { DevicePanel } from "./components/DevicePanel";
import { BindingEditor } from "./components/BindingEditor";
import { ProfileList } from "./components/ProfileList";
import { RingEditor } from "./components/RingEditor";
import { PluginManager } from "./components/PluginManager";
import type { PluginInfo, CatalogPlugin } from "./components/PluginManager";

type Tab = "devices" | "bindings" | "ring" | "profiles" | "plugins" | "settings";

export function App() {
  const { state, onMessage, send } = useWebSocket();
  const [tab, setTab] = useState<Tab>("ring");
  const [devices, setDevices] = useState<any[]>([]);
  const [config, setConfig] = useState<any>(null);
  const [lastEvent, setLastEvent] = useState<any>(null);
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [catalog, setCatalog] = useState<CatalogPlugin[]>([]);
  const [ringSettings, setRingSettings] = useState<any>({
    groups: [
      { id: "edit", name: "Edicao", icon: "edit", actions: ["copy", "paste", "undo"] },
      { id: "nav", name: "Navegacao", icon: "compass", actions: ["back", "forward", "refresh"] },
      { id: "win", name: "Janelas", icon: "layers", actions: ["minimize", "maximize", "close"] },
      { id: "media", name: "Midia", icon: "music", actions: ["playpause", "volmute"] },
      { id: "cap", name: "Captura", icon: "aperture", actions: ["screenshot"] },
      { id: "sys", name: "Sistema", icon: "settings", actions: ["save", "explorer", "find"] },
    ],
    theme: "dark",
    size: 320,
    accent: "#C6F432",
    speed: 1,
    liquid: true,
  });

  const accentRaw = ringSettings.accent || "#C6F432";
  const accent = accentRaw === "#FFFFFF" ? "#E0E0E0"
    : accentRaw === "#000000" ? "#888888"
    : accentRaw;

  useEffect(() => {
    document.documentElement.style.setProperty("--accent", accent);
    const r = parseInt(accent.slice(1, 3), 16);
    const g = parseInt(accent.slice(3, 5), 16);
    const b = parseInt(accent.slice(5, 7), 16);
    document.documentElement.style.setProperty("--accent-rgb", `${r}, ${g}, ${b}`);
  }, [accent]);

  useEffect(() => {
    return onMessage((msg: any) => {
      switch (msg.type) {
        case "devices": setDevices(msg.devices); break;
        case "config_loaded": setConfig(msg.config); break;
        case "ring_config": setRingSettings(msg.ring); break;
        case "button_event": setLastEvent(msg); break;
        case "plugins": setPlugins(msg.plugins); break;
        case "plugin_catalog": setCatalog(Array.isArray(msg.plugins) ? msg.plugins : []); break;
      }
    });
  }, [onMessage]);

  useEffect(() => {
    if (state === "connected") send({ type: "get_plugin_catalog" });
  }, [state, send]);

  const connectionIcon = {
    connected: <Wifi className="w-3.5 h-3.5" style={{ color: accent }} />,
    connecting: <Loader2 className="w-3.5 h-3.5 text-yellow-400 animate-spin" />,
    disconnected: <WifiOff className="w-3.5 h-3.5 text-red-400" />,
  }[state];

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "ring", label: "Ring", icon: <CircleDot className="w-4 h-4" /> },
    { id: "bindings", label: "Buttons", icon: <Mouse className="w-4 h-4" /> },
    { id: "devices", label: "Devices", icon: <Zap className="w-4 h-4" /> },
    { id: "profiles", label: "Profiles", icon: <Layers className="w-4 h-4" /> },
    { id: "plugins", label: "Plugins", icon: <Puzzle className="w-4 h-4" /> },
    { id: "settings", label: "Settings", icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <div className="flex h-screen bg-orbit-bg">
      <div className="fixed top-0 left-0 right-0 h-9 z-50" style={{ WebkitAppRegion: "drag" } as any} />

      <aside className="w-48 bg-[#141417] border-r border-orbit-border flex flex-col">
        <div className="px-4 py-5 border-b border-orbit-border" style={{ WebkitAppRegion: "drag" } as any}>
          <div className="flex items-center gap-2.5">
            <svg viewBox="0 0 128 128" className="w-7 h-7 shrink-0">
              <circle cx="64" cy="64" r="42" fill="none" stroke="#F7F8F4" strokeWidth="8" strokeLinecap="round" strokeDasharray="183 81" transform="rotate(-53 64 64)"/>
              <circle cx="64" cy="64" r="26" fill="none" stroke="#F7F8F4" strokeWidth="6" opacity=".34"/>
              <path d="M64 38 V48 M64 80 V90 M38 64 H48 M80 64 H90" stroke="#F7F8F4" strokeWidth="4" strokeLinecap="round" opacity=".55"/>
              <circle cx="64" cy="64" r="10" fill={accent}/>
              <circle cx="99.9" cy="42.4" r="8" fill={accent}/>
            </svg>
            <div>
              <h1 className="text-sm text-orbit-text tracking-tight leading-none"><span className="font-bold">orbit</span><span className="font-light">Ring</span></h1>
              <p className="text-[10px] font-mono text-orbit-text-muted tracking-wide mt-0.5">v1.0.0</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-2 py-3 space-y-0.5" style={{ WebkitAppRegion: "no-drag" } as any}>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150 ${
                tab === t.id
                  ? "text-orbit-bg"
                  : "text-orbit-text-muted hover:text-orbit-text hover:bg-orbit-card"
              }`}
              style={tab === t.id ? { background: accent, color: "#0A0A0B" } : undefined}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>

        <div className="px-3 py-3 border-t border-orbit-border">
          <div className="flex items-center gap-2 text-[10px] font-mono text-orbit-text-muted">
            {connectionIcon}
            <span>
              {state === "connected"
                ? "connected"
                : state === "connecting"
                ? "connecting..."
                : "offline"}
            </span>
          </div>
          {devices.length > 0 && (
            <div className="mt-1 text-[10px] font-mono text-orbit-border-light">
              {devices.length} device{devices.length > 1 ? "s" : ""}
            </div>
          )}
        </div>

        <div className="px-3 py-3 border-t border-orbit-border" style={{ WebkitAppRegion: "no-drag" } as any}>
          <AuthorCredit author="@S1LV4" prefix="developed by" size={18} />
          <a
            href="https://github.com/S1LV4/Orbit-Ring"
            target="_blank"
            rel="noreferrer noopener"
            className="mt-1.5 block text-[10px] font-mono text-orbit-text-muted hover:text-(--accent) transition-colors"
          >
            open source · github
          </a>
        </div>
      </aside>

      <main className="flex-1 overflow-auto relative pt-9">

        <div className="relative z-10">
        {tab === "ring" && (
          <RingEditor
            settings={ringSettings}
            onSave={(ring) => send({ type: "save_ring", ring })}
            plugins={plugins}
          />
        )}
        {tab === "devices" && (
          <DevicePanel devices={devices} lastEvent={lastEvent} />
        )}
        {tab === "bindings" && (
          <BindingEditor
            config={config}
            lastEvent={lastEvent}
            onSave={(binding) =>
              send({ type: "save_binding", profileId: null, binding })
            }
            onTest={(action) => send({ type: "test_action", action })}
            onIdentify={() => send({ type: "identify_button" })}
          />
        )}
        {tab === "profiles" && (
          <ProfileList
            config={config}
            onSave={(profile) => send({ type: "save_profile", profile })}
            onDelete={(id) => send({ type: "delete_profile", profileId: id })}
          />
        )}
        {tab === "plugins" && (
          <PluginManager
            plugins={plugins}
            catalog={catalog}
            onInstall={(pluginId) => send({ type: "install_plugin", pluginId })}
            onRemove={(pluginId) =>
              send({ type: "remove_plugin", pluginId })
            }
            onToggle={(pluginId, enabled) =>
              send({ type: "toggle_plugin", pluginId, enabled })
            }
            onOpenFolder={() =>
              send({ type: "open_plugins_folder" })
            }
          />
        )}
        {tab === "settings" && (
          <div className="p-6">
            <h2 className="text-base font-semibold mb-5 flex items-center gap-2 text-orbit-text">
              <Settings className="w-4 h-4 text-orbit-text-muted" />
              Settings
            </h2>
            <div className="space-y-2 max-w-md">
              {[
                { label: "Start with system", key: "autostart", defaultChecked: false },
                { label: "Minimize to tray", key: "tray", defaultChecked: true },
                { label: "Notifications", key: "notify", defaultChecked: true },
              ].map((opt) => (
                <label
                  key={opt.key}
                  className="flex items-center justify-between p-3 orbit-card cursor-pointer hover:border-orbit-border-light transition-colors"
                >
                  <span className="text-sm text-orbit-text-dim">{opt.label}</span>
                  <div className="relative">
                    <input
                      type="checkbox"
                      defaultChecked={opt.defaultChecked}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-orbit-border rounded-full peer-checked:bg-(--accent) transition-colors" />
                    <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-orbit-bg rounded-full transition-transform peer-checked:translate-x-4" />
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}
        </div>
      </main>
    </div>
  );
}
