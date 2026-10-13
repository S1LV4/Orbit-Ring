/** Plugin manifest — loaded from manifest.json in each plugin folder */
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  main: string;
  actions: PluginActionDef[];
}

/** Action definition inside a plugin manifest */
export interface PluginActionDef {
  id: string;
  name: string;
  icon?: string;
  description?: string;
}

/** A plugin action as exposed to the UI (includes pluginId) */
export interface PluginAction {
  id: string;
  name: string;
  icon?: string;
  description?: string;
  pluginId: string;
}

/** Summary of an installed plugin sent to the UI */
export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  actions: PluginAction[];
  loaded: boolean;
}
