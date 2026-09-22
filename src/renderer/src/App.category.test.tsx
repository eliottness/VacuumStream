// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type {
  AuthSnapshot,
  CategoryCard,
  Page,
  StreamCard,
  VacuumStreamApi,
} from "../../shared/contracts"
import { App } from "./App"
import { dispatchControllerKey } from "./focus-navigation"

const categories: readonly CategoryCard[] = [
  { boxArtUrl: "https://example.com/fortnite.jpg", id: "33214", name: "Fortnite" },
  { boxArtUrl: "https://example.com/chatting.jpg", id: "509658", name: "Just Chatting" },
]
const authenticated: AuthSnapshot = {
  displayName: "Viewer",
  kind: "authenticated",
  login: "viewer",
}
const stream = (id: string): StreamCard => ({
  category: "Fortnite",
  id,
  startedAt: "2026-09-21T12:00:00Z",
  tags: [],
  thumbnailUrl: `https://example.com/${id}.jpg`,
  title: `Match ${id}`,
  userId: `user-${id}`,
  userLogin: `player${id}`,
  userName: `Player ${id}`,
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

const makeBridge = (auth: AuthSnapshot) => {
  const categoryLive = vi.fn<VacuumStreamApi["catalog"]["live"]>()
  categoryLive.mockRejectedValue(new Error("Unexpected category request"))
  const bridge = {
    auth: {
      begin: vi.fn<VacuumStreamApi["auth"]["begin"]>(),
      logout: vi.fn<VacuumStreamApi["auth"]["logout"]>().mockResolvedValue(undefined),
      openActivation: vi.fn<VacuumStreamApi["auth"]["openActivation"]>(),
      snapshot: vi.fn<VacuumStreamApi["auth"]["snapshot"]>().mockResolvedValue(auth),
    },
    catalog: {
      followed: vi.fn<VacuumStreamApi["catalog"]["followed"]>().mockResolvedValue(page([])),
      followedChannels: vi
        .fn<VacuumStreamApi["catalog"]["followedChannels"]>()
        .mockResolvedValue({ cursor: undefined, items: [] }),
      live: vi.fn<VacuumStreamApi["catalog"]["live"]>((input) =>
        input.gameId === undefined ? Promise.resolve(page(["home"])) : categoryLive(input),
      ),
      search: vi.fn<VacuumStreamApi["catalog"]["search"]>().mockResolvedValue({
        cursor: undefined,
        items: [],
      }),
      topCategories: vi.fn<VacuumStreamApi["catalog"]["topCategories"]>().mockResolvedValue({
        cursor: undefined,
        items: categories,
      }),
      videos: vi.fn<VacuumStreamApi["catalog"]["videos"]>().mockResolvedValue({
        cursor: undefined,
        items: [],
      }),
    },
    chatInput: {
      begin: vi.fn<VacuumStreamApi["chatInput"]["begin"]>().mockResolvedValue(undefined),
      end: vi.fn<VacuumStreamApi["chatInput"]["end"]>().mockResolvedValue(undefined),
      onEscape: vi.fn<VacuumStreamApi["chatInput"]["onEscape"]>().mockReturnValue(() => undefined),
    },
    playbackProgress: {
      get: vi.fn<VacuumStreamApi["playbackProgress"]["get"]>().mockResolvedValue(undefined),
      list: vi.fn<VacuumStreamApi["playbackProgress"]["list"]>().mockResolvedValue([]),
      remove: vi.fn<VacuumStreamApi["playbackProgress"]["remove"]>().mockResolvedValue(undefined),
      save: vi.fn<VacuumStreamApi["playbackProgress"]["save"]>().mockResolvedValue(undefined),
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
  } satisfies VacuumStreamApi
  return { bridge, categoryLive }
}

let root: Root | undefined
let container: HTMLDivElement

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  // Do not run a gamepad polling loop; the actual controller key handlers stay installed.
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1),
  )
  vi.stubGlobal("cancelAnimationFrame", vi.fn())
  vi.stubGlobal("matchMedia", () => ({ matches: true }))
  vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockReturnValue(document.body)
  container = document.createElement("div")
  document.body.append(container)
})

