const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const PLUGIN_DIR = path.resolve(__dirname, "../../../plugins/claude-usage");
const ENV_KEYS = ["ORBIT_HOME", "ORBIT_CLAUDE_PORT"];
const savedEnv = {};

const UUID_A = "11111111-aaaa-4aaa-8aaa-111111111111";
const UUID_B = "22222222-bbbb-4bbb-8bbb-222222222222";
const ORG_A = "0a0a0a0a-0000-4000-8000-00000000000a";
const ORG_B = "0b0b0b0b-0000-4000-8000-00000000000b";
const id8 = (uuid, org) => crypto.createHash("sha256").update(`${uuid}/${org}`).digest("hex").slice(0, 8);
const ID_A = id8(UUID_A, ORG_A);
const ID_B = id8(UUID_B, ORG_B);

let tmp, plugin, host, locs, fetched, toasts, apiByToken, logSpy, errSpy, clock;

function makeHome(name, { token, expiresAt = Date.now() + 3600_000, uuid, org, email, sub = "max", tier = "default_claude_max_5x" } = {}) {
  const home = path.join(tmp, name);
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  if (token) {
    fs.writeFileSync(path.join(home, ".claude", ".credentials.json"), JSON.stringify({
      claudeAiOauth: { accessToken: token, refreshToken: "r-" + token, expiresAt, subscriptionType: sub, rateLimitTier: tier },
    }));
  }
  if (uuid) {
    fs.writeFileSync(path.join(home, ".claude.json"), JSON.stringify({
      numStartups: 3,
      oauthAccount: { accountUuid: uuid, organizationUuid: org, emailAddress: email, organizationName: "x" },
    }));
  }
  return home;
}

const WIN = (home) => ({ id: "win", kind: "windows", home, label: "Windows", short: "Windows", stale: false });
const WSL = (home, extra = {}) => ({ id: "wsl:Ubuntu-22.04:dev", kind: "wsl", home, distro: "Ubuntu-22.04", user: "dev", label: "WSL · Ubuntu", short: "WSL", stale: false, ...extra });

const usageBody = (session, weekly) => ({
  five_hour: { utilization: session, resets_at: new Date(clock + 3 * 3600_000 + 40 * 60_000).toISOString() },
  seven_day: { utilization: weekly, resets_at: new Date(clock + 2 * 24 * 3600_000).toISOString() },
});

function makeHost(extra = {}) {
  const h = { stateChanges: 0, actionChanges: 0, stateChanged() { h.stateChanges++; }, actionsChanged() { h.actionChanges++; }, ...extra };
  return h;
}

async function load(hostExtra) {
  jest.resetModules();
  plugin = require(path.join(PLUGIN_DIR, "index.js"));
  plugin.__test.configure({
    locator: { discover: async () => locs, reset() {} },
    fetchUsage: async (token) => {
      fetched.push(token);
      const r = apiByToken[token];
      return typeof r === "number" ? { status: r, data: null } : r ? { status: 200, data: r } : { status: 0, data: null };
    },
    showToast: (title, message) => toasts.push({ title, message }),
    now: () => clock,
  });
  host = makeHost(hostExtra);
  await plugin.onLoad(host);
  await plugin.__test.refresh(false);
}

async function cycle(ms = 61_000) {
  clock += ms;
  await plugin.__test.refresh(false);
}

beforeAll(() => { for (const k of ENV_KEYS) savedEnv[k] = process.env[k]; });

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-claude-acc-"));
  process.env.ORBIT_HOME = path.join(tmp, "orbit");
  process.env.ORBIT_CLAUDE_PORT = "0";
  logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  plugin = null;
  locs = [];
  fetched = [];
  toasts = [];
  apiByToken = {};
  clock = Date.now();
});

