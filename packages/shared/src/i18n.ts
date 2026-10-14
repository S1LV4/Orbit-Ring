import ptBR_app from "../locales/pt-BR/app.json";
import ptBR_bindings from "../locales/pt-BR/bindings.json";
import ptBR_catalog from "../locales/pt-BR/catalog.json";
import ptBR_devices from "../locales/pt-BR/devices.json";
import ptBR_editor from "../locales/pt-BR/editor.json";
import ptBR_plugins from "../locales/pt-BR/plugins.json";
import ptBR_profiles from "../locales/pt-BR/profiles.json";
import ptBR_ring from "../locales/pt-BR/ring.json";
import ptBR_tray from "../locales/pt-BR/tray.json";
import enUS_app from "../locales/en-US/app.json";
import enUS_bindings from "../locales/en-US/bindings.json";
import enUS_catalog from "../locales/en-US/catalog.json";
import enUS_devices from "../locales/en-US/devices.json";
import enUS_editor from "../locales/en-US/editor.json";
import enUS_plugins from "../locales/en-US/plugins.json";
import enUS_profiles from "../locales/en-US/profiles.json";
import enUS_ring from "../locales/en-US/ring.json";
import enUS_tray from "../locales/en-US/tray.json";
import esES_app from "../locales/es-ES/app.json";
import esES_bindings from "../locales/es-ES/bindings.json";
import esES_catalog from "../locales/es-ES/catalog.json";
import esES_devices from "../locales/es-ES/devices.json";
import esES_editor from "../locales/es-ES/editor.json";
import esES_plugins from "../locales/es-ES/plugins.json";
import esES_profiles from "../locales/es-ES/profiles.json";
import esES_ring from "../locales/es-ES/ring.json";
import esES_tray from "../locales/es-ES/tray.json";

const ptBR = { app: ptBR_app, bindings: ptBR_bindings, catalog: ptBR_catalog, devices: ptBR_devices, editor: ptBR_editor, plugins: ptBR_plugins, profiles: ptBR_profiles, ring: ptBR_ring, tray: ptBR_tray };
const enUS = { app: enUS_app, bindings: enUS_bindings, catalog: enUS_catalog, devices: enUS_devices, editor: enUS_editor, plugins: enUS_plugins, profiles: enUS_profiles, ring: enUS_ring, tray: enUS_tray };
const esES = { app: esES_app, bindings: esES_bindings, catalog: esES_catalog, devices: esES_devices, editor: esES_editor, plugins: esES_plugins, profiles: esES_profiles, ring: esES_ring, tray: esES_tray };

export const DEFAULT_LOCALE = "en-US";
export const MESSAGES = { "en-US": enUS, "pt-BR": ptBR, "es-ES": esES } as const;
export type Locale = keyof typeof MESSAGES;
export const LOCALES = Object.keys(MESSAGES) as Locale[];

type PluralForms = { other: string } & Partial<Record<"zero" | "one" | "two" | "few" | "many", string>>;
type Paths<T> = {
  [K in keyof T & string]: T[K] extends string | PluralForms ? K : `${K}.${Paths<T[K]>}`;
}[keyof T & string];
export type MessageKey = Paths<typeof enUS>;
export type Params = Record<string, string | number>;

export interface Translator {
  (key: MessageKey, params?: Params): string;
  dyn(key: string, params?: Params): string;
  has(key: string): boolean;
  locale: Locale;
}

export function resolveLocale(preferred: readonly (string | null | undefined)[] | string | null | undefined): Locale {
  const list = (Array.isArray(preferred) ? preferred : [preferred]).filter((p): p is string => !!p);
  for (const p of list) {
    const exact = LOCALES.find((l) => l.toLowerCase() === p.toLowerCase());
    if (exact) return exact;
    const lang = p.toLowerCase().split(/[-_]/)[0];
    const byLang = LOCALES.find((l) => l.toLowerCase().split("-")[0] === lang);
    if (byLang) return byLang;
  }
  return DEFAULT_LOCALE;
}

function lookup(messages: unknown, key: string): string | PluralForms | undefined {
  let v: unknown = messages;
  for (const part of key.split(".")) {
    if (!v || typeof v !== "object") return undefined;
    v = (v as Record<string, unknown>)[part];
  }
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && typeof (v as PluralForms).other === "string") return v as PluralForms;
  return undefined;
}

export function createTranslator(locale: string, messages: Record<string, unknown> = MESSAGES): Translator {
  const plural = new Intl.PluralRules(locale);
  const find = (key: string) => lookup(messages[locale], key) ?? lookup(messages[DEFAULT_LOCALE], key);
  const format = (key: string, params?: Params) => {
    const v = find(key);
    if (v === undefined) return key;
    const text = typeof v === "string" ? v
      : typeof params?.count === "number" ? (v[plural.select(params.count) as keyof PluralForms] ?? v.other) : v.other;
    return params ? text.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m)) : text;
  };
  const t = ((key: MessageKey, params?: Params) => format(key, params)) as Translator;
  t.dyn = format;
  t.has = (key) => find(key) !== undefined;
  t.locale = locale as Locale;
  return t;
}
