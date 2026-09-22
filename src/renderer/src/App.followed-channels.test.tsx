// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type {
  AuthSnapshot,
  FollowedChannelCard,
  Page,
  VacuumStreamApi,
  VideoCard,
} from "../../shared/contracts"
import { App } from "./App"
import { dispatchControllerKey } from "./focus-navigation"
import * as twitchPlayer from "./twitch-player"
import * as controllerModule from "./useAppController"

const authenticated: AuthSnapshot = {
  displayName: "Viewer",
  kind: "authenticated",
  login: "viewer",
}
const channel = (id: string, isLive = false): FollowedChannelCard => ({
  displayName: `Channel ${id}`,
  id,
  isLive,
  login: `channel${id}`,
})
const page = (ids: readonly string[], cursor?: string): Page<FollowedChannelCard> => ({
  cursor,
  items: ids.map((id) => channel(id)),
})
const video: VideoCard = {
  createdAt: "2026-09-21T12:00:00Z",
  duration: "1h",
  id: "recording",
  publishedAt: "2026-09-21T12:00:00Z",
  thumbnailUrl: "https://example.com/recording.jpg",
  title: "An archived stream",
  userId: "offline",
  userLogin: "channeloffline",
  userName: "Channel offline",
  viewCount: 42,
}
const deferred = <Value,>() => {
  let controls:
    | { readonly reject: (error: Error) => void; readonly resolve: (value: Value) => void }
    | undefined
  const promise = new Promise<Value>((resolve, reject) => {
    controls = { reject, resolve }
  })
  if (controls === undefined) throw new Error("Promise executor did not run")
  return { ...controls, promise }
}
const makeBridge = (auth: AuthSnapshot) =>
  ({
    auth: {
      begin: vi.fn<VacuumStreamApi["auth"]["begin"]>(),
      logout: vi.fn<VacuumStreamApi["auth"]["logout"]>().mockResolvedValue(undefined),
      openActivation: vi.fn<VacuumStreamApi["auth"]["openActivation"]>(),
      snapshot: vi.fn<VacuumStreamApi["auth"]["snapshot"]>().mockResolvedValue(auth),
    },
    catalog: {
      followed: vi.fn<VacuumStreamApi["catalog"]["followed"]>().mockResolvedValue({
        cursor: undefined,
        items: [],
      }),
      followedChannels: vi
        .fn<VacuumStreamApi["catalog"]["followedChannels"]>()
        .mockResolvedValue(page(["offline"])),
      live: vi.fn<VacuumStreamApi["catalog"]["live"]>().mockResolvedValue({
        cursor: undefined,
        items: [],
      }),
      search: vi.fn<VacuumStreamApi["catalog"]["search"]>().mockResolvedValue({
        cursor: undefined,
        items: [],
      }),
      topCategories: vi.fn<VacuumStreamApi["catalog"]["topCategories"]>().mockResolvedValue({
        cursor: undefined,
        items: [],
      }),
      videos: vi.fn<VacuumStreamApi["catalog"]["videos"]>().mockResolvedValue({
        cursor: undefined,
        items: [],
      }),
    },
    settings: {
      saveClientId: vi.fn<VacuumStreamApi["settings"]["saveClientId"]>(),
      snapshot: vi.fn<VacuumStreamApi["settings"]["snapshot"]>().mockResolvedValue({
        clientId: "abcdefghijklmnopqrstuvwxyz1234",
        secureStorage: true,
      }),
    },
    system: {
      activateEmbeddedPlayer: vi.fn<VacuumStreamApi["system"]["activateEmbeddedPlayer"]>(),
      isSteamGameMode: vi.fn<VacuumStreamApi["system"]["isSteamGameMode"]>(),
      restoreShellFullscreen: vi
        .fn<VacuumStreamApi["system"]["restoreShellFullscreen"]>()
        .mockResolvedValue(false),
      toggleFullscreen: vi.fn<VacuumStreamApi["system"]["toggleFullscreen"]>(),
    },
  }) satisfies VacuumStreamApi

