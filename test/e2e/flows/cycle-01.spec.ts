import { expect, test } from "../support/fixtures"
import { flowTest } from "../support/ledger-test"
import { waitForPlayerReady } from "../support/twitch"

const PUBLIC_VOD_ID = "2877678922"
const PUBLIC_VOD_DURATION = 47 * 60 * 60 + 59 * 60 + 57
const PUBLIC_VOD_POSITION = 619

const vodSeed = {
  bookmarks: [
    {
      details: { title: "Public recording", userId: "0" },
      duration: PUBLIC_VOD_DURATION,
      position: PUBLIC_VOD_POSITION,
      updatedAt: 1,
      videoId: PUBLIC_VOD_ID,
    },
  ],
  favourites: [],
} as const

const elapsedSeconds = (value: string | null): number => {
  const match = value?.trim().match(/^(\d+):(\d{2}):(\d{2}) \/ /)
  if (match === null || match === undefined) return Number.NaN
  const [, hours, minutes, seconds] = match
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)
}

const waitForVOD = async (
  controller: Parameters<Parameters<typeof flowTest>[1]>[0]["controller"],
  window: Parameters<Parameters<typeof flowTest>[1]>[0]["window"],
): Promise<void> => {
  await window.waitForSelector(`[data-focus-id="continue-${PUBLIC_VOD_ID}-open"]`)
  await controller.waitForFocus("nav-home")
  await controller.press("ArrowRight")
  await controller.waitForFocus(`continue-${PUBLIC_VOD_ID}-open`)
  await controller.press("Enter")
  await controller.waitForFocus("video-resume-resume")
  await controller.press("Enter")
  await controller.waitForFocus("player-back")
  await waitForPlayerReady(window)
  await window.waitForFunction(
    () =>
      document.querySelector<HTMLButtonElement>('[data-focus-id="player-seek"]')?.disabled ===
      false,
    null,
    { timeout: 90_000 },
  )
  await controller.press("ArrowRight", 5)
  await controller.waitForFocus("player-seek")
  await controller.press("Enter")
  await controller.waitForFocus("player-seek")
  await window.waitForFunction(
    () => {
      const output = document.querySelector<HTMLOutputElement>(".player-transport__time")
      const text = output?.textContent?.trim() ?? ""
      const buttons = [...document.querySelectorAll<HTMLButtonElement>(".player-transport button")]
      return (
        /^\d+:\d{2}:\d{2} \/ \d+:\d{2}:\d{2}$/.test(text) &&
        buttons.length === 4 &&
        buttons.every((button) => !button.disabled)
      )
    },
    null,
    { timeout: 90_000 },
  )
  await window.waitForFunction(
    (expectedPosition) => {
      const text = document.querySelector(".player-transport__time")?.textContent?.trim() ?? ""
      const match = text.match(/^(\d+):(\d{2}):(\d{2}) \/ /)
      if (match === null) return false
      const [, hours, minutes, seconds] = match
      const elapsed = Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)
      return elapsed >= expectedPosition - 30 && elapsed <= expectedPosition + 120
    },
    PUBLIC_VOD_POSITION,
    { timeout: 90_000 },
  )
  await controller.press("ArrowUp")
  await controller.waitForFocus("player-back")
}

const transportIsVisibleOutsideVideo = async (
  window: Parameters<Parameters<typeof flowTest>[1]>[0]["window"],
): Promise<boolean> =>
  window.evaluate(() => {
    const transport = document.querySelector<HTMLElement>(".player-transport")
    const frame = document.querySelector<HTMLIFrameElement>("#twitch-player-root iframe")
    if (transport === null || frame === null) return false
    const viewport = { height: globalThis.innerHeight, width: globalThis.innerWidth }
    const transportRect = transport.getBoundingClientRect()
    const frameRect = frame.getBoundingClientRect()
    const visible = (rect: DOMRect): boolean =>
      rect.width > 0 &&
      rect.height > 0 &&
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= viewport.height &&
      rect.right <= viewport.width
    const overlaps =
      transportRect.left < frameRect.right &&
      transportRect.right > frameRect.left &&
      transportRect.top < frameRect.bottom &&
      transportRect.bottom > frameRect.top
    const controls = [...transport.querySelectorAll<HTMLElement>("button, output")]
    return (
      visible(transportRect) &&
      controls.every((control) => visible(control.getBoundingClientRect())) &&
      !overlaps
    )
  })

