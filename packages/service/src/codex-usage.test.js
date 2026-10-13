const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const PLUGIN_DIR = path.resolve(__dirname, "../../../plugins/codex-usage");
const T0 = Date.parse("2026-10-13T12:00:00Z");
const HOUR = 3600_000;
const DAY = 24 * HOUR;

let tmp, winHome, wslHome, plugin, host, clock, requests, reply, locs, reads, touched, toasts, logSpy;

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function jwt(expMs, authClaims = {}) {
  const payload = { sub: "user", "https://api.openai.com/auth": authClaims };
  if (expMs !== undefined) payload.exp = Math.floor(expMs / 1000);
  return `${b64({ alg: "none" })}.${b64(payload)}.sig`;
}

function setMtime(file, ms) {
  fs.utimesSync(file, new Date(ms), new Date(ms));
}

function writeAuth(home, opts = {}) {
  const dir = path.join(home, ".codex");
  fs.mkdirSync(dir, { recursive: true });
  const data = { auth_mode: opts.tokens === false ? "apikey" : "chatgpt", OPENAI_API_KEY: opts.apiKey || null, last_refresh: "2026-10-06T21:07:49Z" };
  if (opts.tokens !== false) {
    data.tokens = {
      id_token: jwt(T0 + HOUR, { chatgpt_plan_type: opts.plan || "team" }),
      access_token: opts.accessToken !== undefined ? opts.accessToken : jwt(opts.expMs !== undefined ? opts.expMs : T0 + 3 * DAY),
      refresh_token: "rt-SECRET-never-used",
      account_id: opts.accountId || "acct-A",
    };
  }
  const file = path.join(dir, "auth.json");
  fs.writeFileSync(file, JSON.stringify(data));
  setMtime(file, opts.mtime || T0 - DAY);
  return file;
}

function snapLine(atMs, { primary = 67, secondary = 10, primaryResetMs, secondaryResetMs, plan = "team", extra = {}, primaryMinutes = 300 } = {}) {
  return JSON.stringify({
    timestamp: new Date(atMs).toISOString(),
    type: "event_msg",
    payload: {
      type: "token_count",
      info: { total_token_usage: { total_tokens: 1 } },
      rate_limits: {
        limit_id: "codex",
        limit_name: null,
        primary: { used_percent: primary, window_minutes: primaryMinutes, resets_at: Math.floor((primaryResetMs !== undefined ? primaryResetMs : atMs + 5 * HOUR) / 1000) },
        secondary: { used_percent: secondary, window_minutes: 10080, resets_at: Math.floor((secondaryResetMs !== undefined ? secondaryResetMs : atMs + 7 * DAY) / 1000) },
        credits: { has_credits: false, unlimited: false, balance: "0" },
        plan_type: plan,
        ...extra,
      },
    },
  });
}

function writeRollout(home, day, name, lines, mtime) {
  const dir = path.join(home, ".codex", "sessions", ...day.split("/"));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `rollout-${name}.jsonl`);
  fs.writeFileSync(file, lines.join("\n") + "\n");
  setMtime(file, mtime);
  return file;
}

function spyFsp() {
  const note = (p) => touched.push(String(p));
  return {
    stat: (p) => { note(p); return fs.promises.stat(p); },
    readFile: (p, enc) => { note(p); return fs.promises.readFile(p, enc); },
    readdir: (p) => { note(p); return fs.promises.readdir(p); },
    open: async (p, flags) => {
      note(p);
      const fh = await fs.promises.open(p, flags);
      return {
        read: (buf, off, len, pos) => { reads.push({ file: String(p), len, pos }); return fh.read(buf, off, len, pos); },
        close: () => fh.close(),
      };
    },
  };
}

const WIN = () => ({ id: "win", kind: "windows", home: winHome, label: "Windows", short: "Windows", stale: false });
const WSL = (stale = false) => ({ id: "wsl:Ubuntu-22.04:devuser", kind: "wsl", home: wslHome, label: "WSL · Ubuntu", short: "WSL", distro: "Ubuntu-22.04", user: "devuser", stale });

function makeHost() {
  const h = { stateChanges: 0, actionChanges: 0, stateChanged() { h.stateChanges++; }, actionsChanged() { h.actionChanges++; } };
  return h;
}

