// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { dispatchControllerKey, useControllerNavigation } from "../focus-navigation"
import type { TwitchPlayerInstance, TwitchPlayerOptions } from "../twitch-player"
import { type PlayerSource, PlayerView } from "./PlayerView"

const liveSource = { channel: "twitch", kind: "live", title: "Live", userId: "1" } as const
const videoSource = { kind: "video", title: "Recording", userId: "1", videoId: "42" } as const
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
type Timeline = { currentTime: number; duration: number }
type Activation = (audible: boolean, signal?: AbortSignal) => Promise<boolean>

type HarnessOptions = {
  readonly activation?: Activation
  readonly timeline?: Timeline
}

const controlledPromise = <T,>() => {
  let resolvePromise: (value: T) => void = () => {
    throw new Error("Promise executor has not run")
  }
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve
  })
  return { promise, resolve: resolvePromise }
}

const button = (container: HTMLElement, id: string): HTMLButtonElement => {
  const target = container.querySelector<HTMLButtonElement>(`[data-focus-id="${id}"]`)
  if (target === null) throw new Error(`Missing button: ${id}`)
  return target
}

const focusState = (): { controller: string | null; id: string | null } => ({
  controller: document.activeElement?.getAttribute("data-controller-focused") ?? null,
  id: document.activeElement?.getAttribute("data-focus-id") ?? null,
})

const pressKey = async (container: HTMLElement, key: string): Promise<void> => {
  for (const target of container.querySelectorAll<HTMLButtonElement>("button"))
    target.scrollIntoView = vi.fn()
  await act(async () => dispatchControllerKey(key))
}

const installHarness = ({
  activation = async () => false,
  timeline = { currentTime: 60, duration: 3600 },
}: HarnessOptions = {}) => {
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
    readonly state = { muted: true, paused: true }

    constructor(elementId: string, _options: TwitchPlayerOptions) {
      instances.push(this)
      document.getElementById(elementId)?.append(document.createElement("iframe"))
    }

    readonly addEventListener = (event: string, listener: () => void): void => {
      this.listeners.set(event, listener)
    }
    readonly disableCaptions = vi.fn()
    readonly enableCaptions = vi.fn()
    readonly getCurrentTime = vi.fn(() => timeline.currentTime)
    readonly getDuration = vi.fn(() => timeline.duration)
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
  const player = (): TestPlayer => {
    const instance = instances[0]
    if (instance === undefined) throw new Error("Player was not constructed")
    return instance
  }
  const activateEmbeddedPlayer = vi.fn<Activation>(activation)
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
  return { activateEmbeddedPlayer, instances, player, timeline }
}

const NavigablePlayer = ({ source }: { readonly source: PlayerSource }) => {
  useControllerNavigation()
  return (
    <PlayerView
      onBack={() => undefined}
      onPastBroadcasts={() => undefined}
      onToggleFullscreen={() => undefined}
      source={source}
    />
  )
}

