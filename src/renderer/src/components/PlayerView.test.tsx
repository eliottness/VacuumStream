// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import { App } from "../App"
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
  quality: { available: unknown; current: string } = { available: [], current: "" },
) => {
  vi.useFakeTimers()
  const listeners = new Map<string, () => void>()
  const constructed = vi.fn()
  const getCurrentTime = vi.fn(() => timeline.currentTime)
  const getDuration = vi.fn(() => timeline.duration)
  const getQualities = vi.fn(() => quality.available)
  const getQuality = vi.fn(() => quality.current)
  const pause = vi.fn()
  const setQuality = vi.fn()
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
    readonly getQualities = getQualities
    readonly getQuality = getQuality
    readonly isPaused = (): boolean => true
    readonly pause = pause
    readonly play = play
    readonly seek = seek
    readonly setMuted = setMuted
    readonly setQuality = setQuality
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
  const restoreShellFullscreen = vi.fn(async () => undefined)
  Object.defineProperty(window, "vacuumStream", {
    configurable: true,
    value: {
      auth: { snapshot: async () => ({ kind: "guest" }) },
      settings: { snapshot: async () => ({ clientId: "client", secureStorage: false }) },
      system: { activateEmbeddedPlayer, restoreShellFullscreen },
    },
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
    getQualities,
    getQuality,
    listeners,
    pause,
    play,
    restoreShellFullscreen,
    seek,
    setMuted,
    setQuality,
  }
}

const mountPlayer = async (playerSource: PlayerSource = videoSource) => {
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => root.render(playerView(playerSource)))
  return { container, root }
}

const installNavigationSurface = (): void => {
  // Only missing jsdom device/layout surfaces are supplied; navigation itself stays real.
  vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockReturnValue(document.body)
  vi.stubGlobal("matchMedia", () => ({ matches: true }))
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1),
  )
  vi.stubGlobal("cancelAnimationFrame", vi.fn())
}

const pressKey = async (container: HTMLElement, key: string): Promise<void> => {
  for (const button of container.querySelectorAll("button")) button.scrollIntoView = vi.fn()
  await act(async () => dispatchControllerKey(key))
}

const mountNavigablePlayer = async (playerSource: PlayerSource = source) => {
  installNavigationSurface()
  const NavigablePlayer = () => {
    useControllerNavigation()
    return playerView(playerSource)
  }
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => root.render(<NavigablePlayer />))
  return { container, root }
}

const qualityButtons = (container: HTMLElement): HTMLButtonElement[] => [
  ...container.querySelectorAll<HTMLButtonElement>(".player-quality__options button"),
]

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

