// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type {
  AuthSnapshot,
  Favourite,
  PlaybackBookmark,
  VacuumStreamApi,
} from "../../shared/contracts"
import { App } from "./App"
import { dispatchControllerKey } from "./focus-navigation"
import * as controllerModule from "./useAppController"
import type { ContinueWatchingState } from "./useContinueWatching"
import * as favouritesModule from "./useFavourites"

const recordings: readonly PlaybackBookmark[] = [
  { duration: 3600, position: 60, updatedAt: 2, videoId: "a" },
  { duration: 3600, position: 120, updatedAt: 1, videoId: "z" },
]
const entries: readonly Favourite[] = [{ login: "alpha" }, { login: "zulu" }]
const authenticated: AuthSnapshot = {
  displayName: "Viewer",
  kind: "authenticated",
  login: "viewer",
}
const realController = controllerModule.useAppController
const realFavourites = favouritesModule.useFavourites
let observedController: ReturnType<typeof realController> | undefined
let observedFavourites: ReturnType<typeof realFavourites> | undefined
let root: Root | undefined
let container: HTMLDivElement

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
    value: vi.fn(),
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
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
const button = (id: string): HTMLButtonElement => {
  const element = container.querySelector<HTMLButtonElement>(`[data-focus-id="${id}"]`)
  if (element === null) throw new Error(`Missing ${id}`)
  return element
}
const connectedBoundaries = () => {
  for (const direction of ["down", "left", "right", "up"]) {
    for (const element of container.querySelectorAll(`[data-focus-${direction}]`)) {
      const target = element.getAttribute(`data-focus-${direction}`)
      expect(target, `${element.getAttribute("data-focus-id")} ${direction}`).toBeTruthy()
      expect(button(String(target)).isConnected).toBe(true)
    }
  }
}

const controller = () => {
  if (observedController === undefined) throw new Error("App not mounted")
  return observedController
}
const favourites = () => {
  if (observedFavourites === undefined) throw new Error("App not mounted")
  return observedFavourites
}
const key = async (value: string, destination: string) => {
  await act(async () => dispatchControllerKey(value))
  expect(document.activeElement).toBe(button(destination))
}
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
const makeBridge = (auth: AuthSnapshot) =>
  ({
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
      end: vi.fn<VacuumStreamApi["chatInput"]["end"]>(),
      onEscape: vi.fn<VacuumStreamApi["chatInput"]["onEscape"]>(),
    },
    favourites: {
      add: vi.fn<VacuumStreamApi["favourites"]["add"]>(),
      list: vi.fn<VacuumStreamApi["favourites"]["list"]>(),
      remove: vi.fn<VacuumStreamApi["favourites"]["remove"]>(),
    },
    playbackProgress: {
      get: vi.fn<VacuumStreamApi["playbackProgress"]["get"]>(),
      list: vi.fn<VacuumStreamApi["playbackProgress"]["list"]>(),
      remove: vi.fn<VacuumStreamApi["playbackProgress"]["remove"]>(),
      save: vi.fn<VacuumStreamApi["playbackProgress"]["save"]>(),
    },
    settings: {
      saveClientId: vi.fn<VacuumStreamApi["settings"]["saveClientId"]>(),
      snapshot: vi
        .fn<VacuumStreamApi["settings"]["snapshot"]>()
        .mockResolvedValue({ clientId: "client", secureStorage: false }),
    },
    system: {
      activateEmbeddedPlayer: vi.fn<VacuumStreamApi["system"]["activateEmbeddedPlayer"]>(),
      isSteamGameMode: vi.fn<VacuumStreamApi["system"]["isSteamGameMode"]>(),
      restoreShellFullscreen: vi.fn<VacuumStreamApi["system"]["restoreShellFullscreen"]>(),
      toggleFullscreen: vi.fn<VacuumStreamApi["system"]["toggleFullscreen"]>(),
    },
  }) satisfies VacuumStreamApi