const mountPlayer = async (
  source: PlayerSource,
  navigable = false,
): Promise<{ container: HTMLDivElement; root: Root }> => {
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  roots.add(root)
  await act(async () =>
    root.render(
      navigable ? (
        <NavigablePlayer source={source} />
      ) : (
        <PlayerView
          onBack={() => undefined}
          onPastBroadcasts={() => undefined}
          onToggleFullscreen={() => undefined}
          source={source}
        />
      ),
    ),
  )
  return { container, root }
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

describe("PlayerView defect regressions", () => {
  it.fails("D-cycle-15-1 cancels queued and deferred automatic activation across an OFFLINE -> ONLINE recovery", async () => {
    const queuedHarness = installHarness({
      activation: async () => false,
    })
    let queuedAttempt = 0
    queuedHarness.activateEmbeddedPlayer.mockImplementation(async () => {
      queuedAttempt += 1
      return queuedAttempt === 2
    })
    const queued = await mountPlayer(liveSource)
    await act(async () => queuedHarness.player().emit("ready"))
    await act(async () => queuedHarness.player().emit("offline"))
    await act(async () => queuedHarness.player().emit("online"))
    await act(async () => vi.advanceTimersByTimeAsync(500))
    const queuedShell = {
      muted: button(queued.container, "player-muted").ariaLabel,
      playback: button(queued.container, "player-playback").ariaLabel,
    }
    await act(async () => queued.root.unmount())
    roots.delete(queued.root)

    const deferredActivation = controlledPromise<boolean>()
    const deferredHarness = installHarness({
      activation: async () => deferredActivation.promise,
    })
    const deferred = await mountPlayer(liveSource)
    await act(async () => deferredHarness.player().emit("ready"))
    await act(async () => deferredHarness.player().emit("offline"))
    await act(async () => deferredHarness.player().emit("online"))
    await act(async () => deferredActivation.resolve(true))
    const deferredShell = {
      muted: button(deferred.container, "player-muted").ariaLabel,
      playback: button(deferred.container, "player-playback").ariaLabel,
    }
    await act(async () => deferred.root.unmount())
    roots.delete(deferred.root)

    expect([queuedShell, deferredShell]).toEqual([
      { muted: "Unmute", playback: "Play" },
      { muted: "Unmute", playback: "Play" },
    ])
  })

  it.fails("D-cycle-15-3 keeps Play recovery focused in the shell and advances from Back with an arrow", async () => {
    const manualActivation = controlledPromise<boolean>()
    let activationCount = 0
    const harness = installHarness({
      activation: async () => {
        activationCount += 1
        return activationCount === 1 ? false : manualActivation.promise
      },
    })
    const { container, root } = await mountPlayer(liveSource, true)
    await act(async () => harness.player().emit("ready"))
    await act(async () => harness.player().emit("offline"))
    await act(async () => harness.player().emit("online"))
    await act(async () => button(container, "player-playback").click())
    const duringActivation = focusState()
    await pressKey(container, "ArrowRight")
    const afterArrow = focusState()
    await act(async () => manualActivation.resolve(true))
    await act(async () => root.unmount())
    roots.delete(root)

    expect([duringActivation.id, afterArrow.id]).toEqual(["player-back", "player-playback"])
  })

  it.fails("D-cycle-01-1 rescues controller focus to Back before a focused VOD jump becomes unavailable", async () => {
    const harness = installHarness({ activation: async () => true })
    const { container, root } = await mountPlayer(videoSource, true)
    await act(async () => harness.player().emit("ready"))

    button(container, "player-seek-forward-30s").focus()
    harness.timeline.duration = 0
    await act(async () => harness.player().emit("playing"))
    const afterInvalidDuration = focusState()

    harness.timeline.duration = 3600
    await act(async () => harness.player().emit("playing"))
    button(container, "player-seek-forward-30s").focus()
    await act(async () => harness.player().emit("offline"))
    const afterOffline = focusState()
    await act(async () => root.unmount())
    roots.delete(root)

    expect([afterInvalidDuration, afterOffline]).toEqual([
      { controller: "true", id: "player-back" },
      { controller: "true", id: "player-back" },
    ])
  })

  it.fails("D-cycle-01-2 aborts a dispatched automatic activation before its frame wait can unmute and play after seek", async () => {
    const frameReady = controlledPromise<void>()
    const embeddedMedia = { muted: true, playing: false }
    const harness = installHarness({
      activation: async (_audible, signal) => {
        await frameReady.promise
        if (signal?.aborted) return false
        embeddedMedia.muted = false
        embeddedMedia.playing = true
        return true
      },
    })
    const { container, root } = await mountPlayer(videoSource)
    await act(async () => harness.player().emit("ready"))
    await act(async () => button(container, "player-seek-back-30s").click())
    await act(async () => frameReady.resolve(undefined))
    await act(async () => root.unmount())
    roots.delete(root)

    expect(embeddedMedia).toEqual({ muted: true, playing: false })
  })

  it.fails("D-cycle-15-2 rescues focused playback and mute controls to Back throughout OFFLINE -> ONLINE", async () => {
    const harness = installHarness({ activation: async () => false })
    const { container, root } = await mountPlayer(liveSource, true)
    await act(async () => harness.player().emit("ready"))
    const recoveredFocus: { controller: string | null; id: string | null }[] = []
    for (const id of ["player-playback", "player-muted"] as const) {
      button(container, id).focus()
      await act(async () => harness.player().emit("offline"))
      recoveredFocus.push(focusState())
      await act(async () => harness.player().emit("online"))
      recoveredFocus.push(focusState())
    }
    await act(async () => root.unmount())
    roots.delete(root)

    expect(recoveredFocus).toEqual([
      { controller: "true", id: "player-back" },
      { controller: "true", id: "player-back" },
      { controller: "true", id: "player-back" },
      { controller: "true", id: "player-back" },
    ])
  })

  it.fails("D-xc-performance-3 samples a VOD immediately but only while PLAYING and clears sampling on PAUSE, OFFLINE and unmount", async () => {
    const harness = installHarness({ activation: async () => true })
    const { root } = await mountPlayer(videoSource)
    const player = harness.player()
    const samples: number[] = []

    await act(async () => player.emit("ready"))
    samples.push(player.getCurrentTime.mock.calls.length)
    await act(async () => vi.advanceTimersByTimeAsync(1000))
    samples.push(player.getCurrentTime.mock.calls.length)
    await act(async () => {
      player.emit("playing")
      await vi.advanceTimersByTimeAsync(1000)
    })
    samples.push(player.getCurrentTime.mock.calls.length)
    await act(async () => {
      player.emit("pause")
      await vi.advanceTimersByTimeAsync(1000)
    })
    samples.push(player.getCurrentTime.mock.calls.length)
    await act(async () => {
      player.emit("offline")
      await vi.advanceTimersByTimeAsync(1000)
    })
    samples.push(player.getCurrentTime.mock.calls.length)
    await act(async () => root.unmount())
    roots.delete(root)
    await act(async () => vi.advanceTimersByTimeAsync(1000))
    samples.push(player.getCurrentTime.mock.calls.length)

    expect(samples).toEqual([1, 1, 3, 4, 4, 4])
  })
})
