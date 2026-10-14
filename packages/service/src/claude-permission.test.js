process.env.ORBIT_PLUGIN_LOCALE = "pt-BR";

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const PLUGIN_DIR = path.resolve(__dirname, "../../../plugins/claude-usage");
const HOOK = path.join(PLUGIN_DIR, "hook", "orbit-permission-hook.js");
const INSTALLER = path.join(PLUGIN_DIR, "hook", "install-hook.js");
const PLUGIN_ID = "com.orbitring.claude-usage";
const ENV_KEYS = ["ORBIT_HOME", "ORBIT_CLAUDE_PORT", "ORBIT_CLAUDE_TIMEOUT_MS", "ORBIT_CLAUDE_HOOK_TIMEOUT_MS"];

const savedEnv = {};
let home, plugin, host, port, token, logSpy;

function hookInput(tool = "Bash", toolInput = { command: "npm test", description: "Run the tests" }) {
  return {
    session_id: "sess-1",
    transcript_path: "/tmp/t.jsonl",
    cwd: "C:\\proj",
    permission_mode: "default",
    hook_event_name: "PermissionRequest",
    tool_name: tool,
    tool_input: toolInput,
  };
}

function makeHost() {
  const h = {
    stateChanges: 0,
    calls: [],
    items: new Map(),
    stateChanged() { h.stateChanges++; },
    attention(item) {
      h.calls.push(item);
      if (item === null) h.items.clear(); else h.items.set(item.id, item);
    },
    clearAttention(id) { h.calls.push({ clear: id }); h.items.delete(id); },
    getClaudeUsage: async () => ({ available: false, reason: "no_credentials" }),
  };
  return h;
}

function call(method, urlPath, { body, headers = {}, usePort = port } = {}) {
  let req;
  const p = new Promise((resolve, reject) => {
    const data = body === undefined ? null : Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
    req = http.request(
      { host: "127.0.0.1", port: usePort, path: urlPath, method, agent: false,
        headers: { ...(data ? { "Content-Type": "application/json", "Content-Length": data.length } : {}), ...headers } },
      (res) => {
        let text = "";
        res.on("data", (c) => { text += c; });
        res.on("end", () => {
          let json = null;
          try { json = JSON.parse(text); } catch {}
          resolve({ status: res.statusCode, json });
        });
      }
    );
    req.on("error", reject);
    req.end(data || undefined);
  });
  p.req = req;
  return p;
}

const auth = () => ({ "x-orbit-token": token });
const postPermission = (payload = hookInput(), headers = auth()) => call("POST", "/permission", { body: payload, headers });

async function waitFor(fn, what = "condition", ms = 3000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

const pending = () => plugin._internals.getPendingPermissions();
const waitPending = (n) => waitFor(() => pending().length === n, `${n} pending request(s)`);

async function loadPlugin(env = {}) {
  process.env.ORBIT_HOME = home;
  process.env.ORBIT_CLAUDE_PORT = "0";
  Object.assign(process.env, env);
  jest.resetModules();
  plugin = require(path.join(PLUGIN_DIR, "index.js"));
  host = makeHost();
  await plugin.onLoad(host);
  port = plugin._internals.getPermissionPort();
  token = fs.existsSync(path.join(home, "claude-hook-token"))
    ? fs.readFileSync(path.join(home, "claude-hook-token"), "utf8").trim() : "";
}

function run(file, args, { stdin, env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const cp = spawn(process.execPath, [file, ...args], { env: { ...process.env, ...env }, windowsHide: true });
    let stdout = "", stderr = "";
    cp.stdout.on("data", (c) => { stdout += c; });
    cp.stderr.on("data", (c) => { stderr += c; });
    cp.on("error", reject);
    cp.on("close", (code) => resolve({ code, stdout, stderr }));
    cp.stdin.on("error", () => {});
    cp.stdin.end(stdin === undefined ? "" : stdin);
  });
}

beforeAll(() => { for (const k of ENV_KEYS) savedEnv[k] = process.env[k]; });

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-claude-test-"));
  logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  plugin = null;
});

afterEach(async () => {
  if (plugin) await plugin.onUnload();
  logSpy.mockRestore();
  for (const k of ENV_KEYS) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; }
  fs.rmSync(home, { recursive: true, force: true });
});

