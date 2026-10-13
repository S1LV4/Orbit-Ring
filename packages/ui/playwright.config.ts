import { defineConfig } from "@playwright/test";

const UI_PORT = Number(process.env.ORBIT_UI_PORT) || 9120;
const UI_URL = process.env.UI_URL || `http://localhost:${UI_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  retries: process.env.CI ? 2 : 0,
  workers: 2,
  webServer: process.env.UI_URL ? undefined : {
    command: `npx vite --port ${UI_PORT} --strictPort`,
    url: UI_URL,
    reuseExistingServer: true,
    timeout: 60000,
  },
  reporter: [["list"]],
  use: {
    headless: true,
    baseURL: UI_URL,
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