const staticCases: readonly {
  readonly continuePopulated: boolean
  readonly continueStatus: ContinueWatchingState["status"]
  readonly favouritePopulated: boolean
  readonly favouriteStatus: favouritesModule.FavouritesState["status"]
  readonly name: string
  readonly upper: string | undefined
}[] = [
  {
    continuePopulated: true,
    continueStatus: "ready",
    favouritePopulated: true,
    favouriteStatus: "ready",
    name: "both populated",
    upper: "favourite-zulu-remove",
  },
  {
    continuePopulated: true,
    continueStatus: "loading",
    favouritePopulated: true,
    favouriteStatus: "loading",
    name: "both retaining items during loading",
    upper: "favourite-zulu-remove",
  },
  {
    continuePopulated: true,
    continueStatus: "error",
    favouritePopulated: true,
    favouriteStatus: "error",
    name: "both errors retaining items",
    upper: "favourite-retry",
  },
  {
    continuePopulated: true,
    continueStatus: "ready",
    favouritePopulated: false,
    favouriteStatus: "error",
    name: "empty favourites error",
    upper: "favourite-retry",
  },
  {
    continuePopulated: true,
    continueStatus: "ready",
    favouritePopulated: false,
    favouriteStatus: "loading",
    name: "favourites still loading",
    upper: "continue-z-forget",
  },
  {
    continuePopulated: false,
    continueStatus: "error",
    favouritePopulated: false,
    favouriteStatus: "ready",
    name: "empty Continue Watching error",
    upper: "continue-retry",
  },
  {
    continuePopulated: false,
    continueStatus: "ready",
    favouritePopulated: false,
    favouriteStatus: "ready",
    name: "both empty",
    upper: undefined,
  },
]

