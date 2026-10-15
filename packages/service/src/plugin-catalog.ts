import { readManifestText } from "./plugin-text";
import { apiCompatible, readPermissions, requiredApi } from "./plugin-api";
import * as fs from "fs";
import * as path from "path";
import type { PluginCatalogEntry, PluginPermission } from "@orbitring/shared";

export function compareVersions(a: unknown, b: unknown): number {
  const parts = (v: unknown) => String(v ?? "").split(".").map((p) => parseInt(p, 10) || 0);
  const pa = parts(a), pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

interface FolderManifest {
  dir: string;
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  actionCount: number;
  orbitApi: string;
  permissions: PluginPermission[] | null;
}

const text = (v: unknown) => (typeof v === "string" ? v : "");

function readFolders(root: string | undefined): FolderManifest[] {
  if (!root) return [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: FolderManifest[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(root, entry.name);
    try {
      const m = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
      if (!m || typeof m.id !== "string" || !m.id) continue;
      out.push({
        dir, id: m.id, name: text(m.name) || m.id, version: text(m.version) || "0",
        author: text(m.author), description: text(m.description),
        actionCount: Array.isArray(m.actions) ? m.actions.length : 0,
        orbitApi: requiredApi(m),
        permissions: readPermissions(m),
      });
    } catch {  }
  }
  return out;
}

export function listCatalog(catalogDir: string | undefined, pluginsDir: string, locale?: string): PluginCatalogEntry[] {
  const installed = new Map(readFolders(pluginsDir).map((p) => [p.id, p.version]));
  return readFolders(catalogDir)
    .map(({ dir, ...p }) => {
      const installedVersion = installed.get(p.id) ?? null;
      const text = readManifestText(dir, locale);
      return {
        ...p, name: text.name ?? p.name, description: text.description ?? p.description, installedVersion,
        updateAvailable: installedVersion !== null && compareVersions(p.version, installedVersion) > 0,
        compatible: apiCompatible(p.orbitApi),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function installFromCatalog(catalogDir: string | undefined, pluginId: string, pluginsDir: string): string {
  const source = readFolders(catalogDir).find((p) => p.id === pluginId);
  if (!source) throw new Error(`Plugin "${pluginId}" is not in the catalog`);
  if (!apiCompatible(source.orbitApi)) throw new Error(`Plugin "${pluginId}" needs plugin API ${source.orbitApi}, which this app does not provide`);
  const existing = readFolders(pluginsDir).find((p) => p.id === pluginId);
  const target = existing ? existing.dir : path.join(pluginsDir, path.basename(source.dir));
  if (!existing && fs.existsSync(target)) {
    throw new Error(`Folder "${path.basename(target)}" already exists in the plugins folder`);
  }
  fs.mkdirSync(pluginsDir, { recursive: true });
  fs.cpSync(source.dir, target, { recursive: true, force: true });
  return target;
}

export function removeInstalled(pluginDir: string, pluginsDir: string): void {
  const dir = path.resolve(pluginDir);
  if (path.dirname(dir).toLowerCase() !== path.resolve(pluginsDir).toLowerCase() || !path.basename(dir)) {
    throw new Error("Refusing to delete a folder outside the plugins folder");
  }
  fs.rmSync(dir, { recursive: true, force: true });
}
