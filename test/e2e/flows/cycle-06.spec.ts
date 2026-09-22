import { expect, test } from "../support/fixtures"
import { flowTest } from "../support/ledger-test"

test.describe("cycle-06 guest All channels gate", () => {
  test.use({ windowSize: { height: 1080, width: 1920 } })

  flowTest("F-cycle-06-1", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowDown")
    await controller.press("Enter")
    await window.waitForSelector("[data-focus-id='following-connect']")
    await controller.waitForFocus("nav-following")
    await controller.press("ArrowRight")
    await controller.waitForFocus("following-connect")
    await controller.press("ArrowUp")
    await controller.waitForFocus("following-live")
    await controller.press("ArrowRight")
    await controller.waitForFocus("following-all")
    await controller.press("ArrowLeft")
    await controller.waitForFocus("following-live")
    await controller.press("ArrowRight")
    await controller.waitForFocus("following-all")
    await controller.press("Enter")

    await expect(window.locator("h1")).toHaveText("Settings")
    await controller.waitForFocus("nav-settings")
  })
})

test.describe("cycle-06 offline channel archive entry", () => {
  test.use({ windowSize: { height: 1080, width: 1920 } })

  flowTest("F-cycle-06-2", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowDown", 3)
    await controller.press("Enter")
    await controller.waitForFocus("nav-settings")
    await controller.press("ArrowRight")
    await controller.waitForFocus("settings-sign-in")
    await controller.press("Enter")
    await window.waitForSelector("[data-focus-id='settings-open-activation']")
    await window.waitForFunction(
      () => document.querySelector("[data-focus-id='settings-sign-out']") !== null,
    )
    await controller.press("ArrowLeft")
    await controller.press("ArrowUp", 2)
    await controller.press("Enter")
    await controller.waitForFocus("following-live")
    await controller.press("ArrowRight")
    await controller.press("Enter")
    await controller.waitForFocus("following-directory-refresh")
    await controller.press("ArrowDown", 2)
    await controller.press("ArrowRight")
    await controller.press("Enter")

    await expect(window.locator("h1")).toHaveText("Past broadcasts")
    await expect(window.locator("#twitch-player-root iframe")).toHaveCount(0)
  })
})

test.describe("cycle-06 directory pagination exhaustion focus", () => {
  test.use({ windowSize: { height: 1080, width: 1920 } })

  flowTest("F-cycle-06-3", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowDown", 3)
    await controller.press("Enter")
    await controller.waitForFocus("nav-settings")
    await controller.press("ArrowRight")
    await controller.waitForFocus("settings-sign-in")
    await controller.press("Enter")
    await window.waitForSelector("[data-focus-id='settings-open-activation']")
    await window.waitForFunction(
      () => document.querySelector("[data-focus-id='settings-sign-out']") !== null,
    )
    await controller.press("ArrowLeft")
    await controller.press("ArrowUp", 2)
    await controller.press("Enter")
    await controller.waitForFocus("following-live")
    await controller.press("ArrowRight")
    await controller.press("Enter")
    await controller.waitForFocus("following-directory-refresh")
    await controller.press("ArrowDown", 21)
    await controller.waitForFocus("following-directory-more")
    await controller.press("Enter")
    await window.waitForSelector("[data-focus-id='following-directory-more']", {
      state: "detached",
    })

    await controller.waitForFocus("following-directory-refresh")
  })
})
