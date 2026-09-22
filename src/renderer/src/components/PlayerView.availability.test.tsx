// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { VacuumStreamApi } from "../../../shared/contracts"
import { dispatchControllerKey, useControllerNavigation } from "../focus-navigation"
import type { TwitchPlayerInstance, TwitchPlayerOptions } from "../twitch-player"
import type { PlayerSource } from "./PlayerView"

const liveSource = { channel: "twitch", kind: "live", title: "Live", userId: "1" } as const
const videoSource = { kind: "video", title: "Recording", userId: "1", videoId: "42" } as const
const roots = new Set<Root>()
let PlayerView: typeof import("./PlayerView")["PlayerView"]

const events = {
  offline: "offline",
  // Deliberately different from the event's name: subscribe through the SDK constant.
  online: "sdk-channel-online",
  pause: "pause",
  play: "play",
  playbackBlocked: "blocked",
  playing: "playing",
  ready: "ready",
  seek: "seek",
} as const

const button = (id: string): HTMLButtonElement => {
  const element = document.querySelector<HTMLButtonElement>(`[data-focus-id="${id}"]`)
  if (element === null) throw new Error(`Missing button: ${id}`)
  return element
}

const element = <T extends Element>(selector: string): T => {
  const found = document.querySelector<T>(selector)
  if (found === null) throw new Error(`Missing element: ${selector}`)
  return found
}

const pressKey = async (key: string): Promise<void> => {
  for (const target of document.querySelectorAll<HTMLElement>("[data-focusable]"))
    target.scrollIntoView = vi.fn()
  await act(async () => dispatchControllerKey(key))
}

const expectCommands = (enabled: boolean): void => {
  for (const id of [
    "player-playback",
    "player-muted",
    "player-captions-show",
    "player-captions-hide",
  ])
    expect(button(id).disabled).toBe(!enabled)
}

const qualityIds = (): (string | null)[] =>
  [...document.querySelectorAll(".player-quality__options button")].map((option) =>
    option.getAttribute("data-focus-id"),
  )

const installHarness = () => {
  const requests = vi.spyOn(document.head, "append")
  const constructed = vi.fn<(elementId: string, options: TwitchPlayerOptions) => void>()
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
    readonly state = {
      available: ["auto", "initial"],
      current: "initial",
      muted: true,
      paused: true,
    }

    constructor(elementId: string, options: TwitchPlayerOptions) {
      constructed(elementId, options)
      instances.push(this)
      element<HTMLElement>(`#${elementId}`).append(document.createElement("iframe"))
    }

    readonly addEventListener = (event: string, listener: () => void): void => {
      this.listeners.set(event, listener)
    }
    readonly disableCaptions = vi.fn()
    readonly enableCaptions = vi.fn()
    readonly getCurrentTime = vi.fn(() => 60)
    readonly getDuration = vi.fn(() => 3600)
    readonly getMuted = vi.fn(() => this.state.muted)
    readonly getQualities = vi.fn(() => this.state.available)
    readonly getQuality = vi.fn(() => this.state.current)
    readonly isPaused = vi.fn(() => this.state.paused)
    readonly pause = vi.fn(() => {
      this.state.paused = true
      this.emit("pause")
    })
    readonly play = vi.fn(() => {
      this.state.paused = false
      this.emit("play")
    })
    readonly seek = vi.fn()
    readonly setMuted = vi.fn((muted: boolean) => {
      this.state.muted = muted
    })
    readonly setQuality = vi.fn((quality: string) => {
      this.state.current = quality
    })

    readonly emit = (event: keyof typeof events): void => {
      const listener = this.listeners.get(events[event])
      if (listener === undefined) throw new Error(`Missing SDK listener: ${event}`)
      listener()
    }
  }
  const player = (index = instances.length - 1): TestPlayer => {
    const instance = instances[index]
    if (instance === undefined) throw new Error("No player constructed")
    return instance
  }
  const activateEmbeddedPlayer = vi.fn(async () => {
    player().state.paused = false
    return true
  })
  const progress = {
    get: vi.fn<VacuumStreamApi["playbackProgress"]["get"]>().mockResolvedValue(undefined),
    list: vi.fn<VacuumStreamApi["playbackProgress"]["list"]>().mockResolvedValue([]),
    remove: vi.fn<VacuumStreamApi["playbackProgress"]["remove"]>().mockResolvedValue(undefined),
    save: vi.fn<VacuumStreamApi["playbackProgress"]["save"]>().mockResolvedValue(undefined),
  }
  vi.stubGlobal("vacuumStream", {
    playbackProgress: progress,
    system: { activateEmbeddedPlayer },
  })
  const finishSdkLoad = async (): Promise<void> => {
    const script = element<HTMLScriptElement>(
      'script[src="https://player.twitch.tv/js/embed/v1.js"]',
    )
    await act(async () => {
      window.Twitch = { Player: TestPlayer }
      script.dispatchEvent(new Event("load"))
    })
  }
  return { activateEmbeddedPlayer, constructed, finishSdkLoad, instances, player, requests }
}