async function load() {
  jest.resetModules();
  plugin = require(path.join(PLUGIN_DIR, "index.js"));
  plugin.__test.configure({
    locator: { discover: async () => locs.map((l) => ({ ...l })), reset() {} },
    http: async (req) => { requests.push(req); return typeof reply === "function" ? reply(req) : reply; },
    fsp: spyFsp(),
    now: () => clock,
    showToast: (title, message) => toasts.push({ title, message }),
    orbitHome: path.join(tmp, "orbit"),
  });
  host = makeHost();
  plugin.onLoad(host);
  await plugin.__test.refresh(false);
}

async function tick(ms = 61_000) {
  clock += ms;
  await plugin.__test.refresh(false);
}

const livePayload = (over = {}) => ({
  plan_type: "pro",
  rate_limit: {
    allowed: true,
    limit_reached: false,
    primary_window: { used_percent: 42, limit_window_seconds: 18000, reset_after_seconds: 7800, reset_at: Math.floor(T0 / 1000) + 7800 },
    secondary_window: { used_percent: 88, limit_window_seconds: 604800, reset_after_seconds: 273600, reset_at: Math.floor(T0 / 1000) + 273600 },
  },
  credits: { has_credits: true, unlimited: false, balance: "1234.5" },
  ...over,
});

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-codex-test-"));
  winHome = path.join(tmp, "win");
  wslHome = path.join(tmp, "wslroot", "Ubuntu-22.04", "home", "devuser");
  fs.mkdirSync(winHome, { recursive: true });
  fs.mkdirSync(wslHome, { recursive: true });
  clock = T0;
  requests = [];
  reads = [];
  touched = [];
  toasts = [];
  reply = { status: 0, data: null };
  locs = [WIN()];
  plugin = null;
  logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  if (plugin) plugin.onUnload();
  logSpy.mockRestore();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("exp do access_token (JWT decodificado localmente, sem verificar)", () => {
  const internals = () => require(path.join(PLUGIN_DIR, "index.js"))._internals;

  test("válido → exp em ms e utilizável", () => {
    const { decodeJwt, tokenUsable } = internals();
    const token = jwt(T0 + HOUR);
    expect(decodeJwt(token).exp).toBe(Math.floor((T0 + HOUR) / 1000) * 1000);
    expect(tokenUsable(token, T0)).toBe(true);
  });

  test("expirado (ou a segundos de expirar) → não utilizável", () => {
    const { tokenUsable } = internals();
    expect(tokenUsable(jwt(T0 - 1000), T0)).toBe(false);
    expect(tokenUsable(jwt(T0 + 5000), T0)).toBe(false);
  });

  test("malformado, opaco ou sem exp → nunca utilizável", () => {
    const { decodeJwt, tokenUsable } = internals();
    for (const bad of ["", "abc", "a.b", "a.b.c.d", "a.!!!.c", `x.${Buffer.from("[1]").toString("base64url")}.y`, null, undefined, 42]) {
      expect(decodeJwt(bad)).toBeNull();
      expect(tokenUsable(bad, T0)).toBe(false);
    }
    const noExp = jwt(undefined);
    expect(decodeJwt(noExp).exp).toBe(0);
    expect(tokenUsable(noExp, T0)).toBe(false);
  });
});

