import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { PluginManifest, PluginAction, PluginInfo } from "@m-ring/shared";

/** Plugin module interface — what a plugin's main file must export */
interface PluginModule {
  onLoad?(): void | Promise<void>;
  onUnload?(): void | Promise<void>;
  onAction?(actionId: string, context?: Record<string, unknown>): unknown | Promise<unknown>;
  getState?(): Record<string, unknown>;
}

interface LoadedPlugin {
  manifest: PluginManifest;
  module: PluginModule;
  dir: string;
}

const PLUGINS_DIR = path.join(os.homedir(), ".orbit", "plugins");

/**
 * Scans ~/.orbit/plugins/ for plugin folders, loads them via require(),
 * and exposes their actions to the rest of the service.
 */
export class PluginLoader {
  private plugins = new Map<string, LoadedPlugin>();

  /** Scan the plugins directory and load all valid plugins */
  async loadAll(): Promise<void> {
    // Ensure the plugins directory exists
    try {
      fs.mkdirSync(PLUGINS_DIR, { recursive: true });
    } catch (e) {
      console.error("[orbit] Failed to create plugins directory:", e);
      return;
    }

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(PLUGINS_DIR, { withFileTypes: true });
    } catch (e) {
      console.error("[orbit] Failed to read plugins directory:", e);
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const pluginDir = path.join(PLUGINS_DIR, entry.name);
      try {
        await this.loadPlugin(pluginDir);
      } catch (e) {
        console.error(`[orbit] Failed to load plugin from ${entry.name}:`, e);
      }
    }
  }

  private async loadPlugin(dir: string): Promise<void> {
    const manifestPath = path.join(dir, "manifest.json");

    if (!fs.existsSync(manifestPath)) {
      console.warn(`[orbit] No manifest.json in ${path.basename(dir)}, skipping`);
      return;
    }

    let manifest: PluginManifest;
    try {
      const raw = fs.readFileSync(manifestPath, "utf8");
      manifest = JSON.parse(raw);
    } catch (e) {
      console.error(`[orbit] Invalid manifest.json in ${path.basename(dir)}:`, e);
      return;
    }

    // Validate required fields
    if (!manifest.id || !manifest.name || !manifest.main) {
      console.error(`[orbit] Plugin manifest in ${path.basename(dir)} missing required fields (id, name, main)`);
      return;
    }

    if (this.plugins.has(manifest.id)) {
      console.warn(`[orbit] Duplicate plugin id "${manifest.id}", skipping ${path.basename(dir)}`);
      return;
    }

    const mainPath = path.join(dir, manifest.main);
    if (!fs.existsSync(mainPath)) {
      console.error(`[orbit] Plugin "${manifest.name}": main file not found: ${manifest.main}`);
      return;
    }

    let mod: PluginModule;
    try {
      // Clear require cache so plugins can be reloaded
      delete require.cache[require.resolve(mainPath)];
      mod = require(mainPath);
    } catch (e) {
      console.error(`[orbit] Plugin "${manifest.name}": failed to require main file:`, e);
      return;
    }

    // Call onLoad if provided
    try {
      if (typeof mod.onLoad === "function") {
        await mod.onLoad();
      }
    } catch (e) {
      console.error(`[orbit] Plugin "${manifest.name}": onLoad() error:`, e);
      return;
    }

    this.plugins.set(manifest.id, { manifest, module: mod, dir });
    const actionCount = manifest.actions?.length ?? 0;
    console.log(`[orbit] Loaded plugin: ${manifest.name} (${actionCount} actions)`);
  }

  /** Returns all actions registered by all loaded plugins */
  getPluginActions(): PluginAction[] {
    const actions: PluginAction[] = [];
    for (const [pluginId, plugin] of this.plugins) {
      if (!plugin.manifest.actions) continue;
      for (const action of plugin.manifest.actions) {
        actions.push({
          id: action.id,
          name: action.name,
          icon: action.icon,
          description: action.description,
          pluginId,
        });
      }
    }
    return actions;
  }

  /** Returns info about all loaded plugins (for the UI) */
  getPlugins(): PluginInfo[] {
    const result: PluginInfo[] = [];
    for (const [pluginId, plugin] of this.plugins) {
      const actions: PluginAction[] = (plugin.manifest.actions || []).map((a) => ({
        id: a.id,
        name: a.name,
        icon: a.icon,
        iconActive: (a as any).iconActive,
        description: a.description,
        pluginId,
      }));
      result.push({
        id: plugin.manifest.id,
        name: plugin.manifest.name,
        version: plugin.manifest.version,
        author: plugin.manifest.author,
        description: plugin.manifest.description,
        actions,
        loaded: true,
      });
    }
    return result;
  }

  /** Execute a plugin action by pluginId and actionId */
  async executePluginAction(pluginId: string, actionId: string): Promise<unknown> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      console.warn(`[orbit] Plugin "${pluginId}" not found`);
      return;
    }
    if (typeof plugin.module.onAction !== "function") {
      console.warn(`[orbit] Plugin "${pluginId}" has no onAction handler`);
      return;
    }
    try {
      return await plugin.module.onAction(actionId);
    } catch (e) {
      console.error(`[orbit] Plugin "${pluginId}" action "${actionId}" error:`, e);
    }
  }

  /** Get state from all plugins that support it */
  getPluginStates(): Record<string, Record<string, unknown>> {
    const states: Record<string, Record<string, unknown>> = {};
    for (const [pluginId, plugin] of this.plugins) {
      if (typeof plugin.module.getState === "function") {
        try { states[pluginId] = plugin.module.getState(); } catch {}
      }
    }
    return states;
  }

  /** Unload all plugins, calling onUnload on each */
  async unloadAll(): Promise<void> {
    for (const [pluginId, plugin] of this.plugins) {
      try {
        if (typeof plugin.module.onUnload === "function") {
          await plugin.module.onUnload();
        }
      } catch (e) {
        console.error(`[orbit] Plugin "${pluginId}" onUnload() error:`, e);
      }
    }
    this.plugins.clear();
  }
}
