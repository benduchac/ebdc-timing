import { defineConfig, devices } from "@playwright/test";
import { TEST_PASSPHRASE } from "./e2e/constants";

const PORT = 3100;

// The operator app is entirely client-side (IndexedDB, no server DB) — each
// Playwright test gets a fresh browser context, so storage starts empty per
// test with no manual reset needed. There's no Redis configured here, so
// cloud sync/backup stays in its "not configured" state throughout; nothing
// under test depends on it.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `PUBLISH_SECRET=${TEST_PASSPHRASE} npm run dev -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