describe("caminho ao vivo (GET /wham/usage)", () => {
  test("mapeia a resposta e chama só o endpoint de uso, com os cabeçalhos do Codex", async () => {
    writeAuth(winHome, { accountId: "acct-A" });
    reply = { status: 200, data: livePayload() };
    await load();

    const st = plugin.getState();
    expect(st.session).toEqual({ value: 42, text: "42%", status: "green", label: "Codex · Windows (Pro) · Sessão 42% · renova em 2h10" });
    expect(st.week).toEqual({ value: 88, text: "88%", status: "red", label: "Codex · Windows (Pro) · Semana 88% · renova em 3d 4h" });
    expect(plugin.__test.accounts()).toEqual([expect.objectContaining({ locations: ["win"], plan: "Pro", source: "live" })]);
    expect(host.stateChanges).toBeGreaterThan(0);

    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("GET");
    expect(requests[0].url).toBe("https://chatgpt.com/backend-api/wham/usage");
    expect(requests[0].headers.Authorization).toMatch(/^Bearer [\w-]+\.[\w-]+\.sig$/);
    expect(requests[0].headers["ChatGPT-Account-Id"]).toBe("acct-A");
    expect(requests[0].timeoutMs).toBeLessThanOrEqual(5000);
  });

  test("mapLiveUsage: janelas ausentes, reset relativo e créditos", () => {
    const { mapLiveUsage } = require(path.join(PLUGIN_DIR, "index.js"))._internals;
    const u = mapLiveUsage(livePayload(), T0);
    expect(u).toMatchObject({ source: "live", at: T0, plan: "Pro", credits: { unlimited: false, balance: "1234.5" } });
    expect(u.primary).toEqual({ percent: 42, windowMinutes: 300, resetsAt: T0 + 7800_000 });
    expect(u.secondary.windowMinutes).toBe(10080);

    const bare = mapLiveUsage({ plan_type: "plus", rate_limit: null }, T0);
    expect(bare).toMatchObject({ plan: "Plus", primary: null, secondary: null, credits: null });

    const relative = mapLiveUsage({ plan_type: "free", rate_limit: { primary_window: { used_percent: 5, limit_window_seconds: 0, reset_after_seconds: 60 } } }, T0);
    expect(relative.primary).toEqual({ percent: 5, windowMinutes: null, resetsAt: T0 + 60_000 });

    const idle = mapLiveUsage({ plan_type: "team", rate_limit: { primary_window: { used_percent: 0, limit_window_seconds: 18000, reset_after_seconds: 18000, reset_at: Math.floor(T0 / 1000) + 18000 } } }, T0);
    expect(idle.primary).toEqual({ percent: 0, windowMinutes: 300, resetsAt: undefined });

    for (const junk of [null, "x", [], {}, { error: "nope" }]) expect(mapLiveUsage(junk, T0)).toBeNull();
  });

  test("no máximo uma chamada por conta por minuto, mesmo clicando", async () => {
    writeAuth(winHome);
    reply = { status: 200, data: livePayload() };
    await load();
    await plugin.onAction("session");
    await plugin.onAction("week");
    expect(requests).toHaveLength(1);
    await tick();
    expect(requests).toHaveLength(2);
  });

  test("401 → para de chamar até o mtime do auth.json mudar", async () => {
    const file = writeAuth(winHome, { mtime: T0 - DAY });
    reply = { status: 401, data: { detail: "expired" } };
    await load();
    expect(requests).toHaveLength(1);
    expect(plugin.getState().session).toEqual({ text: "–", label: "Codex · Windows (Team) · sem dados de uso (abra o Codex para atualizar)" });

    await tick();
    await tick();
    await plugin.onAction("session");
    expect(requests).toHaveLength(1);

    setMtime(file, T0 + 30_000);
    reply = { status: 200, data: livePayload() };
    await tick();
    expect(requests).toHaveLength(2);
    expect(plugin.getState().session.value).toBe(42);
  });

  test("403 também bloqueia; falha de rede não (tenta de novo no minuto seguinte)", async () => {
    writeAuth(winHome);
    reply = { status: 0, data: null };
    await load();
    expect(plugin.getState().session.label).toBe("Codex · Windows (Team) · sem dados de uso (falha na API de uso)");
    reply = { status: 403, data: null };
    await tick();
    expect(requests).toHaveLength(2);
    await tick();
    expect(requests).toHaveLength(2);
  });

  test("token expirado ou malformado → nenhuma chamada de rede", async () => {
    writeAuth(winHome, { expMs: T0 - HOUR });
    locs = [WIN(), WSL()];
    writeAuth(wslHome, { accountId: "acct-B", accessToken: "opaque-token-not-a-jwt" });
    await load();
    await tick();
    expect(requests).toHaveLength(0);
  });

  test("NUNCA renova token: nenhum pedido a endpoint de token, nenhum POST, refresh_token nunca enviado", async () => {
    writeAuth(winHome, { accountId: "acct-A", expMs: T0 - HOUR });
    locs = [WIN(), WSL()];
    writeAuth(wslHome, { accountId: "acct-B" });
    const replies = [{ status: 401, data: null }, { status: 0, data: null }, { status: 200, data: livePayload() }];
    reply = () => replies.shift() || { status: 500, data: null };
    await load();
    for (let i = 0; i < 4; i++) await tick();
    await plugin.onAction("session");

    expect(requests.length).toBeGreaterThan(0);
    for (const r of requests) {
      expect(r.method).toBe("GET");
      expect(r.url).toBe("https://chatgpt.com/backend-api/wham/usage");
      expect(r.url).not.toMatch(/token|oauth|auth\.openai/i);
      expect(r.body).toBeUndefined();
      expect(JSON.stringify(r)).not.toContain("rt-SECRET-never-used");
    }
  });

  test("nada é escrito nas pastas do Codex", async () => {
    const authFile = writeAuth(winHome);
    writeRollout(winHome, "2026/10/07", "a", [snapLine(T0 - 6 * DAY)], T0 - 6 * DAY);
    const before = () => fs.readdirSync(path.join(winHome, ".codex"), { recursive: true }).sort().join("|");
    const listing = before();
    const stat = fs.statSync(authFile);
    reply = { status: 200, data: livePayload() };
    await load();
    await tick();
    await plugin.onAction("week");
    expect(before()).toBe(listing);
    expect(fs.statSync(authFile).mtimeMs).toBe(stat.mtimeMs);
    expect(fs.statSync(authFile).size).toBe(stat.size);
  });
});

