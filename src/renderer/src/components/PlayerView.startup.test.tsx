// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { PlaybackBookmark, VacuumStreamApi } from "../../../shared/contracts"
import { dispatchControllerKey, useControllerNavigation } from "../focus-navigation"
import type { TwitchPlayerOptions } from "../twitch-player"
import type { PlayerSource } from "./PlayerView"

const liveSource = { channel: "twitch", kind: "live", title: "Live", userId: "1" } as const
const videoSource = { kind: "video", title: "Recording", userId: "1", videoId: "42" } as const
const bookmark: PlaybackBookmark = {
  duration: 10_800,
  position: 3900,
  updatedAt: 1_700_000_000_000,
  videoId: "42",
}
const roots = new Set<Root>()
let PlayerView: typeof import("./PlayerView")["PlayerView"]
let twitchPlayer: typeof import("../twitch-player")

const buttonById = (id: string): HTMLButtonElement => {
  const button = document.querySelector<HTMLButtonElement>(`[data-focus-id="${id}"]`)
  if (button === null) throw new Error(`Missing button: ${id}`)
  return button
}

const pressKey = async (key: string): Promise<void> => {
  for (const button of document.querySelectorAll("button")) button.scrollIntoView = vi.fn()
  await act(async () => dispatchControllerKey(key))
}

const currentScript = (): HTMLScriptElement => {
  const script = document.head.querySelector<HTMLScriptElement>(
    'script[src="https://player.twitch.tv/js/embed/v1.js"]',
  )
  if (script === null) throw new Error("Missing SDK request")
  return script
}

const controlledPromise = <T,>() => {
  let accept: (value: T) => void = () => {
    throw new Error("Promise executor has not run")
  }
  let fail: (cause: Error) => void = () => {
    throw new Error("Promise executor has not run")
  }
  const promise = new Promise<T>((resolve, reject) => {
    accept = resolve
    fail = reject
  })
  return { promise, reject: fail, resolve: accept }
}

const installHarness = (saved?: PlaybackBookmark) => {
  const requests = vi.spyOn(document.head, "append")
  const constructed = vi.fn<(elementId: string, options: TwitchPlayerOptions) => void>()
  const listeners = new Map<string, () => void>()
  const progress = {
    get: vi.fn<VacuumStreamApi["playbackProgress"]["get"]>(async () => saved),
    list: vi.fn<VacuumStreamApi["playbackProgress"]["list"]>(async () => []),
    remove: vi.fn<VacuumStreamApi["playbackProgress"]["remove"]>(async () => undefined),
    save: vi.fn<VacuumStreamApi["playbackProgress"]["save"]>(async () => undefined),
  }
  const activateEmbeddedPlayer = vi.fn(async () => true)
  const restoreShellFullscreen = vi.fn(async () => undefined)
  Object.defineProperty(window, "vacuumStream", {
    configurable: true,
    value: {
      auth: { snapshot: async () => ({ kind: "guest" }) },
      favourites: {
        add: vi.fn<VacuumStreamApi["favourites"]["add"]>().mockResolvedValue([]),
        list: vi.fn<VacuumStreamApi["favourites"]["list"]>().mockResolvedValue([]),
        remove: vi.fn<VacuumStreamApi["favourites"]["remove"]>().mockResolvedValue([]),
      },
      playbackProgress: progress,
      settings: { snapshot: async () => ({ clientId: "client", secureStorage: false }) },
      system: { activateEmbeddedPlayer, restoreShellFullscreen },
    },
  })
  // Publish this SDK only when a simulated script download (or controlled startup) succeeds.
  const publishApi = () => {
    class TestPlayer {
      static readonly OFFLINE = "offline"
      static readonly ONLINE = "online"
      static readonly PAUSE = "pause"
      static readonly PLAY = "play"
      static readonly PLAYBACK_BLOCKED = "blocked"
      static readonly PLAYING = "playing"
      static readonly READY = "ready"
      static readonly SEEK = "seek"
      constructor(elementId: string, options: TwitchPlayerOptions) {
        constructed(elementId, options)
        document.getElementById(elementId)?.append(document.createElement("iframe"))
      }
      readonly addEventListener = (event: string, listener: () => void): void => {
        listeners.set(event, listener)
      }
      readonly disableCaptions = vi.fn()
      readonly enableCaptions = vi.fn()
      readonly getCurrentTime = vi.fn(() => 3900)
      readonly getDuration = vi.fn(() => 10_800)
      readonly getMuted = vi.fn(() => true)
      readonly getQualities = vi.fn(() => [])
      readonly getQuality = vi.fn(() => "")
      readonly isPaused = vi.fn(() => true)
      readonly pause = vi.fn()
      readonly play = vi.fn()
      readonly seek = vi.fn()
      readonly setMuted = vi.fn()
      readonly setQuality = vi.fn()
    }
    const api = { Player: TestPlayer }
    Object.defineProperty(window, "Twitch", { configurable: true, value: api })
    return api
  }
  const emit = (event: "ready" | "offline" | "playing" | "pause" | "seek"): void => {
    const listener = listeners.get(event)
    if (listener === undefined) throw new Error(`Missing player listener: ${event}`)
    listener()
  }
  return { activateEmbeddedPlayer, constructed, emit, progress, publishApi, requests }
}

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

