import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { expect, test } from "../support/fixtures"
import { flowTest } from "../support/ledger-test"

const DESKTOP_WINDOW = { height: 1080, width: 1920 }

const row11Seed = {
  bookmarks: [
    ...Array.from({ length: 11 }, (_, index) => ({
      details: { title: `Seeded recording ${index + 1}`, userId: "seed-user" },
      duration: 10_800,
      position: 3_900,
      updatedAt: index + 1,
      videoId: String(2_000_000_001 + index),
    })),
    {
      duration: 10_800,
      position: 3_900,
      updatedAt: 12,
      videoId: "123456789",
    },
  ],
}

const legacySingleSeed = {
  bookmarks: [{ duration: 10_800, position: 3_900, updatedAt: 1, videoId: "123456789" }],
}

const startOverSeed = {
  bookmarks: [
    {
      details: { title: "Seeded recording 2", userId: "seed-user" },
      duration: 10_800,
      position: 3_900,
      updatedAt: 4,
      videoId: "2000000002",
    },
    {
      details: { title: "Seeded recording 1", userId: "seed-user" },
      duration: 10_800,
      position: 3_900,
      updatedAt: 3,
      videoId: "2000000001",
    },
    {
      details: { title: "Seeded recording 3", userId: "seed-user" },
      duration: 10_800,
      position: 3_900,
      updatedAt: 2,
      videoId: "2000000003",
    },
    {
      details: { title: "Seeded recording 4", userId: "seed-user" },
      duration: 10_800,
      position: 3_900,
      updatedAt: 1,
      videoId: "2000000004",
    },
  ],
}

const singleBookmarkSeed = {
  bookmarks: [
    {
      details: { title: "Seeded recording 1", userId: "seed-user" },
      duration: 3_600,
      position: 900,
      updatedAt: 1_790_064_248_093,
      videoId: "2000000001",
    },
  ],
}

const recoveredPlaybackProgress = JSON.stringify({
  bookmarks: {
    "2000000001": {
      details: { title: "Seeded recording 1 - a quiet evening", userId: "seed-user" },
      duration: 3_600,
      position: 900,
      updatedAt: 1_790_064_248_093,
    },
  },
  version: 1,
})

test.describe("cycle-11 continue watching seeded shelf", () => {
  test.use({ seed: row11Seed, windowSize: DESKTOP_WINDOW })

  flowTest("F-cycle-11-1", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await window.waitForSelector('[data-focus-id="continue-123456789-open"]')

    await controller.press("ArrowRight")
    await controller.waitForFocus("continue-123456789-open")

    await expect(window.locator(".continue-card__open")).toHaveCount(10)
    const titles = await window.locator(".continue-card__open strong").allTextContents()
    expect(titles.some((title) => title.startsWith("Recording "))).toBe(true)
    await expect(window.locator(".settings-panel")).toHaveCount(0)
  })
})

test.describe("cycle-11 resume prompt entry and choices", () => {
  test.use({ seed: legacySingleSeed, windowSize: DESKTOP_WINDOW })

  flowTest("F-cycle-11-2", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await window.waitForSelector('[data-focus-id="continue-123456789-open"]')

    await controller.press("ArrowRight")
    await controller.waitForFocus("continue-123456789-open")
    await controller.press("Enter")

    await expect(window.locator(".video-resume")).toBeVisible()
    await controller.waitForFocus("video-resume-resume")
    await expect(window.locator('[data-focus-id="video-resume-start"]')).toHaveCount(1)
    await expect(window.locator('[data-focus-id="video-resume-back"]')).toHaveCount(1)
    await expect(window.locator("#twitch-player-root iframe")).toHaveCount(0)
  })

  flowTest("F-cycle-11-3", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await window.waitForSelector('[data-focus-id="continue-123456789-open"]')

    await controller.press("ArrowRight")
    await controller.waitForFocus("continue-123456789-open")
    await controller.press("Enter")
    await controller.waitForFocus("video-resume-resume")
    await controller.press("Enter")

    await window.waitForSelector("#twitch-player-root iframe")
    await expect(window.locator("#twitch-player-root iframe")).toHaveCount(1)
    await controller.waitForFocus("player-back")
  })

  flowTest("F-cycle-11-4", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await window.waitForSelector('[data-focus-id="continue-123456789-open"]')

    await controller.press("ArrowRight")
    await controller.waitForFocus("continue-123456789-open")
    await controller.press("Enter")
    await controller.waitForFocus("video-resume-resume")

    const reachedBack = await controller.travelTo("video-resume-back", "ArrowDown", 4)
    expect(reachedBack).toBe(true)
    await controller.press("Enter")

    await expect(window.locator(".browse-view h1")).toHaveText("Live now")
    await expect(window.locator('[data-focus-id="continue-123456789-open"]')).toHaveCount(1)
    await expect(window.locator("#twitch-player-root iframe")).toHaveCount(0)
  })
})

