import { expect, test } from "../support/fixtures"
import { defectTest } from "../support/ledger-test"

const TWITCH_EMBED_SCRIPT = "https://player.twitch.tv/js/embed/v1.js"

// A minimal but structurally real Twitch Player SDK stub: it fires the same lifecycle events the
// real embed does, but the underlying media never actually starts (isPaused() always reports
// true), reproducing a real past broadcast that does not begin playing on its own.
const FAKE_STALLED_VOD_PLAYER_SCRIPT = `
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
      constructor(elementId) {
        this.listeners = {};
        const container = document.getElementById(elementId);
        if (container) {
          const iframe = document.createElement("iframe");
          iframe.src = "about:blank";
          container.appendChild(iframe);
        }
        globalThis.manualQa6Player = this;
        setTimeout(() => this.dispatch("ready"), 0);
      }
      addEventListener(event, listener) {
        (this.listeners[event] ??= []).push(listener);
      }
      dispatch(event) {
        (this.listeners[event] ?? []).forEach((listener) => listener());
      }
      disableCaptions() {}
      enableCaptions() {}
      getCurrentTime() { return 619.86; }
      getDuration() { return 7200; }
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
`

test.describe("manual-qa defects", () => {
  test.use({ seed: { rawFiles: { "playback-progress.json": "{not json" } } })

  defectTest("D-manual-qa-3", async ({ controller, window }) => {
    const alerts = await window
      .locator('[role="alert"]')
      .allTextContents()
      .catch(() => [])
    await controller.shot("D-manual-qa-3-store-read-failure")

    expect(alerts.join(" ")).not.toContain("Error invoking remote method")
    expect(alerts.join(" ")).not.toMatch(/\/(home|tmp)\//)
  })
})

test.describe("D-manual-qa-2 guest Quick watch liveness", () => {
  defectTest("D-manual-qa-2", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")

    const heading = window.getByRole("heading", { name: "Quick watch" })
    await expect(heading).toBeVisible()
    const shelf = window.locator("section.shelf").filter({ has: heading })
    await expect(shelf.locator(".stream-card")).toHaveCount(4)
    await controller.shot("D-manual-qa-2-quick-watch-badges")

    const badges = await shelf.locator(".stream-card .live-badge").allTextContents()

    // The row's fixed behaviour: the four static guest preview cards carry no verified Helix
    // stream data (see demo-data.ts PREVIEW_STREAMS, viewerCount 0), so none of them may claim to
    // be live. Today every card renders the badge unconditionally.
    expect(badges.filter((text) => text.trim() === "Live")).toEqual([])
  })
})

test.describe("D-manual-qa-5 narrow chat pane stays reachable", () => {
  test.use({ seed: {}, windowSize: { width: 960, height: 720 } })

  defectTest("D-manual-qa-5", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.press("ArrowDown")
    await controller.press("Enter")
    await controller.waitForFocus("player-back")

    const reachedChat = await controller.travelTo("player-chat", "ArrowRight", 12)
    if (!reachedChat) throw new Error("Could not reach the Show chat control")
    await controller.waitForFocus("player-chat")
    await controller.press("Enter")
    await window.waitForSelector("#twitch-player-root iframe")
    await window.waitForSelector(".player-chat iframe")

    // Enter chat, then Reload chat - the row's own reproduction path.
    await controller.press("ArrowDown", 2)
    await controller.waitForFocus("player-chat-reload")

    const before = await window.evaluate(() => {
      const rect = document.querySelector(".player-chat")?.getBoundingClientRect()
      return { bottom: rect?.bottom ?? null, innerHeight: globalThis.innerHeight }
    })
    if (before.bottom === null) throw new Error("Chat pane did not render at the narrow layout")
    // Establishes the reproduction: at this viewport the pane's bottom already sits below the
    // fold, matching the row's measurement (chat bottom 942 vs a 720-tall window).
    expect(before.bottom).toBeGreaterThan(before.innerHeight)

    await controller.press("ArrowDown")
    await controller.shot("D-manual-qa-5-narrow-chat-after-arrowdown")

    const after = await window.evaluate(() => {
      const rect = document.querySelector(".player-chat")?.getBoundingClientRect()
      return { bottom: rect?.bottom ?? null, innerHeight: globalThis.innerHeight }
    })
    if (after.bottom === null) throw new Error("Chat pane did not render at the narrow layout")

    // The row's fixed behaviour: whether by a height budget that fits the viewport or by
    // scrolling the focused pane into view, the chat pane's bottom edge must stay inside the
    // window once panes stack. Today ArrowDown loops on player-chat-reload and nothing scrolls.
    expect(after.bottom).toBeLessThanOrEqual(after.innerHeight)
  })
})

