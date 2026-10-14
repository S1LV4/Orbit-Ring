import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 15000,
  retries: process.env.CI ? 2 : 0,
  use: {
    locale: "pt-BR",
    headless: true,
    launchOptions: {},
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
