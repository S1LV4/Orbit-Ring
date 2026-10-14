process.env.ORBIT_PLUGIN_LOCALE = "pt-BR";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const PLUGIN_DIR = path.resolve(__dirname, "../../../plugins/gemini-usage");
const T0 = Date.parse("2026-10-13T12:00:00Z");
const HOUR = 3600_000;

const LOAD_URL = "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist";
const QUOTA_URL = "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

let tmp, winHome, wslHome, plugin, host, clock, requests, routes, locs, touched, toasts, logSpy, envVars;

function writeGemini(home, opts = {}) {
  const dir = path.join(home, ".gemini");
  fs.mkdirSync(dir, { recursive: true });
  if (opts.creds !== false) {
    const creds = { token_type: "Bearer", scope: "x" };
    if (opts.access !== null) creds.access_token = opts.access || "ya29.FILE-TOKEN";
    if (opts.refresh !== null) creds.refresh_token = opts.refresh || "1//REFRESH-SECRET";
    if (opts.expiry !== null) creds.expiry_date = opts.expiry !== undefined ? opts.expiry : T0 + 30 * 60_000;
    fs.writeFileSync(path.join(dir, "oauth_creds.json"), JSON.stringify(creds));
  }
  if (opts.email) fs.writeFileSync(path.join(dir, "google_accounts.json"), JSON.stringify({ active: opts.email, old: [] }));
  fs.writeFileSync(path.join(dir, "settings.json"), JSON.stringify(opts.settings || { hooks: {}, mcpServers: {} }));
  if (opts.env) fs.writeFileSync(path.join(dir, ".env"), opts.env);
  return path.join(dir, "oauth_creds.json");
}

function spyFsp() {
  const note = (p) => touched.push(String(p));
  return {
    stat: (p) => { note(p); return fs.promises.stat(p); },
    readFile: (p, enc) => { note(p); return fs.promises.readFile(p, enc); },
    readdir: (p) => { note(p); return fs.promises.readdir(p); },
  };
}

const WIN = () => ({ id: "win", kind: "windows", home: winHome, label: "Windows", short: "Windows", stale: false });
const WSL = (stale = false) => ({ id: "wsl:Ubuntu-22.04:devuser", kind: "wsl", home: wslHome, label: "WSL · Ubuntu", short: "WSL", distro: "Ubuntu-22.04", user: "devuser", stale });

const bucket = (modelId, remainingFraction, resetMs = T0 + 5 * HOUR + 10 * 60_000, tokenType = "REQUESTS") => {
  const b = { modelId, tokenType, resetTime: new Date(resetMs).toISOString() };
  if (remainingFraction !== undefined) b.remainingFraction = remainingFraction;
  return b;
};

const DEFAULT_BUCKETS = [
  bucket("gemini-2.5-pro", 0.7),
  bucket("gemini-3-pro-preview", 0.3),
  bucket("gemini-2.5-flash", 0.9),
  bucket("gemini-2.5-flash-lite", 0.45),
];

function healthy(buckets = DEFAULT_BUCKETS, project = "managed-project-1") {
  return {
    [LOAD_URL]: () => ({ status: 200, data: { currentTier: { id: "free-tier", name: "Gemini Code Assist" }, cloudaicompanionProject: project } }),
    [QUOTA_URL]: () => ({ status: 200, data: { buckets } }),
    [TOKEN_URL]: () => ({ status: 200, data: { access_token: "ya29.MEMORY-TOKEN", expires_in: 3599, token_type: "Bearer" } }),
  };
}

const count = (url) => requests.filter((r) => r.url === url).length;

async function load() {
  jest.resetModules();
  plugin = require(path.join(PLUGIN_DIR, "index.js"));
  plugin.__test.configure({
    locator: { discover: async () => locs.map((l) => ({ ...l })), reset() {} },
    http: async (req) => { requests.push(req); const r = routes[req.url]; return r ? r(req) : { status: 404, data: null }; },
    fsp: spyFsp(),
    env: envVars,
    now: () => clock,
    showToast: (title, message) => toasts.push({ title, message }),
    orbitHome: path.join(tmp, "orbit"),
  });
  host = { stateChanges: 0, actionChanges: 0, stateChanged() { host.stateChanges++; }, actionsChanged() { host.actionChanges++; } };
  plugin.onLoad(host);
  await plugin.__test.refresh(false);
}