test.describe("D-manual-qa-6 stalled past broadcast playback toggle", () => {
  const bookmark = {
    details: { title: "Real past broadcast", userId: "0" },
    duration: 7200,
    position: 619,
    updatedAt: 1,
    videoId: "manual-qa-6-stalled-vod",
  }

  test.use({ seed: { bookmarks: [bookmark] } })

  defectTest("D-manual-qa-6", async ({ app, controller, window }) => {
    await window.route(TWITCH_EMBED_SCRIPT, (route) =>
      route.fulfill({
        body: FAKE_STALLED_VOD_PLAYER_SCRIPT,
        contentType: "application/javascript",
      }),
    )

    // Make the autostart handshake (system:activate-embedded-player) always report success, the
    // way a real broken recording can: the OS-level unblock trick "succeeds" while the actual
    // media stays paused. This is what lets the shell's local state drift from reality. The
    // handler is replaced on the main process, not the frozen contextBridge surface the
    // renderer sees, so the override actually takes effect.
    await app.evaluate(({ ipcMain }) => {
      const state = { resumeCalls: [] as boolean[] }
      ;(
        globalThis as typeof globalThis & { __manualQa6?: { resumeCalls: boolean[] } }
      ).__manualQa6 = state
      ipcMain.removeHandler("system:activate-embedded-player")
      ipcMain.handle("system:activate-embedded-player", (_event, audible: unknown) => {
        state.resumeCalls.push(Boolean(audible))
        return true
      })
    })

    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.waitForFocus(`continue-${bookmark.videoId}-open`)
    await controller.press("Enter")
    await controller.waitForFocus("video-resume-resume")
    await controller.press("Enter")
    await controller.waitForFocus("player-back")

    await window.waitForFunction(
      () =>
        document.querySelector('[data-focus-id="player-playback"]')?.hasAttribute("disabled") ===
        false,
    )
    await controller.shot("D-manual-qa-6-stalled-vod-ready")

    // Reproduces the row's observable: the embedded media never actually started (isPaused()
    // stays true, the elapsed readout is frozen at 0:10:19), yet the toolbar already claims
    // "Pause" because the autostart handshake falsely reported success.
    const stalledPlayer = await window.evaluate(() => {
      const player = Reflect.get(globalThis, "manualQa6Player") as
        | { isPaused: () => boolean }
        | undefined
      return { isPaused: player?.isPaused() }
    })
    expect(stalledPlayer.isPaused).toBe(true)
    await expect(window.locator('[data-focus-id="player-playback"]')).toHaveAttribute(
      "aria-label",
      "Pause",
    )
    await window.waitForFunction(
      () =>
        document.querySelector<HTMLButtonElement>('[data-focus-id="player-seek"]')?.disabled ===
        false,
    )
    await controller.press("ArrowRight", 5)
    await controller.waitForFocus("player-seek")
    await controller.press("Enter")
    await controller.waitForFocus("player-seek")
    await expect(window.locator(".player-transport__time")).toHaveText("0:10:19 / 2:00:00")
    await controller.press("ArrowUp")
    await controller.waitForFocus("player-back")

    const resumeCallCount = (): Promise<number> =>
      app.evaluate(
        () =>
          (globalThis as typeof globalThis & { __manualQa6?: { resumeCalls: boolean[] } })
            .__manualQa6?.resumeCalls.length ?? 0,
      )
    const before = await resumeCallCount()

    await controller.press("ArrowRight")
    await controller.waitForFocus("player-playback")
    await controller.press("Enter")

    const after = await resumeCallCount()

    // The row's fixed behaviour: because the player still reports paused, activating the toggle
    // with the product's only input - arrows and Enter - must resume real playback, whatever the
    // shell's stale local state says. Today it calls player.pause() instead, a no-op.
    expect(after).toBeGreaterThan(before)
  })
})
