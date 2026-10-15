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
  Terminal,
  Globe,
  FolderSearch,
  KeyRound,
  AlertTriangle,
} from "lucide-react";
import { PLUGIN_API_VERSION, type PluginPermission, type PluginProblem } from "@orbitring/shared/src/plugin-types";
import { t } from "../i18n";

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
  status?: { text: string; tone: "ok" | "warn" | "error" | "neutral"; action?: { id: string; label: string } };
  problem?: PluginProblem;
  permissions?: PluginPermission[] | null;
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
  orbitApi?: string;
  compatible?: boolean;
  permissions?: PluginPermission[] | null;
}

interface PluginManagerProps {
  plugins: PluginInfo[];
  catalog?: CatalogPlugin[];
  onInstall?: (pluginId: string) => void;
  onRemove?: (pluginId: string) => void;
  onToggle?: (pluginId: string, enabled: boolean) => void;
  onOpenFolder?: () => void;
  onRunAction?: (pluginId: string, actionId: string) => void;
}

const TONE_COLOR = { ok: "var(--accent)", warn: "#FBBF24", error: "#F87171", neutral: "#8B8B95" } as const;

type View = "catalog" | "installed";

const GRID = "grid gap-2 grid-cols-1 md:grid-cols-2 xl:grid-cols-3";
const actionsLabel = (n: number) => t("plugins.actionCount", { count: n });

function CardBody({ name, version, description, author }: { name: string; version: string; description?: string; author?: string }) {
  return (
    <>
      <div className="flex items-baseline gap-1.5 min-w-0">
        <h3 className="text-[13px] font-medium text-orbit-text truncate">{name}</h3>
        <span className="text-[10px] font-mono text-orbit-text-muted shrink-0">v{version}</span>
      </div>
      <p className="text-[11px] leading-snug text-orbit-text-muted mt-1 line-clamp-2 min-h-[30px]" title={description || undefined}>
        {description || "—"}
      </p>
      <div className="mt-2 min-h-[18px]">
        <AuthorCredit author={author} />
      </div>
    </>
  );
}

const PERMISSION_ICON: Record<PluginPermission, typeof Terminal> = {
  commands: Terminal,
  network: Globe,
  appData: FolderSearch,
  credentials: KeyRound,
};

function Permissions({ permissions }: { permissions?: PluginPermission[] | null }) {
  const base = "flex flex-wrap items-center gap-1 mt-2 text-[10px]";
  if (!permissions) {
    return (
      <p data-testid="plugin-permissions" data-undeclared="true" className={base} style={{ color: TONE_COLOR.warn }}>
        <AlertTriangle className="w-3 h-3" />
        {t("plugins.permissions.undeclared")}
      </p>
    );
  }
  if (permissions.length === 0) {
    return <p data-testid="plugin-permissions" className={`${base} text-orbit-text-muted`}>{t("plugins.permissions.none")}</p>;
  }
  return (
    <p data-testid="plugin-permissions" className={`${base} text-orbit-text-muted`}>
      <span className="mr-0.5">{t("plugins.permissions.title")}</span>
      {permissions.map((p) => {
        const Icon = PERMISSION_ICON[p];
        return (
          <span key={p} className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#1A1A1E] border border-orbit-border text-orbit-text-dim">
            <Icon className="w-2.5 h-2.5 shrink-0" />
            <span data-permission={p}>{t.dyn(`plugins.permissions.${p}`)}</span>
          </span>
        );
      })}
    </p>
  );
}

