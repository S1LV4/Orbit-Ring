#!/usr/bin/env node

const http = require("http");
const fs = require("fs");
const path = require("path");
const { requestDecision, resolvePort, orbitHome } = require("./orbit-permission-hook.js");

function health(env) {
  return new Promise((resolve) => {
    let token = "";
    try { token = fs.readFileSync(path.join(orbitHome(env), "claude-hook-token"), "utf8").trim(); } catch {}
    if (!token) return resolve({ ok: false, why: "token não encontrado em " + path.join(orbitHome(env), "claude-hook-token") });
    const req = http.request(
      { host: "127.0.0.1", port: resolvePort(env), path: "/health", method: "GET", agent: false, headers: { "x-orbit-token": token } },
      (res) => {
        let text = "";
        res.on("data", (c) => { text += c; });
        res.on("end", () => {
          if (res.statusCode !== 200) return resolve({ ok: false, why: `HTTP ${res.statusCode}` });
          try { resolve(JSON.parse(text)); } catch { resolve({ ok: false, why: "resposta inválida" }); }
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
  console.log(`Serviço de aprovações OK em http://127.0.0.1:${port} — ${h.pending} pedido(s) pendente(s).`);
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
      ? { command: detail, description: "Pedido de teste do OrbitRing" }
      : { file_path: path.resolve(detail) },
  };

  console.log(`Pedido enviado: ${tool}: ${detail}`);
  console.log("Veja o aviso ao lado do cursor, abra o ring e escolha Aprovar ou Recusar (60 s)…");
  const decision = await requestDecision(payload, env);
  const text = decision === "allow" ? "APROVADO (allow)"
    : decision === "deny" ? "RECUSADO (deny)"
    : "SEM RESPOSTA (ask) — o Claude Code mostraria o prompt normal no terminal";
  console.log(`Decisão: ${text}`);
}

main().catch((e) => { console.error(e && e.message); process.exit(1); });