test.describe("cycle-11 start over clears saved progress", () => {
  test.use({ seed: startOverSeed, windowSize: DESKTOP_WINDOW })

  flowTest("F-cycle-11-5", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await window.waitForSelector('[data-focus-id^="continue-"][data-focus-id$="-open"]')

    await controller.press("ArrowRight")
    const selectedFocusId = await controller.focusId()
    const selectedVideoId = /^continue-(.+)-open$/.exec(selectedFocusId)?.[1]
    if (selectedVideoId === undefined)
      throw new Error(`Expected a Continue Watching card, got ${selectedFocusId}`)

    await controller.press("Enter")
    await controller.waitForFocus("video-resume-resume")
    await controller.press("ArrowRight")
    await controller.waitForFocus("video-resume-start")
    await controller.press("Enter")

    await controller.waitForFocus("player-back")
    await controller.press("Enter")

    await expect(window.locator(".browse-view h1")).toHaveText("Live now")
    await expect(window.locator(`[data-focus-id="continue-${selectedVideoId}-open"]`)).toHaveCount(
      0,
    )
  })
})

test.describe("cycle-11 forget progress focus rescue", () => {
  test.use({ seed: singleBookmarkSeed, windowSize: DESKTOP_WINDOW })

  flowTest("F-cycle-11-6", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await window.waitForSelector('[data-focus-id="continue-2000000001-open"]')

    await controller.press("ArrowRight")
    await controller.waitForFocus("continue-2000000001-open")
    await controller.press("ArrowDown")
    await controller.waitForFocus("continue-2000000001-forget")
    await controller.press("Enter")

    await expect(window.locator(".continue-watching")).toHaveCount(0)
    await controller.waitForFocus("home-sign-in")
  })
})

test.describe("cycle-11 read-error retry", () => {
  test.use({
    seed: { rawFiles: { "playback-progress.json": "{bad json" } },
    windowSize: DESKTOP_WINDOW,
  })

  flowTest("F-cycle-11-7", async ({ controller, profileDirectory, window }) => {
    await controller.waitForFocus("nav-home")
    await window.waitForSelector('.continue-watching__error [role="alert"]')

    await controller.press("ArrowRight")
    await controller.waitForFocus("continue-retry")

    await writeFile(join(profileDirectory, "playback-progress.json"), recoveredPlaybackProgress)
    await controller.press("Enter")

    await window.waitForFunction(
      () =>
        document.querySelector('.continue-watching-status [role="status"]') === null &&
        document.querySelector(
          '.continue-watching [role="alert"], .continue-watching-status [role="alert"]',
        ) === null,
    )

    await expect(window.locator(".continue-card__open")).toHaveCount(1)
    await expect(window.locator('[data-focus-id="continue-retry"]')).toHaveCount(0)
  })
})

test.describe("cycle-11 pending departure/completion settling", () => {
  test.use({ seed: singleBookmarkSeed, windowSize: DESKTOP_WINDOW })

  flowTest("F-cycle-11-8", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await window.waitForSelector('[data-focus-id="continue-2000000001-open"]')

    await controller.press("ArrowRight")
    await controller.waitForFocus("continue-2000000001-open")

    const before =
      (
        await window.locator('[data-focus-id="continue-2000000001-open"] span').textContent()
      )?.trim() ?? ""

    await controller.press("Enter")
    await controller.waitForFocus("video-resume-resume")
    await controller.press("Enter")

    await window.waitForSelector("#twitch-player-root iframe")
    await controller.waitForFocus("player-back")
    await controller.press("ArrowRight")
    await controller.waitForFocus("player-playback")
    await controller.press("Enter")
    await controller.press("ArrowLeft")
    await controller.waitForFocus("player-back")
    await controller.press("Enter")

    await expect(window.locator(".browse-view h1")).toHaveText("Live now")
    await window.waitForFunction(
      () =>
        document.querySelector('.continue-watching-status [role="status"]') === null &&
        (document.querySelector(".continue-watching")?.getAttribute("aria-busy") ?? "false") !==
          "true",
    )

    const after = await window.evaluate(() => {
      const card = document.querySelector('[data-focus-id="continue-2000000001-open"]')
      if (card === null) return "REMOVED"
      return card.querySelector("span")?.textContent?.trim() ?? ""
    })

    expect(after).not.toBe(before)
  })
})