describe("pedido de confirmação → decisão pelo ring", () => {
  test("pedido → approve → resposta HTTP allow; estado e atenção acendem e depois limpam", async () => {
    await loadPlugin();
    expect(plugin.getState().approve).toEqual({ active: false, label: "Claude · nada pendente" });
    expect(plugin.getState().decline).toEqual({ active: false, label: "Claude · nada pendente" });

    const before = host.stateChanges;
    const response = postPermission();
    await waitPending(1);

    expect(pending()[0]).toMatchObject({ tool: "Bash", summary: "Bash: npm test", cwd: "C:\\proj", sessionId: "sess-1" });
    expect(typeof pending()[0].id).toBe("string");
    expect(typeof pending()[0].receivedAt).toBe("number");

    const st = plugin.getState();
    expect(st.approve).toEqual({ active: true, status: "amber", text: undefined, label: "Aprovar · Bash: npm test" });
    expect(st.decline).toEqual({ active: true, status: "red", label: "Recusar · Bash: npm test" });
    expect(host.stateChanges).toBeGreaterThan(before);

    expect(host.items.size).toBe(1);
    const [item] = host.items.values();
    expect(item).toMatchObject({
      title: "Claude pede confirmação",
      text: "Bash: npm test",
      pluginId: PLUGIN_ID,
      actionIds: ["approve", "decline"],
    });
    expect(item.timeoutMs).toBeGreaterThan(0);

    const changesWhilePending = host.stateChanges;
    const result = await plugin.onAction("approve");
    expect(result).toMatchObject({ handled: true, decision: "allow", request: { summary: "Bash: npm test" } });

    await expect(response).resolves.toEqual({ status: 200, json: { decision: "allow" } });
    expect(pending()).toHaveLength(0);
    expect(host.items.size).toBe(0);
    expect(host.stateChanges).toBeGreaterThan(changesWhilePending);
    expect(plugin.getState().approve).toEqual({ active: false, label: "Claude · nada pendente" });
    expect(plugin.getState()).toHaveProperty("show_usage");
    expect(plugin.getState()).toHaveProperty("usage_gauge");
  });

  test("pedido → decline → resposta HTTP deny", async () => {
    await loadPlugin();
    const response = postPermission(hookInput("Edit", { file_path: "C:\\proj\\src\\app.ts", old_string: "a", new_string: "b" }));
    await waitPending(1);
    expect(plugin.getState().decline.label).toBe("Recusar · Edit: src/app.ts");

    const result = await plugin.onAction("decline");
    expect(result).toMatchObject({ handled: true, decision: "deny" });
    await expect(response).resolves.toEqual({ status: 200, json: { decision: "deny" } });
    expect(pending()).toHaveLength(0);
    expect(host.items.size).toBe(0);
  });

  test("sem resposta até o timeout → ask (Claude Code mostra o prompt normal)", async () => {
    await loadPlugin({ ORBIT_CLAUDE_TIMEOUT_MS: "120" });
    const started = Date.now();
    const res = await postPermission();
    expect(res).toEqual({ status: 200, json: { decision: "ask" } });
    expect(Date.now() - started).toBeGreaterThanOrEqual(100);
    expect(pending()).toHaveLength(0);
    expect(host.items.size).toBe(0);
    expect(plugin.getState().approve.active).toBe(false);
  });

  test("dois pedidos na fila: resolve o mais antigo primeiro e mostra a contagem", async () => {
    await loadPlugin();
    const first = postPermission(hookInput("Bash", { command: "npm test" }));
    await waitPending(1);
    const second = postPermission(hookInput("Bash", { command: "git push" }));
    await waitPending(2);

    expect(plugin.getState().approve).toMatchObject({ active: true, text: "2", label: "Aprovar · Bash: npm test" });
    expect(host.items.size).toBe(1);
    const firstCueId = [...host.items.keys()][0];
    expect([...host.items.values()][0].text).toBe("Bash: npm test");

    await plugin.onAction("decline");
    await expect(first).resolves.toEqual({ status: 200, json: { decision: "deny" } });
    expect(pending().map((p) => p.summary)).toEqual(["Bash: git push"]);

    expect(host.items.size).toBe(1);
    expect([...host.items.keys()][0]).not.toBe(firstCueId);
    expect([...host.items.values()][0].text).toBe("Bash: git push");
    expect(plugin.getState().approve).toEqual({ active: true, status: "amber", text: undefined, label: "Aprovar · Bash: git push" });

    await plugin.onAction("approve");
    await expect(second).resolves.toEqual({ status: 200, json: { decision: "allow" } });
    expect(host.items.size).toBe(0);
  });

  test("approve / decline sem nada pendente não fazem nada: { handled:false }", async () => {
    await loadPlugin();
    await expect(plugin.onAction("approve")).resolves.toEqual({ handled: false });
    await expect(plugin.onAction("decline")).resolves.toEqual({ handled: false });
    expect(host.calls).toHaveLength(0);
  });

  test("cliente desconecta (respondido no terminal) → o pedido é descartado", async () => {
    await loadPlugin();
    const response = postPermission();
    response.catch(() => {});
    await waitPending(1);
    expect(host.items.size).toBe(1);

    response.req.destroy();
    await waitPending(0);
    expect(host.items.size).toBe(0);
    expect(plugin.getState().approve).toEqual({ active: false, label: "Claude · nada pendente" });
    await expect(plugin.onAction("approve")).resolves.toEqual({ handled: false });
  });

  test("resumo curto e truncado em ~60 caracteres", async () => {
    await loadPlugin();
    const long = "node scripts/build.js --target production --minify --sourcemap --out dist/bundle.js";
    const response = postPermission(hookInput("Bash", { command: long }));
    await waitPending(1);
    const { summary } = pending()[0];
    expect(Array.from(summary).length).toBeLessThanOrEqual(60);
    expect(summary.startsWith("Bash: node scripts/build.js")).toBe(true);
    expect(summary.endsWith("…")).toBe(true);
    await plugin.onAction("approve");
    await response;
  });

  test("funciona sem host.attention (serviço antigo) e sem host nenhum", async () => {
    await loadPlugin();
    await plugin.onUnload();
    jest.resetModules();
    plugin = require(path.join(PLUGIN_DIR, "index.js"));
    let changes = 0;
    await plugin.onLoad({ stateChanged() { changes++; }, getClaudeUsage: async () => ({ available: false, reason: "no_credentials" }) });
    port = plugin._internals.getPermissionPort();

    const response = postPermission();
    await waitPending(1);
    expect(plugin.getState().approve.active).toBe(true);
    expect(changes).toBeGreaterThan(0);
    await plugin.onAction("approve");
    await expect(response).resolves.toEqual({ status: 200, json: { decision: "allow" } });
  });
});

