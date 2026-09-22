// @vitest-environment jsdom

import { EventEmitter } from "node:events"
import type { BrowserWindow } from "electron"
import { act, StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createChatInput } from "../../../main/chat-input"
import type { PlaybackBookmark, VacuumStreamApi } from "../../../shared/contracts"
import { App } from "../App"
import { dispatchControllerKey, useControllerNavigation } from "../focus-navigation"
import type { TwitchPlayerOptions } from "../twitch-player"
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

const playerView = (playerSource: PlayerSource = source, onBack = () => undefined) => (
  <PlayerView
    onBack={onBack}
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
  const constructed = vi.fn<(elementId: string, options: TwitchPlayerOptions) => void>()
  const bookmarks = new Map<string, PlaybackBookmark>()
  const progress = {
    get: vi.fn<VacuumStreamApi["playbackProgress"]["get"]>(async (videoId) =>
      bookmarks.get(videoId),
    ),
    list: vi.fn<VacuumStreamApi["playbackProgress"]["list"]>(async () => [...bookmarks.values()]),
    remove: vi.fn<VacuumStreamApi["playbackProgress"]["remove"]>(async (videoId) => {
      bookmarks.delete(videoId)
    }),
    save: vi.fn<VacuumStreamApi["playbackProgress"]["save"]>(async (bookmark) => {
      bookmarks.set(bookmark.videoId, bookmark)
    }),
  }
  const catalog = {
    followed: vi.fn<VacuumStreamApi["catalog"]["followed"]>(),
    followedChannels: vi.fn<VacuumStreamApi["catalog"]["followedChannels"]>(),
    live: vi.fn<VacuumStreamApi["catalog"]["live"]>(),
    search: vi.fn<VacuumStreamApi["catalog"]["search"]>(),
    topCategories: vi.fn<VacuumStreamApi["catalog"]["topCategories"]>(),
    videos: vi.fn<VacuumStreamApi["catalog"]["videos"]>(),
  }
  const instances: TestPlayer[] = []
  const disableCaptions = vi.fn()
  const enableCaptions = vi.fn()
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
    static readonly ENDED = "ended"
    static readonly OFFLINE = "offline"
    static readonly ONLINE = "online"
    static readonly PAUSE = "pause"
    static readonly PLAY = "play"
    static readonly PLAYBACK_BLOCKED = "playback-blocked"
    static readonly PLAYING = "playing"
    static readonly READY = "ready"
    static readonly SEEK = "seek"

    constructor(elementId: string, options: TwitchPlayerOptions) {
      constructed(elementId, options)
      instances.push(this)
      document.getElementById(elementId)?.append(document.createElement("iframe"))
    }

    readonly addEventListener = (event: string, listener: () => void): void => {
      listeners.set(event, listener)
    }
    readonly disableCaptions = disableCaptions
    readonly enableCaptions = enableCaptions
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
  const chatNotifications = new Set<(session: string) => void>()
  const chatContents = Object.assign(new EventEmitter(), {
    send: (_channel: string, session: string) => {
      for (const listener of chatNotifications) listener(session)
    },
  })
  const chatInput = createChatInput({
    isFocused: () => true,
    webContents: chatContents,
  } as unknown as BrowserWindow)
  const beginChatInput = vi.fn(async (session: string) => chatInput.begin(session))
  const endChatInput = vi.fn(async (session: string) => chatInput.end(session))
  const onChatEscape = vi.fn((listener: (session: string) => void) => {
    chatNotifications.add(listener)
    return () => {
      chatNotifications.delete(listener)
    }
  })
  const chatKey = (type: "keyDown" | "keyUp", repeat = false): boolean => {
    const event = {
      defaultPrevented: false,
      preventDefault: () => {
        event.defaultPrevented = true
      },
    }
    chatContents.emit("before-input-event", event, { isAutoRepeat: repeat, key: "Escape", type })
    return event.defaultPrevented
  }
  Object.defineProperty(window, "vacuumStream", {
    configurable: true,
    value: {
      auth: { snapshot: async () => ({ kind: "guest" }) },
      catalog,
      chatInput: { begin: beginChatInput, end: endChatInput, onEscape: onChatEscape },
      playbackProgress: progress,
      settings: { snapshot: async () => ({ clientId: "client", secureStorage: false }) },
      system: { activateEmbeddedPlayer, restoreShellFullscreen },
    },
  })
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    configurable: true,
    value: true,
  })
  const emit = (event: "ready" | "playing" | "seek" | "offline" | "pause" | "ended"): void =>
    listeners.get(event)?.()
  return {
    activateEmbeddedPlayer,
    beginChatInput,
    bookmarks,
    catalog,
    chatContents,
    chatInput,
    chatKey,
    chatNotifications,
    constructed,
    disableCaptions,
    emit,
    enableCaptions,
    endChatInput,
    getCurrentTime,
    getDuration,
    getQualities,
    getQuality,
    instances,
    listeners,
    onChatEscape,
    pause,
    play,
    progress,
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

const mountNavigablePlayer = async (
  playerSource: PlayerSource = source,
  onBack = () => undefined,
) => {
  installNavigationSurface()
  const NavigablePlayer = () => {
    useControllerNavigation()
    return playerView(playerSource, onBack)
  }
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => root.render(<NavigablePlayer />))
  return { container, root }
}

const chatFrame = (container: HTMLElement): HTMLIFrameElement => {
  const frame = container.querySelector<HTMLIFrameElement>(".player-chat iframe")
  if (frame === null) throw new Error("Missing chat frame")
  return frame
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

const savedBookmark: PlaybackBookmark = {
  duration: 10_800,
  position: 3900,
  updatedAt: 1_700_000_000_000,
  videoId: videoSource.videoId,
}

const controlledPromise = <T,>() => {
  let resolve: ((value: T) => void) | undefined
  let reject: ((cause: Error) => void) | undefined
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept
    reject = fail
  })
  return {
    promise,
    reject: (cause: Error) => {
      if (reject === undefined) throw new Error("Missing rejection callback")
      reject(cause)
    },
    resolve: (value: T) => {
      if (resolve === undefined) throw new Error("Missing resolution callback")
      resolve(value)
    },
  }
}

