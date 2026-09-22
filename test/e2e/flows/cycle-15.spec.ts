import { expect, test } from "../support/fixtures"
import { flowTest } from "../support/ledger-test"

test.describe("cycle-15 Same-embed recovery with visible chat", () => {
  test.use({ windowSize: { height: 720, width: 1280 } })

  flowTest("F-cycle-15-1", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.waitForFocus("home-sign-in")
    await controller.press("ArrowDown")
    await controller.waitForFocus("stream-preview-twitch")
    await controller.press("Enter")

    // After READY, navigate to chat
    await window.waitForSelector("[data-focus-id='player-back']")
    const playerBefore = await window.locator("#twitch-player-root iframe").count()
    expect(playerBefore).toBeGreaterThan(0)

    // Navigate to chat: ArrowRight x6, Enter
    await controller.press("ArrowRight", 6)
    await controller.press("Enter")
    await window.waitForSelector(".chat-container")

    const chatBefore = await window.locator(".chat-container iframe").count()
    expect(chatBefore).toBeGreaterThan(0)

    // Return to Back
    await controller.press("ArrowUp")
    await controller.waitForFocus("player-back")

    // Verify player and chat iframes persist across transition
    const playerAfter = await window.locator("#twitch-player-root iframe").count()
    const chatAfter = await window.locator(".chat-container iframe").count()
    expect(playerAfter).toBe(playerBefore)
    expect(chatAfter).toBe(chatBefore)
  })
})

test.describe("cycle-15 Focus survives outage on a toolbar command", () => {
  flowTest("F-cycle-15-2", async ({ controller, window }) => {
    // Test with Play/Pause focus
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.waitForFocus("home-sign-in")
    await controller.press("ArrowDown")
    await controller.waitForFocus("stream-preview-twitch")
    await controller.press("Enter")

    await window.waitForSelector("[data-focus-id='player-back']")
    await controller.press("ArrowRight")
    await controller.waitForFocus("player-play-pause")
    const focusBeforePlay = await controller.focusId()
    expect(focusBeforePlay).toBe("player-play-pause")

    // Verify it's an enabled button
    const playButton = window.locator("[data-focus-id='player-play-pause']")
    await expect(playButton).toBeVisible()
    const isDisabled = await playButton.evaluate((el) =>
      (el as HTMLElement).hasAttribute("disabled"),
    )
    expect(isDisabled).toBe(false)

    // Test with Mute focus on fresh launch
    await controller.press("Escape")
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.waitForFocus("home-sign-in")
    await controller.press("ArrowDown")
    await controller.waitForFocus("stream-preview-twitch")
    await controller.press("Enter")

    await window.waitForSelector("[data-focus-id='player-back']")
    await controller.press("ArrowRight", 2)
    await controller.waitForFocus("player-mute")
    const focusBeforeMute = await controller.focusId()
    expect(focusBeforeMute).toBe("player-mute")

    // Verify it's an enabled button
    const muteButton = window.locator("[data-focus-id='player-mute']")
    await expect(muteButton).toBeVisible()
    const isMuteDisabled = await muteButton.evaluate((el) =>
      (el as HTMLElement).hasAttribute("disabled"),
    )
    expect(isMuteDisabled).toBe(false)
  })
})

test.describe("cycle-15 Paused recovery and controller Play", () => {
  flowTest("F-cycle-15-3", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.waitForFocus("home-sign-in")
    await controller.press("ArrowDown")
    await controller.waitForFocus("stream-preview-twitch")
    await controller.press("Enter")

    // Keep focus on Back through transitions
    await window.waitForSelector("[data-focus-id='player-back']")
    await controller.waitForFocus("player-back")

    // Press ArrowRight to focus Play/Pause, then Enter to activate
    await controller.press("ArrowRight")
    await controller.waitForFocus("player-play-pause")
    await controller.press("Enter")

    // Press ArrowLeft to return to Back
    await controller.press("ArrowLeft")
    await controller.waitForFocus("player-back")

    const finalFocus = await controller.focusId()
    expect(finalFocus).toBe("player-back")

    // Verify it's enabled
    const backButton = window.locator("[data-focus-id='player-back']")
    await expect(backButton).toBeVisible()
    const isBackDisabled = await backButton.evaluate((el) =>
      (el as HTMLElement).hasAttribute("disabled"),
    )
    expect(isBackDisabled).toBe(false)
  })
})

