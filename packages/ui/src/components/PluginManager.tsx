import { useState } from "react";
import { AuthorCredit } from "./AuthorCredit";
import {
  Puzzle,
  CheckCircle,
  XCircle,
  FolderOpen,
  Trash2,
  Zap,
  Download,
  RefreshCw,
  X,
} from "lucide-react";

interface PluginAction {
  id: string;
  name: string;
  icon?: string;
  description?: string;
}

export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  author?: string;
  description?: string;
  actions: PluginAction[];
  loaded: boolean;
}

export interface CatalogPlugin {
  id: string;
  name: string;
  version: string;
  author?: string;
  description?: string;
  actionCount: number;
  installedVersion: string | null;
  updateAvailable: boolean;
}

interface PluginManagerProps {
  plugins: PluginInfo[];
  catalog?: CatalogPlugin[];
  onInstall?: (pluginId: string) => void;
  onRemove?: (pluginId: string) => void;
  onToggle?: (pluginId: string, enabled: boolean) => void;
  onOpenFolder?: () => void;
}

type View = "catalog" | "installed";

const GRID = "grid gap-2 grid-cols-1 md:grid-cols-2 xl:grid-cols-3";
const actionsLabel = (n: number) => `${n} action${n === 1 ? "" : "s"}`;

function CardBody({ name, version, description, author }: { name: string; version: string; description?: string; author?: string }) {
  return (
    <>
      <div className="flex items-baseline gap-1.5 min-w-0">
        <h3 className="text-[13px] font-medium text-[#FAFAFA] truncate">{name}</h3>
        <span className="text-[10px] font-mono text-[#71717A] flex-shrink-0">v{version}</span>
      </div>
      <p className="text-[11px] leading-snug text-[#71717A] mt-1 line-clamp-2 min-h-[30px]" title={description || undefined}>
        {description || "—"}
      </p>
      <div className="mt-2 min-h-[18px]">
        <AuthorCredit author={author} />
      </div>
    </>
  );
}

