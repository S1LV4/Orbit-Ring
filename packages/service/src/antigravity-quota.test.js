process.env.ORBIT_PLUGIN_LOCALE = "pt-BR";

const path = require("path");

const PLUGIN_DIR = path.resolve(__dirname, "../../../plugins/antigravity-usage");
const quota = require(path.join(PLUGIN_DIR, "quota.js"));
const desktop = require(path.join(PLUGIN_DIR, "desktop.js"));

const T0 = Date.parse("2026-09-20T08:00:00Z");
const HOUR = 3600_000;
const iso = (ms) => new Date(ms).toISOString();

describe("linha de comando", () => {
  const EXE = '"C:\\Users\\Ana Maria\\AppData\\Local\\Programs\\Antigravity\\resources\\app\\extensions\\antigravity\\bin\\language_server_windows_x64.exe"';

  test("flag com espaço, com '=', com aspas; a flag do extension server não é confundida", () => {
    const cmd = `${EXE} --enable_lsp --csrf_token 11111111-2222-3333-4444-555555555555 --extension_server_port=53021 --extension_server_csrf_token 99999999-aaaa --random_port --app_data_dir "antigravity"`;
    expect(desktop.flagValue(cmd, "csrf_token")).toBe("11111111-2222-3333-4444-555555555555");
    expect(desktop.flagValue(cmd, "extension_server_port")).toBe("53021");
    expect(desktop.flagValue(cmd, "extension_server_csrf_token")).toBe("99999999-aaaa");
    expect(desktop.flagValue(cmd, "app_data_dir")).toBe("antigravity");
    expect(desktop.flagValue(cmd, "server_port")).toBeNull();
    expect(desktop.flagValue(`x --csrf_token=abc12345 --workspace_id 'a b'`, "csrf_token")).toBe("abc12345");
    expect(desktop.flagValue(`x --csrf_token=abc12345 --workspace_id 'a b'`, "workspace_id")).toBe("a b");
    expect(desktop.flagValue("x --csrf_token --random_port", "csrf_token")).toBeNull();
  });

  test("argv do Linux (lista) também é entendido", () => {
    const argv = ["/opt/x/language_server_linux_x64", "--csrf_token", "tok-12345678", "--server_port=41000", "--app_data_dir", "antigravity"];
    expect(desktop.flagValue(argv, "csrf_token")).toBe("tok-12345678");
    expect(desktop.flagValue(argv, "server_port")).toBe("41000");
    expect(desktop.flagValue(argv, "missing")).toBeNull();
  });

  test("classifica: caminho com espaços entre aspas, portas ordenadas, porta do extension server à parte", () => {
    const s = desktop.classifyServer({
      pid: 4321, name: "language_server_windows_x64.exe",
      cmd: `${EXE} --enable_lsp --csrf_token 11111111-2222-3333-4444-555555555555 --extension_server_port 53021 --app_data_dir antigravity`,
      ports: [53100, 53050, 53050],
    });
    expect(s).toEqual({ pid: 4321, token: "11111111-2222-3333-4444-555555555555", ports: [53050, 53100], extPort: 53021, reason: "" });
    expect(desktop.candidateEndpoints(s)).toEqual([
      { port: 53050, scheme: "https" }, { port: 53050, scheme: "http" },
      { port: 53100, scheme: "https" }, { port: 53100, scheme: "http" },
      { port: 53021, scheme: "https" }, { port: 53021, scheme: "http" },
    ]);
  });

  test("sem token → motivo no_token; sem linha de comando → no_cmdline; token malformado é recusado", () => {
    const base = { pid: 1, name: "language_server_windows_x64.exe", ports: [1000] };
    expect(desktop.classifyServer({ ...base, cmd: `${EXE} --app_data_dir antigravity` })).toMatchObject({ token: "", reason: "no_token" });
    expect(desktop.classifyServer({ ...base, cmd: null })).toMatchObject({ token: "", reason: "no_cmdline" });
    expect(desktop.classifyServer({ ...base, cmd: `${EXE} --csrf_token "a b\r\nX-Evil: 1" --app_data_dir antigravity` })).toMatchObject({ token: "", reason: "no_token" });
  });

  test("language server de outro editor (Windsurf) e processos alheios são ignorados", () => {
    expect(desktop.classifyServer({
      pid: 7, name: "language_server_windows_x64.exe",
      cmd: '"C:\\Users\\a\\.codeium\\windsurf\\bin\\language_server_windows_x64.exe" --csrf_token abcdefgh-1 --app_data_dir windsurf', ports: [1],
    })).toBeNull();
    expect(desktop.classifyServer({ pid: 8, name: "node.exe", cmd: "node C:\\antigravity\\x.js --csrf_token abcdefgh-1", ports: [] })).toBeNull();
    expect(desktop.classifyServer({ pid: 0, name: "language_server_windows_x64.exe", cmd: "x", ports: [] })).toBeNull();
  });

  test("saída do PowerShell: um objeto, uma lista, porta única como número, vazio", () => {
    expect(desktop.parseProcessJson("")).toEqual([]);
    expect(desktop.parseProcessJson("[]")).toEqual([]);
    expect(desktop.parseProcessJson('{"pid":10,"name":"language_server_windows_x64.exe","cmd":"x","ports":4000}'))
      .toEqual([{ pid: 10, name: "language_server_windows_x64.exe", cmd: "x", ports: [4000] }]);
    expect(desktop.parseProcessJson('\uFEFF[{"pid":10,"name":"a","cmd":null,"ports":[1,2]},{"pid":11,"name":"b","cmd":"y","ports":null}]'))
      .toEqual([{ pid: 10, name: "a", cmd: null, ports: [1, 2] }, { pid: 11, name: "b", cmd: "y", ports: [] }]);
    expect(() => desktop.parseProcessJson("Get-CimInstance : erro")).toThrow();
  });

  test("o script de varredura só lê processos e portas (nada de Stop/Set/Remove)", () => {
    expect(desktop.SCAN_SCRIPT).toMatch(/Get-CimInstance Win32_Process/);
    expect(desktop.SCAN_SCRIPT).toMatch(/Get-NetTCPConnection/);
    expect(desktop.SCAN_SCRIPT).not.toMatch(/\b(Stop|Set|Remove|Start|New|Invoke)-/i);
    expect(JSON.parse(desktop.REQUEST_BODY)).toEqual({ metadata: { ideName: "antigravity", extensionName: "antigravity", locale: "en" } });
  });
});

