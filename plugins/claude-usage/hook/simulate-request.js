#!/usr/bin/env node

const http = require("http");
const fs = require("fs");
const path = require("path");
const { requestDecision, resolvePort, orbitHome } = require("./orbit-permission-hook.js");
const i18n = require("../i18n")(require("path").join(__dirname, ".."));
if (!process.env.ORBIT_PLUGIN_LOCALE) i18n.setLocale(Intl.DateTimeFormat().resolvedOptions().locale);

function health(env) {
  return new Promise((resolve) => {
    let token = "";
    try { token = fs.readFileSync(path.join(orbitHome(env), "claude-hook-token"), "utf8").trim(); } catch {}
    if (!token) return resolve({ ok: false, why: i18n.t("simulate.noToken", { path: path.join(orbitHome(env), "claude-hook-token") }) });
    const req = http.request(
      { host: "127.0.0.1", port: resolvePort(env), path: "/health", method: "GET", agent: false, headers: { "x-orbit-token": token } },
      (res) => {
        let text = "";
        res.on("data", (c) => { text += c; });
        res.on("end", () => {
          if (res.statusCode !== 200) return resolve({ ok: false, why: `HTTP ${res.statusCode}` });
          try { resolve(JSON.parse(text)); } catch { resolve({ ok: false, why: i18n.t("simulate.badAnswer") }); }
        });
      }
    );
    req.on("error", (e) => resolve({ ok: false, why: e.code || e.message }));
    req.setTimeout(3000, () => req.destroy(new Error("timeout")));
    req.end();
  });
}

async function main() {
  const env = process.env;
  const args = process.argv.slice(2);
  const port = resolvePort(env);

  const h = await health(env);
  if (!h.ok) {
    console.error(`O serviço de aprovações não respondeu em http://127.0.0.1:${port} (${h.why}).`);
    console.error("O OrbitRing está aberto e o plugin \"Claude Code\" foi carregado? (reinicie o app depois de atualizar o plugin)");
    process.exit(1);
  }
  console.log(i18n.t("simulate.serviceOk", { port, count: h.pending }));
  if (args[0] === "--health") return;

  const tool = args[0] || "Bash";
  const detail = args.slice(1).join(" ") || (tool === "Bash" ? "npm test" : "src/app.ts");
  const payload = {
    session_id: "orbit-simulate",
    transcript_path: "",
    cwd: process.cwd(),
    permission_mode: "default",
    hook_event_name: "PermissionRequest",
    tool_name: tool,
    tool_input: tool === "Bash"
      ? { command: detail, description: i18n.t("simulate.description") }
      : { file_path: path.resolve(detail) },
  };

  console.log(i18n.t("simulate.sent", { tool, detail }));
  console.log(i18n.t("simulate.instructions"));
  const decision = await requestDecision(payload, env);
  const text = decision === "allow" ? i18n.t("simulate.allowed")
    : decision === "deny" ? i18n.t("simulate.denied")
    : i18n.t("simulate.noAnswer");
  console.log(i18n.t("simulate.decision", { text }));
}

main().catch((e) => { console.error(e && e.message); process.exit(1); });
