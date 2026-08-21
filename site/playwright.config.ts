/* Browser tests for the built site. Run on demand (`make test-e2e`), never as
 * part of `bun run build` -- they need a browser binary and a running server,
 * and the build has to stay the fast, hermetic path.
 *
 * testDir is ./e2e and not ./tests, which is not cosmetic: tests/ belongs to
 * `bun test` (the data-agreement audit against dist/), and bun's runner
 * collects *.spec.ts as well as *.test.ts. Two directories mean neither runner
 * can see the other's files.
 */

import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT || 4331);

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:" + PORT,
    viewport: { width: 1280, height: 900 },
    trace: "retain-on-failure",
  },
  // Chromium only. Cross-browser is a separate decision and there is no CI here
  // to run it on.
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "bun run e2e/serve-dist.ts",
    url: "http://localhost:" + PORT + "/",
    // We own the process: see the header of e2e/serve-dist.ts for why this is
    // not `astro preview`, and why reusing whatever happens to be on the port
    // would defeat the point.
    reuseExistingServer: false,
    stdout: "ignore",
    stderr: "pipe",
  },
});
