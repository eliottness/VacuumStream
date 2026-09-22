import { defineConfig } from "@playwright/test"

const { CI, E2E_OUT, E2E_WORKERS } = process.env
const outputDirectory = E2E_OUT ?? "test-results/e2e"

export default defineConfig({
  expect: { timeout: 15_000 },
  forbidOnly: CI !== undefined,
  fullyParallel: false,
  outputDir: outputDirectory,
  reporter: [["list"], ["json", { outputFile: `${outputDirectory}/report.json` }]],
  retries: 0,
  testDir: "test/e2e",
  timeout: 120_000,
  use: {
    screenshot: "off",
    trace: "retain-on-failure",
  },
  // Every test drives a real Electron window against one X display and one live Twitch session;
  // parallel workers steal focus from each other, so the suite runs serially unless asked not to.
  workers: E2E_WORKERS === undefined ? 1 : Number(E2E_WORKERS),
})
