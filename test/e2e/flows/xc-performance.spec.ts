import { expect, test } from "../support/fixtures"
import { flowTest } from "../support/ledger-test"

const desktopGuestWindow = { height: 1080, width: 1920 }

const openQuickWatch = async (
  controller: Parameters<Parameters<typeof flowTest>[1]>[0]["controller"],
): Promise<void> => {
  await controller.waitForFocus("nav-home")
  await controller.press("ArrowRight")
  await controller.press("ArrowDown")
  await controller.press("Enter")
  await controller.waitForFocus("player-back")
}

test.describe("xc-performance guest quick-watch player entry", () => {
  test.use({ seed: {}, windowSize: desktopGuestWindow })

  flowTest("F-xc-performance-1", async ({ controller, window }) => {
    await openQuickWatch(controller)

    await expect(window.locator(".player-view #twitch-player-root")).toHaveCount(1)
  })
})

test.describe("xc-performance guest player exit returns to shell", () => {
  test.use({ seed: {}, windowSize: desktopGuestWindow })

  flowTest("F-xc-performance-2", async ({ controller, window }) => {
    await openQuickWatch(controller)
    await controller.press("Escape")

    await expect(window.locator(".browse-view h1")).toHaveText("Live now")
  })
})

test.describe("xc-performance gamepad quick-watch entry", () => {
  test.use({ seed: {}, windowSize: desktopGuestWindow })

  flowTest("F-xc-performance-3", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.press("ArrowDown")
    await controller.press("Enter")

    await expect(window.locator(".player-view")).toHaveCount(1)
  })
})
