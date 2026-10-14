process.env.ORBIT_PLUGIN_LOCALE = "pt-BR";

const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const https = require("https");
const crypto = require("crypto");

const PLUGIN_DIR = path.resolve(__dirname, "../../../plugins/antigravity-usage");
const T0 = Date.parse("2026-09-20T08:00:00Z");
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const iso = (ms) => new Date(ms).toISOString();
const CSRF = "11111111-2222-3333-4444-555555555555";
const EMAIL = "ada.lovelace@example.com";

let plugin, host, clock, tmp, cacheFile, toasts, logSpy, errSpy, warnSpy;

function makeHost() {
  const h = { stateChanges: 0, actionChanges: 0, stateChanged() { h.stateChanges++; }, actionsChanged() { h.actionChanges++; } };
  return h;
}

function serverRow(over = {}) {
  return {
    pid: 4321,
    name: "language_server_windows_x64.exe",
    cmd: `"C:\\Users\\Ana Maria\\AppData\\Local\\Programs\\Antigravity\\resources\\app\\extensions\\antigravity\\bin\\language_server_windows_x64.exe" --enable_lsp --csrf_token ${CSRF} --extension_server_port 53021 --extension_server_csrf_token 99999999-aaaa-bbbb --random_port --app_data_dir antigravity`,
    ports: [53050, 53100],
    ...over,
  };
}

const summaryBody = (g5 = 0.58, gw = 0.82, o5 = 0.25, ow = 0.6) => ({
  response: { groups: [
    { displayName: "Gemini Models", buckets: [
      { bucketId: "gemini-weekly", displayName: "Weekly Limit Remaining", remainingFraction: gw, resetTime: iso(T0 + 4 * DAY + 2 * HOUR) },
      { bucketId: "gemini-5h", displayName: "Five Hour Limit Remaining", remainingFraction: g5, resetTime: iso(T0 + 130 * 60_000) },
    ] },
    { displayName: "Claude and GPT models", buckets: [
      { bucketId: "3p-weekly", remainingFraction: ow, resetTime: iso(T0 + 6 * DAY) },
      { bucketId: "3p-5h", remainingFraction: o5, resetTime: iso(T0 + 4 * HOUR) },
    ] },
  ] },
});

const statusBody = (email = EMAIL, plan = "Pro") => ({
  userStatus: {
    name: "Ada Lovelace", email,
    planStatus: { planInfo: { planName: plan } },
    cascadeModelConfigData: { clientModelConfigs: [
      { label: "Gemini 3 Pro (High)", quotaInfo: { remainingFraction: 0.7, resetTime: iso(T0 + 3 * HOUR) } },
      { label: "Gemini 3 Flash", quotaInfo: { remainingFraction: 0.95, resetTime: iso(T0 + 3 * HOUR) } },
      { label: "Claude Sonnet 4.5", quotaInfo: { remainingFraction: 0.1, resetTime: iso(T0 + 4 * HOUR) } },
    ] },
  },
});

function fakeRpc(routes) {
  const calls = [];
  const request = async ({ port, scheme, method, token }) => {
    calls.push(`${scheme}:${port}:${method}`);
    request.tokens.add(token);
    const route = routes[`${scheme}:${port}`];
    return route ? route(method, token) : { error: "network" };
  };
  request.calls = calls;
  request.tokens = new Set();
  return request;
}

const modern = (summary = summaryBody(), status = statusBody()) => (method) =>
  method === "RetrieveUserQuotaSummary" ? { status: 200, body: summary } : { status: 200, body: status };
const legacy = (status = statusBody()) => (method) =>
  method === "RetrieveUserQuotaSummary" ? { status: 404, body: null } : { status: 200, body: status };

async function load(deps = {}) {
  jest.resetModules();
  plugin = require(path.join(PLUGIN_DIR, "index.js"));
  plugin.__test.configure({
    now: () => clock,
    platform: "win32",
    cacheFile,
    locator: { discover: async () => [], reset() {} },
    showToast: (title, message) => toasts.push({ title, message }),
    listProcesses: async () => [],
    ...deps,
  });
  host = makeHost();
  plugin.onLoad(host);
  await plugin.__test.refresh(false);
  return plugin;
}

beforeEach(() => {
  clock = T0;
  toasts = [];
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-agy-test-"));
  cacheFile = path.join(tmp, "plugin-data", "antigravity-usage.json");
  logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  plugin = null;
});

afterEach(() => {
  if (plugin) plugin.onUnload();
  logSpy.mockRestore(); errSpy.mockRestore(); warnSpy.mockRestore();
  fs.rmSync(tmp, { recursive: true, force: true });
});

function everythingVisible() {
  const logs = [logSpy, errSpy, warnSpy].flatMap((s) => s.mock.calls.map((c) => c.map(String).join(" ")));
  const cache = fs.existsSync(cacheFile) ? fs.readFileSync(cacheFile, "utf8") : "";
  return [JSON.stringify(plugin.getState()), JSON.stringify(plugin.getActions()), JSON.stringify(plugin.__test.summary()),
    JSON.stringify(toasts), logs.join("\n"), cache].join("\n");
}

