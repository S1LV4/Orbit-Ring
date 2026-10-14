#!/usr/bin/env node

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const i18n = require("../i18n")(require("path").join(__dirname, ".."));
if (!process.env.ORBIT_PLUGIN_LOCALE) i18n.setLocale(Intl.DateTimeFormat().resolvedOptions().locale);

const DEFAULT_PORT = 9123;
const DEFAULT_TIMEOUT_MS = 70_000;
const EVENT = "PermissionRequest";
const SKIP_TOOLS = new Set(["AskUserQuestion", "ExitPlanMode"]);

function orbitHome(env) {
  return env.ORBIT_HOME || path.join(os.homedir(), ".orbit");
}

function readTrimmed(file) {
  try { return fs.readFileSync(file, "utf8").trim(); } catch { return ""; }
}

function resolvePort(env) {
  const fromEnv = Number.parseInt(env.ORBIT_CLAUDE_PORT, 10);
  if (Number.isInteger(fromEnv) && fromEnv > 0 && fromEnv < 65536) return fromEnv;
  const fromFile = Number.parseInt(readTrimmed(path.join(orbitHome(env), "claude-hook-port")), 10);
  if (Number.isInteger(fromFile) && fromFile > 0 && fromFile < 65536) return fromFile;
  return DEFAULT_PORT;
}

function resolveTimeout(env) {
  const n = Number.parseInt(env.ORBIT_CLAUDE_HOOK_TIMEOUT_MS, 10);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS;
}

function requestDecision(payload, env) {
  env = env || process.env;
  return new Promise((resolve) => {
    let settled = false;
    const done = (d) => { if (!settled) { settled = true; resolve(d); } };

    const token = readTrimmed(path.join(orbitHome(env), "claude-hook-token"));
    if (!token) return done("ask");

    let body;
    try { body = Buffer.from(JSON.stringify(payload), "utf8"); } catch { return done("ask"); }

    const req = http.request(
      {
        host: "127.0.0.1",
        port: resolvePort(env),
        path: "/permission",
        method: "POST",
        agent: false,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": body.length,
          "x-orbit-token": token,
        },
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (c) => { if (text.length < 65536) text += c; });
        res.on("error", () => done("ask"));
        res.on("end", () => {
          if (res.statusCode !== 200) return done("ask");
          try {
            const d = JSON.parse(text).decision;
            done(d === "allow" || d === "deny" ? d : "ask");
          } catch { done("ask"); }
        });
      }
    );
    req.on("error", () => done("ask"));
    const timer = setTimeout(() => { done("ask"); req.destroy(); }, resolveTimeout(env));
    if (timer.unref) timer.unref();
    req.end(body);
  });
}

function hookOutput(decision) {
  if (decision !== "allow" && decision !== "deny") return "";
  const d = decision === "allow"
    ? { behavior: "allow" }
    : { behavior: "deny", message: i18n.t("hook.denied") };
  return JSON.stringify({ hookSpecificOutput: { hookEventName: EVENT, decision: d } });
}

function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    process.stdin.on("data", (c) => chunks.push(c));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", () => resolve(""));
  });
}

async function main() {
  let payload;
  try { payload = JSON.parse(await readStdin()); } catch { return; }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return;
  if (payload.hook_event_name && payload.hook_event_name !== EVENT) return;
  if (SKIP_TOOLS.has(payload.tool_name)) return;
  const out = hookOutput(await requestDecision(payload, process.env));
  if (out) await new Promise((r) => process.stdout.write(out + "\n", r));
}

if (require.main === module) {
  process.on("uncaughtException", () => process.exit(0));
  process.on("unhandledRejection", () => process.exit(0));
  main().then(() => process.exit(0), () => process.exit(0));
}

module.exports = { requestDecision, hookOutput, resolvePort, orbitHome, EVENT };
