import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import * as fs from "fs";
import * as path from "path";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "fix-electron-file-protocol",
      closeBundle() {
        // After build: fix the HTML for file:// compatibility in Electron
        const htmlPath = path.resolve(__dirname, "dist", "index.html");
        if (fs.existsSync(htmlPath)) {
          let html = fs.readFileSync(htmlPath, "utf8");
          // Remove crossorigin (blocked in file://)
          html = html.replace(/ crossorigin/g, "");
          // Change type="module" to defer on the app script only (not inline scripts)
          html = html.replace(/<script type="module" src=/g, "<script defer src=");
          fs.writeFileSync(htmlPath, html);
          console.log("[vite] Fixed HTML for Electron file:// protocol");
        }
      },
    },
  ],
  base: "./",
  server: { port: 9120 },
  build: {
    modulePreload: false,
  },
});