describe("manifesto", () => {
  test("id, ações estáveis e ícones no formato do ring", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN_DIR, "manifest.json"), "utf8"));
    expect(manifest.id).toBe("com.orbitring.antigravity");
    expect(manifest.name).toBe("Antigravity");
    expect(manifest.main).toBe("index.js");
    expect(manifest.actions.map((a) => a.id)).toEqual(["gemini", "others", "worst"]);
    expect(manifest.actions.map((a) => a.name)).toEqual(["Antigravity · Gemini", "Antigravity · Claude and GPT", "Antigravity · Usage"]);
    const pt = JSON.parse(fs.readFileSync(path.join(PLUGIN_DIR, "locales", "pt-BR.json"), "utf8")).manifest;
    expect(Object.values(pt.actions).map((a) => a.name)).toEqual(["Antigravity · Gemini", "Antigravity · Claude e GPT", "Antigravity · Uso"]);
    for (const a of manifest.actions) {
      expect(a.stateful).toBe(true);
      expect(a.icon).not.toMatch(/<svg/i);
      expect(a.icon).toMatch(/^</);
      expect(a.description.length).toBeGreaterThan(20);
    }
    for (const f of ["index.js", "quota.js", "desktop.js", "cli.js", "locations.js", "README.md"]) {
      expect(fs.existsSync(path.join(PLUGIN_DIR, f))).toBe(true);
    }
  });
});

describe("estados", () => {
  test("antes da primeira leitura: '…' / carregando", () => {
    jest.resetModules();
    plugin = require(path.join(PLUGIN_DIR, "index.js"));
    plugin.__test.configure({ now: () => clock, cacheFile, listProcesses: () => new Promise(() => {}), locator: { discover: async () => [] } });
    for (const id of ["gemini", "others", "worst"]) {
      expect(plugin.getState()[id]).toEqual({ text: "…", label: "Antigravity · carregando uso…" });
    }
  });

  test("fechado e sem cache: '–' + abra para ver o uso", async () => {
    await load();
    for (const id of ["gemini", "others", "worst"]) {
      expect(plugin.getState()[id]).toEqual({ text: "–", label: "Antigravity fechado · abra para ver o uso" });
    }
    expect(plugin.getActions()).toEqual([]);
    expect(fs.existsSync(cacheFile)).toBe(false);
    expect(host.stateChanges).toBe(1);
  });

  test("Antigravity 2.x: grupos, janela mais apertada, cores, plano e origem no balão", async () => {
    const request = fakeRpc({ "https:53100": modern() });
    await load({ listProcesses: async () => [serverRow()], request });
    const st = plugin.getState();
    expect(st.gemini).toEqual({
      value: 42, text: "42%", status: "green",
      label: "Antigravity · Windows · Gemini · 5h 42% (renova em 2h10) · semana 18% (renova em 4d 2h) · plano Pro",
    });
    expect(st.others).toEqual({
      value: 75, text: "75%", status: "amber",
      label: "Antigravity · Windows · Claude e GPT · 5h 75% (renova em 4h00) · semana 40% (renova em 6d) · plano Pro",
    });
    expect(st.worst).toEqual({
      value: 75, text: "75%", status: "amber",
      label: "Antigravity · Windows · Claude e GPT 5h 75% (renova em 4h00) · Gemini 42% · plano Pro",
    });
    for (const s of Object.values(st)) {
      expect(s.label.length).toBeLessThanOrEqual(200);
      expect(Array.from(s.text).length).toBeLessThanOrEqual(4);
    }
    expect(plugin.__test.sources().desktop.state).toBe("live");
  });

  test("vermelho acima de 85%; a ação 'worst' escolhe a janela mais apertada de qualquer grupo", async () => {
    const request = fakeRpc({ "https:53050": modern(summaryBody(0.9, 0.08, 0.5, 0.7)) });
    await load({ listProcesses: async () => [serverRow()], request });
    const st = plugin.getState();
    expect(st.gemini).toMatchObject({ value: 92, text: "92%", status: "red" });
    expect(st.gemini.label).toContain("Gemini · 5h 10% (renova em 2h10) · semana 92% (renova em 4d 2h)");
    expect(st.worst).toMatchObject({ value: 92, status: "red" });
    expect(st.worst.label).toContain("Gemini semana 92% (renova em 4d 2h) · Claude e GPT 50%");
  });

  test("versão antiga (só GetUserStatus): por modelo, agrupado, e o balão diz isso", async () => {
    const request = fakeRpc({ "https:53050": legacy() });
    await load({ listProcesses: async () => [serverRow()], request });
    const st = plugin.getState();
    expect(st.gemini).toEqual({
      value: 30, text: "30%", status: "green",
      label: "Antigravity · Windows · Gemini · 5h 30% (renova em 3h00) · por modelo (Gemini 3 Pro (High)) · plano Pro",
    });
    expect(st.others).toMatchObject({ value: 90, text: "90%", status: "red" });
    expect(st.others.label).toContain("por modelo (Claude Sonnet 4.5)");
    expect(st.worst.label).toBe("Antigravity · Windows · Claude e GPT 5h 90% (renova em 4h00) · Gemini 30% · por modelo · plano Pro");
  });

  test("janela com fração desconhecida aparece como '?' e não entra no valor", async () => {
    const summary = { groups: [{ displayName: "Gemini Models", buckets: [
      { bucketId: "gemini-5h", resetTime: iso(T0 + HOUR) },
      { bucketId: "gemini-weekly", remainingFraction: 0.75, resetTime: iso(T0 + 3 * DAY) },
    ] }] };
    await load({ listProcesses: async () => [serverRow()], request: fakeRpc({ "https:53050": modern(summary) }) });
    const st = plugin.getState();
    expect(st.gemini).toMatchObject({ value: 25, text: "25%" });
    expect(st.gemini.label).toContain("5h ? (renova em 1h00) · semana 25% (renova em 3d)");
    expect(st.others).toEqual({ text: "–", label: "Antigravity · Windows · Claude e GPT · sem dados de cota · plano Pro" });
  });
});