async function tick(ms = 61_000) {
  clock += ms;
  await plugin.__test.refresh(false);
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-gemini-test-"));
  winHome = path.join(tmp, "win");
  wslHome = path.join(tmp, "wslroot", "Ubuntu-22.04", "home", "devuser");
  fs.mkdirSync(winHome, { recursive: true });
  fs.mkdirSync(wslHome, { recursive: true });
  clock = T0;
  requests = [];
  touched = [];
  toasts = [];
  envVars = {};
  routes = healthy();
  locs = [WIN()];
  plugin = null;
  logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  if (plugin) plugin.onUnload();
  logSpy.mockRestore();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("sem login do Google", () => {
  const off = { text: "–", label: "Gemini CLI · não conectado (faça login com `gemini`)" };

  test("~/.gemini só com settings.json (caso do Antigravity) → não conectado, sem rede", async () => {
    locs = [WIN(), WSL()];
    writeGemini(winHome, { creds: false });
    writeGemini(wslHome, { creds: false });
    await load();
    expect(plugin.getState()).toEqual({ pro: off, flash: off, worst: off });
    expect(requests).toHaveLength(0);
    await plugin.onAction("pro");
    expect(toasts.pop()).toEqual({ title: "Gemini CLI · Cota", message: off.label });
  });

  test("sem pasta ~/.gemini → não conectado; antes do primeiro ciclo → carregando", async () => {
    jest.resetModules();
    plugin = require(path.join(PLUGIN_DIR, "index.js"));
    plugin.__test.configure({ locator: { discover: () => new Promise(() => {}), reset() {} }, orbitHome: null, env: {} });
    expect(plugin.getState().worst).toEqual({ text: "…", label: "Gemini CLI · carregando cota…" });
    await load();
    expect(plugin.getState().worst).toEqual(off);
  });

  test("modo chave de API (security.auth.selectedType) → sem cota, mesmo com oauth_creds.json antigo", async () => {
    writeGemini(winHome, { settings: { security: { auth: { selectedType: "gemini-api-key" } } } });
    await load();
    const key = { text: "–", label: "Gemini com chave de API · sem cota para mostrar" };
    expect(plugin.getState()).toEqual({ pro: key, flash: key, worst: key });
    expect(requests).toHaveLength(0);
  });

  test("Vertex AI, chave no ~/.gemini/.env e GEMINI_API_KEY no ambiente → sem cota", async () => {
    const label = "Gemini com chave de API · sem cota para mostrar";
    writeGemini(winHome, { creds: false, settings: { security: { auth: { selectedType: "vertex-ai" } } } });
    await load();
    expect(plugin.getState().pro.label).toBe(label);

    writeGemini(winHome, { creds: false, env: "# minha chave\nexport GEMINI_API_KEY=AIza-SECRET\n" });
    await load();
    expect(plugin.getState().pro.label).toBe(label);
    expect(JSON.stringify(plugin.getState())).not.toContain("AIza");

    fs.rmSync(path.join(winHome, ".gemini", ".env"));
    envVars = { GEMINI_API_KEY: "AIza-SECRET" };
    await load();
    expect(plugin.getState().pro.label).toBe(label);

    locs = [WSL()];
    writeGemini(wslHome, { creds: false });
    await load();
    expect(plugin.getState().pro.label).toBe("Gemini CLI · não conectado (faça login com `gemini`)");
    expect(requests).toHaveLength(0);
  });

  test("sob o jest, sem injeção, o plugin não procura nada na máquina real", async () => {
    jest.resetModules();
    plugin = require(path.join(PLUGIN_DIR, "index.js"));
    plugin.onLoad({ stateChanged() {} });
    await plugin.__test.refresh(false);
    expect(plugin.__test.accounts()).toEqual([]);
  });
});

describe("cota (loadCodeAssist + retrieveUserQuota)", () => {
  test("fração como número, string ou ausente — ausente NÃO é zero", () => {
    const { parseFraction, mapQuota } = require(path.join(PLUGIN_DIR, "index.js"))._internals;
    expect(parseFraction(0.25)).toBe(0.25);
    expect(parseFraction("0.25")).toBe(0.25);
    expect(parseFraction(0)).toBe(0);
    expect(parseFraction("1")).toBe(1);
    expect(parseFraction(1.7)).toBe(1);
    expect(parseFraction(-0.2)).toBe(0);
    for (const missing of [undefined, null, "", "  ", "abc", NaN, {}, true]) expect(parseFraction(missing)).toBeNull();

    const q = mapQuota({ buckets: [
      bucket("gemini-2.5-pro", 0.25),
      bucket("gemini-2.5-flash", "0.5"),
      bucket("gemini-2.0-flash", undefined),
      bucket("gemini-3-pro-preview", null),
      { remainingFraction: 0.1 },
      { modelId: "gemini-x", remainingFraction: 0, resetTime: "not a date" },
    ] }, T0);
    expect(q.at).toBe(T0);
    expect(q.unknown).toBe(2);
    expect(q.buckets.map((b) => [b.modelId, b.used])).toEqual([["gemini-2.5-pro", 75], ["gemini-2.5-flash", 50], ["gemini-x", 100]]);
    expect(q.buckets[0].resetsAt).toBe(T0 + 5 * HOUR + 10 * 60_000);
    expect(q.buckets[2].resetsAt).toBeUndefined();
    expect(mapQuota({}, T0)).toEqual({ at: T0, buckets: [], unknown: 0 });
    expect(mapQuota(null, T0)).toBeNull();
  });

  test("Pro / Flash / Uso: o bucket mais apertado de cada grupo, com modelo e renovação", async () => {
    writeGemini(winHome, { email: "Someone@Example.com" });
    await load();

    expect(plugin.getState()).toEqual({
      pro: { value: 70, text: "70%", status: "amber", label: "Gemini · Windows · Pro 70% · gemini-3-pro-preview · renova em 5h10" },
      flash: { value: 55, text: "55%", status: "green", label: "Gemini · Windows · Flash 55% · gemini-2.5-flash-lite · renova em 5h10" },
      worst: { value: 70, text: "70%", status: "amber", label: "Gemini · Windows · Uso 70% · gemini-3-pro-preview · renova em 5h10" },
    });

    expect(requests.map((r) => r.url)).toEqual([LOAD_URL, QUOTA_URL]);
    expect(requests[0].method).toBe("POST");
    expect(JSON.parse(requests[0].body)).toEqual({ metadata: { ideType: "IDE_UNSPECIFIED", platform: "PLATFORM_UNSPECIFIED", pluginType: "GEMINI" } });
    expect(JSON.parse(requests[1].body)).toEqual({ project: "managed-project-1" });
    for (const r of requests) {
      expect(r.headers.Authorization).toBe("Bearer ya29.FILE-TOKEN");
      expect(r.timeoutMs).toBeLessThanOrEqual(5000);
    }

    await plugin.onAction("worst");
    const visible = JSON.stringify([plugin.getState(), plugin.getActions(), toasts]);
    expect(visible).not.toMatch(/someone|example\.com|ya29|REFRESH/i);
    expect(toasts.pop().message).toBe(
      "Pro: 70% · gemini-3-pro-preview · renova em 5h10\nFlash: 55% · gemini-2.5-flash-lite · renova em 5h10\nWindows · Gemini Code Assist · ao vivo"
    );
  });

  test("grupo sem fração informada → '–' (e não 0% nem 100%); o resto segue", async () => {
    writeGemini(winHome);
    routes = healthy([bucket("gemini-2.5-pro", undefined), bucket("gemini-2.5-flash", "0.02")]);
    await load();
    const st = plugin.getState();
    expect(st.pro).toEqual({ text: "–", label: "Gemini · Windows · Pro sem cota informada" });
    expect(st.flash).toMatchObject({ value: 98, text: "98%", status: "red" });
    expect(st.worst.label).toBe("Gemini · Windows · Uso 98% · gemini-2.5-flash · renova em 5h10");
  });

  test("uma rodada por conta por minuto; o projeto fica em cache", async () => {
    writeGemini(winHome);
    await load();
    await plugin.onAction("pro");
    await plugin.onAction("flash");
    expect(count(QUOTA_URL)).toBe(1);
    await tick();
    await tick();
    expect(count(QUOTA_URL)).toBe(3);
    expect(count(LOAD_URL)).toBe(1);
    expect(count(TOKEN_URL)).toBe(0);
  });

  test("GOOGLE_CLOUD_PROJECT é enviado como o CLI envia, e serve de projeto quando a API não devolve um", async () => {
    writeGemini(winHome);
    envVars = { GOOGLE_CLOUD_PROJECT: "my-project-123" };
    routes[LOAD_URL] = () => ({ status: 200, data: { currentTier: { id: "standard-tier" } } });
    await load();
    expect(JSON.parse(requests[0].body)).toMatchObject({ cloudaicompanionProject: "my-project-123", metadata: { duetProject: "my-project-123" } });
    expect(JSON.parse(requests[1].body)).toEqual({ project: "my-project-123" });
    expect(plugin.getState().pro.value).toBe(70);
  });

  test("sem projeto → pede para abrir o Gemini CLI (o plugin nunca faz onboarding)", async () => {
    writeGemini(winHome);
    routes[LOAD_URL] = () => ({ status: 200, data: { allowedTiers: [{ id: "free-tier", isDefault: true }] } });
    await load();
    expect(plugin.getState().pro).toEqual({ text: "–", label: "Gemini · Windows · projeto não configurado · abra o Gemini CLI" });
    expect(requests.map((r) => r.url)).toEqual([LOAD_URL]);
    expect(requests.some((r) => /onboardUser/.test(r.url))).toBe(false);
  });

  test("falha passageira mantém os últimos números (com a idade) por 15 min; depois avisa", async () => {
    writeGemini(winHome, { expiry: T0 + 50 * 60_000 });
    await load();
    routes[QUOTA_URL] = () => ({ status: 503, data: null });
    await tick(5 * 60_000);
    expect(plugin.getState().pro.label).toBe("Gemini · Windows · Pro 70% · gemini-3-pro-preview · renova em 5h05 · lido há 5min");
    await tick(11 * 60_000);
    expect(plugin.getState().pro).toEqual({ text: "–", label: "Gemini · Windows · falha na API de cota" });
  });
});

describe("token de acesso expirado", () => {
  test("renova só em memória com o refresh token: o arquivo de credenciais não é tocado", async () => {
    const file = writeGemini(winHome, { expiry: T0 - HOUR });
    const before = { text: fs.readFileSync(file, "utf8"), mtime: fs.statSync(file).mtimeMs };
    const listing = () => fs.readdirSync(path.join(winHome, ".gemini")).sort().join("|");
    const files = listing();
    await load();

    expect(requests.map((r) => r.url)).toEqual([TOKEN_URL, LOAD_URL, QUOTA_URL]);
    const form = new URLSearchParams(requests[0].body);
    expect(form.get("grant_type")).toBe("refresh_token");
    expect(form.get("refresh_token")).toBe("1//REFRESH-SECRET");
    expect(form.get("client_id")).toMatch(/\.apps\.googleusercontent\.com$/);
    expect(requests[0].headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(requests[1].headers.Authorization).toBe("Bearer ya29.MEMORY-TOKEN");
    expect(requests[2].headers.Authorization).toBe("Bearer ya29.MEMORY-TOKEN");
    expect(plugin.getState().pro.value).toBe(70);

    await tick();
    await tick(30 * 60_000);
    expect(count(TOKEN_URL)).toBe(1);
    await tick(30 * 60_000);
    expect(count(TOKEN_URL)).toBe(2);

    expect(fs.readFileSync(file, "utf8")).toBe(before.text);
    expect(fs.statSync(file).mtimeMs).toBe(before.mtime);
    expect(listing()).toBe(files);
  });

  test("refresh recusado → 'token expirado · abra o Gemini CLI', e não insiste até o arquivo mudar", async () => {
    const file = writeGemini(winHome, { expiry: T0 - HOUR });
    routes[TOKEN_URL] = () => ({ status: 400, data: { error: "invalid_grant" } });
    await load();
    const expired = { text: "–", label: "Gemini · Windows · token expirado · abra o Gemini CLI" };
    expect(plugin.getState()).toEqual({ pro: expired, flash: expired, worst: expired });
    await tick();
    await tick();
    expect(requests.map((r) => r.url)).toEqual([TOKEN_URL]);

    writeGemini(winHome, { access: "ya29.NEW-FILE-TOKEN", expiry: clock + 2 * 61_000 + 50 * 60_000 });
    fs.utimesSync(file, new Date(T0 + 5000), new Date(T0 + 5000));
    await tick();
    expect(requests.slice(1).map((r) => r.url)).toEqual([LOAD_URL, QUOTA_URL]);
    expect(requests[2].headers.Authorization).toBe("Bearer ya29.NEW-FILE-TOKEN");
    expect(plugin.getState().pro.value).toBe(70);
  });

  test("expirado e sem refresh token → 'token expirado', nenhuma chamada", async () => {
    writeGemini(winHome, { expiry: T0 - HOUR, refresh: null });
    await load();
    expect(plugin.getState().worst).toEqual({ text: "–", label: "Gemini · Windows · token expirado · abra o Gemini CLI" });
    expect(requests).toHaveLength(0);
  });

  test("401 com token que parecia válido → um refresh e uma nova tentativa", async () => {
    writeGemini(winHome);
    let calls = 0;
    routes[LOAD_URL] = (req) => (calls++ === 0 ? { status: 401, data: null } : healthy()[LOAD_URL](req));
    await load();
    expect(requests.map((r) => r.url)).toEqual([LOAD_URL, TOKEN_URL, LOAD_URL, QUOTA_URL]);
    expect(requests[3].headers.Authorization).toBe("Bearer ya29.MEMORY-TOKEN");
    expect(plugin.getState().pro.value).toBe(70);
  });

  test("falha de rede no refresh → 'falha na API de cota' e tenta de novo no minuto seguinte", async () => {
    writeGemini(winHome, { expiry: T0 - HOUR });
    routes[TOKEN_URL] = () => ({ status: 0, data: null });
    await load();
    expect(plugin.getState().pro.label).toBe("Gemini · Windows · falha na API de cota");
    routes[TOKEN_URL] = healthy()[TOKEN_URL];
    await tick();
    expect(plugin.getState().pro.value).toBe(70);
  });
});

describe("várias contas e vários locais", () => {
  const id8 = (email) => {
    const mail = crypto.createHash("sha256").update(email).digest("hex");
    return crypto.createHash("sha256").update(`mail:${mail}`).digest("hex").slice(0, 8);
  };

  test("mesma conta no Windows e no WSL → uma conta, uma rodada, 'Windows + WSL'", async () => {
    locs = [WIN(), WSL()];
    writeGemini(winHome, { email: "a@example.com", access: "ya29.WIN", expiry: T0 + 10 * 60_000 });
    writeGemini(wslHome, { email: "A@Example.com", access: "ya29.WSL", expiry: T0 + 40 * 60_000 });
    await load();
    expect(plugin.__test.accounts()).toEqual([
      { id: id8("a@example.com"), locations: ["win", "wsl:Ubuntu-22.04:devuser"], error: "", hasUsage: true, stale: false },
    ]);
    expect(count(QUOTA_URL)).toBe(1);
    expect(requests[0].headers.Authorization).toBe("Bearer ya29.WSL");
    expect(plugin.getState().pro.label).toBe("Gemini · Windows + WSL · Pro 70% · gemini-3-pro-preview · renova em 5h10");
    expect(plugin.getActions()).toEqual([]);
  });

  test("duas contas → a pior primeiro, '+1 conta' e ações por conta", async () => {
    locs = [WIN(), WSL()];
    writeGemini(winHome, { email: "a@example.com", access: "ya29.WIN" });
    writeGemini(wslHome, { email: "b@example.com", access: "ya29.WSL" });
    routes[LOAD_URL] = (req) => ({ status: 200, data: { currentTier: { id: "free-tier" }, cloudaicompanionProject: req.headers.Authorization.endsWith("WIN") ? "p-win" : "p-wsl" } });
    routes[QUOTA_URL] = (req) => ({
      status: 200,
      data: JSON.parse(req.body).project === "p-win"
        ? { buckets: [bucket("gemini-2.5-pro", 0.9), bucket("gemini-2.5-flash", 0.2)] }
        : { buckets: [bucket("gemini-2.5-pro", 0.1), bucket("gemini-2.5-flash", 0.95)] },
    });
    await load();

    const a = id8("a@example.com"), b = id8("b@example.com");
    const st = plugin.getState();
    expect(st.pro.label).toBe("Gemini · WSL · Pro 90% · gemini-2.5-pro · renova em 5h10 · +1 conta");
    expect(st.flash.label).toBe("Gemini · Windows · Flash 80% · gemini-2.5-flash · renova em 5h10 · +1 conta");
    expect(st.worst).toMatchObject({ value: 90, status: "red" });

    expect(plugin.getActions().map((x) => x.id)).toEqual([`pro.${a}`, `flash.${a}`, `worst.${a}`, `pro.${b}`, `flash.${b}`, `worst.${b}`]);
    expect(plugin.getActions()[3].name).toBe("Gemini · Pro · WSL");
    expect(host.actionChanges).toBe(1);
    expect(st[`pro.${a}`].value).toBe(10);
    expect(st[`flash.${b}`].label).toBe("Gemini · WSL · Flash 5% · gemini-2.5-flash · renova em 5h10");

    const saved = fs.readFileSync(path.join(tmp, "orbit", "gemini-accounts.json"), "utf8");
    expect(saved).not.toMatch(/example\.com|ya29|REFRESH/);

    await plugin.onAction("worst");
    expect(toasts.pop().message).toBe("Windows: Pro 10% · Flash 80%\nWSL: Pro 90% · Flash 5%");
    await plugin.onAction(`pro.${b}`);
    expect(toasts.pop().message).toBe("Pro: 90% · gemini-2.5-pro · renova em 5h10\nFlash: 5% · gemini-2.5-flash · renova em 5h10\nWSL · ao vivo");
  });

  test("distro WSL parada: últimos números ficam com 'WSL parado' e a pasta não é mais lida", async () => {
    locs = [WIN(), WSL()];
    writeGemini(wslHome, { email: "b@example.com", refresh: null });
    await load();
    expect(plugin.getState().pro.value).toBe(70);

    locs = [WIN(), WSL(true)];
    touched.length = 0;
    await tick(40 * 60_000);
    expect(touched.filter((p) => p.startsWith(wslHome))).toEqual([]);
    expect(plugin.getState().pro.label).toBe("Gemini · WSL · Pro 70% · gemini-3-pro-preview · renova em 4h30 · lido há 40min · WSL parado");
  });

  test("um local ilegível não bloqueia os outros", async () => {
    locs = [WIN(), WSL()];
    writeGemini(winHome, { email: "a@example.com" });
    fs.mkdirSync(path.join(wslHome, ".gemini"), { recursive: true });
    fs.writeFileSync(path.join(wslHome, ".gemini", "oauth_creds.json"), "{ not json");
    await load();
    expect(plugin.getState().pro.value).toBe(70);
    expect(plugin.__test.accounts()).toHaveLength(1);
  });
});

describe("manifesto", () => {
  test("id, ações e ícones no formato do ring", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN_DIR, "manifest.json"), "utf8"));
    expect(manifest).toMatchObject({ id: "com.orbitring.gemini", name: "Gemini CLI", main: "index.js" });
    expect(manifest.actions.map((a) => [a.id, a.name])).toEqual([["pro", "Gemini · Pro"], ["flash", "Gemini · Flash"], ["worst", "Gemini · Usage"]]);
    const pt = JSON.parse(fs.readFileSync(path.join(PLUGIN_DIR, "locales", "pt-BR.json"), "utf8")).manifest;
    expect(Object.entries(pt.actions).map(([id, a]) => [id, a.name])).toEqual([["pro", "Gemini · Pro"], ["flash", "Gemini · Flash"], ["worst", "Gemini · Uso"]]);
    for (const a of manifest.actions) {
      expect(a.stateful).toBe(true);
      expect(a.icon).not.toMatch(/<svg|"/);
    }
  });
});
