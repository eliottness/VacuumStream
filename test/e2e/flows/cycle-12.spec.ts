import type { Page } from "@playwright/test"
import { type Controller, expect, test } from "../support/fixtures"
import { flowTest } from "../support/ledger-test"

// A seeded past broadcast (the same public VOD as F-cycle-12-5) needs no account and no live
// channel to be currently on-air, so reaching a ready player here never depends on what Twitch
// happens to be serving right now. On a fresh profile Twitch sometimes gates this VOD behind a
// mature-content "Start Watching" interstitial before its READY event fires; clear it whenever it
// appears instead of letting it stall the wait.
const dismissMatureContentGate = async (window: Page): Promise<void> => {
  const frame = window.frames().find((candidate) => candidate.url().includes("player.twitch.tv"))
  if (frame === undefined) return
  const startWatching = frame.getByRole("button", { name: "Start Watching" })
  if ((await startWatching.count()) === 0) return
  await startWatching
    .first()
    .click({ timeout: 2_000 })
    .catch(() => {})
}

// Once ready, the shell keeps nudging Twitch's own play button in the background for up to 20s
// (PlayerView's autoplay retry) to start audible playback; whenever that nudge has to click
// Twitch's internal Play button (because the video has not buffered enough yet), the click steals
// keyboard focus into the iframe out from under whatever the test is about to press next. Toggling
// Mute cancels that retry loop (PlayerView.tsx's cancelAutoStart), so do it once immediately, then
// give any already in-flight nudge a moment to resolve before any test drives the toolbar.
// Twitch's own player can hold DOM focus inside its iframe after the shell's autoplay nudge
// clicks its Play button, and keys sent there never reach the shell. Setup therefore returns focus
// to a shell control programmatically; every assertion below is still driven with arrows and Enter.
const recoverShellFocus = async (
  controller: Pick<Controller, "focusId">,
  window: Page,
): Promise<void> => {
  if ((await controller.focusId()) !== "IFRAME") return
  await window.locator('[data-focus-id="player-back"]').focus()
}

const walkBackTo = async (
  controller: Pick<Controller, "focusId" | "press">,
  window: Page,
  target: string,
  key: string,
): Promise<void> => {
  await expect
    .poll(
      async () => {
        await recoverShellFocus(controller, window)
        const current = await controller.focusId()
        if (current !== target) await controller.press(key)
        return controller.focusId()
      },
      { timeout: 30_000 },
    )
    .toBe(target)
}

const cancelBackgroundAutoplayRace = async (
  controller: Pick<Controller, "focusId" | "press" | "travelTo" | "waitForFocus">,
  window: Page,
): Promise<void> => {
  const mute = window.locator('[data-focus-id="player-muted"]')
  const before = await mute.getAttribute("aria-label")
  const toggled = before === "Mute" ? "Unmute" : "Mute"
  await walkBackTo(controller, window, "player-muted", "ArrowRight")
  await expect
    .poll(
      async () => {
        if ((await mute.getAttribute("aria-label")) === toggled) return toggled
        await controller.press("Enter")
        return mute.getAttribute("aria-label")
      },
      { timeout: 30_000 },
    )
    .toBe(toggled)
  await expect
    .poll(
      async () => {
        if ((await mute.getAttribute("aria-label")) === before) return before
        await controller.press("Enter")
        return mute.getAttribute("aria-label")
      },
      { timeout: 30_000 },
    )
    .toBe(before)
  await walkBackTo(controller, window, "player-back", "ArrowLeft")
}

const waitForReadySource = async (
  controller: Pick<Controller, "focusId" | "press" | "travelTo" | "waitForFocus">,
  window: Page,
): Promise<void> => {
  const isReady = (): Promise<boolean> =>
    window.evaluate(
      () =>
        document.querySelector<HTMLButtonElement>('[data-focus-id="player-playback"]')?.disabled ===
        false,
    )
  const deadline = Date.now() + 45_000
  while (!(await isReady())) {
    if (Date.now() >= deadline) {
      throw new Error("Timed out waiting for the source to reach the ready state.")
    }
    await dismissMatureContentGate(window)
    await window.waitForTimeout(250)
  }
  await cancelBackgroundAutoplayRace(controller, window)
}