describe("portas", () => {
  test("ordem: cada porta em https e depois http, até uma responder; a que respondeu é lembrada", async () => {
    const request = fakeRpc({ "https:53100": modern() });
    await load({ listProcesses: async () => [serverRow()], request });
    expect(request.calls).toEqual([
      "https:53050:RetrieveUserQuotaSummary",
      "http:53050:RetrieveUserQuotaSummary",
      "https:53100:RetrieveUserQuotaSummary",
      "https:53100:GetUserStatus",
    ]);
    request.calls.length = 0;
    clock += 60_000;
    await plugin.__test.refresh(false);
    expect(request.calls).toEqual(["https:53100:RetrieveUserQuotaSummary", "https:53100:GetUserStatus"]);
    expect([...request.tokens]).toEqual([CSRF]);
  });

  test("porta que só fala http: https falha, http responde", async () => {
    const request = fakeRpc({ "http:53050": modern() });
    await load({ listProcesses: async () => [serverRow({ ports: [53050] })], request });
    expect(request.calls.slice(0, 3)).toEqual([
      "https:53050:RetrieveUserQuotaSummary", "http:53050:RetrieveUserQuotaSummary", "http:53050:GetUserStatus",
    ]);
    expect(plugin.getState().gemini.value).toBe(42);
  });

  test("porta https respondendo 400 ao http (e vice-versa) não é confundida com o servidor", async () => {
    const wrongScheme = () => ({ status: 400, body: null });
    const request = fakeRpc({ "https:53050": wrongScheme, "http:53050": wrongScheme, "http:53100": wrongScheme, "https:53100": modern() });
    await load({ listProcesses: async () => [serverRow()], request });
    expect(plugin.getState().gemini.value).toBe(42);
  });

  test("servidor antigo: depois do 404 a chamada de resumo não é repetida a cada minuto", async () => {
    const request = fakeRpc({ "https:53050": legacy() });
    await load({ listProcesses: async () => [serverRow()], request });
    expect(request.calls).toEqual(["https:53050:RetrieveUserQuotaSummary", "https:53050:GetUserStatus"]);
    request.calls.length = 0;
    clock += 60_000;
    await plugin.__test.refresh(false);
    expect(request.calls).toEqual(["https:53050:GetUserStatus"]);
  });

  test("a porta do extension server (403 com o nosso token) é a última tentativa e não derruba a leitura", async () => {
    const request = fakeRpc({ "http:53021": () => ({ status: 403, body: null }), "https:53100": modern() });
    await load({ listProcesses: async () => [serverRow()], request });
    expect(request.calls.some((c) => c.includes(":53021:"))).toBe(false);
    expect(plugin.getState().worst.value).toBe(75);
  });

  test("sem portas listadas, a --extension_server_port ainda é tentada", async () => {
    const request = fakeRpc({ "http:53021": modern() });
    await load({ listProcesses: async () => [serverRow({ ports: [] })], request });
    expect(request.calls[0]).toBe("https:53021:RetrieveUserQuotaSummary");
    expect(plugin.getState().gemini.value).toBe(42);
  });

  test("várias janelas (vários language servers) da mesma conta: uma conta só", async () => {
    const request = fakeRpc({ "https:53050": modern(), "https:54000": modern(summaryBody(0.1, 0.1, 0.1, 0.1)) });
    await load({ listProcesses: async () => [serverRow(), serverRow({ pid: 999, ports: [54000] })], request });
    expect(plugin.__test.summary().accounts).toHaveLength(1);
    expect(plugin.getState().gemini.value).toBe(42);
    expect(plugin.getState().gemini.label).not.toContain("conta");
    expect(plugin.getActions()).toEqual([]);
  });

  test("language servers de contas diferentes: pior primeiro, '+1 conta' e ações por conta", async () => {
    const request = fakeRpc({
      "https:53050": modern(summaryBody(0.9, 0.9, 0.9, 0.9), statusBody("ada@example.com", "Pro")),
      "https:54000": modern(summaryBody(0.2, 0.5, 0.95, 0.95), statusBody("grace@example.com", "Ultra")),
    });
    await load({ listProcesses: async () => [serverRow(), serverRow({ pid: 999, ports: [54000] })], request });
    const st = plugin.getState();
    expect(st.gemini).toMatchObject({ value: 80, text: "80%", status: "amber" });
    expect(st.gemini.label).toBe("Antigravity · Windows · Gemini · 5h 80% (renova em 2h10) · semana 50% (renova em 4d 2h) · plano Ultra · +1 conta");
    expect(st.others).toMatchObject({ value: 10 });
    expect(st.others.label).toContain("plano Pro · +1 conta");
    expect(host.actionChanges).toBe(1);
    const actions = plugin.getActions();
    expect(actions).toHaveLength(6);
    for (const a of actions) {
      expect(a.id).toMatch(/^(gemini|others|worst)\.[0-9a-f]{8}$/);
      expect(a.stateful).toBe(true);
      expect(st[a.id]).toBeDefined();
    }
    expect(actions.map((a) => a.name)).toEqual(expect.arrayContaining(["Antigravity · Uso · Windows (Pro)", "Antigravity · Uso · Windows (Ultra)"]));
    expect(everythingVisible()).not.toMatch(/example\.com|ada@|grace@/);
  });
});

