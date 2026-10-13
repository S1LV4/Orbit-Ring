import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type {
  PluginManifest, PluginAction, PluginActionDef, PluginInfo, PluginHost,
  PluginActionState, PluginActionStateObject, PluginStates, AttentionItem,
} from "@orbitring/shared";

type LoaderHostKeys = "stateChanged" | "actionsChanged" | "attention" | "clearAttention";

const DYNAMIC_ID = /^[a-z0-9_.-]{1,64}$/;
const DYNAMIC_MAX_PER_PLUGIN = 16;
const RETIRED_STATE: PluginActionStateObject = { text: "–", label: "indisponível" };

const IMAGE_URI = /^data:image[/](png|jpeg|webp);base64,([A-Za-z0-9+/]*={0,2})$/;
const IMAGE_MAX_BYTES = 48 * 1024;
const IMAGES_MAX_PER_PLUGIN = 16;
const IMAGES_MAX_TOTAL_BYTES = 400 * 1024;

function inspectImage(v: unknown): { bytes: number } | { reason: string } {
  if (typeof v !== "string") return { reason: "not a string" };
  if (v.length > 40 + Math.ceil(IMAGE_MAX_BYTES / 3) * 4) return { reason: `larger than ${IMAGE_MAX_BYTES / 1024} KB` };
  const m = IMAGE_URI.exec(v);
  if (!m) return { reason: "not a data:image/(png|jpeg|webp);base64 URI" };
  const b64 = m[2];
  if (!b64 || b64.length % 4 !== 0) return { reason: "malformed base64" };
  const buf = Buffer.from(b64, "base64");
  if (buf.length !== (b64.length / 4) * 3 - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0)) return { reason: "malformed base64" };
  if (buf.length > IMAGE_MAX_BYTES) return { reason: `larger than ${IMAGE_MAX_BYTES / 1024} KB` };
  const ok = m[1] === "png" ? buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47 && buf.readUInt32BE(4) === 0x0d0a1a0a
    : m[1] === "jpeg" ? buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff
    : buf.length > 12 && buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP";
  return ok ? { bytes: buf.length } : { reason: `the bytes are not a ${m[1]} image` };
}

interface ImageBudget { count: number; bytes: number }

function acceptImage(v: unknown, budget: ImageBudget, warn: (reason: string) => void): string | undefined {
  if (v === undefined || v === null) return undefined;
  const r = inspectImage(v);
  if ("reason" in r) { warn(r.reason); return undefined; }
  if (budget.count >= IMAGES_MAX_PER_PLUGIN) { warn(`more than ${IMAGES_MAX_PER_PLUGIN} images in one plugin`); return undefined; }
  if (budget.bytes + r.bytes > IMAGES_MAX_TOTAL_BYTES) { warn(`more than ${IMAGES_MAX_TOTAL_BYTES / 1024} KB of images in one plugin`); return undefined; }
  budget.count++;
  budget.bytes += r.bytes;
  return v as string;
}

const ATTENTION_DEFAULT_MS = 2 * 60_000;
const ATTENTION_MAX_MS = 10 * 60_000;
const ATTENTION_MAX_PER_PLUGIN = 8;

interface AttentionEntry {
  item: AttentionItem;
  pluginId: string;
  timer: ReturnType<typeof setTimeout>;
}

function sanitizeAttention(v: unknown, pluginId: string): AttentionItem | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== "string" || !o.id || typeof o.title !== "string" || !o.title.trim()) return undefined;
  const out: AttentionItem = { id: o.id.slice(0, 120), title: o.title.trim().slice(0, 80), pluginId };
  if (typeof o.text === "string" && o.text.trim()) out.text = o.text.trim().slice(0, 200);
  if (Array.isArray(o.actionIds)) {
    out.actionIds = o.actionIds.filter((a): a is string => typeof a === "string" && !!a).slice(0, 4);
  }
  const t = typeof o.timeoutMs === "number" && Number.isFinite(o.timeoutMs) && o.timeoutMs > 0 ? o.timeoutMs : ATTENTION_DEFAULT_MS;
  out.timeoutMs = Math.min(ATTENTION_MAX_MS, Math.round(t));
  return out;
}

interface PluginModule {
  onLoad?(host?: PluginHost): void | Promise<void>;
  onUnload?(): void | Promise<void>;
  onAction?(actionId: string, context?: Record<string, unknown>): unknown | Promise<unknown>;
  getState?(): Record<string, unknown>;
  getActions?(): unknown;
}

