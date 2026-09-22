import type { Page } from "@playwright/test"
import { type Controller, expect, test } from "../support/fixtures"
import { flowTest } from "../support/ledger-test"

const desktopWindow = { height: 1080, width: 1920 } as const

// Guest Home's "Quick watch" shelf always opens with the Twitch preview card first
// (demo-data.ts PREVIEW_STREAMS[0].userLogin === "twitch"), so its focus id is stable.
const openQuickWatchTwitchCard = async (controller: Controller): Promise<void> => {
  await controller.waitForFocus("nav-home")
  await controller.press("ArrowRight")
  await controller.waitForFocus("home-sign-in")
  await controller.press("ArrowDown")
  await controller.waitForFocus("stream-preview-twitch")
  await controller.press("Enter")
  await controller.waitForFocus("player-back")
}

// The player toolbar's Play/Mute controls stay disabled until Twitch reports the stream is
// ready; only then does player-back's right-hand neighbour become player-playback.
const waitForPlayerReady = async (window: Page): Promise<void> => {
  await window.waitForFunction(
    () =>
      document.querySelector<HTMLButtonElement>('[data-focus-id="player-playback"]')?.disabled ===
      false,
    null,
    { timeout: 45_000 },
  )
}

// The on-screen keyboard is a 10-column grid (SearchView.tsx's KEY_ROWS); each of these three
// rows fills exactly 10 cells, so moving between them by row/column delta lands on the same
// letter the pointer-free spatial navigation would. Space, Backspace, Clear, and Search fill a
// further row below the digits, reachable from column 0 (the same q/a/z/4/space chain F-xc-docs-5
// uses) plus three ArrowRight presses.
const KEYBOARD_ROWS: readonly (readonly string[])[] = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l", "z"],
  ["x", "c", "v", "b", "n", "m", "_", "1", "2", "3"],
]

const keyboardPosition = (letter: string): { readonly col: number; readonly row: number } => {
  for (const [row, letters] of KEYBOARD_ROWS.entries()) {
    const col = letters.indexOf(letter)
    if (col !== -1) return { col, row }
  }
  throw new Error(`No on-screen keyboard key for ${letter}`)
}

const pressOnScreenLetter = async (
  controller: Controller,
  from: { readonly col: number; readonly row: number },
  letter: string,
): Promise<{ readonly col: number; readonly row: number }> => {
  const to = keyboardPosition(letter)
  const rowDelta = to.row - from.row
  await controller.press(rowDelta >= 0 ? "ArrowDown" : "ArrowUp", Math.abs(rowDelta))
  const colDelta = to.col - from.col
  await controller.press(colDelta >= 0 ? "ArrowRight" : "ArrowLeft", Math.abs(colDelta))
  await controller.waitForFocus(`search-key-${letter}`)
  await controller.press("Enter")
  return to
}

// The NEEDS-AUTH rows all start the same way: a signed-in QA session searches the exact string
// "twitch" through the on-screen keyboard, opens the official Twitch channel from the results,
// and drills into Past broadcasts. This never runs without E2E_TWITCH_AUTH=1 and a stored QA
// session, so it is written to the ledger's letter but degrades gracefully if the account, the
// live channel, or its recordings are unavailable at run time.
const openQaTwitchVod = async (
  controller: Controller,
  window: Page,
): Promise<{ readonly opened: boolean }> => {
  await controller.waitForFocus("nav-home")
  await controller.press("ArrowDown", 2)
  await controller.waitForFocus("nav-search")
  await controller.press("Enter")
  await controller.waitForFocus("search-input")

  await controller.press("ArrowDown")
  await controller.waitForFocus("search-key-q")
  let position = { col: 0, row: 0 }
  for (const letter of ["t", "w", "i", "t", "c", "h"]) {
    position = await pressOnScreenLetter(controller, position, letter)
  }
  // Column 0 carries straight down through every row (q/a/z/4/space); Search sits three
  // presses to the right of Space on the row beneath the digits.
  await controller.press("ArrowLeft", position.col)
  await controller.press("ArrowDown", KEYBOARD_ROWS.length + 1 - position.row)
  await controller.waitForFocus("search-key-space")
  await controller.press("ArrowRight", 3)
  await controller.waitForFocus("search-key-submit")
  await controller.press("Enter")

  const twitchResult = window.locator('[data-focus-id^="channel-"]', { hasText: "Twitch" }).first()
  if ((await twitchResult.count()) === 0) return { opened: false }
  const resultId = await twitchResult.getAttribute("data-focus-id")
  if (resultId === null) return { opened: false }
  expect(await controller.travelTo(resultId, "ArrowDown", 20)).toBe(true)
  await controller.press("Enter")
  await controller.waitForFocus("player-back")
  await waitForPlayerReady(window)

  await controller.press("ArrowRight", 5)
  await controller.waitForFocus("player-vods")
  await controller.press("Enter")
  await window.waitForSelector(".video-card, .empty-state")
  const vod = window.locator(".video-card").first()
  if ((await vod.count()) === 0) return { opened: false }
  const vodId = await vod.getAttribute("data-focus-id")
  if (vodId === null) return { opened: false }
  expect(await controller.travelTo(vodId, "ArrowDown", 20)).toBe(true)
  await controller.press("Enter")
  await controller.waitForFocus("player-back")
  await waitForPlayerReady(window)
  return { opened: true }
}

