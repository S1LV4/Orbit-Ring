const fs = require("fs");
const os = require("os");
const path = require("path");

const PLUGIN_DIR = path.resolve(__dirname, "../../../plugins/antigravity-usage");
const cliLib = require(path.join(PLUGIN_DIR, "cli.js"));
const { createLocator } = require(path.join(PLUGIN_DIR, "locations.js"));

const T0 = Date.parse("2026-09-20T08:00:00Z");
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const iso = (ms) => new Date(ms).toISOString();

const CLIENT_ID = `${"1234567890"}-${"abcdefghijklmnopqrstuvwxyz012345"}.apps.googleusercontent.com`;
const OTHER_CLIENT_ID = `${"9876543210"}-${"zyxwvutsrqponmlkjihgfedcba543210"}.apps.googleusercontent.com`;
const CLIENT_SECRET = ["GOC", "SPX-"].join("") + "s".repeat(28);
const OTHER_SECRET = ["GOC", "SPX-"].join("") + "o".repeat(28);
const ACCESS = `ya29.${"A".repeat(60)}`;
const FRESH_ACCESS = `ya29.${"F".repeat(60)}`;
const REFRESH = `1//${"R".repeat(60)}`;
const EMAIL = "ada.lovelace@example.com";
const CSRF = "11111111-2222-3333-4444-555555555555";
const SECRETS = [CLIENT_SECRET, OTHER_SECRET, ACCESS, FRESH_ACCESS, REFRESH, CSRF, EMAIL, "ada.lovelace", "example.com"];

const HOST_TOKEN = "oauth2.googleapis.com";
const HOST_DAILY = "daily-cloudcode-pa.googleapis.com";
const HOST_PROD = "cloudcode-pa.googleapis.com";

let tmp, wslRoot, distroDir, home, winHome, cacheFile, clock, plugin, host, toasts, logSpy, errSpy, warnSpy;

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const idToken = (claims) => `${b64({ alg: "RS256" })}.${b64(claims)}.c2lnbmF0dXJl`;

function tokenJson({ expiry = iso(T0 + HOUR), email = EMAIL, aud = CLIENT_ID, access = ACCESS, refresh = REFRESH } = {}) {
  return JSON.stringify({
    token: { access_token: access, token_type: "Bearer", refresh_token: refresh, expiry },
    auth_method: "oauth",
    id_token: idToken({ iss: "https://accounts.google.com", aud, azp: aud, sub: "108000000000000000001", email, name: "Ada Lovelace" }),
  });
}

function writeToken(json, mtime = T0 - 2 * DAY, dir = home) {
  const file = path.join(dir, ".gemini", "antigravity-cli", "antigravity-oauth-token");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, json);
  fs.utimesSync(file, new Date(mtime), new Date(mtime));
  return file;
}

function writeProc(pid, argv, root = distroDir) {
  const dir = path.join(root, "proc", String(pid));
  fs.mkdirSync(dir, { recursive: true });
  if (argv !== null) fs.writeFileSync(path.join(dir, "cmdline"), argv.length ? `${argv.join("\0")}\0` : "");
}

function trackingFsp() {
  const seen = [];
  const fsp = new Proxy(fs.promises, {
    get(target, prop) {
      const v = target[prop];
      if (typeof v !== "function") return v;
      return (...args) => { if (typeof args[0] === "string") seen.push(`${String(prop)} ${args[0]}`); return v.apply(target, args); };
    },
  });
  fsp.seen = seen;
  return fsp;
}

const wslLoc = (over = {}) => ({ id: "wsl:Ubuntu-22.04:devuser", kind: "wsl", home, distro: "Ubuntu-22.04", user: "devuser", label: "WSL · Ubuntu", short: "WSL", stale: false, ...over });
const winLoc = () => ({ id: "win", kind: "windows", home: winHome, label: "Windows", short: "Windows", stale: false });

const summaryBody = (g5 = 0.58, gw = 0.82, o5 = 0.25, ow = 0.6) => ({
  groups: [
    { displayName: "Gemini Models", buckets: [
      { bucketId: "gemini-weekly", displayName: "Weekly Limit Remaining", window: "weekly", remainingFraction: gw, resetTime: iso(T0 + 4 * DAY + 2 * HOUR) },
      { bucketId: "gemini-5h", displayName: "Five Hour Limit Remaining", window: "5h", remainingFraction: g5, resetTime: iso(T0 + 130 * 60_000) },
    ] },
    { displayName: "Claude and GPT models", buckets: [
      { bucketId: "3p-weekly", window: "weekly", remainingFraction: ow, resetTime: iso(T0 + 6 * DAY) },
      { bucketId: "3p-5h", window: "5h", remainingFraction: o5, resetTime: iso(T0 + 4 * HOUR) },
    ] },
  ],
});
const LOAD_BODY = { currentTier: { id: "free-tier", name: "Antigravity" }, cloudaicompanionProject: "proj-test-123", paidTier: { id: "g1-pro-tier", name: "Google AI Pro" } };

function fakeCloud(routes = {}) {
  const calls = [];
  const all = {
    [`${HOST_PROD}/v1internal:loadCodeAssist`]: () => ({ status: 200, body: LOAD_BODY }),
    [`${HOST_DAILY}/v1internal:retrieveUserQuotaSummary`]: () => ({ status: 200, body: summaryBody() }),
    [`${HOST_TOKEN}/token`]: () => ({ status: 200, body: { access_token: FRESH_ACCESS, expires_in: 3599, token_type: "Bearer", scope: "x", id_token: "x.y.z" } }),
    ...routes,
  };
  const fetch = async (req) => {
    calls.push({ key: `${req.host}${req.path}`, auth: req.headers.Authorization || "", body: req.body, headers: req.headers });
    const route = all[`${req.host}${req.path}`];
    return route ? route(req) : { status: 404, body: null };
  };
  fetch.calls = calls;
  fetch.keys = () => calls.map((c) => c.key);
  return fetch;
}

