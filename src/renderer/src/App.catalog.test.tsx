// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { AuthSnapshot, Page, StreamCard, VacuumStreamApi } from "../../shared/contracts"
import { App } from "./App"
import { dispatchControllerKey } from "./focus-navigation"
import * as controllerModule from "./useAppController"

type Shelf = "following" | "home"
const authenticated: AuthSnapshot = {
  displayName: "Viewer",
  kind: "authenticated",
  login: "viewer",
}
const stream = (id: string): StreamCard => ({
  category: "Music",
  id,
  startedAt: "2026-09-21T12:00:00Z",
  tags: [],
  thumbnailUrl: `https://example.com/${id}.jpg`,
  title: `Live ${id}`,
  userId: `user-${id}`,
  userLogin: `channel${id}`,
  userName: `Channel ${id}`,
  viewerCount: 42,
})
const page = (ids: readonly string[], cursor?: string): Page<StreamCard> => ({
  cursor,
  items: ids.map(stream),
})
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
      followed: vi
        .fn<VacuumStreamApi["catalog"]["followed"]>()
        .mockResolvedValue(page(["following"])),
      followedChannels: vi
        .fn<VacuumStreamApi["catalog"]["followedChannels"]>()
        .mockResolvedValue({ cursor: undefined, items: [] }),
      live: vi.fn<VacuumStreamApi["catalog"]["live"]>().mockResolvedValue(page(["home"])),
      search: vi
        .fn<VacuumStreamApi["catalog"]["search"]>()
        .mockResolvedValue({ cursor: undefined, items: [] }),
      topCategories: vi.fn<VacuumStreamApi["catalog"]["topCategories"]>().mockResolvedValue({
        cursor: undefined,
        items: [{ boxArtUrl: "https://example.com/music.jpg", id: "music", name: "Music" }],
      }),
      videos: vi
        .fn<VacuumStreamApi["catalog"]["videos"]>()
        .mockResolvedValue({ cursor: undefined, items: [] }),
    },
    chatInput: {
      begin: vi.fn<VacuumStreamApi["chatInput"]["begin"]>().mockResolvedValue(undefined),
      end: vi.fn<VacuumStreamApi["chatInput"]["end"]>().mockResolvedValue(undefined),
      onEscape: vi.fn<VacuumStreamApi["chatInput"]["onEscape"]>().mockReturnValue(() => undefined),
    },
    playbackProgress: {
      get: vi.fn<VacuumStreamApi["playbackProgress"]["get"]>().mockResolvedValue(undefined),
      remove: vi.fn<VacuumStreamApi["playbackProgress"]["remove"]>().mockResolvedValue(undefined),
      save: vi.fn<VacuumStreamApi["playbackProgress"]["save"]>().mockResolvedValue(undefined),
    },
    settings: {
      saveClientId: vi.fn<VacuumStreamApi["settings"]["saveClientId"]>(),
      snapshot: vi
        .fn<VacuumStreamApi["settings"]["snapshot"]>()
        .mockResolvedValue({ clientId: "abcdefghijklmnopqrstuvwxyz1234", secureStorage: true }),
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
const requestFor = (bridge: Bridge, shelf: Shelf) =>
  shelf === "home" ? bridge.catalog.live : bridge.catalog.followed

let root: Root | undefined
let container: HTMLDivElement
let observedController: ReturnType<typeof controllerModule.useAppController> | undefined
const realController = controllerModule.useAppController
let horizontalNavigation = true
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  // Keep the real controller key handlers, without running the gamepad polling loop.
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1),
  )
  vi.stubGlobal("cancelAnimationFrame", vi.fn())
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(width < 45rem)" ? horizontalNavigation : true,
  }))
  vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockReturnValue(document.body)
  // Observe the real hook; account changes use its public auth callback, not a timer or a mocked loader.
  vi.spyOn(controllerModule, "useAppController").mockImplementation(() => {
    observedController = realController()
    return observedController
  })
  horizontalNavigation = true
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
  shelf: Shelf,
  configure: (bridge: Bridge) => void = () => undefined,
  auth: AuthSnapshot = authenticated,
) => {
  const bridge = makeBridge(auth)
  configure(bridge)
  vi.stubGlobal("vacuumStream", bridge)
  root = createRoot(container)
  await act(async () => root?.render(<App />))
  if (shelf === "following") await activate("nav-following")
  return bridge
}
const cardIds = () =>
  [...container.querySelectorAll<HTMLButtonElement>(".stream-card")].map(
    ({ dataset: { focusId } }) => focusId,
  )