describe("servidor HTTP local", () => {
  test("escuta só em 127.0.0.1 e cria o token (>= 32 caracteres) no ORBIT_HOME", async () => {
    await loadPlugin();
    expect(port).toBeGreaterThan(0);
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(fs.readFileSync(path.join(home, "claude-hook-port"), "utf8").trim()).toBe(String(port));
    expect(logSpy.mock.calls.flat().join(" ")).not.toContain(token);
  });

  test("o token é reaproveitado entre cargas do plugin", async () => {
    await loadPlugin();
    const first = token;
    await plugin.onUnload();
    await loadPlugin();
    expect(token).toBe(first);
  });

  test("sem token ou com token errado → 401, nada entra na fila", async () => {
    await loadPlugin();
    await expect(postPermission(hookInput(), {})).resolves.toMatchObject({ status: 401 });
    await expect(postPermission(hookInput(), { "x-orbit-token": "x".repeat(token.length) })).resolves.toMatchObject({ status: 401 });
    await expect(postPermission(hookInput(), { "x-orbit-token": "nope" })).resolves.toMatchObject({ status: 401 });
    await expect(call("GET", "/health")).resolves.toMatchObject({ status: 401 });
    expect(pending()).toHaveLength(0);
    expect(host.calls).toHaveLength(0);
  });

  test("requisição com header Origin (navegador) → rejeitada mesmo com o token certo", async () => {
    await loadPlugin();
    const res = await postPermission(hookInput(), { ...auth(), Origin: "http://evil.example" });
    expect(res.status).toBe(403);
    await expect(call("GET", "/health", { headers: { ...auth(), Origin: "null" } })).resolves.toMatchObject({ status: 403 });
    expect(pending()).toHaveLength(0);
  });

  test("GET /health → { ok:true, pending:n }", async () => {
    await loadPlugin();
    await expect(call("GET", "/health", { headers: auth() })).resolves.toEqual({ status: 200, json: { ok: true, pending: 0 } });
    const response = postPermission();
    await waitPending(1);
    await expect(call("GET", "/health", { headers: auth() })).resolves.toEqual({ status: 200, json: { ok: true, pending: 1 } });
    await plugin.onAction("approve");
    await response;
  });

  test("JSON inválido → 400; rota desconhecida → 404; método errado → 405", async () => {
    await loadPlugin();
    await expect(call("POST", "/permission", { body: "{not json", headers: auth() })).resolves.toMatchObject({ status: 400 });
    await expect(call("POST", "/permission", { body: "[1,2]", headers: auth() })).resolves.toMatchObject({ status: 400 });
    await expect(call("GET", "/nope", { headers: auth() })).resolves.toMatchObject({ status: 404 });
    await expect(call("GET", "/permission", { headers: auth() })).resolves.toMatchObject({ status: 405 });
    expect(pending()).toHaveLength(0);
  });

  test("porta ocupada: registra, e o resto do plugin continua funcionando", async () => {
    const blocker = http.createServer();
    await new Promise((r) => blocker.listen(0, "127.0.0.1", r));
    try {
      await loadPlugin({ ORBIT_CLAUDE_PORT: String(blocker.address().port) });
      expect(plugin._internals.getPermissionPort()).toBe(0);
      const st = plugin.getState();
      expect(st.approve).toEqual({ active: false, label: "Claude · aprovações indisponíveis (porta ocupada)" });
      expect(st).toHaveProperty("show_usage");
      await expect(plugin.onAction("approve")).resolves.toEqual({ handled: false });
      expect(logSpy.mock.calls.flat().join(" ")).toMatch(/porta \d+ indisponível/);
    } finally {
      await new Promise((r) => blocker.close(r));
    }
  });

  test("onUnload responde ask ao que estava pendente e limpa a atenção", async () => {
    await loadPlugin();
    const response = postPermission();
    await waitPending(1);
    await plugin.onUnload();
    await expect(response).resolves.toEqual({ status: 200, json: { decision: "ask" } });
    expect(host.items.size).toBe(0);
    plugin = null;
  });
});

