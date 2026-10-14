const fs = require("fs");
const os = require("os");
const path = require("path");
const { builtinModules } = require("module");
const { execFileSync } = require("child_process");

const RING_DIR = path.resolve(__dirname, "..", "..", "ring");

describe("ring main process build", () => {
  let outdir;
  beforeAll(() => {
    outdir = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-ring-main-"));
    require(path.join(RING_DIR, "build-main.cjs")).buildMain(outdir);
  });
  afterAll(() => fs.rmSync(outdir, { recursive: true, force: true }));

  for (const file of ["main.js", "preload.js"]) {
    test(`every require in ${file} resolves at run time`, () => {
      const code = fs.readFileSync(path.join(outdir, file), "utf8");
      const ids = [...code.matchAll(/require\(["']([^"']+)["']\)/g)].map((m) => m[1]);
      const external = ids.filter((id) => id !== "electron" && !builtinModules.includes(id.replace(/^node:/, "")));
      const probe = "const r=require('module').createRequire(process.argv[1]);" +
        "console.log(JSON.stringify(process.argv.slice(2).filter(id=>{try{r.resolve(id);return false}catch{return true}})))";
      const unresolved = JSON.parse(execFileSync(process.execPath, ["-e", probe, path.join(RING_DIR, "main.js"), ...external], { encoding: "utf8" }));
      expect(unresolved).toEqual([]);
    });
  }

  test("main.js carries the translations instead of requiring the shared sources", () => {
    const code = fs.readFileSync(path.join(outdir, "main.js"), "utf8");
    expect(code).not.toMatch(/require\(["']@orbitring\/shared/);
    expect(code).toContain("createTranslator");
  });
});
