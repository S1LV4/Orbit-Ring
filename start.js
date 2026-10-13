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

// 2. Start service
const svc = spawn("node", ["packages/service/dist/index.js"], { stdio: "inherit" });

// 3. Start ring after 2s
setTimeout(() => {
  const electronPath = require("electron");
  const ringDir = path.join(__dirname, "packages", "ring");
  const ring = spawn(electronPath, [ringDir], { stdio: "inherit" });
  ring.on("exit", (code) => console.log(`[start] Ring exited: ${code}`));
}, 2000);

svc.on("exit", (code) => {
  console.log(`[start] Service exited: ${code}`);
  process.exit(code);
});

process.on("SIGINT", () => {
  svc.kill();
  process.exit(0);
});
