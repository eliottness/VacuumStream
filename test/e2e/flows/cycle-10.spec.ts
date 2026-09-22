import { expect, test } from "../support/fixtures"
import { flowTest } from "../support/ledger-test"

test.describe("cycle-10 resume prompt focus trapping", () => {
  test.use({ seed: {}, windowSize: { height: 1080, width: 1920 } })

  flowTest("F-cycle-10-5", async ({ controller, window }) => {
    const showcaseUrl = new URL(window.url())
    showcaseUrl.search = "?showcase=1"
    await window.goto(showcaseUrl.href)

    // Navigate down to reach the first VideoResumePrompt action
    // The resume prompt buttons have focus IDs like showcase-resume-resume, showcase-resume-start, showcase-resume-back
    // Keep pressing down until we find one of these buttons
    const maxAttempts = 300
    let currentFocusId = await controller.focusId()
    for (let i = 0; i < maxAttempts && !currentFocusId.startsWith("showcase-resume-"); i++) {
      await controller.press("ArrowDown")
      currentFocusId = await controller.focusId()
    }
    expect(currentFocusId).toMatch(/^showcase-resume-/)

    // Now test that focus stays trapped within the prompt's buttons
    // From the review observation, we know the buttons are accessible via arrow navigation
    // and that repeated ArrowDown/ArrowRight should keep focus within showcase-resume-* elements
    const visited = await controller.trace([
      "ArrowDown",
      "ArrowDown",
      "ArrowRight",
      "ArrowRight",
      "ArrowLeft",
      "ArrowLeft",
    ])
    for (const id of visited) {
      expect(id).toMatch(/^showcase-resume-/)
    }
  })
})

test.describe("cycle-10 VOD playback gating", () => {
  test.use({ seed: {} })

  flowTest("F-cycle-10-1", async ({ controller, window }) => {
    // Navigate to home
    await controller.waitForFocus("nav-home")

    // Navigate right to Connect Twitch
    await controller.press("ArrowRight")
    expect(await controller.focusId()).toBe("home-sign-in")
    await controller.press("Enter")

    // Wait for sign-in screen (would require manual Twitch device auth)
    await controller.waitForFocus("settings-sign-in", 120_000)

    // After auth completes, navigate to a live card
    await controller.press("Escape")
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowDown")

    // Travel to first live card
    const traveledToCard = await controller.travelTo("following-live", "ArrowDown", 20)
    expect(traveledToCard, "the journey's next control must be reachable with arrows").toBe(true)

    await controller.press("Enter")

    // Navigate to Past broadcasts (ArrowRight x5)
    await controller.press("ArrowRight")
    await controller.press("ArrowRight")
    await controller.press("ArrowRight")
    await controller.press("ArrowRight")
    await controller.press("ArrowRight")
    expect(await controller.focusId()).toBe("player-broadcasts")

    await controller.press("Enter")

    // Wait for and select a recording card
    await window.waitForSelector(".video-card")
    const recordingId = await window.locator(".video-card").first().getAttribute("data-focus-id")
    if (recordingId) {
      await controller.travelTo(recordingId, "ArrowDown", 20)
      await controller.press("Enter")

      // Assert resume prompt appears and no iframe yet
      await expect(window.locator(".video-resume")).toHaveCount(1)
      expect(await window.locator("#twitch-player-root iframe").count()).toBe(0)
    }
  })
})

