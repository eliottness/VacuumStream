import { expect, test } from "../support/fixtures"
import { flowTest } from "../support/ledger-test"

const DESKTOP_WINDOW = { height: 1080, width: 1920 }
const TWITCH_EMBED_SCRIPT = "https://player.twitch.tv/js/embed/v1.js"

// A minimal but structurally real Twitch Player SDK stub, used only where the fixture needs a
// second request to genuinely succeed (rather than merely not error) after being held.
const FAKE_TWITCH_PLAYER_SCRIPT = `
  window.Twitch = {
    Player: class {
      static OFFLINE = "offline";
      static ONLINE = "online";
      static PAUSE = "pause";
      static PLAY = "play";
      static PLAYBACK_BLOCKED = "blocked";
      static PLAYING = "playing";
      static READY = "ready";
      static SEEK = "seek";
      addEventListener() {}
      disableCaptions() {}
      enableCaptions() {}
      getCurrentTime() { return 0; }
      getDuration() { return 0; }
      getMuted() { return true; }
      getQualities() { return []; }
      getQuality() { return ""; }
      isPaused() { return true; }
      pause() {}
      play() {}
      seek() {}
      setMuted() {}
      setQuality() {}
    },
  };
  globalThis.cycle14ReplacementLoaded = true;
`

const RESUME_BOOKMARK = {
  details: { title: "Seeded public VOD", userId: "0" },
  duration: 10_800,
  position: 3_900,
  updatedAt: 1,
  videoId: "cycle-14-public-vod",
}

test.describe("cycle-14 failed startup directional graph", () => {
  test.use({ windowSize: DESKTOP_WINDOW })

  flowTest("F-cycle-14-1", async ({ controller, window }) => {
    // SDK-failure fixture: every embed script request is blocked over CDP.
    await window.route(TWITCH_EMBED_SCRIPT, (route) => route.abort())

    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.press("ArrowDown")
    await controller.press("Enter")

    await window.waitForSelector('[data-focus-id="player-retry"]')
    await expect(window.locator(".player-load-status[role='alert']")).toContainText(
      "Twitch player could not be loaded. Check your connection, then retry loading player.",
    )
    expect(await controller.focusId()).toBe("player-back")

    const visited = await controller.trace([
      "ArrowRight",
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowRight",
      "ArrowDown",
      "ArrowRight",
      "ArrowRight",
      "ArrowLeft",
    ])
    await controller.shot("F-cycle-14-1-directional-graph")

    expect(visited).toEqual([
      "player-retry",
      "player-back",
      "player-retry",
      "player-back",
      "player-retry",
      "player-back",
      "player-retry",
      "player-quality",
      "player-retry",
    ])
    expect(visited.every((id) => id !== "BODY" && id !== "IFRAME")).toBe(true)
  })
})

test.describe("cycle-14 signed-out retry on target HTPC", () => {
  test.use({ windowSize: DESKTOP_WINDOW })

  // NEEDS-HARDWARE: the target HTPC is required. This body runs only under E2E_GAMEPAD=1 on
  // that hardware; here it is declared and gated by flowTest so the ledger row has a test.
  flowTest("F-cycle-14-2", async ({ controller, window }) => {
    let attempts = 0
    await window.route(TWITCH_EMBED_SCRIPT, async (route) => {
      attempts += 1
      if (attempts === 1) {
        await route.abort()
        return
      }
      await route.continue()
    })

    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.press("ArrowDown")
    await controller.press("Enter")

    await window.waitForSelector('[data-focus-id="player-retry"]')
    await controller.press("ArrowRight")
    await controller.waitForFocus("player-retry")
    await controller.press("Enter")

    await window.waitForSelector("#twitch-player-root iframe")
    await window.waitForFunction(
      () => document.querySelector(".player-frame")?.getAttribute("aria-busy") === "false",
    )

    await expect(window.locator("#twitch-player-root iframe")).toHaveCount(1)
    await expect(window.locator('[data-focus-id="player-retry"]')).toHaveCount(0)
    await expect(window.locator(".player-load-status[role='alert']")).toHaveCount(0)
    await controller.waitForFocus("player-back")
  })
})

test.describe("cycle-14 retry can fail again", () => {
  test.use({ windowSize: DESKTOP_WINDOW })

  flowTest("F-cycle-14-3", async ({ controller, window }) => {
    // Fixture: the first two SDK requests fail, the third would be allowed (never reached here).
    let attempts = 0
    let notifySecondAbort: (() => void) | undefined
    const secondAborted = new Promise<void>((resolve) => {
      notifySecondAbort = resolve
    })
    await window.route(TWITCH_EMBED_SCRIPT, async (route) => {
      attempts += 1
      if (attempts <= 2) {
        await route.abort()
        if (attempts === 2) notifySecondAbort?.()
        return
      }
      await route.continue()
    })

    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.press("ArrowDown")
    await controller.press("Enter")

    // First alert: move to Retry and activate it.
    await window.waitForSelector('[data-focus-id="player-retry"]')
    await controller.press("ArrowRight")
    await controller.waitForFocus("player-retry")
    await controller.press("Enter")

    // The second request fails and recovers within a render tick, too fast to observe the Retry
    // button's transient unmount by polling; wait for the network-level abort, then for the DOM
    // to reflect the second failure's re-render.
    await secondAborted
    await window.waitForFunction(
      () =>
        document.querySelector('[data-focus-id="player-retry"]') !== null &&
        document.querySelector('.player-load-status[role="alert"]') !== null,
    )
    await controller.shot("F-cycle-14-3-second-failure")

    // The second failure does leave the alert visible and Retry present and enabled...
    await expect(window.locator(".player-load-status[role='alert']")).toBeVisible()
    await expect(window.locator('[data-focus-id="player-retry"]')).toBeEnabled()
    // ...but the full observable also requires Retry to be the visibly focused control, and the
    // shell instead rescues focus to Back when it activates a retry. This is the row's defect.
    expect(await controller.focusId()).toBe("player-retry")

    await controller.press("ArrowRight")
  })
})

