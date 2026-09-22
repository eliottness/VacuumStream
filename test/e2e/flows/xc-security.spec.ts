import { expect, test } from "../support/fixtures"
import { flowTest } from "../support/ledger-test"

test.describe("xc-security device activation", () => {
  test.use({ seed: { bookmarks: [], favourites: [] }, windowSize: { height: 720, width: 1280 } })

  flowTest("F-xc-security-1", async ({ app, controller }) => {
    await app.evaluate(({ shell }) => {
      const opened: string[] = []
      shell.openExternal = async (url) => {
        opened.push(url)
      }
      Reflect.set(globalThis, "xcSecurityActivationUrls", opened)
    })

    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.waitForFocus("home-sign-in")
    await controller.press("Enter")
    await controller.waitForFocus("nav-settings")
    await controller.press("ArrowRight")
    await controller.waitForFocus("settings-sign-in")
    await controller.press("Enter")
    await controller.waitForFocus("settings-open-activation", 30_000)
    await controller.press("Enter")

    await expect
      .poll(
        () =>
          app.evaluate(
            () => Reflect.get(globalThis, "xcSecurityActivationUrls") as readonly string[],
          ),
        { timeout: 15_000 },
      )
      .toHaveLength(1)
    const activationUrls = await app.evaluate(
      () => Reflect.get(globalThis, "xcSecurityActivationUrls") as readonly string[],
    )

    const activationUrl = activationUrls.at(0)
    if (activationUrl === undefined) throw new Error("No activation URL was opened")
    const activation = new URL(activationUrl)
    expect({
      hostname: activation.hostname,
      pathname: activation.pathname,
      protocol: activation.protocol,
    }).toEqual({
      hostname: "www.twitch.tv",
      pathname: "/activate",
      protocol: "https:",
    })
  })
})

test.describe("xc-security cross-origin chat exit", () => {
  test.use({ seed: { bookmarks: [], favourites: [] }, windowSize: { height: 720, width: 1280 } })

  flowTest("F-xc-security-2", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.press("ArrowDown")
    await controller.press("Enter")
    await controller.waitForFocus("player-back")

    expect(await controller.travelTo("player-chat", "ArrowRight", 12)).toBe(true)
    await controller.press("Enter")
    await window.waitForSelector(".player-chat iframe")
    await controller.press("ArrowDown")
    await controller.waitForFocus("player-chat-enter")
    await controller.press("Enter")
    await expect.poll(() => controller.focusId(), { timeout: 10_000 }).toBe("IFRAME")

    await window.keyboard.down("Escape")
    await window.keyboard.up("Escape")
    await controller.waitForFocus("player-chat")
    await expect(window.locator('[data-focus-id="player-chat"]')).toBeFocused()
  })
})