test.describe("cycle-01 live playback", () => {
  test.use({
    seed: { bookmarks: [], favourites: [] },
    windowSize: { height: 720, width: 1280 },
  })

  flowTest("F-cycle-01-1", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.waitForFocus("home-sign-in")
    await controller.press("ArrowDown")
    await controller.waitForFocus("stream-preview-twitch")
    await controller.press("Enter")
    await controller.waitForFocus("player-back")
    await expect(window.locator(".player-view")).toHaveCount(1)
    await expect(window.locator(".player-transport")).toHaveCount(0)
  })
})

test.describe("cycle-01 VOD transport focus", () => {
  test.use({
    seed: vodSeed,
    windowSize: { height: 720, width: 1280 },
  })

  flowTest("F-cycle-01-2", async ({ controller, window }) => {
    await waitForVOD(controller, window)
    const jumpIds = [
      "player-seek-back-5m",
      "player-seek-back-30s",
      "player-seek-forward-30s",
      "player-seek-forward-5m",
    ] as const

    await controller.press("ArrowDown")
    await controller.waitForFocus(jumpIds[0])
    for (const [index, jumpId] of jumpIds.entries()) {
      if (index > 0) {
        await controller.press("ArrowRight")
        await controller.waitForFocus(jumpId)
      }
      await controller.press("Enter")
      await controller.waitForFocus(jumpId)
      expect(await controller.focusId()).toBe(jumpId)

      await controller.press("ArrowUp")
      await controller.waitForFocus("player-back")
      expect(await controller.focusId()).toBe("player-back")

      await controller.press("ArrowDown")
      await controller.waitForFocus(jumpIds[0])
      for (let returnStep = 0; returnStep < index; returnStep += 1) {
        await controller.press("ArrowRight")
      }
      await controller.waitForFocus(jumpId)
      expect(await controller.focusId()).toBe(jumpId)
    }
  })
})

test.describe("cycle-01 VOD seeking", () => {
  test.use({
    seed: vodSeed,
    windowSize: { height: 720, width: 1280 },
  })

  flowTest("F-cycle-01-3", async ({ controller, window }) => {
    await waitForVOD(controller, window)
    const transportTime = window.locator(".player-transport__time")
    const officialPlayer = window.locator("#twitch-player-root iframe")
    const media = window.frameLocator("#twitch-player-root iframe").locator("video")
    await expect(officialPlayer).toHaveCount(1)
    await expect(officialPlayer).toHaveAttribute("src", /player\.twitch\.tv/)
    await expect(media).toHaveCount(1)
    await expect(transportTime).toHaveText(/^\d+:\d{2}:\d{2} \/ \d+:\d{2}:\d{2}$/)

    const beforeForward = elapsedSeconds(await transportTime.textContent())
    await controller.press("ArrowDown")
    await controller.press("ArrowRight", 3)
    await controller.waitForFocus("player-seek-forward-5m")
    await controller.press("Enter")
    await controller.waitForFocus("player-seek-forward-5m")
    await expect
      .poll(
        async () => {
          const elapsed = elapsedSeconds(await transportTime.textContent())
          return elapsed > beforeForward + 240 && elapsed < beforeForward + 360
        },
        { timeout: 30_000 },
      )
      .toBe(true)
    const afterForward = elapsedSeconds(await transportTime.textContent())

    await controller.press("ArrowLeft", 3)
    await controller.waitForFocus("player-seek-back-5m")
    await controller.press("Enter")
    await controller.waitForFocus("player-seek-back-5m")
    await expect
      .poll(
        async () => {
          const elapsed = elapsedSeconds(await transportTime.textContent())
          return elapsed < afterForward - 240 && elapsed > afterForward - 360
        },
        { timeout: 30_000 },
      )
      .toBe(true)
    await expect(transportTime).toHaveText(/^\d+:\d{2}:\d{2} \/ \d+:\d{2}:\d{2}$/)
  })
})