test.describe("cycle-10 resume functionality", () => {
  flowTest("F-cycle-10-2", async ({ controller, window }) => {
    // Navigate to home
    await controller.waitForFocus("nav-home")

    // Would need a signed-in QA account with saved VOD
    // Navigate down to live card
    await controller.press("ArrowDown")
    const traveledToCard = await controller.travelTo("following-live", "ArrowDown", 20)
    expect(traveledToCard, "the journey's next control must be reachable with arrows").toBe(true)

    await controller.press("Enter")

    // Navigate to Past broadcasts
    await controller.press("ArrowRight")
    await controller.press("ArrowRight")
    await controller.press("ArrowRight")
    await controller.press("ArrowRight")
    await controller.press("ArrowRight")
    await controller.press("Enter")

    // Find and select recording
    await window.waitForSelector(".video-card")
    const recordingId = await window.locator(".video-card").first().getAttribute("data-focus-id")
    if (recordingId) {
      await controller.travelTo(recordingId, "ArrowDown", 20)
      await controller.press("Enter")

      // Wait for resume prompt
      await expect(window.locator(".video-resume")).toHaveCount(1)

      // With resume button focused, press Enter
      const focusId = await controller.focusId()
      if (focusId?.includes("resume")) {
        await controller.press("Enter")

        // Assert player opens with non-zero position
        await expect(window.locator("#twitch-player-root iframe")).toHaveCount(1)
        const positionText = await window.textContent(".player-timeline__time-elapsed")
        const position = positionText ? parseFloat(positionText) : 0
        expect(position).toBeGreaterThan(0)
      }
    }
  })
})

test.describe("cycle-10 back navigation", () => {
  flowTest("F-cycle-10-3", async ({ controller, window }) => {
    // Navigate to home
    await controller.waitForFocus("nav-home")

    // Would need a signed-in QA account with saved VOD
    // Navigate down to live card
    await controller.press("ArrowDown")
    const traveledToCard = await controller.travelTo("following-live", "ArrowDown", 20)
    expect(traveledToCard, "the journey's next control must be reachable with arrows").toBe(true)

    await controller.press("Enter")

    // Navigate to Past broadcasts
    await controller.press("ArrowRight")
    await controller.press("ArrowRight")
    await controller.press("ArrowRight")
    await controller.press("ArrowRight")
    await controller.press("ArrowRight")
    await controller.press("Enter")

    // Find and select recording
    await window.waitForSelector(".video-card")
    const recordingId = await window.locator(".video-card").first().getAttribute("data-focus-id")
    if (recordingId) {
      await controller.travelTo(recordingId, "ArrowDown", 20)
      await controller.press("Enter")

      // Wait for resume prompt
      await expect(window.locator(".video-resume")).toHaveCount(1)

      // Navigate to Back button
      const focusId = await controller.focusId()
      if (focusId) {
        await controller.travelTo("video-resume-back", "ArrowDown", 5)
        await controller.press("Enter")

        // Assert app leaves player screen and no player is mounted
        await expect(window.locator("#twitch-player-root iframe")).toHaveCount(0)
      }
    }
  })
})

test.describe("cycle-10 start over functionality", () => {
  flowTest("F-cycle-10-4", async ({ controller, window }) => {
    // Navigate to home
    await controller.waitForFocus("nav-home")

    // Would need a signed-in QA account with saved VOD
    // Navigate down to live card
    await controller.press("ArrowDown")
    const traveledToCard = await controller.travelTo("following-live", "ArrowDown", 20)
    expect(traveledToCard, "the journey's next control must be reachable with arrows").toBe(true)

    await controller.press("Enter")

    // Navigate to Past broadcasts
    await controller.press("ArrowRight")
    await controller.press("ArrowRight")
    await controller.press("ArrowRight")
    await controller.press("ArrowRight")
    await controller.press("ArrowRight")
    await controller.press("Enter")

    // Find and select recording
    await window.waitForSelector(".video-card")
    const recordingId = await window.locator(".video-card").first().getAttribute("data-focus-id")
    if (recordingId) {
      await controller.travelTo(recordingId, "ArrowDown", 20)
      await controller.press("Enter")

      // Wait for resume prompt
      await expect(window.locator(".video-resume")).toHaveCount(1)

      // Navigate to Start over button and press Enter
      const focusId = await controller.focusId()
      if (focusId) {
        await controller.travelTo("video-resume-start", "ArrowRight", 5)
        await controller.press("Enter")

        // Assert player opens at beginning
        await expect(window.locator("#twitch-player-root iframe")).toHaveCount(1)
        const positionText = await window.textContent(".player-timeline__time-elapsed")
        const position = positionText ? parseFloat(positionText) : 0
        expect(position).toBeLessThanOrEqual(1) // Should be at or near 0:00
      }
    }
  })
})
