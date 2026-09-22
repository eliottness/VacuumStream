// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  type AuthSnapshot,
  type ChannelCard,
  FAVOURITES_LIMIT_ERROR,
  type Favourite,
  type PlaybackBookmark,
  type VacuumStreamApi,
} from "../../shared/contracts"
import { App } from "./App"
import { dispatchControllerKey } from "./focus-navigation"
import type { TwitchPlayerOptions } from "./twitch-player"
import * as controllerModule from "./useAppController"
import * as favouritesModule from "./useFavourites"

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
const savedRecording: PlaybackBookmark = {
  details: { title: "Saved recording", userId: "123" },
  duration: 3600,
  position: 60,
  updatedAt: 1,
  videoId: "recording",
}
const result: ChannelCard = {
  category: "Talk shows",
  displayName: "Twitch",
  id: "12826",
  isLive: false,
  login: "twitch",
  thumbnailUrl: "https://example.com/twitch.png",
  title: "Twitch channel",
}
const entries: readonly Favourite[] = [{ login: "alpha" }, { login: "bravo" }, { login: "charlie" }]
const makeBridge = (items: readonly Favourite[], auth: AuthSnapshot, withContinue: boolean) => {
  const store = new Map(items.map((item) => [item.login, item]))
  const committed = () => [...store.values()].sort((a, b) => a.login.localeCompare(b.login))
  return {
    auth: {
      begin: vi.fn<VacuumStreamApi["auth"]["begin"]>(),
      logout: vi.fn<VacuumStreamApi["auth"]["logout"]>().mockResolvedValue(undefined),
      openActivation: vi.fn<VacuumStreamApi["auth"]["openActivation"]>(),
      snapshot: vi.fn<VacuumStreamApi["auth"]["snapshot"]>().mockResolvedValue(auth),
    },
    catalog: {
      followed: vi.fn<VacuumStreamApi["catalog"]["followed"]>(),
      followedChannels: vi.fn<VacuumStreamApi["catalog"]["followedChannels"]>(),
      live: vi
        .fn<VacuumStreamApi["catalog"]["live"]>()
        .mockResolvedValue({ cursor: undefined, items: [] }),
      search: vi
        .fn<VacuumStreamApi["catalog"]["search"]>()
        .mockResolvedValue({ cursor: undefined, items: [result] }),
      topCategories: vi
        .fn<VacuumStreamApi["catalog"]["topCategories"]>()
        .mockResolvedValue({ cursor: undefined, items: [] }),
      videos: vi
        .fn<VacuumStreamApi["catalog"]["videos"]>()
        .mockResolvedValue({ cursor: undefined, items: [] }),
    },
    chatInput: {
      begin: vi.fn<VacuumStreamApi["chatInput"]["begin"]>(),
      end: vi.fn<VacuumStreamApi["chatInput"]["end"]>().mockResolvedValue(undefined),
      onEscape: vi.fn<VacuumStreamApi["chatInput"]["onEscape"]>().mockReturnValue(() => undefined),
      press: vi.fn<VacuumStreamApi["chatInput"]["press"]>().mockResolvedValue(undefined),
    },
    favourites: {
      add: vi.fn<VacuumStreamApi["favourites"]["add"]>(async (entry) => {
        store.set(entry.login, entry)
        return committed()
      }),
      list: vi.fn<VacuumStreamApi["favourites"]["list"]>(async () => committed()),
      remove: vi.fn<VacuumStreamApi["favourites"]["remove"]>(async (login) => {
        store.delete(login)
        return committed()
      }),
    },
    playbackProgress: {
      get: vi.fn<VacuumStreamApi["playbackProgress"]["get"]>().mockResolvedValue(undefined),
      list: vi
        .fn<VacuumStreamApi["playbackProgress"]["list"]>()
        .mockResolvedValue(withContinue ? [savedRecording] : []),
      remove: vi.fn<VacuumStreamApi["playbackProgress"]["remove"]>().mockResolvedValue(undefined),
      save: vi.fn<VacuumStreamApi["playbackProgress"]["save"]>().mockResolvedValue(undefined),
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
}

type Bridge = ReturnType<typeof makeBridge>
let root: Root | undefined
let container: HTMLDivElement
let observedController: ReturnType<typeof controllerModule.useAppController> | undefined
let observedFavourites: ReturnType<typeof favouritesModule.useFavourites> | undefined
const realController = controllerModule.useAppController
const realFavourites = favouritesModule.useFavourites
const scrollFeedback = vi.fn()
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1),
  )
  vi.stubGlobal("cancelAnimationFrame", vi.fn())
  vi.stubGlobal("matchMedia", () => ({ matches: false }))
  vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockReturnValue(document.body)
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollFeedback,
    writable: true,
  })
  vi.spyOn(controllerModule, "useAppController").mockImplementation(() => {
    observedController = realController()
    return observedController
  })
  vi.spyOn(favouritesModule, "useFavourites").mockImplementation(() => {
    observedFavourites = realFavourites()
    return observedFavourites
  })
  container = document.createElement("div")
  document.body.append(container)
})
afterEach(async () => {
  await act(async () => root?.unmount())
  root = undefined
  observedController = undefined
  observedFavourites = undefined
  document.body.replaceChildren()
  Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView")
  scrollFeedback.mockClear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
const controller = () => {
  if (observedController === undefined) throw new Error("App not mounted")
  return observedController
}
const favourites = () => {
  if (observedFavourites === undefined) throw new Error("App not mounted")
  return observedFavourites
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
const openIds = () =>
  [...container.querySelectorAll('.favourite-card [data-focus-id$="-open"]')].map((element) =>
    element.getAttribute("data-focus-id"),
  )
const mount = async (
  items: readonly Favourite[] = [],
  configure: (bridge: Bridge) => void = () => undefined,
  auth: AuthSnapshot = { kind: "guest" },
  withContinue = false,
) => {
  const bridge = makeBridge(items, auth, withContinue)
  configure(bridge)
  vi.stubGlobal("vacuumStream", bridge)
  const constructed = vi.fn<(id: string, options: TwitchPlayerOptions) => void>()
  class TestPlayer {
    static readonly OFFLINE = "offline"
    static readonly ONLINE = "online"
    static readonly PAUSE = "pause"
    static readonly PLAY = "play"
    static readonly PLAYBACK_BLOCKED = "blocked"
    static readonly PLAYING = "playing"
    static readonly READY = "ready"
    static readonly SEEK = "seek"
    constructor(id: string, options: TwitchPlayerOptions) {
      constructed(id, options)
    }
    readonly addEventListener = vi.fn()
    readonly pause = vi.fn()
  }
  vi.stubGlobal("Twitch", { Player: TestPlayer })
  root = createRoot(container)
  await act(async () => root?.render(<App />))
  return { bridge, constructed }
}
const search = async (login = "twitch") => {
  await activate("nav-search")
  for (const character of login) await activate(`search-key-${character}`)
  await activate("search-key-submit")
  await key("ArrowDown")
}

describe("local favourite channels in App", () => {
  it("lets a guest search, save, return Home and open exactly one official player without Helix or authorization", async () => {
    const { bridge, constructed } = await mount()
    expect(container.querySelector(".favourites")).toBeNull()
    await search()
    expect(document.activeElement).toBe(button("channel-direct-twitch"))
    await key("ArrowRight")
    expect(document.activeElement).toBe(button("channel-direct-twitch-save"))
    await key("Enter")
    expect(bridge.favourites.add).toHaveBeenCalledExactlyOnceWith({ login: "twitch" })
    expect(button("channel-direct-twitch-save").getAttribute("aria-pressed")).toBe("true")
    await key("Enter")
    expect(bridge.favourites.add).toHaveBeenCalledTimes(1)
    expect(constructed).not.toHaveBeenCalled()
    await key("Escape")
    await key("ArrowRight")
    expect(document.activeElement).toBe(button("favourite-twitch-open"))
    expect(container.querySelectorAll(".favourites img, .favourites .live-badge")).toHaveLength(0)
    expect(constructed).not.toHaveBeenCalled()
    await key("Enter")
    expect(constructed).toHaveBeenCalledExactlyOnceWith(
      "twitch-player-root",
      expect.objectContaining({ channel: "twitch" }),
    )
    expect(controller().screen).toMatchObject({ kind: "player", source: { userId: "0" } })
    expect(button("player-vods").disabled).toBe(false)
    await activate("player-vods")
    expect(controller().screen).toMatchObject({ kind: "browse", route: "settings" })
    expect(constructed).toHaveBeenCalledTimes(1)
    expect(bridge.favourites.list).toHaveBeenCalledTimes(1)
    for (const request of Object.values(bridge.catalog)) expect(request).not.toHaveBeenCalled()
    expect(bridge.auth.begin).not.toHaveBeenCalled()
    expect(bridge.auth.openActivation).not.toHaveBeenCalled()
    expect(bridge.auth.logout).not.toHaveBeenCalled()
  })

  it("preserves a real broadcaster id from authenticated search across account changes and the archive route", async () => {
    const { bridge, constructed } = await mount([], () => undefined, {
      displayName: "Viewer",
      kind: "authenticated",
      login: "viewer",
    })
    await search()
    await key("ArrowRight")
    await key("Enter")
    expect(bridge.favourites.add).toHaveBeenCalledExactlyOnceWith({
      login: "twitch",
      userId: "12826",
    })
    expect(constructed).not.toHaveBeenCalled()
    await act(async () => controller().setAuth({ kind: "guest" }))
    await key("Escape")
    expect(openIds()).toEqual(["favourite-twitch-open"])
    await act(async () =>
      controller().setAuth({ displayName: "Other", kind: "authenticated", login: "other" }),
    )
    expect(openIds()).toEqual(["favourite-twitch-open"])
    expect(bridge.favourites.list).toHaveBeenCalledTimes(1)
    await activate("favourite-twitch-open")
    expect(controller().screen).toMatchObject({
      kind: "player",
      source: { channel: "twitch", userId: "12826" },
    })
    await activate("player-vods")
    expect(bridge.catalog.videos).toHaveBeenCalledExactlyOnceWith({ first: 30, userId: "12826" })
    expect(constructed).toHaveBeenCalledTimes(1)
  })

  it.each([false, true])(
    "traverses nav, favourites and live controls in both directions with Continue Watching: %s",
    async (withContinue) => {
      const { bridge } = await mount(entries, () => undefined, { kind: "guest" }, withContinue)
      await key("ArrowRight")
      if (withContinue) {
        expect(document.activeElement).toBe(button("continue-recording-open"))
        await key("ArrowDown")
        expect(document.activeElement).toBe(button("continue-recording-forget"))
        await key("ArrowDown")
      }
      expect(document.activeElement).toBe(button("favourite-alpha-open"))
      await key("ArrowRight")
      expect(document.activeElement).toBe(button("favourite-bravo-open"))
      await key("ArrowDown")
      expect(document.activeElement).toBe(button("favourite-bravo-remove"))
      await key("ArrowDown")
      expect(document.activeElement).toBe(button("stream-preview-twitch"))
      await key("ArrowUp")
      expect(document.activeElement).toBe(button("favourite-charlie-remove"))
      await key("ArrowLeft")
      await key("ArrowLeft")
      expect(document.activeElement).toBe(button("favourite-alpha-remove"))
      await key("ArrowUp")
      await key("ArrowUp")
      expect(document.activeElement).toBe(
        button(withContinue ? "continue-recording-forget" : "nav-home"),
      )
      if (withContinue) {
        await key("ArrowUp")
        await key("ArrowLeft")
        expect(document.activeElement).toBe(button("nav-home"))
      }
      const shelves = [...container.querySelectorAll(".shelf")]
      expect(shelves.findIndex((shelf) => shelf.classList.contains("favourites"))).toBe(
        withContinue ? 1 : 0,
      )
      for (const request of Object.values(bridge.catalog)) expect(request).not.toHaveBeenCalled()
    },
  )

  it.each([false, true])(
    "links authenticated Home refresh back to favourites with Continue Watching: %s",
    async (withContinue) => {
      await mount(
        entries,
        () => undefined,
        { displayName: "Viewer", kind: "authenticated", login: "viewer" },
        withContinue,
      )
      await activate("nav-home")
      await key("ArrowRight")
      if (withContinue) {
        await key("ArrowDown")
        await key("ArrowDown")
      }
      expect(document.activeElement).toBe(button("favourite-alpha-open"))
      await key("ArrowDown")
      await key("ArrowDown")
      expect(document.activeElement).toBe(button("home-refresh"))
      await key("ArrowUp")
      expect(document.activeElement).toBe(button("favourite-charlie-remove"))
    },
  )

  it.each([false, true])(
    "removes a middle entry and rescues the last entry to an existing Home control with Continue Watching: %s",
    async (withContinue) => {
      const { bridge } = await mount(entries, () => undefined, { kind: "guest" }, withContinue)
      await activate("favourite-bravo-remove")
      expect(bridge.favourites.remove).toHaveBeenCalledExactlyOnceWith("bravo")
      expect(document.activeElement).toBe(button("favourite-charlie-open"))
      await activate("favourite-charlie-remove")
      expect(document.activeElement).toBe(button("favourite-alpha-open"))
      await activate("favourite-alpha-remove")
      expect(container.querySelector(".favourites")).toBeNull()
      expect(document.activeElement).toBe(
        button(withContinue ? "continue-recording-open" : "home-sign-in"),
      )
      await key("ArrowDown")
      if (withContinue) await key("ArrowDown")
      expect(document.activeElement).toBe(button("stream-preview-twitch"))
      if (withContinue) {
        await key("ArrowUp")
        expect(document.activeElement).toBe(button("continue-recording-forget"))
      }
      expect(bridge.favourites.list).toHaveBeenCalledTimes(1)
    },
  )

  it.each([false, true])(
    "retains a failed removal and retries through the controller without duplicate writes with Continue Watching: %s",
    async (withContinue) => {
      const removal = deferred<readonly Favourite[]>()
      const retry = deferred<readonly Favourite[]>()
      const { bridge } = await mount(
        [{ login: "alpha" }],
        (api) =>
          api.favourites.remove
            .mockReturnValueOnce(removal.promise)
            .mockReturnValueOnce(retry.promise),
        { kind: "guest" },
        withContinue,
      )
      button("favourite-alpha-open").focus()
      await key("ArrowDown")
      await act(async () => {
        dispatchControllerKey("Enter")
        dispatchControllerKey("Enter")
      })
      expect(bridge.favourites.remove).toHaveBeenCalledTimes(1)
      expect(button("favourite-alpha-remove").getAttribute("aria-disabled")).toBe("true")
      await act(async () => removal.reject(new Error("Disk is read-only")))
      expect(openIds()).toEqual(["favourite-alpha-open"])
      expect(container.querySelector('.favourite-card [role="alert"]')).not.toBeNull()
      expect(document.activeElement).toBe(button("favourite-alpha-remove"))
      await key("ArrowUp")
      await key("ArrowDown")
      await key("Enter")
      expect(bridge.favourites.remove).toHaveBeenCalledTimes(2)
      expect(openIds()).toEqual(["favourite-alpha-open"])
      await act(async () => retry.resolve([]))
      expect(openIds()).toEqual([])
      expect(document.activeElement).toBe(
        button(withContinue ? "continue-recording-open" : "home-sign-in"),
      )
    },
  )

  it("keeps a failed initial read visible and controller-retryable without duplicate reads", async () => {
    const initial = deferred<readonly Favourite[]>()
    const retry = deferred<readonly Favourite[]>()
    const { bridge } = await mount([], (api) =>
      api.favourites.list.mockReturnValueOnce(initial.promise).mockReturnValueOnce(retry.promise),
    )
    expect(container.querySelector('.favourites-status [role="status"]')).not.toBeNull()
    await act(async () => initial.reject(new Error("Cannot read favourites")))
    expect(container.querySelector('.favourites-status [role="alert"]')).not.toBeNull()
    await key("ArrowRight")
    expect(document.activeElement).toBe(button("favourite-retry"))
    await key("ArrowDown")
    expect(document.activeElement).toBe(button("stream-preview-twitch"))
    await key("ArrowUp")
    await act(async () => {
      dispatchControllerKey("Enter")
      dispatchControllerKey("Enter")
    })
    expect(bridge.favourites.list).toHaveBeenCalledTimes(2)
    expect(document.activeElement).toBe(button("home-sign-in"))
    await act(async () => retry.resolve([{ login: "alpha" }]))
    expect(openIds()).toEqual(["favourite-alpha-open"])
    expect(container.querySelector('.favourites-status [role="alert"]')).toBeNull()
  })

  it("keeps failed saves unsaved and retries using the committed list without constructing a player or re-listing", async () => {
    const add = deferred<readonly Favourite[]>()
    const retry = deferred<readonly Favourite[]>()
    const { bridge, constructed } = await mount([], (api) =>
      api.favourites.add.mockReturnValueOnce(add.promise).mockReturnValueOnce(retry.promise),
    )
    await search()
    await key("ArrowRight")
    await act(async () => {
      dispatchControllerKey("Enter")
      dispatchControllerKey("Enter")
    })
    expect(bridge.favourites.add).toHaveBeenCalledTimes(1)
    expect(button("channel-direct-twitch-save").getAttribute("aria-pressed")).toBe("false")
    await act(async () => add.reject(new Error("Disk full")))
    expect(button("channel-direct-twitch-save").getAttribute("aria-pressed")).toBe("false")
    expect(container.querySelector('.channel-result-actions [role="alert"]')).not.toBeNull()
    await key("Enter")
    expect(bridge.favourites.add).toHaveBeenCalledTimes(2)
    await act(async () => retry.resolve([{ login: "other" }, { login: "twitch", userId: "12826" }]))
    expect(button("channel-direct-twitch-save").getAttribute("aria-pressed")).toBe("true")
    expect(container.querySelector('.channel-result-actions [role="alert"]')).toBeNull()
    await key("Escape")
    expect(openIds()).toEqual(["favourite-other-open", "favourite-twitch-open"])
    expect(favourites().items[1]).toEqual({ login: "twitch", userId: "12826" })
    expect(constructed).not.toHaveBeenCalled()
    expect(bridge.favourites.list).toHaveBeenCalledTimes(1)
  })

  it.each(["resolve", "reject"] as const)(
    "ignores an obsolete read %s after a committed removal without resurrecting entries",
    async (outcome) => {
      const obsolete = deferred<readonly Favourite[]>()
      const removal = deferred<readonly Favourite[]>()
      const { bridge } = await mount(entries)
      bridge.favourites.list.mockReturnValueOnce(obsolete.promise)
      bridge.favourites.remove.mockReturnValueOnce(removal.promise)
      await act(async () => {
        void favourites().retry()
      })
      await activate("favourite-bravo-remove")
      await act(async () => {
        void favourites().retry()
        void favourites().remove("alpha")
      })
      expect(bridge.favourites.list).toHaveBeenCalledTimes(2)
      expect(bridge.favourites.remove).toHaveBeenCalledExactlyOnceWith("bravo")
      await act(async () => removal.resolve([{ login: "charlie", userId: "123" }]))
      expect(openIds()).toEqual(["favourite-charlie-open"])
      const before = container.innerHTML
      await act(async () => {
        if (outcome === "resolve") obsolete.resolve(entries)
        else obsolete.reject(new Error("Obsolete read failure"))
      })
      expect(container.innerHTML).toBe(before)
      expect(favourites().items).toEqual([{ login: "charlie", userId: "123" }])
      expect(bridge.favourites.list).toHaveBeenCalledTimes(2)
    },
  )

  it("does not let an obsolete initial read clear a newer pending save", async () => {
    const initial = deferred<readonly Favourite[]>()
    const add = deferred<readonly Favourite[]>()
    const { bridge } = await mount([], (api) => {
      api.favourites.list.mockReturnValueOnce(initial.promise)
      api.favourites.add.mockReturnValueOnce(add.promise)
    })
    await search()
    await key("ArrowRight")
    await key("Enter")
    await act(async () => initial.resolve([{ login: "obsolete" }]))
    expect(favourites().pending).toEqual({ login: "twitch", operation: "add" })
    expect(favourites().items).toEqual([])
    await key("Enter")
    expect(bridge.favourites.add).toHaveBeenCalledTimes(1)
    await act(async () => add.resolve([{ login: "twitch" }]))
    await key("Escape")
    expect(openIds()).toEqual(["favourite-twitch-open"])
    expect(bridge.favourites.list).toHaveBeenCalledTimes(1)
  })

  it("recognizes the IPC marker in a plain Error and makes the limit message visible and escapable", async () => {
    const full = Array.from({ length: 50 }, (_, index) => ({
      login: `channel_${String(index).padStart(2, "0")}`,
    }))
    const failure = deferred<readonly Favourite[]>()
    const { bridge, constructed } = await mount(full, (api) =>
      api.favourites.add.mockReturnValueOnce(failure.promise),
    )
    await search()
    await key("ArrowRight")
    await key("Enter")
    await act(async () =>
      failure.reject(
        new Error(`Error invoking remote method: ${FAVOURITES_LIMIT_ERROR}: store limit`),
      ),
    )
    const alert = container.querySelector('.channel-result-actions [role="alert"]')
    expect(alert).not.toBeNull()
    expect(scrollFeedback).toHaveBeenCalledWith({ behavior: "instant", block: "nearest" })
    expect(document.activeElement).toBe(button("channel-direct-twitch-save"))
    expect(favourites().mutationError?.message).not.toContain(FAVOURITES_LIMIT_ERROR)
    expect(button("channel-direct-twitch-save").getAttribute("aria-pressed")).toBe("false")
    await key("ArrowLeft")
    expect(document.activeElement).toBe(button("channel-direct-twitch"))
    await key("Escape")
    expect(document.activeElement).toBe(button("nav-home"))
    expect(openIds()).toHaveLength(50)
    expect(favourites().items).toEqual(full)
    expect(constructed).not.toHaveBeenCalled()
    expect(bridge.favourites.list).toHaveBeenCalledTimes(1)
  })
})
