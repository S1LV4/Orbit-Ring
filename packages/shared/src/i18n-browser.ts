import { SYSTEM_LOCALE, createTranslator, isLocaleSetting, localeFor, type LocaleSetting } from "./i18n";

const KEY = "orbitring.locale";

export function storedLocaleSetting(): LocaleSetting {
  try {
    const v = localStorage.getItem(KEY);
    return isLocaleSetting(v) ? v : SYSTEM_LOCALE;
  } catch {
    return SYSTEM_LOCALE;
  }
}

export function createBrowserTranslator() {
  const t = createTranslator(localeFor(storedLocaleSetting(), typeof navigator !== "undefined" ? navigator.languages : []));
  if (typeof document !== "undefined") document.documentElement.lang = t.locale;
  return t;
}

export function applyLocaleSetting(next: unknown): boolean {
  if (!isLocaleSetting(next) || next === storedLocaleSetting()) return false;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    return false;
  }
  location.reload();
  return true;
}