test.describe("xc-docs Show chat then Enter chat on a live channel", () => {
  test.use({ windowSize: desktopWindow })

  flowTest("F-xc-docs-4", async ({ controller, window }) => {
    await openQuickWatchTwitchCard(controller)

    // The stream is still "loading" here, so player-back's right-hand neighbour skips the
    // disabled Play/Mute buttons and goes straight to Quality; four presses reach Show chat.
    await controller.press("ArrowRight", 4)
    await controller.waitForFocus("player-chat")
    await expect(window.locator('[data-focus-id="player-chat"]')).toHaveText("Show chat")

    await controller.press("Enter")
    await expect(window.locator('[data-focus-id="player-chat"]')).toHaveText("Hide chat")
    await controller.press("ArrowDown")
    await controller.waitForFocus("player-chat-enter")
    await controller.press("Enter")

    const chatFrame = window.locator('iframe[title^="Live chat for"]')
    await expect(chatFrame).toHaveAttribute(
      "src",
      /^https:\/\/www\.twitch\.tv\/embed\/[^/]+\/chat\?parent=localhost$/,
    )
    await expect
      .poll(async () => chatFrame.evaluate((frame) => (frame as HTMLIFrameElement).tabIndex))
      .toBe(0)
    await expect.poll(() => controller.focusId(), { timeout: 10_000 }).toBe("IFRAME")
  })
})

test.describe("xc-docs Save and reach a favourite from Search", () => {
  flowTest("F-xc-docs-5", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowDown", 2)
    await controller.waitForFocus("nav-search")
    await controller.press("Enter")
    await controller.waitForFocus("search-input")

    await controller.press("ArrowDown")
    await controller.waitForFocus("search-key-q")
    await controller.press("Enter")
    await expect(window.locator("#channel-search")).toHaveValue("q")

    // The on-screen keyboard's own Search button sits in the row below Space; the grid has no
    // direct route to it, so this is Down through Space then Right along the bottom row.
    await controller.press("ArrowDown", 4)
    await controller.waitForFocus("search-key-space")
    await controller.press("ArrowRight", 3)
    await controller.waitForFocus("search-key-submit")
    await controller.press("Enter")

    await controller.press("ArrowDown")
    await controller.waitForFocus("channel-direct-q")

    await controller.press("ArrowRight")
    await controller.waitForFocus("channel-direct-q-save")
    await controller.press("Enter")

    await expect(window.locator('[data-focus-id="channel-direct-q-save"]')).toHaveText(
      "Saved favourite",
    )
    expect(await controller.focusId()).toBe("channel-direct-q-save")
  })
})

test.describe("xc-docs Settings account control reachable from navigation", () => {
  test.use({ windowSize: desktopWindow })

  flowTest("F-xc-docs-8", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    expect(await controller.focusId()).toBe("home-sign-in")
    await controller.press("Enter")

    await controller.press("ArrowRight")
    await controller.waitForFocus("settings-sign-in")
    await expect(window.locator('[data-focus-id="settings-sign-in"]')).toHaveText(
      "Sign in on another device",
    )
    expect(await controller.focusId()).toBe("settings-sign-in")
  })
})