afterEach(async () => {
  if (plugin) await plugin.onUnload();
  logSpy.mockRestore();
  errSpy.mockRestore();
  for (const k of ENV_KEYS) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; }
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("uma conta", () => {
  test("só no Windows: mesmo formato de antes, sem ações dinâmicas", async () => {
    locs = [WIN(makeHome("win", { token: "tok-win", uuid: UUID_A, org: ORG_A, email: "ada.dev@example.com" }))];
    apiByToken["tok-win"] = usageBody(39, 12);
    await load();

    const st = plugin.getState();
    expect(st.show_usage).toEqual({ value: 39, text: "39%", status: "green", label: "Claude · Sessão 39% · renova em 3h40" });
    expect(st.usage_gauge).toEqual({ value: 12, text: "12%", status: "green", label: "Claude · Semana 12% · renova em 2d" });
    expect(Object.keys(st).sort()).toEqual(["approve", "decline", "show_usage", "usage_gauge"]);
    expect(plugin.getActions()).toEqual([]);
    expect(host.actionChanges).toBe(0);
    expect(fetched).toEqual(["tok-win"]);
  });

  test("a mesma conta no Windows e no WSL → UMA consulta, uma conta com dois locais", async () => {
    locs = [
      WIN(makeHome("win", { token: "tok-win", expiresAt: Date.now() + 1000_000, uuid: UUID_A, org: ORG_A, email: "ada.dev@example.com" })),
      WSL(makeHome("wsl", { token: "tok-wsl", expiresAt: Date.now() + 9000_000, uuid: UUID_A, org: ORG_A, email: "ada.dev@example.com" })),
    ];
    apiByToken["tok-wsl"] = usageBody(49, 20);
    apiByToken["tok-win"] = usageBody(49, 20);
    await load();

    expect(plugin.__test.accounts()).toEqual([{ id: ID_A, locations: ["win", "wsl:Ubuntu-22.04:dev"], plan: "Max 5x", stale: false }]);
    expect(fetched).toEqual(["tok-wsl"]);
    expect(plugin.getState().show_usage.label).toBe("Claude · Sessão 49% · renova em 3h40");
    expect(plugin.getActions()).toEqual([]);

    await plugin.onAction("show_usage");
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toBe("Sessão (5h): 49% · renova em 3h40\nSemana: 20% · renova em 2d\nWindows + WSL · Max 5x");
  });

  test("401 no token de um local → tenta o do outro local antes de dizer 'sessão expirada'", async () => {
    locs = [
      WIN(makeHome("win", { token: "tok-win", expiresAt: Date.now() + 9000_000, uuid: UUID_A, org: ORG_A })),
      WSL(makeHome("wsl", { token: "tok-wsl", expiresAt: Date.now() + 1000_000, uuid: UUID_A, org: ORG_A })),
    ];
    apiByToken["tok-win"] = 401;
    apiByToken["tok-wsl"] = usageBody(70, 30);
    await load();
    expect(fetched).toEqual(["tok-win", "tok-wsl"]);
    expect(plugin.getState().show_usage).toMatchObject({ value: 70, status: "amber", label: "Claude · Sessão 70% · renova em 3h40" });

    apiByToken["tok-wsl"] = 401;
    await cycle();
    expect(plugin.getState().show_usage).toEqual({ text: "–", label: "Claude · uso indisponível (sessão expirada — abra o Claude Code)" });
  });

  test("token expirado fica por último; login sem .claude.json se junta à conta pelo mesmo token", async () => {
    locs = [
      WIN(makeHome("win", { token: "tok-old", expiresAt: Date.now() - 1000, uuid: UUID_A, org: ORG_A })),
      WSL(makeHome("wsl", { token: "tok-new", expiresAt: Date.now() + 1000, uuid: UUID_A, org: ORG_A })),
    ];
    apiByToken["tok-new"] = usageBody(5, 5);
    await load();
    expect(fetched).toEqual(["tok-new"]);

    await plugin.onUnload();
    fetched = [];
    locs = [
      WIN(makeHome("win2", { token: "tok-same", uuid: UUID_A, org: ORG_A })),
      WSL(makeHome("wsl2", { token: "tok-same" })),
    ];
    apiByToken["tok-same"] = usageBody(8, 8);
    await load();
    expect(plugin.__test.accounts()).toHaveLength(1);
    expect(plugin.__test.accounts()[0].locations).toEqual(["win", "wsl:Ubuntu-22.04:dev"]);
    expect(fetched).toEqual(["tok-same"]);
  });

  test("conta local usa host.getClaudeUsage(); se ele disser 'unauthorized', vale o token do WSL", async () => {
    locs = [
      WIN(makeHome("win", { token: "tok-win", uuid: UUID_A, org: ORG_A })),
      WSL(makeHome("wsl", { token: "tok-wsl", uuid: UUID_A, org: ORG_A })),
    ];
    let hostAnswer = { available: true, session: { percent: 33, resetsAt: clock + 3600_000 }, weekly: { percent: 10 } };
    apiByToken["tok-wsl"] = usageBody(44, 11);
    await load({ getClaudeUsage: async () => hostAnswer });
    expect(fetched).toEqual([]);
    expect(plugin.getState().show_usage.label).toBe("Claude · Sessão 33% · renova em 1h00");

    hostAnswer = { available: false, reason: "unauthorized" };
    await cycle();
    expect(fetched).toEqual(["tok-wsl"]);
    expect(plugin.getState().show_usage.value).toBe(44);
  });

  test("arquivos ausentes ou inválidos: sem conta → 'faça login', nada é consultado", async () => {
    const broken = makeHome("broken");
    fs.writeFileSync(path.join(broken, ".claude", ".credentials.json"), "{ not json");
    const noToken = makeHome("notoken");
    fs.writeFileSync(path.join(noToken, ".claude", ".credentials.json"), JSON.stringify({ mcpOAuth: {} }));
    locs = [WIN(makeHome("empty")), WSL(broken), { ...WSL(noToken), id: "wsl:Debian:x" }, { ...WSL(path.join(tmp, "missing")), id: "wsl:Gone:x" }];
    await load();
    expect(fetched).toEqual([]);
    expect(plugin.__test.accounts()).toEqual([]);
    expect(plugin.getState().show_usage).toEqual({ text: "–", label: "Claude · uso indisponível (faça login no Claude Code)" });
  });
});

describe("duas contas", () => {
  async function loadTwo() {
    locs = [
      WIN(makeHome("win", { token: "tok-a", uuid: UUID_A, org: ORG_A, email: "ada.dev@example.com", tier: "default_claude_max_20x" })),
      WSL(makeHome("wsl", { token: "tok-b", uuid: UUID_B, org: ORG_B, email: "outra.conta@example.org" })),
    ];
    apiByToken["tok-a"] = usageBody(20, 80);
    apiByToken["tok-b"] = usageBody(49, 12);
    await load();
  }

  test("as duas ações existentes mostram a conta mais perto do limite (por faixa) e a nomeiam", async () => {
    await loadTwo();
    expect(fetched.sort()).toEqual(["tok-a", "tok-b"]);
    const st = plugin.getState();
    expect(st.show_usage).toEqual({ value: 49, text: "49%", status: "green", label: "Claude · WSL (Max 5x) · Sessão 49% · renova em 3h40 · +1 conta" });
    expect(st.usage_gauge).toEqual({ value: 80, text: "80%", status: "amber", label: "Claude · Windows (Max 20x) · Semana 80% · renova em 2d · +1 conta" });
  });

  test("ações dinâmicas por conta, com ids estáveis, e host.actionsChanged() avisado", async () => {
    await loadTwo();
    const actions = plugin.getActions();
    expect(actions.map((a) => [a.id, a.name])).toEqual([
      [`session.${ID_A}`, "Claude · Sessão · Windows"],
      [`week.${ID_A}`, "Claude · Semana · Windows"],
      [`session.${ID_B}`, "Claude · Sessão · WSL"],
      [`week.${ID_B}`, "Claude · Semana · WSL"],
    ]);
    for (const a of actions) {
      expect(a.id).toMatch(/^[a-z0-9_.-]+$/);
      expect(a.stateful).toBe(true);
      expect(a.icon).not.toMatch(/<svg/);
    }
    expect(host.actionChanges).toBe(1);

    const st = plugin.getState();
    expect(st[`session.${ID_B}`]).toEqual({ value: 49, text: "49%", status: "green", label: "Claude · WSL (Max 5x) · Sessão 49% · renova em 3h40" });
    expect(st[`week.${ID_A}`]).toMatchObject({ value: 80, label: "Claude · Windows (Max 20x) · Semana 80% · renova em 2d" });

    await plugin.onUnload();
    await load();
    expect(plugin.getActions().map((a) => a.id)).toEqual(actions.map((a) => a.id));
  });

  test("toast lista todas as contas com as duas faixas; a ação de uma conta mostra só ela", async () => {
    await loadTwo();
    await plugin.onAction("usage_gauge");
    expect(toasts[0]).toEqual({
      title: "Claude · Uso",
      message: "Windows (Max 20x): Sessão 20% (3h40) · Semana 80% (2d)\nWSL (Max 5x): Sessão 49% (3h40) · Semana 12% (2d)",
    });
    await plugin.onAction(`session.${ID_B}`);
    expect(toasts[1].message).toBe("WSL (Max 5x)\nSessão (5h): 49% · renova em 3h40\nSemana: 12% · renova em 2d");
    const xml = plugin._internals.toastXml(toasts[0].title, toasts[0].message + "\n<x> & 'y'");
    expect(xml).toContain("&lt;x&gt; &amp; &apos;y&apos;");
  });

  test("uma conta falha, a outra não: o botão mostra a que tem dados; cada conta tem seu erro", async () => {
    await loadTwo();
    apiByToken["tok-b"] = 401;
    await cycle();
    const st = plugin.getState();
    expect(st.show_usage.label).toBe("Claude · Windows (Max 20x) · Sessão 20% · renova em 3h39 · +1 conta");
    expect(st[`session.${ID_B}`]).toEqual({ text: "–", label: "Claude · WSL (Max 5x) · uso indisponível (sessão expirada — abra o Claude Code)" });
  });

  test("duas contas no MESMO local-rótulo → o nome ganha a parte local do e-mail (nunca o domínio)", async () => {
    locs = [
      WSL(makeHome("u1", { token: "tok-a", uuid: UUID_A, org: ORG_A, email: "ada.dev@example.com" }), { id: "wsl:Ubuntu-22.04:a" }),
      WSL(makeHome("u2", { token: "tok-b", uuid: UUID_B, org: ORG_B, email: "outra.conta@example.org" }), { id: "wsl:Ubuntu-22.04:b" }),
    ];
    apiByToken["tok-a"] = usageBody(1, 1);
    apiByToken["tok-b"] = usageBody(2, 2);
    await load();
    const names = plugin.getActions().map((a) => a.name);
    expect(names).toContain("Claude · Sessão · WSL (ada.dev)");
    expect(names).toContain("Claude · Sessão · WSL (outra.conta)");
    expect(plugin.getState().show_usage.label).toBe("Claude · WSL (outra.conta, Max 5x) · Sessão 2% · renova em 3h40 · +1 conta");
    const everything = JSON.stringify([plugin.getState(), plugin.getActions()]);
    for (const secret of ["example.com", "example.org", "tok-a", "tok-b", UUID_A, UUID_B, ORG_A, ORG_B]) expect(everything).not.toContain(secret);
  });

  test("WSL para: a conta fica com os últimos dados marcados 'WSL parado' e seus arquivos não são mais lidos", async () => {
    await loadTwo();
    const wslHome = locs[1].home;
    locs = [locs[0], { ...locs[1], stale: true }];
    fs.rmSync(wslHome, { recursive: true, force: true });
    apiByToken["tok-b"] = 401;
    await cycle();

    expect(plugin.__test.accounts()).toEqual([
      { id: ID_A, locations: ["win"], plan: "Max 20x", stale: false },
      { id: ID_B, locations: ["wsl:Ubuntu-22.04:dev"], plan: "Max 5x", stale: true },
    ]);
    expect(plugin.getState()[`session.${ID_B}`]).toMatchObject({ value: 49, label: "Claude · WSL (Max 5x) · Sessão 49% · renova em 3h39 · WSL parado" });
    expect(plugin.getActions()).toHaveLength(4);
  });

  test("conta lembrada entre reinícios: ação continua listada e lê 'conta indisponível'", async () => {
    await loadTwo();
    const file = path.join(process.env.ORBIT_HOME, "claude-accounts.json");
    const saved = fs.readFileSync(file, "utf8");
    expect(JSON.parse(saved).accounts.map((a) => [a.id, a.name])).toEqual([[ID_A, "Windows"], [ID_B, "WSL"]]);
    for (const secret of ["tok-a", "tok-b", UUID_A, UUID_B, "example", "@"]) expect(saved).not.toContain(secret);

    await plugin.onUnload();
    locs = [locs[0]];
    fetched = [];
    await load();
    expect(plugin.getActions().map((a) => a.id)).toEqual([`session.${ID_A}`, `week.${ID_A}`, `session.${ID_B}`, `week.${ID_B}`]);
    const st = plugin.getState();
    expect(st[`session.${ID_B}`]).toEqual({ text: "–", label: "Claude · WSL · conta indisponível" });
    expect(st.show_usage.label).toBe("Claude · Sessão 20% · renova em 3h40");
    expect(await plugin.onAction(`week.${ID_B}`)).toEqual({ available: false, reason: "account_unavailable" });
    expect(toasts[toasts.length - 1].message).toBe("WSL: conta indisponível");
    expect(fetched).toEqual(["tok-a"]);
  });

  test("no máximo uma consulta por conta a cada ~60 s", async () => {
    await loadTwo();
    fetched = [];
    await cycle(20_000);
    expect(fetched).toEqual([]);
    await cycle(41_000);
    expect(fetched.sort()).toEqual(["tok-a", "tok-b"]);
  });
});

test("planLabel", () => {
  jest.resetModules();
  const { planLabel } = require(path.join(PLUGIN_DIR, "index.js"))._internals;
  expect(planLabel("max", "default_claude_max_5x")).toBe("Max 5x");
  expect(planLabel("max", "default_claude_max_20x")).toBe("Max 20x");
  expect(planLabel("max", "")).toBe("Max");
  expect(planLabel("pro", "default_claude_pro")).toBe("Pro");
  expect(planLabel("team", undefined)).toBe("Team");
  expect(planLabel(undefined, undefined)).toBe("");
  expect(planLabel("something_new", "tier_x")).toBe("");
});