describe("local VOD resume", () => {
  it("checkpoints 3900 seconds and reopens behind controller choices before one timed constructor", async () => {
    const harness = installPlayerHarness([true], { currentTime: 3900, duration: 10_800 })
    const saved = controlledPromise<void>()
    harness.progress.save.mockImplementationOnce(async (bookmark) => {
      harness.bookmarks.set(bookmark.videoId, bookmark)
      saved.resolve(undefined)
    })
    const first = await mountPlayer()
    await act(async () => {
      harness.emit("ready")
      harness.emit("playing")
    })
    await act(async () => vi.advanceTimersByTimeAsync(14_000))
    expect(harness.progress.save).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
      await saved.promise
    })
    expect(harness.progress.save).toHaveBeenCalledExactlyOnceWith({
      ...savedBookmark,
      details: { title: videoSource.title, userId: videoSource.userId },
      updatedAt: Date.now(),
    })
    await act(async () => first.root.unmount())
    harness.constructed.mockClear()

    const { container, root } = await mountNavigablePlayer(videoSource)
    expect(harness.constructed).not.toHaveBeenCalled()
    expect(container.querySelector("iframe")).toBeNull()
    const resume = buttonById(container, "video-resume-resume")
    expect(resume.textContent?.match(/\d+:\d{2}:\d{2}/)?.[0]).toBe("1:05:00")
    expect(document.activeElement).toBe(resume)
    await pressKey(container, "ArrowRight")
    expect(document.activeElement).toBe(buttonById(container, "video-resume-start"))
    await pressKey(container, "ArrowLeft")
    await pressKey(container, "Enter")
    expect(harness.constructed).toHaveBeenCalledExactlyOnceWith(
      "twitch-player-root",
      expect.objectContaining({ time: "1h5m0s", video: "42" }),
    )
    expect(harness.seek).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(buttonById(container, "player-back"))
    await act(async () => root.unmount())
  })

  it("limits changed-position checkpoints to fifteen seconds and does not rewrite stationary samples", async () => {
    const timeline = { currentTime: 60, duration: 3600 }
    const harness = installPlayerHarness([true], timeline)
    const { root } = await mountPlayer()
    await act(async () => {
      harness.emit("ready")
      harness.emit("playing")
      await vi.advanceTimersByTimeAsync(15_000)
    })
    expect(harness.progress.save).toHaveBeenCalledTimes(1)
    await act(async () => vi.advanceTimersByTimeAsync(30_000))
    expect(harness.progress.save).toHaveBeenCalledTimes(1)
    timeline.currentTime = 61
    await act(async () => vi.advanceTimersByTimeAsync(1000))
    expect(harness.progress.save).toHaveBeenCalledTimes(2)
    timeline.currentTime = 62
    await act(async () => vi.advanceTimersByTimeAsync(14_000))
    expect(harness.progress.save).toHaveBeenCalledTimes(2)
    await act(async () => vi.advanceTimersByTimeAsync(1000))
    expect(harness.progress.save).toHaveBeenCalledTimes(3)
    await act(async () => root.unmount())
  })

  it("checkpoints observed pause, confirmed seek and normal departure without saving seek requests", async () => {
    const timeline = { currentTime: 100, duration: 3600 }
    const harness = installPlayerHarness([true], timeline)
    const { container, root } = await mountPlayer()
    await act(async () => {
      harness.emit("ready")
      harness.emit("playing")
      harness.emit("pause")
    })
    expect(harness.bookmarks.get("42")?.position).toBe(100)
    await act(async () => buttonById(container, "player-seek-forward-30s").click())
    expect(harness.progress.save).toHaveBeenCalledTimes(1)
    timeline.currentTime = 130
    await act(async () => harness.emit("seek"))
    expect(harness.bookmarks.get("42")?.position).toBe(130)
    timeline.currentTime = 131
    await act(async () => harness.emit("playing"))
    await act(async () => root.unmount())
    expect(harness.progress.save.mock.calls.map(([bookmark]) => bookmark.position)).toEqual([
      100, 130, 131,
    ])
    expect(
      harness.progress.save.mock.calls.every(([bookmark]) => bookmark.updatedAt === Date.now()),
    ).toBe(true)
  })

  it("starts over once under StrictMode and repeated activation, removing the bookmark without time", async () => {
    const harness = installPlayerHarness([])
    harness.bookmarks.set("42", savedBookmark)
    const container = document.createElement("div")
    document.body.append(container)
    const root = createRoot(container)
    await act(async () => root.render(<StrictMode>{playerView(videoSource)}</StrictMode>))
    expect(harness.constructed).not.toHaveBeenCalled()
    const start = buttonById(container, "video-resume-start")
    await act(async () => {
      start.click()
      start.click()
    })
    expect(harness.progress.remove).toHaveBeenCalledExactlyOnceWith("42")
    expect(harness.bookmarks.has("42")).toBe(false)
    expect(harness.constructed).toHaveBeenCalledTimes(1)
    expect(harness.constructed.mock.calls[0]?.[1]).toMatchObject({ video: "42" })
    expect(harness.constructed.mock.calls[0]?.[1]).not.toHaveProperty("time")
    await act(async () => root.unmount())
  })

  it("takes Back from the resume prompt without constructing a player or changing progress", async () => {
    const harness = installPlayerHarness([])
    harness.bookmarks.set("42", savedBookmark)
    const onBack = vi.fn()
    const { container, root } = await mountNavigablePlayer(videoSource, onBack)
    await pressKey(container, "ArrowDown")
    await pressKey(container, "ArrowDown")
    expect(document.activeElement).toBe(buttonById(container, "video-resume-back"))
    await pressKey(container, "Enter")
    expect(onBack).toHaveBeenCalledTimes(1)
    await act(async () => root.unmount())
    expect(harness.constructed).not.toHaveBeenCalled()
    expect(harness.progress.save).not.toHaveBeenCalled()
    expect(harness.progress.remove).not.toHaveBeenCalled()
  })

  it("uses the existing startup path for a recording with no bookmark", async () => {
    const harness = installPlayerHarness([true])
    const { container, root } = await mountPlayer()
    expect(harness.progress.get).toHaveBeenCalledExactlyOnceWith("42")
    expect(container.querySelector(".video-resume")).toBeNull()
    expect(harness.constructed).toHaveBeenCalledExactlyOnceWith("twitch-player-root", {
      autoplay: true,
      height: "100%",
      muted: true,
      parent: ["localhost"],
      video: "42",
      width: "100%",
    })
    await act(async () => harness.emit("ready"))
    expect(harness.activateEmbeddedPlayer).toHaveBeenCalledExactlyOnceWith(true)
    await act(async () => root.unmount())
  })

  it("ignores a deferred lookup after source replacement and rechecks returning source objects", async () => {
    const harness = installPlayerHarness([])
    const lookup = controlledPromise<PlaybackBookmark | undefined>()
    harness.progress.get.mockReturnValueOnce(lookup.promise)
    const { container, root } = await mountPlayer()
    expect(harness.constructed).not.toHaveBeenCalled()
    await act(async () => root.render(playerView({ ...videoSource, videoId: "43" })))
    expect(harness.constructed.mock.calls.map(([, options]) => options.video)).toEqual(["43"])
    await act(async () => lookup.resolve(savedBookmark))
    expect(container.querySelector(".video-resume")).toBeNull()
    expect(harness.constructed).toHaveBeenCalledTimes(1)
    harness.bookmarks.set("42", savedBookmark)
    await act(async () => root.render(playerView(videoSource)))
    expect(container.querySelector(".video-resume")).not.toBeNull()
    expect(harness.constructed).toHaveBeenCalledTimes(1)
    await act(async () => root.unmount())
  })

  it("never overwrites a resumed bookmark with READY zero or unconfirmed startup samples", async () => {
    const timeline = { currentTime: 0, duration: 10_800 }
    const harness = installPlayerHarness([true], timeline)
    harness.bookmarks.set("42", savedBookmark)
    const { container, root } = await mountPlayer()
    const resume = buttonById(container, "video-resume-resume")
    await act(async () => {
      resume.click()
      resume.click()
    })
    await act(async () => {
      harness.emit("ready")
      harness.emit("playing")
      harness.emit("seek")
      harness.emit("pause")
      await vi.advanceTimersByTimeAsync(15_000)
    })
    timeline.currentTime = 5
    await act(async () => {
      harness.emit("playing")
      harness.emit("pause")
      await vi.advanceTimersByTimeAsync(15_000)
    })
    await act(async () => root.unmount())
    expect(harness.progress.save).not.toHaveBeenCalled()
    expect(harness.bookmarks.get("42")).toEqual(savedBookmark)
    expect(harness.constructed).toHaveBeenCalledTimes(1)
  })

  it("accepts a resumed position only after confirmation and permits a confirmed viewer seek to zero", async () => {
    const timeline = { currentTime: 3900, duration: 10_800 }
    const harness = installPlayerHarness([true], timeline)
    harness.bookmarks.set("42", savedBookmark)
    const { container, root } = await mountPlayer()
    await act(async () => buttonById(container, "video-resume-resume").click())
    await act(async () => {
      harness.emit("ready")
      harness.emit("playing")
    })
    timeline.currentTime = 3901
    await act(async () => harness.emit("pause"))
    expect(harness.bookmarks.get("42")?.position).toBe(3901)
    timeline.currentTime = 10
    await act(async () => buttonById(container, "player-seek-back-30s").click())
    timeline.currentTime = 0
    await act(async () => harness.emit("seek"))
    expect(harness.bookmarks.get("42")?.position).toBe(0)
    await act(async () => root.unmount())
  })

  it("removes on ENDED and ignores later samples and cleanup without a near-end heuristic", async () => {
    const timeline = { currentTime: 10_799, duration: 10_800 }
    const harness = installPlayerHarness([true], timeline)
    const { root } = await mountPlayer()
    await act(async () => {
      harness.emit("ready")
      harness.emit("playing")
      harness.emit("pause")
    })
    expect(harness.bookmarks.get("42")?.position).toBe(10_799)
    expect(harness.progress.remove).not.toHaveBeenCalled()
    timeline.duration = 11_000
    timeline.currentTime = 10_850
    await act(async () => harness.emit("seek"))
    expect(harness.bookmarks.get("42")?.duration).toBe(11_000)
    await act(async () => harness.emit("ended"))
    const writes = harness.progress.save.mock.calls.length
    await act(async () => {
      harness.emit("playing")
      harness.emit("pause")
      harness.emit("seek")
      harness.emit("ended")
      root.unmount()
    })
    expect(harness.progress.remove).toHaveBeenCalledExactlyOnceWith("42")
    expect(harness.bookmarks.has("42")).toBe(false)
    expect(harness.progress.save).toHaveBeenCalledTimes(writes)
  })

  it("orders completion after an in-flight save, cancels queued saves and gates a reopening lookup", async () => {
    const timeline = { currentTime: 100, duration: 3600 }
    const harness = installPlayerHarness([true], timeline)
    const write = controlledPromise<void>()
    harness.progress.save.mockImplementationOnce(async (bookmark) => {
      await write.promise
      harness.bookmarks.set(bookmark.videoId, bookmark)
    })
    const first = await mountPlayer()
    await act(async () => {
      harness.emit("ready")
      harness.emit("playing")
      harness.emit("pause")
    })
    expect(harness.progress.save).toHaveBeenCalledTimes(1)
    timeline.currentTime = 200
    await act(async () => {
      harness.emit("seek")
      harness.emit("ended")
    })
    await act(async () => first.root.unmount())
    const next = await mountPlayer()
    expect(harness.constructed).toHaveBeenCalledTimes(1)
    expect(harness.progress.remove).not.toHaveBeenCalled()
    await act(async () => write.resolve(undefined))
    expect(harness.progress.save).toHaveBeenCalledTimes(1)
    expect(harness.progress.remove).toHaveBeenCalledExactlyOnceWith("42")
    expect(harness.bookmarks.has("42")).toBe(false)
    expect(harness.constructed).toHaveBeenCalledTimes(2)
    expect(next.container.querySelector(".video-resume")).toBeNull()
    await act(async () => next.root.unmount())
  })

  it("binds late persistence failures and old player callbacks to their original video", async () => {
    const harness = installPlayerHarness([true, true], { currentTime: 100, duration: 3600 })
    const write = controlledPromise<void>()
    harness.progress.save.mockReturnValueOnce(write.promise)
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const { container, root } = await mountPlayer()
    await act(async () => {
      harness.emit("ready")
      harness.emit("playing")
      harness.emit("pause")
    })
    const oldListeners = new Map(harness.listeners)
    await act(async () => root.render(playerView({ ...videoSource, videoId: "43" })))
    await act(async () => {
      for (const callback of oldListeners.values()) callback()
      write.reject(new Error("Disk unavailable"))
    })
    expect(logged).toHaveBeenCalledTimes(1)
    expect(container.querySelector(".player-progress-status")).toBeNull()
    expect(harness.progress.save.mock.calls.map(([bookmark]) => bookmark.videoId)).toEqual(["42"])
    expect(harness.progress.remove).not.toHaveBeenCalled()
    await act(async () => root.unmount())
  })

  it("performs no progress operations or time configuration for live playback", async () => {
    const harness = installPlayerHarness([true], { currentTime: 3900, duration: 10_800 })
    const { container, root } = await mountPlayer(source)
    await act(async () => {
      harness.emit("ready")
      harness.emit("playing")
      harness.emit("pause")
      harness.emit("seek")
      harness.emit("ended")
    })
    expect(container.querySelector(".video-resume")).toBeNull()
    expect(harness.constructed.mock.calls[0]?.[1]).not.toHaveProperty("time")
    await act(async () => root.unmount())
    expect(harness.progress.get).not.toHaveBeenCalled()
    expect(harness.progress.save).not.toHaveBeenCalled()
    expect(harness.progress.remove).not.toHaveBeenCalled()
  })

  it("keeps rejected lookups escapable and offers playback without resume through controller navigation", async () => {
    const harness = installPlayerHarness([])
    harness.progress.get.mockRejectedValueOnce(new Error("Cannot read file"))
    const onBack = vi.fn()
    const { container, root } = await mountNavigablePlayer(videoSource, onBack)
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
    expect(harness.constructed).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(buttonById(container, "video-resume-start"))
    await pressKey(container, "ArrowRight")
    expect(document.activeElement).toBe(buttonById(container, "video-resume-back"))
    await pressKey(container, "Enter")
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(harness.constructed).not.toHaveBeenCalled()
    await pressKey(container, "ArrowLeft")
    await pressKey(container, "Enter")
    expect(harness.constructed).toHaveBeenCalledTimes(1)
    expect(harness.constructed.mock.calls[0]?.[1]).not.toHaveProperty("time")
    await act(async () => root.unmount())
  })

  it("reports failed writes outside the embed without interrupting playback and retries unsaved positions", async () => {
    const harness = installPlayerHarness([true], { currentTime: 3900, duration: 10_800 })
    harness.progress.save.mockRejectedValueOnce(new Error("Disk full"))
    const { container, root } = await mountPlayer()
    const frame = container.querySelector("iframe")
    await act(async () => {
      harness.emit("ready")
      harness.emit("playing")
      harness.emit("pause")
    })
    const status = container.querySelector('.player-progress-status[role="status"]')
    expect(status?.textContent?.length).toBeGreaterThan(0)
    expect(container.querySelector(".player-stage")?.contains(status)).toBe(false)
    expect(harness.bookmarks.has("42")).toBe(false)
    expect(container.querySelector("iframe")).toBe(frame)
    expect(harness.constructed).toHaveBeenCalledTimes(1)
    expect(harness.pause).not.toHaveBeenCalled()
    await act(async () => harness.emit("pause"))
    expect(harness.progress.save).toHaveBeenCalledTimes(2)
    expect(harness.bookmarks.get("42")?.position).toBe(3900)
    expect(container.querySelector(".player-progress-status")).toBeNull()
    await act(async () => root.unmount())
  })

  it("reports a failed Start over removal while allowing untimed playback", async () => {
    const harness = installPlayerHarness([])
    harness.bookmarks.set("42", savedBookmark)
    harness.progress.remove.mockRejectedValueOnce(new Error("Read-only disk"))
    const { container, root } = await mountPlayer()
    await act(async () => buttonById(container, "video-resume-start").click())
    expect(container.querySelector('.player-progress-status[role="status"]')).not.toBeNull()
    expect(harness.constructed).toHaveBeenCalledTimes(1)
    expect(harness.constructed.mock.calls[0]?.[1]).not.toHaveProperty("time")
    expect(harness.bookmarks.get("42")).toEqual(savedBookmark)
    await act(async () => root.unmount())
  })
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

