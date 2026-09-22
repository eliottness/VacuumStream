// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { AuthSnapshot, PlaybackBookmark, VacuumStreamApi } from "../../shared/contracts"
import { App } from "./App"
import { dispatchControllerKey } from "./focus-navigation"
import type { TwitchPlayerOptions } from "./twitch-player"
import * as controllerModule from "./useAppController"

const bookmark = (videoId: string, updatedAt = 1): PlaybackBookmark => ({
  details: { title: `Saved ${videoId}`, userId: "broadcaster" },
  duration: 10_800,
  position: 3900,
  updatedAt,
  videoId,
})
const deferred = <T,>() => {
  let accept: (value: T) => void = () => {
    throw new Error("Missing resolver")
  }
  let fail: (error: Error) => void = () => {
    throw new Error("Missing rejecter")
  }
  const promise = new Promise<T>((resolve, reject) => {
    accept = resolve
    fail = reject
  })
  return { promise, reject: fail, resolve: accept }
}
const makeBridge = (items: readonly PlaybackBookmark[], auth: AuthSnapshot) => {
  const bookmarks = new Map(items.map((item) => [item.videoId, item]))
  const bridge = {
    auth: {
      begin: vi.fn<VacuumStreamApi["auth"]["begin"]>(),
      logout: vi.fn<VacuumStreamApi["auth"]["logout"]>(),
      openActivation: vi.fn<VacuumStreamApi["auth"]["openActivation"]>(),
      snapshot: vi.fn<VacuumStreamApi["auth"]["snapshot"]>().mockResolvedValue(auth),
    },
    catalog: {
      followed: vi.fn<VacuumStreamApi["catalog"]["followed"]>(),
      followedChannels: vi.fn<VacuumStreamApi["catalog"]["followedChannels"]>(),
      live: vi
        .fn<VacuumStreamApi["catalog"]["live"]>()
        .mockResolvedValue({ cursor: undefined, items: [] }),
      search: vi.fn<VacuumStreamApi["catalog"]["search"]>(),
      topCategories: vi
        .fn<VacuumStreamApi["catalog"]["topCategories"]>()
        .mockResolvedValue({ cursor: undefined, items: [] }),
      videos: vi.fn<VacuumStreamApi["catalog"]["videos"]>(),
    },
    chatInput: {
      begin: vi.fn<VacuumStreamApi["chatInput"]["begin"]>(),
      end: vi.fn<VacuumStreamApi["chatInput"]["end"]>().mockResolvedValue(undefined),
      onEscape: vi.fn<VacuumStreamApi["chatInput"]["onEscape"]>().mockReturnValue(() => undefined),
    },
    playbackProgress: {
      get: vi.fn<VacuumStreamApi["playbackProgress"]["get"]>(async (id) => bookmarks.get(id)),
      list: vi.fn<VacuumStreamApi["playbackProgress"]["list"]>(async () =>
        [...bookmarks.values()].sort(
          (a, b) => b.updatedAt - a.updatedAt || a.videoId.localeCompare(b.videoId),
        ),
      ),
      remove: vi.fn<VacuumStreamApi["playbackProgress"]["remove"]>(async (id) => {
        bookmarks.delete(id)
      }),
      save: vi.fn<VacuumStreamApi["playbackProgress"]["save"]>(async (item) => {
        bookmarks.set(item.videoId, item)
      }),
    },
    settings: {
      saveClientId: vi.fn<VacuumStreamApi["settings"]["saveClientId"]>(),
      snapshot: vi
        .fn<VacuumStreamApi["settings"]["snapshot"]>()
        .mockResolvedValue({ clientId: "client", secureStorage: false }),
    },
    system: {
      activateEmbeddedPlayer: vi
        .fn<VacuumStreamApi["system"]["activateEmbeddedPlayer"]>()
        .mockResolvedValue(true),
      isSteamGameMode: vi.fn<VacuumStreamApi["system"]["isSteamGameMode"]>(),
      restoreShellFullscreen: vi
        .fn<VacuumStreamApi["system"]["restoreShellFullscreen"]>()
        .mockResolvedValue(false),
      toggleFullscreen: vi.fn<VacuumStreamApi["system"]["toggleFullscreen"]>(),
    },
  } satisfies VacuumStreamApi
  return { bookmarks, bridge }
}
type Bridge = ReturnType<typeof makeBridge>["bridge"]
let root: Root | undefined
let container: HTMLDivElement
let observed: ReturnType<typeof controllerModule.useAppController> | undefined
const realController = controllerModule.useAppController
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(1_700_000_000_000)
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1),
  )
  vi.stubGlobal("cancelAnimationFrame", vi.fn())
  vi.stubGlobal("matchMedia", () => ({ matches: false }))
  vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockReturnValue(document.body)
  vi.spyOn(controllerModule, "useAppController").mockImplementation(() => {
    observed = realController()
    return observed
  })
  container = document.createElement("div")
  document.body.append(container)
})
afterEach(async () => {
  await act(async () => root?.unmount())
  root = undefined
  observed = undefined
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
const controller = () => {
  if (observed === undefined) throw new Error("App not mounted")
  return observed
}
const button = (id: string): HTMLButtonElement => {
  const element = container.querySelector<HTMLButtonElement>(`[data-focus-id="${id}"]`)
  if (element === null) throw new Error(`Missing ${id}`)
  return element
}
const key = async (value: string) => {
  for (const element of container.querySelectorAll<HTMLElement>("[data-focusable]"))
    element.scrollIntoView = vi.fn()
  await act(async () => dispatchControllerKey(value))
}
const activate = async (id: string) => {
  button(id).focus()
  await key("Enter")
}
const ids = () =>
  [...container.querySelectorAll(".continue-card__open")].map((element) =>
    element.getAttribute("data-focus-id"),
  )
const mount = async (
  items: readonly PlaybackBookmark[] = [bookmark("a")],
  configure: (bridge: Bridge) => void = () => undefined,
  auth: AuthSnapshot = { kind: "guest" },
) => {
  const store = makeBridge(items, auth)
  configure(store.bridge)
  vi.stubGlobal("vacuumStream", store.bridge)
  const timeline = { duration: 10_800, position: 3900 }
  const listeners = new Map<string, () => void>()
  const constructed = vi.fn<(id: string, options: TwitchPlayerOptions) => void>()
  class TestPlayer {
    static readonly OFFLINE = "offline"
    static readonly PAUSE = "pause"
    static readonly PLAY = "play"
    static readonly PLAYBACK_BLOCKED = "blocked"
    static readonly PLAYING = "playing"
    static readonly READY = "ready"
    static readonly SEEK = "seek"
    constructor(id: string, options: TwitchPlayerOptions) {
      constructed(id, options)
    }
    readonly addEventListener = (event: string, listener: () => void) => {
      listeners.set(event, listener)
    }
    readonly disableCaptions = vi.fn()
    readonly enableCaptions = vi.fn()
    readonly getCurrentTime = () => timeline.position
    readonly getDuration = () => timeline.duration
    readonly getMuted = () => false
    readonly getQualities = () => []
    readonly getQuality = () => ""
    readonly isPaused = () => true
    readonly pause = () => undefined
    readonly setMuted = () => undefined
  }
  vi.stubGlobal("Twitch", { Player: TestPlayer })
  root = createRoot(container)
  await act(async () => root?.render(<App />))
  const emit = (event: string) => {
    const listener = listeners.get(event)
    if (listener === undefined) throw new Error(`No listener for ${event}`)
    listener()
  }
  return { ...store, constructed, emit, timeline }
}

describe("Continue Watching in Home", () => {
  it("shows the newest ten of twelve bookmarks for a guest, including a legacy id, without discovery or authorization", async () => {
    const items = Array.from({ length: 12 }, (_, index) => bookmark(String(index + 1), index + 1))
    items[10] = { duration: 100, position: 100, updatedAt: 11, videoId: "11" }
    const { bridge } = await mount(items)
    expect(ids()).toEqual(Array.from({ length: 10 }, (_, index) => `continue-${12 - index}-open`))
    expect(button("continue-11-open").getAttribute("aria-label")).toContain("11")
    expect(container.querySelectorAll(".continue-watching img")).toHaveLength(0)
    const shelves = [...container.querySelectorAll(".shelf")]
    expect(shelves[0]?.classList.contains("continue-watching")).toBe(true)
    for (const request of Object.values(bridge.catalog)) expect(request).not.toHaveBeenCalled()
    expect(bridge.auth.begin).not.toHaveBeenCalled()
    expect(bridge.auth.openActivation).not.toHaveBeenCalled()
    expect(bridge.playbackProgress.remove).not.toHaveBeenCalled()
    expect(bridge.playbackProgress.list).toHaveBeenCalledTimes(1)
    await activate("nav-home")
    expect(bridge.playbackProgress.list).toHaveBeenCalledTimes(1)
  })

  it.each(["resume", "back", "start"] as const)(
    "opens the existing prompt and honors %s without premature player construction",
    async (choice) => {
      const { bookmarks, bridge, constructed } = await mount()
      await activate("continue-a-open")
      expect(bridge.playbackProgress.get).toHaveBeenCalledExactlyOnceWith("a")
      expect(constructed).not.toHaveBeenCalled()
      expect(container.querySelector("#twitch-player-root")).toBeNull()
      await activate(`video-resume-${choice}`)
      if (choice === "back") {
        expect(constructed).not.toHaveBeenCalled()
        expect(ids()).toEqual(["continue-a-open"])
      } else {
        expect(constructed).toHaveBeenCalledTimes(1)
        expect(constructed.mock.calls[0]?.[1]).toMatchObject({ video: "a" })
        if (choice === "resume")
          expect(constructed.mock.calls[0]?.[1]).toHaveProperty("time", "1h5m0s")
        else {
          expect(constructed.mock.calls[0]?.[1]).not.toHaveProperty("time")
          expect(bridge.playbackProgress.remove).toHaveBeenCalledExactlyOnceWith("a")
          expect(bookmarks.has("a")).toBe(false)
        }
      }
      for (const request of Object.values(bridge.catalog)) expect(request).not.toHaveBeenCalled()
    },
  )

  it("plays legacy entries with the unknown broadcaster sentinel and an explicitly bypassed disabled archive shortcut", async () => {
    const { bridge, constructed } = await mount([
      { duration: 3600, position: 65, updatedAt: 1, videoId: "legacy" },
    ])
    await activate("continue-legacy-open")
    expect(controller().screen).toMatchObject({
      kind: "player",
      source: { kind: "video", userId: "0", videoId: "legacy" },
    })
    expect(constructed).not.toHaveBeenCalled()
    await activate("video-resume-resume")
    expect(constructed).toHaveBeenCalledExactlyOnceWith(
      "twitch-player-root",
      expect.objectContaining({ time: "0h1m5s", video: "legacy" }),
    )
    expect(button("player-vods").disabled).toBe(true)
    button("player-quality").focus()
    await key("ArrowRight")
    expect(document.activeElement).toBe(button("player-captions"))
    await key("ArrowRight")
    expect(document.activeElement).toBe(button("player-fullscreen"))
    await key("ArrowLeft")
    expect(document.activeElement).toBe(button("player-captions"))
    await key("ArrowLeft")
    expect(document.activeElement).toBe(button("player-quality"))
    await act(async () => button("player-vods").click())
    expect(bridge.catalog.videos).not.toHaveBeenCalled()
    expect(bridge.auth.begin).not.toHaveBeenCalled()
  })

  it.each(["departure", "completion"] as const)(
    "waits for a renderer-queued %s before listing on return to Home",
    async (operation) => {
      const first = deferred<void>()
      const final = deferred<void>()
      const { bookmarks, bridge, emit, timeline } = await mount()
      bridge.playbackProgress.save.mockImplementationOnce(async (item) => {
        await first.promise
        bookmarks.set(item.videoId, item)
      })
      if (operation === "departure")
        bridge.playbackProgress.save.mockImplementationOnce(async (item) => {
          await final.promise
          bookmarks.set(item.videoId, item)
        })
      else
        bridge.playbackProgress.remove.mockImplementationOnce(async (id) => {
          await final.promise
          bookmarks.delete(id)
        })
      await activate("continue-a-open")
      await activate("video-resume-resume")
      timeline.position = 4000
      await act(async () => {
        emit("ready")
        emit("playing")
        emit("pause")
      })
      expect(bridge.playbackProgress.save).toHaveBeenCalledTimes(1)
      timeline.position = 4100
      await act(async () => {
        emit("playing")
        if (operation === "completion") {
          emit("pause")
          emit("ended")
        }
      })
      await activate("player-back")
      expect(bridge.playbackProgress.list).toHaveBeenCalledTimes(1)
      expect(bridge.playbackProgress.save).toHaveBeenCalledTimes(1)
      expect(bridge.playbackProgress.remove).not.toHaveBeenCalled()
      await act(async () => first.resolve(undefined))
      expect(bridge.playbackProgress.list).toHaveBeenCalledTimes(1)
      if (operation === "departure") expect(bridge.playbackProgress.save).toHaveBeenCalledTimes(2)
      else {
        expect(bridge.playbackProgress.save).toHaveBeenCalledTimes(1)
        expect(bridge.playbackProgress.remove).toHaveBeenCalledExactlyOnceWith("a")
      }
      await act(async () => final.resolve(undefined))
      expect(bridge.playbackProgress.list).toHaveBeenCalledTimes(2)
      if (operation === "departure") {
        expect(controller().continueWatching.items[0]).toMatchObject({
          details: { title: "Saved a", userId: "broadcaster" },
          position: 4100,
        })
        expect(ids()).toEqual(["continue-a-open"])
      } else {
        expect(ids()).toEqual([])
        expect(bookmarks.has("a")).toBe(false)
      }
    },
  )

  it.each(["resolve", "reject"] as const)(
    "ignores obsolete list %s after navigation and re-entry",
    async (result) => {
      const obsolete = deferred<readonly PlaybackBookmark[]>()
      const current = deferred<readonly PlaybackBookmark[]>()
      const { bridge } = await mount([], (api) =>
        api.playbackProgress.list
          .mockReturnValueOnce(obsolete.promise)
          .mockReturnValueOnce(current.promise),
      )
      await activate("nav-search")
      await activate("nav-home")
      await act(async () => current.resolve([bookmark("current")]))
      const before = container.innerHTML
      await act(async () => {
        if (result === "resolve") obsolete.resolve([bookmark("obsolete")])
        else obsolete.reject(new Error("Obsolete failure"))
      })
      expect(container.innerHTML).toBe(before)
      expect(ids()).toEqual(["continue-current-open"])
      expect(bridge.playbackProgress.list).toHaveBeenCalledTimes(2)
    },
  )

  it.each(["resolve", "reject"] as const)(
    "ignores obsolete list %s after Forget progress",
    async (result) => {
      const obsolete = deferred<readonly PlaybackBookmark[]>()
      const { bookmarks, bridge } = await mount([bookmark("a"), bookmark("b")])
      bridge.playbackProgress.list.mockReturnValueOnce(obsolete.promise)
      await activate("nav-search")
      await activate("nav-home")
      await activate("continue-a-forget")
      expect(bookmarks.has("a")).toBe(false)
      const before = container.innerHTML
      await act(async () => {
        if (result === "resolve") obsolete.resolve([bookmark("a"), bookmark("obsolete")])
        else obsolete.reject(new Error("Obsolete failure"))
      })
      expect(container.innerHTML).toBe(before)
      expect(ids()).toEqual(["continue-b-open"])
    },
  )

  it("deletes saved positions, focuses the next survivor and rescues the last entry to an existing Home control", async () => {
    const { bookmarks, bridge } = await mount([bookmark("a"), bookmark("b"), bookmark("c")])
    await activate("continue-b-forget")
    expect(bridge.playbackProgress.remove).toHaveBeenCalledExactlyOnceWith("b")
    expect(bookmarks.has("b")).toBe(false)
    expect(document.activeElement).toBe(button("continue-c-open"))
    await activate("continue-c-forget")
    expect(document.activeElement).toBe(button("continue-a-open"))
    await activate("continue-a-forget")
    expect(bookmarks.size).toBe(0)
    expect(container.querySelector(".continue-watching")).toBeNull()
    expect(document.activeElement).toBe(button("home-sign-in"))
    await key("ArrowDown")
    expect(document.activeElement).toBe(button("stream-preview-twitch"))
  })

  it("retains a failed removal and reaches retry through the same controller action", async () => {
    const removal = deferred<void>()
    const { bookmarks, bridge } = await mount([bookmark("a")], (api) =>
      api.playbackProgress.remove.mockReturnValueOnce(removal.promise),
    )
    await activate("continue-a-forget")
    await key("Enter")
    expect(bridge.playbackProgress.remove).toHaveBeenCalledTimes(1)
    expect(button("continue-a-forget").getAttribute("aria-disabled")).toBe("true")
    await act(async () => removal.reject(new Error("Disk is read-only")))
    expect(ids()).toEqual(["continue-a-open"])
    expect(bookmarks.has("a")).toBe(true)
    expect(container.querySelector('.continue-card [role="alert"]')).not.toBeNull()
    expect(document.activeElement).toBe(button("continue-a-forget"))
    await key("ArrowUp")
    expect(document.activeElement).toBe(button("continue-a-open"))
    await key("ArrowDown")
    await key("Enter")
    expect(bridge.playbackProgress.remove).toHaveBeenCalledTimes(2)
    expect(bookmarks.has("a")).toBe(false)
    expect(document.activeElement).toBe(button("home-sign-in"))
  })

  it("keeps loading, read-error, retry and empty states controller-operable", async () => {
    const read = deferred<readonly PlaybackBookmark[]>()
    const retried = deferred<readonly PlaybackBookmark[]>()
    const { bridge } = await mount([], (api) =>
      api.playbackProgress.list
        .mockReturnValueOnce(read.promise)
        .mockReturnValueOnce(retried.promise),
    )
    expect(container.querySelector('.continue-watching-status [role="status"]')).not.toBeNull()
    await key("ArrowRight")
    expect(document.activeElement).toBe(button("home-sign-in"))
    await key("ArrowDown")
    expect(document.activeElement).toBe(button("stream-preview-twitch"))
    await act(async () => read.reject(new Error("Local file unavailable")))
    button("nav-home").focus()
    await key("ArrowRight")
    expect(document.activeElement).toBe(button("continue-retry"))
    await key("ArrowDown")
    expect(document.activeElement).toBe(button("stream-preview-twitch"))
    await key("ArrowUp")
    expect(document.activeElement).toBe(button("continue-retry"))
    await key("Enter")
    expect(document.activeElement).toBe(button("home-sign-in"))
    expect(bridge.playbackProgress.list).toHaveBeenCalledTimes(2)
    await act(async () => retried.resolve([]))
    expect(container.querySelector(".continue-watching-status")).toBeNull()
    expect(container.querySelector(".continue-watching")).toBeNull()
    await key("ArrowLeft")
    expect(document.activeElement).toBe(button("nav-home"))
  })

  it.each([false, true])(
    "wires nav, cards, actions and live controls in both directions (authenticated: %s)",
    async (authenticated) => {
      await mount(
        [bookmark("a"), bookmark("b")],
        () => undefined,
        authenticated
          ? { displayName: "Viewer", kind: "authenticated", login: "viewer" }
          : { kind: "guest" },
      )
      await key("ArrowRight")
      expect(document.activeElement).toBe(button("continue-a-open"))
      await key("ArrowRight")
      expect(document.activeElement).toBe(button("continue-b-open"))
      await key("ArrowDown")
      expect(document.activeElement).toBe(button("continue-b-forget"))
      await key("ArrowLeft")
      expect(document.activeElement).toBe(button("continue-a-forget"))
      await key("ArrowDown")
      expect(document.activeElement).toBe(
        button(authenticated ? "home-refresh" : "stream-preview-twitch"),
      )
      await key("ArrowUp")
      expect(document.activeElement).toBe(button("continue-b-forget"))
      await key("ArrowUp")
      expect(document.activeElement).toBe(button("continue-b-open"))
      await key("ArrowUp")
      expect(document.activeElement).toBe(button("nav-home"))
    },
  )
})
