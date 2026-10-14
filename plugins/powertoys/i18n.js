const fs = require("fs");
const path = require("path");

const FALLBACK = "en-US";

function readLocales(dir) {
  const out = {};
  let files = [];
  try { files = fs.readdirSync(path.join(dir, "locales")); } catch { return out; }
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    try { out[f.slice(0, -5)] = JSON.parse(fs.readFileSync(path.join(dir, "locales", f), "utf8")); } catch {}
  }
  return out;
}

const lookup = (messages, key) =>
  key.split(".").reduce((v, k) => (v && typeof v === "object" ? v[k] : undefined), messages);

const instances = new Map();

module.exports = function createI18n(dir) {
  const key = path.resolve(dir);
  if (instances.has(key)) return instances.get(key);
  const messages = readLocales(dir);
  const tags = Object.keys(messages);

  const pick = (want) => {
    if (typeof want !== "string" || !want) return FALLBACK;
    const exact = tags.find((t) => t.toLowerCase() === want.toLowerCase());
    if (exact) return exact;
    const lang = want.toLowerCase().split(/[-_]/)[0];
    return tags.find((t) => t.toLowerCase().split("-")[0] === lang) || FALLBACK;
  };

  let locale = pick(process.env.ORBIT_PLUGIN_LOCALE);

  function t(key, params) {
    let v = lookup(messages[locale], key);
    if (v === undefined) v = lookup(messages[FALLBACK], key);
    if (v && typeof v === "object" && typeof v.other === "string") {
      const category = params && typeof params.count === "number" ? new Intl.PluralRules(locale).select(params.count) : "other";
      v = typeof v[category] === "string" ? v[category] : v.other;
    }
    if (typeof v !== "string") return key;
    return params ? v.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m)) : v;
  }

  const instance = {
    t,
    setLocale(next) {
      locale = pick(next);
      return locale;
    },
    get locale() {
      return locale;
    },
    number(n, options) {
      return new Intl.NumberFormat(locale, options).format(n);
    },
  };
  instances.set(key, instance);
  return instance;
};
