// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import { dispatchControllerKey, useControllerNavigation } from "../focus-navigation"
import { type PlayerSource, PlayerView } from "./PlayerView"

const source = {
  channel: "twitch",
  kind: "live",
  title: "Live",
  userId: "1",
} as const

const videoSource = {
  kind: "video",
  title: "Recording",
  userId: "1",
  videoId: "42",
} as const

const seekIds = [
  "player-seek-back-5m",
  "player-seek-back-30s",
  "player-seek-forward-30s",
  "player-seek-forward-5m",
] as const

const playerView = (playerSource: PlayerSource = source) => (
  <PlayerView
    onBack={() => undefined}
    onPastBroadcasts={() => undefined}
    onToggleFullscreen={() => undefined}
    source={playerSource}
  />
)

const installPlayerHarness = (
  activationResults: readonly boolean[],
  timeline = { currentTime: 0, duration: 0 },
) => {
  vi.useFakeTimers()
  const listeners = new Map<string, () => void>()
  const constructed = vi.fn()
  const getCurrentTime = vi.fn(() => timeline.currentTime)
  const getDuration = vi.fn(() => timeline.duration)
  const play = vi.fn()
  const seek = vi.fn()
  let activationIndex = 0
  let muted = true
  const setMuted = vi.fn((nextMuted: boolean) => {
    muted = nextMuted
  })
  class TestPlayer {
    static readonly OFFLINE = "offline"
    static readonly PAUSE = "pause"
    static readonly PLAY = "play"
    static readonly PLAYBACK_BLOCKED = "playback-blocked"
    static readonly PLAYING = "playing"
    static readonly READY = "ready"
    static readonly SEEK = "seek"

    constructor(elementId: string) {
      constructed(elementId)
      document.getElementById(elementId)?.append(document.createElement("iframe"))
    }

    readonly addEventListener = (event: string, listener: () => void): void => {
      listeners.set(event, listener)
    }
    readonly getCurrentTime = getCurrentTime
    readonly getDuration = getDuration
    readonly getMuted = (): boolean => muted
    readonly isPaused = (): boolean => true
    readonly pause = vi.fn()
    readonly play = play
    readonly seek = seek
    readonly setMuted = setMuted
  }
  const activateEmbeddedPlayer = vi.fn(async (_audible: boolean) => {
    const result = activationResults[activationIndex] ?? false
    activationIndex += 1
    return result
  })
  Object.defineProperty(window, "Twitch", {
    configurable: true,
    value: { Player: TestPlayer },
  })
  Object.defineProperty(window, "vacuumStream", {
    configurable: true,
    value: { system: { activateEmbeddedPlayer } },
  })
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    configurable: true,
    value: true,
  })
  const emit = (event: "ready" | "playing" | "seek" | "offline"): void => listeners.get(event)?.()
  return {
    activateEmbeddedPlayer,
    constructed,
    emit,
    getCurrentTime,
    getDuration,
    listeners,
    play,
    seek,
    setMuted,
  }
}

const mountPlayer = async (playerSource: PlayerSource = videoSource) => {
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => root.render(playerView(playerSource)))
  return { container, root }
}

const seekButtons = (container: HTMLElement): HTMLButtonElement[] => [
  ...container.querySelectorAll<HTMLButtonElement>(".player-transport button"),
]

