import { expect, test } from "../support/fixtures"
import { defectTest } from "../support/ledger-test"

test.describe("manual-qa defects", () => {
  test.use({ seed: { rawFiles: { "playback-progress.json": "{not json" } } })

  defectTest("D-manual-qa-3", async ({ controller, window }) => {
    const alerts = await window
      .locator('[role="alert"]')
      .allTextContents()
      .catch(() => [])
    await controller.shot("D-manual-qa-3-store-read-failure")

    expect(alerts.join(" ")).not.toContain("Error invoking remote method")
    expect(alerts.join(" ")).not.toMatch(/\/(home|tmp)\//)
  })
})