const problemText = (problem: PluginProblem) =>
  problem.kind === "incompatible"
    ? t("plugins.problem.incompatible", { requires: problem.requires, provides: problem.provides })
    : problem.kind === "unresponsive"
      ? t("plugins.problem.unresponsive")
      : t("plugins.problem.failed");

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
      <Permissions permissions={plugin.permissions ?? null} />
      <div className="flex-1 min-h-2.5" />
      <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-orbit-border">
        <span className="text-[10px] font-mono text-[#555]">{actionsLabel(plugin.actionCount)}</span>
        {plugin.compatible === false && !(installed && !plugin.updateAvailable) ? (
          <span
            data-testid="plugin-incompatible"
            title={problemText({ kind: "incompatible", requires: plugin.orbitApi ?? "", provides: PLUGIN_API_VERSION })}
            className="flex items-center gap-1 text-[10px] font-mono"
            style={{ color: TONE_COLOR.warn }}
          >
            {t("plugins.incompatible")}
          </span>
        ) : installed && !plugin.updateAvailable ? (
          <span className="flex items-center gap-1 text-[10px] font-mono" style={{ color: "var(--accent)" }}>
            <CheckCircle className="w-3 h-3" /> {t("plugins.installedBadge")}
          </span>
        ) : (
          <button
            onClick={start}
            disabled={busy}
            title={plugin.updateAvailable ? t("plugins.installedVersion", { version: plugin.installedVersion ?? "" }) : undefined}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border border-orbit-border text-orbit-text-dim hover:border-(--accent) hover:text-(--accent) transition-colors disabled:opacity-50"
          >
            {plugin.updateAvailable ? <RefreshCw className="w-3 h-3" /> : <Download className="w-3 h-3" />}
            {busy ? t("plugins.working") : plugin.updateAvailable ? t("plugins.update") : t("plugins.install")}
          </button>
        )}
      </div>
    </div>
  );
}

