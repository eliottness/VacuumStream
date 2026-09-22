import { spawn } from "node:child_process"
import { expect, test } from "../support/fixtures"
import { flowTest } from "../support/ledger-test"

const waitForExit = (process: ReturnType<typeof spawn>): Promise<void> =>
  new Promise((resolve, reject) => {
    process.once("error", reject)
    process.once("exit", () => resolve())
  })

test.describe("cycle-20 profile persistence", () => {
  test.use({
    seed: {
      bookmarks: [
        {
          details: { title: "Known saved VOD", userId: "0" },
          duration: 3600,
          position: 120,
          updatedAt: 1,
          videoId: "known-vod",
        },
      ],
      favourites: [{ login: "known-favourite", userId: "0" }],
    },
    windowSize: { height: 1080, width: 1920 },
  })

  flowTest("F-cycle-20-3", async ({ controller, window }) => {
    await window.waitForSelector('[data-focus-id="continue-known-vod-open"]')
    await window.waitForSelector('[data-focus-id="favourite-known-favourite-open"]')
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.waitForFocus("continue-known-vod-open")
    await controller.press("ArrowDown")
    await controller.waitForFocus("continue-known-vod-forget")
    await controller.press("ArrowDown")
    await controller.waitForFocus("favourite-known-favourite-open")
    await controller.press("ArrowUp")
    await controller.waitForFocus("continue-known-vod-forget")
    await controller.press("ArrowUp")
    await controller.waitForFocus("continue-known-vod-open")
  })
})

test.describe("cycle-20 repeated launch playback", () => {
  test.use({ seed: { bookmarks: [], favourites: [] }, windowSize: { height: 1080, width: 1920 } })

  flowTest("F-cycle-20-1", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.waitForFocus("home-connect-twitch")
    await controller.press("ArrowDown")
    await controller.waitForFocus("home-twitch")
    await controller.press("ArrowRight")
    await controller.waitForFocus("stream-preview-twitch")
    await controller.press("ArrowRight")
    expect(await controller.focusId()).toMatch(/^stream-/)
    await controller.press("Enter")

    await window.waitForSelector("#twitch-player-root iframe")
    await window.waitForFunction(() => {
      const playback = document.querySelector<HTMLButtonElement>(
        '[data-focus-id="player-playback"]',
      )
      return playback?.getAttribute("aria-label") === "Pause"
    })
    expect(await window.locator("#twitch-player-root iframe").count()).toBe(1)
  })
})

test.describe("cycle-20 startup launch race", () => {
  test.use({ seed: { bookmarks: [], favourites: [] }, windowSize: { height: 1080, width: 1920 } })

  flowTest("F-cycle-20-2", async ({ app, controller, profileDirectory, window }) => {
    const executable = await app.evaluate(({ app }) => app.getPath("exe"))
    const arguments_ = [".", `--user-data-dir=${profileDirectory}`]
    const competingLaunches = [
      spawn(executable, arguments_, { cwd: process.cwd(), env: process.env }),
      spawn(executable, arguments_, { cwd: process.cwd(), env: process.env }),
    ]

    await Promise.all(competingLaunches.map(waitForExit))
    await controller.waitForFocus("nav-home")
    await expect.poll(() => window.title()).toMatch(/^Home [·-] VacuumStream$/)
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
    expect(await window.locator('[data-focus-id="nav-home"]').count()).toBe(1)
  })
})
