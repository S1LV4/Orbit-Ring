import { useState, useEffect } from "react";
import {
  Mouse,
  Settings,
  Layers,
  Zap,
  Keyboard,
  Monitor,
  Terminal,
  Volume2,
  Play,
  Camera,
  Globe,
  ChevronRight,
  Plus,
  Trash2,
  CircleDot,
  Wifi,
  WifiOff,
  Loader2,
} from "lucide-react";
import { useWebSocket } from "./hooks/useWebSocket";
import { DevicePanel } from "./components/DevicePanel";
import { BindingEditor } from "./components/BindingEditor";
import { ProfileList } from "./components/ProfileList";
import { RingEditor } from "./components/RingEditor";

type Tab = "devices" | "bindings" | "ring" | "profiles" | "settings";

export function App() {
  const { state, lastMessage, send } = useWebSocket();
  const [tab, setTab] = useState<Tab>("ring");
  const [devices, setDevices] = useState<any[]>([]);
  const [config, setConfig] = useState<any>(null);
  const [lastEvent, setLastEvent] = useState<any>(null);

  useEffect(() => {
    if (!lastMessage) return;
    switch (lastMessage.type) {
      case "devices":
        setDevices(lastMessage.devices);
        break;
      case "config_loaded":
        setConfig(lastMessage.config);
        break;
      case "button_event":
        setLastEvent(lastMessage);
        break;
    }
  }, [lastMessage]);

  const connectionIcon = {
    connected: <Wifi className="w-4 h-4 text-emerald-400" />,
    connecting: <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />,
    disconnected: <WifiOff className="w-4 h-4 text-red-400" />,
  }[state];

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "ring", label: "Actions Ring", icon: <CircleDot className="w-5 h-5" /> },
    { id: "bindings", label: "Botões", icon: <Mouse className="w-5 h-5" /> },
    { id: "devices", label: "Dispositivos", icon: <Zap className="w-5 h-5" /> },
    { id: "profiles", label: "Perfis", icon: <Layers className="w-5 h-5" /> },
    { id: "settings", label: "Config", icon: <Settings className="w-5 h-5" /> },
  ];

  return (
    <div className="flex h-screen bg-zinc-950">
      {/* Sidebar */}
      <aside className="w-56 bg-zinc-900 border-r border-zinc-800 flex flex-col">
        <div className="p-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center">
              <Mouse className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-zinc-100">M-Ring</h1>
              <p className="text-xs text-zinc-500">Any mouse, your rules</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                tab === t.id
                  ? "bg-violet-600/20 text-violet-300"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>

        {/* Connection status */}
        <div className="p-3 border-t border-zinc-800">
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            {connectionIcon}
            <span>
              {state === "connected"
                ? "Serviço conectado"
                : state === "connecting"
                ? "Conectando..."
                : "Serviço offline"}
            </span>
          </div>
          {devices.length > 0 && (
            <div className="mt-1 text-xs text-zinc-600">
              {devices.length} dispositivo{devices.length > 1 ? "s" : ""}
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {tab === "ring" && <RingEditor />}
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
        {tab === "settings" && (
          <div className="p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Settings className="w-5 h-5 text-zinc-400" />
              Configurações
            </h2>
            <div className="space-y-4 max-w-md">
              <label className="flex items-center justify-between p-3 bg-zinc-900 rounded-lg border border-zinc-800">
                <span className="text-sm">Iniciar com o sistema</span>
                <input type="checkbox" className="accent-violet-600" />
              </label>
              <label className="flex items-center justify-between p-3 bg-zinc-900 rounded-lg border border-zinc-800">
                <span className="text-sm">Minimizar na bandeja</span>
                <input type="checkbox" defaultChecked className="accent-violet-600" />
              </label>
              <label className="flex items-center justify-between p-3 bg-zinc-900 rounded-lg border border-zinc-800">
                <span className="text-sm">Notificações</span>
                <input type="checkbox" defaultChecked className="accent-violet-600" />
              </label>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