type Bridge = ReturnType<typeof makeBridge>
const constructedPlayer = vi.fn<(options: twitchPlayer.TwitchPlayerOptions) => void>()
// Exercise the real PlayerView and options boundary, without network or READY-triggered timers.
class Player implements twitchPlayer.TwitchPlayerInstance {
  static OFFLINE = "offline"
  static PAUSE = "pause"
  static PLAY = "play"
  static PLAYBACK_BLOCKED = "blocked"
  static PLAYING = "playing"
  static READY = "ready"
  static SEEK = "seek"
  constructor(_elementId: string, options: twitchPlayer.TwitchPlayerOptions) {
    constructedPlayer(options)
  }
  addEventListener = vi.fn()
  getCurrentTime = () => 0
  getDuration = () => 0
  getMuted = () => true
  getQualities = () => []
  getQuality = () => "auto"
  isPaused = () => true
  pause = vi.fn()
  play = vi.fn()
  seek = vi.fn()
  setMuted = vi.fn()
  setQuality = vi.fn()
}

let root: Root | undefined
let container: HTMLDivElement
let observedController: ReturnType<typeof controllerModule.useAppController> | undefined
const realController = controllerModule.useAppController
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  // Keep real directional navigation; do not start its gamepad polling loop.
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1),
  )
  vi.stubGlobal("cancelAnimationFrame", vi.fn())
  vi.stubGlobal("matchMedia", () => ({ matches: true }))
  vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockReturnValue(document.body)
  vi.spyOn(controllerModule, "useAppController").mockImplementation(() => {
    observedController = realController()
    return observedController
  })
  vi.spyOn(twitchPlayer, "loadTwitchPlayerApi").mockResolvedValue({ Player })
  constructedPlayer.mockClear()
  container = document.createElement("div")
  document.body.append(container)
})
afterEach(async () => {
  await act(async () => root?.unmount())
  root = undefined
  observedController = undefined
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
const controller = () => {
  if (observedController === undefined) throw new Error("App is not mounted")
  return observedController
}
const button = (id: string): HTMLButtonElement => {
  const element = container.querySelector<HTMLButtonElement>(`[data-focus-id="${id}"]`)
  if (element === null) throw new Error(`Missing focus target ${id}`)
  return element
}
const key = async (input: string): Promise<void> => {
  for (const element of container.querySelectorAll<HTMLElement>("[data-focusable]"))
    element.scrollIntoView = vi.fn()
  await act(async () => dispatchControllerKey(input))
}
const activate = async (id: string): Promise<void> => {
  button(id).focus()
  await key("Enter")
}
const mount = async (
  configure: (bridge: Bridge) => void = () => undefined,
  auth: AuthSnapshot = authenticated,
) => {
  const bridge = makeBridge(auth)
  configure(bridge)
  vi.stubGlobal("vacuumStream", bridge)
  root = createRoot(container)
  await act(async () => root?.render(<App />))
  await activate("nav-following")
  expect(bridge.catalog.followedChannels).not.toHaveBeenCalled()
  return bridge
}
const enterDirectory = async (configure: (bridge: Bridge) => void = () => undefined) => {
  const bridge = await mount(configure)
  await activate("following-all")
  return bridge
}
const ids = () => controller().followedChannels.items.map((item) => item.id)
const settleObsolete = async (
  request: ReturnType<typeof deferred<Page<FollowedChannelCard>>>,
  result: "resolve" | "reject",
) => {
  await act(async () => {
    if (result === "resolve") request.resolve(page(["obsolete"], "obsolete-cursor"))
    else request.reject(new Error("Obsolete failure"))
  })
}

describe("All channels in the mounted App", () => {
  it("loads on authenticated entry and Refresh, replacing the first page without touching live shelves", async () => {
    const refresh = deferred<Page<FollowedChannelCard>>()
    const bridge = await enterDirectory((api) =>
      api.catalog.followedChannels
        .mockResolvedValueOnce(page(["first"], "old-cursor"))
        .mockReturnValueOnce(refresh.promise),
    )
    expect(bridge.catalog.followedChannels).toHaveBeenCalledExactlyOnceWith({ first: 20 })
    const live = controller().live
    const followed = controller().followed
    await activate("following-all")
    expect(bridge.catalog.followedChannels).toHaveBeenCalledTimes(1)
    const entry = button("followed-channel-first-open")
    await activate("following-directory-refresh")
    await activate("following-directory-refresh")
    expect(bridge.catalog.followedChannels).toHaveBeenCalledTimes(2)
    expect(bridge.catalog.followedChannels).toHaveBeenLastCalledWith({ first: 20 })
    expect(button("followed-channel-first-open")).toBe(entry)
    expect(container.querySelector('.followed-channels[aria-busy="true"]')).not.toBeNull()
    await act(async () => refresh.resolve(page(["replacement"])))
    expect(ids()).toEqual(["replacement"])
    expect(controller().followedChannels.cursor).toBeUndefined()
    expect(controller().live).toBe(live)
    expect(controller().followed).toBe(followed)
    expect(bridge.catalog.live).toHaveBeenCalledTimes(1)
    expect(bridge.catalog.followed).toHaveBeenCalledTimes(1)
    expect(bridge.auth.snapshot).toHaveBeenCalledTimes(1)
  })

  it("forwards the exact cursor, deduplicates broadcaster ids and rescues action focus at exhaustion", async () => {
    const next = deferred<Page<FollowedChannelCard>>()
    const bridge = await enterDirectory((api) =>
      api.catalog.followedChannels
        .mockResolvedValueOnce(page(["one", "two"], "opaque+/=cursor"))
        .mockReturnValueOnce(next.promise),
    )
    const duplicate = button("followed-channel-two-open")
    await key("ArrowDown")
    expect(document.activeElement).toBe(button("following-directory-refresh"))
    await key("ArrowDown")
    expect(document.activeElement).toBe(button("followed-channel-one-open"))
    await key("ArrowDown")
    expect(document.activeElement).toBe(duplicate)
    await key("ArrowDown")
    expect(document.activeElement).toBe(button("following-directory-more"))
    await act(async () => {
      dispatchControllerKey("Enter")
      dispatchControllerKey("Enter")
    })
    expect(bridge.catalog.followedChannels).toHaveBeenCalledTimes(2)
    expect(bridge.catalog.followedChannels).toHaveBeenLastCalledWith({
      after: "opaque+/=cursor",
      first: 20,
    })
    const updated = {
      ...channel("two", true),
      profileImageUrl: "https://example.com/new-avatar.png",
    }
    await act(async () => next.resolve({ cursor: undefined, items: [updated, channel("three")] }))
    expect(ids()).toEqual(["one", "two", "three"])
    expect(button("followed-channel-two-open")).toBe(duplicate)
    expect(duplicate.closest("li")?.querySelector("img")?.getAttribute("src")).toBe(
      updated.profileImageUrl,
    )
    expect(duplicate.closest("li")?.textContent).toContain("Live")
    expect(container.querySelector('[data-focus-id="following-directory-more"]')).toBeNull()
    expect(document.activeElement).toBe(button("following-directory-refresh"))
  })

  it.each(["open", "videos"] as const)(
    "rescues focus when Refresh replaces the entry whose %s action is focused",
    async (action) => {
      const refresh = deferred<Page<FollowedChannelCard>>()
      await enterDirectory((api) =>
        api.catalog.followedChannels
          .mockResolvedValueOnce(page(["removed"]))
          .mockReturnValueOnce(refresh.promise),
      )
      await activate("following-directory-refresh")
      await key("ArrowDown")
      if (action === "videos") await key("ArrowRight")
      const removed = button(`followed-channel-removed-${action}`)
      expect(document.activeElement).toBe(removed)
      await act(async () => refresh.resolve(page(["survivor"])))
      expect(removed.isConnected).toBe(false)
      expect(document.activeElement).toBe(button("followed-channel-survivor-open"))
      expect(document.activeElement).not.toBe(document.body)
    },
  )

  it("rescues entry focus to Refresh when the replacement page is empty", async () => {
    const refresh = deferred<Page<FollowedChannelCard>>()
    await enterDirectory((api) =>
      api.catalog.followedChannels
        .mockResolvedValueOnce(page(["removed"]))
        .mockReturnValueOnce(refresh.promise),
    )
    await activate("following-directory-refresh")
    await key("ArrowDown")
    expect(document.activeElement).toBe(button("followed-channel-removed-open"))
    await act(async () => refresh.resolve(page([])))
    expect(document.activeElement).toBe(button("following-directory-refresh"))
    expect(container.querySelector('.followed-channels .empty-state[role="status"]')).not.toBeNull()
  })

  it("shows offline status, avatar fallbacks and both actions, including official offline channel playback", async () => {
    await enterDirectory()
    const open = button("followed-channel-offline-open")
    const entry = open.closest("li")
    expect(entry?.textContent).toContain("Channel offline")
    expect(entry?.textContent).toContain("Offline")
    expect(entry?.querySelector(".avatar")?.textContent).toBe("C")
    expect(entry?.querySelector(".avatar img")).toBeNull()
    button("followed-channel-offline-videos")
    expect(open.hasAttribute("disabled")).toBe(false)
    await activate("followed-channel-offline-open")
    expect(controller().screen).toEqual({
      kind: "player",
      source: {
        channel: "channeloffline",
        kind: "live",
        title: "Channel offline",
        userId: "offline",
      },
    })
    expect(constructedPlayer).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ channel: "channeloffline" }),
    )
  })

  it("opens an offline broadcaster's archives by exact userId without a player until a recording is chosen", async () => {
    const archives = deferred<Page<VideoCard>>()
    const bridge = await enterDirectory((api) =>
      api.catalog.videos.mockReturnValueOnce(archives.promise),
    )
    await activate("followed-channel-offline-videos")
    expect(bridge.catalog.videos).toHaveBeenCalledExactlyOnceWith({ first: 30, userId: "offline" })
    expect(container.querySelector('.videos-view[aria-busy="true"]')).not.toBeNull()
    expect(constructedPlayer).not.toHaveBeenCalled()
    expect(twitchPlayer.loadTwitchPlayerApi).not.toHaveBeenCalled()
    await act(async () => archives.resolve({ cursor: undefined, items: [video] }))
    expect(constructedPlayer).not.toHaveBeenCalled()
    await key("ArrowDown")
    expect(document.activeElement).toBe(button("video-recording"))
    await key("Enter")
    expect(constructedPlayer).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ video: "recording" }),
    )
  })

  it("renders an empty archive as a status with reachable Back", async () => {
    await enterDirectory()
    await activate("followed-channel-offline-videos")
    expect(container.querySelector('.videos-view .empty-state[role="status"]')).not.toBeNull()
    expect(container.querySelector(".video-grid")).toBeNull()
    expect(document.activeElement).toBe(button("videos-back"))
    await key("Enter")
    expect(controller().screen).toEqual({ kind: "browse", route: "home" })
    expect(constructedPlayer).not.toHaveBeenCalled()
  })

  it("clears prior recordings on an archive failure and exposes an arrow-reachable Retry for the same broadcaster", async () => {
    const failed = deferred<Page<VideoCard>>()
    const retry = deferred<Page<VideoCard>>()
    const bridge = await enterDirectory((api) => {
      api.catalog.followedChannels.mockResolvedValue(page(["offline", "other"]))
      api.catalog.videos
        .mockResolvedValueOnce({ cursor: undefined, items: [video] })
        .mockReturnValueOnce(failed.promise)
        .mockReturnValueOnce(retry.promise)
    })
    await activate("followed-channel-offline-videos")
    button("video-recording")
    await activate("videos-back")
    await activate("nav-following")
    await activate("following-all")
    await activate("followed-channel-other-videos")
    expect(controller().videos).toEqual([])
    await act(async () => failed.reject(new Error("Archives unavailable")))
    expect(container.querySelector('.videos-view [role="alert"]')).not.toBeNull()
    expect(container.querySelector(".video-card")).toBeNull()
    await key("ArrowDown")
    expect(document.activeElement).toBe(button("videos-retry"))
    await key("Enter")
    expect(bridge.catalog.videos.mock.calls.slice(1)).toEqual([
      [{ first: 30, userId: "other" }],
      [{ first: 30, userId: "other" }],
    ])
    expect(document.activeElement).toBe(button("videos-back"))
    await act(async () => retry.resolve({ cursor: undefined, items: [] }))
    expect(container.querySelector('.videos-view .empty-state[role="status"]')).not.toBeNull()
    expect(constructedPlayer).not.toHaveBeenCalled()
  })

  it("keeps successful archives visible when an unrelated category request fails", async () => {
    const categories = deferred<Page<never>>()
    await enterDirectory((api) => {
      api.catalog.topCategories.mockReturnValueOnce(categories.promise)
      api.catalog.videos.mockResolvedValueOnce({ cursor: undefined, items: [video] })
    })
    await activate("followed-channel-offline-videos")
    const recording = button("video-recording")
    await act(async () => categories.reject(new Error("Categories unavailable")))
    expect(button("video-recording")).toBe(recording)
    expect(container.querySelector('.videos-view [role="alert"]')).toBeNull()
    expect(controller().videoError).toBe("")
  })

  it.each(["refresh", "more"] as const)(
    "retains entries on failed %s and Retry repeats that exact operation",
    async (operation) => {
      const failed = deferred<Page<FollowedChannelCard>>()
      const retry = deferred<Page<FollowedChannelCard>>()
      const bridge = await enterDirectory((api) =>
        api.catalog.followedChannels
          .mockResolvedValueOnce(page(["kept"], "saved+/="))
          .mockReturnValueOnce(failed.promise)
          .mockReturnValueOnce(retry.promise),
      )
      const entry = button("followed-channel-kept-open")
      await activate(`following-directory-${operation}`)
      await act(async () => failed.reject(new Error("Directory unavailable")))
      expect(button("followed-channel-kept-open")).toBe(entry)
      expect(container.querySelector('.followed-channels [role="alert"]')).not.toBeNull()
      entry.focus()
      await key("ArrowDown")
      expect(document.activeElement).toBe(button("following-directory-retry"))
      await key("Enter")
      const input = operation === "more" ? { after: "saved+/=", first: 20 } : { first: 20 }
      expect(bridge.catalog.followedChannels.mock.calls.slice(1)).toEqual([[input], [input]])
      await act(async () => retry.resolve(page(["new"])))
      expect(ids()).toEqual(operation === "more" ? ["kept", "new"] : ["new"])
      expect(document.activeElement).toBe(button("following-directory-refresh"))
    },
  )

  it("distinguishes initial loading, error and empty results with reachable Retry", async () => {
    const first = deferred<Page<FollowedChannelCard>>()
    const bridge = await enterDirectory((api) =>
      api.catalog.followedChannels.mockReturnValueOnce(first.promise),
    )
    expect(container.querySelector('.followed-channels [role="status"]')).not.toBeNull()
    expect(container.querySelector(".followed-channels .empty-state")).toBeNull()
    await act(async () => first.reject(new Error("Directory unavailable")))
    expect(container.querySelector('.followed-channels [role="alert"]')).not.toBeNull()
    await key("ArrowDown")
    await key("ArrowDown")
    expect(document.activeElement).toBe(button("following-directory-retry"))
    bridge.catalog.followedChannels.mockResolvedValueOnce(page([]))
    await key("Enter")
    expect(bridge.catalog.followedChannels).toHaveBeenNthCalledWith(2, { first: 20 })
    expect(container.querySelector('.followed-channels .empty-state[role="status"]')).not.toBeNull()
    expect(document.activeElement).toBe(button("following-directory-refresh"))
  })

  describe.each(["resolve", "reject"] as const)("obsolete %s", (result) => {
    it.each(["mode change", "navigation", "archives"] as const)(
      "cannot install after %s even before another directory request starts",
      async (departure) => {
        const previous = deferred<Page<FollowedChannelCard>>()
        const bridge = await enterDirectory((api) =>
          api.catalog.followedChannels
            .mockResolvedValueOnce(page(["kept"], "old-cursor"))
            .mockReturnValueOnce(previous.promise),
        )
        await activate("following-directory-more")
        await activate(
          departure === "mode change"
            ? "following-live"
            : departure === "navigation"
              ? "nav-home"
              : "followed-channel-kept-videos",
        )
        const state = controller().followedChannels
        const markup = container.innerHTML
        await settleObsolete(previous, result)
        expect(controller().followedChannels).toBe(state)
        expect(container.innerHTML).toBe(markup)
        expect(bridge.catalog.followedChannels).toHaveBeenCalledTimes(2)
      },
    )

    it.each([
      "mode change",
      "navigation",
      "playback",
      "account change",
      "refresh replacement",
    ] as const)("cannot install directory items, cursors or errors after %s", async (departure) => {
      const previous = deferred<Page<FollowedChannelCard>>()
      const current = deferred<Page<FollowedChannelCard>>()
      const bridge = await enterDirectory((api) =>
        api.catalog.followedChannels
          .mockResolvedValueOnce(page(["kept"], "old-cursor"))
          .mockReturnValueOnce(previous.promise)
          .mockReturnValueOnce(current.promise)
          .mockResolvedValueOnce(page(["last"])),
      )
      await activate("following-directory-more")
      if (departure === "mode change") {
        await activate("following-live")
        await activate("following-all")
      } else if (departure === "navigation") {
        await activate("nav-home")
        await activate("nav-following")
        await activate("following-all")
      } else if (departure === "playback") {
        await activate("followed-channel-kept-open")
        await activate("player-back")
        await activate("nav-following")
        await activate("following-all")
      } else if (departure === "account change") {
        await act(async () =>
          controller().setAuth({ displayName: "Other", kind: "authenticated", login: "other" }),
        )
        expect(ids()).toEqual([])
      } else {
        await activate("following-directory-refresh")
        await activate("following-directory-refresh")
      }
      expect(bridge.catalog.followedChannels).toHaveBeenCalledTimes(3)
      expect(bridge.catalog.followedChannels).toHaveBeenLastCalledWith({ first: 20 })
      await act(async () => current.resolve(page(["current"], "current+/=")))
      const state = controller().followedChannels
      const markup = container.innerHTML
      await settleObsolete(previous, result)
      expect(controller().followedChannels).toBe(state)
      expect(container.innerHTML).toBe(markup)
      await activate("following-directory-more")
      expect(bridge.catalog.followedChannels).toHaveBeenLastCalledWith({
        after: "current+/=",
        first: 20,
      })
      expect(ids()).toEqual(["current", "last"])
    })

    it("cannot install after logout and does not retain the previous account's directory", async () => {
      const previous = deferred<Page<FollowedChannelCard>>()
      const bridge = await enterDirectory((api) =>
        api.catalog.followedChannels
          .mockResolvedValueOnce(page(["private"], "private-cursor"))
          .mockReturnValueOnce(previous.promise),
      )
      await activate("following-directory-refresh")
      await key("F10")
      await activate("settings-logout")
      expect(bridge.auth.logout).toHaveBeenCalledTimes(1)
      const state = controller().followedChannels
      await settleObsolete(previous, result)
      expect(controller().followedChannels).toBe(state)
      expect(ids()).toEqual([])
      expect(state.cursor).toBeUndefined()
      expect(state.error).toBe("")
      await activate("nav-following")
      await activate("following-all")
      expect(controller().screen).toEqual({ kind: "browse", route: "settings" })
      expect(bridge.catalog.followedChannels).toHaveBeenCalledTimes(2)
    })

    it.each(["navigation", "logout", "account change"] as const)(
      "cannot install an archive response after %s",
      async (departure) => {
        const request = deferred<Page<VideoCard>>()
        await enterDirectory((api) => api.catalog.videos.mockReturnValueOnce(request.promise))
        await activate("followed-channel-offline-videos")
        if (departure === "navigation") await key("Escape")
        else
          await act(async () =>
            controller().setAuth(
              departure === "logout"
                ? { kind: "guest" }
                : { displayName: "Other", kind: "authenticated", login: "other" },
            ),
          )
        const markup = container.innerHTML
        await act(async () => {
          if (result === "resolve") request.resolve({ cursor: undefined, items: [video] })
          else request.reject(new Error("Obsolete archive failure"))
        })
        expect(container.innerHTML).toBe(markup)
        expect(controller().videoError).toBe("")
        expect(controller().videos).toEqual([])
        expect(controller().notice).toBe("")
      },
    )
  })

  it("makes both mode controls reachable by arrows and sends a guest to sign-in without catalog requests", async () => {
    const bridge = await mount(() => undefined, { kind: "guest" })
    // Geometry is only needed for the unoverridden Down from the existing live shelf.
    const connect = button("following-connect")
    const liveMode = button("following-live")
    const allMode = button("following-all")
    vi.spyOn(connect, "getBoundingClientRect").mockReturnValue(new DOMRect(200, 200, 150, 48))
    vi.spyOn(liveMode, "getBoundingClientRect").mockReturnValue(new DOMRect(200, 300, 150, 48))
    vi.spyOn(allMode, "getBoundingClientRect").mockReturnValue(new DOMRect(370, 300, 150, 48))
    await key("ArrowDown")
    expect(document.activeElement).toBe(connect)
    await key("ArrowDown")
    expect(document.activeElement).toBe(liveMode)
    await key("ArrowRight")
    expect(document.activeElement).toBe(allMode)
    await key("ArrowLeft")
    expect(document.activeElement).toBe(liveMode)
    await key("ArrowRight")
    await key("Enter")
    expect(controller().screen).toEqual({ kind: "browse", route: "settings" })
    for (const request of Object.values(bridge.catalog)) expect(request).not.toHaveBeenCalled()
    expect(constructedPlayer).not.toHaveBeenCalled()
  })
})
