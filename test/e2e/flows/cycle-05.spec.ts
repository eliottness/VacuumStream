import type { Page } from "@playwright/test"
import { expect, test } from "../support/fixtures"
import { flowTest } from "../support/ledger-test"

const emptyGuestSeed = { bookmarks: [], favourites: [] } as const
const desktopGuestWindow = { height: 720, width: 1280 } as const

const waitForLivePlayback = async (window: Page): Promise<void> => {
  await window.waitForFunction(() => {
    const frame = document.querySelector<HTMLElement>(".player-frame")
    const playback = document.querySelector<HTMLButtonElement>('[data-focus-id="player-playback"]')
    return frame?.getAttribute("aria-busy") === "false" && playback?.disabled === false
  })
}

test.describe("cycle-05 live chooser traversal", () => {
  test.use({ seed: emptyGuestSeed, windowSize: desktopGuestWindow })

  flowTest("F-cycle-05-1", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.press("ArrowDown")
    await controller.press("ArrowRight", 2)
    await controller.press("Enter")
    await controller.waitForFocus("player-back")
    await waitForLivePlayback(window)

    await controller.press("ArrowRight", 3)
    await controller.waitForFocus("player-quality")
    await controller.press("Enter")
    await window.waitForSelector("#player-quality-chooser")
    await window.waitForFunction(
      () =>
        document.activeElement?.getAttribute("data-focus-id")?.startsWith("player-quality-") ??
        false,
    )

    const optionIds = await window
      .locator("#player-quality-chooser button")
      .evaluateAll((buttons) =>
        buttons
          .map((button) => button.getAttribute("data-focus-id"))
          .filter((id): id is string => id !== null),
      )
    expect(optionIds.length).toBeGreaterThan(1)
    const firstOptionId = optionIds[0]
    const closeId = optionIds.at(-1)
    const lastQualityId = optionIds.at(-2)
    if (firstOptionId === undefined || closeId === undefined || lastQualityId === undefined) {
      throw new Error("Quality chooser did not expose the expected option and Close buttons")
    }

    const focusWalk: string[] = []
    const assertShellButton = async (): Promise<void> => {
      focusWalk.push(await controller.focusId())
      expect(
        await window.evaluate(() => {
          const active = document.activeElement
          return active instanceof HTMLButtonElement && active.hasAttribute("data-focus-id")
        }),
      ).toBe(true)
    }

    await controller.waitForFocus(firstOptionId)
    await assertShellButton()
    for (const optionId of optionIds.slice(1)) {
      await controller.press("ArrowRight")
      await controller.waitForFocus(optionId)
      await assertShellButton()
    }
    await controller.press("ArrowLeft")
    await controller.waitForFocus(lastQualityId)
    await assertShellButton()
    await controller.press("ArrowUp")
    await controller.waitForFocus("player-quality")
    await assertShellButton()
    await controller.press("ArrowDown")
    await controller.waitForFocus(firstOptionId)
    await assertShellButton()
    await controller.press("ArrowDown")
    await controller.waitForFocus(closeId)
    await assertShellButton()

    expect(focusWalk).toEqual([
      ...optionIds,
      lastQualityId,
      "player-quality",
      firstOptionId,
      closeId,
    ])
    await controller.press("Enter")
    await window.waitForSelector("#player-quality-chooser", { state: "detached" })
    await controller.waitForFocus("player-quality")
    expect(await window.locator("#player-quality-chooser").count()).toBe(0)
    expect(await controller.focusId()).toBe("player-quality")
  })
})

