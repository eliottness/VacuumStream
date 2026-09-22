import { expect, test } from "../support/fixtures"
import { flowTest } from "../support/ledger-test"

test.describe("cycle-19 account-first settings", () => {
  flowTest("F-cycle-19-1", async ({ controller, window }) => {
    expect(await window.evaluate(() => [globalThis.innerWidth, globalThis.innerHeight])).toEqual([
      1920, 1080,
    ])

    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    expect(await controller.focusId()).toBe("home-sign-in")
    await controller.press("Enter")

    const visited = await controller.trace([
      "ArrowRight",
      "ArrowDown",
      "ArrowDown",
      "ArrowUp",
      "ArrowUp",
      "ArrowLeft",
    ])
    await controller.shot("F-cycle-19-1-settings-graph")

    expect(visited).toEqual([
      "settings-sign-in",
      "settings-client-id",
      "settings-save",
      "settings-client-id",
      "settings-sign-in",
      "nav-settings",
    ])
  })
})