describe("falhas do servidor local", () => {
  const cases = [
    ["401 em todas as portas", () => ({ status: 401, body: { code: "unauthenticated" } }), "Antigravity · uso indisponível (token recusado pelo servidor local (401/403))"],
    ["403 em todas as portas", () => ({ status: 403, body: null }), "Antigravity · uso indisponível (token recusado pelo servidor local (401/403))"],
    ["tempo esgotado", () => ({ error: "timeout" }), "Antigravity · uso indisponível (servidor local não respondeu a tempo)"],
    ["nada escutando", null, "Antigravity · uso indisponível (servidor local não respondeu)"],
    ["HTTP 500", () => ({ status: 500, body: null }), "Antigravity · uso indisponível (resposta inesperada do servidor local (HTTP 500))"],
    ["200 sem cota (deslogado)", (m) => (m === "GetUserStatus" ? { status: 200, body: { userStatus: { name: "x" } } } : { status: 200, body: {} }),
      "Antigravity · uso indisponível (sem dados de cota · faça login no Antigravity)"],
  ];
  test.each(cases)("%s → '–' + motivo preciso", async (_name, route, label) => {
    const routes = route ? { "https:53050": route, "http:53050": route, "https:53100": route, "http:53100": route, "https:53021": route, "http:53021": route } : {};
    await load({ listProcesses: async () => [serverRow()], request: fakeRpc(routes) });
    for (const id of ["gemini", "others", "worst"]) expect(plugin.getState()[id]).toEqual({ text: "–", label });
    expect(plugin.__test.sources().desktop.state).toBe("error");
  });

  test("processo sem --csrf_token e processo sem linha de comando", async () => {
    await load({ listProcesses: async () => [serverRow({ cmd: "C:\\x\\Antigravity\\bin\\language_server_windows_x64.exe --app_data_dir antigravity" })], request: fakeRpc({}) });
    expect(plugin.getState().worst.label).toBe("Antigravity · uso indisponível (servidor local sem --csrf_token)");
    await load({ listProcesses: async () => [serverRow({ cmd: null })], request: fakeRpc({}) });
    expect(plugin.getState().worst.label).toBe("Antigravity · uso indisponível (sem acesso à linha de comando do servidor local)");
  });

  test("falha ao listar processos não é confundida com 'fechado'", async () => {
    await load({ listProcesses: async () => { throw new Error("powershell"); } });
    expect(plugin.getState().worst).toEqual({ text: "–", label: "Antigravity · uso indisponível (não foi possível listar os processos)" });
  });

  test("erro de RPC com valor guardado: mostra o motivo, não o número antigo", async () => {
    let route = modern();
    const request = fakeRpc({ "https:53050": (m, t) => route(m, t) });
    await load({ listProcesses: async () => [serverRow()], request });
    expect(plugin.getState().gemini.value).toBe(42);
    route = () => ({ status: 401, body: null });
    clock += 60_000;
    await plugin.__test.refresh(false);
    expect(plugin.getState().gemini).toEqual({ text: "–", label: "Antigravity · uso indisponível (token recusado pelo servidor local (401/403))" });
  });
});