describe("fração e renovação", () => {
  test("fração como número, texto, objeto, oneof { case, value } e ausente", () => {
    expect(quota.fractionOf(0.42)).toBe(0.42);
    expect(quota.fractionOf("0.5")).toBe(0.5);
    expect(quota.fractionOf({ remainingFraction: 0.25 })).toBe(0.25);
    expect(quota.fractionOf({ remaining_fraction: 0.75 })).toBe(0.75);
    expect(quota.fractionOf({ case: "remainingFraction", value: 0.6 })).toBe(0.6);
    expect(quota.fractionOf({ remainingFraction: { case: "remainingFraction", value: 0.1 } })).toBe(0.1);
    expect(quota.fractionOf({ remainingFraction: 0 })).toBe(0);
    expect(quota.fractionOf({ case: "remainingAmount", value: 12 })).toBeNull();
    expect(quota.fractionOf({})).toBeNull();
    expect(quota.fractionOf(undefined)).toBeNull();
    expect(quota.fractionOf("abc")).toBeNull();
    expect(quota.fractionOf(1.7)).toBe(1);
    expect(quota.fractionOf(-0.2)).toBe(0);
  });

  test("renovação: ISO, ISO com nanossegundos do Go, segundos, milissegundos, Timestamp", () => {
    expect(quota.resetOf("2026-09-20T11:39:34Z")).toBe(Date.parse("2026-09-20T11:39:34Z"));
    expect(quota.resetOf("2026-10-07T22:35:27.427656626-03:00")).toBe(Date.parse("2026-10-08T01:35:27.427Z"));
    expect(quota.resetOf(1789990000)).toBe(1789990000000);
    expect(quota.resetOf(1789990000123)).toBe(1789990000123);
    expect(quota.resetOf({ seconds: "1789990000", nanos: 5 })).toBe(1789990000000);
    expect(quota.resetOf("")).toBeNull();
    expect(quota.resetOf("amanhã")).toBeNull();
    expect(quota.resetOf(null)).toBeNull();
  });

  test("nome da janela: pelo id, pelo nome, pela distância até a renovação, genérico", () => {
    expect(quota.windowName("gemini-5h", "", null, T0)).toBe("5h");
    expect(quota.windowName("3p-weekly", "", null, T0)).toBe("week");
    expect(quota.windowName("", "Five Hour Limit Remaining", null, T0)).toBe("5h");
    expect(quota.windowName("", "Weekly Limit", null, T0)).toBe("week");
    expect(quota.windowName("x-daily", "", null, T0)).toBe("day");
    expect(quota.windowName("gemini-weekly", "", T0 + 3 * HOUR, T0)).toBe("week");
    expect(quota.windowName("", "", T0 + 4 * HOUR, T0)).toBe("5h");
    expect(quota.windowName("", "", T0 + 5 * HOUR, T0)).toBe("5h");
    expect(quota.windowName("", "", T0 + 6 * 24 * HOUR, T0)).toBe("week");
    expect(quota.windowName("", "", T0 + 12 * HOUR, T0)).toBe("");
    expect(quota.windowName("bucket-x", "", null, T0)).toBe("");
    expect(quota.windowName("limit-15h", "", null, T0)).toBe("");
  });

  test("formatação: tempo restante, idade e cores (mesmos limites do plugin do Claude)", () => {
    expect(quota.formatRemaining(T0 + 130 * 60_000, T0)).toBe("2h10");
    expect(quota.formatRemaining(T0 + 42 * 60_000, T0)).toBe("42min");
    expect(quota.formatRemaining(T0 + 76 * HOUR, T0)).toBe("3d 4h");
    expect(quota.formatRemaining(undefined, T0)).toBeNull();
    expect(quota.formatAge(20_000)).toBe("agora há pouco");
    expect(quota.formatAge(5 * 60_000)).toBe("há 5 min");
    expect(quota.formatAge(2 * HOUR + 60_000)).toBe("há 2 h");
    expect(quota.formatAge(3 * 24 * HOUR)).toBe("há 3 d");
    expect(quota.statusFor(59.9)).toBe("green");
    expect(quota.statusFor(60)).toBe("amber");
    expect(quota.statusFor(85)).toBe("amber");
    expect(quota.statusFor(85.1)).toBe("red");
  });
});