test.describe("cycle-01 VOD start clamp", () => {
  test.use({
    seed: vodSeed,
    windowSize: { height: 720, width: 1280 },
  })

  flowTest("F-cycle-01-4", async ({ controller, window }) => {
    await window.waitForSelector(`[data-focus-id="continue-${PUBLIC_VOD_ID}-open"]`)
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.waitForFocus(`continue-${PUBLIC_VOD_ID}-open`)
    await controller.press("Enter")
    await controller.waitForFocus("video-resume-resume")
    await controller.press("Enter")
    await controller.waitForFocus("player-back")
    await window.waitForFunction(
      () =>
        document.querySelector<HTMLButtonElement>('[data-focus-id="player-seek"]')?.disabled ===
        false,
    )
    await controller.press("ArrowRight", 5)
    await controller.waitForFocus("player-seek")
    await controller.press("Enter")
    await controller.waitForFocus("player-seek")
    await window.waitForFunction(() => {
      const output = document.querySelector<HTMLOutputElement>(".player-transport__time")
      return /^\d+:\d{2}:\d{2} \/ \d+:\d{2}:\d{2}$/.test(output?.textContent?.trim() ?? "")
    })
    await controller.press("ArrowUp")
    await controller.waitForFocus("player-back")

    await expect
      .poll(() => window.locator('[data-focus-id="player-playback"]').getAttribute("aria-label"))
      .toBe("Pause")
    await controller.press("ArrowRight")
    await controller.waitForFocus("player-playback")
    await controller.press("Enter")
    await expect
      .poll(() => window.locator('[data-focus-id="player-playback"]').getAttribute("aria-label"))
      .toBe("Play")

    const transportTime = window.locator(".player-transport__time")
    const media = window.frameLocator("#twitch-player-root iframe").locator("video")
    await expect(media).toHaveCount(1)
    const assertPausedAtStart = async (): Promise<void> => {
      await expect
        .poll(
          async () => {
            const [state, text] = await Promise.all([
              media.evaluate((element) => {
                const video = element as HTMLVideoElement
                return { currentTime: Math.floor(video.currentTime), paused: video.paused }
              }),
              transportTime.textContent(),
            ])
            return { ...state, elapsed: elapsedSeconds(text) }
          },
          { timeout: 15_000 },
        )
        .toEqual({ currentTime: 0, paused: true, elapsed: 0 })
    }
    await controller.press("ArrowLeft")
    await controller.waitForFocus("player-back")
    await controller.press("ArrowDown")
    await controller.waitForFocus("player-seek-back-5m")
    for (let index = 0; index < 4; index += 1) {
      await controller.press("Enter")
      await controller.waitForFocus("player-seek-back-5m")
      await assertPausedAtStart()
    }

    await controller.press("ArrowRight")
    await controller.waitForFocus("player-seek-back-30s")
    await controller.press("Enter")
    await controller.waitForFocus("player-seek-back-30s")
    await assertPausedAtStart()
  })
})

test.describe("cycle-01 HTPC transport", () => {
  test.use({
    seed: vodSeed,
    windowSize: { height: 1080, width: 1920 },
  })

  flowTest("F-cycle-01-5", async ({ controller, window }) => {
    await waitForVOD(controller, window)
    await expect.poll(() => transportIsVisibleOutsideVideo(window)).toBe(true)

    await controller.press("ArrowDown")
    await controller.press("ArrowRight", 3)
    await controller.waitForFocus("player-seek-forward-5m")
    await controller.press("Enter")
    await controller.waitForFocus("player-seek-forward-5m")
    await expect.poll(() => transportIsVisibleOutsideVideo(window)).toBe(true)

    await controller.press("ArrowLeft", 3)
    await controller.waitForFocus("player-seek-back-5m")
    await controller.press("Enter")
    await controller.waitForFocus("player-seek-back-5m")
    await expect.poll(() => transportIsVisibleOutsideVideo(window)).toBe(true)

    await controller.press("ArrowUp")
    await controller.waitForFocus("player-back")
    await expect.poll(() => transportIsVisibleOutsideVideo(window)).toBe(true)
  })
})