interface LoadedPlugin {
  manifest: PluginManifest;
  module: PluginModule;
  dir: string;
  dynamic: PluginActionDef[];
  retired: Set<string>;
  manifestImages: ImageBudget;
  imageWarned: Set<string>;
}

function imageWarner(pluginId: string, warned: Set<string>, actionId: string): (reason: string) => void {
  return (reason) => {
    if (warned.has(actionId)) return;
    warned.add(actionId);
    console.warn(`[orbit] Plugin "${pluginId}" action "${actionId}": image dropped (${reason}) — using the icon`);
  };
}

function sanitizeDynamicActions(
  raw: unknown, manifestIds: Set<string>,
  budget: ImageBudget = { count: 0, bytes: 0 }, warn: (actionId: string) => (reason: string) => void = () => () => {},
): PluginActionDef[] {
  if (!Array.isArray(raw)) return [];
  const out: PluginActionDef[] = [];
  const seen = new Set<string>();
  for (const v of raw) {
    if (out.length >= DYNAMIC_MAX_PER_PLUGIN) break;
    if (!v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    if (typeof o.id !== "string" || !DYNAMIC_ID.test(o.id)) continue;
    if (manifestIds.has(o.id) || seen.has(o.id)) continue;
    if (typeof o.name !== "string" || !o.name.trim()) continue;
    const def: PluginActionDef = { id: o.id, name: o.name.trim().slice(0, 80) };
    if (typeof o.icon === "string" && o.icon.length <= 4000) def.icon = o.icon;
    if (typeof o.iconActive === "string" && o.iconActive.length <= 4000) def.iconActive = o.iconActive;
    if (o.keepIcon === true) def.keepIcon = true;
    const image = acceptImage(o.image, budget, warn(def.id));
    if (image) def.image = image;
    if (typeof o.stateful === "boolean") def.stateful = o.stateful;
    if (typeof o.description === "string") def.description = o.description.slice(0, 300);
    seen.add(def.id);
    out.push(def);
  }
  return out;
}

const PLUGINS_DIR = path.join(os.homedir(), ".orbit", "plugins");

export interface PluginLoaderOptions {
  pluginsDir?: string;
  hostServices?: Omit<PluginHost, LoaderHostKeys>;
}

const STATUSES = new Set(["green", "amber", "red"]);

function sanitizeState(v: unknown): PluginActionState | undefined {
  if (typeof v === "boolean") return v;
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const out: PluginActionStateObject = {};
  if (typeof o.active === "boolean") out.active = o.active;
  if (typeof o.value === "number" && Number.isFinite(o.value)) out.value = Math.max(0, Math.min(100, o.value));
  if (typeof o.text === "string") out.text = Array.from(o.text).slice(0, 4).join("");
  if (typeof o.label === "string") out.label = o.label.slice(0, 200);
  if (typeof o.status === "string" && STATUSES.has(o.status)) out.status = o.status as PluginActionStateObject["status"];
  return out;
}

function toPluginAction(a: PluginActionDef, pluginId: string): PluginAction {
  return {
    id: a.id,
    name: a.name,
    icon: a.icon,
    iconActive: a.iconActive,
    keepIcon: a.keepIcon === true ? true : undefined,
    image: a.image,
    stateful: a.stateful,
    description: a.description,
    pluginId,
  };
}

export class PluginLoader {
  private plugins = new Map<string, LoadedPlugin>();
  private pluginsDir: string;
  private hostServices: Omit<PluginHost, LoaderHostKeys>;
  private stateListener: ((pluginId: string) => void) | null = null;
  private actionsListener: ((pluginId: string) => void) | null = null;
  private attention = new Map<string, AttentionEntry>();
  private attentionListener: ((items: AttentionItem[]) => void) | null = null;

  constructor(opts: PluginLoaderOptions = {}) {
    this.pluginsDir = opts.pluginsDir ?? PLUGINS_DIR;
    this.hostServices = opts.hostServices ?? {};
  }

  onStateChanged(cb: (pluginId: string) => void): void {
    this.stateListener = cb;
  }

  onActionsChanged(cb: (pluginId: string) => void): void {
    this.actionsListener = cb;
  }

  private refreshDynamicActions(plugin: LoadedPlugin): boolean {
    let next: PluginActionDef[] = [];
    if (typeof plugin.module.getActions === "function") {
      try {
        const manifestIds = new Set((plugin.manifest.actions || []).map((a) => a.id));
        next = sanitizeDynamicActions(
          plugin.module.getActions(), manifestIds, { ...plugin.manifestImages },
          (actionId) => imageWarner(plugin.manifest.id, plugin.imageWarned, actionId),
        );
      } catch (e) {
        console.error(`[orbit] Plugin "${plugin.manifest.id}" getActions() error:`, e);
      }
    }
    if (JSON.stringify(next) === JSON.stringify(plugin.dynamic)) return false;
    const nextIds = new Set(next.map((a) => a.id));
    for (const a of plugin.dynamic) if (!nextIds.has(a.id)) plugin.retired.add(a.id);
    for (const id of nextIds) plugin.retired.delete(id);
    plugin.dynamic = next;
    return true;
  }

  private actionsOf(plugin: LoadedPlugin): PluginActionDef[] {
    return [...(plugin.manifest.actions || []), ...plugin.dynamic];
  }

  onAttentionChanged(cb: (items: AttentionItem[]) => void): void {
    this.attentionListener = cb;
  }

  getAttention(): AttentionItem[] {
    return Array.from(this.attention.values(), (e) => e.item);
  }

  private emitAttention(): void {
    try { this.attentionListener?.(this.getAttention()); } catch (e) {
      console.error("[orbit] attention handler error:", e);
    }
  }

  private setAttention(pluginId: string, raw: unknown): void {
    const item = sanitizeAttention(raw, pluginId);
    if (!item) {
      console.warn(`[orbit] Plugin "${pluginId}" sent an invalid attention item (needs id and title)`);
      return;
    }
    const key = `${pluginId}\n${item.id}`;
    const prev = this.attention.get(key);
    if (prev) {
      clearTimeout(prev.timer);
    } else {
      let own = 0;
      for (const e of this.attention.values()) if (e.pluginId === pluginId) own++;
      if (own >= ATTENTION_MAX_PER_PLUGIN) return;
    }
    const timer = setTimeout(() => {
      if (this.attention.delete(key)) this.emitAttention();
    }, item.timeoutMs);
    timer.unref?.();
    this.attention.set(key, { item, pluginId, timer });
    this.emitAttention();
  }

  private clearAttention(pluginId: string, id?: string): void {
    let removed = false;
    for (const [key, e] of this.attention) {
      if (e.pluginId !== pluginId || (id !== undefined && e.item.id !== id)) continue;
      clearTimeout(e.timer);
      this.attention.delete(key);
      removed = true;
    }
    if (removed) this.emitAttention();
  }

  getPluginsDir(): string {
    try { fs.mkdirSync(this.pluginsDir, { recursive: true }); } catch {}
    return this.pluginsDir;
  }

  async loadAll(): Promise<void> {
    try {
      fs.mkdirSync(this.pluginsDir, { recursive: true });
    } catch (e) {
      console.error("[orbit] Failed to create plugins directory:", e);
      return;
    }

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(this.pluginsDir, { withFileTypes: true });
    } catch (e) {
      console.error("[orbit] Failed to read plugins directory:", e);
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const pluginDir = path.join(this.pluginsDir, entry.name);
      try {
        await this.loadPlugin(pluginDir);
      } catch (e) {
        console.error(`[orbit] Failed to load plugin from ${entry.name}:`, e);
      }
    }
  }

  async loadFolder(dir: string): Promise<boolean> {
    await this.loadPlugin(dir);
    for (const p of this.plugins.values()) if (path.resolve(p.dir) === path.resolve(dir)) return true;
    return false;
  }

  getPluginDir(pluginId: string): string | null {
    return this.plugins.get(pluginId)?.dir ?? null;
  }

  async unload(pluginId: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return false;
    try {
      if (typeof plugin.module.onUnload === "function") await plugin.module.onUnload();
    } catch (e) {
      console.error(`[orbit] Plugin "${pluginId}" onUnload() error:`, e);
    }
    this.plugins.delete(pluginId);
    this.clearAttention(pluginId);
    const prefix = (path.resolve(plugin.dir) + path.sep).toLowerCase();
    for (const key of Object.keys(require.cache)) {
      if (key.toLowerCase().startsWith(prefix)) delete require.cache[key];
    }
    console.log(`[orbit] Unloaded plugin: ${plugin.manifest.name}`);
    return true;
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
      delete require.cache[require.resolve(mainPath)];
      mod = require(mainPath);
    } catch (e) {
      console.error(`[orbit] Plugin "${manifest.name}": failed to require main file:`, e);
      return;
    }

    const pluginId = manifest.id;
    const host: PluginHost = {
      ...this.hostServices,
      stateChanged: () => {
        try { this.stateListener?.(pluginId); } catch (e) {
          console.error(`[orbit] Plugin "${pluginId}" stateChanged handler error:`, e);
        }
      },
      actionsChanged: () => {
        const plugin = this.plugins.get(pluginId);
        if (!plugin || !this.refreshDynamicActions(plugin)) return;
        try { this.actionsListener?.(pluginId); } catch (e) {
          console.error(`[orbit] Plugin "${pluginId}" actionsChanged handler error:`, e);
        }
      },
      attention: (item) => {
        if (item === null || item === undefined) this.clearAttention(pluginId);
        else this.setAttention(pluginId, item);
      },
      clearAttention: (id) => {
        if (typeof id === "string") this.clearAttention(pluginId, id);
      },
    };
    try {
      if (typeof mod.onLoad === "function") {
        await mod.onLoad(host);
      }
    } catch (e) {
      console.error(`[orbit] Plugin "${manifest.name}": onLoad() error:`, e);
      this.clearAttention(pluginId);
      return;
    }

    const manifestImages: ImageBudget = { count: 0, bytes: 0 };
    const imageWarned = new Set<string>();
    if (Array.isArray(manifest.actions)) {
      manifest.actions = manifest.actions.map((a) => {
        if (!a || typeof a !== "object" || a.image === undefined) return a;
        const { image: rawImage, ...rest } = a;
        const image = acceptImage(rawImage, manifestImages, imageWarner(pluginId, imageWarned, String(a.id)));
        return image ? { ...rest, image } : rest;
      });
    }

    const loaded: LoadedPlugin = { manifest, module: mod, dir, dynamic: [], retired: new Set(), manifestImages, imageWarned };
    this.plugins.set(manifest.id, loaded);
    this.refreshDynamicActions(loaded);
    const actionCount = (manifest.actions?.length ?? 0) + loaded.dynamic.length;
    console.log(`[orbit] Loaded plugin: ${manifest.name} (${actionCount} actions)`);
  }

  getPluginActions(): PluginAction[] {
    const actions: PluginAction[] = [];
    for (const [pluginId, plugin] of this.plugins) {
      for (const action of this.actionsOf(plugin)) {
        actions.push(toPluginAction(action, pluginId));
      }
    }
    return actions;
  }

  getPlugins(): PluginInfo[] {
    const result: PluginInfo[] = [];
    for (const [pluginId, plugin] of this.plugins) {
      const actions: PluginAction[] = this.actionsOf(plugin).map((a) => toPluginAction(a, pluginId));
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
    if (typeof plugin.module.getActions === "function" && !this.actionsOf(plugin).some((a) => a.id === actionId)) {
      console.warn(`[orbit] Plugin "${pluginId}" action "${actionId}" is not available right now`);
      return { handled: false, unavailable: true };
    }
    try {
      return await plugin.module.onAction(actionId);
    } catch (e) {
      console.error(`[orbit] Plugin "${pluginId}" action "${actionId}" error:`, e);
    }
  }

  getPluginStates(): PluginStates {
    const states: PluginStates = {};
    for (const [pluginId, plugin] of this.plugins) {
      if (typeof plugin.module.getState !== "function") continue;
      try {
        const raw = plugin.module.getState() || {};
        const out: Record<string, PluginActionState> = {};
        for (const action of this.actionsOf(plugin)) {
          const st = sanitizeState(raw[action.id]);
          if (st !== undefined) out[action.id] = st;
        }
        for (const id of plugin.retired) out[id] = sanitizeState(raw[id]) ?? { ...RETIRED_STATE };
        states[pluginId] = out;
      } catch (e) {
        console.error(`[orbit] Plugin "${pluginId}" getState() error:`, e);
      }
    }
    return states;
  }

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
    if (this.attention.size) {
      for (const e of this.attention.values()) clearTimeout(e.timer);
      this.attention.clear();
      this.emitAttention();
    }
  }
}