describe("RetrieveUserQuotaSummary", () => {
  const OLD = {
    groups: [
      { displayName: "Gemini Models", buckets: [
        { bucketId: "gemini-weekly", displayName: "Weekly Limit", remaining: { remainingFraction: 0.8 }, resetTime: iso(T0 + 5 * 24 * HOUR) },
        { bucketId: "gemini-5h", displayName: "Five Hour Limit", remaining: { remainingFraction: 0.58 }, resetTime: iso(T0 + 130 * 60_000) },
      ] },
      { displayName: "Claude and GPT models", buckets: [
        { bucketId: "3p-weekly", remaining: { case: "remainingFraction", value: 0.6 }, resetTime: iso(T0 + 6 * 24 * HOUR) },
        { bucketId: "3p-5h", remaining: { remainingFraction: 0.25 }, resetTime: iso(T0 + 4 * HOUR) },
      ] },
    ],
  };
  const NEW = {
    response: {
      description: "Within each group, models share a weekly limit and a 5-hour limit.",
      groups: [
        { displayName: "Gemini Models", buckets: [
          { bucketId: "gemini-weekly", displayName: "Weekly Limit Remaining", window: "weekly", remainingFraction: 0.8, resetTime: iso(T0 + 5 * 24 * HOUR) },
          { bucketId: "gemini-5h", displayName: "Five Hour Limit Remaining", window: "5h", remainingFraction: 0.58, resetTime: iso(T0 + 130 * 60_000) },
        ] },
        { displayName: "Claude and GPT models", buckets: [
          { bucketId: "3p-weekly", remainingFraction: 0.6, resetTime: iso(T0 + 6 * 24 * HOUR) },
          { bucketId: "3p-5h", remainingFraction: 0.25, resetTime: iso(T0 + 4 * HOUR) },
        ] },
      ],
    },
  };
  const EXPECTED = {
    gemini: [
      { id: "gemini-5h", window: "5h", used: 42, resetAt: T0 + 130 * 60_000 },
      { id: "gemini-weekly", window: "week", used: 20, resetAt: T0 + 5 * 24 * HOUR },
    ],
    others: [
      { id: "3p-5h", window: "5h", used: 75, resetAt: T0 + 4 * HOUR },
      { id: "3p-weekly", window: "week", used: 40, resetAt: T0 + 6 * 24 * HOUR },
    ],
  };

  test("forma antiga (grupos na raiz, `remaining`) — 5h antes da semana", () => {
    const r = quota.parseSummary(OLD, T0);
    expect(r.groups).toEqual(EXPECTED);
    expect(r.perModel).toBe(false);
    expect(quota.hasData(r)).toBe(true);
  });

  test("forma 2.16 (`response.groups`, fração na janela) dá exatamente o mesmo resultado", () => {
    expect(quota.parseSummary(NEW, T0).groups).toEqual(EXPECTED);
  });

  test("saída do `agy -p /usage` (command.data, snake_case, id) e raiz `summary`", () => {
    const usage = { command: { data: { groups: [{ buckets: [
      { id: "gemini-5h", window: "5h", remaining_fraction: 0.9, reset_time: iso(T0 + HOUR) },
    ] }] } } };
    expect(quota.parseSummary(usage, T0).groups.gemini).toEqual([{ id: "gemini-5h", window: "5h", used: 10, resetAt: T0 + HOUR }]);
    expect(quota.parseSummary({ summary: NEW.response }, T0).groups).toEqual(EXPECTED);
  });

  test("fração ausente → janela desconhecida (não vira 100%); desativada é ignorada", () => {
    const r = quota.parseSummary({ groups: [{ displayName: "Gemini Models", buckets: [
      { bucketId: "gemini-5h", resetTime: iso(T0 + HOUR) },
      { bucketId: "gemini-weekly", remaining: { case: "remainingAmount", value: 3 } },
      { bucketId: "gemini-daily", remainingFraction: 0.5, disabled: true },
    ] }] }, T0);
    expect(r.groups.gemini).toEqual([
      { id: "gemini-5h", window: "5h", used: null, resetAt: T0 + HOUR },
      { id: "gemini-weekly", window: "week", used: null, resetAt: null },
    ]);
    expect(quota.hasData(r)).toBe(false);
  });

  test("grupo desconhecido vai para 'outros'; grupo sem nome é reconhecido pelos ids; janela sem nome é mostrada pelo id", () => {
    const r = quota.parseSummary({ groups: [
      { buckets: [{ bucketId: "gemini-5h", remainingFraction: 1 }] },
      { displayName: "Experimental models", buckets: [{ bucketId: "exp-burst", remainingFraction: 0.5 }] },
    ] }, T0);
    expect(r.groups.gemini).toEqual([{ id: "gemini-5h", window: "5h", used: 0, resetAt: null }]);
    expect(r.groups.others).toEqual([{ id: "exp-burst", window: "exp-burst", used: 50, resetAt: null }]);
  });

  test("lixo não quebra", () => {
    for (const junk of [null, undefined, "x", 3, [], {}, { groups: "x" }, { response: { groups: [null, 4, { buckets: [null, "x"] }] } }]) {
      expect(quota.count(quota.parseSummary(junk, T0))).toBe(0);
    }
  });
});

