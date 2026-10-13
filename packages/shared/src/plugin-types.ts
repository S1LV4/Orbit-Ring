export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  main: string;
  actions: PluginActionDef[];
}

export interface PluginActionDef {
  id: string;
  name: string;
  icon?: string;
  iconActive?: string;
  keepIcon?: boolean;
  image?: string;
  stateful?: boolean;
  description?: string;
}

export type PluginGetActions = () => PluginActionDef[];

export interface PluginAction extends PluginActionDef {
  pluginId: string;
}

export interface PluginCatalogEntry {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  actionCount: number;
  installedVersion: string | null;
  updateAvailable: boolean;
}

export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  actions: PluginAction[];
  loaded: boolean;
}

export type PluginStateStatus = "green" | "amber" | "red";

export interface PluginActionStateObject {
  active?: boolean;
  value?: number;
  text?: string;
  label?: string;
  status?: PluginStateStatus;
}

export type PluginActionState = boolean | PluginActionStateObject;

export type PluginStates = Record<string, Record<string, PluginActionState>>;

export interface AttentionItem {
  id: string;
  title: string;
  text?: string;
  pluginId?: string;
  actionIds?: string[];
  timeoutMs?: number;
}

export interface ThumbnailOptions {
  size?: number;
}

export interface PluginHost {
  stateChanged(): void;
  actionsChanged?(): void;
  attention?(item: AttentionItem | null): void;
  clearAttention?(id: string): void;
  getClaudeUsage?(): Promise<unknown>;
  makeThumbnail?(input: string | Uint8Array, opts?: ThumbnailOptions): Promise<string | null>;
}