test.describe("cycle-05 offline chooser escape", () => {
  test.use({ seed: emptyGuestSeed, windowSize: desktopGuestWindow })

  flowTest("F-cycle-05-3", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.press("ArrowDown")
    await controller.press("Enter")
    await controller.waitForFocus("player-back")
    await window.waitForSelector('.player-load-status[role="alert"]')

    await controller.press("ArrowRight")
    await controller.waitForFocus("player-quality")
    await controller.press("Enter")
    await window.waitForSelector("#player-quality-chooser")
    await controller.waitForFocus("player-quality-close")
    expect(
      await window
        .locator('#player-quality-chooser [data-focus-id^="player-quality-option-"]')
        .count(),
    ).toBe(0)

    await controller.press("ArrowUp")
    await controller.waitForFocus("player-quality")
    await controller.press("ArrowUp")
    await controller.waitForFocus("player-back")
    await controller.press("ArrowRight")
    await controller.waitForFocus("player-quality")
    await controller.press("Enter")
    await window.waitForSelector("#player-quality-chooser")
    await controller.waitForFocus("player-quality-close")
    expect(
      await window
        .locator('#player-quality-chooser [data-focus-id^="player-quality-option-"]')
        .count(),
    ).toBe(0)
    await controller.press("Enter")

    await window.waitForSelector("#player-quality-chooser", { state: "detached" })
    await controller.waitForFocus("player-quality")
    expect(await window.locator("#player-quality-chooser").count()).toBe(0)
    expect(await controller.focusId()).toBe("player-quality")
  })
})

test.describe("cycle-05 quality source reset", () => {
  test.use({ seed: emptyGuestSeed, windowSize: desktopGuestWindow })

  flowTest("F-cycle-05-4", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.press("ArrowDown")
    await controller.press("ArrowRight", 2)
    await controller.press("Enter")
    await controller.waitForFocus("player-back")
    await waitForLivePlayback(window)

    await controller.press("ArrowRight", 3)
    await controller.waitForFocus("player-quality")
    await controller.press("Enter")
    await window.waitForSelector("#player-quality-chooser")
    await window.waitForFunction(
      () =>
        document.activeElement?.getAttribute("data-focus-id")?.startsWith("player-quality-") ??
        false,
    )
    const firstOptionId = await window
      .locator("#player-quality-chooser button")
      .first()
      .getAttribute("data-focus-id")
    expect(firstOptionId).not.toBeNull()
    if (firstOptionId === null) throw new Error("Live chooser did not expose its first option")
    await controller.waitForFocus(firstOptionId)
    await controller.press("Enter")
    await expect
      .poll(() =>
        window.locator('[data-focus-id="player-quality"]').getAttribute("data-requested-quality"),
      )
      .not.toBeNull()

    await window.keyboard.press("Escape")
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.press("ArrowDown")
    await controller.press("Enter")
    await controller.waitForFocus("player-back")
    expect(await controller.travelTo("player-quality", "ArrowRight", 6)).toBe(true)
    await controller.press("Enter")
    await window.waitForSelector("#player-quality-chooser")
    await controller.waitForFocus("player-quality-close")

    expect(
      await window
        .locator('[data-focus-id="player-quality"]')
        .getAttribute("data-requested-quality"),
    ).toBeNull()
    expect(
      await window
        .locator('#player-quality-chooser [data-focus-id^="player-quality-option-"]')
        .evaluateAll((buttons) =>
          buttons.every((button) => button.closest("#player-quality-chooser") !== null),
        ),
    ).toBe(true)
  })
})