type Harness = ReturnType<typeof installHarness>
type Player = ReturnType<Harness["player"]>
const getters = (player: Player) => [
  player.getCurrentTime,
  player.getDuration,
  player.getMuted,
  player.getQualities,
  player.getQuality,
  player.isPaused,
]
const commands = (harness: Harness, player: Player) => [
  harness.activateEmbeddedPlayer,
  player.disableCaptions,
  player.enableCaptions,
  player.pause,
  player.play,
  player.seek,
  player.setMuted,
  player.setQuality,
]
const counts = (mocks: readonly ReturnType<typeof vi.fn>[]): readonly number[] =>
  mocks.map((mock) => mock.mock.calls.length)

const NavigablePlayer = ({
  onBack,
  source,
}: {
  readonly onBack: () => void
  readonly source: PlayerSource
}) => {
  useControllerNavigation()
  return (
    <PlayerView
      onBack={onBack}
      onPastBroadcasts={() => undefined}
      onToggleFullscreen={() => undefined}
      source={source}
    />
  )
}

const mountPlayer = async (harness: Harness, source: PlayerSource = liveSource) => {
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  roots.add(root)
  const onBack = vi.fn()
  await act(async () => root.render(<NavigablePlayer onBack={onBack} source={source} />))
  await harness.finishSdkLoad()
  return { container, onBack, root }
}

beforeEach(async () => {
  vi.useFakeTimers()
  vi.resetModules()
  delete window.Twitch
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.stubGlobal("matchMedia", () => ({ matches: true }))
  // Supply only missing device/layout surfaces; keep the real navigation handler.
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1),
  )
  vi.stubGlobal("cancelAnimationFrame", vi.fn())
  vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockReturnValue(document.body)
  ;({ PlayerView } = await import("./PlayerView"))
})

