const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const ring = JSON.parse(fs.readFileSync(path.join(ROOT, "packages", "ring", "package.json"), "utf8"));
const workflow = fs.readFileSync(path.join(ROOT, ".github", "workflows", "build.yml"), "utf8");

test("the app ships the auto-updater as a runtime dependency", () => {
  expect(ring.dependencies).toHaveProperty("electron-updater");
});

test("installers look for updates in this repository's GitHub Releases", () => {
  expect(ring.build.publish).toEqual([{ provider: "github", owner: "S1LV4", repo: "Orbit-Ring" }]);
});

test("CI publishes the update metadata next to the installer", () => {
  for (const file of ["latest.yml", "OrbitRing-Setup-*.exe.blockmap"]) {
    expect(workflow).toContain(`packages/ring/release/${file}`);
    expect(workflow).toContain(`release/${file}`);
  }
});
