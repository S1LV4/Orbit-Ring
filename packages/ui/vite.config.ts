import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import * as fs from "fs";
import * as path from "path";

const RING_SRC = path.resolve(__dirname, "..", "ring", "src");
const RING_FILES = ["ring.html", "ring.css", "ring-bundle.js"] as const;
const RING_BUILD_CMD = "npm run build:ring -w packages/ring";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

function ringPreviewPlugin(): Plugin {
  return {
    name: "ring-preview",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0];
        if (!url.startsWith("/ring/")) return next();

        const rel = decodeURIComponent(url.slice("/ring/".length));
        const file = path.resolve(RING_SRC, rel);
        if (!file.startsWith(RING_SRC + path.sep) && file !== RING_SRC) {
          res.statusCode = 403;
          res.end("Forbidden");
          return;
        }

        if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          const hint =
            rel === "ring-bundle.js"
              ? `Ring bundle not built. Run: ${RING_BUILD_CMD}  (or node start.js, which builds and watches it)`
              : `Not found in packages/ring/src: ${rel}`;
          res.end(`[ring-preview] ${hint}\n`);
          return;
        }

        res.statusCode = 200;
        res.setHeader(
          "Content-Type",
          CONTENT_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream",
        );
        res.setHeader("Cache-Control", "no-store");
        fs.createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      const outDir = path.resolve(__dirname, "dist", "ring");
      fs.mkdirSync(outDir, { recursive: true });
      for (const name of RING_FILES) {
        const src = path.join(RING_SRC, name);
        if (!fs.existsSync(src)) {
          if (name === "ring-bundle.js") {
            throw new Error(
              `[ring-preview] ${src} is missing. Build the ring first: ${RING_BUILD_CMD}`,
            );
          }
          console.warn(`[ring-preview] skipping missing ${src}`);
          continue;
        }
        fs.copyFileSync(src, path.join(outDir, name));
      }
      console.log(`[vite] Copied ring preview files to dist/ring/ (${RING_FILES.join(", ")})`);
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    ringPreviewPlugin(),
    {
      name: "fix-electron-file-protocol",
      closeBundle() {
        const htmlPath = path.resolve(__dirname, "dist", "index.html");
        if (fs.existsSync(htmlPath)) {
          let html = fs.readFileSync(htmlPath, "utf8");
          html = html.replace(/ crossorigin/g, "");
          html = html.replace(/<script type="module" src=/g, "<script defer src=");
          fs.writeFileSync(htmlPath, html);
          console.log("[vite] Fixed HTML for Electron file:// protocol");
        }
      },
    },
  ],
  base: "./",
  server: { port: Number(process.env.ORBIT_UI_PORT) || 9120 },
  build: {
    modulePreload: false,
  },
});