describe("snapshot local (rollout-*.jsonl)", () => {
  const expired = { expMs: T0 - HOUR };

  test("lê só o fim do arquivo e pega o snapshot mais novo", async () => {
    writeAuth(winHome, expired);
    const at = T0 - 2 * HOUR;
    const filler = JSON.stringify({ timestamp: "x", type: "response_item", payload: { text: "y".repeat(1000) } });
    const lines = [
      snapLine(at - HOUR, { primary: 99 }),
      ...Array.from({ length: 400 }, () => filler),
      snapLine(at - 60_000, { primary: 50 }),
      JSON.stringify({ timestamp: new Date(at).toISOString(), type: "event_msg", payload: { type: "token_count", rate_limits: null } }),
      snapLine(at, { primary: 67, secondary: 10 }),
      JSON.stringify({ timestamp: "z", type: "response_item", payload: { type: "message" } }),
    ];
    const file = writeRollout(winHome, "2026/10/13", "2026-10-13T10-00-00-aaa", lines, at);
    const size = fs.statSync(file).size;
    await load();

    const { TAIL_BYTES } = plugin._internals;
    expect(size).toBeGreaterThan(TAIL_BYTES);
    expect(reads).toEqual([{ file, len: TAIL_BYTES, pos: size - TAIL_BYTES }]);
    expect(plugin.getState().session).toEqual({
      value: 67, text: "67%", status: "amber",
      label: "Codex · Windows (Team) · Sessão 67% · renova em 3h00 · lido há 2h",
    });
    expect(plugin.__test.accounts()[0].source).toBe("snapshot");

    await tick();
    expect(reads).toHaveLength(1);
  });

  test("parseRolloutTail: primeira linha cortada é ignorada; outros limit_id e linhas quebradas também", () => {
    const { parseRolloutTail } = require(path.join(PLUGIN_DIR, "index.js"))._internals;
    const good = snapLine(T0 - HOUR, { primary: 12 });
    const cut = snapLine(T0, { primary: 90 });
    expect(parseRolloutTail(`${cut}\n${good}\n`, true, 1).primary.percent).toBe(12);
    expect(parseRolloutTail(`${cut}\n${good}\n`, false, 1).primary.percent).toBe(12);
    expect(parseRolloutTail(`${good}\n${cut}`, false, 1).primary.percent).toBe(90);
    const other = snapLine(T0, { primary: 77, extra: { limit_id: "codex_other" } });
    expect(parseRolloutTail(`${good}\n${other}\n{"rate_limits": broken\n`, false, 1).primary.percent).toBe(12);
    expect(parseRolloutTail(`{"type":"x"}\n`, false, 1)).toBeNull();
    const legacy = JSON.stringify({ rate_limits: { primary: { used_percent: 30, window_minutes: 300, resets_in_seconds: 600 } } });
    expect(parseRolloutTail(legacy, false, 5000)).toMatchObject({ at: 5000, primary: { percent: 30, resetsAt: 605_000 }, secondary: null });
  });

  test("resets_at no passado → 0% com 'sem uso desde', em vez da porcentagem velha; idade em dias na outra janela", async () => {
    writeAuth(winHome, expired);
    const at = T0 - 6 * DAY - 2 * HOUR;
    writeRollout(winHome, "2026/10/07", "2026-10-07T05-28-48-bbb", [snapLine(at, { primary: 67, secondary: 10, secondaryResetMs: T0 + DAY + 4 * HOUR })], at);
    await load();

    const st = plugin.getState();
    expect(st.session.value).toBe(0);
    expect(st.session.text).toBe("0%");
    expect(st.session.label).toMatch(/^Codex · Windows \(Team\) · Sessão 0% · sem uso desde \d\d\/\d\d \d\d:\d\d$/);
    expect(st.session.status).toBeUndefined();
    expect(st.week).toEqual({
      value: 10, text: "10%", status: "green",
      label: "Codex · Windows (Team) · Semana 10% · renova em 1d 4h · lido há 6 dias",
    });
  });

  test("texto da idade: minutos, horas, 1 dia, N dias; sem cor quando mais velho que a janela", async () => {
    writeAuth(winHome, expired);
    const file = writeRollout(winHome, "2026/10/13", "c", [snapLine(T0 - 12 * 60_000, { primaryMinutes: 60, primaryResetMs: T0 + 40 * DAY, secondaryResetMs: T0 + 40 * DAY })], T0 - 12 * 60_000);
    await load();
    expect(plugin.getState().session.label).toContain("· lido há 12min");
    expect(plugin.getState().session.status).toBe("amber");

    await tick(2 * HOUR);
    expect(plugin.getState().session.label).toContain("· lido há 2h");
    expect(plugin.getState().session.status).toBeUndefined();
    expect(plugin.getState().week.status).toBe("green");

    await tick(DAY);
    expect(plugin.getState().week.label).toContain("· lido há 1 dia");
    await tick(7 * DAY);
    expect(plugin.getState().week.label).toContain("· lido há 8 dias");
    expect(plugin.getState().week.status).toBeUndefined();
    expect(fs.existsSync(file)).toBe(true);
  });

  test("vários arquivos: vale o snapshot mais recente, e a resposta ao vivo ganha do snapshot", async () => {
    writeAuth(winHome);
    writeRollout(winHome, "2026/10/11", "old", [snapLine(T0 - 2 * DAY, { primary: 11 })], T0 - 2 * DAY);
    writeRollout(winHome, "2026/10/12", "started-earlier", [snapLine(T0 - HOUR, { primary: 33 })], T0 - HOUR);
    writeRollout(winHome, "2026/10/13", "no-limits", [JSON.stringify({ timestamp: new Date(T0 - 60_000).toISOString(), type: "response_item" })], T0 - 60_000);
    reply = { status: 0, data: null };
    await load();
    expect(plugin.getState().session.value).toBe(33);
    expect(plugin.getState().session.label).toContain("lido há 1h");

    reply = { status: 200, data: livePayload() };
    await tick();
    expect(plugin.getState().session.label).toBe("Codex · Windows (Pro) · Sessão 42% · renova em 2h09");
    expect(plugin.__test.accounts()[0].source).toBe("live");
  });
});