function CatalogCard({ plugin, onInstall }: { plugin: CatalogPlugin; onInstall?: (id: string) => void }) {
  const [busyFor, setBusyFor] = useState<string | null | undefined>(undefined);
  const busy = busyFor !== undefined && busyFor === plugin.installedVersion;
  const installed = plugin.installedVersion !== null;
  const start = () => {
    setBusyFor(plugin.installedVersion);
    onInstall?.(plugin.id);
    setTimeout(() => setBusyFor(undefined), 8000);
  };
  return (
    <div className="orbit-card p-3 flex flex-col min-w-0" data-testid="catalog-plugin" data-plugin-id={plugin.id}>
      <CardBody name={plugin.name} version={plugin.version} description={plugin.description} author={plugin.author} />
      <div className="flex items-center justify-between gap-2 mt-2.5 pt-2.5 border-t border-[#2A2A30]">
        <span className="text-[10px] font-mono text-[#555]">{actionsLabel(plugin.actionCount)}</span>
        {installed && !plugin.updateAvailable ? (
          <span className="flex items-center gap-1 text-[10px] font-mono" style={{ color: "var(--accent)" }}>
            <CheckCircle className="w-3 h-3" /> installed
          </span>
        ) : (
          <button
            onClick={start}
            disabled={busy}
            title={plugin.updateAvailable ? `Installed: v${plugin.installedVersion}` : undefined}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border border-[#2A2A30] text-[#efeee7] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors disabled:opacity-50"
          >
            {plugin.updateAvailable ? <RefreshCw className="w-3 h-3" /> : <Download className="w-3 h-3" />}
            {busy ? "Working…" : plugin.updateAvailable ? "Update" : "Install"}
          </button>
        )}
      </div>
    </div>
  );
}

function InstalledCard({ plugin, selected, onSelect }: { plugin: PluginInfo; selected: boolean; onSelect: () => void }) {
  return (
    <div
      className="orbit-card p-3 flex flex-col min-w-0 transition-colors"
      style={selected ? { borderColor: "color-mix(in srgb, var(--accent) 55%, #2A2A30)" } : undefined}
      data-testid="installed-plugin"
      data-plugin-id={plugin.id}
    >
      <CardBody name={plugin.name} version={plugin.version} description={plugin.description} author={plugin.author} />
      <div className="flex items-center justify-between gap-2 mt-2.5 pt-2.5 border-t border-[#2A2A30]">
        <span
          className="flex items-center gap-1 text-[10px] font-mono"
          style={{ color: plugin.loaded ? "var(--accent)" : "#EF4444" }}
        >
          {plugin.loaded ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
          {plugin.loaded ? "loaded" : "error"}
        </span>
        <button
          onClick={onSelect}
          aria-expanded={selected}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border border-[#2A2A30] text-[#efeee7] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
        >
          <Zap className="w-3 h-3" />
          {actionsLabel(plugin.actions.length)}
        </button>
      </div>
    </div>
  );
}

function PluginDetails({
  plugin,
  onClose,
  onRemove,
  onToggle,
}: {
  plugin: PluginInfo;
  onClose: () => void;
  onRemove?: (id: string) => void;
  onToggle?: (id: string, enabled: boolean) => void;
}) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  return (
    <div className="orbit-card mt-2 p-3" data-testid="plugin-details">
      <div className="flex items-center gap-2">
        <h4 className="text-[12px] font-medium text-[#FAFAFA] truncate">{plugin.name}</h4>
        <span className="text-[10px] font-mono text-[#555]">{plugin.id}</span>
        <div className="flex-1" />
        <label className="flex items-center gap-2 cursor-pointer">
          <div className="relative">
            <input
              type="checkbox"
              checked={plugin.loaded}
              onChange={() => onToggle?.(plugin.id, !plugin.loaded)}
              className="sr-only peer"
            />
            <div className="w-8 h-[18px] bg-[#2A2A30] rounded-full peer-checked:bg-[var(--accent)] transition-colors" />
            <div className="absolute top-0.5 left-0.5 w-3.5 h-3.5 bg-[#0A0A0B] rounded-full transition-transform peer-checked:translate-x-3.5" />
          </div>
          <span className="text-[11px] text-[#71717A]">{plugin.loaded ? "Enabled" : "Disabled"}</span>
        </label>
        {confirmRemove ? (
          <span className="flex items-center gap-2 text-[11px]">
            <span className="text-[#71717A]">Delete this plugin's folder?</span>
            <button
              onClick={() => { setConfirmRemove(false); onRemove?.(plugin.id); }}
              className="text-red-400 hover:text-red-300 transition-colors"
            >
              Uninstall
            </button>
            <button onClick={() => setConfirmRemove(false)} className="text-[#71717A] hover:text-[#FAFAFA] transition-colors">
              Cancel
            </button>
          </span>
        ) : (
          <button
            onClick={() => setConfirmRemove(true)}
            className="flex items-center gap-1 text-[11px] text-[#71717A] hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            Uninstall
          </button>
        )}
        <button onClick={onClose} aria-label="Close details" className="text-[#71717A] hover:text-[#FAFAFA] transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {plugin.actions.length > 0 && (
        <div className="grid gap-1 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 mt-2.5">
          {plugin.actions.map((action) => (
            <div
              key={action.id}
              className="flex items-center gap-2 px-2 py-1 rounded-md bg-[#1A1A1E] border border-[#2A2A30] min-w-0"
              title={action.description || action.id}
            >
              <Zap className="w-3 h-3 text-[#555] flex-shrink-0" />
              <span className="text-[11px] text-[#efeee7] truncate flex-1">{action.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Empty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="text-center py-10 text-[#71717A]">
      <Puzzle className="w-10 h-10 mx-auto mb-3 opacity-20" />
      <p className="text-sm font-medium">{title}</p>
      <p className="text-[10px] font-mono mt-2 text-[#555]">{hint}</p>
    </div>
  );
}

export function PluginManager({
  plugins,
  catalog = [],
  onInstall,
  onRemove,
  onToggle,
  onOpenFolder,
}: PluginManagerProps) {
  const [view, setView] = useState<View>("catalog");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = plugins.find((p) => p.id === selectedId) ?? null;

  const views: { id: View; label: string; count: number }[] = [
    { id: "catalog", label: "Catalog", count: catalog.length },
    { id: "installed", label: "Installed", count: plugins.length },
  ];

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-base font-semibold flex items-center gap-2 text-[#FAFAFA]">
          <Puzzle className="w-4 h-4 text-[#71717A]" />
          Plugins
        </h2>
        <div role="tablist" className="flex items-center gap-0.5 p-0.5 rounded-lg bg-[#141417] border border-[#2A2A30]">
          {views.map((v) => (
            <button
              key={v.id}
              role="tab"
              aria-selected={view === v.id}
              onClick={() => setView(v.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                view === v.id ? "bg-[#2A2A30] text-[#FAFAFA]" : "text-[#71717A] hover:text-[#FAFAFA]"
              }`}
            >
              {v.label}
              <span
                className="font-mono text-[10px]"
                style={view === v.id ? { color: "var(--accent)" } : undefined}
                data-testid={`count-${v.id}`}
              >
                {v.count}
              </span>
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button
          onClick={onOpenFolder}
          title="~/.orbit/plugins/ — copy a plugin folder here to install it by hand"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium border border-[#2A2A30] text-[#71717A] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          Plugins folder
        </button>
      </div>

      {view === "catalog" ? (
        catalog.length === 0 ? (
          <Empty title="The catalog is empty" hint="copy a plugin folder to ~/.orbit/plugins/ to install it by hand" />
        ) : (
          <div className={GRID}>
            {catalog.map((p) => (
              <CatalogCard key={p.id} plugin={p} onInstall={onInstall} />
            ))}
          </div>
        )
      ) : plugins.length === 0 ? (
        <Empty title="No plugins installed" hint="pick one from the catalog, or copy a plugin folder to ~/.orbit/plugins/" />
      ) : (
        <>
          <div className={GRID}>
            {plugins.map((p) => (
              <InstalledCard
                key={p.id}
                plugin={p}
                selected={selectedId === p.id}
                onSelect={() => setSelectedId(selectedId === p.id ? null : p.id)}
              />
            ))}
          </div>
          {selected && (
            <PluginDetails
              key={selected.id}
              plugin={selected}
              onClose={() => setSelectedId(null)}
              onRemove={onRemove}
              onToggle={onToggle}
            />
          )}
        </>
      )}

      <p className="mt-4 text-[10px] font-mono text-[#555]">
        writing a plugin? a folder with a <span className="text-[#71717A]">manifest.json</span> (id, name, version, author, actions) ·{" "}
        <span className="text-[#71717A]">"author": "@your-github"</span> shows your profile link and picture
      </p>
    </div>
  );
}
