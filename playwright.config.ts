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
  // Each worker owns an Electron process and an X client; more than two contend for the WM.
  workers: E2E_WORKERS === undefined ? 2 : Number(E2E_WORKERS),
})