const mountPlayer = async (source: PlayerSource = liveSource) => {
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  roots.add(root)
  const onBack = vi.fn()
  await act(async () => root.render(<NavigablePlayer onBack={onBack} source={source} />))
  return { container, onBack, root }
}

beforeEach(async () => {
  vi.useFakeTimers()
  vi.resetModules()
  delete window.Twitch
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.stubGlobal("matchMedia", () => ({ matches: true }))
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1),
  )
  vi.stubGlobal("cancelAnimationFrame", vi.fn())
  vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockReturnValue(document.body)
  twitchPlayer = await import("../twitch-player")
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

describe("controller player startup recovery", () => {
  it.each([
    { choice: "live", source: liveSource },
    { choice: "resume", source: videoSource },
    { choice: "start", source: videoSource },
  ] as const)(
    "retries the real failed loader once through Back -> Retry and preserves the $choice source choice",
    async ({ choice, source }) => {
      const harness = installHarness(choice === "live" ? undefined : bookmark)
      const { container, onBack } = await mountPlayer(source)
      if (choice !== "live") {
        expect(harness.requests).not.toHaveBeenCalled()
        if (choice === "start") await pressKey("ArrowRight")
        await pressKey("Enter")
      }
      expect(harness.requests).toHaveBeenCalledTimes(1)
      const failedScript = currentScript()
      await act(async () => failedScript.dispatchEvent(new Event("error")))
      expect(failedScript.isConnected).toBe(false)
      expect(harness.constructed).not.toHaveBeenCalled()
      const retry = buttonById("player-retry")
      expect(retry.getAttribute("data-focusable")).toBe("true")
      expect(container.querySelector(".player-stage")?.contains(retry)).toBe(false)
      expect(container.querySelector(".player-stage [role=alert]")).toBeNull()
      expect(container.querySelector(".player-load-status[role=alert]")).not.toBeNull()
      expect(document.activeElement).toBe(buttonById("player-back"))
      await pressKey("ArrowRight")
      expect(document.activeElement).toBe(retry)
      for (const key of ["ArrowLeft", "ArrowUp", "ArrowDown"]) {
        await pressKey(key)
        expect(document.activeElement).toBe(buttonById("player-back"))
        await pressKey("ArrowRight")
        expect(document.activeElement).toBe(retry)
      }
      await pressKey("ArrowRight")
      expect(document.activeElement).toBe(buttonById("player-quality"))
      await pressKey("ArrowLeft")
      expect(document.activeElement).toBe(retry)
      const rescued = vi.fn()
      buttonById("player-back").addEventListener("focus", () =>
        rescued({ connected: retry.isConnected, disabled: retry.disabled }),
      )
      // Re-entrant activation in the same event turn must not queue two initializations.
      await act(async () => {
        dispatchControllerKey("Enter")
        retry.click()
        retry.click()
      })
      expect(rescued).toHaveBeenCalledExactlyOnceWith({ connected: true, disabled: false })
      expect(document.activeElement).toBe(buttonById("player-back"))
      expect(document.activeElement?.getAttribute("data-controller-focused")).toBe("true")
      expect(container.querySelector(".player-retry")).toBeNull()
      expect(container.querySelector(".player-frame")?.getAttribute("aria-busy")).toBe("true")
      expect(container.querySelector(".video-resume")).toBeNull()
      expect(harness.requests).toHaveBeenCalledTimes(2)
      await act(async () => retry.click())
      expect(harness.requests).toHaveBeenCalledTimes(2)
      expect(onBack).not.toHaveBeenCalled()
      const replacementScript = currentScript()
      await act(async () => {
        failedScript.dispatchEvent(new Event("load"))
        failedScript.dispatchEvent(new Event("error"))
        harness.publishApi()
        replacementScript.dispatchEvent(new Event("load"))
      })
      expect(harness.constructed).toHaveBeenCalledExactlyOnceWith("twitch-player-root", {
        autoplay: true,
        ...(source.kind === "live" ? { channel: source.channel } : {}),
        height: "100%",
        muted: true,
        parent: ["localhost"],
        ...(choice === "resume" ? { time: "1h5m0s" } : {}),
        ...(source.kind === "video" ? { video: source.videoId } : {}),
        width: "100%",
      })
      expect(harness.progress.get).toHaveBeenCalledTimes(choice === "live" ? 0 : 1)
      expect(harness.progress.remove).toHaveBeenCalledTimes(choice === "start" ? 1 : 0)
      expect(harness.progress.save).not.toHaveBeenCalled()
      expect(harness.requests).toHaveBeenCalledTimes(2)
      expect(harness.activateEmbeddedPlayer).not.toHaveBeenCalled()
    },
  )

  it("retries a constructor failure with the cached SDK and saves no pre-READY VOD progress", async () => {
    const harness = installHarness(bookmark)
    const { container, root } = await mountPlayer(videoSource)
    await pressKey("Enter")
    harness.constructed.mockImplementationOnce(() => {
      throw new Error("SDK constructor failed")
    })
    await act(async () => {
      harness.publishApi()
      currentScript().dispatchEvent(new Event("load"))
    })
    expect(harness.constructed).toHaveBeenCalledTimes(1)
    await pressKey("ArrowRight")
    await pressKey("Enter")
    expect(harness.constructed).toHaveBeenCalledTimes(2)
    expect(harness.constructed.mock.calls.map(([, options]) => options.time)).toEqual([
      "1h5m0s",
      "1h5m0s",
    ])
    expect(harness.requests).toHaveBeenCalledTimes(1)
    expect(harness.progress.get).toHaveBeenCalledExactlyOnceWith("42")
    expect(container.querySelector(".video-resume")).toBeNull()
    await act(async () => root.unmount())
    roots.delete(root)
    expect(harness.progress.save).not.toHaveBeenCalled()
    expect(harness.progress.remove).not.toHaveBeenCalled()
  })

  it.each([liveSource, videoSource])(
    "keeps READY then OFFLINE distinct from startup failure for $kind without reloading or reconstructing",
    async (source) => {
      const harness = installHarness()
      const { container } = await mountPlayer(source)
      await act(async () => {
        harness.publishApi()
        currentScript().dispatchEvent(new Event("load"))
      })
      await act(async () => harness.emit("ready"))
      const frame = container.querySelector("iframe")
      expect(frame).not.toBeNull()
      const scheduleTimeout = vi.spyOn(globalThis, "setTimeout")
      const scheduleInterval = vi.spyOn(globalThis, "setInterval")
      const timersBeforeOffline = vi.getTimerCount()
      await act(async () => harness.emit("offline"))
      expect(scheduleTimeout).not.toHaveBeenCalled()
      expect(scheduleInterval).not.toHaveBeenCalled()
      // OFFLINE stops the VOD sampler; jsdom's queued focus/selection events are unrelated.
      expect(vi.getTimerCount()).toBe(timersBeforeOffline - (source.kind === "video" ? 1 : 0))
      expect(container.querySelector(".player-load-status[role=alert]")).not.toBeNull()
      expect(container.querySelector(".player-stage [role=alert]")).toBeNull()
      expect(container.querySelector(".player-retry")).toBeNull()
      expect(buttonById("player-playback").disabled).toBe(true)
      await pressKey("ArrowRight")
      expect(document.activeElement).toBe(buttonById("player-quality"))
      await pressKey("ArrowLeft")
      expect(document.activeElement).toBe(buttonById("player-back"))
      expect(container.querySelector("iframe")).toBe(frame)
      expect(harness.constructed).toHaveBeenCalledTimes(1)
      expect(harness.requests).toHaveBeenCalledTimes(1)
    },
  )
})