const buttonById = (container: HTMLElement, id: string): HTMLButtonElement => {
  const button = container.querySelector<HTMLButtonElement>(`[data-focus-id="${id}"]`)
  if (button === null) throw new Error(`Missing button: ${id}`)
  return button
}

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("Twitch player surface", () => {
  it("keeps the embed unobstructed while Twitch evaluates autoplay", () => {
    // Given a newly opened Twitch player
    // When its initial loading surface renders
    const markup = renderToStaticMarkup(playerView())

    // Then loading is announced without covering Twitch's visibility probe
    expect(markup).toContain('aria-busy="true"')
    expect(markup).not.toContain("Loading Twitch player…")
  })

  it("retries audible playback until progressing media is confirmed", async () => {
    // Given a ready Twitch embed whose first activation finds no playable media
    vi.useFakeTimers()
    const { activateEmbeddedPlayer, listeners, setMuted } = installPlayerHarness([false, true])
    const container = document.createElement("div")
    document.body.append(container)
    const root = createRoot(container)
    await act(async () => root.render(playerView()))

    // When Twitch becomes ready and the retry delay elapses
    await act(async () => listeners.get("ready")?.())
    await act(async () => vi.advanceTimersByTimeAsync(500))

    // Then attempts stay sequential and stop after confirmed audible progress
    expect(activateEmbeddedPlayer).toHaveBeenNthCalledWith(1, true)
    expect(activateEmbeddedPlayer).toHaveBeenNthCalledWith(2, true)
    expect(setMuted).toHaveBeenCalledWith(false)
    expect(
      container.querySelector<HTMLButtonElement>("[data-focus-id=player-playback]")?.ariaLabel,
    ).toBe("Pause")
    await act(async () => vi.advanceTimersByTimeAsync(20_000))
    expect(activateEmbeddedPlayer).toHaveBeenCalledTimes(2)

    await act(async () => root.unmount())
  })

  it("cancels audible retries after the user changes mute", async () => {
    // Given an autoplay retry waiting after an unsuccessful activation
    vi.useFakeTimers()
    const { activateEmbeddedPlayer, listeners } = installPlayerHarness([false])
    const container = document.createElement("div")
    document.body.append(container)
    const root = createRoot(container)
    await act(async () => root.render(playerView()))
    await act(async () => listeners.get("ready")?.())

    // When the user changes mute before the next retry
    await act(async () =>
      container.querySelector<HTMLButtonElement>("[data-focus-id=player-muted]")?.click(),
    )
    await act(async () => vi.advanceTimersByTimeAsync(20_000))

    // Then no automatic activation overrides the user's choice
    expect(activateEmbeddedPlayer).toHaveBeenCalledTimes(1)

    await act(async () => root.unmount())
  })

  it("leaves focus inside the embed after trusted playback activation", async () => {
    // Given a ready, paused Twitch embed
    const { activateEmbeddedPlayer, listeners } = installPlayerHarness([false, true])
    const container = document.createElement("div")
    document.body.append(container)
    const root = createRoot(container)
    await act(async () => root.render(playerView()))
    await act(async () => listeners.get("ready")?.())
    const playbackButton = container.querySelector<HTMLButtonElement>(
      "[data-focus-id=player-playback]",
    )

    // When the user activates playback once
    await act(async () => playbackButton?.click())

    // Then focus stays with Twitch instead of arming the pause button for another Enter press
    expect(activateEmbeddedPlayer).toHaveBeenCalledWith(false)
    expect(document.activeElement).toBe(container.querySelector("iframe"))

    await act(async () => root.unmount())
  })
})