describe("controller captions", () => {
  it.each([source, videoSource])(
    "leaves Twitch defaults untouched until a ready viewer requests captions for $kind",
    async (playerSource) => {
      const harness = installPlayerHarness([true])
      const { container, root } = await mountPlayer(playerSource)
      const control = buttonById(container, "player-captions")
      const expectNoRequests = (): void => {
        expect(harness.enableCaptions).not.toHaveBeenCalled()
        expect(harness.disableCaptions).not.toHaveBeenCalled()
        expect(control.hasAttribute("data-requested-captions")).toBe(false)
      }
      expectNoRequests()
      await act(async () => harness.emit("playing"))
      await act(async () => control.click())
      for (const setting of ["show", "hide"]) {
        const command = buttonById(container, `player-captions-${setting}`)
        expect(command.disabled).toBe(true)
        expect(command.getAttribute("aria-pressed")).toBe("false")
        await act(async () => command.click())
      }
      expect(document.activeElement).toBe(buttonById(container, "player-captions-close"))
      await act(async () => buttonById(container, "player-captions-close").click())
      expectNoRequests()
      await act(async () => harness.emit("ready"))
      expectNoRequests()
      await act(async () => control.click())
      await act(async () => buttonById(container, "player-captions-close").click())
      expectNoRequests()
      await act(async () => control.click())
      await act(async () => buttonById(container, "player-captions-show").click())
      expect(harness.enableCaptions).toHaveBeenCalledExactlyOnceWith()
      expect(harness.disableCaptions).not.toHaveBeenCalled()
      expect(control.getAttribute("data-requested-captions")).toBe("show")
      expect(buttonById(container, "player-captions-show").getAttribute("aria-pressed")).toBe(
        "true",
      )
      await act(async () => buttonById(container, "player-captions-hide").click())
      expect(harness.disableCaptions).toHaveBeenCalledExactlyOnceWith()
      expect(harness.enableCaptions).toHaveBeenCalledTimes(1)
      expect(control.getAttribute("data-requested-captions")).toBe("hide")
      expect(buttonById(container, "player-captions-hide").getAttribute("aria-pressed")).toBe(
        "true",
      )
      expect(buttonById(container, "player-captions-show").getAttribute("aria-pressed")).toBe(
        "false",
      )
      await act(async () => buttonById(container, "player-captions-close").click())
      await act(async () => harness.emit("offline"))
      await act(async () => control.click())
      for (const setting of ["show", "hide"]) {
        const command = buttonById(container, `player-captions-${setting}`)
        expect(command.disabled).toBe(true)
        await act(async () => command.click())
      }
      await act(async () => harness.emit("playing"))
      await act(async () => buttonById(container, "player-captions-close").click())
      expect(document.activeElement).toBe(control)
      expect(harness.enableCaptions).toHaveBeenCalledTimes(1)
      expect(harness.disableCaptions).toHaveBeenCalledTimes(1)
      // Offline is not caption absence, and READY does not reapply the last request.
      expect(control.getAttribute("data-requested-captions")).toBe("hide")
      await act(async () => harness.emit("ready"))
      expect(harness.enableCaptions).toHaveBeenCalledTimes(1)
      expect(harness.disableCaptions).toHaveBeenCalledTimes(1)
      await act(async () => root.unmount())
      expect(harness.enableCaptions).toHaveBeenCalledTimes(1)
      expect(harness.disableCaptions).toHaveBeenCalledTimes(1)
    },
  )

  it.each([source, videoSource])(
    "walks the caption toolbar and chooser in both directions for $kind without playback or data side effects",
    async (playerSource) => {
      const harness = installPlayerHarness([true], undefined, {
        available: ["auto"],
        current: "auto",
      })
      const { container, root } = await mountNavigablePlayer(playerSource)
      await act(async () => harness.emit("ready"))
      const player = harness.instances[0]
      const playerRoot = container.querySelector("#twitch-player-root")
      const frame = playerRoot?.querySelector("iframe")
      expect(player).toBeDefined()
      expect(playerRoot).not.toBeNull()
      expect(frame).not.toBeNull()
      const calls = [
        harness.activateEmbeddedPlayer,
        harness.play,
        harness.pause,
        harness.setMuted,
        harness.seek,
        harness.setQuality,
        ...Object.values(harness.progress),
        ...Object.values(harness.catalog),
      ].map((mock) => ({ count: mock.mock.calls.length, mock }))
      const expectIsolated = (): void => {
        expect(harness.instances).toHaveLength(1)
        expect(harness.instances[0]).toBe(player)
        expect(harness.constructed).toHaveBeenCalledTimes(1)
        expect(container.querySelector("#twitch-player-root")).toBe(playerRoot)
        expect(playerRoot?.querySelector("iframe")).toBe(frame)
        for (const { count, mock } of calls) expect(mock).toHaveBeenCalledTimes(count)
      }
      const move = async (key: string, id: string): Promise<void> => {
        await pressKey(container, key)
        expect(document.activeElement).toBe(buttonById(container, id))
        expect(container.querySelector(".player-stage")?.contains(document.activeElement)).toBe(
          false,
        )
        expectIsolated()
      }
      const route = [
        "player-back",
        "player-playback",
        "player-muted",
        "player-quality",
        "player-captions",
        "player-vods",
        ...(playerSource.kind === "live" ? ["player-chat"] : []),
        "player-fullscreen",
      ]
      for (const id of route.slice(1)) await move("ArrowRight", id)
      for (const id of route.slice(0, -1).reverse()) await move("ArrowLeft", id)
      for (const id of route.slice(1, 4)) await move("ArrowRight", id)
      await move("Enter", "player-quality-option-auto")
      await move("ArrowUp", "player-quality")
      await move("ArrowRight", "player-captions")
      await move("Enter", "player-captions-show")
      expect(container.querySelector(".player-quality")).not.toBeNull()
      expect(container.querySelector(".player-stage .player-captions")).toBeNull()
      expect(harness.enableCaptions).not.toHaveBeenCalled()
      expect(harness.disableCaptions).not.toHaveBeenCalled()
      for (const command of ["show", "hide", "close"]) {
        const button = buttonById(container, `player-captions-${command}`)
        expect(button.disabled).toBe(false)
        expect(button.getAttribute("data-focusable")).toBe("true")
        for (const direction of ["down", "left", "right", "up"]) {
          expect(button.hasAttribute(`data-focus-${direction}`)).toBe(true)
        }
      }
      await move("Enter", "player-captions-show")
      await move("ArrowRight", "player-captions-hide")
      await move("Enter", "player-captions-hide")
      await move("ArrowRight", "player-captions-close")
      await move("ArrowLeft", "player-captions-hide")
      await move("ArrowLeft", "player-captions-show")
      await move("ArrowLeft", "player-captions")
      await move("ArrowDown", "player-captions-show")
      await move("ArrowDown", "player-captions-close")
      await move("ArrowUp", "player-captions")
      await move("ArrowDown", "player-captions-show")
      await move("ArrowRight", "player-captions-hide")
      await move("ArrowUp", "player-captions")
      await move("ArrowDown", "player-captions-show")
      await move("ArrowRight", "player-captions-hide")
      await move("ArrowDown", "player-captions-close")
      await move("ArrowRight", "player-captions-close")
      await move("ArrowDown", "player-captions-close")
      await move("Enter", "player-captions")
      expect(container.querySelector(".player-captions")).toBeNull()
      expect(harness.enableCaptions).toHaveBeenCalledExactlyOnceWith()
      expect(harness.disableCaptions).toHaveBeenCalledExactlyOnceWith()
      await move("ArrowUp", "player-back")
      await act(async () => root.unmount())
    },
  )

  it.each(["show", "hide"] as const)(
    "recovers offline focus from the disabled %s command to Close and keeps loading controls reachable",
    async (setting) => {
      const harness = installPlayerHarness([true])
      const { container, root } = await mountNavigablePlayer()
      await pressKey(container, "ArrowRight")
      await pressKey(container, "ArrowRight")
      expect(document.activeElement).toBe(buttonById(container, "player-captions"))
      await pressKey(container, "Enter")
      expect(document.activeElement).toBe(buttonById(container, "player-captions-close"))
      await pressKey(container, "ArrowLeft")
      expect(document.activeElement).toBe(buttonById(container, "player-captions"))
      await pressKey(container, "ArrowDown")
      expect(document.activeElement).toBe(buttonById(container, "player-captions-close"))
      await act(async () => harness.emit("ready"))
      await pressKey(container, "ArrowUp")
      await pressKey(container, "ArrowDown")
      if (setting === "hide") await pressKey(container, "ArrowRight")
      expect(document.activeElement).toBe(buttonById(container, `player-captions-${setting}`))
      await act(async () => harness.emit("offline"))
      expect(document.activeElement).toBe(buttonById(container, "player-captions-close"))
      expect(document.activeElement?.getAttribute("data-controller-focused")).toBe("true")
      await pressKey(container, "ArrowUp")
      expect(document.activeElement).toBe(buttonById(container, "player-captions"))
      await pressKey(container, "ArrowDown")
      expect(document.activeElement).toBe(buttonById(container, "player-captions-close"))
      await pressKey(container, "Enter")
      expect(document.activeElement).toBe(buttonById(container, "player-captions"))
      await pressKey(container, "ArrowLeft")
      expect(document.activeElement).toBe(buttonById(container, "player-quality"))
      await pressKey(container, "ArrowLeft")
      expect(document.activeElement).toBe(buttonById(container, "player-back"))
      expect(harness.enableCaptions).not.toHaveBeenCalled()
      expect(harness.disableCaptions).not.toHaveBeenCalled()
      await act(async () => root.unmount())
    },
  )

  it.each(["show", "hide"] as const)(
    "keeps a rejected %s caption request unrecorded, escapable and retryable",
    async (setting) => {
      const harness = installPlayerHarness([true])
      const setter = setting === "show" ? harness.enableCaptions : harness.disableCaptions
      setter.mockImplementationOnce(() => {
        throw new Error("Player unavailable")
      })
      const { container, root } = await mountNavigablePlayer()
      await act(async () => harness.emit("ready"))
      await act(async () => buttonById(container, "player-captions").click())
      if (setting === "hide") await pressKey(container, "ArrowRight")
      await pressKey(container, "Enter")
      expect(setter).toHaveBeenCalledExactlyOnceWith()
      expect(buttonById(container, "player-captions").hasAttribute("data-requested-captions")).toBe(
        false,
      )
      expect(buttonById(container, `player-captions-${setting}`).getAttribute("aria-pressed")).toBe(
        "false",
      )
      const alert = container.querySelector('.player-captions [role="alert"]')
      expect(alert).not.toBeNull()
      expect(container.querySelector(".player-stage")?.contains(alert)).toBe(false)
      await pressKey(container, "ArrowDown")
      expect(document.activeElement).toBe(buttonById(container, "player-captions-close"))
      await pressKey(container, "Enter")
      expect(document.activeElement).toBe(buttonById(container, "player-captions"))
      await pressKey(container, "Enter")
      if (setting === "hide") await pressKey(container, "ArrowRight")
      await pressKey(container, "Enter")
      expect(setter).toHaveBeenCalledTimes(2)
      expect(buttonById(container, "player-captions").getAttribute("data-requested-captions")).toBe(
        setting,
      )
      expect(container.querySelector('.player-captions [role="alert"]')).toBeNull()
      expect(buttonById(container, `player-captions-${setting}`).getAttribute("aria-pressed")).toBe(
        "true",
      )
      await act(async () => root.unmount())
    },
  )

  it("clears caption requests and errors on replacement and teardown without obsolete callbacks restoring them", async () => {
    const harness = installPlayerHarness([true, true])
    const { container, root } = await mountPlayer(source)
    await act(async () => harness.emit("ready"))
    await act(async () => buttonById(container, "player-captions").click())
    await act(async () => buttonById(container, "player-captions-show").click())
    harness.disableCaptions.mockImplementationOnce(() => {
      throw new Error("Player unavailable")
    })
    await act(async () => buttonById(container, "player-captions-hide").click())
    expect(buttonById(container, "player-captions").getAttribute("data-requested-captions")).toBe(
      "show",
    )
    expect(container.querySelector('.player-captions [role="alert"]')).not.toBeNull()
    const oldListeners = [...harness.listeners.values()]
    await act(async () => root.render(playerView(videoSource)))
    const control = buttonById(container, "player-captions")
    expect(container.querySelector(".player-captions")).toBeNull()
    expect(control.hasAttribute("data-requested-captions")).toBe(false)
    await act(async () => {
      for (const callback of oldListeners) callback()
    })
    expect(container.querySelector(".player-captions")).toBeNull()
    await act(async () => control.click())
    expect(container.querySelector('.player-captions [role="alert"]')).toBeNull()
    expect(buttonById(container, "player-captions-show").disabled).toBe(true)
    expect(container.querySelector(".player-frame")?.getAttribute("aria-busy")).toBe("true")
    await act(async () => harness.emit("ready"))
    await act(async () => {
      for (const callback of oldListeners) callback()
    })
    expect(control.hasAttribute("data-requested-captions")).toBe(false)
    expect(buttonById(container, "player-captions-show").disabled).toBe(false)
    expect(buttonById(container, "player-captions-hide").getAttribute("aria-pressed")).toBe("false")
    expect(container.querySelector('.player-captions [role="alert"]')).toBeNull()
    expect(harness.enableCaptions).toHaveBeenCalledTimes(1)
    expect(harness.disableCaptions).toHaveBeenCalledTimes(1)
    await act(async () => buttonById(container, "player-captions-hide").click())
    expect(control.getAttribute("data-requested-captions")).toBe("hide")
    // Returning to the exact original source object cannot restore its request or error.
    const videoListeners = [...harness.listeners.values()]
    await act(async () => root.render(playerView(source)))
    expect(container.querySelector(".player-captions")).toBeNull()
    expect(control.hasAttribute("data-requested-captions")).toBe(false)
    await act(async () => control.click())
    expect(container.querySelector('.player-captions [role="alert"]')).toBeNull()
    await act(async () => root.unmount())
    await act(async () => {
      for (const callback of [...oldListeners, ...videoListeners, ...harness.listeners.values()])
        callback()
    })
    expect(container.childElementCount).toBe(0)
    expect(harness.enableCaptions).toHaveBeenCalledTimes(1)
    expect(harness.disableCaptions).toHaveBeenCalledTimes(2)
  })

  it("routes legacy bookmarks through Quality, Captions and Fullscreen around the disabled archive shortcut", async () => {
    const harness = installPlayerHarness([true])
    harness.bookmarks.set("legacy", { ...savedBookmark, videoId: "legacy" })
    installNavigationSurface()
    const container = document.createElement("div")
    document.body.append(container)
    const root = createRoot(container)
    await act(async () => root.render(<App />))
    await act(async () => buttonById(container, "continue-legacy-open").click())
    await pressKey(container, "Enter")
    await act(async () => harness.emit("ready"))
    expect(buttonById(container, "player-vods").disabled).toBe(true)
    for (const id of [
      "player-playback",
      "player-muted",
      "player-quality",
      "player-captions",
      "player-fullscreen",
    ]) {
      await pressKey(container, "ArrowRight")
      expect(document.activeElement).toBe(buttonById(container, id))
    }
    await pressKey(container, "ArrowLeft")
    expect(document.activeElement).toBe(buttonById(container, "player-captions"))
    await pressKey(container, "ArrowLeft")
    expect(document.activeElement).toBe(buttonById(container, "player-quality"))
    await pressKey(container, "ArrowRight")
    await pressKey(container, "Enter")
    expect(document.activeElement).toBe(buttonById(container, "player-captions-show"))
    await pressKey(container, "ArrowRight")
    expect(document.activeElement).toBe(buttonById(container, "player-captions-hide"))
    await pressKey(container, "ArrowRight")
    await pressKey(container, "Enter")
    expect(document.activeElement).toBe(buttonById(container, "player-captions"))
    for (const request of Object.values(harness.catalog)) expect(request).not.toHaveBeenCalled()
    expect(harness.enableCaptions).not.toHaveBeenCalled()
    expect(harness.disableCaptions).not.toHaveBeenCalled()
    await act(async () => root.unmount())
  })

  it.each(["loading", "ready", "offline"] as const)(
    "preserves Escape to Home from captions through the real App controller while %s",
    async (state) => {
      const harness = installPlayerHarness([true])
      installNavigationSurface()
      const container = document.createElement("div")
      document.body.append(container)
      const root = createRoot(container)
      await act(async () => root.render(<App />))
      await act(async () => buttonById(container, "stream-preview-twitch").click())
      if (state !== "loading") await act(async () => harness.emit("ready"))
      if (state === "offline") await act(async () => harness.emit("offline"))
      const route = state === "ready" ? 4 : 2
      for (let index = 0; index < route; index += 1) await pressKey(container, "ArrowRight")
      expect(document.activeElement).toBe(buttonById(container, "player-captions"))
      await pressKey(container, "Enter")
      expect(document.activeElement).toBe(
        buttonById(container, state === "ready" ? "player-captions-show" : "player-captions-close"),
      )
      await pressKey(container, "Escape")
      expect(container.querySelector(".player-view")).toBeNull()
      expect(container.querySelector(".browse-view")).not.toBeNull()
      expect(document.activeElement).toBe(buttonById(container, "nav-home"))
      expect(harness.restoreShellFullscreen).toHaveBeenCalledTimes(1)
      expect(harness.enableCaptions).not.toHaveBeenCalled()
      expect(harness.disableCaptions).not.toHaveBeenCalled()
      await act(async () => root.unmount())
    },
  )
})

