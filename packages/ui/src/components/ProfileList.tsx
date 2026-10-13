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

interface ProfileListProps {
  config: any;
  onSave: (profile: any) => void;
  onDelete: (id: string) => void;
}

const APP_ICONS: Record<string, React.ReactNode> = {
  chrome: <Globe className="w-5 h-5 text-blue-400" />,
  firefox: <Globe className="w-5 h-5 text-orange-400" />,
  code: <Code className="w-5 h-5 text-blue-400" />,
  photoshop: <Palette className="w-5 h-5 text-cyan-400" />,
  premiere: <Film className="w-5 h-5 text-purple-400" />,
  blender: <Palette className="w-5 h-5 text-orange-400" />,
  default: <FileText className="w-5 h-5 text-zinc-400" />,
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
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Layers className="w-5 h-5 text-zinc-400" />
          Perfis por Aplicação
        </h2>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-3 py-1.5 bg-violet-600 text-white rounded-lg text-sm flex items-center gap-2 hover:bg-violet-500 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Novo Perfil
        </button>
      </div>

      {showCreate && (
        <div className="mb-6 p-4 bg-zinc-900 rounded-xl border border-violet-600/30">
          <h3 className="text-sm font-medium mb-3">Criar Perfil</h3>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Nome (ex: VS Code)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm focus:border-violet-600 focus:outline-none"
            />
            <input
              type="text"
              placeholder="Processo (ex: code.exe)"
              value={newProcess}
              onChange={(e) => setNewProcess(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm focus:border-violet-600 focus:outline-none"
            />
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm hover:bg-violet-500"
              >
                Criar
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg text-sm hover:bg-zinc-700"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Default profile */}
      <div className="mb-4 p-4 bg-zinc-900 rounded-xl border border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-violet-600/20 rounded-lg flex items-center justify-center">
            <Layers className="w-5 h-5 text-violet-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-medium">Perfil Padrão</h3>
            <p className="text-xs text-zinc-500">
              Usado quando nenhum perfil de app corresponde
            </p>
          </div>
          <div className="text-xs text-zinc-500">
            {config?.defaultProfile?.bindings?.length ?? 0} ações
          </div>
          <ChevronRight className="w-4 h-4 text-zinc-600" />
        </div>
      </div>

      {/* App profiles */}
      <div className="space-y-2">
        {profiles.map((profile: any) => (
          <div
            key={profile.id}
            className="p-4 bg-zinc-900 rounded-xl border border-zinc-800 flex items-center gap-3"
          >
            <div className="w-10 h-10 bg-zinc-800 rounded-lg flex items-center justify-center">
              {getAppIcon(profile.processMatch)}
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium">{profile.name}</h3>
              <p className="text-xs text-zinc-500">{profile.processMatch}</p>
            </div>
            <div className="text-xs text-zinc-500">
              {profile.bindings.length} ações
            </div>
            <button
              onClick={() => onDelete(profile.id)}
              className="p-1.5 text-zinc-600 hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <ChevronRight className="w-4 h-4 text-zinc-600" />
          </div>
        ))}
      </div>

      {profiles.length === 0 && (
        <div className="text-center py-12 text-zinc-500">
          <Gamepad2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhum perfil de aplicação criado</p>
          <p className="text-xs mt-1">
            Crie perfis para ter ações diferentes por app
          </p>
        </div>
      )}
    </div>
  );
}