const settleObsolete = async (
  request: ReturnType<typeof deferred<Page<StreamCard>>>,
  result: "resolve" | "reject",
) => {
  await act(async () => {
    if (result === "resolve") request.resolve(page(["obsolete"], "obsolete-cursor"))
    else request.reject(new Error("Obsolete failure"))
  })
}
const expectNoReauthentication = (bridge: Bridge) => {
  expect(bridge.auth.snapshot).toHaveBeenCalledTimes(1)
  expect(bridge.auth.begin).not.toHaveBeenCalled()
}

describe.each(["home", "following"] as const)("%s live catalog in the mounted App", (shelf) => {
  it("loads only on entry, re-entry and Refresh, replacing the first page without reauthentication", async () => {
    const reentry = deferred<Page<StreamCard>>()
    const refresh = deferred<Page<StreamCard>>()
    const bridge = await mount(shelf, (api) =>
      requestFor(api, shelf)
        .mockResolvedValueOnce(page(["first"], "old-cursor"))
        .mockReturnValueOnce(reentry.promise)
        .mockReturnValueOnce(refresh.promise),
    )
    const request = requestFor(bridge, shelf)
    expect(request).toHaveBeenCalledExactlyOnceWith({ first: 20 })
    if (shelf === "home") expect(bridge.catalog.followed).not.toHaveBeenCalled()
    await activate(`nav-${shelf}`)
    expect(request).toHaveBeenCalledTimes(1)
    await activate("nav-search")
    await activate(`nav-${shelf}`)
    expect(request).toHaveBeenNthCalledWith(2, { first: 20 })
    expect(cardIds()).toEqual(["stream-first"])
    await act(async () => reentry.resolve(page(["second"], "second-cursor")))
    const card = button("stream-second")
    await activate(`${shelf}-refresh`)
    await activate(`${shelf}-refresh`)
    await activate(`nav-${shelf}`)
    expect(request).toHaveBeenCalledTimes(3)
    expect(request).toHaveBeenNthCalledWith(3, { first: 20 })
    expect(button("stream-second")).toBe(card)
    expect(container.querySelector('.shelf[aria-busy="true"]')).not.toBeNull()
    await act(async () => refresh.resolve(page(["third"])))
    expect(cardIds()).toEqual(["stream-third"])
    expect(container.querySelector(`[data-focus-id="${shelf}-more"]`)).toBeNull()
    expectNoReauthentication(bridge)
  })

  it("keeps controller focus on the shelf when a refresh replaces the focused card", async () => {
    // Given a viewer who has moved focus onto a card that the next first page will not contain
    const refresh = deferred<Page<StreamCard>>()
    const bridge = await mount(shelf, (api) =>
      requestFor(api, shelf)
        .mockResolvedValueOnce(page(["first", "second"], "old-cursor"))
        .mockReturnValueOnce(refresh.promise),
    )

    // When the refresh lands with entirely different streams
    await activate(`${shelf}-refresh`)
    await key("ArrowDown")
    expect(document.activeElement).toBe(button("stream-first"))
    await act(async () => refresh.resolve(page(["third", "fourth"])))

    // Then focus stays on a surviving shelf control instead of falling back to the document
    expect(cardIds()).toEqual(["stream-third", "stream-fourth"])
    expect(document.activeElement).toBe(button("stream-third"))
    expect(document.activeElement).not.toBe(document.body)
    expectNoReauthentication(bridge)
  })

  it("refreshes Home on return from playback and Following on its next entry", async () => {
    const bridge = await mount(shelf)
    const homeCalls = bridge.catalog.live.mock.calls.length
    const followedCalls = bridge.catalog.followed.mock.calls.length
    await activate(`stream-${shelf}`)
    expect(container.querySelector(".player-view")).not.toBeNull()
    bridge.catalog.live.mockResolvedValueOnce(page(["returned-home"]))
    await activate("player-back")
    expect(bridge.catalog.live).toHaveBeenCalledTimes(homeCalls + 1)
    expect(bridge.catalog.live).toHaveBeenLastCalledWith({ first: 20 })
    expect(cardIds()).toEqual(["stream-returned-home"])
    expect(bridge.catalog.followed).toHaveBeenCalledTimes(followedCalls)
    if (shelf === "following") {
      bridge.catalog.followed.mockResolvedValueOnce(page(["returned-following"]))
      await activate("nav-following")
      expect(bridge.catalog.followed).toHaveBeenLastCalledWith({ first: 20 })
      expect(cardIds()).toEqual(["stream-returned-following"])
    }
    expectNoReauthentication(bridge)
  })

  it.each([true, false])(
    "forwards opaque cursors, updates duplicate cards and retains controller focus at exhaustion (horizontal navigation: %s)",
    async (horizontal) => {
      horizontalNavigation = horizontal
      const next = deferred<Page<StreamCard>>()
      const bridge = await mount(shelf, (api) =>
        requestFor(api, shelf)
          .mockResolvedValueOnce(page(["1", "2"], "opaque+/=cursor"))
          .mockReturnValueOnce(next.promise),
      )
      const duplicate = button("stream-2")
      button(`nav-${shelf}`).focus()
      await key(horizontal ? "ArrowDown" : "ArrowRight")
      expect(document.activeElement).toBe(button(`${shelf}-refresh`))
      await key("ArrowDown")
      expect(document.activeElement).toBe(button("stream-1"))
      await key("ArrowRight")
      expect(document.activeElement).toBe(duplicate)
      await key("ArrowDown")
      expect(document.activeElement).toBe(button(`${shelf}-more`))
      await act(async () => {
        dispatchControllerKey("Enter")
        dispatchControllerKey("Enter")
      })
      expect(requestFor(bridge, shelf)).toHaveBeenCalledTimes(2)
      expect(requestFor(bridge, shelf)).toHaveBeenLastCalledWith({
        after: "opaque+/=cursor",
        first: 20,
      })
      expect(button(`${shelf}-more`).getAttribute("aria-disabled")).toBe("true")
      const updated = {
        ...stream("2"),
        profileImageUrl: "https://example.com/new-avatar.png",
        title: "Updated metadata",
        viewerCount: 84,
      }
      await act(async () => next.resolve({ cursor: undefined, items: [updated, stream("3")] }))
      expect(cardIds()).toEqual(["stream-1", "stream-2", "stream-3"])
      expect(button("stream-2")).toBe(duplicate)
      expect(duplicate.getAttribute("aria-label")).toContain(updated.title)
      expect(duplicate.querySelector(".avatar img")?.getAttribute("src")).toBe(
        updated.profileImageUrl,
      )
      expect(container.querySelector(`[data-focus-id="${shelf}-more"]`)).toBeNull()
      expect(document.activeElement).toBe(button(`${shelf}-refresh`))
      await key("ArrowLeft")
      expect(document.activeElement).toBe(button(`nav-${shelf}`))
    },
  )

  it("distinguishes initial loading, failure and empty results, with controller-reachable Retry", async () => {
    const first = deferred<Page<StreamCard>>()
    const retry = deferred<Page<StreamCard>>()
    const bridge = await mount(shelf, (api) =>
      requestFor(api, shelf).mockReturnValueOnce(first.promise).mockReturnValueOnce(retry.promise),
    )
    expect(container.querySelector('.shelf [role="status"]')).not.toBeNull()
    expect(container.querySelector(".shelf .empty-state")).toBeNull()
    await activate(`nav-${shelf}`)
    await activate(`${shelf}-refresh`)
    expect(requestFor(bridge, shelf)).toHaveBeenCalledTimes(1)
    await act(async () => first.reject(new Error("Initial unavailable")))
    expect(container.querySelector('.shelf [role="alert"]')).not.toBeNull()
    expect(container.querySelector('.shelf [role="status"]')).toBeNull()
    expect(container.querySelector(".shelf .empty-state")).toBeNull()
    button(`nav-${shelf}`).focus()
    await key("ArrowDown")
    expect(document.activeElement).toBe(button(`${shelf}-refresh`))
    await key("ArrowDown")
    expect(document.activeElement).toBe(button(`${shelf}-retry`))
    await key("Enter")
    expect(requestFor(bridge, shelf)).toHaveBeenNthCalledWith(2, { first: 20 })
    expect(container.querySelector('.shelf [role="alert"]')).toBeNull()
    expect(document.activeElement).toBe(button(`${shelf}-refresh`))
    await act(async () => retry.resolve(page([])))
    expect(container.querySelector(".shelf .empty-state")).not.toBeNull()
    expect(container.querySelector('.shelf[aria-busy="true"]')).toBeNull()
    expect(cardIds()).toEqual([])
    expectNoReauthentication(bridge)
  })

  it.each(["refresh", "more"] as const)(
    "keeps cards mounted after a failed %s and retries exactly that operation",
    async (operation) => {
      const failed = deferred<Page<StreamCard>>()
      const retry = deferred<Page<StreamCard>>()
      const bridge = await mount(shelf, (api) =>
        requestFor(api, shelf)
          .mockResolvedValueOnce(page(["kept"], "saved+/="))
          .mockReturnValueOnce(failed.promise)
          .mockReturnValueOnce(retry.promise),
      )
      const card = button("stream-kept")
      await activate(`${shelf}-${operation}`)
      expect(button("stream-kept")).toBe(card)
      await act(async () => failed.reject(new Error("Recoverable failure")))
      expect(button("stream-kept")).toBe(card)
      expect(container.querySelector('.shelf [role="alert"]')).not.toBeNull()
      expect(container.querySelector(".shelf .empty-state")).toBeNull()
      card.focus()
      await key("ArrowDown")
      expect(document.activeElement).toBe(button(`${shelf}-retry`))
      await key("Enter")
      expect(button("stream-kept")).toBe(card)
      const input = operation === "more" ? { after: "saved+/=", first: 20 } : { first: 20 }
      expect(requestFor(bridge, shelf).mock.calls.slice(1)).toEqual([[input], [input]])
      await act(async () => retry.resolve(page(["new"])))
      expect(cardIds()).toEqual(
        operation === "more" ? ["stream-kept", "stream-new"] : ["stream-new"],
      )
      expect(container.querySelector('.shelf [role="alert"]')).toBeNull()
      expect(document.activeElement).toBe(button(`${shelf}-refresh`))
    },
  )

  describe.each(["resolve", "reject"] as const)("obsolete %s", (result) => {
    it.each(["navigation", "playback", "refresh replacement", "account change"] as const)(
      "cannot install cards, cursors or errors after %s",
      async (departure) => {
        const previous = deferred<Page<StreamCard>>()
        const current = deferred<Page<StreamCard>>()
        const bridge = await mount(shelf, (api) =>
          requestFor(api, shelf)
            .mockResolvedValueOnce(page(["kept"], "old-cursor"))
            .mockReturnValueOnce(previous.promise)
            .mockReturnValueOnce(current.promise)
            .mockResolvedValueOnce(page(["last"])),
        )
        await activate(`${shelf}-more`)
        if (departure === "refresh replacement") {
          await activate(`${shelf}-refresh`)
          await activate(`${shelf}-refresh`)
        } else if (departure === "account change") {
          await act(async () =>
            controller().setAuth({ displayName: "Other", kind: "authenticated", login: "other" }),
          )
          expect(cardIds()).toEqual([])
        } else if (departure === "playback") {
          await activate("stream-kept")
          await activate("player-back")
          if (shelf === "following") await activate("nav-following")
        } else {
          await activate(shelf === "home" ? "nav-following" : "nav-home")
          await activate(`nav-${shelf}`)
        }
        expect(requestFor(bridge, shelf)).toHaveBeenCalledTimes(3)
        expect(requestFor(bridge, shelf)).toHaveBeenLastCalledWith({ first: 20 })
        await act(async () => current.resolve(page(["current"], "current+/=")))
        const beforeObsolete = container.innerHTML
        await settleObsolete(previous, result)
        expect(container.innerHTML).toBe(beforeObsolete)
        expect(cardIds()).toEqual(["stream-current"])
        await activate(`${shelf}-more`)
        expect(requestFor(bridge, shelf)).toHaveBeenLastCalledWith({
          after: "current+/=",
          first: 20,
        })
        expect(cardIds()).toEqual(["stream-current", "stream-last"])
        expectNoReauthentication(bridge)
      },
    )

    it("cannot install state after logout, and the next account starts with no cached shelf", async () => {
      const previous = deferred<Page<StreamCard>>()
      const bridge = await mount(shelf, (api) =>
        requestFor(api, shelf)
          .mockResolvedValueOnce(page(["private"], "private-cursor"))
          .mockReturnValueOnce(previous.promise),
      )
      await activate(`${shelf}-refresh`)
      await key("F10")
      await activate("settings-logout")
      expect(bridge.auth.logout).toHaveBeenCalledTimes(1)
      const signedOut = container.innerHTML
      await settleObsolete(previous, result)
      expect(container.innerHTML).toBe(signedOut)
      expect(controller().live.items).toEqual([])
      expect(controller().followed.items).toEqual([])
      expect(controller().live.cursor).toBeUndefined()
      expect(controller().followed.cursor).toBeUndefined()
      await activate(`nav-${shelf}`)
      expect(requestFor(bridge, shelf)).toHaveBeenCalledTimes(2)
      const next = deferred<Page<StreamCard>>()
      requestFor(bridge, shelf).mockReturnValueOnce(next.promise)
      await act(async () =>
        controller().setAuth({ displayName: "Other", kind: "authenticated", login: "other" }),
      )
      expect(cardIds()).toEqual([])
      expect(requestFor(bridge, shelf)).toHaveBeenLastCalledWith({ first: 20 })
      await act(async () => next.resolve(page(["other"])))
      expect(cardIds()).toEqual(["stream-other"])
      expect(container.querySelector('.shelf [role="alert"]')).toBeNull()
      expect(container.querySelector(`[data-focus-id="${shelf}-more"]`)).toBeNull()
    })
  })
})