describe("controller playback quality", () => {
  it.each([source, videoSource])(
    "populates an empty READY quality list on PLAYING for $kind and refreshes on open",
    async (playerSource) => {
      const quality = { available: [] as unknown, current: "initial-effective" }
      const harness = installPlayerHarness([true], undefined, quality)
      const { container, root } = await mountPlayer(playerSource)
      const control = buttonById(container, "player-quality")
      await act(async () => harness.emit("ready"))
      expect(harness.getQualities).toHaveBeenCalledTimes(1)
      expect(control.getAttribute("data-player-quality")).toBe("initial-effective")
      expect(control.hasAttribute("data-requested-quality")).toBe(false)
      await act(async () => control.click())
      expect(qualityButtons(container)).toHaveLength(0)
      expect(document.activeElement).toBe(buttonById(container, "player-quality-close"))

      quality.available = [{ group: "unusual:517p59", name: "Custom stream quality" }, "auto"]
      quality.current = "unusual:517p59"
      await act(async () => harness.emit("playing"))
      expect(harness.getQualities).toHaveBeenCalledTimes(3)
      expect(control.getAttribute("data-player-quality")).toBe("unusual:517p59")
      expect(qualityButtons(container).map((button) => button.textContent)).toEqual([
        "Custom stream quality",
        "auto",
      ])
      expect(container.querySelector(".player-frame .player-quality")).toBeNull()
      await act(async () => buttonById(container, "player-quality-close").click())

      quality.available = ["new-on-open"]
      quality.current = "new-on-open"
      await act(async () => control.click())
      expect(harness.getQualities).toHaveBeenCalledTimes(4)
      expect(control.getAttribute("data-player-quality")).toBe("new-on-open")
      expect(qualityButtons(container).map((button) => button.textContent)).toEqual(["new-on-open"])
      await act(async () => root.unmount())
    },
  )

  it.each([source, videoSource])(
    "reaches every quality and Close with real controller navigation for $kind without playback side effects",
    async (playerSource) => {
      const quality = {
        available: ["auto", { group: "chunked", name: "Source" }, "custom:517p59"],
        current: "chunked",
      }
      const harness = installPlayerHarness([true], undefined, quality)
      const { container, root } = await mountNavigablePlayer(playerSource)
      await act(async () => harness.emit("ready"))
      // Autoplay completed before the quality interaction; isolate only its side effects.
      harness.activateEmbeddedPlayer.mockClear()
      harness.setMuted.mockClear()
      expect(document.activeElement).toBe(buttonById(container, "player-back"))
      for (const id of ["player-playback", "player-muted", "player-quality"]) {
        await pressKey(container, "ArrowRight")
        expect(document.activeElement).toBe(buttonById(container, id))
      }
      const control = buttonById(container, "player-quality")
      await pressKey(container, "Enter")
      const options = qualityButtons(container)
      expect(options.map((button) => button.getAttribute("data-focus-id"))).toEqual([
        "player-quality-option-auto",
        "player-quality-option-chunked",
        "player-quality-option-custom:517p59",
      ])
      for (const option of options) {
        expect(document.activeElement).toBe(option)
        expect(container.querySelector(".player-frame")?.contains(document.activeElement)).toBe(
          false,
        )
        expect(option.getAttribute("data-focusable")).toBe("true")
        for (const direction of ["down", "left", "right", "up"]) {
          expect(option.hasAttribute(`data-focus-${direction}`)).toBe(true)
        }
        await pressKey(container, "Enter")
        expect(document.activeElement).toBe(option)
        expect(option.getAttribute("aria-pressed")).toBe("true")
        await pressKey(container, "ArrowRight")
      }
      expect(harness.setQuality.mock.calls).toEqual([["auto"], ["chunked"], ["custom:517p59"]])
      expect(harness.getQualities).toHaveBeenCalledTimes(5)
      const close = buttonById(container, "player-quality-close")
      expect(document.activeElement).toBe(close)
      expect(close.getAttribute("data-focusable")).toBe("true")
      for (const direction of ["down", "left", "right", "up"]) {
        expect(close.hasAttribute(`data-focus-${direction}`)).toBe(true)
      }
      await pressKey(container, "ArrowLeft")
      expect(document.activeElement).toBe(options.at(-1))
      await pressKey(container, "ArrowUp")
      expect(document.activeElement).toBe(control)
      await pressKey(container, "ArrowDown")
      expect(document.activeElement).toBe(options[0])
      await pressKey(container, "ArrowDown")
      expect(document.activeElement).toBe(close)
      await pressKey(container, "Enter")
      expect(container.querySelector(".player-quality")).toBeNull()
      expect(document.activeElement).toBe(control)
      await pressKey(container, "ArrowUp")
      expect(document.activeElement).toBe(buttonById(container, "player-back"))
      expect(harness.play).not.toHaveBeenCalled()
      expect(harness.pause).not.toHaveBeenCalled()
      expect(harness.setMuted).not.toHaveBeenCalled()
      expect(harness.seek).not.toHaveBeenCalled()
      expect(harness.activateEmbeddedPlayer).not.toHaveBeenCalled()
      expect(harness.constructed).toHaveBeenCalledTimes(1)
      await act(async () => root.unmount())
    },
  )

  it("keeps requested Auto separate from the changing player-reported quality attribute", async () => {
    const quality = { available: ["auto", "chunked", "custom:517p59"], current: "chunked" }
    const harness = installPlayerHarness([true], undefined, quality)
    const { container, root } = await mountPlayer()
    await act(async () => harness.emit("ready"))
    const control = buttonById(container, "player-quality")
    await act(async () => control.click())
    expect(
      qualityButtons(container).every((button) => button.getAttribute("aria-pressed") === "false"),
    ).toBe(true)
    await act(async () => buttonById(container, "player-quality-option-auto").click())
    expect(harness.setQuality).toHaveBeenCalledExactlyOnceWith("auto")
    expect(control.getAttribute("data-requested-quality")).toBe("auto")
    expect(control.getAttribute("data-player-quality")).toBe("chunked")

    quality.current = "custom:517p59"
    await act(async () => harness.emit("playing"))
    expect(control.getAttribute("data-player-quality")).toBe("custom:517p59")
    expect(control.getAttribute("data-requested-quality")).toBe("auto")
    expect(buttonById(container, "player-quality-option-auto").getAttribute("aria-pressed")).toBe(
      "true",
    )
    expect(
      buttonById(container, "player-quality-option-custom:517p59").getAttribute("aria-pressed"),
    ).toBe("false")
    await act(async () => root.unmount())
  })

  it("revalidates a removed quality at selection and recovers focus without sending a stale id", async () => {
    const quality = { available: ["old-id", "auto"], current: "old-id" }
    const harness = installPlayerHarness([true], undefined, quality)
    const { container, root } = await mountNavigablePlayer()
    await act(async () => harness.emit("ready"))
    await act(async () => buttonById(container, "player-quality").click())
    expect(document.activeElement).toBe(buttonById(container, "player-quality-option-old-id"))
    quality.available = []
    await pressKey(container, "Enter")
    expect(harness.getQualities).toHaveBeenCalledTimes(3)
    expect(harness.setQuality).not.toHaveBeenCalled()
    expect(qualityButtons(container)).toHaveLength(0)
    expect(document.activeElement).toBe(buttonById(container, "player-quality-close"))
    await pressKey(container, "Enter")
    expect(document.activeElement).toBe(buttonById(container, "player-quality"))
    await act(async () => root.unmount())
  })

  it("keeps an empty chooser escapable before READY, after READY and offline", async () => {
    const harness = installPlayerHarness([true])
    const { container, root } = await mountNavigablePlayer()
    for (const event of [undefined, "ready", "offline"] as const) {
      if (event !== undefined) await act(async () => harness.emit(event))
      const back = buttonById(container, "player-back")
      back.focus()
      const steps = event === "ready" ? 3 : 1
      for (let index = 0; index < steps; index += 1) await pressKey(container, "ArrowRight")
      expect(document.activeElement).toBe(buttonById(container, "player-quality"))
      await pressKey(container, "Enter")
      expect(qualityButtons(container)).toHaveLength(0)
      expect(document.activeElement).toBe(buttonById(container, "player-quality-close"))
      await pressKey(container, "ArrowUp")
      expect(document.activeElement).toBe(buttonById(container, "player-quality"))
      await pressKey(container, "ArrowUp")
      expect(document.activeElement).toBe(back)
      await act(async () => buttonById(container, "player-quality-close").click())
    }
    expect(harness.getQualities).toHaveBeenCalledTimes(2)
    expect(harness.setQuality).not.toHaveBeenCalled()
    await act(async () => root.unmount())
  })

  it("clears quality state offline and ignores PLAYING until the player is ready again", async () => {
    const quality = { available: ["auto", "chunked"], current: "chunked" }
    const harness = installPlayerHarness([true], undefined, quality)
    const { container, root } = await mountPlayer()
    await act(async () => harness.emit("ready"))
    const control = buttonById(container, "player-quality")
    await act(async () => control.click())
    await act(async () => buttonById(container, "player-quality-option-auto").click())
    await act(async () => harness.emit("offline"))
    const reads = harness.getQualities.mock.calls.length
    await act(async () => harness.emit("playing"))
    expect(harness.getQualities).toHaveBeenCalledTimes(reads)
    expect(qualityButtons(container)).toHaveLength(0)
    expect(control.hasAttribute("data-requested-quality")).toBe(false)
    expect(control.hasAttribute("data-player-quality")).toBe(false)
    expect(document.activeElement).toBe(buttonById(container, "player-quality-close"))
    expect(buttonById(container, "player-back").disabled).toBe(false)
    await act(async () => harness.emit("ready"))
    expect(qualityButtons(container)).toHaveLength(2)
    expect(control.getAttribute("data-player-quality")).toBe("chunked")
    expect(control.hasAttribute("data-requested-quality")).toBe(false)
    await act(async () => root.unmount())
  })

  it("resets qualities on source replacement and ignores all late callbacks from the old instance", async () => {
    const quality = { available: ["old-source", "auto"], current: "old-source" }
    const harness = installPlayerHarness([true, true], undefined, quality)
    const { container, root } = await mountPlayer(source)
    await act(async () => harness.emit("ready"))
    await act(async () => buttonById(container, "player-quality").click())
    await act(async () => buttonById(container, "player-quality-option-auto").click())
    const oldListeners = new Map(harness.listeners)
    quality.available = []
    quality.current = ""
    await act(async () => root.render(playerView(videoSource)))
    const control = buttonById(container, "player-quality")
    expect(container.querySelector(".player-quality")).toBeNull()
    expect(control.hasAttribute("data-requested-quality")).toBe(false)
    expect(control.hasAttribute("data-player-quality")).toBe(false)
    await act(async () => control.click())
    expect(qualityButtons(container)).toHaveLength(0)
    const reads = harness.getQualities.mock.calls.length
    await act(async () => {
      for (const callback of oldListeners.values()) callback()
    })
    expect(harness.getQualities).toHaveBeenCalledTimes(reads)
    expect(harness.getQuality).toHaveBeenCalledTimes(reads)
    expect(container.querySelector(".player-frame")?.getAttribute("aria-busy")).toBe("true")
    quality.available = ["new-source"]
    quality.current = "new-source"
    await act(async () => harness.emit("ready"))
    await act(async () => {
      for (const callback of oldListeners.values()) callback()
    })
    expect(qualityButtons(container).map((button) => button.textContent)).toEqual(["new-source"])
    expect(control.getAttribute("data-player-quality")).toBe("new-source")
    expect(control.hasAttribute("data-requested-quality")).toBe(false)
    expect(container.querySelector(".player-frame")?.getAttribute("aria-busy")).toBe("false")
    expect(harness.constructed).toHaveBeenCalledTimes(2)
    await act(async () => root.unmount())
    const finalReads = harness.getQualities.mock.calls.length
    await act(async () => {
      harness.emit("ready")
      harness.emit("playing")
      harness.emit("offline")
    })
    expect(harness.getQualities).toHaveBeenCalledTimes(finalReads)
  })

  it("does not claim a request when the official quality setter throws", async () => {
    const harness = installPlayerHarness([true], undefined, {
      available: ["auto"],
      current: "source",
    })
    const { container, root } = await mountPlayer()
    await act(async () => harness.emit("ready"))
    const control = buttonById(container, "player-quality")
    await act(async () => control.click())
    harness.setQuality.mockImplementationOnce(() => {
      throw new Error("Player unavailable")
    })
    await act(async () => buttonById(container, "player-quality-option-auto").click())
    expect(control.hasAttribute("data-requested-quality")).toBe(false)
    expect(control.getAttribute("data-player-quality")).toBe("source")
    expect(buttonById(container, "player-quality-option-auto").getAttribute("aria-pressed")).toBe(
      "false",
    )
    expect(buttonById(container, "player-quality-close").disabled).toBe(false)
    await act(async () => root.unmount())
  })

  it("keeps quality API read failures escapable and recovers on PLAYING", async () => {
    const harness = installPlayerHarness([true], undefined, {
      available: ["auto"],
      current: "source",
    })
    const { container, root } = await mountPlayer()
    await act(async () => harness.emit("ready"))
    harness.getQualities.mockImplementationOnce(() => {
      throw new Error("Player unavailable")
    })
    const control = buttonById(container, "player-quality")
    await act(async () => control.click())
    expect(qualityButtons(container)).toHaveLength(0)
    expect(control.hasAttribute("data-player-quality")).toBe(false)
    expect(document.activeElement).toBe(buttonById(container, "player-quality-close"))
    await act(async () => harness.emit("playing"))
    expect(qualityButtons(container)).toHaveLength(1)
    expect(control.getAttribute("data-player-quality")).toBe("source")
    await act(async () => root.unmount())
  })

  it("preserves Escape to Home from the open chooser through the real app controller", async () => {
    const harness = installPlayerHarness([true], undefined, {
      available: ["auto"],
      current: "chunked",
    })
    installNavigationSurface()
    const container = document.createElement("div")
    document.body.append(container)
    const root = createRoot(container)
    await act(async () => root.render(<App />))
    await act(async () => buttonById(container, "stream-preview-twitch").click())
    await act(async () => harness.emit("ready"))
    await act(async () => buttonById(container, "player-quality").click())
    expect(document.activeElement).toBe(buttonById(container, "player-quality-option-auto"))
    await pressKey(container, "Escape")
    expect(container.querySelector(".player-view")).toBeNull()
    expect(container.querySelector(".browse-view")).not.toBeNull()
    expect(document.activeElement).toBe(buttonById(container, "nav-home"))
    expect(harness.restoreShellFullscreen).toHaveBeenCalledTimes(1)
    await act(async () => root.unmount())
  })
})

describe("VOD controller seeking", () => {
  it("keeps the exact live toolbar without VOD controls or timeline reads", async () => {
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
      "player-quality",
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