describe("live chat sidebar", () => {
  it("keeps focus in the shell until explicit entry is armed and never forwards the entry key", async () => {
    const harness = installPlayerHarness([])
    const { container, root } = await mountNavigablePlayer()
    await act(async () => buttonById(container, "player-chat").click())
    expect(document.activeElement).toBe(buttonById(container, "player-chat"))
    expect(chatFrame(container).tabIndex).toBe(-1)
    await act(async () => buttonById(container, "player-chat-reload").click())
    expect(document.activeElement).toBe(buttonById(container, "player-chat"))
    expect(chatFrame(container).tabIndex).toBe(-1)
    await act(async () => buttonById(container, "player-chat").click())
    expect(document.activeElement).toBe(buttonById(container, "player-chat"))
    expect(harness.beginChatInput).not.toHaveBeenCalled()
    await act(async () => buttonById(container, "player-chat").click())
    const frame = chatFrame(container)
    const frameClick = vi.spyOn(frame, "click")
    const frameKey = vi.fn()
    frame.contentDocument?.addEventListener("keydown", frameKey)
    let armed: (() => void) | undefined
    harness.beginChatInput.mockImplementationOnce(
      (session) =>
        new Promise<void>((resolve) => {
          armed = () => {
            harness.chatInput.begin(session)
            resolve()
          }
        }),
    )
    await pressKey(container, "ArrowDown")
    await pressKey(container, "Enter")
    expect(document.activeElement).toBe(buttonById(container, "player-chat-enter"))
    expect(frame.tabIndex).toBe(-1)
    await act(async () => {
      if (armed === undefined) throw new Error("Entry was not requested")
      armed()
    })
    expect(frame.tabIndex).toBe(0)
    expect(document.activeElement).toBe(frame)
    expect(frameClick).not.toHaveBeenCalled()
    expect(frameKey).not.toHaveBeenCalled()
    const hint = container.querySelector("#player-chat-hint")
    expect(hint).not.toBeNull()
    expect(container.querySelector(".player-stage")?.contains(hint)).toBe(false)
    expect(container.querySelector('[data-controller-focused="true"]')).toBeNull()
    // Focusing a child frame can blur the DOM window without blurring the BrowserWindow.
    await act(async () => window.dispatchEvent(new Event("blur")))
    expect(frame.tabIndex).toBe(0)
    expect(document.activeElement).toBe(frame)
    await act(async () => root.unmount())
  })

  it("exits on the main Escape notification, consumes the held press, then lets a later Escape go Home", async () => {
    const harness = installPlayerHarness([])
    installNavigationSurface()
    const container = document.createElement("div")
    document.body.append(container)
    const root = createRoot(container)
    await act(async () => root.render(<App />))
    await act(async () => buttonById(container, "stream-preview-twitch").click())
    await act(async () => buttonById(container, "player-chat").click())
    await act(async () => buttonById(container, "player-chat-enter").click())
    const frame = chatFrame(container)
    expect(document.activeElement).toBe(frame)
    const osEscape = async (type: "keyDown" | "keyUp", repeat = false): Promise<boolean> => {
      let prevented = false
      await act(async () => {
        prevented = harness.chatKey(type, repeat)
        if (!prevented && type === "keyDown") dispatchControllerKey("Escape")
      })
      return prevented
    }
    expect(await osEscape("keyDown")).toBe(true)
    expect(frame.tabIndex).toBe(-1)
    expect(document.activeElement).toBe(buttonById(container, "player-chat"))
    expect(container.querySelector("#player-chat-hint")).toBeNull()
    expect(harness.chatNotifications.size).toBe(0)
    expect(await osEscape("keyDown", true)).toBe(true)
    expect(await osEscape("keyDown", true)).toBe(true)
    expect(await osEscape("keyUp")).toBe(true)
    expect(harness.chatContents.listenerCount("before-input-event")).toBe(0)
    expect(harness.restoreShellFullscreen).not.toHaveBeenCalled()
    expect(await osEscape("keyDown")).toBe(false)
    expect(container.querySelector(".player-view")).toBeNull()
    expect(document.activeElement).toBe(buttonById(container, "nav-home"))
    expect(harness.restoreShellFullscreen).toHaveBeenCalledTimes(1)
    await act(async () => root.unmount())
  })

  it.each(["hide", "reload", "source", "same-login", "video", "blur"] as const)(
    "ends chat input on %s, removes listeners and ignores stale notifications even after re-entry",
    async (reason) => {
      const harness = installPlayerHarness([])
      const { container, root } = await mountPlayer(source)
      await act(async () => buttonById(container, "player-chat").click())
      await act(async () => buttonById(container, "player-chat-enter").click())
      const frame = chatFrame(container)
      const session = harness.beginChatInput.mock.calls[0]?.[0]
      const staleNotification = harness.onChatEscape.mock.calls[0]?.[0]
      if (session === undefined || staleNotification === undefined)
        throw new Error("Missing session")
      expect(harness.chatContents.listenerCount("before-input-event")).toBe(1)
      await act(async () => {
        switch (reason) {
          case "hide":
            buttonById(container, "player-chat").click()
            break
          case "reload":
            buttonById(container, "player-chat-reload").click()
            break
          case "source":
            root.render(playerView({ ...source, channel: "new" }))
            break
          case "same-login":
            root.render(playerView({ ...source }))
            break
          case "video":
            root.render(playerView(videoSource))
            break
          case "blur":
            harness.chatInput.blur()
            break
        }
      })
      expect(harness.endChatInput).toHaveBeenCalledExactlyOnceWith(session)
      expect(harness.chatContents.listenerCount("before-input-event")).toBe(0)
      expect(harness.chatNotifications.size).toBe(0)
      expect(frame.tabIndex).toBe(-1)
      expect(container.querySelector("#player-chat-hint")).toBeNull()
      expect(document.activeElement).toBe(
        buttonById(container, reason === "video" ? "player-back" : "player-chat"),
      )
      await act(async () => staleNotification(session))
      expect(harness.endChatInput).toHaveBeenCalledTimes(1)
      if (reason === "source" || reason === "same-login" || reason === "video") {
        await act(async () => root.render(playerView(source)))
        expect(container.querySelector(".player-chat")).toBeNull()
      }
      if (container.querySelector(".player-chat") === null) {
        await act(async () => buttonById(container, "player-chat").click())
      }
      const nextFrame = chatFrame(container)
      expect(nextFrame.tabIndex).toBe(-1)
      expect(document.activeElement).not.toBe(nextFrame)
      await act(async () => buttonById(container, "player-chat-enter").click())
      await act(async () => staleNotification(session))
      expect(nextFrame.tabIndex).toBe(0)
      expect(document.activeElement).toBe(nextFrame)
      expect(harness.endChatInput).toHaveBeenCalledTimes(1)
      await act(async () => root.unmount())
    },
  )

  it.each(["leave", "unmount"] as const)(
    "ends chat input on %s and restores shell focus before the player is removed",
    async (reason) => {
      const harness = installPlayerHarness([])
      installNavigationSurface()
      const container = document.createElement("div")
      document.body.append(container)
      const root = createRoot(container)
      await act(async () => root.render(<App />))
      await act(async () => buttonById(container, "stream-preview-twitch").click())
      await act(async () => buttonById(container, "player-chat").click())
      await act(async () => buttonById(container, "player-chat-enter").click())
      const frame = chatFrame(container)
      const toggle = buttonById(container, "player-chat")
      const restored = vi.fn()
      toggle.addEventListener("focus", () => restored(toggle.isConnected))
      const staleNotification = harness.onChatEscape.mock.calls[0]?.[0]
      const session = harness.beginChatInput.mock.calls[0]?.[0]
      if (staleNotification === undefined || session === undefined)
        throw new Error("Missing session")
      await act(async () => {
        if (reason === "leave") buttonById(container, "player-back").click()
        else root.unmount()
      })
      expect(restored).toHaveBeenCalledExactlyOnceWith(true)
      expect(harness.endChatInput).toHaveBeenCalledExactlyOnceWith(session)
      expect(harness.chatContents.listenerCount("before-input-event")).toBe(0)
      expect(harness.chatNotifications.size).toBe(0)
      expect(frame.tabIndex).toBe(-1)
      expect(container.querySelector(".player-view")).toBeNull()
      if (reason === "leave") expect(document.activeElement).toBe(buttonById(container, "nav-home"))
      await act(async () => staleNotification(session))
      expect(harness.endChatInput).toHaveBeenCalledTimes(1)
      if (reason === "leave") await act(async () => root.unmount())
    },
  )

  it("invalidates pending entry on teardown and reports a rejected entry without focusing chat", async () => {
    const harness = installPlayerHarness([])
    const { container, root } = await mountPlayer(source)
    await act(async () => buttonById(container, "player-chat").click())
    const frame = chatFrame(container)
    let acknowledge: (() => void) | undefined
    harness.beginChatInput.mockImplementationOnce(async (session) => {
      harness.chatInput.begin(session)
      await new Promise<void>((resolve) => {
        acknowledge = resolve
      })
    })
    await act(async () => buttonById(container, "player-chat-enter").click())
    await act(async () => buttonById(container, "player-chat-reload").click())
    await act(async () => {
      if (acknowledge === undefined) throw new Error("Missing pending acknowledgement")
      acknowledge()
    })
    expect(frame.tabIndex).toBe(-1)
    expect(chatFrame(container).tabIndex).toBe(-1)
    expect(document.activeElement).toBe(buttonById(container, "player-chat"))
    expect(harness.chatContents.listenerCount("before-input-event")).toBe(0)
    harness.beginChatInput.mockRejectedValueOnce(new Error("Entry denied"))
    await act(async () => buttonById(container, "player-chat-enter").click())
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
    expect(document.activeElement).toBe(buttonById(container, "player-chat"))
    expect(chatFrame(container).tabIndex).toBe(-1)
    expect(harness.chatNotifications.size).toBe(0)
    await act(async () => root.unmount())
  })

  it("keeps native gamepad shell keys out of playback and lets B exit chat without going Home", async () => {
    const harness = installPlayerHarness([])
    const { container, root } = await mountNavigablePlayer()
    await act(async () => buttonById(container, "player-chat").click())
    await act(async () => buttonById(container, "player-chat-enter").click())
    for (const key of ["ArrowLeft", "ArrowDown", "Enter", "F10", "/"]) {
      await pressKey(container, key)
      expect(document.activeElement).toBe(chatFrame(container))
    }
    await pressKey(container, "Escape")
    expect(document.activeElement).toBe(buttonById(container, "player-chat"))
    expect(chatFrame(container).tabIndex).toBe(-1)
    expect(harness.chatContents.listenerCount("before-input-event")).toBe(0)
    await act(async () => root.unmount())
  })

  it.each([source, videoSource])(
    "starts hidden with live-only chat controls for $kind",
    async (playerSource) => {
      installPlayerHarness([])
      const { container, root } = await mountPlayer(playerSource)
      const toggle = container.querySelector('[data-focus-id="player-chat"]')
      expect(toggle !== null).toBe(playerSource.kind === "live")
      if (toggle !== null) expect(toggle.getAttribute("aria-expanded")).toBe("false")
      expect(container.querySelector('[data-focus-id="player-chat-enter"]')).toBeNull()
      expect(container.querySelector('[data-focus-id="player-chat-reload"]')).toBeNull()
      expect(container.querySelector(".player-chat")).toBeNull()
      expect(container.querySelectorAll("iframe")).toHaveLength(1)
      expect(buttonById(container, "player-vods").getAttribute("data-focus-right")).toBe(
        playerSource.kind === "live" ? "player-chat" : "player-fullscreen",
      )
      expect(buttonById(container, "player-fullscreen").getAttribute("data-focus-left")).toBe(
        playerSource.kind === "live" ? "player-chat" : "player-vods",
      )
      await act(async () => root.unmount())
    },
  )

  it.each([
    ["twitch", "twitch"],
    ["room/name?x=1&token=secret", "room%2Fname%3Fx%3D1%26token%3Dsecret"],
  ])(
    "embeds only the encoded live login %s with the documented parent",
    async (channel, encoded) => {
      const harness = installPlayerHarness([])
      const { container, root } = await mountPlayer({ ...source, channel })
      await act(async () => buttonById(container, "player-chat").click())
      const frames = container.querySelectorAll<HTMLIFrameElement>(".player-chat iframe")
      expect(frames).toHaveLength(1)
      const frame = frames[0]
      if (frame === undefined) throw new Error("Missing chat iframe")
      expect(frame.src).toBe(`https://www.twitch.tv/embed/${encoded}/chat?parent=localhost`)
      expect([...new URL(frame.src).searchParams]).toEqual([["parent", "localhost"]])
      expect(frame.tabIndex).toBe(-1)
      expect(frame.hasAttribute("data-focusable")).toBe(false)
      expect(frame.title).toBe(`Live chat for ${channel}`)
      expect(container.querySelectorAll("iframe")).toHaveLength(2)
      expect(container.querySelector(".player-frame .player-chat")).toBeNull()
      expect(container.querySelector(".player-stage > .player-chat")).not.toBeNull()
      expect(container.querySelector(".player-stage button")).toBeNull()
      await act(async () => frame.dispatchEvent(new Event("load")))
      expect(container.querySelector(".player-frame")?.getAttribute("aria-busy")).toBe("true")
      expect(buttonById(container, "player-chat").disabled).toBe(false)
      expect(buttonById(container, "player-chat-reload").disabled).toBe(false)
      expect(harness.activateEmbeddedPlayer).not.toHaveBeenCalled()
      await act(async () => root.unmount())
    },
  )

  it.each(["loading", "ready", "offline"] as const)(
    "walks every rendered toolbar control left and right, with chat actions on Down, while %s",
    async (state) => {
      const harness = installPlayerHarness([true])
      const { container, root } = await mountNavigablePlayer()
      if (state !== "loading") await act(async () => harness.emit("ready"))
      if (state === "offline") await act(async () => harness.emit("offline"))
      const expectFocus = (id: string): void => {
        expect(document.activeElement).toBe(buttonById(container, id))
        expect(document.activeElement?.tagName).toBe("BUTTON")
        expect(container.querySelector(".player-stage")?.contains(document.activeElement)).toBe(
          false,
        )
      }
      const move = async (key: string, id: string): Promise<void> => {
        await pressKey(container, key)
        expectFocus(id)
      }
      expectFocus("player-back")
      const route =
        state === "ready"
          ? [
              "player-playback",
              "player-muted",
              "player-quality",
              "player-captions",
              "player-vods",
              "player-chat",
            ]
          : ["player-quality", "player-captions", "player-vods", "player-chat"]
      for (const id of route) await move("ArrowRight", id)
      await move("Enter", "player-chat")
      expect(buttonById(container, "player-chat").getAttribute("aria-expanded")).toBe("true")
      for (const id of ["player-chat", "player-chat-enter", "player-chat-reload"]) {
        const button = buttonById(container, id)
        expect(button.disabled).toBe(false)
        expect(button.getAttribute("data-focusable")).toBe("true")
        for (const direction of ["down", "left", "right", "up"]) {
          expect(button.hasAttribute(`data-focus-${direction}`)).toBe(true)
        }
      }
      const toolbar = [
        "player-back",
        ...route,
        "player-chat-enter",
        "player-chat-reload",
        "player-fullscreen",
      ]
      buttonById(container, "player-back").focus()
      for (const id of toolbar.slice(1)) await move("ArrowRight", id)
      for (const id of toolbar.slice(0, -1).reverse()) await move("ArrowLeft", id)
      for (const id of route) await move("ArrowRight", id)
      const oldFrame = container.querySelector(".player-chat iframe")
      await move("ArrowDown", "player-chat-enter")
      await move("ArrowDown", "player-chat-reload")
      await move("Enter", "player-chat-reload")
      expect(container.querySelectorAll(".player-chat iframe")).toHaveLength(1)
      expect(container.querySelector(".player-chat iframe")).not.toBe(oldFrame)
      await move("ArrowDown", "player-chat-reload")
      await move("ArrowRight", "player-fullscreen")
      await move("ArrowLeft", "player-chat-reload")
      await move("ArrowLeft", "player-chat-enter")
      await move("ArrowLeft", "player-chat")
      await move("ArrowLeft", "player-vods")
      await move("ArrowRight", "player-chat")
      await move("ArrowDown", "player-chat-enter")
      await move("ArrowDown", "player-chat-reload")
      await move("ArrowUp", "player-chat")
      await move("Enter", "player-chat")
      expect(container.querySelector(".player-chat")).toBeNull()
      expect(container.querySelector('[data-focus-id="player-chat-reload"]')).toBeNull()
      expect(buttonById(container, "player-chat").getAttribute("aria-expanded")).toBe("false")
      await move("ArrowDown", "player-chat")
      await move("ArrowRight", "player-fullscreen")
      await move("ArrowLeft", "player-chat")
      await move("ArrowUp", "player-back")
      await act(async () => root.unmount())
    },
  )

  it.each(["loading", "ready", "offline"] as const)(
    "isolates showing, entering, using, exiting, hiding and reloading chat from the %s player",
    async (state) => {
      const harness = installPlayerHarness([true])
      const { container, root } = await mountPlayer(source)
      if (state !== "loading") await act(async () => harness.emit("ready"))
      if (state === "offline") await act(async () => harness.emit("offline"))
      const player = harness.instances[0]
      const playerRoot = container.querySelector("#twitch-player-root")
      const playerFrame = playerRoot?.querySelector("iframe")
      expect(player).toBeDefined()
      expect(playerRoot).not.toBeNull()
      expect(playerFrame).not.toBeNull()
      const calls = [
        harness.activateEmbeddedPlayer,
        harness.play,
        harness.pause,
        harness.setMuted,
        harness.seek,
        harness.setQuality,
      ].map((mock) => ({ count: mock.mock.calls.length, mock }))
      const expectUnchangedPlayer = (): void => {
        expect(harness.instances).toEqual([player])
        expect(harness.instances[0]).toBe(player)
        expect(harness.constructed).toHaveBeenCalledTimes(1)
        expect(container.querySelector("#twitch-player-root")).toBe(playerRoot)
        expect(playerRoot?.querySelector("iframe")).toBe(playerFrame)
        for (const { count, mock } of calls) expect(mock).toHaveBeenCalledTimes(count)
      }
      await act(async () => buttonById(container, "player-chat").click())
      expectUnchangedPlayer()
      const pane = container.querySelector(".player-chat")
      const firstFrame = pane?.querySelector("iframe")
      await act(async () => buttonById(container, "player-chat-enter").click())
      expect(document.activeElement).toBe(firstFrame)
      expectUnchangedPlayer()
      // Frame-local events cannot bubble into the shell; the player has no chat listeners.
      firstFrame?.contentDocument?.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }))
      firstFrame?.contentDocument?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }))
      expectUnchangedPlayer()
      await act(async () => {
        harness.chatKey("keyDown")
        harness.chatKey("keyUp")
      })
      expectUnchangedPlayer()
      await act(async () => buttonById(container, "player-chat-reload").click())
      expectUnchangedPlayer()
      expect(container.querySelector(".player-chat")).toBe(pane)
      expect(pane?.querySelector("iframe")).not.toBe(firstFrame)
      await act(async () => buttonById(container, "player-chat").click())
      expectUnchangedPlayer()
      expect(container.querySelector(".player-chat iframe")).toBeNull()
      await act(async () => buttonById(container, "player-chat").click())
      expectUnchangedPlayer()
      expect(container.querySelectorAll(".player-chat iframe")).toHaveLength(1)
      await act(async () => root.unmount())
    },
  )

  it("keeps visible chat and its shell controls usable when playback goes offline", async () => {
    const harness = installPlayerHarness([true])
    const { container, root } = await mountNavigablePlayer()
    await act(async () => harness.emit("ready"))
    await act(async () => buttonById(container, "player-chat").click())
    await pressKey(container, "ArrowDown")
    expect(document.activeElement).toBe(buttonById(container, "player-chat-enter"))
    await pressKey(container, "ArrowDown")
    const frame = container.querySelector(".player-chat iframe")
    await act(async () => harness.emit("offline"))
    expect(container.querySelector(".player-chat iframe")).toBe(frame)
    expect(document.activeElement).toBe(buttonById(container, "player-chat-reload"))
    await pressKey(container, "Enter")
    expect(container.querySelector(".player-chat iframe")).not.toBe(frame)
    expect(document.activeElement).toBe(buttonById(container, "player-chat-reload"))
    await pressKey(container, "ArrowUp")
    await pressKey(container, "Enter")
    expect(container.querySelector(".player-chat")).toBeNull()
    expect(document.activeElement).toBe(buttonById(container, "player-chat"))
    await act(async () => root.unmount())
  })

  it("discards chat across source changes, recovers shell focus and ignores late iframe loads", async () => {
    installPlayerHarness([])
    const { container, root } = await mountPlayer(source)
    await act(async () => buttonById(container, "player-chat").click())
    const oldFrame = container.querySelector(".player-chat iframe")
    if (oldFrame === null) throw new Error("Missing old chat iframe")
    buttonById(container, "player-chat-reload").focus()
    const nextSource = { ...source, channel: "other_channel" }
    await act(async () => root.render(playerView(nextSource)))
    expect(oldFrame.isConnected).toBe(false)
    expect(container.querySelector(".player-chat")).toBeNull()
    expect(document.activeElement).toBe(buttonById(container, "player-chat"))
    await act(async () => oldFrame.dispatchEvent(new Event("load")))
    expect(container.querySelector(".player-chat")).toBeNull()
    await act(async () => buttonById(container, "player-chat").click())
    const nextFrame = container.querySelector<HTMLIFrameElement>(".player-chat iframe")
    if (nextFrame === null) throw new Error("Missing replacement chat iframe")
    expect(nextFrame.src).toBe("https://www.twitch.tv/embed/other_channel/chat?parent=localhost")
    await act(async () => oldFrame.dispatchEvent(new Event("load")))
    expect(container.querySelectorAll(".player-chat iframe")).toHaveLength(1)
    expect(container.querySelector(".player-chat iframe")).toBe(nextFrame)
    buttonById(container, "player-chat-reload").focus()
    await act(async () => root.render(playerView(videoSource)))
    expect(container.querySelector(".player-chat")).toBeNull()
    expect(container.querySelector('[data-focus-id="player-chat"]')).toBeNull()
    expect(container.querySelector('[data-focus-id="player-chat-reload"]')).toBeNull()
    expect(document.activeElement).toBe(buttonById(container, "player-back"))
    await act(async () => {
      oldFrame.dispatchEvent(new Event("load"))
      nextFrame.dispatchEvent(new Event("load"))
    })
    expect(container.querySelector(".player-chat")).toBeNull()
    await act(async () => root.render(playerView(source)))
    expect(buttonById(container, "player-chat").getAttribute("aria-expanded")).toBe("false")
    expect(container.querySelector(".player-chat")).toBeNull()
    await act(async () => buttonById(container, "player-chat").click())
    const hiddenFrame = container.querySelector(".player-chat iframe")
    if (hiddenFrame === null) throw new Error("Missing chat before hiding")
    await act(async () => buttonById(container, "player-chat").click())
    await act(async () => hiddenFrame.dispatchEvent(new Event("load")))
    expect(container.querySelector(".player-chat")).toBeNull()
    // Replacing the source with the same login still resets the mounted player's chat state.
    await act(async () => buttonById(container, "player-chat").click())
    await act(async () => root.render(playerView({ ...source })))
    expect(container.querySelector(".player-chat")).toBeNull()
    await act(async () => root.unmount())
    await act(async () => hiddenFrame.dispatchEvent(new Event("load")))
    expect(container.childElementCount).toBe(0)
  })

  it.each(["loading", "ready", "offline"] as const)(
    "preserves Escape to Home from chat through the real app controller while %s",
    async (state) => {
      const harness = installPlayerHarness([true])
      installNavigationSurface()
      const container = document.createElement("div")
      document.body.append(container)
      const root = createRoot(container)
      await act(async () => root.render(<App />))
      await act(async () => buttonById(container, "stream-preview-twitch").click())
      if (state !== "loading") await act(async () => harness.emit("ready"))
      if (state === "offline") await act(async () => harness.emit("offline"))
      const route = state === "ready" ? 6 : 4
      for (let index = 0; index < route; index += 1) await pressKey(container, "ArrowRight")
      expect(document.activeElement).toBe(buttonById(container, "player-chat"))
      await pressKey(container, "Enter")
      await pressKey(container, "ArrowDown")
      expect(document.activeElement).toBe(buttonById(container, "player-chat-enter"))
      await pressKey(container, "ArrowDown")
      expect(document.activeElement).toBe(buttonById(container, "player-chat-reload"))
      await pressKey(container, "Escape")
      expect(container.querySelector(".player-view")).toBeNull()
      expect(container.querySelector(".player-chat")).toBeNull()
      expect(container.querySelector(".browse-view")).not.toBeNull()
      expect(document.activeElement).toBe(buttonById(container, "nav-home"))
      expect(harness.restoreShellFullscreen).toHaveBeenCalledTimes(1)
      await act(async () => root.unmount())
    },
  )
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
      "player-captions",
      "player-vods",
      "player-chat",
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