const seededRecordingBookmark = {
  details: { title: "Seeded recording", userId: "seed-user" },
  duration: 172_797,
  position: 600,
  updatedAt: 1,
  videoId: "2877678922",
} as const

const openSeededRecording = async (
  controller: Pick<Controller, "focusId" | "press" | "travelTo" | "waitForFocus">,
): Promise<void> => {
  await controller.waitForFocus("nav-home")
  await controller.press("ArrowRight")
  await controller.press("Enter")
  await controller.waitForFocus("video-resume-resume")
  await controller.press("Enter")
  await controller.waitForFocus("player-back")
}

test.describe("cycle-12 toolbar, chooser, and Close", () => {
  test.use({
    seed: { bookmarks: [seededRecordingBookmark], favourites: [] },
    windowSize: { height: 1080, width: 1920 },
  })

  flowTest("F-cycle-12-1", async ({ controller, window }) => {
    await openSeededRecording(controller)
    await waitForReadySource(controller, window)

    const route = await controller.trace([
      "ArrowRight",
      "ArrowRight",
      "ArrowRight",
      "ArrowRight",
      "ArrowRight",
      "ArrowRight",
      "ArrowLeft",
      "ArrowLeft",
      "Enter",
      "ArrowRight",
      "ArrowLeft",
      "ArrowDown",
      "Enter",
    ])

    expect(route).toEqual([
      "player-playback",
      "player-muted",
      "player-quality",
      "player-captions",
      "player-vods",
      "player-seek",
      "player-vods",
      "player-captions",
      "player-captions-show",
      "player-captions-hide",
      "player-captions-show",
      "player-captions-close",
      "player-captions",
    ])
    expect(route).not.toContain("IFRAME")
    expect(route).not.toContain("BODY")
    await expect(window.locator("#player-captions-chooser")).toHaveCount(0)
    await expect(window.locator('[data-focus-id="player-captions"]')).toHaveAttribute(
      "data-controller-focused",
      "true",
    )
    expect(await controller.focusId()).toBe("player-captions")
  })
})

test.describe("cycle-12 real caption rendering", () => {
  test.use({
    seed: { bookmarks: [], favourites: [{ login: "twitch" }] },
    windowSize: { height: 1080, width: 1920 },
  })

  flowTest("F-cycle-12-2", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.press("Enter")
    await controller.waitForFocus("player-back")
    await waitForReadySource(controller, window)
    await controller.press("ArrowRight", 4)
    await controller.press("Enter")
    await controller.waitForFocus("player-captions-show")
    await controller.press("Enter")

    const captions = window.frames().find((frame) => frame.url().includes("player.twitch.tv"))
    if (captions === undefined) throw new Error("The Twitch player frame was not created")
    await expect
      .poll(async () => captions.locator('[data-a-target*="caption"], [class*="caption"]').count())
      .toBeGreaterThan(0)
    await controller.press("ArrowRight")
    await controller.press("Enter")
    await expect
      .poll(async () => captions.locator('[data-a-target*="caption"], [class*="caption"]').count())
      .toBe(0)
  })
})