describe("Antigravity fechado → último valor", () => {
  test("processo some: valores continuam, sem cor, com 'último valor há …'", async () => {
    let rows = [serverRow()];
    const request = fakeRpc({ "https:53050": modern() });
    await load({ listProcesses: async () => rows, request });
    expect(plugin.getState().gemini.status).toBe("green");

    rows = [];
    request.calls.length = 0;
    clock += 2 * HOUR + 5 * 60_000;
    await plugin.__test.refresh(false);
    const st = plugin.getState();
    expect(st.gemini).toEqual({
      value: 42, text: "42%",
      label: "Antigravity fechado · último valor há 2 h · Windows · Gemini · 5h 42% (5min) · semana 18% (4d) · plano Pro",
    });
    expect(st.gemini.status).toBeUndefined();
    expect(st.others.status).toBeUndefined();
    expect(st.worst.label).toMatch(/^Antigravity fechado · último valor há 2 h · Windows · /);
    expect(plugin.__test.sources().desktop.state).toBe("closed");
  });

  test("janela cujo horário de renovação já passou aparece como renovada (0%)", async () => {
    let rows = [serverRow()];
    await load({ listProcesses: async () => rows, request: fakeRpc({ "https:53050": modern() }) });
    rows = [];
    clock += 5 * HOUR;
    await plugin.__test.refresh(false);
    const st = plugin.getState();
    expect(st.gemini).toMatchObject({ value: 18, text: "18%" });
    expect(st.gemini.label).toContain("Gemini · 5h renovado · semana 18% (3d 21h)");
    expect(st.others.label).toContain("Claude e GPT · 5h renovado · semana 40%");
  });

  test("cache: gravado em plugin-data, só porcentagens/horários/rótulos — nenhum segredo", async () => {
    await load({ listProcesses: async () => [serverRow()], request: fakeRpc({ "https:53050": modern() }) });
    const raw = fs.readFileSync(cacheFile, "utf8");
    const data = JSON.parse(raw);
    expect(data.version).toBe(1);
    expect(data.savedAt).toBe(T0);
    expect(data.accounts).toHaveLength(1);
    const acc = data.accounts[0];
    expect(Object.keys(acc).sort()).toEqual(["at", "groups", "id", "locs", "perModel", "plan", "source", "where"]);
    expect(acc).toMatchObject({ plan: "Pro", source: "summary", perModel: false, at: T0, locs: ["win"], where: ["Windows"] });
    expect(acc.id).toMatch(/^[0-9a-f]{8}$/);
    expect(acc.groups.gemini).toEqual([
      { id: "gemini-5h", window: "5h", used: 42, resetAt: T0 + 130 * 60_000 },
      { id: "gemini-weekly", window: "week", used: 18, resetAt: T0 + 4 * DAY + 2 * HOUR },
    ]);
    expect(raw).not.toContain(CSRF);
    expect(raw).not.toContain("99999999-aaaa-bbbb");
    expect(raw).not.toMatch(/@|example\.com|ada\.lovelace|Ada Lovelace|csrf|token/i);
    expect(everythingVisible()).not.toContain(CSRF);
    expect(everythingVisible()).not.toMatch(/ada\.lovelace|Ada Lovelace|example\.com/);
  });

  test("reinício com o app fechado: o cache é carregado e mostrado como valor antigo", async () => {
    await load({ listProcesses: async () => [serverRow()], request: fakeRpc({ "https:53050": modern() }) });
    plugin.onUnload();
    clock += 30 * 60_000;
    await load();
    const st = plugin.getState();
    expect(st.gemini).toEqual({
      value: 42, text: "42%",
      label: "Antigravity fechado · último valor há 30 min · Windows · Gemini · 5h 42% (1h40) · semana 18% (4d 2h) · plano Pro",
    });
    expect(st.worst.value).toBe(75);
  });

  test("o arquivo não é regravado a cada minuto quando só a hora da leitura mudou", async () => {
    const request = fakeRpc({ "https:53050": modern() });
    await load({ listProcesses: async () => [serverRow()], request });
    const first = fs.statSync(cacheFile).mtimeMs;
    const saved = JSON.parse(fs.readFileSync(cacheFile, "utf8")).savedAt;
    clock += 60_000;
    await plugin.__test.refresh(false);
    expect(JSON.parse(fs.readFileSync(cacheFile, "utf8")).savedAt).toBe(saved);
    expect(fs.statSync(cacheFile).mtimeMs).toBe(first);
    clock += 6 * 60_000;
    await plugin.__test.refresh(false);
    expect(JSON.parse(fs.readFileSync(cacheFile, "utf8")).savedAt).toBe(clock);
  });

  test("cache corrompido ou com campos estranhos é ignorado / saneado", async () => {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, "{ not json");
    await load();
    expect(plugin.getState().worst).toEqual({ text: "–", label: "Antigravity fechado · abra para ver o uso" });
    plugin.onUnload();

    fs.writeFileSync(cacheFile, JSON.stringify({ version: 1, savedAt: T0, accounts: [
      { id: "../../etc", at: T0, groups: {} },
      { id: "abcdef12", at: T0 - 60_000, plan: "Pro", where: ["Windows"], locs: ["win"], email: "x@y.z", token: "segredo",
        groups: { gemini: [{ id: "gemini-5h", window: "5h", used: 250, resetAt: T0 + HOUR, evil: "x" }], others: "oops" } },
    ] }));
    await load();
    const st = plugin.getState();
    expect(st.gemini).toMatchObject({ value: 100, text: "100%" });
    expect(st.gemini.label).toBe("Antigravity fechado · último valor há 1 min · Windows · Gemini · 5h 100% (1h00) · plano Pro");
    expect(JSON.stringify(plugin.__test.summary())).not.toMatch(/segredo|x@y\.z|evil/);
  });

  test("valor com mais de 8 dias não é mais exibido", async () => {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify({ version: 1, savedAt: T0 - 9 * DAY, accounts: [
      { id: "abcdef12", at: T0 - 9 * DAY, plan: "Pro", where: ["Windows"], locs: ["win"], groups: { gemini: [{ id: "gemini-5h", window: "5h", used: 50, resetAt: null }], others: [] } },
    ] }));
    await load();
    expect(plugin.getState().gemini).toEqual({ text: "–", label: "Antigravity fechado · abra para ver o uso" });
  });
});