afterEach(async () => {
  await act(async () => root?.unmount())
  root = undefined
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const mountApp = async (auth: AuthSnapshot = authenticated) => {
  const harness = makeBridge(auth)
  vi.stubGlobal("vacuumStream", harness.bridge)
  root = createRoot(container)
  await act(async () => root?.render(<App />))
  return harness
}

const button = (id: string): HTMLButtonElement => {
  const element = container.querySelector<HTMLButtonElement>(`[data-focus-id="${id}"]`)
  if (element === null) throw new Error(`Missing focus target ${id}`)
  element.scrollIntoView = vi.fn()
  return element
}
const activate = async (id: string): Promise<void> => {
  await act(async () => {
    button(id).focus()
    dispatchControllerKey("Enter")
  })
}
const cardIds = (): (string | undefined)[] =>
  [...container.querySelectorAll<HTMLButtonElement>(".category-view .stream-card")].map(
    ({ dataset: { focusId } }) => focusId,
  )
const settle = async (
  request: ReturnType<typeof deferred<Page<StreamCard>>>,
  result: "resolve" | "reject",
): Promise<void> => {
  await act(async () => {
    if (result === "resolve") request.resolve(page(["obsolete"], "obsolete-cursor"))
    else request.reject(new Error("Obsolete request failed"))
  })
}

describe("category browsing in the mounted App", () => {
  it("paginates with the same category and exact cursor, deduplicates cards and exhausts Load more", async () => {
    const { bridge, categoryLive } = await mountApp()
    const first = deferred<Page<StreamCard>>()
    const next = deferred<Page<StreamCard>>()
    categoryLive.mockReturnValueOnce(first.promise).mockReturnValueOnce(next.promise)

    await activate("category-33214")
    expect(categoryLive).toHaveBeenCalledExactlyOnceWith({ first: 20, gameId: "33214" })
    expect(document.activeElement).toBe(button("category-back"))
    expect(container.querySelector(".category-view h1")?.textContent).toBe(categories[0]?.name)
    expect(container.querySelector('.category-view [aria-busy="true"]')).not.toBeNull()
    expect(container.querySelector('.category-view [role="status"]')).not.toBeNull()
    expect(cardIds()).toEqual([])

    await act(async () => first.resolve(page(["1", "2"], "opaque+/=cursor")))
    expect(cardIds()).toEqual(["stream-1", "stream-2"])
    await activate("category-more")
    expect(categoryLive).toHaveBeenNthCalledWith(2, {
      after: "opaque+/=cursor",
      first: 20,
      gameId: "33214",
    })
    expect(cardIds()).toEqual(["stream-1", "stream-2"])
    expect(button("category-more").getAttribute("aria-disabled")).toBe("true")
    await activate("category-more")
    expect(categoryLive).toHaveBeenCalledTimes(2)

    await act(async () => next.resolve(page(["2", "3"])))
    expect(cardIds()).toEqual(["stream-1", "stream-2", "stream-3"])
    expect(container.querySelector('[data-focus-id="category-more"]')).toBeNull()
    expect(document.activeElement).toBe(button("category-back"))
    expect(bridge.catalog.search).not.toHaveBeenCalled()
    expect(bridge.catalog.live).toHaveBeenCalledWith({ first: 20 })

    await activate("category-back")
    expect(container.querySelector(".home-heading")).not.toBeNull()
    expect(container.querySelector('[data-focus-id="stream-home"]')).not.toBeNull()
    expect(container.querySelector('[data-focus-id="stream-1"]')).toBeNull()
  })

  it("presents zero results without a pagination control", async () => {
    const { categoryLive } = await mountApp()
    const request = deferred<Page<StreamCard>>()
    categoryLive.mockReturnValueOnce(request.promise)
    await activate("category-33214")
    await act(async () => request.resolve(page([])))

    expect(container.querySelector(".category-view .empty-state")).not.toBeNull()
    expect(container.querySelector('.category-view [aria-busy="true"]')).toBeNull()
    expect(container.querySelector('[data-focus-id="category-more"]')).toBeNull()
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(cardIds()).toEqual([])
    expect(document.activeElement).toBe(button("category-back"))
  })

  it("exposes a controller-focusable Retry after initial failure and loads successfully", async () => {
    const { categoryLive } = await mountApp()
    const failed = deferred<Page<StreamCard>>()
    const retry = deferred<Page<StreamCard>>()
    categoryLive.mockReturnValueOnce(failed.promise).mockReturnValueOnce(retry.promise)
    await activate("category-33214")
    await act(async () => failed.reject(new Error("Catalog unavailable")))

    expect(container.querySelector('.category-view [role="alert"]')).not.toBeNull()
    button("category-retry")
    await act(async () => dispatchControllerKey("ArrowDown"))
    expect(document.activeElement).toBe(button("category-retry"))
    await act(async () => dispatchControllerKey("Enter"))
    expect(categoryLive).toHaveBeenNthCalledWith(2, { first: 20, gameId: "33214" })
    expect(container.querySelector('.category-view [role="alert"]')).toBeNull()
    expect(container.querySelector('.category-view [aria-busy="true"]')).not.toBeNull()

    await act(async () => retry.resolve(page(["1"])))
    expect(cardIds()).toEqual(["stream-1"])
    expect(container.querySelector('[data-focus-id="category-retry"]')).toBeNull()
    expect(document.activeElement).toBe(button("category-back"))
  })

  it("retains rendered cards and the next cursor when pagination fails and retries", async () => {
    const { categoryLive } = await mountApp()
    const first = deferred<Page<StreamCard>>()
    const failed = deferred<Page<StreamCard>>()
    const retry = deferred<Page<StreamCard>>()
    categoryLive
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(failed.promise)
      .mockReturnValueOnce(retry.promise)
    await activate("category-33214")
    await act(async () => first.resolve(page(["1"], "next+/=")))
    await activate("category-more")
    await act(async () => failed.reject(new Error("Next page unavailable")))

    expect(cardIds()).toEqual(["stream-1"])
    expect(document.activeElement).toBe(button("category-retry"))
    await activate("category-retry")
    expect(cardIds()).toEqual(["stream-1"])
    expect(categoryLive.mock.calls.slice(1)).toEqual([
      [{ after: "next+/=", first: 20, gameId: "33214" }],
      [{ after: "next+/=", first: 20, gameId: "33214" }],
    ])
    await act(async () => retry.resolve(page(["1", "2"])))
    expect(cardIds()).toEqual(["stream-1", "stream-2"])
    expect(container.querySelector('[data-focus-id="category-more"]')).toBeNull()
  })

  it.each(["resolve", "reject"] as const)(
    "ignores an obsolete %s after controller Back",
    async (result) => {
      const { bridge, categoryLive } = await mountApp()
      const request = deferred<Page<StreamCard>>()
      categoryLive.mockReturnValueOnce(request.promise)
      await activate("category-33214")
      await act(async () => dispatchControllerKey("Escape"))
      const home = container.innerHTML
      expect(document.activeElement).toBe(button("nav-home"))

      await settle(request, result)
      expect(container.innerHTML).toBe(home)
      expect(bridge.system.restoreShellFullscreen).toHaveBeenCalledTimes(1)
    },
  )

  it.each(["resolve", "reject"] as const)(
    "ignores an obsolete %s after a newer category selection",
    async (result) => {
      const { categoryLive } = await mountApp()
      const previous = deferred<Page<StreamCard>>()
      const current = deferred<Page<StreamCard>>()
      categoryLive.mockReturnValueOnce(previous.promise).mockReturnValueOnce(current.promise)
      await activate("category-33214")
      await activate("category-back")
      await activate("category-509658")
      expect(categoryLive).toHaveBeenNthCalledWith(2, { first: 20, gameId: "509658" })
      const loading = container.innerHTML

      await settle(previous, result)
      expect(container.innerHTML).toBe(loading)
      await act(async () => current.resolve(page(["current"])))
      expect(cardIds()).toEqual(["stream-current"])
      expect(container.querySelector(".category-view h1")?.textContent).toBe(categories[1]?.name)
    },
  )

  it.each(["resolve", "reject"] as const)("ignores an obsolete %s after logout", async (result) => {
    const { bridge, categoryLive } = await mountApp()
    const request = deferred<Page<StreamCard>>()
    categoryLive.mockReturnValueOnce(request.promise)
    await activate("category-33214")
    await act(async () => dispatchControllerKey("F10"))
    await activate("settings-logout")
    const settings = container.innerHTML
    expect(bridge.auth.logout).toHaveBeenCalledTimes(1)
    expect(button("settings-sign-in").disabled).toBe(false)

    await settle(request, result)
    expect(container.innerHTML).toBe(settings)
    await activate("nav-home")
    await activate("category-33214")
    expect(categoryLive).toHaveBeenCalledTimes(1)
    expect(container.querySelector(".settings-panel")).not.toBeNull()
  })

  it("routes guest category selection to sign-in without any catalog request", async () => {
    const { bridge } = await mountApp({ kind: "guest" })
    await activate("category-33214")
    expect(container.querySelector(".settings-panel")).not.toBeNull()
    expect(container.querySelector(".notice")).not.toBeNull()
    expect(button("settings-sign-in").disabled).toBe(false)
    expect(document.activeElement).toBe(button("nav-settings"))
    for (const request of Object.values(bridge.catalog)) expect(request).not.toHaveBeenCalled()
  })

  it("opens a category stream with controller input and returns from playback to Home", async () => {
    const { categoryLive } = await mountApp()
    const request = deferred<Page<StreamCard>>()
    categoryLive.mockReturnValueOnce(request.promise)
    await activate("category-33214")
    await act(async () => request.resolve(page(["1"])))
    button("stream-1")
    await act(async () => dispatchControllerKey("ArrowDown"))
    expect(document.activeElement).toBe(button("stream-1"))
    await act(async () => dispatchControllerKey("Enter"))
    expect(container.querySelector(".player-view")).not.toBeNull()
    expect(document.activeElement).toBe(button("player-back"))
    await activate("player-back")
    expect(container.querySelector(".home-heading")).not.toBeNull()
    expect(document.activeElement).toBe(button("nav-home"))
  })
})