describe("hook/orbit-permission-hook.js de ponta a ponta", () => {
  const hookEnv = (extra = {}) => ({ ORBIT_HOME: home, ORBIT_CLAUDE_PORT: "", ...extra });

  test("approve → imprime o JSON documentado de allow, exit 0", async () => {
    await loadPlugin();
    const child = run(HOOK, [], { stdin: JSON.stringify(hookInput()), env: hookEnv() });
    await waitPending(1);
    await plugin.onAction("approve");
    const { code, stdout } = await child;
    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toEqual({
      hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "allow" } },
    });
  });

  test("decline → imprime o JSON documentado de deny (com message), exit 0", async () => {
    await loadPlugin();
    const child = run(HOOK, [], { stdin: JSON.stringify(hookInput()), env: hookEnv() });
    await waitPending(1);
    await plugin.onAction("decline");
    const { code, stdout } = await child;
    expect(code).toBe(0);
    const out = JSON.parse(stdout);
    expect(out.hookSpecificOutput.hookEventName).toBe("PermissionRequest");
    expect(out.hookSpecificOutput.decision.behavior).toBe("deny");
    expect(typeof out.hookSpecificOutput.decision.message).toBe("string");
    expect(Object.keys(out)).toEqual(["hookSpecificOutput"]);
  });

  test("ask (timeout do plugin) → não imprime nada, exit 0", async () => {
    await loadPlugin({ ORBIT_CLAUDE_TIMEOUT_MS: "150" });
    const res = await run(HOOK, [], { stdin: JSON.stringify(hookInput()), env: hookEnv() });
    expect(res).toMatchObject({ code: 0, stdout: "" });
  });

  test("serviço fora do ar → não imprime nada, exit 0", async () => {
    await loadPlugin();
    const deadPort = port;
    await plugin.onUnload();
    plugin = null;
    const res = await run(HOOK, [], { stdin: JSON.stringify(hookInput()), env: hookEnv({ ORBIT_CLAUDE_PORT: String(deadPort) }) });
    expect(res).toMatchObject({ code: 0, stdout: "" });
  });

  test("timeout do próprio hook → não imprime nada, exit 0, e o pedido sai da fila", async () => {
    await loadPlugin();
    const res = await run(HOOK, [], { stdin: JSON.stringify(hookInput()), env: hookEnv({ ORBIT_CLAUDE_HOOK_TIMEOUT_MS: "200" }) });
    expect(res).toMatchObject({ code: 0, stdout: "" });
    await waitPending(0);
    expect(host.items.size).toBe(0);
  });

  test("sem token, stdin inválido, outro evento ou AskUserQuestion → silêncio, exit 0", async () => {
    await loadPlugin();
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-claude-empty-"));
    try {
      const noToken = await run(HOOK, [], { stdin: JSON.stringify(hookInput()), env: hookEnv({ ORBIT_HOME: empty, ORBIT_CLAUDE_PORT: String(port) }) });
      expect(noToken).toMatchObject({ code: 0, stdout: "" });
    } finally { fs.rmSync(empty, { recursive: true, force: true }); }

    await expect(run(HOOK, [], { stdin: "not json", env: hookEnv() })).resolves.toMatchObject({ code: 0, stdout: "" });
    await expect(run(HOOK, [], { stdin: "", env: hookEnv() })).resolves.toMatchObject({ code: 0, stdout: "" });
    const other = { ...hookInput(), hook_event_name: "PreToolUse" };
    await expect(run(HOOK, [], { stdin: JSON.stringify(other), env: hookEnv() })).resolves.toMatchObject({ code: 0, stdout: "" });
    const question = hookInput("AskUserQuestion", { questions: [] });
    await expect(run(HOOK, [], { stdin: JSON.stringify(question), env: hookEnv() })).resolves.toMatchObject({ code: 0, stdout: "" });
    expect(pending()).toHaveLength(0);
    expect(host.calls).toHaveLength(0);
  });
});