test.describe("cycle-12 offline exit remains controller reachable", () => {
  test.use({
    seed: { bookmarks: [], favourites: [{ login: "twitch" }] },
    windowSize: { height: 1080, width: 1920 },
  })

  flowTest("F-cycle-12-3", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.press("Enter")
    await controller.waitForFocus("player-back")
    await window.waitForFunction(
      () =>
        document.querySelector(".player-load-status")?.textContent?.includes("offline") === true,
      null,
      { timeout: 45_000 },
    )

    await controller.press("ArrowRight", 2)
    await controller.press("Enter")
    await controller.waitForFocus("player-captions-close")

    const expectOfflineChooser = async (): Promise<void> => {
      await expect(window.locator('[data-focus-id="player-captions-show"]')).toBeDisabled()
      await expect(window.locator('[data-focus-id="player-captions-hide"]')).toBeDisabled()
      await expect(window.locator('[data-focus-id="player-captions-close"]')).toBeEnabled()
    }
    await expectOfflineChooser()
    await controller.press("ArrowLeft")
    await controller.waitForFocus("player-captions")
    await controller.press("ArrowDown")
    await controller.waitForFocus("player-captions-close")
    await expectOfflineChooser()
    await controller.press("Enter")
    await controller.waitForFocus("player-captions")
    await controller.press("Enter")
    await controller.waitForFocus("player-captions-close")
    await expectOfflineChooser()
    await controller.press("Escape")
    await controller.waitForFocus("nav-home")
    await expect(window.locator(".player-view")).toHaveCount(0)
  })
})

test.describe("cycle-12 source departure clears requested captions", () => {
  test.use({
    seed: { bookmarks: [seededRecordingBookmark], favourites: [] },
    windowSize: { height: 1080, width: 1920 },
  })

  flowTest("F-cycle-12-4", async ({ controller, window }) => {
    await openSeededRecording(controller)
    await waitForReadySource(controller, window)
    await controller.press("ArrowRight", 4)
    await controller.press("Enter")
    await controller.waitForFocus("player-captions-show")
    await controller.press("Enter")
    await expect(window.locator('[data-focus-id="player-captions"]')).toHaveAttribute(
      "data-requested-captions",
      "show",
    )
    const previousFrameSrc = await window.locator("#twitch-player-root iframe").getAttribute("src")

    await controller.press("Escape")
    await controller.waitForFocus("nav-home")
    // The seeded bookmark now sits between nav-home and Quick watch, so reaching the second
    // source (Riot Games) walks through the Continue Watching card and its Forget action first.
    await controller.press("ArrowRight")
    await controller.waitForFocus(`continue-${seededRecordingBookmark.videoId}-open`)
    await controller.press("ArrowDown")
    await controller.press("ArrowDown")
    await controller.waitForFocus("stream-preview-twitch")
    await controller.press("ArrowRight")
    await controller.waitForFocus("stream-preview-riotgames")
    await controller.press("Enter")
    await window.waitForSelector("#twitch-player-root iframe", { timeout: 30_000 })
    await expect
      .poll(async () => window.locator("#twitch-player-root iframe").getAttribute("src"), {
        timeout: 30_000,
      })
      .not.toBe(previousFrameSrc)
    await controller.waitForFocus("player-back")
    expect(await controller.travelTo("player-captions")).toBe(true)
    await controller.press("Enter")
    await window.waitForSelector("#player-captions-chooser")

    await expect(window.locator('[data-focus-id="player-captions"]')).not.toHaveAttribute(
      "data-requested-captions",
    )
    await expect(window.locator('[data-focus-id="player-captions-show"]')).not.toHaveAttribute(
      "aria-pressed",
      "true",
    )
    await expect(window.locator('[data-focus-id="player-captions-hide"]')).not.toHaveAttribute(
      "aria-pressed",
      "true",
    )
  })
})