describe("várias contas e vários locais", () => {
  const expired = { expMs: T0 - HOUR };
  const acct8 = (id) => crypto.createHash("sha256").update(id).digest("hex").slice(0, 8);

  test("mesma conta no Windows e no WSL → uma conta, dois locais, dado mais fresco", async () => {
    locs = [WIN(), WSL()];
    writeAuth(winHome, { accountId: "acct-A", ...expired });
    writeAuth(wslHome, { accountId: "acct-A", ...expired });
    writeRollout(winHome, "2026/05/11", "win", [snapLine(T0 - 155 * DAY, { primary: 5 })], T0 - 155 * DAY);
    writeRollout(wslHome, "2026/10/13", "wsl", [snapLine(T0 - HOUR, { primary: 67 })], T0 - HOUR);
    await load();

    expect(plugin.__test.accounts()).toEqual([
      { id: acct8("acct-A"), locations: ["win", "wsl:Ubuntu-22.04:devuser"], plan: "Team", source: "snapshot", stale: false },
    ]);
    expect(plugin.getState().session.label).toBe("Codex · Windows + WSL (Team) · Sessão 67% · renova em 4h00 · lido há 1h");
    expect(plugin.getActions()).toEqual([]);
    expect(Object.keys(plugin.getState())).toEqual(["session", "week"]);
  });

  test("mesma conta, dois locais: uma única chamada ao vivo, com o token que vence por último", async () => {
    locs = [WIN(), WSL()];
    writeAuth(winHome, { accountId: "acct-A", expMs: T0 + DAY });
    writeAuth(wslHome, { accountId: "acct-A", expMs: T0 + 2 * DAY });
    reply = { status: 200, data: livePayload() };
    await load();
    expect(requests).toHaveLength(1);
    const sent = requests[0].headers.Authorization.replace("Bearer ", "");
    expect(plugin._internals.decodeJwt(sent).exp).toBe(Math.floor((T0 + 2 * DAY) / 1000) * 1000);
  });

  test("duas contas → a pior primeiro, '+1 conta' e ações estáveis por conta", async () => {
    locs = [WIN(), WSL()];
    writeAuth(winHome, { accountId: "acct-A", plan: "plus", ...expired });
    writeAuth(wslHome, { accountId: "acct-B", plan: "team", ...expired });
    writeRollout(winHome, "2026/10/13", "win", [snapLine(T0 - HOUR, { primary: 20, secondary: 90, plan: "plus" })], T0 - HOUR);
    writeRollout(wslHome, "2026/10/13", "wsl", [snapLine(T0 - HOUR, { primary: 80, secondary: 30 })], T0 - HOUR);
    await load();

    const a = acct8("acct-A"), b = acct8("acct-B");
    const st = plugin.getState();
    expect(st.session.label).toBe("Codex · WSL (Team) · Sessão 80% · renova em 4h00 · lido há 1h · +1 conta");
    expect(st.session).toMatchObject({ value: 80, status: "amber" });
    expect(st.week.label).toBe("Codex · Windows (Plus) · Semana 90% · renova em 6d 23h · lido há 1h · +1 conta");
    expect(st.week).toMatchObject({ value: 90, status: "red" });

    expect(plugin.getActions().map((x) => x.id)).toEqual([`session.${a}`, `week.${a}`, `session.${b}`, `week.${b}`]);
    expect(plugin.getActions()[2]).toMatchObject({ name: "Codex · Sessão · WSL", stateful: true });
    expect(host.actionChanges).toBe(1);
    expect(st[`session.${a}`].value).toBe(20);
    expect(st[`session.${b}`].label).toBe("Codex · WSL (Team) · Sessão 80% · renova em 4h00 · lido há 1h");

    const saved = fs.readFileSync(path.join(tmp, "orbit", "codex-accounts.json"), "utf8");
    expect(saved).not.toMatch(/acct-A|acct-B|rt-SECRET/);
    expect(JSON.parse(saved).accounts.map((x) => [x.id, x.name])).toEqual([[a, "Windows"], [b, "WSL"]]);

    await plugin.onAction(`week.${b}`);
    expect(toasts.pop().message).toBe("Sessão (5h): 80% · renova em 4h00\nSemana: 30% · renova em 6d 23h\nWSL · Team · lido há 1h");
    await plugin.onAction("session");
    expect(toasts.pop().message).toBe(
      "Windows (Plus): Sessão 20% (4h00) · Semana 90% (6d 23h) · lido há 1h\nWSL (Team): Sessão 80% (4h00) · Semana 30% (6d 23h) · lido há 1h"
    );
  });

  test("distro WSL parada: os últimos números ficam, marcados 'WSL parado', e a pasta não é mais lida", async () => {
    locs = [WIN(), WSL()];
    writeAuth(wslHome, { accountId: "acct-B", ...expired });
    writeRollout(wslHome, "2026/10/13", "wsl", [snapLine(T0 - HOUR, { primary: 80 })], T0 - HOUR);
    await load();
    expect(plugin.getState().session.label).toBe("Codex · WSL (Team) · Sessão 80% · renova em 4h00 · lido há 1h");

    locs = [WIN(), WSL(true)];
    touched.length = 0;
    await tick();
    await plugin.onAction("session");
    expect(touched.filter((p) => p.startsWith(wslHome))).toEqual([]);
    expect(plugin.getState().session.label).toBe("Codex · WSL (Team) · Sessão 80% · renova em 3h59 · lido há 1h · WSL parado");
    expect(plugin.__test.accounts()[0].stale).toBe(true);
  });

  test("um local que falha não bloqueia os outros", async () => {
    locs = [WIN(), WSL()];
    writeAuth(winHome, { accountId: "acct-A", ...expired });
    writeRollout(winHome, "2026/10/13", "win", [snapLine(T0 - HOUR, { primary: 20 })], T0 - HOUR);
    fs.mkdirSync(path.join(wslHome, ".codex"), { recursive: true });
    fs.writeFileSync(path.join(wslHome, ".codex", "auth.json"), "{ not json");
    await load();
    expect(plugin.getState().session.value).toBe(20);
    expect(plugin.__test.accounts()).toHaveLength(1);
  });
});