describe("VOD controller seeking", () => {
  it("keeps live controls unchanged without reading a timeline", async () => {
    const harness = installPlayerHarness([true], { currentTime: 600, duration: 3600 })
    const { container, root } = await mountPlayer(source)

    await act(async () => harness.emit("ready"))
    await act(async () => {
      harness.emit("playing")
      harness.emit("seek")
      await vi.advanceTimersByTimeAsync(1000)
    })

    expect(container.querySelector(".player-transport")).toBeNull()
    expect(
      [...container.querySelectorAll("button")].map((button) =>
        button.getAttribute("data-focus-id"),
      ),
    ).toEqual([
      "player-back",
      "player-playback",
      "player-muted",
      "player-vods",
      "player-fullscreen",
    ])
    expect(buttonById(container, "player-back").hasAttribute("data-focus-down")).toBe(false)
    expect(harness.getCurrentTime).not.toHaveBeenCalled()
    expect(harness.getDuration).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    await act(async () => root.unmount())
  })

  it("enables VOD jumps only after READY supplies a finite positive duration", async () => {
    const harness = installPlayerHarness([true], { currentTime: 600, duration: 3600 })
    const { container, root } = await mountPlayer()
    expect(seekButtons(container)).toHaveLength(4)
    expect(seekButtons(container).every((button) => button.disabled)).toBe(true)
    expect(container.querySelector(".player-toolbar .player-transport")).toBeNull()
    expect(container.querySelector(".player-frame .player-transport")).toBeNull()

    await act(async () => {
      harness.emit("playing")
      harness.emit("seek")
      await vi.advanceTimersByTimeAsync(1000)
      for (const button of seekButtons(container)) button.click()
    })
    expect(harness.getCurrentTime).not.toHaveBeenCalled()
    expect(harness.getDuration).not.toHaveBeenCalled()
    expect(harness.seek).not.toHaveBeenCalled()
    expect(seekButtons(container).every((button) => button.disabled)).toBe(true)

    await act(async () => harness.emit("ready"))
    expect(seekButtons(container).every((button) => !button.disabled)).toBe(true)
    expect(container.querySelector("output")?.textContent).toBe("0:10:00 / 1:00:00")
    await act(async () => root.unmount())
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "disables VOD jumps for duration %s and recovers when metadata arrives",
    async (duration) => {
      const timeline = { currentTime: 600, duration }
      const harness = installPlayerHarness([true], timeline)
      const { container, root } = await mountPlayer()
      await act(async () => harness.emit("ready"))
      expect(seekButtons(container).every((button) => button.disabled)).toBe(true)
      await act(async () => {
        for (const button of seekButtons(container)) button.click()
      })
      expect(harness.seek).not.toHaveBeenCalled()

      timeline.duration = 3600
      await act(async () => harness.emit("playing"))
      expect(seekButtons(container).every((button) => !button.disabled)).toBe(true)

      timeline.duration = duration
      await act(async () => vi.advanceTimersByTimeAsync(1000))
      expect(seekButtons(container).every((button) => button.disabled)).toBe(true)
      await act(async () => root.unmount())
    },
  )

  it("seeks all four relative destinations from the current API timeline", async () => {
    const timeline = { currentTime: 100, duration: 3600 }
    const harness = installPlayerHarness([true], timeline)
    const { container, root } = await mountPlayer()
    await act(async () => harness.emit("ready"))

    // The live API position, not the last rendered sample, determines each jump.
    timeline.currentTime = 600
    for (const id of seekIds) {
      await act(async () => buttonById(container, id).click())
    }
    expect(harness.seek.mock.calls).toEqual([[300], [570], [630], [900]])
    expect(harness.constructed).toHaveBeenCalledTimes(1)
    await act(async () => root.unmount())
  })

  it("clamps backward and forward jumps to the recording boundaries", async () => {
    const timeline = { currentTime: 10, duration: 3600 }
    const harness = installPlayerHarness([true], timeline)
    const { container, root } = await mountPlayer()
    await act(async () => harness.emit("ready"))

    await act(async () => {
      buttonById(container, "player-seek-back-5m").click()
      buttonById(container, "player-seek-back-30s").click()
    })
    timeline.currentTime = 3590
    await act(async () => {
      buttonById(container, "player-seek-forward-30s").click()
      buttonById(container, "player-seek-forward-5m").click()
    })
    expect(harness.seek.mock.calls).toEqual([[0], [0], [3600], [3600]])
    await act(async () => root.unmount())
  })

  it("rejects unavailable API values at activation even with an enabled control", async () => {
    const timeline = { currentTime: 600, duration: 3600 }
    const harness = installPlayerHarness([true], timeline)
    const { container, root } = await mountPlayer()
    await act(async () => harness.emit("ready"))
    const button = buttonById(container, "player-seek-forward-30s")

    for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      timeline.currentTime = invalid
      expect(button.disabled).toBe(false)
      await act(async () => button.click())
    }
    timeline.currentTime = 600
    for (const invalid of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      timeline.duration = invalid
      await act(async () => button.click())
    }
    expect(harness.seek).not.toHaveBeenCalled()
    await act(async () => root.unmount())
  })

  it("reaches every jump and returns to the toolbar with controller arrows and Enter", async () => {
    const harness = installPlayerHarness([true], { currentTime: 600, duration: 3600 })
    // Supply jsdom's missing layout and device surfaces, keeping real navigation handlers.
    vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockReturnValue(document.body)
    vi.stubGlobal("matchMedia", () => ({ matches: true }))
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1),
    )
    vi.stubGlobal("cancelAnimationFrame", vi.fn())
    const NavigablePlayer = () => {
      useControllerNavigation()
      return playerView(videoSource)
    }
    const container = document.createElement("div")
    document.body.append(container)
    const root = createRoot(container)
    await act(async () => root.render(<NavigablePlayer />))
    await act(async () => harness.emit("ready"))
    for (const button of container.querySelectorAll("button")) {
      button.scrollIntoView = vi.fn()
    }

    expect(document.activeElement).toBe(buttonById(container, "player-back"))
    await act(async () => dispatchControllerKey("ArrowDown"))
    for (const id of seekIds) {
      const button = buttonById(container, id)
      expect(document.activeElement).toBe(button)
      await act(async () => dispatchControllerKey("Enter"))
      expect(document.activeElement).toBe(button)
      await act(async () => dispatchControllerKey("ArrowRight"))
    }
    for (const id of [...seekIds].reverse()) {
      expect(document.activeElement).toBe(buttonById(container, id))
      await act(async () => dispatchControllerKey("ArrowUp"))
      expect(document.activeElement).toBe(buttonById(container, "player-back"))
      await act(async () => dispatchControllerKey("ArrowDown"))
      for (let index = 0; index < seekIds.indexOf(id); index += 1) {
        await act(async () => dispatchControllerKey("ArrowRight"))
      }
      await act(async () => dispatchControllerKey("ArrowLeft"))
    }
    expect(harness.seek.mock.calls).toEqual([[300], [570], [630], [900]])
    await act(async () => root.unmount())
  })

  it("refreshes the readout on READY, PLAYING, SEEK and each sampling second", async () => {
    const timeline = { currentTime: 65.9, duration: 3599 }
    const harness = installPlayerHarness([true], timeline)
    const { container, root } = await mountPlayer()
    await act(async () => harness.emit("ready"))
    expect(container.querySelector("output")?.textContent).toBe("1:05 / 59:59")

    timeline.currentTime = 125
    await act(async () => harness.emit("playing"))
    expect(container.querySelector("output")?.textContent).toBe("2:05 / 59:59")

    timeline.currentTime = 300
    await act(async () => harness.emit("seek"))
    expect(container.querySelector("output")?.textContent).toBe("5:00 / 59:59")

    timeline.currentTime = 301
    await act(async () => vi.advanceTimersByTimeAsync(1000))
    expect(container.querySelector("output")?.textContent).toBe("5:01 / 59:59")
    expect(harness.getCurrentTime).toHaveBeenCalledTimes(4)
    expect(harness.getDuration).toHaveBeenCalledTimes(4)

    timeline.currentTime = 3661
    timeline.duration = 7322
    await act(async () => harness.emit("seek"))
    expect(container.querySelector("output")?.textContent).toBe("1:01:01 / 2:02:02")
    await act(async () => root.unmount())
  })

  it("stops sampling and ignores late player events after unmount", async () => {
    const harness = installPlayerHarness([true], { currentTime: 600, duration: 3600 })
    const { root } = await mountPlayer()
    await act(async () => harness.emit("ready"))
    await act(async () => root.unmount())
    const reads = harness.getCurrentTime.mock.calls.length

    await act(async () => {
      harness.emit("ready")
      harness.emit("playing")
      harness.emit("seek")
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(harness.getCurrentTime).toHaveBeenCalledTimes(reads)
    expect(harness.getDuration).toHaveBeenCalledTimes(reads)
    expect(harness.activateEmbeddedPlayer).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("resets sampling on source replacement and ignores the previous player", async () => {
    const timeline = { currentTime: 600, duration: 3600 }
    const harness = installPlayerHarness([true, true, true], timeline)
    const startSampling = vi.spyOn(globalThis, "setInterval")
    const stopSampling = vi.spyOn(globalThis, "clearInterval")
    const { container, root } = await mountPlayer()
    await act(async () => harness.emit("ready"))
    const oldListeners = new Map(harness.listeners)
    expect(startSampling).toHaveBeenCalledTimes(1)
    const interval = startSampling.mock.results[0]?.value

    await act(async () => root.render(playerView({ ...videoSource, videoId: "43" })))
    expect(seekButtons(container).every((button) => button.disabled)).toBe(true)
    expect(stopSampling).toHaveBeenCalledWith(interval)
    expect(startSampling).toHaveBeenCalledTimes(1)
    const reads = harness.getCurrentTime.mock.calls.length
    await act(async () => {
      oldListeners.get("ready")?.()
      oldListeners.get("playing")?.()
      oldListeners.get("seek")?.()
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(harness.getCurrentTime).toHaveBeenCalledTimes(reads)
    expect(seekButtons(container).every((button) => button.disabled)).toBe(true)

    timeline.currentTime = 20
    timeline.duration = 120
    await act(async () => harness.emit("ready"))
    expect(container.querySelector("output")?.textContent).toBe("0:20 / 2:00")
    timeline.currentTime = 21
    await act(async () => vi.advanceTimersByTimeAsync(1000))
    expect(container.querySelector("output")?.textContent).toBe("0:21 / 2:00")
    expect(harness.getCurrentTime).toHaveBeenCalledTimes(reads + 2)

    await act(async () => root.render(playerView(source)))
    await act(async () => harness.emit("ready"))
    await act(async () => vi.advanceTimersByTimeAsync(1000))
    expect(container.querySelector(".player-transport")).toBeNull()
    expect(harness.getCurrentTime).toHaveBeenCalledTimes(reads + 2)
    expect(vi.getTimerCount()).toBe(0)
    await act(async () => root.unmount())
  })

  it("runs one sampler per ready VOD and stops it when the player goes offline", async () => {
    const harness = installPlayerHarness([true], { currentTime: 600, duration: 3600 })
    const startSampling = vi.spyOn(globalThis, "setInterval")
    const stopSampling = vi.spyOn(globalThis, "clearInterval")
    const { container, root } = await mountPlayer()
    await act(async () => harness.emit("ready"))
    await act(async () => harness.emit("ready"))
    expect(startSampling).toHaveBeenCalledExactlyOnceWith(expect.any(Function), 1000)
    const interval = startSampling.mock.results[0]?.value
    const reads = harness.getCurrentTime.mock.calls.length
    await act(async () => vi.advanceTimersByTimeAsync(1000))
    expect(harness.getCurrentTime).toHaveBeenCalledTimes(reads + 1)

    await act(async () => harness.emit("offline"))
    expect(stopSampling).toHaveBeenCalledWith(interval)
    await act(async () => {
      harness.emit("playing")
      harness.emit("seek")
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(seekButtons(container).every((button) => button.disabled)).toBe(true)
    expect(harness.getCurrentTime).toHaveBeenCalledTimes(reads + 1)
    expect(vi.getTimerCount()).toBe(0)
    await act(async () => root.unmount())
  })

  it("cancels autoplay retries on seek without changing playback, mute or player identity", async () => {
    const timeline = { currentTime: 600, duration: 3600 }
    const harness = installPlayerHarness([false, true], timeline)
    const { container, root } = await mountPlayer()
    await act(async () => harness.emit("ready"))
    await act(async () => buttonById(container, "player-seek-forward-30s").click())

    timeline.currentTime = 630
    await act(async () => vi.advanceTimersByTimeAsync(20_000))
    expect(harness.seek).toHaveBeenCalledExactlyOnceWith(630)
    expect(harness.activateEmbeddedPlayer).toHaveBeenCalledTimes(1)
    expect(harness.play).not.toHaveBeenCalled()
    expect(harness.setMuted).not.toHaveBeenCalled()
    expect(harness.constructed).toHaveBeenCalledTimes(1)
    expect(container.querySelector("output")?.textContent).toBe("0:10:30 / 1:00:00")
    await act(async () => root.unmount())
  })

  it("ignores an in-flight autoplay result after explicit seeking", async () => {
    const harness = installPlayerHarness([], { currentTime: 600, duration: 3600 })
    let finishActivation: ((started: boolean) => void) | undefined
    const activation = new Promise<boolean>((resolve) => {
      finishActivation = resolve
    })
    harness.activateEmbeddedPlayer.mockReturnValueOnce(activation)
    const { container, root } = await mountPlayer()
    await act(async () => harness.emit("ready"))

    await act(async () => buttonById(container, "player-seek-back-30s").click())
    await act(async () => {
      if (finishActivation === undefined) throw new Error("Activation was not requested")
      finishActivation(true)
    })
    expect(harness.seek).toHaveBeenCalledExactlyOnceWith(570)
    expect(harness.play).not.toHaveBeenCalled()
    expect(harness.setMuted).not.toHaveBeenCalled()
    expect(harness.constructed).toHaveBeenCalledTimes(1)
    expect(harness.activateEmbeddedPlayer).toHaveBeenCalledTimes(1)
    await act(async () => root.unmount())
  })
})