describe("independent authenticated catalogs", () => {
  it("installs live results even when top categories fail", async () => {
    const categories = deferred<Page<never>>()
    const live = deferred<Page<StreamCard>>()
    await mount("home", (bridge) => {
      bridge.catalog.topCategories.mockReturnValueOnce(categories.promise)
      bridge.catalog.live.mockReturnValueOnce(live.promise)
    })
    await act(async () => categories.reject(new Error("Categories unavailable")))
    await act(async () => live.resolve(page(["successful"], "next")))
    expect(cardIds()).toEqual(["stream-successful"])
    expect(controller().live.status).toBe("ready")
    expect(controller().live.error).toBe("")
    button("home-more")
  })

  it.each(["home", "following"] as const)(
    "keeps successful %s state when the sibling shelf fails",
    async (shelf) => {
      const bridge = await mount(shelf, (api) =>
        requestFor(api, shelf).mockResolvedValueOnce(page(["successful"], "saved")),
      )
      const sibling = shelf === "home" ? "following" : "home"
      requestFor(bridge, sibling).mockRejectedValueOnce(new Error("Sibling unavailable"))
      await activate(`nav-${sibling}`)
      expect(container.querySelector('.shelf [role="alert"]')).not.toBeNull()
      const successful = shelf === "home" ? controller().live : controller().followed
      expect(successful.items.map((item) => item.id)).toEqual(["successful"])
      expect(successful.cursor).toBe("saved")
      expect(successful.status).toBe("ready")
      const reentry = deferred<Page<StreamCard>>()
      requestFor(bridge, shelf).mockReturnValueOnce(reentry.promise)
      await activate(`nav-${shelf}`)
      expect(cardIds()).toEqual(["stream-successful"])
      expect(container.querySelector('.shelf [role="alert"]')).toBeNull()
      await act(async () => reentry.resolve(page(["current"])))
    },
  )

  it("retains Home results across a failed category selection", async () => {
    const bridge = await mount("home")
    bridge.catalog.live.mockRejectedValueOnce(new Error("Category unavailable"))
    await activate("category-music")
    expect(container.querySelector('.category-view [role="alert"]')).not.toBeNull()
    expect(controller().live.items.map((item) => item.id)).toEqual(["home"])
    const reentry = deferred<Page<StreamCard>>()
    bridge.catalog.live.mockReturnValueOnce(reentry.promise)
    await activate("category-back")
    expect(cardIds()).toEqual(["stream-home"])
    await act(async () => reentry.resolve(page(["fresh"])))
    expect(cardIds()).toEqual(["stream-fresh"])
  })

  it("issues no authenticated catalog request or refresh controls for a guest", async () => {
    const bridge = await mount("home", () => undefined, { kind: "guest" })
    expect(container.querySelector('[data-focus-id="home-refresh"]')).toBeNull()
    await activate("nav-following")
    expect(container.querySelector('[data-focus-id="following-refresh"]')).toBeNull()
    await key("ArrowDown")
    expect(document.activeElement).toBe(button("following-connect"))
    await key("Enter")
    expect(container.querySelector(".settings-panel")).not.toBeNull()
    for (const request of Object.values(bridge.catalog)) expect(request).not.toHaveBeenCalled()
  })
})