function InstalledCard({
  plugin, selected, onSelect, update, onInstall, onRunAction,
}: {
  plugin: PluginInfo;
  selected: boolean;
  onSelect: () => void;
  update?: CatalogPlugin;
  onInstall?: (id: string) => void;
  onRunAction?: (pluginId: string, actionId: string) => void;
}) {
  const status = plugin.status;
  const problem = plugin.problem;
  return (
    <div
      className="orbit-card p-3 flex flex-col min-w-0 transition-colors"
      style={selected ? { borderColor: "color-mix(in srgb, var(--accent) 55%, #2A2A30)" } : undefined}
      data-testid="installed-plugin"
      data-plugin-id={plugin.id}
    >
      <CardBody name={plugin.name} version={plugin.version} description={plugin.description} author={plugin.author} />
      {(status || update || problem) && (
        <div className="flex flex-wrap items-center gap-2 mt-2">
          {problem && (
            <span data-testid="plugin-problem" className="text-[11px]" style={{ color: TONE_COLOR.error }}>
              {problemText(problem)}
            </span>
          )}
          {status && (
            <span
              data-testid="plugin-status"
              data-tone={status.tone}
              className="flex min-w-0 items-center gap-1.5 text-[11px]"
              style={{ color: TONE_COLOR[status.tone] ?? TONE_COLOR.neutral }}
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "currentColor" }} />
              <span className="truncate">{status.text}</span>
            </span>
          )}
          {status?.action && (
            <button
              onClick={() => onRunAction?.(plugin.id, status.action!.id)}
              className="px-2 py-0.5 rounded-md text-[11px] font-medium border border-orbit-border text-orbit-text-dim hover:border-(--accent) hover:text-(--accent) transition-colors"
            >
              {status.action.label}
            </button>
          )}
          {update && (
            <button
              onClick={() => onInstall?.(plugin.id)}
              className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium text-orbit-bg"
              style={{ background: "var(--accent)" }}
            >
              <RefreshCw className="w-3 h-3" />
              {t("plugins.updateTo", { version: update.version })}
            </button>
          )}
        </div>
      )}
      <div className="flex items-center justify-between gap-2 mt-2.5 pt-2.5 border-t border-orbit-border">
        <span
          className="flex items-center gap-1 text-[10px] font-mono"
          style={{ color: plugin.loaded ? "var(--accent)" : "#EF4444" }}
        >
          {plugin.loaded ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
          {plugin.loaded ? t("plugins.loaded") : t("plugins.error")}
        </span>
        <button
          onClick={onSelect}
          aria-expanded={selected}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border border-orbit-border text-orbit-text-dim hover:border-(--accent) hover:text-(--accent) transition-colors"
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
        <h4 className="text-[12px] font-medium text-orbit-text truncate">{plugin.name}</h4>
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
            <div className="w-8 h-[18px] bg-orbit-border rounded-full peer-checked:bg-(--accent) transition-colors" />
            <div className="absolute top-0.5 left-0.5 w-3.5 h-3.5 bg-orbit-bg rounded-full transition-transform peer-checked:translate-x-3.5" />
          </div>
          <span className="text-[11px] text-orbit-text-muted">{plugin.loaded ? t("plugins.enabled") : t("plugins.disabled")}</span>
        </label>
        {confirmRemove ? (
          <span className="flex items-center gap-2 text-[11px]">
            <span className="text-orbit-text-muted">{t("plugins.confirmDelete")}</span>
            <button
              onClick={() => { setConfirmRemove(false); onRemove?.(plugin.id); }}
              className="text-red-400 hover:text-red-300 transition-colors"
            >
              {t("plugins.uninstall")}
            </button>
            <button onClick={() => setConfirmRemove(false)} className="text-orbit-text-muted hover:text-orbit-text transition-colors">
              {t("plugins.cancel")}
            </button>
          </span>
        ) : (
          <button
            onClick={() => setConfirmRemove(true)}
            className="flex items-center gap-1 text-[11px] text-orbit-text-muted hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            {t("plugins.uninstall")}
          </button>
        )}
        <button onClick={onClose} aria-label={t("plugins.closeDetails")} className="text-orbit-text-muted hover:text-orbit-text transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <Permissions permissions={plugin.permissions ?? null} />

      {plugin.actions.length > 0 && (
        <div className="grid gap-1 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 mt-2.5">
          {plugin.actions.map((action) => (
            <div
              key={action.id}
              className="flex items-center gap-2 px-2 py-1 rounded-md bg-[#1A1A1E] border border-orbit-border min-w-0"
              title={action.description || action.id}
            >
              <Zap className="w-3 h-3 text-[#555] shrink-0" />
              <span className="text-[11px] text-orbit-text-dim truncate flex-1">{action.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Empty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="text-center py-10 text-orbit-text-muted">
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
  onRunAction,
}: PluginManagerProps) {
  const [view, setView] = useState<View>("catalog");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = plugins.find((p) => p.id === selectedId) ?? null;

  const views: { id: View; label: string; count: number }[] = [
    { id: "catalog", label: t("plugins.tabs.catalog"), count: catalog.length },
    { id: "installed", label: t("plugins.tabs.installed"), count: plugins.length },
  ];

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-base font-semibold flex items-center gap-2 text-orbit-text">
          <Puzzle className="w-4 h-4 text-orbit-text-muted" />
          {t("plugins.title")}
        </h2>
        <div role="tablist" className="flex items-center gap-0.5 p-0.5 rounded-lg bg-[#141417] border border-orbit-border">
          {views.map((v) => (
            <button
              key={v.id}
              role="tab"
              aria-selected={view === v.id}
              onClick={() => setView(v.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                view === v.id ? "bg-orbit-border text-orbit-text" : "text-orbit-text-muted hover:text-orbit-text"
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
          title={t("plugins.folderTip")}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium border border-orbit-border text-orbit-text-muted hover:border-(--accent) hover:text-(--accent) transition-colors"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          {t("plugins.folder")}
        </button>
      </div>

      {view === "catalog" ? (
        catalog.length === 0 ? (
          <Empty title={t("plugins.emptyCatalog")} hint={t("plugins.emptyCatalogHint")} />
        ) : (
          <div className={GRID}>
            {catalog.map((p) => (
              <CatalogCard key={p.id} plugin={p} onInstall={onInstall} />
            ))}
          </div>
        )
      ) : plugins.length === 0 ? (
        <Empty title={t("plugins.emptyInstalled")} hint={t("plugins.emptyInstalledHint")} />
      ) : (
        <>
          <div className={GRID}>
            {plugins.map((p) => (
              <InstalledCard
                key={p.id}
                plugin={p}
                selected={selectedId === p.id}
                onSelect={() => setSelectedId(selectedId === p.id ? null : p.id)}
                update={catalog.find((c) => c.id === p.id && c.updateAvailable)}
                onInstall={onInstall}
                onRunAction={onRunAction}
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
        {t("plugins.authorHintStart")} <span className="text-orbit-text-muted">manifest.json</span> {t("plugins.authorHintFields")}{" "}
        <span className="text-orbit-text-muted">"author": "@your-github"</span> {t("plugins.authorHintEnd")}
      </p>
    </div>
  );
}