describe("ciclo de atualização", () => {
  test("refreshes simultâneos compartilham uma única varredura", async () => {
    let scans = 0;
    let release;
    const gate = new Promise((r) => { release = r; });
    jest.resetModules();
    plugin = require(path.join(PLUGIN_DIR, "index.js"));
    plugin.__test.configure({ now: () => clock, cacheFile, locator: { discover: async () => [] }, listProcesses: async () => { scans++; await gate; return []; } });
    host = makeHost();
    plugin.onLoad(host);
    const a = plugin.__test.refresh(false);
    const b = plugin.__test.refresh(true);
    const c = plugin.onAction("__nope__");
    release();
    await Promise.all([a, b, c]);
    expect(scans).toBe(1);
  });

  test("app fechado: no máximo uma varredura a cada 30 s (o timer é de 60 s); o clique força, com piso de 5 s", async () => {
    let scans = 0;
    await load({ listProcesses: async () => { scans++; return []; } });
    expect(scans).toBe(1);
    clock += 10_000;
    await plugin.__test.refresh(false);
    expect(scans).toBe(1);
    await plugin.onAction("worst");
    expect(scans).toBe(2);
    clock += 2_000;
    await plugin.onAction("worst");
    expect(scans).toBe(2);
    clock += 60_000;
    await plugin.__test.refresh(false);
    expect(scans).toBe(3);
  });

  test("app aberto e respondendo: o processo só é procurado de novo a cada 5 min (ou quando some)", async () => {
    let scans = 0;
    let rows = [serverRow()];
    let up = true;
    const request = fakeRpc({ "https:53050": (m) => (up ? modern()(m) : { error: "network" }) });
    await load({ listProcesses: async () => { scans++; return rows; }, request });
    for (let i = 0; i < 4; i++) { clock += 60_000; await plugin.__test.refresh(false); }
    expect(scans).toBe(1);
    clock += 2 * 60_000;
    await plugin.__test.refresh(false);
    expect(scans).toBe(2);
    up = false; rows = [];
    clock += 60_000;
    await plugin.__test.refresh(false);
    expect(scans).toBe(3);
    expect(plugin.getState().gemini.label).toMatch(/^Antigravity fechado · último valor há 1 min/);
  });

  test("app reiniciado (pid, token e porta novos) é reencontrado no mesmo ciclo", async () => {
    let rows = [serverRow()];
    const routes = { "https:53050": modern() };
    const request = fakeRpc(routes);
    await load({ listProcesses: async () => rows, request });
    delete routes["https:53050"];
    routes["https:61000"] = modern(summaryBody(0.5, 0.5, 0.5, 0.5));
    rows = [serverRow({ pid: 7777, ports: [61000], cmd: serverRow().cmd.replace(CSRF, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee") })];
    clock += 60_000;
    await plugin.__test.refresh(false);
    expect(plugin.getState().gemini).toMatchObject({ value: 50, status: "green" });
  });

  test("stateChanged só quando o que aparece mudou", async () => {
    const request = fakeRpc({ "https:53050": modern() });
    await load({ listProcesses: async () => [serverRow()], request });
    expect(host.stateChanges).toBe(1);
    await plugin.__test.refresh(true);
    expect(host.stateChanges).toBe(1);
    clock += 60_000;
    await plugin.__test.refresh(false);
    expect(host.stateChanges).toBe(2);
  });

  test("getState() responde da memória: não varre nem chama o servidor", async () => {
    let scans = 0;
    const request = fakeRpc({ "https:53050": modern() });
    await load({ listProcesses: async () => { scans++; return [serverRow()]; }, request });
    const calls = request.calls.length;
    for (let i = 0; i < 50; i++) plugin.getState();
    plugin.getActions();
    expect(scans).toBe(1);
    expect(request.calls.length).toBe(calls);
  });

  test("onLoad agenda o refresh de 60 s e onUnload o cancela", async () => {
    jest.useFakeTimers();
    try {
      let scans = 0;
      jest.resetModules();
      plugin = require(path.join(PLUGIN_DIR, "index.js"));
      plugin.__test.configure({ cacheFile, locator: { discover: async () => [] }, listProcesses: async () => { scans++; return []; } });
      plugin.onLoad(makeHost());
      await plugin.__test.refresh(false);
      expect(scans).toBe(1);
      expect(jest.getTimerCount()).toBe(1);
      await jest.advanceTimersByTimeAsync(60_000);
      expect(scans).toBe(2);
      plugin.onUnload();
      expect(jest.getTimerCount()).toBe(0);
      await jest.advanceTimersByTimeAsync(180_000);
      expect(scans).toBe(2);
      plugin = null;
    } finally {
      jest.useRealTimers();
    }
  });

  test("clicar força a leitura e mostra a notificação com todos os grupos e renovações", async () => {
    const request = fakeRpc({ "https:53050": modern() });
    await load({ listProcesses: async () => [serverRow()], request });
    const before = request.calls.length;
    clock += 1_000;
    const result = await plugin.onAction("gemini");
    expect(request.calls.length).toBeGreaterThan(before);
    expect(toasts).toEqual([{
      title: "Antigravity · Uso",
      message: "Windows · plano Pro\nGemini: 5h 42% (2h10) · semana 18% (4d 2h)\nClaude e GPT: 5h 75% (4h00) · semana 40% (6d)",
    }]);
    expect(result.accounts[0]).toMatchObject({ where: ["Windows"], plan: "Pro", live: true });
    expect(JSON.stringify(result)).not.toMatch(/example\.com|11111111/);
    expect(await plugin.onAction("approve")).toBeUndefined();
    expect(toasts).toHaveLength(1);
  });

  test("notificação com o app fechado e XML da notificação escapado", async () => {
    await load();
    await plugin.onAction("worst");
    expect(toasts[0]).toEqual({ title: "Antigravity · Uso", message: "Antigravity fechado · abra para ver o uso" });
    const { toastXml, escapeXml } = plugin._internals;
    expect(escapeXml(`a<b>&"c"'d'`)).toBe("a&lt;b&gt;&amp;&quot;c&quot;&apos;d&apos;");
    const xml = toastXml("Antigravity · Uso", "Windows · plano <Pro> & 'cia'\nGemini: 5h 42%\nClaude e GPT: 5h 75%");
    expect(xml).toBe('<toast><visual><binding template="ToastGeneric"><text>Antigravity · Uso</text><text>Windows · plano &lt;Pro&gt; &amp; &apos;cia&apos;</text><text>Gemini: 5h 42%\nClaude e GPT: 5h 75%</text></binding></visual></toast>');
    expect(xml).not.toContain("'");
  });

  test("sem host (serviço antigo) e sem actionsChanged: continua funcionando", async () => {
    jest.resetModules();
    plugin = require(path.join(PLUGIN_DIR, "index.js"));
    plugin.__test.configure({ now: () => clock, cacheFile, locator: { discover: async () => [] }, listProcesses: async () => [serverRow()], request: fakeRpc({ "https:53050": modern() }) });
    plugin.onLoad(undefined);
    await plugin.__test.refresh(false);
    expect(plugin.getState().gemini.value).toBe(42);
    plugin.onUnload();
    plugin.onLoad({ stateChanged() {} });
    await plugin.__test.refresh(true);
    expect(plugin.getState().gemini.value).toBe(42);
  });

  test("sob jest, sem nada injetado, o plugin não olha a máquina real", async () => {
    jest.resetModules();
    plugin = require(path.join(PLUGIN_DIR, "index.js"));
    plugin.__test.configure({ now: () => clock });
    plugin.onLoad(makeHost());
    await plugin.__test.refresh(false);
    expect(plugin.getState().worst.text).toBe("–");
    expect(plugin.__test.sources()).toEqual({ desktop: { state: expect.any(String), reason: "", http: 0 }, servers: 0, locations: [] });
  });
});

function selfSignedCert() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const der = (tag, ...parts) => {
    const body = Buffer.concat(parts);
    let len;
    if (body.length < 128) len = Buffer.from([body.length]);
    else { const b = []; for (let n = body.length; n > 0; n >>= 8) b.unshift(n & 255); len = Buffer.from([0x80 | b.length, ...b]); }
    return Buffer.concat([Buffer.from([tag]), len, body]);
  };
  const seq = (...p) => der(0x30, ...p);
  const algorithm = seq(Buffer.from("06092a864886f70d01010b", "hex"), Buffer.from("0500", "hex"));
  const name = seq(der(0x31, seq(Buffer.from("0603550403", "hex"), der(0x0c, Buffer.from("localhost")))));
  const validity = seq(der(0x17, Buffer.from("250101000000Z")), der(0x17, Buffer.from("450101000000Z")));
  const tbs = seq(
    Buffer.from("a003020102", "hex"),
    Buffer.from("020101", "hex"),
    algorithm, name, validity, name,
    publicKey.export({ type: "spki", format: "der" })
  );
  const signature = crypto.sign("sha256", tbs, privateKey);
  const cert = seq(tbs, algorithm, der(0x03, Buffer.from([0]), signature));
  const pem = `-----BEGIN CERTIFICATE-----\n${cert.toString("base64").match(/.{1,64}/g).join("\n")}\n-----END CERTIFICATE-----\n`;
  return { cert: pem, key: privateKey.export({ type: "pkcs8", format: "pem" }) };
}

describe("ponta a ponta com servidor local falso", () => {
  let tls;
  const servers = [];
  const seen = [];

  function startServer(secure, handlers) {
    const onRequest = (req, res) => {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const method = req.url.replace("/exa.language_server_pb.LanguageServerService/", "");
        seen.push({ secure, httpMethod: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString("utf8") });
        const send = (status, body) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(body === undefined ? "" : JSON.stringify(body)); };
        if (req.headers["x-codeium-csrf-token"] !== CSRF) return send(403, { code: "permission_denied", message: "Invalid CSRF token" });
        const h = handlers[method];
        if (!h) return send(404, { code: "unimplemented" });
        const out = h();
        send(out.status, out.body);
      });
    };
    const server = secure ? https.createServer({ cert: tls.cert, key: tls.key }, onRequest) : http.createServer(onRequest);
    servers.push(server);
    return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
  }

  async function closedPort() {
    const s = http.createServer();
    const port = await new Promise((resolve) => s.listen(0, "127.0.0.1", () => resolve(s.address().port)));
    await new Promise((resolve) => s.close(resolve));
    return port;
  }

  beforeAll(() => { tls = selfSignedCert(); });
  beforeEach(() => { seen.length = 0; });
  afterEach(async () => {
    await Promise.all(servers.splice(0).map((s) => new Promise((resolve) => { s.closeAllConnections?.(); s.close(resolve); })));
  });

  test("HTTPS com certificado autoassinado: descobre a porta, envia o protocolo certo e lê o resumo", async () => {
    const port = await startServer(true, {
      RetrieveUserQuotaSummary: () => ({ status: 200, body: summaryBody() }),
      GetUserStatus: () => ({ status: 200, body: statusBody() }),
    });
    const dead = await closedPort();
    await load({ listProcesses: async () => [serverRow({ ports: [dead, port].sort((a, b) => a - b) })] });

    expect(plugin.getState().gemini).toEqual({
      value: 42, text: "42%", status: "green",
      label: "Antigravity · Windows · Gemini · 5h 42% (renova em 2h10) · semana 18% (renova em 4d 2h) · plano Pro",
    });
    expect(seen.map((r) => r.url)).toEqual([
      "/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary",
      "/exa.language_server_pb.LanguageServerService/GetUserStatus",
    ]);
    for (const r of seen) {
      expect(r.secure).toBe(true);
      expect(r.httpMethod).toBe("POST");
      expect(r.headers["content-type"]).toBe("application/json");
      expect(r.headers["connect-protocol-version"]).toBe("1");
      expect(r.headers["x-codeium-csrf-token"]).toBe(CSRF);
      expect(r.headers.host).toBe(`127.0.0.1:${port}`);
      expect(JSON.parse(r.body)).toEqual({ metadata: { ideName: "antigravity", extensionName: "antigravity", locale: "en" } });
    }
    expect(everythingVisible()).not.toContain(CSRF);
  });

  test("o certificado autoassinado continua recusado fora do plugin (a exceção é só da requisição do plugin)", async () => {
    const port = await startServer(true, { GetUserStatus: () => ({ status: 200, body: statusBody() }) });
    await load({ listProcesses: async () => [serverRow({ ports: [port] })] });
    expect(plugin.getState().gemini.value).toBe(30);
    expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).not.toBe("0");
    expect(https.globalAgent.options.rejectUnauthorized).not.toBe(false);
    const err = await new Promise((resolve) => {
      const req = https.request({ host: "127.0.0.1", port, method: "POST", path: "/", agent: false }, () => resolve(null));
      req.on("error", resolve);
      req.end("{}");
    });
    expect(err).toBeTruthy();
    expect(String(err.code)).toMatch(/SELF_SIGNED|CERT|UNABLE/);
  });

  test("servidor em HTTP puro: https falha, http responde; versão antiga (404 no resumo) cai no GetUserStatus", async () => {
    const port = await startServer(false, { GetUserStatus: () => ({ status: 200, body: statusBody() }) });
    await load({ listProcesses: async () => [serverRow({ ports: [port] })] });
    expect(seen.every((r) => r.secure === false)).toBe(true);
    expect(seen.map((r) => r.url.split("/").pop())).toEqual(["RetrieveUserQuotaSummary", "GetUserStatus"]);
    expect(plugin.getState().others).toMatchObject({ value: 90, status: "red" });
    expect(plugin.getState().others.label).toContain("por modelo (Claude Sonnet 4.5)");
  });

  test("token errado na linha de comando → 403 do servidor → motivo 'token recusado'", async () => {
    const port = await startServer(true, { GetUserStatus: () => ({ status: 200, body: statusBody() }) });
    const row = serverRow({ ports: [port] });
    row.cmd = row.cmd.replace(CSRF, "00000000-0000-0000-0000-000000000000");
    await load({ listProcesses: async () => [row] });
    expect(plugin.getState().worst).toEqual({ text: "–", label: "Antigravity · uso indisponível (token recusado pelo servidor local (401/403))" });
  });

  test("resposta que não é JSON e servidor que derruba a conexão não quebram o plugin", async () => {
    const raw = http.createServer((req, res) => { res.writeHead(200, { "Content-Type": "text/html" }); res.end("<html>oi</html>"); });
    servers.push(raw);
    const port = await new Promise((resolve) => raw.listen(0, "127.0.0.1", () => resolve(raw.address().port)));
    const rude = http.createServer((req) => req.socket.destroy());
    servers.push(rude);
    const port2 = await new Promise((resolve) => rude.listen(0, "127.0.0.1", () => resolve(rude.address().port)));
    await load({ listProcesses: async () => [serverRow({ ports: [port, port2], cmd: serverRow().cmd.replace("--extension_server_port 53021 ", "") })] });
    expect(plugin.getState().worst.text).toBe("–");
    expect(plugin.getState().worst.label).toMatch(/^Antigravity · uso indisponível \(/);
  });
});
