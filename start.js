// Quick start script: runs service + ring together, all logs visible
const { spawn } = require("child_process");
const path = require("path");

// 1. Build service
const esbuild = require("esbuild");
esbuild.buildSync({
  entryPoints: ["packages/service/src/index.ts"],
  bundle: true,
  platform: "node",
  outfile: "packages/service/dist/index.js",
  external: ["node-hid", "koffi"],
  format: "cjs",
});
console.log("[start] Service built");

// 1b. Ring UI uses vanilla ring.html (Preact migration in progress)
console.log("[start] Ring UI ready");

// 2. Build ring main/preload
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

// 3. Start service (hidden window on Windows)
const svc = spawn("node", ["packages/service/dist/index.js"], {
  stdio: "inherit", windowsHide: true,
});

// 4. Start Vite dev server for the config UI
const vite = spawn("npx", ["vite", "--host", "--port", "5173", "--strictPort"], {
  cwd: path.join(__dirname, "packages", "ui"),
  stdio: "inherit", windowsHide: true, shell: true,
});
console.log("[start] UI dev server starting on http://localhost:5173");

// 5. Start ring (with tray icon) after 2s
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
  process.exit(code);
});

process.on("SIGINT", () => {
  svc.kill();
  vite.kill();
  process.exit(0);
});