test.describe("cycle-05 VOD quality intent", () => {
  test.use({
    seed: {
      bookmarks: [
        {
          details: { title: "Public recording", userId: "0" },
          duration: 172797,
          position: 619,
          updatedAt: 1,
          videoId: "2877678922",
        },
      ],
      favourites: [],
    },
    windowSize: desktopGuestWindow,
  })

  flowTest("F-cycle-05-5", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.waitForFocus("continue-2877678922-open")
    await controller.press("Enter")
    await controller.waitForFocus("video-resume-resume")
    await controller.press("Enter")
    await controller.waitForFocus("player-back")
    await window.waitForFunction(() => {
      const frame = document.querySelector<HTMLElement>(".player-frame")
      const playback = document.querySelector<HTMLButtonElement>(
        '[data-focus-id="player-playback"]',
      )
      return frame?.getAttribute("aria-busy") === "false" && playback?.disabled === false
    })
    await window.waitForFunction(() => {
      const playback = document.querySelector('[data-focus-id="player-playback"]')
      const muted = document.querySelector('[data-focus-id="player-muted"]')
      return (
        playback?.getAttribute("aria-label") === "Pause" &&
        muted?.getAttribute("aria-label") === "Mute"
      )
    })

    const playerFrame = await window.locator("#twitch-player-root iframe").elementHandle()
    expect(playerFrame).not.toBeNull()
    if (playerFrame === null) throw new Error("The VOD player iframe was not mounted")
    const media = window.frameLocator("#twitch-player-root iframe").locator("video")
    await expect(media).toHaveCount(1)
    const mediaBefore = await media.evaluate((element) => {
      const video = element as HTMLVideoElement
      return { muted: video.muted, paused: video.paused }
    })
    expect(mediaBefore).toEqual({ muted: false, paused: false })

    await controller.press("ArrowRight")
    await controller.waitForFocus("player-playback")
    await controller.press("Enter")
    await expect(media).toHaveJSProperty("paused", true)
    await expect(window.locator('[data-focus-id="player-playback"]')).toHaveAttribute(
      "aria-label",
      "Play",
    )
    await controller.press("ArrowRight")
    await controller.waitForFocus("player-muted")
    await controller.press("Enter")
    await controller.press("ArrowRight")
    await controller.waitForFocus("player-quality")
    await controller.press("Enter")
    await window.waitForSelector("#player-quality-chooser")
    const optionIds = await window
      .locator('#player-quality-chooser [data-focus-id^="player-quality-option-"]')
      .evaluateAll((buttons) => buttons.map((button) => button.getAttribute("data-focus-id")))
    expect(optionIds.length).toBeGreaterThan(1)
    const firstOptionId = optionIds[0]
    const selectedOptionId = optionIds[1]
    if (firstOptionId === null || firstOptionId === undefined) {
      throw new Error("VOD chooser did not expose its first option")
    }
    if (selectedOptionId === null || selectedOptionId === undefined) {
      throw new Error("VOD chooser did not expose a second option")
    }
    await controller.waitForFocus(firstOptionId)
    await controller.press("ArrowRight")
    await controller.waitForFocus(selectedOptionId)
    await controller.press("Enter")
    const selectedQualityId = selectedOptionId.replace("player-quality-option-", "")
    await window.waitForFunction(
      (id) =>
        document
          .querySelector('[data-focus-id="player-quality"]')
          ?.getAttribute("data-requested-quality") === id,
      selectedQualityId,
    )
    await controller.press("ArrowDown")
    await controller.waitForFocus("player-quality-close")
    await controller.press("Enter")
    await window.waitForSelector("#player-quality-chooser", { state: "detached" })
    await controller.waitForFocus("player-quality")

    const finalState = await window.evaluate(() => ({
      muted: document.querySelector('[data-focus-id="player-muted"]')?.getAttribute("aria-label"),
      paused: document
        .querySelector('[data-focus-id="player-playback"]')
        ?.getAttribute("aria-label"),
      requested: document
        .querySelector('[data-focus-id="player-quality"]')
        ?.getAttribute("data-requested-quality"),
    }))
    const mediaAfter = await media.evaluate((element) => {
      const video = element as HTMLVideoElement
      return { muted: video.muted, paused: video.paused }
    })
    const sameFrame = await window.evaluate(
      (frame) => document.querySelector("#twitch-player-root iframe") === frame,
      playerFrame,
    )
    expect({ finalState, mediaAfter, mediaBefore }).toEqual({
      finalState: { muted: "Unmute", paused: "Play", requested: selectedQualityId },
      mediaAfter: { muted: true, paused: true },
      mediaBefore: { muted: false, paused: false },
    })
    expect(sameFrame).toBe(true)
  })
})

test.describe("cycle-05 hardware rendition verification", () => {
  test.use({ seed: emptyGuestSeed, windowSize: desktopGuestWindow })

  flowTest("F-cycle-05-2", async ({ controller }) => {
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.press("ArrowDown")
    await controller.press("ArrowRight", 2)
    await controller.press("Enter")
    await controller.waitForFocus("player-back")
    await controller.press("ArrowRight", 3)
    await controller.press("Enter")
    await controller.press("ArrowRight")
    await controller.press("Enter")
    await controller.press("ArrowUp")
    await controller.press("Enter")
    await controller.press("ArrowRight")
    await controller.press("Enter")
    await controller.press("ArrowUp")
    await controller.press("Enter")
    expect(await controller.focusId()).toBe("player-quality")
  })
})
