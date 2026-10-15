const fs = require("fs");
const os = require("os");
const path = require("path");
const https = require("https");
const { EventEmitter } = require("events");
const esbuild = require("esbuild");

let tmp, home, getClaudeUsage, errSpy, homeSpy, sentAuth;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-claude-usage-"));
  home = path.join(tmp, "home");
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(home, ".claude", ".credentials.json"), JSON.stringify({ claudeAiOauth: { accessToken: "token-example-abc" } }));
  homeSpy = jest.spyOn(os, "homedir").mockReturnValue(home);
  const out = path.join(tmp, "claude-usage.cjs");
  esbuild.buildSync({
    entryPoints: [path.join(__dirname, "claude-usage.ts")],
    bundle: true, platform: "node", format: "cjs", outfile: out, logLevel: "silent",
  });
  ({ getClaudeUsage } = require(out));
});
afterAll(() => {
  homeSpy.mockRestore();
  fs.rmSync(tmp, { recursive: true, force: true });
});
beforeEach(() => { errSpy = jest.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { errSpy.mockRestore(); https.request.mockRestore?.(); });

function answer(status, body) {
  jest.spyOn(https, "request").mockImplementation((opts, cb) => {
    sentAuth = opts.headers.Authorization;
    const req = new EventEmitter();
    req.end = () => setImmediate(() => {
      const res = new EventEmitter();
      res.statusCode = status;
      cb(res);
      res.emit("data", Buffer.from(body));
      res.emit("end");
    });
    req.destroy = () => {};
    return req;
  });
}

test("an API error is logged by status only; the response body never reaches the log", async () => {
  answer(401, JSON.stringify({ error: { message: "invalid token token-example-abc for user@example.com" } }));
  const usage = await getClaudeUsage();
  expect(sentAuth === "Bearer token-example-abc").toBe(true);
  expect(usage.available).toBe(false);
  const logged = errSpy.mock.calls.flat().map(String).join("\n");
  expect(logged).toContain("401");
  expect(logged).not.toContain("token-example-abc");
  expect(logged).not.toContain("user@example.com");
});
