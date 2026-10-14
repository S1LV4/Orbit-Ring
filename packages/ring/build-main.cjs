const path = require("path");
const esbuild = require("esbuild");

function buildMain(outdir = __dirname) {
  for (const name of ["main", "preload"]) {
    esbuild.buildSync({
      entryPoints: [path.join(__dirname, "src", `${name}.ts`)],
      bundle: true, platform: "node", format: "cjs",
      external: ["electron", "ws", "koffi"],
      outfile: path.join(outdir, `${name}.js`),
    });
  }
}

module.exports = { buildMain };

if (require.main === module) buildMain();
