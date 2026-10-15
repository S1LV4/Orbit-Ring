const fs = require("fs");
const os = require("os");
const path = require("path");
const esbuild = require("esbuild");

let tmp, auth;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-service-auth-"));
  const out = path.join(tmp, "service-auth.cjs");
  esbuild.buildSync({
    entryPoints: [path.join(__dirname, "service-auth.ts")],
    bundle: true, platform: "node", format: "cjs", outfile: out, logLevel: "silent",
  });
  auth = require(out);
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const home = () => fs.mkdtempSync(path.join(tmp, "home-"));
const TOKEN = "a".repeat(64);
const request = ({ origin, protocols } = {}) => ({
  origin,
  secure: false,
  req: { headers: { ...(origin === undefined ? {} : { origin }), ...(protocols ? { "sec-websocket-protocol": protocols.join(", ") } : {}) } },
});
const verify = (info, uiPort = 9120) => auth.makeVerifyClient(TOKEN, uiPort)(info);

describe("service token", () => {
  test("every start draws a fresh 32-byte token", () => {
    const first = auth.generateServiceToken();
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(auth.generateServiceToken()).not.toBe(first);
  });

  test("generating a token writes nothing; writing replaces the previous one", () => {
    const dir = home();
    const first = auth.generateServiceToken();
    expect(fs.existsSync(path.join(dir, "service-token"))).toBe(false);
    auth.writeServiceToken(dir, first);
    expect(fs.readFileSync(path.join(dir, "service-token"), "utf8").trim()).toBe(first);
    const second = auth.generateServiceToken();
    auth.writeServiceToken(dir, second);
    expect(fs.readFileSync(path.join(dir, "service-token"), "utf8").trim()).toBe(second);
  });

  test("the token folder is created when missing", () => {
    const dir = path.join(home(), "nested", ".orbit");
    auth.writeServiceToken(dir, auth.generateServiceToken());
    expect(fs.existsSync(path.join(dir, "service-token"))).toBe(true);
  });
});

describe("verifyClient", () => {
  const good = ["orbitring", `token.${TOKEN}`];

  test("the ring main process (no Origin) with the token is accepted", () => {
    expect(verify(request({ protocols: good }))).toBe(true);
  });

  test("a window loaded from a file with the token is accepted", () => {
    expect(verify(request({ origin: "file://", protocols: good }))).toBe(true);
  });

  test("the config UI dev server with the token is accepted", () => {
    expect(verify(request({ origin: "http://localhost:9120", protocols: good }))).toBe(true);
    expect(verify(request({ origin: "http://127.0.0.1:9120", protocols: good }))).toBe(true);
  });

  test("the UI dev server origin follows ORBIT_UI_PORT", () => {
    expect(verify(request({ origin: "http://localhost:9300", protocols: good }), 9300)).toBe(true);
    expect(verify(request({ origin: "http://localhost:9120", protocols: good }), 9300)).toBe(false);
  });

  test("a client without a token is refused", () => {
    expect(verify(request({}))).toBe(false);
    expect(verify(request({ protocols: ["orbitring"] }))).toBe(false);
  });

  test("a wrong or truncated token is refused", () => {
    expect(verify(request({ protocols: ["orbitring", `token.${"b".repeat(64)}`] }))).toBe(false);
    expect(verify(request({ protocols: ["orbitring", `token.${TOKEN.slice(1)}`] }))).toBe(false);
    expect(verify(request({ protocols: ["orbitring", "token."] }))).toBe(false);
    expect(verify(request({ protocols: ["orbitring", TOKEN] }))).toBe(false);
  });

  test("a web page is refused even when it holds the token", () => {
    for (const origin of ["https://example.com", "http://example.com", "http://localhost:5173", "http://localhost", "null", "file://evil"]) {
      expect(verify(request({ origin, protocols: good }))).toBe(false);
    }
  });

  test("an empty server token never matches", () => {
    expect(auth.makeVerifyClient("", 9120)(request({ protocols: ["orbitring", "token."] }))).toBe(false);
  });
});

describe("handleProtocols", () => {
  test("the service answers with the orbitring subprotocol, never the token", () => {
    expect(auth.handleProtocols(new Set(["orbitring", `token.${TOKEN}`]))).toBe("orbitring");
  });

  test("a client that does not speak orbitring gets no subprotocol", () => {
    expect(auth.handleProtocols(new Set([`token.${TOKEN}`]))).toBe(false);
  });
});

describe("serviceProtocols", () => {
  test("a client offers the subprotocol and its token", () => {
    expect(auth.serviceProtocols(TOKEN)).toEqual(["orbitring", `token.${TOKEN}`]);
  });
});