describe("GetUserStatus", () => {
  const STATUS = {
    userStatus: {
      name: "Ada Lovelace",
      email: "Ada@Example.com",
      planStatus: { planInfo: { teamsTier: "TEAMS_TIER_PRO", planName: "Pro", monthlyPromptCredits: 50000 }, availablePromptCredits: 49000 },
      cascadeModelConfigData: { clientModelConfigs: [
        { label: "Gemini 3 Pro (Low)", modelOrAlias: { model: "M7" }, quotaInfo: { remainingFraction: 0.9, resetTime: iso(T0 + 3 * HOUR) } },
        { label: "Gemini 3 Pro (High)", modelOrAlias: { model: "M8" }, quotaInfo: { remainingFraction: 0.7, resetTime: iso(T0 + 3 * HOUR) } },
        { label: "Claude Sonnet 4.5", quotaInfo: { remainingFraction: 0.5, resetTime: iso(T0 + 4 * HOUR) } },
        { label: "GPT-OSS 120B (Medium)", quotaInfo: { case: "remainingFraction", value: 0.35 } },
        { label: "Gemini 3 Flash", modelOrAlias: { model: "M9" } },
      ] },
    },
  };

  test("modelos agrupados em Gemini × o resto, representados pelo mais usado; plano e marca 'por modelo'", () => {
    const r = quota.parseUserStatus(STATUS, T0);
    expect(r.perModel).toBe(true);
    expect(r.plan).toBe("Pro");
    expect(r.email).toBe("ada@example.com");
    expect(r.groups.gemini).toEqual([{ id: "", window: "5h", used: 30, resetAt: T0 + 3 * HOUR, model: "Gemini 3 Pro (High)" }]);
    expect(r.groups.others).toEqual([
      { id: "", window: "5h", used: 50, resetAt: T0 + 4 * HOUR, model: "Claude Sonnet 4.5" },
      { id: "", window: "cota", used: 65, resetAt: null, model: "GPT-OSS 120B (Medium)" },
    ]);
  });

  test("userTier.name tem prioridade sobre planInfo.planName", () => {
    const body = JSON.parse(JSON.stringify(STATUS));
    body.userStatus.userTier = { id: "g1-pro-tier", name: "Google AI Pro" };
    expect(quota.parseUserStatus(body, T0).plan).toBe("Google AI Pro");
  });

  test("fração ausente: com renovação no futuro = esgotado; sem renovação ou já renovado = ignorado", () => {
    const body = { userStatus: { cascadeModelConfigData: { clientModelConfigs: [
      { label: "Gemini 3 Pro", quotaInfo: { resetTime: iso(T0 + 2 * HOUR) } },
      { label: "Claude Opus", quotaInfo: {} },
      { label: "GPT-OSS", quotaInfo: { resetTime: iso(T0 - HOUR) } },
    ] } } };
    const r = quota.parseUserStatus(body, T0);
    expect(r.groups.gemini).toEqual([{ id: "", window: "5h", used: 100, resetAt: T0 + 2 * HOUR, model: "Gemini 3 Pro" }]);
    expect(r.groups.others).toEqual([]);
  });

  test("renovação semanal é chamada de 'semana'; nomes antigos (modelName, quota_info) são aceitos", () => {
    const body = { userStatus: { cascadeModelConfigData: { clientModelConfigs: [
      { modelName: "Gemini 3 Pro", quota_info: { remaining_fraction: 0.4, reset_time: iso(T0 + 6 * 24 * HOUR) } },
    ] } } };
    expect(quota.parseUserStatus(body, T0).groups.gemini).toEqual([
      { id: "", window: "week", used: 60, resetAt: T0 + 6 * 24 * HOUR, model: "Gemini 3 Pro" },
    ]);
  });

  test("resposta sem userStatus → vazio", () => {
    expect(quota.count(quota.parseUserStatus({}, T0))).toBe(0);
    expect(quota.count(quota.parseUserStatus(null, T0))).toBe(0);
    expect(quota.count(quota.parseUserStatus({ userStatus: { name: "x" } }, T0))).toBe(0);
  });

  test("retrieveUserQuota (nuvem, por modelo)", () => {
    const r = quota.parseModelBuckets({ buckets: [
      { modelId: "gemini-3-flash", remainingFraction: 0.65, resetTime: iso(T0 + 2 * HOUR) },
      { modelId: "claude-sonnet-4-6", remainingFraction: 0.2, resetTime: iso(T0 + 2 * HOUR) },
      { modelId: "sem-fracao" },
    ] }, T0);
    expect(r.perModel).toBe(true);
    expect(r.groups.gemini).toEqual([{ id: "", window: "5h", used: 35, resetAt: T0 + 2 * HOUR, model: "gemini-3-flash" }]);
    expect(r.groups.others).toEqual([{ id: "", window: "5h", used: 80, resetAt: T0 + 2 * HOUR, model: "claude-sonnet-4-6" }]);
  });
});
