import { PLUGIN_API_VERSION, PLUGIN_PERMISSIONS, type PluginPermission } from "@orbitring/shared";

export { PLUGIN_API_VERSION, PLUGIN_PERMISSIONS };

const MODULE_PERMISSIONS: Record<string, PluginPermission> = {
  child_process: "commands",
  http: "network", https: "network", http2: "network", net: "network", tls: "network", dgram: "network",
};

export const CHECKED_PERMISSIONS: PluginPermission[] = [...new Set(Object.values(MODULE_PERMISSIONS))];

const ordered = (set: Set<PluginPermission>) => PLUGIN_PERMISSIONS.filter((p) => set.has(p));

export function readPermissions(manifest: { permissions?: unknown }): PluginPermission[] | null {
  if (!Array.isArray(manifest.permissions)) return null;
  return ordered(new Set(manifest.permissions));
}

export function permissionsForModules(modules: string[]): PluginPermission[] {
  const out = new Set<PluginPermission>();
  for (const m of modules) {
    const p = MODULE_PERMISSIONS[m.replace(/^node:/, "")];
    if (p) out.add(p);
  }
  return ordered(out);
}

const DEFAULT_RANGE = "^1.0.0";
const CARET = /^\^(\d+)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?$/;

const num = (s: string | undefined) => (s === undefined || s === "x" || s === "*" ? 0 : Number(s));

export function requiredApi(manifest: { orbitApi?: unknown }): string {
  return typeof manifest.orbitApi === "string" ? manifest.orbitApi : DEFAULT_RANGE;
}

export function apiCompatible(range: unknown, version: string = PLUGIN_API_VERSION): boolean {
  if (typeof range !== "string") return false;
  const m = CARET.exec(range.trim());
  const v = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!m || !v) return false;
  const want = [num(m[1]), num(m[2]), num(m[3])];
  const have = [Number(v[1]), Number(v[2]), Number(v[3])];
  if (have[0] !== want[0]) return false;
  for (let i = 1; i < 3; i++) if (have[i] !== want[i]) return have[i] > want[i];
  return true;
}