afterEach(async () => {
  await act(async () => {
    for (const root of roots) root.unmount()
  })
  roots.clear()
  document.body.replaceChildren()
  document.head.replaceChildren()
  delete window.Twitch
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("live player availability", () => {
  it.each([false, true])(
    "restores READY -> OFFLINE -> ONLINE -> PLAYING on the same player (empty qualities at ONLINE: %s)",
    async (emptyAtOnline) => {
      const harness = installHarness()
      const { container } = await mountPlayer(harness)
      const player = harness.player()
      await act(async () => player.emit("ready"))
      await act(async () => button("player-chat").click())
      await act(async () => button("player-quality").click())
      await act(async () => button("player-captions").click())
      expectCommands(true)
      const playerRoot = element("#twitch-player-root")
      const frame = element<HTMLIFrameElement>("#twitch-player-root iframe")
      const chat = element<HTMLIFrameElement>(".player-chat iframe")
      const frameFocus = vi.spyOn(frame, "focus")
      const chatFocus = vi.spyOn(chat, "focus")
      await act(async () => player.emit("offline"))
      expectCommands(false)
      const alert = element(".player-load-status[role=alert]")
      expect(container.querySelector(".player-stage")?.contains(alert)).toBe(false)
      expect(container.querySelector(".player-retry")).toBeNull()
      expect(qualityIds()).toEqual([])
      const reads = counts(getters(player))
      await act(async () => player.emit("playing"))
      expect(counts(getters(player))).toEqual(reads)

      player.state.available = emptyAtOnline ? [] : ["online-quality"]
      player.state.current = "online-quality"
      await act(async () => player.emit("online"))
      expect(container.querySelector(".player-load-status")).toBeNull()
      expectCommands(true)
      expect(player.getMuted).toHaveBeenCalledTimes(2)
      expect(player.isPaused).toHaveBeenCalledTimes(2)
      expect(player.getQualities).toHaveBeenCalledTimes(3)
      expect(player.getQuality).toHaveBeenCalledTimes(3)
      expect(button("player-quality").getAttribute("data-player-quality")).toBe("online-quality")
      expect(qualityIds()).toEqual(emptyAtOnline ? [] : ["player-quality-option-online-quality"])

      player.state.available = ["auto", "returned-quality"]
      player.state.current = "returned-quality"
      await act(async () => player.emit("playing"))
      expect(player.getQualities).toHaveBeenCalledTimes(4)
      expect(player.getQuality).toHaveBeenCalledTimes(4)
      expect(qualityIds()).toEqual([
        "player-quality-option-auto",
        "player-quality-option-returned-quality",
      ])
      expect(button("player-quality").getAttribute("data-player-quality")).toBe("returned-quality")
      expect(harness.instances).toEqual([player])
      expect(harness.constructed).toHaveBeenCalledTimes(1)
      expect(harness.requests).toHaveBeenCalledTimes(1)
      expect(element("#twitch-player-root")).toBe(playerRoot)
      expect(element("#twitch-player-root iframe")).toBe(frame)
      expect(element(".player-chat iframe")).toBe(chat)
      expect(document.activeElement).toBe(button("player-captions-close"))
      expect(frameFocus).not.toHaveBeenCalled()
      expect(chatFocus).not.toHaveBeenCalled()
    },
  )

  it("keeps ONLINE before READY read-free and requires ONLINE to clear an observed live outage", async () => {
    const harness = installHarness()
    const { container } = await mountPlayer(harness)
    const player = harness.player()
    await act(async () => button("player-captions").click())
    await act(async () => button("player-quality").click())
    for (const event of ["online", "online", "offline", "online"] as const) {
      await act(async () => player.emit(event))
      expectCommands(false)
      expect(container.querySelector(".player-load-status") !== null).toBe(event === "offline")
      for (const getter of getters(player)) expect(getter).not.toHaveBeenCalled()
      for (const command of commands(harness, player)) expect(command).not.toHaveBeenCalled()
    }
    await act(async () => player.emit("offline"))
    await act(async () => player.emit("ready"))
    await act(async () => player.emit("playing"))
    expectCommands(false)
    expect(container.querySelector(".player-load-status[role=alert]")).not.toBeNull()
    expect(container.querySelector(".player-retry")).toBeNull()
    expect(qualityIds()).toEqual([])
    await act(async () => player.emit("online"))
    expectCommands(true)
    expect(container.querySelector(".player-load-status")).toBeNull()
    expect(player.getMuted).toHaveBeenCalledTimes(1)
    expect(player.isPaused).toHaveBeenCalledTimes(1)
    expect(player.getQualities).toHaveBeenCalledTimes(1)
    expect(player.getQuality).toHaveBeenCalledTimes(1)
    expect(harness.activateEmbeddedPlayer).not.toHaveBeenCalled()
    expect(harness.constructed).toHaveBeenCalledTimes(1)
    expect(harness.requests).toHaveBeenCalledTimes(1)
  })

  it("preserves paused, muted and caption intent across duplicate ONLINE events and repeated outages without commands", async () => {
    const harness = installHarness()
    await mountPlayer(harness)
    const player = harness.player()
    await act(async () => player.emit("ready"))
    expect(harness.activateEmbeddedPlayer).toHaveBeenCalledExactlyOnceWith(true)
    expect(player.setMuted).toHaveBeenCalledExactlyOnceWith(false)
    await act(async () => button("player-chat").click())
    await act(async () => button("player-captions").click())
    await act(async () => button("player-captions-show").click())
    const playerRoot = element("#twitch-player-root")
    const frame = element<HTMLIFrameElement>("#twitch-player-root iframe")
    const chat = element<HTMLIFrameElement>(".player-chat iframe")
    const frameFocus = vi.spyOn(frame, "focus")
    const chatFocus = vi.spyOn(chat, "focus")
    const writes = counts(commands(harness, player))
    // Twitch's native controls may change state without the shell initiating a command.
    player.state.paused = true
    player.state.muted = true
    for (let cycle = 0; cycle < 3; cycle += 1) {
      await act(async () => player.emit("offline"))
      await act(async () => player.emit("ready"))
      expectCommands(false)
      expect(document.querySelector(".player-load-status[role=alert]")).not.toBeNull()
      const focused = document.activeElement
      for (let duplicate = 0; duplicate < 2; duplicate += 1) {
        const mutedReads = player.getMuted.mock.calls.length
        const pausedReads = player.isPaused.mock.calls.length
        await act(async () => player.emit("online"))
        expectCommands(true)
        expect(player.getMuted).toHaveBeenCalledTimes(mutedReads + 1)
        expect(player.isPaused).toHaveBeenCalledTimes(pausedReads + 1)
        expect(button("player-playback").getAttribute("aria-label")).toBe("Play")
        expect(button("player-muted").getAttribute("aria-label")).toBe("Unmute")
        expect(button("player-captions").getAttribute("data-requested-captions")).toBe("show")
        expect(document.querySelector(".player-load-status")).toBeNull()
        expect(counts(commands(harness, player))).toEqual(writes)
        expect(harness.constructed).toHaveBeenCalledTimes(1)
        expect(harness.requests).toHaveBeenCalledTimes(1)
        expect(harness.instances).toEqual([player])
        expect(element("#twitch-player-root")).toBe(playerRoot)
        expect(element("#twitch-player-root iframe")).toBe(frame)
        expect(element(".player-chat iframe")).toBe(chat)
        expect(document.activeElement).toBe(focused)
      }
    }
    expect(frameFocus).not.toHaveBeenCalled()
    expect(chatFocus).not.toHaveBeenCalled()
  })

  it("ignores captured callbacks after source replacement and unmount without stale state or frame focus", async () => {
    const harness = installHarness()
    const { container, onBack, root } = await mountPlayer(harness)
    const previous = harness.player()
    await act(async () => previous.emit("ready"))
    await act(async () => previous.emit("offline"))
    const oldCallbacks = [...previous.listeners.values()]
    await act(async () =>
      root.render(
        <NavigablePlayer onBack={onBack} source={{ ...liveSource, channel: "replacement" }} />,
      ),
    )
    const current = harness.player()
    expect(current).not.toBe(previous)
    const frameFocus = vi.spyOn(HTMLIFrameElement.prototype, "focus")
    for (const state of ["loading", "ready", "offline"] as const) {
      if (state !== "loading")
        await act(async () => current.emit(state === "ready" ? "ready" : "offline"))
      button("player-fullscreen").focus()
      const focused = document.activeElement
      const markup = container.innerHTML
      const reads = counts([...getters(previous), ...getters(current)])
      const writes = counts([...commands(harness, previous), ...commands(harness, current)])
      await act(async () => {
        for (const callback of oldCallbacks) callback()
      })
      expect(counts([...getters(previous), ...getters(current)])).toEqual(reads)
      expect(counts([...commands(harness, previous), ...commands(harness, current)])).toEqual(
        writes,
      )
      expect(container.innerHTML).toBe(markup)
      expect(document.activeElement).toBe(focused)
    }
    expect(harness.constructed).toHaveBeenCalledTimes(2)
    expect(harness.requests).toHaveBeenCalledTimes(1)
    await act(async () => root.unmount())
    roots.delete(root)
    const destination = document.createElement("button")
    document.body.append(destination)
    destination.focus()
    const reads = counts([...getters(previous), ...getters(current)])
    const writes = counts([...commands(harness, previous), ...commands(harness, current)])
    await act(async () => {
      for (const callback of [...oldCallbacks, ...current.listeners.values()]) callback()
    })
    expect(counts([...getters(previous), ...getters(current)])).toEqual(reads)
    expect(counts([...commands(harness, previous), ...commands(harness, current)])).toEqual(writes)
    expect(container.childElementCount).toBe(0)
    expect(document.activeElement).toBe(destination)
    expect(frameFocus).not.toHaveBeenCalled()
    expect(harness.constructed).toHaveBeenCalledTimes(2)
    expect(harness.requests).toHaveBeenCalledTimes(1)
  })

  it("reaches Back while offline and restored controls through real controller arrows without replacing visible chat", async () => {
    const harness = installHarness()
    const { onBack } = await mountPlayer(harness)
    const player = harness.player()
    await act(async () => player.emit("ready"))
    await act(async () => button("player-chat").click())
    const chat = element<HTMLIFrameElement>(".player-chat iframe")
    const chatFocus = vi.spyOn(chat, "focus")
    await act(async () => button("player-captions").click())
    expect(document.activeElement).toBe(button("player-captions-show"))
    await act(async () => player.emit("offline"))
    expect(document.activeElement).toBe(button("player-captions-close"))
    for (const [key, id] of [
      ["ArrowUp", "player-captions"],
      ["ArrowLeft", "player-quality"],
      ["ArrowLeft", "player-back"],
      ["ArrowRight", "player-quality"],
      ["ArrowLeft", "player-back"],
    ] as const) {
      await pressKey(key)
      expect(document.activeElement).toBe(button(id))
    }
    await pressKey("Enter")
    expect(onBack).toHaveBeenCalledTimes(1)
    await act(async () => player.emit("online"))
    expect(document.activeElement).toBe(button("player-back"))
    for (const id of ["player-playback", "player-muted", "player-quality", "player-captions"]) {
      await pressKey("ArrowRight")
      expect(document.activeElement).toBe(button(id))
      expect(button(id).disabled).toBe(false)
    }
    await pressKey("ArrowDown")
    expect(document.activeElement).toBe(button("player-captions-show"))
    await pressKey("ArrowRight")
    expect(document.activeElement).toBe(button("player-captions-hide"))
    await pressKey("ArrowUp")
    await pressKey("ArrowLeft")
    await pressKey("ArrowLeft")
    expect(document.activeElement).toBe(button("player-muted"))
    await pressKey("ArrowLeft")
    expect(document.activeElement).toBe(button("player-playback"))
    await pressKey("ArrowLeft")
    expect(document.activeElement).toBe(button("player-back"))
    expect(element(".player-chat iframe")).toBe(chat)
    expect(chatFocus).not.toHaveBeenCalled()
    expect(harness.constructed).toHaveBeenCalledTimes(1)
    expect(harness.requests).toHaveBeenCalledTimes(1)
  })

  it("ignores ONLINE for VODs without changing their READY-driven timeline lifecycle", async () => {
    const harness = installHarness()
    const { container } = await mountPlayer(harness, videoSource)
    const player = harness.player()
    const startSampling = vi.spyOn(globalThis, "setInterval")
    const stopSampling = vi.spyOn(globalThis, "clearInterval")
    await act(async () => player.emit("ready"))
    expect(startSampling).toHaveBeenCalledExactlyOnceWith(expect.any(Function), 1000)
    const interval = startSampling.mock.results[0]?.value
    await act(async () => player.emit("offline"))
    expect(stopSampling).toHaveBeenCalledWith(interval)
    const reads = counts(getters(player))
    await act(async () => {
      player.emit("online")
      player.emit("playing")
      player.emit("seek")
    })
    expect(counts(getters(player))).toEqual(reads)
    expect(startSampling).toHaveBeenCalledTimes(1)
    expect(container.querySelector(".player-load-status[role=alert]")).not.toBeNull()
    expect(button("player-seek").disabled).toBe(true)
    await act(async () => player.emit("ready"))
    expect(startSampling).toHaveBeenCalledTimes(2)
    expect(player.getCurrentTime).toHaveBeenCalledTimes(2)
    expect(player.getDuration).toHaveBeenCalledTimes(2)
    expect(button("player-seek").disabled).toBe(false)
    expect(container.querySelector(".player-transport")).toBeNull()
    expect(harness.activateEmbeddedPlayer).toHaveBeenCalledTimes(1)
    expect(harness.constructed).toHaveBeenCalledTimes(1)
    expect(harness.requests).toHaveBeenCalledTimes(1)
  })
})
