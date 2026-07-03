import { defineConfig, devices } from "@playwright/test";

// Points at the live deployment by default so tests exercise the real cross-origin
// cookie/CORS behavior between Pages and the Worker — a local `next dev` server can't
// reproduce that. Override with E2E_BASE_URL for a local run.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "https://excise-revenue-recovery-portal.pages.dev",
    trace: "retain-on-failure",
    // Headless: this runs in a sandboxed/non-interactive environment with no window
    // server. Drop HEADLESS=false locally if you want to watch it run.
    headless: process.env.HEADED !== "1",
  },
  projects: [
    {
      name: "chrome",
      // Real installed Chrome, not Playwright's bundled Chromium — matches what users
      // actually run, including third-party cookie behavior.
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
  ],
});