describe("sem login do ChatGPT", () => {
  test("só chave de API → 'Codex com chave de API · sem cota para mostrar'", async () => {
    writeAuth(winHome, { tokens: false, apiKey: "sk-SECRET-KEY" });
    await load();
    const expected = { text: "–", label: "Codex com chave de API · sem cota para mostrar" };
    expect(plugin.getState()).toEqual({ session: expected, week: expected });
    expect(requests).toHaveLength(0);
    await plugin.onAction("session");
    expect(toasts.pop()).toEqual({ title: "Codex · Uso", message: "Codex com chave de API · sem cota para mostrar" });
    expect(JSON.stringify(plugin.getState())).not.toContain("sk-SECRET");
  });

  test("conta do ChatGPT em um local e chave de API em outro → a conta aparece, a chave vai só para a notificação", async () => {
    locs = [WIN(), WSL()];
    writeAuth(winHome, { tokens: false, apiKey: "sk-SECRET-KEY" });
    writeAuth(wslHome, { accountId: "acct-B" });
    reply = { status: 200, data: livePayload() };
    await load();
    expect(plugin.getState().session.label).toBe("Codex · WSL (Pro) · Sessão 42% · renova em 2h10");
    await plugin.onAction("session");
    expect(toasts.pop().message).toBe(
      "Sessão (5h): 42% · renova em 2h10\nSemana: 88% · renova em 3d 4h\nWSL · Pro · ao vivo · créditos: 1.234,5\nWindows: chave de API (sem cota para mostrar)"
    );
  });

  test("sem auth.json → não conectado; antes do primeiro ciclo → carregando", async () => {
    jest.resetModules();
    plugin = require(path.join(PLUGIN_DIR, "index.js"));
    plugin.__test.configure({ locator: { discover: () => new Promise(() => {}), reset() {} }, orbitHome: null });
    expect(plugin.getState().session).toEqual({ text: "…", label: "Codex · carregando uso…" });

    await load();
    expect(plugin.getState().week).toEqual({ text: "–", label: "Codex · não conectado (faça login com `codex`)" });
  });

  test("sob o jest, sem injeção, o plugin não procura nada na máquina real", async () => {
    jest.resetModules();
    plugin = require(path.join(PLUGIN_DIR, "index.js"));
    plugin.onLoad(makeHost());
    await plugin.__test.refresh(false);
    expect(plugin.__test.accounts()).toEqual([]);
    expect(plugin.getState().session.label).toBe("Codex · não conectado (faça login com `codex`)");
  });
});

describe("manifesto", () => {
  test("id, ações e ícones no formato do ring", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN_DIR, "manifest.json"), "utf8"));
    expect(manifest).toMatchObject({ id: "com.orbitring.codex", name: "Codex", main: "index.js" });
    expect(manifest.actions.map((a) => [a.id, a.name])).toEqual([["session", "Codex · Sessão (5h)"], ["week", "Codex · Semana"]]);
    for (const a of manifest.actions) {
      expect(a.stateful).toBe(true);
      expect(a.icon).not.toMatch(/<svg|"/);
    }
  });
});
