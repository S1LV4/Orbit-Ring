import { useState, useEffect } from "react";
import { AuthorCredit } from "./components/AuthorCredit";
import { t } from "./i18n";
import { DEFAULT_GROUPS } from "@orbitring/shared/src/ring-catalog";
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
    groups: DEFAULT_GROUPS.map((g) => ({ ...g, actions: [...g.actions], name: t.dyn(`catalog.defaultGroups.${g.id}`) })),
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
    { id: "ring", label: t("app.nav.ring"), icon: <CircleDot className="w-4 h-4" /> },
    { id: "bindings", label: t("app.nav.bindings"), icon: <Mouse className="w-4 h-4" /> },
    { id: "devices", label: t("app.nav.devices"), icon: <Zap className="w-4 h-4" /> },
    { id: "profiles", label: t("app.nav.profiles"), icon: <Layers className="w-4 h-4" /> },
    { id: "plugins", label: t("app.nav.plugins"), icon: <Puzzle className="w-4 h-4" /> },
    { id: "settings", label: t("app.nav.settings"), icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <div className="flex h-screen bg-orbit-bg">
      <div className="fixed top-0 left-0 right-0 h-9 z-50" style={{ WebkitAppRegion: "drag" } as any} />

      <aside className="w-48 bg-[#141417] border-r border-orbit-border flex flex-col">
        <div className="px-4 py-5 border-b border-orbit-border" style={{ WebkitAppRegion: "drag" } as any}>
          <div className="flex items-center gap-2.5" data-testid="brand">
            <img src="./orbitring-icon.webp" alt="" className="w-8 h-8 shrink-0" draggable={false} />
            <div>
              <h1 className="text-sm text-orbit-text tracking-tight leading-none"><span className="font-bold">orbit</span><span className="font-light">Ring</span></h1>
              <p className="text-[10px] font-mono text-orbit-text-muted tracking-wide mt-0.5">v1.0.0</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-2 py-3 space-y-0.5" style={{ WebkitAppRegion: "no-drag" } as any}>
          {tabs.map((tb) => (
            <button
              key={tb.id}
              onClick={() => setTab(tb.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150 ${
                tab === tb.id
                  ? "text-orbit-bg"
                  : "text-orbit-text-muted hover:text-orbit-text hover:bg-orbit-card"
              }`}
              style={tab === tb.id ? { background: accent, color: "#0A0A0B" } : undefined}
            >
              {tb.icon}
              {tb.label}
            </button>
          ))}
        </nav>

        <div className="px-3 py-3 border-t border-orbit-border">
          <div className="flex items-center gap-2 text-[10px] font-mono text-orbit-text-muted">
            {connectionIcon}
            <span>
              {state === "connected"
                ? t("app.status.connected")
                : state === "connecting"
                ? t("app.status.connecting")
                : t("app.status.offline")}
            </span>
          </div>
          {devices.length > 0 && (
            <div className="mt-1 text-[10px] font-mono text-orbit-border-light">
              {t("app.deviceCount", { count: devices.length })}
            </div>
          )}
        </div>

        <div className="px-3 py-3 border-t border-orbit-border" style={{ WebkitAppRegion: "no-drag" } as any}>
          <AuthorCredit author="@S1LV4" prefix={t("app.credit.developedBy")} size={18} />
          <a
            href="https://github.com/S1LV4/Orbit-Ring"
            target="_blank"
            rel="noreferrer noopener"
            className="mt-1.5 block text-[10px] font-mono text-orbit-text-muted hover:text-(--accent) transition-colors"
          >
            {t("app.credit.openSource")}
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
              {t("app.settings.title")}
            </h2>
            <div className="space-y-2 max-w-md">
              {[
                { label: t("app.settings.autostart"), key: "autostart", defaultChecked: false },
                { label: t("app.settings.tray"), key: "tray", defaultChecked: true },
                { label: t("app.settings.notify"), key: "notify", defaultChecked: true },
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