describe("Home focus composition", () => {
  describe.each(["guest", "authenticated"] as const)("initially %s", (mode) => {
    it.each(["continue", "favourites"] as const)(
      "keeps boundaries and viewer focus current when %s resolves first, through retry, retained errors, auth changes and last removals",
      async (first) => {
        const continueInitial = deferred<readonly PlaybackBookmark[]>()
        const favouriteInitial = deferred<readonly Favourite[]>()
        const bridge = makeBridge(mode === "authenticated" ? authenticated : { kind: "guest" })
        bridge.playbackProgress.list.mockReturnValueOnce(continueInitial.promise)
        bridge.favourites.list.mockReturnValueOnce(favouriteInitial.promise)
        vi.stubGlobal("vacuumStream", bridge)
        root = createRoot(container)
        await act(async () => root?.render(<App />))
        expect(bridge.playbackProgress.list).toHaveBeenCalledTimes(1)
        expect(bridge.favourites.list).toHaveBeenCalledTimes(1)
        connectedBoundaries()
        let live = mode === "authenticated" ? "home-refresh" : "stream-preview-twitch"
        await key("ArrowRight", mode === "authenticated" ? live : "home-sign-in")
        if (mode === "guest") await key("ArrowDown", live)
        const completion = async (upper: string) => {
          // A completed read must not reclaim focus after the viewer left a remembered card.
          expect(document.activeElement).toBe(button(live))
          connectedBoundaries()
          await key("ArrowUp", upper)
          await key(upper === "nav-home" ? "ArrowRight" : "ArrowDown", live)
        }
        if (first === "continue") {
          await act(async () => continueInitial.resolve(recordings))
          await completion("continue-z-forget")
          await act(async () => favouriteInitial.resolve(entries))
        } else {
          await act(async () => favouriteInitial.resolve(entries))
          await completion("favourite-zulu-remove")
          await act(async () => continueInitial.resolve(recordings))
        }
        await completion("favourite-zulu-remove")
        button("nav-home").focus()
        await key("ArrowRight", "continue-a-open")
        await key("ArrowDown", "continue-a-forget")
        await key("ArrowDown", "favourite-alpha-open")
        await key("ArrowUp", "continue-z-forget")
        await key("ArrowDown", "favourite-alpha-open")

        // Both directions of authentication change replace the live entry, not local focus.
        await act(async () =>
          controller().setAuth(mode === "guest" ? authenticated : { kind: "guest" }),
        )
        expect(document.activeElement).toBe(button("favourite-alpha-open"))
        live = mode === "guest" ? "home-refresh" : "stream-preview-twitch"
        const fallback = mode === "guest" ? "home-refresh" : "home-sign-in"
        connectedBoundaries()
        await key("ArrowDown", "favourite-alpha-remove")
        await key("ArrowDown", live)
        await completion("favourite-zulu-remove")

        const continueRefresh = deferred<readonly PlaybackBookmark[]>()
        const favouriteRefresh = deferred<readonly Favourite[]>()
        bridge.playbackProgress.list.mockReturnValueOnce(continueRefresh.promise)
        bridge.favourites.list.mockReturnValueOnce(favouriteRefresh.promise)
        await act(async () => {
          void controller().continueWatching.retry()
          void favourites().retry()
        })
        expect(controller().continueWatching.status).toBe("loading")
        expect(favourites().status).toBe("loading")
        await completion("favourite-zulu-remove")
        if (first === "continue") {
          await act(async () => continueRefresh.reject(new Error("Progress unavailable")))
          await completion("favourite-zulu-remove")
          await act(async () => favouriteRefresh.reject(new Error("Favourites unavailable")))
        } else {
          await act(async () => favouriteRefresh.reject(new Error("Favourites unavailable")))
          await completion("favourite-retry")
          await act(async () => continueRefresh.reject(new Error("Progress unavailable")))
        }
        expect(controller().continueWatching.items).toEqual(recordings)
        expect(favourites().items).toEqual(entries)
        expect(controller().continueWatching.status).toBe("error")
        expect(favourites().status).toBe("error")
        await completion("favourite-retry")

        const continueRetry = deferred<readonly PlaybackBookmark[]>()
        bridge.playbackProgress.list.mockReturnValueOnce(continueRetry.promise)
        button("favourite-alpha-open").focus()
        await key("ArrowUp", "continue-retry")
        await key("Enter", "favourite-alpha-open")
        expect(bridge.playbackProgress.list).toHaveBeenCalledTimes(3)
        connectedBoundaries()
        await key("ArrowDown", "favourite-alpha-remove")
        await key("ArrowDown", "favourite-retry")
        await key("ArrowDown", live)
        await act(async () => continueRetry.resolve(recordings.slice(0, 1)))
        await completion("favourite-retry")

        const favouriteRetry = deferred<readonly Favourite[]>()
        bridge.favourites.list.mockReturnValueOnce(favouriteRetry.promise)
        await key("ArrowUp", "favourite-retry")
        await key("Enter", "continue-a-open")
        expect(bridge.favourites.list).toHaveBeenCalledTimes(3)
        connectedBoundaries()
        await key("ArrowDown", "continue-a-forget")
        await key("ArrowDown", "favourite-alpha-open")
        await key("ArrowDown", "favourite-alpha-remove")
        await key("ArrowDown", live)
        await act(async () => favouriteRetry.resolve(entries.slice(0, 1)))
        await completion("favourite-alpha-remove")

        const forget = deferred<void>()
        bridge.playbackProgress.remove.mockReturnValueOnce(forget.promise)
        await key("ArrowUp", "favourite-alpha-remove")
        await key("ArrowUp", "favourite-alpha-open")
        await key("ArrowUp", "continue-a-forget")
        await key("Enter", "continue-a-forget")
        await key("ArrowDown", "favourite-alpha-open")
        await key("ArrowDown", "favourite-alpha-remove")
        await key("ArrowDown", live)
        await act(async () => forget.resolve(undefined))
        expect(container.querySelector(".continue-watching")).toBeNull()
        await completion("favourite-alpha-remove")
        expect(button("favourite-alpha-open").getAttribute("data-focus-up")).toBe("nav-home")

        const remove = deferred<readonly Favourite[]>()
        bridge.favourites.remove.mockReturnValueOnce(remove.promise)
        await key("ArrowUp", "favourite-alpha-remove")
        await key("Enter", "favourite-alpha-remove")
        await act(async () => remove.resolve([]))
        expect(container.querySelector(".favourites")).toBeNull()
        expect(document.activeElement).toBe(button(fallback))
        expect(button(fallback).getAttribute("data-controller-focused")).toBe("true")
        connectedBoundaries()
        if (mode === "authenticated") await key("ArrowDown", live)
        await completion(mode === "guest" ? "nav-home" : "home-sign-in")
        expect(bridge.playbackProgress.remove).toHaveBeenCalledExactlyOnceWith("a")
        expect(bridge.favourites.remove).toHaveBeenCalledExactlyOnceWith("alpha")
      },
    )
  })

  describe.each(["guest", "authenticated"] as const)("static %s Home", (mode) => {
    it.each(staticCases)("declares boundaries before effects: $name", (fixture) => {
      vi.mocked(controllerModule.useAppController).mockImplementation(() => {
        const controller = realController()
        return {
          ...controller,
          auth: mode === "authenticated" ? authenticated : { kind: "guest" },
          continueWatching: {
            ...controller.continueWatching,
            items: fixture.continuePopulated ? [...recordings] : [],
            status: fixture.continueStatus,
          },
        }
      })
      vi.mocked(favouritesModule.useFavourites).mockImplementation(() => ({
        ...realFavourites(),
        items: fixture.favouritePopulated ? entries : [],
        status: fixture.favouriteStatus,
      }))
      // Server rendering runs neither layout nor passive effects. Sibling mutation cannot help.
      container.innerHTML = renderToStaticMarkup(<App />)
      const live = mode === "authenticated" ? "home-refresh" : "stream-preview-twitch"
      expect(button(live).getAttribute("data-focus-up")).toBe(
        fixture.upper ?? (mode === "authenticated" ? "nav-home" : "home-sign-in"),
      )
      if (fixture.favouritePopulated) {
        expect(button("favourite-alpha-open").getAttribute("data-focus-up")).toBe(
          fixture.continueStatus === "error" ? "continue-retry" : "continue-z-forget",
        )
      }
      connectedBoundaries()
    })
  })
})
