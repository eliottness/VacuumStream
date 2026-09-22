import { expect, test } from "../support/fixtures"
import { flowTest } from "../support/ledger-test"

test.describe("cycle-03 archived broadcasts", () => {
  flowTest("F-cycle-03-1", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowDown")
    await controller.waitForFocus("home-sign-in")
    await controller.press("Enter")
    await controller.waitForFocus("settings-sign-in")
    await controller.press("Enter")

    // Complete the displayed Twitch device authorization on the signed-in account.
    await window.waitForSelector('[data-focus-id="settings-logout"]')
    await controller.press("ArrowLeft")
    await controller.press("ArrowUp", 2)
    await controller.waitForFocus("nav-following")
    await controller.press("Enter")
    expect(await controller.travelTo("following-all", "ArrowDown")).toBe(true)
    await controller.press("Enter")

    const firstChannel = window.locator(
      '[data-focus-id^="followed-channel-"][data-focus-id$="-open"]',
    )
    await expect(firstChannel.first()).toBeVisible()
    await controller.press("ArrowDown", 2)
    await window.waitForFunction(
      () => document.activeElement?.getAttribute("data-focus-id")?.endsWith("-open") === true,
    )
    await controller.press("ArrowRight")
    await window.waitForFunction(
      () => document.activeElement?.getAttribute("data-focus-id")?.endsWith("-videos") === true,
    )
    await controller.press("Enter")

    const firstVideo = window.locator(".video-card").first()
    await expect(firstVideo).toBeVisible()
    await expect(firstVideo.locator("img")).toHaveCount(1)
    await expect
      .poll(() =>
        firstVideo.locator("img").evaluate((image) => (image as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0)

    await controller.press("ArrowDown")
    await window.waitForFunction(
      () => document.activeElement?.getAttribute("data-focus-id")?.startsWith("video-") === true,
    )
    await controller.press("Enter")

    await window.waitForSelector("#twitch-player-root iframe")
    await expect(window.locator('[aria-label="Past broadcast seeking"] button')).toHaveCount(4)
  })
})
