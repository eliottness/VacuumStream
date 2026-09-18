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

afterEach(() => {
  document.body.replaceChildren()
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

  it("leaves focus inside the embed after trusted playback activation", async () => {
    // Given a ready, paused Twitch embed
    const listeners = new Map<string, () => void>()
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
      readonly getMuted = (): boolean => true
      readonly isPaused = (): boolean => true
      readonly pause = vi.fn()
      readonly play = vi.fn()
      readonly setMuted = vi.fn()
    }
    const activateEmbeddedPlayer = vi.fn(async () => true)
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
    const container = document.createElement("div")
    document.body.append(container)
    const root = createRoot(container)
    await act(async () => root.render(playerView()))
    await act(async () => listeners.get(TestPlayer.READY)?.())
    const playbackButton = container.querySelector<HTMLButtonElement>(
      "[data-focus-id=player-playback]",
    )

    // When the user activates playback once
    await act(async () => playbackButton?.click())

    // Then focus stays with Twitch instead of arming the pause button for another Enter press
    expect(activateEmbeddedPlayer).toHaveBeenCalledOnce()
    expect(document.activeElement).toBe(container.querySelector("iframe"))

    await act(async () => root.unmount())
  })
})
