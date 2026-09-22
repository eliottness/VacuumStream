import { expect, test } from "../support/fixtures"
import { flowTest } from "../support/ledger-test"

const desktopWindow = { height: 1080, width: 1920 }

test.describe("cycle-18 keyboard fallback playback", () => {
  test.use({ windowSize: desktopWindow })

  flowTest("F-cycle-18-3", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowDown", 2)
    await controller.waitForFocus("nav-search")
    await controller.press("Enter")
    await controller.waitForFocus("search-input")

    const editingPath = await controller.trace([
      "ArrowDown",
      "Enter",
      "Enter",
      "ArrowDown",
      "ArrowDown",
      "ArrowDown",
      "ArrowDown",
      "ArrowRight",
      "Enter",
      "ArrowRight",
      "ArrowRight",
      "Enter",
    ])
    expect(editingPath).toEqual([
      "search-key-q",
      "search-key-q",
      "search-key-q",
      "search-key-a",
      "search-key-x",
      "search-key-4",
      "search-key-space",
      "search-key-backspace",
      "search-key-backspace",
      "search-key-clear",
      "search-key-submit",
      "search-key-submit",
    ])
    await expect(window.locator("#channel-search")).toHaveValue("q")

    await controller.press("ArrowDown")
    await controller.waitForFocus("channel-direct-q")
    await controller.press("Enter")

    const player = window.locator("#twitch-player-root iframe")
    await expect(player).toBeVisible()
    expect(
      await player.evaluate((frame) => {
        const url = new URL((frame as HTMLIFrameElement).src)
        return [url.hostname, url.searchParams.get("channel")]
      }),
    ).toEqual(["player.twitch.tv", "q"])
  })
})

test.describe("cycle-18 native correction and submission", () => {
  test.use({ windowSize: desktopWindow })

  flowTest("F-cycle-18-1", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await window.keyboard.press("KeyY")
    await controller.press("ArrowDown", 3)
    await controller.press("Enter")
    await controller.press("ArrowUp", 2)
    await controller.press("Enter")
    await controller.press("ArrowDown", 2)
    await controller.press("ArrowRight")
    await controller.press("Enter", 2)
    await window.keyboard.press("KeyX")
    await window.keyboard.press("KeyY")
    await controller.press("ArrowUp", 3)
    await controller.press("ArrowRight")
    await controller.press("ArrowDown")
    await controller.press("Enter")

    const player = window.locator("#twitch-player-root iframe")
    await expect(player).toBeVisible()
    await expect(player).toHaveAttribute("src", /https:\/\/player\.twitch\.tv\/.*channel=xqc/)
  })
})

test.describe("cycle-18 native deletion latch", () => {
  test.use({ windowSize: desktopWindow })

  flowTest("F-cycle-18-2", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await window.keyboard.down("KeyX")
    await controller.press("ArrowDown")
    await controller.press("Enter", 2)
    await expect(window.locator("#channel-search")).toHaveValue("qq")
    await window.keyboard.up("KeyX")

    await window.keyboard.press("KeyX")
    await expect(window.locator("#channel-search")).toHaveValue("q")
    await window.keyboard.press("KeyX", { delay: 0 })
    await expect(window.locator("#channel-search")).toHaveValue("")
    await window.keyboard.press("KeyX", { delay: 0 })
    await expect(window.locator("#channel-search")).toHaveValue("")
    await window.keyboard.press("KeyY")
  })
})

test.describe("cycle-18 masked native faces", () => {
  test.use({ windowSize: desktopWindow })

  flowTest("F-cycle-18-4", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await window.keyboard.press("KeyY")
    await controller.press("ArrowDown")
    await window.keyboard.down("KeyA")
    await window.keyboard.down("KeyX")
    await controller.press("Escape")
    await window.keyboard.up("KeyA")
    await expect(window.locator(".search-view")).toHaveCount(0)
    await window.keyboard.up("KeyX")
  })
})

test.describe("cycle-18 native submission focus", () => {
  test.use({ windowSize: desktopWindow })

  flowTest("F-cycle-18-5", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await window.keyboard.press("KeyY")
    await controller.press("ArrowDown")
    await controller.press("Enter")
    await window.keyboard.press("KeyY")
    await controller.waitForFocus("search-key-q")
    await window.keyboard.down("KeyY")
    await controller.waitForFocus("search-key-q")
    await window.keyboard.up("KeyY")
    await controller.waitForFocus("search-key-q")
  })
})
