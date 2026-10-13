const { spawn } = require("child_process");
const path = require("path");

const esbuild = require("esbuild");
esbuild.buildSync({
  entryPoints: ["packages/service/src/index.ts"],
  bundle: true,
  platform: "node",
  outfile: "packages/service/dist/index.js",
  external: ["node-hid", "koffi", "sharp"],
  format: "cjs",
});
console.log("[start] Service built");

const ringBundleOpts = {
  entryPoints: ["packages/ring/src/ring-app.tsx"],
  bundle: true,
  outfile: "packages/ring/src/ring-bundle.js",
  jsx: "automatic",
  jsxImportSource: "preact",
  format: "iife",
  target: "es2020",
};
esbuild.buildSync(ringBundleOpts);
console.log("[start] Ring UI bundle built");

let ringWatchCtx = null;
esbuild.context({
  ...ringBundleOpts,
  logLevel: "warning",
  plugins: [{
    name: "ring-rebuild-log",
    setup(build) {
      let first = true;
      build.onEnd((result) => {
        if (first) { first = false; return; }
        if (result.errors.length === 0) console.log("[start] Ring UI bundle rebuilt");
      });
    },
  }],
}).then((ctx) => { ringWatchCtx = ctx; return ctx.watch(); })
  .catch((err) => console.error("[start] Ring UI watch failed:", err));

esbuild.buildSync({
  entryPoints: ["packages/ring/src/main.ts"],
  bundle: false, platform: "node",
  outfile: "packages/ring/main.js", format: "cjs",
});
esbuild.buildSync({
  entryPoints: ["packages/ring/src/preload.ts"],
  bundle: false, platform: "node",
  outfile: "packages/ring/preload.js", format: "cjs",
});
console.log("[start] Ring built");

const svc = spawn("node", ["packages/service/dist/index.js"], {
  stdio: "inherit", windowsHide: true,
  env: { ...process.env, ORBIT_PLUGIN_CATALOG: path.join(__dirname, "plugins") },
});

const UI_PORT = String(Number(process.env.ORBIT_UI_PORT) || 9120);
process.env.ORBIT_UI_PORT = UI_PORT;
const vite = spawn("npx", ["vite", "--host", "--port", UI_PORT, "--strictPort"], {
  cwd: path.join(__dirname, "packages", "ui"),
  stdio: "inherit", windowsHide: true, shell: true,
});
console.log(`[start] UI dev server starting on http://localhost:${UI_PORT}`);

setTimeout(() => {
  const electronPath = require("electron");
  const ringDir = path.join(__dirname, "packages", "ring");
  const ring = spawn(electronPath, [ringDir], {
    stdio: "inherit", windowsHide: true,
  });
  ring.on("exit", (code) => console.log(`[start] Ring exited: ${code}`));
}, 2000);

svc.on("exit", (code) => {
  console.log(`[start] Service exited: ${code}`);
  vite.kill();
  if (ringWatchCtx) ringWatchCtx.dispose();
  process.exit(code);
});

process.on("SIGINT", () => {
  svc.kill();
  vite.kill();
  if (ringWatchCtx) ringWatchCtx.dispose();
  process.exit(0);
});
