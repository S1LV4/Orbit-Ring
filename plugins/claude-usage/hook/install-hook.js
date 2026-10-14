#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const os = require("os");
const i18n = require("../i18n")(require("path").join(__dirname, ".."));
if (!process.env.ORBIT_PLUGIN_LOCALE) i18n.setLocale(Intl.DateTimeFormat().resolvedOptions().locale);

const EVENT = "PermissionRequest";
const MARKER = "orbit-permission-hook.js";
const DEFAULT_TIMEOUT_S = 75;

function parseArgs(argv) {
  const o = { yes: false, uninstall: false, settings: null, timeout: DEFAULT_TIMEOUT_S, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--yes" || a === "-y") o.yes = true;
    else if (a === "--uninstall" || a === "--remove") o.uninstall = true;
    else if (a === "--settings") o.settings = argv[++i];
    else if (a === "--timeout") o.timeout = Number.parseInt(argv[++i], 10);
    else if (a === "--help" || a === "-h") o.help = true;
    else throw new Error(i18n.t("hook.unknownOption", { option: a }));
  }
  if (o.settings === undefined) throw new Error(i18n.t("hook.settingsPath"));
  if (!Number.isInteger(o.timeout) || o.timeout < 5) throw new Error(i18n.t("hook.timeout"));
  return o;
}

function hookCommand(scriptPath) {
  return `node "${scriptPath.replace(/\\/g, "/")}"`;
}

function isOurs(handler) {
  if (!handler || typeof handler !== "object") return false;
  const cmd = typeof handler.command === "string" ? handler.command : "";
  const args = Array.isArray(handler.args) ? handler.args.join(" ") : "";
  return cmd.includes(MARKER) || args.includes(MARKER);
}

function withoutHook(settings) {
  const out = { ...settings };
  if (!out.hooks || typeof out.hooks !== "object" || Array.isArray(out.hooks)) return out;
  const hooks = { ...out.hooks };
  if (Array.isArray(hooks[EVENT])) {
    const groups = [];
    for (const g of hooks[EVENT]) {
      if (!g || typeof g !== "object" || !Array.isArray(g.hooks) || !g.hooks.some(isOurs)) { groups.push(g); continue; }
      const rest = g.hooks.filter((h) => !isOurs(h));
      if (rest.length) groups.push({ ...g, hooks: rest });
    }
    if (groups.length) hooks[EVENT] = groups;
    else delete hooks[EVENT];
  }
  if (Object.keys(hooks).length) out.hooks = hooks;
  else delete out.hooks;
  return out;
}

function withHook(settings, command, timeout) {
  const out = withoutHook(settings);
  const hooks = out.hooks && typeof out.hooks === "object" && !Array.isArray(out.hooks) ? { ...out.hooks } : {};
  const groups = Array.isArray(hooks[EVENT]) ? hooks[EVENT].slice() : [];
  groups.push({ matcher: "*", hooks: [{ type: "command", command, timeout }] });
  hooks[EVENT] = groups;
  out.hooks = hooks;
  return out;
}

function stamp() {
  const d = new Date(), p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log("Uso: node install-hook.js [--uninstall] [--yes] [--settings <arquivo>] [--timeout <segundos>]");
    return 0;
  }
  const file = path.resolve(opts.settings || path.join(os.homedir(), ".claude", "settings.json"));
  const script = path.join(__dirname, MARKER);
  if (!opts.uninstall && !fs.existsSync(script)) throw new Error(i18n.t("hook.scriptMissing", { path: script }));

  const exists = fs.existsSync(file);
  let rawText = "";
  let current = {};
  if (exists) {
    rawText = fs.readFileSync(file, "utf8");
    if (rawText.trim()) {
      try { current = JSON.parse(rawText.replace(/^﻿/, "")); }
      catch (e) { throw new Error(i18n.t("hook.badJson", { file, error: e.message })); }
      if (!current || typeof current !== "object" || Array.isArray(current)) {
        throw new Error(i18n.t("hook.notObject", { file }));
      }
    }
  }
  if (current.hooks !== undefined && (typeof current.hooks !== "object" || current.hooks === null || Array.isArray(current.hooks))) {
    throw new Error(i18n.t("hook.hooksNotObject", { file }));
  }
  if (current.hooks && current.hooks[EVENT] !== undefined && !Array.isArray(current.hooks[EVENT])) {
    throw new Error(i18n.t("hook.eventNotList", { event: EVENT, file }));
  }

  const command = hookCommand(script);
  const installed = ((current.hooks && current.hooks[EVENT]) || [])
    .flatMap((g) => (g && Array.isArray(g.hooks) ? g.hooks : []))
    .filter(isOurs);
  const upToDate = installed.length === 1 && installed[0].type === "command"
    && installed[0].command === command && installed[0].timeout === opts.timeout;
  const next = opts.uninstall ? withoutHook(current)
    : upToDate ? current
    : withHook(current, command, opts.timeout);
  const before = JSON.stringify(current.hooks ? current.hooks[EVENT] : undefined, null, 2);
  const after = JSON.stringify(next.hooks ? next.hooks[EVENT] : undefined, null, 2);

  console.log(`Arquivo: ${file}${exists ? "" : " (ainda não existe — será criado)"}`);
  console.log(`Ação:    ${opts.uninstall ? "remover" : "instalar"} o hook ${EVENT} do OrbitRing`);

  if (JSON.stringify(current) === JSON.stringify(next)) {
    console.log(opts.uninstall ? "Nada a fazer: o hook não está instalado." : "Nada a fazer: o hook já está instalado.");
    return 0;
  }

  console.log(`\nhooks.${EVENT} — antes:\n${before === undefined ? "(ausente)" : before}`);
  console.log(`\nhooks.${EVENT} — depois:\n${after === undefined ? "(ausente)" : after}\n`);

  if (!opts.yes) {
    console.log("Simulação: nada foi gravado. Rode de novo com --yes para aplicar.");
    return 0;
  }

  if (exists) {
    const backup = `${file}.orbit-backup-${stamp()}`;
    fs.copyFileSync(file, backup);
    console.log(`Backup: ${backup}`);
  } else {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }
  const tmp = `${file}.orbit-tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + "\n");
  fs.renameSync(tmp, file);
  console.log(opts.uninstall
    ? i18n.t("hook.removed")
    : i18n.t("hook.installed"));
  return 0;
}

if (require.main === module) {
  try { process.exit(main()); }
  catch (e) { console.error(`Erro: ${e && e.message}`); process.exit(1); }
}

module.exports = { withHook, withoutHook, hookCommand, isOurs, EVENT, MARKER };
