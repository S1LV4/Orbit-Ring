import { useState } from "react";
import {
  Layers,
  Plus,
  Trash2,
  Globe,
  Code,
  Palette,
  Film,
  Gamepad2,
  FileText,
  ChevronRight,
} from "lucide-react";
import { t } from "../i18n";

interface ProfileListProps {
  config: any;
  onSave: (profile: any) => void;
  onDelete: (id: string) => void;
}

const APP_ICONS: Record<string, React.ReactNode> = {
  chrome: <Globe className="w-4 h-4 text-blue-400" />,
  firefox: <Globe className="w-4 h-4 text-orange-400" />,
  code: <Code className="w-4 h-4 text-blue-400" />,
  photoshop: <Palette className="w-4 h-4 text-cyan-400" />,
  premiere: <Film className="w-4 h-4 text-purple-400" />,
  blender: <Palette className="w-4 h-4 text-orange-400" />,
  default: <FileText className="w-4 h-4 text-orbit-text-muted" />,
};

function getAppIcon(processMatch: string): React.ReactNode {
  const lower = processMatch.toLowerCase();
  for (const [key, icon] of Object.entries(APP_ICONS)) {
    if (lower.includes(key)) return icon;
  }
  return APP_ICONS.default;
}

export function ProfileList({ config, onSave, onDelete }: ProfileListProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newProcess, setNewProcess] = useState("");

  const profiles = config?.appProfiles ?? [];

  const handleCreate = () => {
    if (!newName.trim() || !newProcess.trim()) return;
    onSave({
      id: crypto.randomUUID(),
      name: newName.trim(),
      processMatch: newProcess.trim(),
      bindings: [],
    });
    setNewName("");
    setNewProcess("");
    setShowCreate(false);
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-base font-semibold flex items-center gap-2 text-orbit-text">
          <Layers className="w-4 h-4 text-orbit-text-muted" />
          {t("profiles.title")}
        </h2>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="orbit-btn flex items-center gap-1.5 text-orbit-bg"
          style={{ background: "var(--accent)" }}
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="text-xs font-mono">{t("profiles.new")}</span>
        </button>
      </div>

      {showCreate && (
        <div className="mb-6 p-4 orbit-card" style={{ borderColor: "color-mix(in srgb, var(--accent) 40%, #2A2A30)" }}>
          <h3 className="text-xs font-medium mb-3 text-orbit-text-dim">{t("profiles.create")}</h3>
          <div className="space-y-2">
            <input
              type="text"
              placeholder={t("profiles.namePlaceholder")}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="orbit-input w-full font-mono text-xs"
            />
            <input
              type="text"
              placeholder={t("profiles.processPlaceholder")}
              value={newProcess}
              onChange={(e) => setNewProcess(e.target.value)}
              className="orbit-input w-full font-mono text-xs"
            />
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleCreate}
                className="orbit-btn text-xs text-orbit-bg"
                style={{ background: "var(--accent)" }}
              >
                {t("profiles.createButton")}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="orbit-btn text-xs border border-orbit-border text-orbit-text-muted hover:text-orbit-text-dim"
              >
                {t("profiles.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-3 p-4 orbit-card flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ background: "color-mix(in srgb, var(--accent) 15%, #17171B)" }}
        >
          <Layers className="w-4 h-4" style={{ color: "var(--accent)" }} />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-medium text-orbit-text">{t("profiles.default")}</h3>
          <p className="text-[10px] font-mono text-orbit-text-muted">
            {t("profiles.defaultHint")}
          </p>
        </div>
        <span className="orbit-pill text-[10px] font-mono text-orbit-text-muted">
          {t("profiles.actionCount", { count: config?.defaultProfile?.bindings?.length ?? 0 })}
        </span>
        <ChevronRight className="w-4 h-4 text-orbit-border-light" />
      </div>

      <div className="space-y-1.5">
        {profiles.map((profile: any) => (
          <div
            key={profile.id}
            className="p-4 orbit-card flex items-center gap-3"
          >
            <div className="w-9 h-9 bg-[#141417] rounded-lg flex items-center justify-center border border-orbit-border">
              {getAppIcon(profile.processMatch)}
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-orbit-text">{profile.name}</h3>
              <p className="text-[10px] font-mono text-orbit-text-muted">{profile.processMatch}</p>
            </div>
            <span className="orbit-pill text-[10px] font-mono text-orbit-text-muted">
              {t("profiles.actionCount", { count: profile.bindings.length })}
            </span>
            <button
              onClick={() => onDelete(profile.id)}
              className="p-1.5 text-orbit-border-light hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <ChevronRight className="w-4 h-4 text-orbit-border-light" />
          </div>
        ))}
      </div>

      {profiles.length === 0 && (
        <div className="text-center py-12 text-orbit-text-muted">
          <Gamepad2 className="w-10 h-10 mx-auto mb-3 opacity-15" />
          <p className="text-sm text-orbit-text-dim">{t("profiles.empty")}</p>
          <p className="text-[10px] font-mono mt-2 text-orbit-border-light">
            {t("profiles.emptyHint")}
          </p>
        </div>
      )}
    </div>
  );
}