test.describe("cycle-12 legacy recording bypass and caption chooser", () => {
  test.use({
    seed: {
      bookmarks: [
        {
          duration: 172_797,
          position: 619,
          updatedAt: 1_700_000_000_000,
          videoId: "2877678922",
        },
      ],
      favourites: [],
    },
    windowSize: { height: 1080, width: 1920 },
  })

  flowTest("F-cycle-12-5", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.press("Enter")
    await controller.waitForFocus("video-resume-resume")
    await controller.press("Enter")
    await controller.waitForFocus("player-back")
    await waitForReadySource(controller, window)

    await expect(window.locator('[data-focus-id="player-vods"]')).toBeDisabled()
    await controller.press("ArrowRight", 4)
    await controller.waitForFocus("player-captions")
    await controller.press("ArrowRight")
    await controller.waitForFocus("player-seek")
    await controller.press("ArrowRight")
    await controller.waitForFocus("player-fullscreen")
    await controller.press("ArrowLeft")
    await controller.waitForFocus("player-seek")
    await controller.press("ArrowLeft")
    await controller.waitForFocus("player-captions")
    await controller.press("Enter")
    await controller.waitForFocus("player-captions-show")
    await controller.press("ArrowRight", 2)
    await controller.waitForFocus("player-captions-close")
    await controller.press("Enter")

    expect(await controller.focusId()).toBe("player-captions")
    await expect(window.locator("#player-captions-chooser")).toHaveCount(0)
    await expect(window.locator("#twitch-player-root iframe")).toHaveCount(1)
    await expect(window.locator('[data-focus-id="player-vods"]')).toBeDisabled()
  })
})

test.describe("cycle-12 simultaneous chooser layout", () => {
  test.use({
    seed: { bookmarks: [seededRecordingBookmark], favourites: [] },
    windowSize: { height: 720, width: 1280 },
  })

  flowTest("F-cycle-12-6", async ({ controller, window }) => {
    await openSeededRecording(controller)
    await waitForReadySource(controller, window)

    await controller.press("ArrowRight", 3)
    await controller.waitForFocus("player-quality")
    await controller.press("Enter")
    await window.waitForSelector("#player-quality-chooser")
    await controller.press("ArrowUp")
    await controller.waitForFocus("player-quality")
    await controller.press("ArrowRight")
    await controller.waitForFocus("player-captions")
    await controller.press("Enter")
    await window.waitForSelector("#player-captions-chooser")

    const assertLayout = async (): Promise<void> => {
      const metrics = await window.evaluate(() => {
        const rect = (selector: string): DOMRect | undefined => {
          const element = document.querySelector<HTMLElement>(selector)
          return element === null ? undefined : element.getBoundingClientRect()
        }
        const overlap = (left: DOMRect | undefined, right: DOMRect | undefined): boolean =>
          left !== undefined &&
          right !== undefined &&
          left.left < right.right &&
          left.right > right.left &&
          left.top < right.bottom &&
          left.bottom > right.top
        const focused = document.activeElement?.getBoundingClientRect()
        const viewportHeight = document.documentElement.clientHeight
        const viewportWidth = document.documentElement.clientWidth
        const video = rect(".player-frame")
        const quality = rect(".player-quality")
        const captions = rect(".player-captions")
        return {
          captionsQualityOverlap: overlap(captions, quality),
          focusedOutsideVideo: focused !== undefined && !overlap(focused, video),
          focusedVisible:
            focused !== undefined &&
            focused.top >= 0 &&
            focused.left >= 0 &&
            focused.bottom <= viewportHeight &&
            focused.right <= viewportWidth,
          panelVideoOverlap: overlap(quality, video) || overlap(captions, video),
          videoHeight: video?.height ?? 0,
          videoWidth: video?.width ?? 0,
        }
      })
      expect(metrics.focusedVisible).toBe(true)
      expect(metrics.focusedOutsideVideo).toBe(true)
      expect(metrics.captionsQualityOverlap).toBe(false)
      expect(metrics.panelVideoOverlap).toBe(false)
      expect(metrics.videoWidth).toBeGreaterThanOrEqual(400)
      expect(metrics.videoHeight).toBeGreaterThanOrEqual(300)
    }

    await assertLayout()
    const traversed: string[] = []
    for (const key of ["ArrowRight", "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowDown"]) {
      await controller.press(key)
      traversed.push(await controller.focusId())
      await assertLayout()
    }
    expect(traversed).toEqual([
      "player-captions-hide",
      "player-captions-close",
      "player-captions",
      "player-quality",
      expect.stringMatching(/^player-quality-(option-.+|close)$/),
    ])
  })
})
