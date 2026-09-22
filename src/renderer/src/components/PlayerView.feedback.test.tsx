// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { TwitchPlayerInstance, TwitchPlayerOptions } from "../twitch-player"
import { type PlayerSource, PlayerView } from "./PlayerView"

const liveSource = { channel: "twitch", kind: "live", title: "Live", userId: "1" } as const
const roots = new Set<Root>()

const events = {
  offline: "offline",
  online: "online",
  pause: "pause",
  play: "play",
  playbackBlocked: "playback-blocked",
  playing: "playing",
  ready: "ready",
  seek: "seek",
} as const

type PlayerEvent = keyof typeof events

const button = (container: HTMLElement, id: string): HTMLButtonElement => {
  const target = container.querySelector<HTMLButtonElement>(`[data-focus-id="${id}"]`)
  if (target === null) throw new Error(`Missing button: ${id}`)
  return target
}

const installHarness = () => {
  const instances: TestPlayer[] = []
  class TestPlayer implements TwitchPlayerInstance {
    static readonly OFFLINE = events.offline
    static readonly ONLINE = events.online
    static readonly PAUSE = events.pause
    static readonly PLAY = events.play
    static readonly PLAYBACK_BLOCKED = events.playbackBlocked
    static readonly PLAYING = events.playing
    static readonly READY = events.ready
    static readonly SEEK = events.seek

    readonly listeners = new Map<string, () => void>()
    readonly state = { muted: true, paused: false }

    constructor(elementId: string, _options: TwitchPlayerOptions) {
      instances.push(this)
      document.getElementById(elementId)?.append(document.createElement("iframe"))
    }

    readonly addEventListener = (event: string, listener: () => void): void => {
      this.listeners.set(event, listener)
    }
    readonly disableCaptions = vi.fn()
    readonly enableCaptions = vi.fn()
    readonly getCurrentTime = vi.fn(() => 60)
    readonly getDuration = vi.fn(() => 3600)
    readonly getMuted = vi.fn(() => this.state.muted)
    readonly getQualities = vi.fn(() => [])
    readonly getQuality = vi.fn(() => "")
    readonly isPaused = vi.fn(() => this.state.paused)
    readonly pause = vi.fn(() => {
      this.state.paused = true
    })
    readonly play = vi.fn(() => {
      this.state.paused = false
    })
    readonly seek = vi.fn()
    readonly setMuted = vi.fn((muted: boolean) => {
      this.state.muted = muted
    })
    readonly setQuality = vi.fn()

    readonly emit = (event: PlayerEvent): void => {
      const listener = this.listeners.get(events[event])
      if (listener === undefined) throw new Error(`Missing SDK listener: ${event}`)
      listener()
    }
  }
  const activateEmbeddedPlayer = vi.fn(async () => true)
  vi.stubGlobal("vacuumStream", {
    playbackProgress: {
      get: vi.fn(async () => undefined),
      list: vi.fn(async () => []),
      remove: vi.fn(async () => undefined),
      save: vi.fn(async () => undefined),
    },
    system: { activateEmbeddedPlayer },
  })
  window.Twitch = { Player: TestPlayer }
  const player = (): TestPlayer => {
    const instance = instances[0]
    if (instance === undefined) throw new Error("Player was not constructed")
    return instance
  }
  return { activateEmbeddedPlayer, player }
}

const mountPlayer = async (source: PlayerSource): Promise<HTMLDivElement> => {
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  roots.add(root)
  await act(async () =>
    root.render(
      <PlayerView
        onBack={() => undefined}
        onPastBroadcasts={() => undefined}
        onToggleFullscreen={() => undefined}
        source={source}
      />,
    ),
  )
  return container
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.stubGlobal("matchMedia", () => ({ matches: true }))
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1),
  )
  vi.stubGlobal("cancelAnimationFrame", vi.fn())
  vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockReturnValue(document.body)
})

afterEach(async () => {
  await act(async () => {
    for (const root of roots) root.unmount()
  })
  roots.clear()
  document.body.replaceChildren()
  delete window.Twitch
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("HTPC feedback", () => {
  it("H-6 shows the muted icon while muted and the audible icon while unmuted", async () => {
    const harness = installHarness()
    const container = await mountPlayer(liveSource)
    await act(async () => harness.player().emit("ready"))

    const mute = button(container, "player-muted")
    const iconState = (): string | null =>
      mute.querySelector("[data-icon-state]")?.getAttribute("data-icon-state") ?? null
    // The label names the action, so the icon showing the state is its opposite.
    const expectedIcon = (label: string | null): string =>
      label === "Unmute" ? "muted" : "audible"

    expect(iconState()).toBe(expectedIcon(mute.getAttribute("aria-label")))
    const before = mute.getAttribute("aria-label")

    await act(async () => mute.click())
    expect(mute.getAttribute("aria-label")).not.toBe(before)
    expect(iconState()).toBe(expectedIcon(mute.getAttribute("aria-label")))
  })

  it("H-3 resumes a source the player reports paused even when the shell believed it was playing", async () => {
    const harness = installHarness()
    const container = await mountPlayer(liveSource)
    await act(async () => harness.player().emit("ready"))
    harness.activateEmbeddedPlayer.mockClear()

    // An ad can pause the media without emitting PAUSE, so the shell still believes it is playing.
    harness.player().state.paused = true

    await act(async () => button(container, "player-playback").click())

    expect(harness.activateEmbeddedPlayer).toHaveBeenCalledTimes(1)
    expect(harness.player().pause).not.toHaveBeenCalled()
  })

  it("H-3 keeps controller focus in the shell when playback is resumed", async () => {
    const harness = installHarness()
    const container = await mountPlayer(liveSource)
    await act(async () => harness.player().emit("ready"))
    harness.player().state.paused = true

    const playback = button(container, "player-playback")
    playback.focus()
    await act(async () => playback.click())

    expect(document.activeElement?.tagName).not.toBe("IFRAME")
    expect(document.activeElement?.getAttribute("data-focus-id")).toBe("player-playback")
  })

  it("H-3 resyncs the transport labels from the player when the viewer presses a key", async () => {
    const harness = installHarness()
    const container = await mountPlayer(liveSource)
    await act(async () => harness.player().emit("ready"))
    expect(button(container, "player-playback").getAttribute("aria-label")).toBe("Pause")

    // The player pauses itself without an event, exactly like a paused ad.
    harness.player().state.paused = true
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }))
    })

    expect(button(container, "player-playback").getAttribute("aria-label")).toBe("Play")
  })
})