describe("startup attempt lifecycle", () => {
  it.each([
    { departure: "Back", outcome: "resolve" },
    { departure: "Back", outcome: "reject" },
    { departure: "unmount", outcome: "resolve" },
    { departure: "unmount", outcome: "reject" },
    { departure: "source replacement", outcome: "resolve" },
    { departure: "source replacement", outcome: "reject" },
  ] as const)(
    "ignores a controlled startup $outcome after $departure without stale players, errors or focus theft",
    async ({ departure, outcome }) => {
      const harness = installHarness()
      const old = controlledPromise<NonNullable<Window["Twitch"]>>()
      const next = controlledPromise<NonNullable<Window["Twitch"]>>()
      const load = vi
        .spyOn(twitchPlayer, "loadTwitchPlayerApi")
        .mockReturnValueOnce(old.promise)
        .mockReturnValueOnce(next.promise)
      const container = document.createElement("div")
      document.body.append(container)
      const root = createRoot(container)
      roots.add(root)
      const onBack = vi.fn()
      if (departure === "Back") {
        // Exercise the actual App's Back route rather than a no-op callback.
        const { App } = await import("../App")
        await act(async () => root.render(<App />))
        await act(async () => buttonById("stream-preview-twitch").click())
      } else {
        await act(async () => root.render(<NavigablePlayer onBack={onBack} source={liveSource} />))
      }
      expect(load).toHaveBeenCalledTimes(1)
      if (departure === "Back") {
        await pressKey("Enter")
        expect(container.querySelector(".browse-view")).not.toBeNull()
        expect(document.activeElement).toBe(buttonById("nav-home"))
      } else if (departure === "unmount") {
        await act(async () => root.unmount())
        roots.delete(root)
        const destination = document.createElement("button")
        document.body.append(destination)
        destination.focus()
      } else {
        await act(async () =>
          root.render(
            <NavigablePlayer onBack={onBack} source={{ ...liveSource, channel: "replacement" }} />,
          ),
        )
        await act(async () => next.resolve(harness.publishApi()))
        await act(async () => harness.emit("ready"))
        expect(harness.constructed).toHaveBeenCalledExactlyOnceWith(
          "twitch-player-root",
          expect.objectContaining({ channel: "replacement" }),
        )
        buttonById("player-fullscreen").focus()
      }
      const focused = document.activeElement
      const markup = container.innerHTML
      const constructors = harness.constructed.mock.calls.length
      expect(constructors).toBe(departure === "source replacement" ? 1 : 0)
      expect(load).toHaveBeenCalledTimes(departure === "source replacement" ? 2 : 1)
      await act(async () => {
        if (outcome === "resolve") old.resolve(harness.publishApi())
        else old.reject(new Error("Late startup failure"))
      })
      expect(harness.constructed).toHaveBeenCalledTimes(constructors)
      expect(container.innerHTML).toBe(markup)
      expect(container.querySelector("[role=alert]")).toBeNull()
      expect(document.activeElement).toBe(focused)
      expect(harness.progress.save).not.toHaveBeenCalled()
    },
  )

  it("leaves a failed pre-READY VOD download without saving or clearing its selected bookmark", async () => {
    const harness = installHarness(bookmark)
    const { root } = await mountPlayer(videoSource)
    await pressKey("Enter")
    await act(async () => currentScript().dispatchEvent(new Event("error")))
    expect(buttonById("player-retry").disabled).toBe(false)
    await act(async () => root.unmount())
    roots.delete(root)
    expect(harness.constructed).not.toHaveBeenCalled()
    expect(harness.progress.save).not.toHaveBeenCalled()
    expect(harness.progress.remove).not.toHaveBeenCalled()
  })
})
