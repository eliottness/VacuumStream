// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import { PlayerView } from "./PlayerView"

const source = {
  channel: "twitch",
  kind: "live",
  title: "Live",
  userId: "1",
} as const

const playerView = () => (
  <PlayerView
    onBack={() => undefined}
    onPastBroadcasts={() => undefined}
    onToggleFullscreen={() => undefined}
    source={source}
  />
)

const installPlayerHarness = (activationResults: readonly boolean[]) => {
  const listeners = new Map<string, () => void>()
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
    static readonly READY = "ready"

    constructor(elementId: string) {
      document.getElementById(elementId)?.append(document.createElement("iframe"))
    }

    readonly addEventListener = (event: string, listener: () => void): void => {
      listeners.set(event, listener)
    }
    readonly getMuted = (): boolean => muted
    readonly isPaused = (): boolean => true
    readonly pause = vi.fn()
    readonly play = vi.fn()
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
  return { activateEmbeddedPlayer, listeners, setMuted }
}

afterEach(() => {
  document.body.replaceChildren()
  vi.useRealTimers()
  vi.restoreAllMocks()
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