function makeHost() {
  const h = { stateChanges: 0, actionChanges: 0, stateChanged() { h.stateChanges++; }, actionsChanged() { h.actionChanges++; } };
  return h;
}

async function load(deps = {}) {
  jest.resetModules();
  plugin = require(path.join(PLUGIN_DIR, "index.js"));
  plugin.__test.configure({
    now: () => clock,
    platform: "win32",
    cacheFile,
    env: {},
    artifacts: [],
    listProcesses: async () => [],
    locator: { discover: async () => [winLoc(), wslLoc()], reset() {} },
    showToast: (title, message) => toasts.push({ title, message }),
    ...deps,
  });
  host = makeHost();
  plugin.onLoad(host);
  await plugin.__test.refresh(false);
  return plugin;
}

function everythingVisible() {
  const logs = [logSpy, errSpy, warnSpy].flatMap((s) => s.mock.calls.map((c) => c.map(String).join(" ")));
  const cache = fs.existsSync(cacheFile) ? fs.readFileSync(cacheFile, "utf8") : "";
  return [JSON.stringify(plugin.getState()), JSON.stringify(plugin.getActions()), JSON.stringify(plugin.__test.summary()),
    JSON.stringify(plugin.__test.sources()), plugin.__test.usageToast(), JSON.stringify(toasts), logs.join("\n"), cache].join("\n");
}
function expectNoSecrets() {
  const text = everythingVisible();
  for (const s of SECRETS) expect(text).not.toContain(s);
}