describe("hook/install-hook.js", () => {
  const ours = (settings) => (settings.hooks?.PermissionRequest || [])
    .flatMap((g) => g.hooks || []).filter((h) => String(h.command).includes("orbit-permission-hook.js"));
  const backups = (file) => fs.readdirSync(path.dirname(file)).filter((f) => f.startsWith(path.basename(file) + ".orbit-backup-"));
  const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

  const existing = {
    model: "opus",
    permissions: { allow: ["Bash(npm test)"] },
    hooks: {
      PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo pre" }] }],
      PermissionRequest: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo mine" }] }],
    },
  };

  test("sem --yes só mostra o que mudaria; com --yes grava, faz backup e é idempotente", async () => {
    const file = path.join(home, "settings.json");
    fs.writeFileSync(file, JSON.stringify(existing, null, 2));
    const original = fs.readFileSync(file, "utf8");

    const dry = await run(INSTALLER, ["--settings", file]);
    expect(dry.code).toBe(0);
    expect(dry.stdout).toMatch(/nada foi gravado/i);
    expect(dry.stdout).toContain("orbit-permission-hook.js");
    expect(fs.readFileSync(file, "utf8")).toBe(original);
    expect(backups(file)).toHaveLength(0);

    const first = await run(INSTALLER, ["--settings", file, "--yes"]);
    expect(first.code).toBe(0);
    const after = read(file);
    expect(ours(after)).toHaveLength(1);
    expect(ours(after)[0]).toMatchObject({ type: "command", timeout: 75 });
    expect(ours(after)[0].command).toMatch(/^node ".*\/hook\/orbit-permission-hook\.js"$/);
    expect(ours(after)[0].command).not.toContain("\\");
    expect(after.model).toBe("opus");
    expect(after.permissions).toEqual(existing.permissions);
    expect(after.hooks.PreToolUse).toEqual(existing.hooks.PreToolUse);
    expect(after.hooks.PermissionRequest[0]).toEqual(existing.hooks.PermissionRequest[0]);
    expect(backups(file)).toHaveLength(1);
    expect(fs.readFileSync(path.join(home, backups(file)[0]), "utf8")).toBe(original);

    const written = fs.readFileSync(file, "utf8");
    const second = await run(INSTALLER, ["--settings", file, "--yes"]);
    expect(second.code).toBe(0);
    expect(second.stdout).toMatch(/já está instalado/);
    expect(fs.readFileSync(file, "utf8")).toBe(written);
    expect(ours(read(file))).toHaveLength(1);
    expect(backups(file)).toHaveLength(1);
  });

  test("--uninstall --yes remove só o nosso hook; rodar de novo não muda nada", async () => {
    const file = path.join(home, "settings.json");
    fs.writeFileSync(file, JSON.stringify(existing, null, 2));
    await run(INSTALLER, ["--settings", file, "--yes"]);
    expect(ours(read(file))).toHaveLength(1);

    const dry = await run(INSTALLER, ["--settings", file, "--uninstall"]);
    expect(dry.stdout).toMatch(/nada foi gravado/i);
    expect(ours(read(file))).toHaveLength(1);

    const un = await run(INSTALLER, ["--settings", file, "--uninstall", "--yes"]);
    expect(un.code).toBe(0);
    expect(read(file)).toEqual(existing);

    const again = await run(INSTALLER, ["--settings", file, "--uninstall", "--yes"]);
    expect(again.code).toBe(0);
    expect(again.stdout).toMatch(/não está instalado/);
    expect(read(file)).toEqual(existing);
  });

  test("arquivo inexistente: cria com --yes; desinstalar deixa {}", async () => {
    const file = path.join(home, "nested", "settings.json");
    await run(INSTALLER, ["--settings", file]);
    expect(fs.existsSync(file)).toBe(false);

    await run(INSTALLER, ["--settings", file, "--yes"]);
    expect(Object.keys(read(file))).toEqual(["hooks"]);
    expect(read(file).hooks.PermissionRequest).toHaveLength(1);
    expect(read(file).hooks.PermissionRequest[0].matcher).toBe("*");

    await run(INSTALLER, ["--settings", file, "--uninstall", "--yes"]);
    expect(read(file)).toEqual({});
  });

  test("settings.json inválido → erro, arquivo intocado", async () => {
    const file = path.join(home, "settings.json");
    fs.writeFileSync(file, "{ // comentário\n \"a\": 1 }");
    const res = await run(INSTALLER, ["--settings", file, "--yes"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/nada foi alterado/);
    expect(fs.readFileSync(file, "utf8")).toBe("{ // comentário\n \"a\": 1 }");
    expect(backups(file)).toHaveLength(0);
  });
});

describe("PluginLoader: host.attention() → lista de atenção do serviço", () => {
  function loadPluginLoader() {
    const out = path.join(home, "plugin-loader.compiled.js");
    require("esbuild").buildSync({ entryPoints: [path.join(__dirname, "plugin-loader.ts")], bundle: true, platform: "node", format: "cjs", target: "node18", outfile: out, logLevel: "silent" });
    return require(out).PluginLoader;
  }

  test("pedido → atenção publicada com pluginId; approve pela ação do plugin → allow e lista vazia", async () => {
    const pluginsDir = path.join(home, "plugins");
    const dest = path.join(pluginsDir, "claude-usage");
    fs.cpSync(PLUGIN_DIR, dest, { recursive: true });

    process.env.ORBIT_HOME = home;
    process.env.ORBIT_CLAUDE_PORT = "0";
    const PluginLoader = loadPluginLoader();
    const loader = new PluginLoader({
      pluginsDir,
      locale: "pt-BR",
      hostServices: { getClaudeUsage: async () => ({ available: false, reason: "no_credentials" }) },
    });
    const broadcasts = [];
    let stateChanges = 0;
    loader.onAttentionChanged((items) => broadcasts.push(items));
    loader.onStateChanged(() => { stateChanges++; });

    try {
      await loader.loadAll();
      const info = loader.getPlugins().find((p) => p.id === PLUGIN_ID);
      expect(info.name).toBe("Claude Code");
      expect(info.actions.map((a) => a.id)).toEqual(["show_usage", "usage_gauge", "approve", "decline"]);
      expect(loader.getAttention()).toEqual([]);

      port = Number(fs.readFileSync(path.join(home, "claude-hook-port"), "utf8"));
      token = fs.readFileSync(path.join(home, "claude-hook-token"), "utf8").trim();

      const first = postPermission(hookInput("Bash", { command: "npm test" }));
      await waitFor(() => loader.getAttention().length === 1, "attention item");
      const second = postPermission(hookInput("Bash", { command: "git push" }));
      await waitFor(() => loader.getPluginStates()[PLUGIN_ID].approve.text === "2", "count badge");

      expect(loader.getAttention()).toHaveLength(1);
      expect(loader.getAttention()[0]).toMatchObject({
        title: "Claude pede confirmação", text: "Bash: npm test", pluginId: PLUGIN_ID, actionIds: ["approve", "decline"],
      });
      expect(loader.getPluginStates()[PLUGIN_ID].approve).toEqual({ active: true, status: "amber", text: "2", label: "Aprovar · Bash: npm test" });
      expect(loader.getPluginStates()[PLUGIN_ID].decline).toEqual({ active: true, status: "red", label: "Recusar · Bash: npm test" });
      expect(stateChanges).toBeGreaterThan(0);

      await expect(loader.executePluginAction(PLUGIN_ID, "approve")).resolves.toMatchObject({ handled: true, decision: "allow" });
      await expect(first).resolves.toEqual({ status: 200, json: { decision: "allow" } });
      expect(loader.getAttention()).toHaveLength(1);
      expect(loader.getAttention()[0].text).toBe("Bash: git push");

      await expect(loader.executePluginAction(PLUGIN_ID, "decline")).resolves.toMatchObject({ handled: true, decision: "deny" });
      await expect(second).resolves.toEqual({ status: 200, json: { decision: "deny" } });
      expect(loader.getAttention()).toEqual([]);
      expect(broadcasts[broadcasts.length - 1]).toEqual([]);
      expect(loader.getPluginStates()[PLUGIN_ID].approve).toEqual({ active: false, label: "Claude · nada pendente" });
    } finally {
      await loader.unloadAll();
    }
  });

  test("itens inválidos são ignorados; null limpa; o timeout do serviço remove sozinho", async () => {
    const pluginsDir = path.join(home, "plugins");
    const dest = path.join(pluginsDir, "fake");
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, "manifest.json"), JSON.stringify({ id: "test.fake", name: "Fake", version: "1", author: "t", description: "", main: "index.js", actions: [] }));
    fs.writeFileSync(path.join(dest, "index.js"), "module.exports = { onLoad(h) { global.__fakeHost = h; } };");
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const PluginLoader = loadPluginLoader();
    const loader = new PluginLoader({ pluginsDir });
    try {
      await loader.loadAll();
      const h = global.__fakeHost;
      h.attention({ title: "sem id" });
      h.attention({ id: "x" });
      expect(loader.getAttention()).toEqual([]);

      h.attention({ id: "a", title: "A", pluginId: "someone.else", actionIds: ["go", 3] });
      h.attention({ id: "b", title: "B", timeoutMs: 60 });
      expect(loader.getAttention().map((i) => i.id)).toEqual(["a", "b"]);
      expect(loader.getAttention()[0]).toMatchObject({ pluginId: "test.fake", actionIds: ["go"] });

      h.attention({ id: "a", title: "A2" });
      expect(loader.getAttention().map((i) => i.title)).toEqual(["A2", "B"]);

      await waitFor(() => loader.getAttention().length === 1, "service-side timeout");
      expect(loader.getAttention()[0].id).toBe("a");

      h.clearAttention("nope");
      expect(loader.getAttention()).toHaveLength(1);
      h.attention(null);
      expect(loader.getAttention()).toEqual([]);
    } finally {
      await loader.unloadAll();
      warn.mockRestore();
      delete global.__fakeHost;
    }
  });
});
