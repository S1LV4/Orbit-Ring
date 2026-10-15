const fs = require("fs");
const os = require("os");
const path = require("path");
const esbuild = require("esbuild");

let tmp, store;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-secret-store-"));
  fs.symlinkSync(path.resolve(__dirname, "..", "..", "..", "node_modules"), path.join(tmp, "node_modules"), "junction");
  const out = path.join(tmp, "secret-store.cjs");
  esbuild.buildSync({
    entryPoints: [path.join(__dirname, "secret-store.ts")],
    bundle: true, platform: "node", format: "cjs", outfile: out, logLevel: "silent", external: ["koffi"],
  });
  store = require(out);
});
afterAll(() => {
  fs.unlinkSync(path.join(tmp, "node_modules"));
  fs.rmSync(tmp, { recursive: true, force: true });
});

const SECRET = "refresh-token-example-123";
const onWindows = process.platform === "win32" ? test : test.skip;

onWindows("a protected secret does not carry the secret in clear and comes back intact", () => {
  const blob = store.protectSecret(SECRET);
  expect(typeof blob).toBe("string");
  expect(blob).not.toContain(SECRET);
  expect(Buffer.from(blob, "base64").toString("latin1")).not.toContain(SECRET);
  expect(store.unprotectSecret(blob)).toBe(SECRET);
});

onWindows("protecting the same secret twice gives different blobs", () => {
  expect(store.protectSecret(SECRET)).not.toBe(store.protectSecret(SECRET));
});

onWindows("a tampered or foreign blob is refused, not thrown", () => {
  const raw = Buffer.from(store.protectSecret(SECRET), "base64");
  raw[raw.length - 5] ^= 1;
  expect(store.unprotectSecret(raw.toString("base64"))).toBeNull();
  expect(store.unprotectSecret("not base64 at all")).toBeNull();
  expect(store.unprotectSecret("!!!")).toBeNull();
  expect(store.unprotectSecret("")).toBeNull();
  expect(store.unprotectSecret(42)).toBeNull();
});

test("non-text input is refused", () => {
  expect(store.protectSecret(undefined)).toBeNull();
  expect(store.protectSecret({})).toBeNull();
});

test("without Windows there is no protection and the caller is told so", () => {
  const p = store.secretProtection("linux");
  expect(p.protectSecret(SECRET)).toBeNull();
  expect(p.unprotectSecret("abc")).toBeNull();
});

onWindows("a second copy of the module in the same process still protects (the native types are not registered twice)", () => {
  const out = path.join(tmp, "secret-store-copy.cjs");
  esbuild.buildSync({
    entryPoints: [path.join(__dirname, "secret-store.ts")],
    bundle: true, platform: "node", format: "cjs", outfile: out, logLevel: "silent", external: ["koffi"],
  });
  const copy = require(out);
  expect(store.protectSecret(SECRET)).not.toBeNull();
  expect(copy.unprotectSecret(copy.protectSecret(SECRET))).toBe(SECRET);
});