test.describe("cycle-14 leave during pending retry", () => {
  test.use({ windowSize: DESKTOP_WINDOW })

  flowTest("F-cycle-14-4", async ({ controller, window }) => {
    // Fixture: the first SDK request fails; the replacement is held until released below, then
    // completes successfully - the "late completion" this row's observable must survive.
    let attempts = 0
    let notifyReplacementHeld: (() => void) | undefined
    const replacementHeld = new Promise<void>((resolve) => {
      notifyReplacementHeld = resolve
    })
    let releaseReplacement: (() => void) | undefined
    const replacementReleased = new Promise<void>((resolve) => {
      releaseReplacement = resolve
    })
    let notifyFulfilled: (() => void) | undefined
    const replacementFulfilled = new Promise<void>((resolve) => {
      notifyFulfilled = resolve
    })
    await window.route(TWITCH_EMBED_SCRIPT, async (route) => {
      attempts += 1
      if (attempts === 1) {
        await route.abort()
        return
      }
      notifyReplacementHeld?.()
      await replacementReleased
      await route.fulfill({
        body: FAKE_TWITCH_PLAYER_SCRIPT,
        contentType: "application/javascript",
      })
      notifyFulfilled?.()
    })

    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.press("ArrowDown")
    await controller.press("Enter")

    await window.waitForSelector('[data-focus-id="player-retry"]')
    await controller.press("ArrowRight")
    await controller.waitForFocus("player-retry")
    await controller.press("Enter")
    await replacementHeld
    expect(attempts).toBe(2)
    await controller.press("Escape")

    // Release immediately after departure so the completion races the PlayerView unmount rather
    // than merely proving that Home was stable before the held request was allowed through.
    releaseReplacement?.()
    await replacementFulfilled
    await window.waitForFunction(() => Reflect.get(globalThis, "cycle14ReplacementLoaded") === true)
    await controller.waitForFocus("nav-home")
    await expect(window.locator(".browse-view h1")).toHaveText("Live now")
    await expect(window.locator("#twitch-player-root iframe")).toHaveCount(0)
    await expect(window.locator(".player-load-status[role='alert']")).toHaveCount(0)
    await controller.shot("F-cycle-14-4-late-completion")

    expect(await controller.focusId()).toBe("nav-home")
    await expect(window.locator(".browse-view h1")).toHaveText("Live now")
    await expect(window.locator("#twitch-player-root iframe")).toHaveCount(0)
    await expect(window.locator(".player-load-status[role='alert']")).toHaveCount(0)
  })
})

test.describe("cycle-14 resume survives download retry", () => {
  test.use({ seed: { bookmarks: [RESUME_BOOKMARK] }, windowSize: DESKTOP_WINDOW })

  // NEEDS-HARDWARE: the runner-controlled SDK download-failure/hold fixture this row names
  // cannot be driven with desktop keys alone. Declared here, gated by flowTest.
  flowTest("F-cycle-14-5", async ({ controller, window }) => {
    let attempts = 0
    await window.route(TWITCH_EMBED_SCRIPT, async (route) => {
      attempts += 1
      if (attempts === 1) {
        await route.abort()
        return
      }
      await route.continue()
    })

    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.waitForFocus(`continue-${RESUME_BOOKMARK.videoId}-open`)
    await controller.press("Enter")
    await controller.waitForFocus("video-resume-resume")
    await controller.press("Enter")

    await window.waitForSelector('[data-focus-id="player-retry"]')
    await controller.press("ArrowRight")
    await controller.waitForFocus("player-retry")
    await controller.press("Enter")

    await window.waitForSelector("#twitch-player-root iframe")
    await expect(window.locator(".video-resume")).toHaveCount(0)
    await expect(window.locator(".browse-view")).toHaveCount(0)

    await expect
      .poll(async () => window.locator(".player-transport__time").textContent(), {
        timeout: 20_000,
      })
      .toMatch(/^1:0[4-5]:\d\d /)
  })
})

test.describe("cycle-14 start over survives download retry", () => {
  test.use({ seed: { bookmarks: [RESUME_BOOKMARK] }, windowSize: DESKTOP_WINDOW })

  // NEEDS-HARDWARE: same undrivable download-failure/hold fixture as F-cycle-14-5.
  flowTest("F-cycle-14-6", async ({ controller, window }) => {
    let attempts = 0
    await window.route(TWITCH_EMBED_SCRIPT, async (route) => {
      attempts += 1
      if (attempts === 1) {
        await route.abort()
        return
      }
      await route.continue()
    })

    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.waitForFocus(`continue-${RESUME_BOOKMARK.videoId}-open`)
    await controller.press("Enter")
    await controller.waitForFocus("video-resume-resume")
    await controller.press("ArrowRight")
    await controller.waitForFocus("video-resume-start")
    await controller.press("Enter")

    await window.waitForSelector('[data-focus-id="player-retry"]')
    await controller.press("ArrowRight")
    await controller.waitForFocus("player-retry")
    await controller.press("Enter")

    await window.waitForSelector("#twitch-player-root iframe")
    await expect(window.locator(".video-resume")).toHaveCount(0)

    await expect
      .poll(async () => window.locator(".player-transport__time").textContent(), {
        timeout: 20_000,
      })
      .toMatch(/^0:00:0[0-3] /)
  })
})
