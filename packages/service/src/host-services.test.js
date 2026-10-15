const fs = require("fs");
const os = require("os");
const path = require("path");
const esbuild = require("esbuild");

let tmp, hostServices;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-host-services-"));
  fs.symlinkSync(path.resolve(__dirname, "..", "..", "..", "node_modules"), path.join(tmp, "node_modules"), "junction");
  const out = path.join(tmp, "host-services.cjs");
  esbuild.buildSync({
    entryPoints: [path.join(__dirname, "host-services.ts")],
    bundle: true, platform: "node", format: "cjs", outfile: out, logLevel: "silent", external: ["koffi", "sharp"],
  });
  ({ hostServices } = require(out));
});
afterAll(() => {
  fs.unlinkSync(path.join(tmp, "node_modules"));
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("plugins are offered usage, thumbnails and secret protection by the host", () => {
  expect(Object.keys(hostServices).sort()).toEqual(["getClaudeUsage", "makeThumbnail", "protectSecret", "unprotectSecret"]);
});

(process.platform === "win32" ? test : test.skip)("the secret protection plugins receive really encrypts", () => {
  const blob = hostServices.protectSecret("secret-example");
  expect(blob).not.toContain("secret-example");
  expect(hostServices.unprotectSecret(blob)).toBe("secret-example");
});
