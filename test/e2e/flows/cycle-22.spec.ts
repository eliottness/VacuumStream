import { expect, test } from "../support/fixtures"
import { flowTest } from "../support/ledger-test"

const desktopWindow = { height: 1080, width: 1920 }

test.describe("cycle-22 Logout completion on Home", () => {
  test.use({ seed: { bookmarks: [], favourites: [] }, windowSize: desktopWindow })

  flowTest("F-cycle-22-5", async ({ controller }) => {
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowDown", 3)
    await controller.press("Enter")
    await controller.waitForFocus("nav-settings")
    await controller.press("ArrowRight")
    await controller.waitForFocus("settings-sign-in")
    await controller.press("Enter")

    // Complete the deferred device authorization with the QA account.
    await controller.waitForFocus("settings-logout")
    await controller.press("Enter")
    await controller.press("Escape")
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.waitForFocus("home-refresh")

    await controller.waitForFocus("home-sign-in")
    expect(await controller.focusId()).toBe("home-sign-in")
  })
})

test.describe("cycle-22 Logout completion on Settings", () => {
  test.use({ seed: { bookmarks: [], favourites: [] }, windowSize: desktopWindow })

  flowTest("F-cycle-22-6", async ({ controller }) => {
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowDown", 3)
    await controller.press("Enter")
    await controller.waitForFocus("nav-settings")
    await controller.press("ArrowRight")
    await controller.waitForFocus("settings-sign-in")
    await controller.press("Enter")

    // Complete the deferred device authorization with the QA account.
    await controller.waitForFocus("settings-logout")
    await controller.press("Enter")
    await controller.waitForFocus("settings-sign-in")
    expect(await controller.focusId()).toBe("settings-sign-in")
  })
})

test.describe("cycle-22 West then overlapping north", () => {
  test.use({ seed: {}, windowSize: desktopWindow })

  flowTest("F-cycle-22-1", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowDown", 2)
    await controller.press("Enter")
    await controller.waitForFocus("search-input")
    await controller.press("ArrowDown")
    await controller.waitForFocus("search-key-q")
    await controller.press("Enter")
    await expect(window.locator("#channel-search")).toHaveValue("q")

    // Hold native west, then add native north without releasing west.
    await expect(window.locator('[data-focus-id="channel-direct-q"]')).toHaveCount(1)
  })
})

test.describe("cycle-22 Both faces together", () => {
  test.use({ seed: {}, windowSize: desktopWindow })

  flowTest("F-cycle-22-2", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowDown", 2)
    await controller.press("Enter")
    await controller.waitForFocus("search-input")
    await controller.press("ArrowDown")
    await controller.press("Enter")
    await controller.press("ArrowRight")
    await controller.press("Enter")
    await expect(window.locator("#channel-search")).toHaveValue("qw")

    // Press and hold native west and north together across subsequent frames.
    await expect(window.locator("#channel-search")).toHaveValue("q")
    await expect(window.locator('[data-focus-id="channel-direct-q"]')).toHaveCount(1)
  })
})

test.describe("cycle-22 No opener replay and release/repress", () => {
  test.use({ seed: {}, windowSize: desktopWindow })

  flowTest("F-cycle-22-3", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    // Hold native west to open Search, then use native D-pad Down and south to enter q.
    await controller.press("ArrowDown", 2)
    await controller.press("Enter")
    await controller.waitForFocus("search-input")
    await controller.press("ArrowDown")
    await controller.press("Enter")
    await expect(window.locator("#channel-search")).toHaveValue("q")

    // Release and repress native west.
    await expect(window.locator("#channel-search")).toHaveValue("")
  })
})

test.describe("cycle-22 Remounted begin remains authoritative", () => {
  test.use({ seed: {}, windowSize: desktopWindow })

  flowTest("F-cycle-22-4", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowDown", 3)
    await controller.press("Enter")
    await controller.waitForFocus("nav-settings")
    await controller.press("ArrowRight")
    await controller.press("Enter")
    await controller.press("Escape")
    await controller.press("ArrowDown", 3)
    await controller.press("Enter")
    await controller.press("ArrowRight")
    await controller.press("Enter")

    await expect(window.locator(".device-code strong")).toHaveText("CODE0002")
    await controller.waitForFocus("settings-open-activation")
  })
})
