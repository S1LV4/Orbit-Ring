import { createTranslator, resolveLocale } from "@orbitring/shared/src/i18n";

export const t = createTranslator(resolveLocale(typeof navigator !== "undefined" ? navigator.languages : []));

if (typeof document !== "undefined") document.documentElement.lang = t.locale;
