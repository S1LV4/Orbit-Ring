import { useState } from "react";
import {
  Puzzle,
  Package,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Trash2,
  Info,
  Zap,
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

interface PluginManagerProps {
  plugins: PluginInfo[];
  onRemove?: (pluginId: string) => void;
  onToggle?: (pluginId: string, enabled: boolean) => void;
  onOpenFolder?: () => void;
}

function PluginCard({
  plugin,
  isExpanded,
  onToggleExpand,
  onRemove,
  onToggle,
}: {
  plugin: PluginInfo;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onRemove?: (id: string) => void;
  onToggle?: (id: string, enabled: boolean) => void;
}) {
  return (
    <div className="orbit-card overflow-hidden">
      {/* Header */}
      <button
        onClick={onToggleExpand}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-[#1A1A1E] transition-colors"
      >
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{
            background:
              "color-mix(in srgb, var(--accent) 15%, #17171B)",
          }}
        >
          <Puzzle
            className="w-4 h-4"
            style={{ color: "var(--accent)" }}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-[#FAFAFA] truncate">
              {plugin.name}
            </h3>
            <span className="text-[10px] font-mono text-[#71717A]">
              v{plugin.version}
            </span>
          </div>
          {plugin.description && (
            <p className="text-[11px] text-[#71717A] mt-0.5 truncate">
              {plugin.description}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span
            className="orbit-pill text-[10px]"
            style={
              plugin.loaded
                ? {
                    color: "var(--accent)",
                    borderColor:
                      "color-mix(in srgb, var(--accent) 30%, #2A2A30)",
                  }
                : { color: "#EF4444", borderColor: "#7F1D1D" }
            }
          >
            {plugin.loaded ? (
              <span className="flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> loaded
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <XCircle className="w-3 h-3" /> error
              </span>
            )}
          </span>
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-[#71717A]" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-[#71717A]" />
          )}
        </div>
      </button>

      {/* Expanded details */}
      {isExpanded && (
        <div className="border-t border-[#2A2A30] px-4 py-3 space-y-3">
          {/* Author */}
          {plugin.author && (
            <div className="text-[11px] text-[#71717A]">
              by{" "}
              <span className="text-[#efeee7]">{plugin.author}</span>
            </div>
          )}

          {/* Actions list */}
          {plugin.actions.length > 0 && (
            <div>
              <h4 className="text-[10px] font-mono uppercase tracking-widest text-[#71717A] mb-2 flex items-center gap-1.5">
                <Zap className="w-3 h-3" />
                Actions ({plugin.actions.length})
              </h4>
              <div className="space-y-1">
                {plugin.actions.map((action) => (
                  <div
                    key={action.id}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-[#1A1A1E] border border-[#2A2A30]"
                  >
                    <Zap className="w-3 h-3 text-[#555] flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <span className="text-[11px] text-[#efeee7]">
                        {action.name}
                      </span>
                      {action.description && (
                        <p className="text-[10px] text-[#555] truncate">
                          {action.description}
                        </p>
                      )}
                    </div>
                    <span className="text-[9px] font-mono text-[#33333B] flex-shrink-0">
                      {action.id}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="flex items-center justify-between pt-1">
            {/* Enable/disable toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={plugin.loaded}
                  onChange={() => onToggle?.(plugin.id, !plugin.loaded)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-[#2A2A30] rounded-full peer-checked:bg-[var(--accent)] transition-colors" />
                <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-[#0A0A0B] rounded-full transition-transform peer-checked:translate-x-4" />
              </div>
              <span className="text-[11px] text-[#71717A]">
                {plugin.loaded ? "Enabled" : "Disabled"}
              </span>
            </label>

            <button
              onClick={() => onRemove?.(plugin.id)}
              className="flex items-center gap-1 text-[11px] text-[#555] hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              Uninstall
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function PluginManager({
  plugins,
  onRemove,
  onToggle,
  onOpenFolder,
}: PluginManagerProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="p-6">
      {/* Header */}
      <h2 className="text-base font-semibold mb-5 flex items-center gap-2 text-[#FAFAFA]">
        <Puzzle className="w-4 h-4 text-[#71717A]" />
        Plugins
      </h2>

      {/* Installed plugins */}
      <div className="space-y-4 max-w-2xl">
        <div>
          <h3 className="text-[11px] font-semibold text-[#efeee7] uppercase tracking-wider mb-2 flex items-center gap-2">
            <Package className="w-3.5 h-3.5 text-[#71717A]" />
            Installed Plugins
          </h3>

          {plugins.length === 0 ? (
            <div className="text-center py-12 text-[#71717A]">
              <Puzzle className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">No plugins installed</p>
              <p className="text-[10px] font-mono mt-2 text-[#33333B]">
                install plugins by copying them to ~/.orbit/plugins/
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {plugins.map((plugin) => (
                <PluginCard
                  key={plugin.id}
                  plugin={plugin}
                  isExpanded={expandedId === plugin.id}
                  onToggleExpand={() =>
                    setExpandedId(
                      expandedId === plugin.id ? null : plugin.id
                    )
                  }
                  onRemove={onRemove}
                  onToggle={onToggle}
                />
              ))}
            </div>
          )}
        </div>

        {/* Install section */}
        <div className="orbit-card p-4 space-y-3">
          <h3 className="text-[11px] font-semibold text-[#efeee7] uppercase tracking-wider flex items-center gap-2">
            <FolderOpen className="w-3.5 h-3.5 text-[#71717A]" />
            Install Plugins
          </h3>

          <div className="space-y-2">
            <div className="flex items-start gap-2 text-[11px] text-[#71717A]">
              <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <div className="space-y-1">
                <p>Copy a plugin folder to:</p>
                <code className="block px-2.5 py-1.5 rounded-md bg-[#1A1A1E] border border-[#2A2A30] text-[#efeee7] font-mono text-[11px]">
                  ~/.orbit/plugins/
                </code>
                <p className="text-[#555]">
                  Each plugin must contain a{" "}
                  <span className="text-[#efeee7]">manifest.json</span>{" "}
                  with id, name, version, and actions.
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={onOpenFolder}
            className="orbit-btn flex items-center gap-2 text-xs border border-[#2A2A30] text-[#efeee7] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            Open Plugins Folder
          </button>
        </div>
      </div>
    </div>
  );
}