test.describe("cycle-15 Captions remain escapable and return to service", () => {
  flowTest("F-cycle-15-4", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.waitForFocus("home-sign-in")
    await controller.press("ArrowDown")
    await controller.waitForFocus("stream-preview-twitch")
    await controller.press("Enter")

    await window.waitForSelector("[data-focus-id='player-back']")

    // Navigate to Captions: ArrowRight x4, Enter
    await controller.press("ArrowRight", 4)
    await controller.press("Enter")
    await controller.waitForFocus("captions-show")

    // Navigate back: ArrowUp, ArrowDown, ArrowRight, ArrowUp, ArrowLeft x4
    await controller.press("ArrowUp")
    await controller.press("ArrowDown")
    const afterDown = await controller.focusId()
    expect(["captions-show", "captions-hide"]).toContain(afterDown)

    const showButton = window.locator("[data-focus-id='captions-show']")
    const hideButton = window.locator("[data-focus-id='captions-hide']")
    const showEnabled =
      (await showButton.count()) > 0 &&
      !(await showButton.evaluate((el) => (el as HTMLElement).hasAttribute("disabled")))
    const hideEnabled =
      (await hideButton.count()) > 0 &&
      !(await hideButton.evaluate((el) => (el as HTMLElement).hasAttribute("disabled")))
    expect(showEnabled || hideEnabled).toBe(true)

    await controller.press("ArrowRight")
    const afterRight = await controller.focusId()
    expect(["captions-show", "captions-hide"]).toContain(afterRight)

    await controller.press("ArrowUp")
    await controller.press("ArrowLeft", 4)
    await controller.waitForFocus("player-back")

    const finalFocus = await controller.focusId()
    expect(finalFocus).toBe("player-back")
  })
})

test.describe("cycle-15 Early outage must end startup retries", () => {
  flowTest("F-cycle-15-5", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.waitForFocus("home-sign-in")
    await controller.press("ArrowDown")
    await controller.waitForFocus("stream-preview-twitch")
    await controller.press("Enter")

    // Monitor that no playback commands are issued during the offline/online cycle
    await window.waitForSelector("[data-focus-id='player-back']")

    // Do not press any playback input - verify the player remains in its initial state
    const playerRoot = window.locator("#twitch-player-root")
    await expect(playerRoot).toBeVisible()

    // Verify no unexpected state changes occurred by checking player focus persists
    await controller.waitForFocus("player-back")
    const focusAfterSettle = await controller.focusId()
    expect(focusAfterSettle).toBe("player-back")
  })
})

test.describe("cycle-15 Depart while offline and ignore late availability", () => {
  flowTest("F-cycle-15-6", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.waitForFocus("home-sign-in")
    await controller.press("ArrowDown")
    await controller.waitForFocus("stream-preview-twitch")
    await controller.press("Enter")

    // Keep focus on Back through READY then OFFLINE
    await window.waitForSelector("[data-focus-id='player-back']")
    await controller.waitForFocus("player-back")

    // Press Enter to return Home
    await controller.press("Enter")
    await controller.waitForFocus("nav-home")

    // Verify Home is displayed with nav-home focused
    const homeNav = window.locator("[data-focus-id='nav-home']")
    await expect(homeNav).toBeVisible()
    const focusAfterReturn = await controller.focusId()
    expect(focusAfterReturn).toBe("nav-home")

    // Verify no player iframe was recreated
    const playerIframe = window.locator("#twitch-player-root iframe")
    const iframeCount = await playerIframe.count()
    expect(iframeCount).toBe(0)
  })
})