beforeEach(() => {
  clock = T0;
  toasts = [];
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-agy-cli-"));
  wslRoot = path.join(tmp, "wsl.localhost");
  distroDir = path.join(wslRoot, "Ubuntu-22.04");
  home = path.join(distroDir, "home", "devuser");
  winHome = path.join(tmp, "winhome");
  cacheFile = path.join(tmp, "orbit", "plugin-data", "antigravity-usage.json");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(winHome, { recursive: true });
  fs.mkdirSync(path.join(distroDir, "proc"), { recursive: true });
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

describe("varredura de /proc", () => {
  test("acha o language server do Antigravity e o agy; ignora o resto e tolera corridas", async () => {
    writeProc(1, ["/sbin/init"]);
    writeProc(2, []);
    writeProc(200, ["/home/devuser/.antigravity-server/bin/abc/extensions/antigravity/bin/language_server_linux_x64",
      "--enable_lsp", "--csrf_token", CSRF, "--server_port", "41000", "--extension_server_port=41001", "--app_data_dir", "antigravity"]);
    writeProc(201, ["/home/devuser/.local/bin/agy", "--resume"]);
    writeProc(300, ["/home/devuser/.codeium/windsurf/bin/language_server_linux_x64", "--csrf_token", "zzzzzzzz-1", "--app_data_dir", "windsurf"]);
    writeProc(301, ["/usr/bin/bash", "-c", "echo agy language_server --csrf_token nope"]);
    writeProc(999, null);
    fs.mkdirSync(path.join(distroDir, "proc", "self"), { recursive: true });
    fs.writeFileSync(path.join(distroDir, "proc", "self", "cmdline"), "/home/devuser/.local/bin/agy\0");
    fs.writeFileSync(path.join(distroDir, "proc", "meminfo"), "MemTotal: 1 kB\n");

    const fsp = trackingFsp();
    const r = await cliLib.scanProc(distroDir, { fsp });
    expect(r.complete).toBe(true);
    expect(r.cliRunning).toBe(true);
    expect(r.scanned).toBe(7);
    expect(r.servers).toEqual([{ pid: 200, token: CSRF, ports: [41000], extPort: 41001, reason: "" }]);
    const reads = fsp.seen.filter((s) => s.startsWith("readFile "));
    expect(reads).toHaveLength(7);
    for (const s of reads) expect(s).toMatch(/[\\/]proc[\\/]\d+[\\/]cmdline$/);
    expect(fsp.seen.some((s) => /self|meminfo/.test(s))).toBe(false);
  });

  test("agy iniciado por um runtime (node …/agy) conta como CLI em execução; language server sem porta fica sem portas", async () => {
    writeProc(10, ["/usr/bin/node", "/home/devuser/.npm/bin/agy", "-p", "/usage"]);
    writeProc(11, ["/opt/antigravity/language_server_linux_x64", "--csrf_token", CSRF, "--random_port", "--app_data_dir", "antigravity"]);
    const r = await cliLib.scanProc(distroDir, {});
    expect(r.cliRunning).toBe(true);
    expect(r.servers).toEqual([{ pid: 11, token: CSRF, ports: [], extPort: null, reason: "" }]);
    expect(cliLib.isAgy(["/usr/bin/agy"])).toBe(true);
    expect(cliLib.isAgy(["/usr/bin/agy-helper"])).toBe(false);
    expect(cliLib.isAgy(["/usr/bin/node", "/x/server.js", "agy"])).toBe(false);
  });

  test("sem /proc (compartilhamento indisponível) e orçamento de tempo estourado", async () => {
    expect(await cliLib.scanProc(path.join(tmp, "nope"), {})).toEqual({ servers: [], cliRunning: false, scanned: 0, complete: false });
    for (let i = 1; i <= 120; i++) writeProc(i, ["/bin/sleep", String(i)]);
    let t = 0;
    const r = await cliLib.scanProc(distroDir, { clock: () => (t += 2000), budgetMs: 2500 });
    expect(r.complete).toBe(false);
    expect(r.scanned).toBeLessThan(120);
  });

  test("raiz da distro a partir do home", () => {
    expect(cliLib.distroRoot(home)).toBe(distroDir);
    expect(cliLib.distroRoot(path.join(distroDir, "root"))).toBe(distroDir);
    expect(cliLib.distroRoot(winHome)).toBeNull();
  });
});

describe("locais (WSL)", () => {
  function locatorFor(running, fsp) {
    const calls = [];
    const execFile = (file, args, opts, cb) => {
      calls.push([file, ...args]);
      setImmediate(() => cb(null, Buffer.from(`\uFEFF${running.join("\r\n")}\r\n`, "utf16le")));
      return { stdin: { end() {} }, on() {}, kill() {} };
    };
    const locator = createLocator({ markers: [".gemini/antigravity-cli"], deps: { platform: "win32", homedir: () => winHome, execFile, fsp, wslRoots: [wslRoot] } });
    locator.calls = calls;
    return locator;
  }

  test("distro em execução com a pasta do agy vira 'WSL'; distro parada nunca é acessada", async () => {
    writeToken(tokenJson());
    const stopped = path.join(wslRoot, "Debian", "home", "maria");
    writeToken(tokenJson(), T0, stopped);
    const noCli = path.join(wslRoot, "Ubuntu-22.04", "home", "outro");
    fs.mkdirSync(noCli, { recursive: true });

    const fsp = trackingFsp();
    const locator = locatorFor(["Ubuntu-22.04"], fsp);
    const locs = await locator.discover(true);
    expect(locator.calls).toEqual([["wsl.exe", "-l", "--running", "-q"]]);
    expect(locs.map((l) => [l.id, l.kind, l.label, l.short, l.stale])).toEqual([
      ["win", "windows", "Windows", "Windows", false],
      ["wsl:Ubuntu-22.04:devuser", "wsl", "WSL · Ubuntu", "WSL", false],
    ]);
    expect(locs[1].home).toBe(path.win32.join(wslRoot, "Ubuntu-22.04", "home", "devuser"));
    expect(fsp.seen.length).toBeGreaterThan(0);
    expect(fsp.seen.some((s) => /Debian/.test(s))).toBe(false);
  });

  test("o plugin com o localizador real: lê só a distro em execução e mostra a cota do CLI", async () => {
    writeToken(tokenJson());
    writeToken(tokenJson({ email: "maria@example.com" }), T0, path.join(wslRoot, "Debian", "home", "maria"));
    const fsp = trackingFsp();
    const cloudFetch = fakeCloud();
    await load({ locator: locatorFor(["Ubuntu-22.04"], fsp), fsp, cloudFetch });
    expect(plugin.getState().gemini.label).toBe("Antigravity · WSL (CLI) · Gemini · 5h 42% (renova em 2h10) · semana 18% (renova em 4d 2h) · plano Pro");
    expect(plugin.__test.summary().accounts).toHaveLength(1);
    expect(fsp.seen.some((s) => /Debian/.test(s))).toBe(false);
  });

  test("distro que parou: os arquivos dela não são mais lidos e o último valor fica marcado 'WSL parado'", async () => {
    writeToken(tokenJson());
    const fsp = trackingFsp();
    let stale = false;
    const cloudFetch = fakeCloud();
    await load({ fsp, cloudFetch, locator: { discover: async () => [winLoc(), wslLoc({ stale })] } });
    expect(plugin.getState().gemini.status).toBe("green");

    stale = true;
    fsp.seen.length = 0;
    cloudFetch.calls.length = 0;
    clock += 3 * HOUR;
    await plugin.__test.refresh(false);
    expect(fsp.seen.filter((s) => s.includes("Ubuntu-22.04"))).toEqual([]);
    expect(cloudFetch.calls).toEqual([]);
    const st = plugin.getState();
    expect(st.gemini).toEqual({
      value: 18, text: "18%",
      label: "Antigravity · WSL parado · último valor há 3 h · WSL (CLI) · Gemini · 5h renovado · semana 18% (3d 23h) · plano Pro",
    });
    expect(plugin.__test.sources().locations).toEqual([{ id: "wsl:Ubuntu-22.04:devuser", label: "WSL", state: "stale", reason: "wsl_stopped", cliRunning: false }]);
  });

  test("depois de reiniciar o OrbitRing com a distro parada: valor do cache, 'WSL parado'", async () => {
    writeToken(tokenJson());
    await load({ cloudFetch: fakeCloud() });
    plugin.onUnload();
    clock += 20 * 60_000;
    await load({ locator: { discover: async () => [winLoc()] }, cloudFetch: fakeCloud() });
    expect(plugin.getState().worst.label).toBe("Antigravity · WSL parado · último valor há 20 min · WSL (CLI) · Claude e GPT 5h 75% (3h40) · Gemini 42% · plano Pro");
    expect(plugin.getState().worst.status).toBeUndefined();
  });
});

describe("arquivo de login (antigravity-oauth-token)", () => {
  test("formato do CLI (oauth2.Token do Go, validade com nanossegundos e fuso)", () => {
    const tok = cliLib.parseTokenFile(tokenJson({ expiry: "2026-10-07T22:35:27.427656626-03:00" }));
    expect(tok.accessToken).toBe(ACCESS);
    expect(tok.refreshToken).toBe(REFRESH);
    expect(tok.expiryMs).toBe(Date.parse("2026-10-08T01:35:27.427Z"));
    expect(tok.aud).toBe(CLIENT_ID);
    expect(tok.identity).toBe(EMAIL);
  });

  test("formato plano, validade numérica, sem id_token", () => {
    const tok = cliLib.parseTokenFile(JSON.stringify({ access_token: ACCESS, refresh_token: REFRESH, expiry_date: T0 + HOUR }));
    expect(tok).toEqual({ accessToken: ACCESS, refreshToken: REFRESH, expiryMs: T0 + HOUR, aud: "", identity: "" });
  });

  test("ilegível, vazio ou sem tokens → null; id_token estranho não quebra", () => {
    for (const bad of ["", "not json", "[]", "null", "{}", JSON.stringify({ token: {} }), JSON.stringify({ token: { access_token: 5 } })]) {
      expect(cliLib.parseTokenFile(bad)).toBeNull();
    }
    const odd = cliLib.parseTokenFile(JSON.stringify({ token: { access_token: ACCESS }, id_token: "a.%%%.c" }));
    expect(odd).toMatchObject({ accessToken: ACCESS, aud: "", identity: "", expiryMs: 0 });
    const weird = cliLib.parseTokenFile(JSON.stringify({ token: { access_token: ACCESS }, id_token: idToken({ aud: "https://evil.example/?x=", email: EMAIL }) }));
    expect(weird.aud).toBe("");
  });

  test("a conta é identificada por um hash curto do e-mail (igual para maiúsculas/minúsculas), nunca pelo e-mail", () => {
    const id = cliLib.accountId(EMAIL);
    expect(id).toMatch(/^[0-9a-f]{8}$/);
    expect(cliLib.accountId("  ADA.Lovelace@Example.COM ")).toBe(id);
    expect(cliLib.accountId("grace@example.com")).not.toBe(id);
    expect(cliLib.anonymousId("win")).toMatch(/^[0-9a-f]{8}$/);
  });

  test("arquivo de login ilegível → motivo claro, nenhuma chamada", async () => {
    writeToken("{ quebrado");
    const cloudFetch = fakeCloud();
    await load({ cloudFetch });
    expect(cloudFetch.calls).toEqual([]);
    expect(plugin.getState().worst).toEqual({ text: "–", label: "Antigravity fechado · abra para ver o uso · CLI no WSL: arquivo de login do agy ilegível" });
  });

  test("pasta do agy sem login: nada a dizer além de 'fechado'", async () => {
    fs.mkdirSync(path.join(home, ".gemini", "antigravity-cli"), { recursive: true });
    const cloudFetch = fakeCloud();
    await load({ cloudFetch });
    expect(cloudFetch.calls).toEqual([]);
    expect(plugin.getState().worst).toEqual({ text: "–", label: "Antigravity fechado · abra para ver o uso" });
  });
});

describe("cota do CLI pela API", () => {
  test("token guardado ainda válido: loadCodeAssist + resumo (daily), sem renovação; balão diz 'WSL (CLI)'", async () => {
    const file = writeToken(tokenJson());
    const before = fs.readFileSync(file, "utf8");
    const cloudFetch = fakeCloud();
    await load({ cloudFetch });

    expect(cloudFetch.keys()).toEqual([`${HOST_PROD}/v1internal:loadCodeAssist`, `${HOST_DAILY}/v1internal:retrieveUserQuotaSummary`]);
    for (const c of cloudFetch.calls) expect(c.auth).toBe(`Bearer ${ACCESS}`);
    expect(JSON.parse(cloudFetch.calls[0].body)).toEqual({ metadata: { ideType: "ANTIGRAVITY" } });
    expect(JSON.parse(cloudFetch.calls[1].body)).toEqual({ project: "proj-test-123" });

    const st = plugin.getState();
    expect(st.gemini).toEqual({
      value: 42, text: "42%", status: "green",
      label: "Antigravity · WSL (CLI) · Gemini · 5h 42% (renova em 2h10) · semana 18% (renova em 4d 2h) · plano Pro",
    });
    expect(st.others).toMatchObject({ value: 75, status: "amber" });
    expect(st.worst.label).toBe("Antigravity · WSL (CLI) · Claude e GPT 5h 75% (renova em 4h00) · Gemini 42% · plano Pro");
    expect(plugin.__test.sources().desktop.state).toBe("closed");

    expect(fs.readFileSync(file, "utf8")).toBe(before);
    expect(fs.statSync(file).mtimeMs).toBe(T0 - 2 * DAY);
    expectNoSecrets();
    const cache = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
    expect(cache.accounts[0]).toMatchObject({ source: "cloud", where: ["WSL (CLI)"], locs: ["wsl:Ubuntu-22.04:devuser"], plan: "Pro" });
  });

  test("só os endpoints de leitura permitidos existem na lista (nenhum de geração)", () => {
    expect(cliLib.ALLOWED).toEqual({
      [HOST_TOKEN]: ["/token"],
      [HOST_DAILY]: ["/v1internal:retrieveUserQuotaSummary"],
      [HOST_PROD]: ["/v1internal:loadCodeAssist", "/v1internal:retrieveUserQuotaSummary", "/v1internal:retrieveUserQuota"],
    });
    expect(JSON.stringify(cliLib.ALLOWED)).not.toMatch(/generate|stream|complete|onboard|chat/i);
  });

  test("CLI parado: uma rodada a cada 10 min, de 1 chamada; o clique força com piso de 60 s", async () => {
    writeToken(tokenJson({ expiry: iso(T0 + 10 * DAY) }));
    const cloudFetch = fakeCloud();
    await load({ cloudFetch });
    expect(cloudFetch.calls).toHaveLength(2);
    for (let i = 0; i < 9; i++) { clock += 60_000; await plugin.__test.refresh(false); }
    expect(cloudFetch.calls).toHaveLength(2);
    expect(plugin.getState().gemini.status).toBe("green");
    clock += 60_000;
    await plugin.__test.refresh(false);
    expect(cloudFetch.keys().slice(2)).toEqual([`${HOST_DAILY}/v1internal:retrieveUserQuotaSummary`]);

    clock += 30_000;
    await plugin.onAction("worst");
    expect(cloudFetch.calls).toHaveLength(3);
    clock += 31_000;
    await plugin.onAction("worst");
    expect(cloudFetch.calls).toHaveLength(4);
    expect(toasts[1].message).toBe("WSL (CLI) · plano Pro\nGemini: 5h 42% (1h59) · semana 18% (4d 2h)\nClaude e GPT: 5h 75% (3h49) · semana 40% (6d)");
  });

  test("agy em execução no WSL (visto em /proc): a cota é consultada a cada minuto", async () => {
    writeToken(tokenJson({ expiry: iso(T0 + 10 * DAY) }));
    writeProc(4242, ["/home/devuser/.local/bin/agy"]);
    const cloudFetch = fakeCloud();
    await load({ cloudFetch });
    expect(plugin.__test.sources().locations[0]).toMatchObject({ state: "live", cliRunning: true });
    for (let i = 0; i < 3; i++) { clock += 60_000; await plugin.__test.refresh(false); }
    expect(cloudFetch.keys().filter((k) => k.endsWith("retrieveUserQuotaSummary"))).toHaveLength(4);
    expect(cloudFetch.keys().filter((k) => k.endsWith("loadCodeAssist"))).toHaveLength(1);
  });

  test("token expirado, sem cliente OAuth disponível: nenhuma chamada, 'token expirado · abra o agy no WSL'", async () => {
    writeToken(tokenJson({ expiry: iso(T0 - DAY) }));
    const cloudFetch = fakeCloud();
    await load({ cloudFetch });
    expect(cloudFetch.calls).toEqual([]);
    expect(plugin.getState().gemini).toEqual({ text: "–", label: "Antigravity fechado · abra para ver o uso · CLI no WSL: token expirado · abra o agy no WSL" });
    expect(plugin.__test.cliStats()).toMatchObject({ requests: 0, refreshes: 0 });
  });

  test("token expirado + cliente encontrado ao lado do client id: renova EM MEMÓRIA e usa o token novo", async () => {
    const file = writeToken(tokenJson({ expiry: iso(T0 - DAY) }));
    const before = fs.readFileSync(file, "utf8");
    const artifact = path.join(tmp, "main.js");
    fs.writeFileSync(artifact, `${"x".repeat(5000)};a={clientId:"${OTHER_CLIENT_ID}",clientSecret:"${OTHER_SECRET}"};b={clientId:"${CLIENT_ID}",clientSecret:"${CLIENT_SECRET}"};${"y".repeat(5000)}`);
    const cloudFetch = fakeCloud();
    await load({ cloudFetch, artifacts: [artifact] });

    expect(cloudFetch.keys()).toEqual([`${HOST_TOKEN}/token`, `${HOST_PROD}/v1internal:loadCodeAssist`, `${HOST_DAILY}/v1internal:retrieveUserQuotaSummary`]);
    const form = new URLSearchParams(cloudFetch.calls[0].body);
    expect(Object.fromEntries(form)).toEqual({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: REFRESH, grant_type: "refresh_token" });
    expect(cloudFetch.calls[0].headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(cloudFetch.calls[0].auth).toBe("");
    expect(cloudFetch.calls[1].auth).toBe(`Bearer ${FRESH_ACCESS}`);
    expect(cloudFetch.calls[2].auth).toBe(`Bearer ${FRESH_ACCESS}`);
    expect(plugin.getState().gemini).toMatchObject({ value: 42, status: "green" });

    expect(fs.readFileSync(file, "utf8")).toBe(before);
    expect(fs.statSync(file).mtimeMs).toBe(T0 - 2 * DAY);
    expectNoSecrets();
    const written = fs.readdirSync(tmp, { recursive: true }).map(String).filter((f) => /cache|orbit|plugin-data/.test(f));
    for (const f of written) {
      const p = path.join(tmp, f);
      if (fs.statSync(p).isFile()) for (const s of SECRETS) expect(fs.readFileSync(p, "utf8")).not.toContain(s);
    }

    clock += 11 * 60_000;
    await plugin.__test.refresh(false);
    expect(cloudFetch.keys().filter((k) => k.endsWith("/token"))).toHaveLength(1);
    expect(cloudFetch.calls[3].auth).toBe(`Bearer ${FRESH_ACCESS}`);
    clock += 60 * 60_000;
    await plugin.__test.refresh(false);
    expect(cloudFetch.keys().filter((k) => k.endsWith("/token"))).toHaveLength(2);
    expect(plugin.__test.cliStats()).toMatchObject({ refreshes: 2, rotated: false });
  });

  test("segredo de OUTRO cliente no arquivo (o nosso id sem segredo ao lado) não é usado: sem renovação", async () => {
    writeToken(tokenJson({ expiry: iso(T0 - DAY) }));
    const artifact = path.join(tmp, "agy");
    fs.writeFileSync(artifact, `${OTHER_SECRET}${"\0".repeat(9000)}"${OTHER_CLIENT_ID}"${"\0".repeat(300)}"${CLIENT_ID}"${"\0".repeat(9000)}`);
    const other = path.join(tmp, "main2.js");
    fs.writeFileSync(other, `{clientId:"${CLIENT_ID}",x:"${OTHER_CLIENT_ID}",clientSecret:"${OTHER_SECRET}"}`);
    const cloudFetch = fakeCloud();
    await load({ cloudFetch, artifacts: [artifact, other] });
    expect(cloudFetch.calls).toEqual([]);
    expect(plugin.getState().worst.label).toContain("token expirado · abra o agy no WSL");
  });

  test("ORBIT_ANTIGRAVITY_REFRESH=0 e ORBIT_ANTIGRAVITY_CLOUD=0 desligam a renovação / a nuvem", async () => {
    writeToken(tokenJson({ expiry: iso(T0 - DAY) }));
    const artifact = path.join(tmp, "main.js");
    fs.writeFileSync(artifact, `"${CLIENT_ID}","${CLIENT_SECRET}"`);
    let cloudFetch = fakeCloud();
    await load({ cloudFetch, artifacts: [artifact], env: { ORBIT_ANTIGRAVITY_REFRESH: "0" } });
    expect(cloudFetch.calls).toEqual([]);
    expect(plugin.getState().worst.label).toContain("token expirado · abra o agy no WSL");
    plugin.onUnload();

    writeToken(tokenJson());
    cloudFetch = fakeCloud();
    await load({ cloudFetch, artifacts: [artifact], env: { ORBIT_ANTIGRAVITY_CLOUD: "0" } });
    expect(cloudFetch.calls).toEqual([]);
    expect(plugin.getState().worst.label).toBe("Antigravity fechado · abra para ver o uso · CLI no WSL: CLI fechado · consulta à nuvem desativada");
  });

  test("renovação recusada (invalid_grant): 'token expirado', sem insistir a cada minuto; login novo destrava", async () => {
    writeToken(tokenJson({ expiry: iso(T0 - DAY) }));
    const artifact = path.join(tmp, "main.js");
    fs.writeFileSync(artifact, `"${CLIENT_ID}","${CLIENT_SECRET}"`);
    const cloudFetch = fakeCloud({ [`${HOST_TOKEN}/token`]: () => ({ status: 400, body: { error: "invalid_grant", error_description: "Token has been expired or revoked." } }) });
    await load({ cloudFetch, artifacts: [artifact] });
    expect(cloudFetch.keys()).toEqual([`${HOST_TOKEN}/token`]);
    expect(plugin.getState().worst.label).toContain("token expirado · abra o agy no WSL");
    for (let i = 0; i < 5; i++) { clock += 60_000; await plugin.onAction("worst"); }
    expect(cloudFetch.calls).toHaveLength(1);
    expect(everythingVisible()).not.toMatch(/invalid_grant|revoked/);

    writeToken(tokenJson({ expiry: iso(clock + HOUR) }), clock);
    clock += 61_000;
    await plugin.__test.refresh(false);
    expect(plugin.getState().gemini).toMatchObject({ value: 42, status: "green" });
  });

  test("401 da API com o token guardado: 'login recusado', nenhuma tentativa em outro host", async () => {
    writeToken(tokenJson());
    const cloudFetch = fakeCloud({ [`${HOST_PROD}/v1internal:loadCodeAssist`]: () => ({ status: 401, body: { error: { message: `bad token ${ACCESS}` } } }) });
    await load({ cloudFetch });
    expect(cloudFetch.keys()).toEqual([`${HOST_PROD}/v1internal:loadCodeAssist`]);
    expect(plugin.getState().worst).toEqual({ text: "–", label: "Antigravity fechado · abra para ver o uso · CLI no WSL: login recusado · abra o agy no WSL" });
    expectNoSecrets();
  });

  test("401 no resumo para na hora; 429 e 5xx viram motivos próprios", async () => {
    writeToken(tokenJson());
    let cloudFetch = fakeCloud({ [`${HOST_DAILY}/v1internal:retrieveUserQuotaSummary`]: () => ({ status: 401, body: null }) });
    await load({ cloudFetch });
    expect(cloudFetch.keys()).toEqual([`${HOST_PROD}/v1internal:loadCodeAssist`, `${HOST_DAILY}/v1internal:retrieveUserQuotaSummary`]);
    expect(plugin.getState().worst.label).toContain("CLI no WSL: login recusado · abra o agy no WSL");
    plugin.onUnload();

    cloudFetch = fakeCloud({ [`${HOST_DAILY}/v1internal:retrieveUserQuotaSummary`]: () => ({ status: 429, body: null }) });
    await load({ cloudFetch });
    expect(plugin.getState().worst.label).toContain("CLI no WSL: API de cota limitou as consultas (429)");
    plugin.onUnload();

    cloudFetch = fakeCloud({
      [`${HOST_DAILY}/v1internal:retrieveUserQuotaSummary`]: () => ({ error: "timeout" }),
      [`${HOST_PROD}/v1internal:retrieveUserQuotaSummary`]: () => ({ status: 503, body: null }),
      [`${HOST_PROD}/v1internal:retrieveUserQuota`]: () => ({ status: 503, body: null }),
    });
    await load({ cloudFetch });
    expect(plugin.getState().worst.label).toContain("CLI no WSL: falha na API de cota");
    const n = cloudFetch.calls.length;
    clock += 61_000;
    await plugin.__test.refresh(false);
    expect(cloudFetch.calls.length).toBeGreaterThan(n);
  });

  test("daily sem números → produção; produção sem resumo → retrieveUserQuota por modelo", async () => {
    writeToken(tokenJson());
    let cloudFetch = fakeCloud({
      [`${HOST_DAILY}/v1internal:retrieveUserQuotaSummary`]: () => ({ status: 200, body: { groups: [] } }),
      [`${HOST_PROD}/v1internal:retrieveUserQuotaSummary`]: () => ({ status: 200, body: { response: summaryBody(0.5, 0.5, 0.5, 0.5) } }),
    });
    await load({ cloudFetch });
    expect(cloudFetch.keys().slice(1)).toEqual([`${HOST_DAILY}/v1internal:retrieveUserQuotaSummary`, `${HOST_PROD}/v1internal:retrieveUserQuotaSummary`]);
    expect(plugin.getState().gemini).toMatchObject({ value: 50 });
    plugin.onUnload();

    cloudFetch = fakeCloud({
      [`${HOST_DAILY}/v1internal:retrieveUserQuotaSummary`]: () => ({ status: 404, body: null }),
      [`${HOST_PROD}/v1internal:retrieveUserQuotaSummary`]: () => ({ status: 404, body: null }),
      [`${HOST_PROD}/v1internal:retrieveUserQuota`]: () => ({ status: 200, body: { buckets: [
        { modelId: "gemini-3-flash", remainingFraction: 0.65, resetTime: iso(T0 + 2 * HOUR) },
        { modelId: "claude-sonnet-4-6", remainingFraction: 0.2, resetTime: iso(T0 + 2 * HOUR) },
      ] } }),
    });
    await load({ cloudFetch });
    expect(plugin.getState().gemini.label).toBe("Antigravity · WSL (CLI) · Gemini · 5h 35% (renova em 2h00) · por modelo (gemini-3-flash) · plano Pro");
    expect(plugin.getState().others).toMatchObject({ value: 80, status: "amber" });
  });

  test("o servidor OAuth devolvendo um refresh token novo é notado (sem gravar nem registrar o valor)", async () => {
    const file = writeToken(tokenJson({ expiry: iso(T0 - DAY) }));
    const before = fs.readFileSync(file, "utf8");
    const artifact = path.join(tmp, "main.js");
    fs.writeFileSync(artifact, `"${CLIENT_ID}","${CLIENT_SECRET}"`);
    const rotated = `1//${"N".repeat(60)}`;
    const cloudFetch = fakeCloud({ [`${HOST_TOKEN}/token`]: () => ({ status: 200, body: { access_token: FRESH_ACCESS, expires_in: 3599, refresh_token: rotated } }) });
    await load({ cloudFetch, artifacts: [artifact] });
    expect(plugin.__test.cliStats().rotated).toBe(true);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(everythingVisible()).not.toContain(rotated);
    expect(fs.readFileSync(file, "utf8")).toBe(before);
    expectNoSecrets();
  });
});

describe("processo em execução no WSL", () => {
  const statusBody = (email = EMAIL) => ({ userStatus: { email, planStatus: { planInfo: { planName: "Pro" } }, cascadeModelConfigData: { clientModelConfigs: [] } } });

  test("language server com token e porta na linha de comando: consultado em 127.0.0.1, sem ir à nuvem", async () => {
    writeToken(tokenJson());
    writeProc(200, ["/opt/antigravity/language_server_linux_x64", "--csrf_token", CSRF, "--server_port", "41000", "--app_data_dir", "antigravity"]);
    const calls = [];
    const request = async ({ port, scheme, method, token }) => {
      calls.push(`${scheme}:${port}:${method}:${token === CSRF}`);
      if (port !== 41000 || scheme !== "https") return { error: "network" };
      return method === "GetUserStatus" ? { status: 200, body: statusBody() } : { status: 200, body: summaryBody(0.3, 0.9, 0.9, 0.9) };
    };
    const cloudFetch = fakeCloud();
    await load({ request, cloudFetch });
    expect(calls).toEqual(["https:41000:RetrieveUserQuotaSummary:true", "https:41000:GetUserStatus:true"]);
    expect(cloudFetch.calls).toEqual([]);
    expect(plugin.__test.summary().accounts).toHaveLength(1);
    expect(plugin.getState().gemini.label).toBe("Antigravity · WSL + WSL (CLI) · Gemini · 5h 70% (renova em 2h10) · semana 10% (renova em 4d 2h) · plano Pro");
    expectNoSecrets();
  });

  test("language server que não responde pelo 127.0.0.1 do Windows: cai na API, sem tentar outros endereços", async () => {
    writeToken(tokenJson());
    writeProc(200, ["/opt/antigravity/language_server_linux_x64", "--csrf_token", CSRF, "--server_port", "41000", "--app_data_dir", "antigravity"]);
    const ports = new Set();
    const request = async ({ port }) => { ports.add(port); return { error: "network" }; };
    const cloudFetch = fakeCloud();
    await load({ request, cloudFetch });
    expect([...ports]).toEqual([41000]);
    expect(plugin.getState().gemini.label).toMatch(/^Antigravity · WSL \(CLI\) · Gemini · 5h 42%/);
  });

  test("agy em execução sem login legível e sem porta: 'CLI em execução · porta local inacessível'", async () => {
    fs.mkdirSync(path.join(home, ".gemini", "antigravity-cli"), { recursive: true });
    writeProc(4242, ["/home/devuser/.local/bin/agy"]);
    const request = jest.fn(async () => ({ error: "network" }));
    await load({ request, cloudFetch: fakeCloud() });
    expect(request).not.toHaveBeenCalled();
    expect(plugin.getState().worst).toEqual({ text: "–", label: "Antigravity fechado · abra para ver o uso · CLI no WSL: CLI em execução · porta local inacessível" });
  });
});

describe("contas", () => {
  const desktopRow = () => ({
    pid: 4321, name: "language_server_windows_x64.exe",
    cmd: `"C:\\Users\\x\\AppData\\Local\\Programs\\Antigravity\\resources\\app\\extensions\\antigravity\\bin\\language_server_windows_x64.exe" --csrf_token ${CSRF} --app_data_dir antigravity`,
    ports: [53050],
  });
  let appOpen;
  beforeEach(() => { appOpen = true; });
  const desktopRpc = (email, summary, plan = "Pro") => async ({ port, scheme, method }) => {
    if (!appOpen || port !== 53050 || scheme !== "https") return { error: "network" };
    return method === "GetUserStatus"
      ? { status: 200, body: { userStatus: { email, planStatus: { planInfo: { planName: plan } } } } }
      : { status: 200, body: { response: summary } };
  };

  test("mesma conta no app (Windows) e no CLI (WSL): uma conta, 'Windows + WSL (CLI)', nuvem nem é consultada", async () => {
    writeToken(tokenJson({ email: "Ada.Lovelace@Example.com" }));
    const cloudFetch = fakeCloud();
    let rows = [desktopRow()];
    await load({ listProcesses: async () => rows, request: desktopRpc(EMAIL, summaryBody(0.4, 0.9, 0.9, 0.9)), cloudFetch });
    expect(cloudFetch.calls).toEqual([]);
    expect(plugin.__test.summary().accounts).toHaveLength(1);
    expect(plugin.getActions()).toEqual([]);
    expect(plugin.getState().gemini).toEqual({
      value: 60, text: "60%", status: "amber",
      label: "Antigravity · Windows + WSL (CLI) · Gemini · 5h 60% (renova em 2h10) · semana 10% (renova em 4d 2h) · plano Pro",
    });
    expect(JSON.parse(fs.readFileSync(cacheFile, "utf8")).accounts[0]).toMatchObject({ where: ["Windows", "WSL (CLI)"], locs: ["win", "wsl:Ubuntu-22.04:devuser"], source: "summary" });

    rows = []; appOpen = false;
    clock += 60_000;
    await plugin.__test.refresh(false);
    expect(cloudFetch.calls.length).toBe(2);
    expect(plugin.__test.summary().accounts).toHaveLength(1);
    expect(plugin.getState().gemini).toMatchObject({ value: 42, status: "green" });
    expect(plugin.getState().gemini.label).toMatch(/^Antigravity · WSL \(CLI\) · Gemini · /);
    expectNoSecrets();
  });

  test("contas diferentes: a mais apertada vence, '+1 conta', ações por conta com nomes pelo lugar", async () => {
    writeToken(tokenJson({ email: "grace@example.com" }));
    const cloudFetch = fakeCloud({ [`${HOST_DAILY}/v1internal:retrieveUserQuotaSummary`]: () => ({ status: 200, body: summaryBody(0.05, 0.5, 0.9, 0.9) }) });
    await load({ listProcesses: async () => [desktopRow()], request: desktopRpc(EMAIL, summaryBody(0.8, 0.9, 0.3, 0.9), "Ultra"), cloudFetch });

    expect(plugin.__test.summary().accounts.map((a) => a.where)).toEqual([["Windows"], ["WSL (CLI)"]]);
    const st = plugin.getState();
    expect(st.gemini).toMatchObject({ value: 95, text: "95%", status: "red" });
    expect(st.gemini.label).toBe("Antigravity · WSL (CLI) · Gemini · 5h 95% (renova em 2h10) · semana 50% (renova em 4d 2h) · plano Pro · +1 conta");
    expect(st.others).toMatchObject({ value: 70, status: "amber" });
    expect(st.others.label).toMatch(/^Antigravity · Windows · Claude e GPT · 5h 70% .* · plano Ultra · \+1 conta$/);
    expect(st.worst.label).toMatch(/^Antigravity · WSL \(CLI\) · Gemini 5h 95% /);

    const actions = plugin.getActions();
    expect(host.actionChanges).toBe(1);
    expect(actions.map((a) => a.name)).toEqual([
      "Antigravity · Gemini · Windows", "Antigravity · Claude e GPT · Windows", "Antigravity · Uso · Windows",
      "Antigravity · Gemini · WSL (CLI)", "Antigravity · Claude e GPT · WSL (CLI)", "Antigravity · Uso · WSL (CLI)",
    ]);
    const winId = cliLib.accountId(EMAIL), wslId = cliLib.accountId("grace@example.com");
    expect(actions.map((a) => a.id)).toEqual([`gemini.${winId}`, `others.${winId}`, `worst.${winId}`, `gemini.${wslId}`, `others.${wslId}`, `worst.${wslId}`]);
    for (const a of actions) {
      expect(a.id).toMatch(/^[a-z0-9_.-]{1,64}$/);
      expect(["gemini", "others", "worst"]).not.toContain(a.id);
    }
    expect(st[`gemini.${winId}`]).toMatchObject({ value: 20, status: "green" });
    expect(st[`gemini.${winId}`].label).toBe("Antigravity · Windows · Gemini · 5h 20% (renova em 2h10) · semana 10% (renova em 4d 2h) · plano Ultra");
    expect(st[`worst.${wslId}`]).toMatchObject({ value: 95, status: "red" });

    clock += 61_000;
    await plugin.onAction(`worst.${winId}`);
    expect(toasts[0].message).toMatch(/^Windows · plano Ultra\nGemini: 5h 20%/);
    await plugin.onAction("worst");
    expect(toasts[1].message.split("\n")[0]).toBe("2 contas");
    expect(toasts[1].message).toContain("WSL (CLI) · plano Pro — Gemini: 5h 95%");
    expect(toasts[1].message).toContain("Windows · plano Ultra — Gemini: 5h 20%");
    expect(await plugin.onAction("worst.00000000")).toEqual({ available: false, reason: "account_unavailable" });
    expectNoSecrets();
    expect(everythingVisible()).not.toMatch(/grace/);
  });

  test("os ids das ações por conta sobrevivem a um reinício (com as fontes fechadas)", async () => {
    writeToken(tokenJson({ email: "grace@example.com" }));
    await load({ listProcesses: async () => [desktopRow()], request: desktopRpc(EMAIL, summaryBody()), cloudFetch: fakeCloud() });
    const ids = plugin.getActions().map((a) => a.id);
    expect(ids).toHaveLength(6);
    plugin.onUnload();
    clock += HOUR;
    await load({ locator: { discover: async () => [winLoc()] } });
    expect(plugin.getActions().map((a) => a.id)).toEqual(ids);
    const st = plugin.getState();
    for (const id of ids) expect(st[id]).toBeDefined();
    expect(st.gemini.status).toBeUndefined();
    expect(st.gemini.label).toContain("+1 conta");
    expect(st[ids[2]].label).toMatch(/^Antigravity fechado · último valor há 1 h · Windows · /);
    expect(st[ids[5]].label).toMatch(/^Antigravity · WSL parado · último valor há 1 h · WSL \(CLI\) · /);
  });

  test("conta ao vivo tem preferência sobre uma conta com valor antigo mais alto", async () => {
    writeToken(tokenJson({ email: "grace@example.com" }));
    let rows = [desktopRow()];
    const cloudFetch = fakeCloud({ [`${HOST_DAILY}/v1internal:retrieveUserQuotaSummary`]: () => ({ status: 200, body: summaryBody(0.9, 0.9, 0.9, 0.9) }) });
    await load({ listProcesses: async () => rows, request: desktopRpc(EMAIL, summaryBody(0.02, 0.5, 0.5, 0.5)), cloudFetch });
    expect(plugin.getState().gemini).toMatchObject({ value: 98, status: "red" });
    rows = []; appOpen = false;
    clock += 60_000;
    await plugin.__test.refresh(false);
    const st = plugin.getState();
    expect(st.gemini).toMatchObject({ value: 10, status: "green" });
    expect(st.gemini.label).toMatch(/^Antigravity · WSL \(CLI\) · Gemini · .* · \+1 conta$/);
  });

  test("login do agy no próprio Windows (~/.gemini/antigravity-cli) também é uma fonte: 'Windows (CLI)'", async () => {
    writeToken(tokenJson(), T0 - 2 * DAY, winHome);
    const cloudFetch = fakeCloud();
    await load({ locator: { discover: async () => [winLoc()] }, cloudFetch });
    expect(cloudFetch.calls).toHaveLength(2);
    expect(plugin.getState().gemini.label).toMatch(/^Antigravity · Windows \(CLI\) · Gemini · 5h 42%/);
  });
});