test.describe("xc-docs VOD seek jumps", () => {
  flowTest("F-xc-docs-1", async ({ controller, window }) => {
    const { opened } = await openQaTwitchVod(controller, window)
    test.skip(!opened, "No signed-in QA session or QA VOD is available on this host")

    await controller.press("ArrowDown")
    await controller.waitForFocus("player-seek-back-5m")
    await controller.press("ArrowRight", 2)
    await controller.waitForFocus("player-seek-forward-30s")

    const before = await window.textContent(".player-transport__time")
    await controller.press("Enter")
    await expect.poll(() => window.textContent(".player-transport__time")).not.toBe(before)
    const after = await window.textContent(".player-transport__time")
    expect(after).not.toBe(before)
  })
})

test.describe("xc-docs Quality chooser opens and lists options", () => {
  flowTest("F-xc-docs-2", async ({ controller, window }) => {
    const { opened } = await openQaTwitchVod(controller, window)
    test.skip(!opened, "No signed-in QA session or QA VOD is available on this host")

    await controller.press("ArrowRight", 3)
    await controller.waitForFocus("player-quality")
    await controller.press("Enter")

    await window.waitForSelector("#player-quality-chooser")
    expect(await window.locator("#player-quality-chooser").count()).toBe(1)
    expect(
      await window.locator("#player-quality-chooser .player-quality__options button").count(),
    ).toBeGreaterThan(0)
  })
})

test.describe("xc-docs Captions Show/Hide requests", () => {
  flowTest("F-xc-docs-3", async ({ controller, window }) => {
    const { opened } = await openQaTwitchVod(controller, window)
    test.skip(!opened, "No signed-in QA session or QA VOD is available on this host")

    await controller.press("ArrowRight", 4)
    await controller.waitForFocus("player-captions")
    await controller.press("Enter")
    await controller.waitForFocus("player-captions-show")
    await controller.press("ArrowRight")
    await controller.waitForFocus("player-captions-hide")
    await controller.press("Enter")

    await expect(window.locator('[data-focus-id="player-captions"]')).toHaveAttribute(
      "data-requested-captions",
      "hide",
    )
  })
})

test.describe("xc-docs Continue Watching Forget progress removes a card", () => {
  flowTest("F-xc-docs-6", async ({ controller, window }) => {
    const { opened } = await openQaTwitchVod(controller, window)
    test.skip(!opened, "No signed-in QA session or QA VOD is available on this host")

    await controller.press("ArrowDown")
    await controller.waitForFocus("player-seek-back-5m")
    await controller.press("ArrowRight", 3)
    await controller.waitForFocus("player-seek-forward-5m")
    await controller.press("Enter")
    await controller.press("ArrowUp")
    await controller.waitForFocus("player-back")
    await controller.press("Enter")
    await controller.waitForFocus("nav-home")

    const continueCard = window.locator('[data-focus-id^="continue-"][data-focus-id$="-open"]')
    await expect
      .poll(() => continueCard.count(), {
        message: "seeking must leave a Continue Watching card to forget",
      })
      .toBeGreaterThan(0)
    const openId = await continueCard.first().getAttribute("data-focus-id")
    expect(openId).not.toBeNull()

    await controller.press("ArrowRight")
    await controller.waitForFocus(openId ?? "")
    await controller.press("ArrowDown")
    await controller.waitForFocus((openId ?? "").replace(/-open$/, "-forget"))
    await controller.press("Enter")

    await expect(window.locator(`[data-focus-id="${openId}"]`)).toHaveCount(0)
  })
})

test.describe("xc-docs Search gamepad west/north face-button editing", () => {
  flowTest("F-xc-docs-7", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowDown", 2)
    await controller.waitForFocus("nav-search")
    await controller.press("Enter")
    await controller.waitForFocus("search-input")

    await window.keyboard.type("twitch")
    const input = window.locator("#channel-search")
    await expect(input).toHaveValue("twitch")

    // No physical gamepad or HTPC is attached to this host. The renderer only ever reads the
    // face buttons through navigator.getGamepads(), so the closest faithful stand-in for a
    // press of the west/X face button (index 2) is to make that poll observe one.
    await window.evaluate(() => {
      const fakeGamepad = {
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 16 }, (_button, index) => ({
          pressed: index === 2,
          touched: index === 2,
          value: index === 2 ? 1 : 0,
        })),
        connected: true,
        id: "vacuumstream-e2e-fake-pad",
        index: 0,
        mapping: "standard",
        timestamp: performance.now(),
      } as unknown as Gamepad
      Object.defineProperty(globalThis.navigator, "getGamepads", {
        configurable: true,
        value: () => [fakeGamepad],
      })
    })

    await expect(input).toHaveValue("twitc")
  })
})
