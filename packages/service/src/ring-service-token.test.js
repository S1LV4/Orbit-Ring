const fs = require("fs");
const os = require("os");
const path = require("path");
const esbuild = require("esbuild");

const RING_SRC = path.resolve(__dirname, "..", "..", "ring", "src");
let tmp, readServiceToken, serviceSocketArgs, tokenForSender;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-ring-token-"));
  const out = path.join(tmp, "service-token.cjs");
  esbuild.buildSync({
    entryPoints: [path.join(RING_SRC, "service-token.ts")],
    bundle: true, platform: "node", format: "cjs", outfile: out, logLevel: "silent",
  });
  ({ readServiceToken, serviceSocketArgs, tokenForSender } = require(out));
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const home = () => fs.mkdtempSync(path.join(tmp, "home-"));

test("the ring reads the token the service wrote at start-up", () => {
  const h = home();
  fs.mkdirSync(path.join(h, ".orbit"));
  fs.writeFileSync(path.join(h, ".orbit", "service-token"), "d".repeat(64) + "\n");
  expect(readServiceToken(h)).toBe("d".repeat(64));
});

test("a fresh token is picked up on the next read", () => {
  const h = home();
  fs.mkdirSync(path.join(h, ".orbit"));
  const file = path.join(h, ".orbit", "service-token");
  fs.writeFileSync(file, "1".repeat(64));
  expect(readServiceToken(h)).toBe("1".repeat(64));
  fs.writeFileSync(file, "2".repeat(64));
  expect(readServiceToken(h)).toBe("2".repeat(64));
});

test("before the service has started there is no token", () => {
  expect(readServiceToken(home())).toBe("");
});

function withToken(token) {
  const h = home();
  fs.mkdirSync(path.join(h, ".orbit"));
  fs.writeFileSync(path.join(h, ".orbit", "service-token"), token);
  return h;
}

test("the ring main process connects to 127.0.0.1 offering the service token", () => {
  expect(serviceSocketArgs(withToken("e".repeat(64)))).toEqual(["ws://127.0.0.1:9119", ["orbitring", "token." + "e".repeat(64)]]);
});

test("only the config window is handed the token over IPC", () => {
  const h = withToken("f".repeat(64));
  const config = { id: 1 }, ring = { id: 2 };
  expect(tokenForSender(config, config, h)).toBe("f".repeat(64));
  expect(tokenForSender(ring, config, h)).toBe("");
  expect(tokenForSender(ring, null, h)).toBe("");
  expect(tokenForSender(undefined, undefined, h)).toBe("");
});
