import * as fs from "fs";
import * as path from "path";

export interface ManifestText {
  name?: string;
  description?: string;
  actions: Record<string, { name?: string; description?: string }>;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : undefined);

function localeFile(dir: string, locale: string): string | null {
  let files: string[];
  try { files = fs.readdirSync(path.join(dir, "locales")).filter((f) => f.endsWith(".json")); } catch { return null; }
  const tags = files.map((f) => f.slice(0, -5));
  const exact = tags.find((t) => t.toLowerCase() === locale.toLowerCase());
  const lang = locale.toLowerCase().split(/[-_]/)[0];
  const tag = exact ?? tags.find((t) => t.toLowerCase().split("-")[0] === lang);
  return tag ? path.join(dir, "locales", `${tag}.json`) : null;
}

export function readManifestText(dir: string, locale: string | undefined): ManifestText {
  const empty: ManifestText = { actions: {} };
  if (!locale) return empty;
  const file = localeFile(dir, locale);
  if (!file) return empty;
  let m: any;
  try { m = JSON.parse(fs.readFileSync(file, "utf8"))?.manifest; } catch { return empty; }
  if (!m || typeof m !== "object") return empty;
  const actions: ManifestText["actions"] = {};
  if (m.actions && typeof m.actions === "object") {
    for (const [id, a] of Object.entries(m.actions as Record<string, any>)) {
      if (a && typeof a === "object") actions[id] = { name: str(a.name), description: str(a.description) };
    }
  }
  return { name: str(m.name), description: str(m.description), actions };
}
