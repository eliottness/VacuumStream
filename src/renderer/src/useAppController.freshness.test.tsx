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
  VideoCard,
} from "../../shared/contracts"
import { StreamShelf } from "./components/StreamShelf"
import { useAppController } from "./useAppController"

const authenticated: AuthSnapshot = {
  displayName: "Viewer",
  kind: "authenticated",
  login: "viewer",
}
const category: CategoryCard = {
  boxArtUrl: "https://example.com/category.jpg",
  id: "category",
  name: "Category",
}
const stream: StreamCard = {
  category: "Category",
  id: "stream",
  startedAt: "2026-09-22T12:00:00Z",
  tags: [],
  thumbnailUrl: "https://example.com/stream.jpg",
  title: "Stream",
  userId: "streamer",
  userLogin: "streamer",
  userName: "Streamer",
  viewerCount: 42,
}
const video: VideoCard = {
  createdAt: "2026-09-21T12:00:00Z",
  duration: "1h",
  id: "video",
  publishedAt: "2026-09-21T12:00:00Z",
  thumbnailUrl: "https://example.com/video.jpg",
  title: "Past broadcast",
  userId: "streamer",
  userLogin: "streamer",
  userName: "Streamer",
  viewCount: 42,
}
const streamPage = (items: readonly StreamCard[] = [stream]): Page<StreamCard> => ({
  cursor: undefined,
  items,
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

const makeBridge = () =>
  ({
    auth: {
      begin: vi.fn<VacuumStreamApi["auth"]["begin"]>(),
      logout: vi.fn<VacuumStreamApi["auth"]["logout"]>().mockResolvedValue(undefined),
      openActivation: vi.fn<VacuumStreamApi["auth"]["openActivation"]>(),
      snapshot: vi.fn<VacuumStreamApi["auth"]["snapshot"]>().mockResolvedValue(authenticated),
    },
    catalog: {
      followed: vi.fn<VacuumStreamApi["catalog"]["followed"]>().mockResolvedValue(streamPage()),
      followedChannels: vi
        .fn<VacuumStreamApi["catalog"]["followedChannels"]>()
        .mockResolvedValue({ cursor: undefined, items: [] }),
      live: vi.fn<VacuumStreamApi["catalog"]["live"]>().mockResolvedValue(streamPage()),
      search: vi
        .fn<VacuumStreamApi["catalog"]["search"]>()
        .mockResolvedValue({ cursor: undefined, items: [] }),
      topCategories: vi
        .fn<VacuumStreamApi["catalog"]["topCategories"]>()
        .mockResolvedValue({ cursor: undefined, items: [category] }),
      videos: vi
        .fn<VacuumStreamApi["catalog"]["videos"]>()
        .mockResolvedValue({ cursor: undefined, items: [video] }),
    },
    chatInput: {
      begin: vi.fn<VacuumStreamApi["chatInput"]["begin"]>().mockResolvedValue(undefined),
      end: vi.fn<VacuumStreamApi["chatInput"]["end"]>().mockResolvedValue(undefined),
      onEscape: vi.fn<VacuumStreamApi["chatInput"]["onEscape"]>().mockReturnValue(() => undefined),
      press: vi.fn<VacuumStreamApi["chatInput"]["press"]>().mockResolvedValue(undefined),
    },
    favourites: {
      add: vi.fn<VacuumStreamApi["favourites"]["add"]>().mockResolvedValue([]),
      list: vi.fn<VacuumStreamApi["favourites"]["list"]>().mockResolvedValue([]),
      remove: vi.fn<VacuumStreamApi["favourites"]["remove"]>().mockResolvedValue([]),
    },
    playbackProgress: {
      get: vi.fn<VacuumStreamApi["playbackProgress"]["get"]>().mockResolvedValue(undefined),
      list: vi.fn<VacuumStreamApi["playbackProgress"]["list"]>().mockResolvedValue([]),
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

let root: Root | undefined
let container: HTMLDivElement
let observedController: ReturnType<typeof useAppController> | undefined

const Harness = () => {
  observedController = useAppController()
  return (
    <>
      <StreamShelf
        cursor={observedController.live.cursor}
        error={observedController.live.error}
        emptyMessage="No live channels are available right now."
        focusPrefix="home"
        onLoadMore={() => void observedController?.loadMoreShelf("home")}
        onRefresh={() => void observedController?.refreshShelf("home")}
        onRetry={() => void observedController?.retryShelf("home")}
        onSelect={() => undefined}
        refreshing={
          observedController.live.status === "loading" &&
          observedController.live.operation === "refresh"
        }
        state={observedController.live.status}
        streams={observedController.live.items}
        title="Recommended live"
      />
      <button data-focus-id="catalog-focus" type="button">
        Catalog focus
      </button>
    </>
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
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
  vi.useRealTimers()
})

const controller = () => {
  if (observedController === undefined) throw new Error("Controller is not mounted")
  return observedController
}
const button = (id: string): HTMLButtonElement => {
  const element = container.querySelector<HTMLButtonElement>(`[data-focus-id="${id}"]`)
  if (element === null) throw new Error(`Missing ${id}`)
  return element
}
const advanceCatalogRefresh = async (): Promise<void> => {
  await act(async () => vi.advanceTimersByTimeAsync(60_000))
}
const mount = async (configure: (bridge: Bridge) => void = () => undefined) => {
  const bridge = makeBridge()
  configure(bridge)
  vi.stubGlobal("vacuumStream", bridge)
  root = createRoot(container)
  await act(async () => root?.render(<Harness />))
  return bridge
}

describe("useAppController catalog freshness", () => {
  it("refreshes each active catalog surface every minute, excluding Search", async () => {
    const bridge = await mount()
    const focus = button("catalog-focus")
    focus.focus()
    expect(bridge.catalog.live).toHaveBeenCalledExactlyOnceWith({ first: 20 })
    expect(bridge.catalog.topCategories).toHaveBeenCalledExactlyOnceWith({ first: 20 })

    await advanceCatalogRefresh()
    expect(bridge.catalog.live).toHaveBeenCalledTimes(2)
    expect(bridge.catalog.topCategories).toHaveBeenCalledTimes(2)
    expect(document.activeElement).toBe(focus)

    await act(async () => controller().navigate("following"))
    expect(bridge.catalog.followed).toHaveBeenCalledExactlyOnceWith({ first: 20 })
    await advanceCatalogRefresh()
    expect(bridge.catalog.followed).toHaveBeenCalledTimes(2)
    expect(bridge.catalog.live).toHaveBeenCalledTimes(2)

    await act(async () => controller().showAllChannels())
    expect(bridge.catalog.followedChannels).toHaveBeenCalledExactlyOnceWith({ first: 20 })
    await advanceCatalogRefresh()
    expect(bridge.catalog.followedChannels).toHaveBeenCalledTimes(2)

    await act(async () => controller().showCategory(category))
    expect(bridge.catalog.live).toHaveBeenLastCalledWith({ first: 20, gameId: category.id })
    const categoryCalls = bridge.catalog.live.mock.calls.length
    await advanceCatalogRefresh()
    expect(bridge.catalog.live).toHaveBeenCalledTimes(categoryCalls + 1)
    expect(bridge.catalog.live).toHaveBeenLastCalledWith({ first: 20, gameId: category.id })

    await act(async () => controller().showPastBroadcasts(video.userId))
    expect(bridge.catalog.videos).toHaveBeenCalledExactlyOnceWith({
      first: 30,
      userId: video.userId,
    })
    await advanceCatalogRefresh()
    expect(bridge.catalog.videos).toHaveBeenCalledTimes(2)
    expect(bridge.catalog.videos).toHaveBeenLastCalledWith({ first: 30, userId: video.userId })

    await act(async () => controller().navigate("search"))
    await act(async () => controller().search("streamer"))
    expect(bridge.catalog.search).toHaveBeenCalledExactlyOnceWith({ first: 30, query: "streamer" })
    const catalogCalls = {
      followed: bridge.catalog.followed.mock.calls.length,
      followedChannels: bridge.catalog.followedChannels.mock.calls.length,
      live: bridge.catalog.live.mock.calls.length,
      search: bridge.catalog.search.mock.calls.length,
      topCategories: bridge.catalog.topCategories.mock.calls.length,
      videos: bridge.catalog.videos.mock.calls.length,
    }
    await advanceCatalogRefresh()
    expect(bridge.catalog.followed).toHaveBeenCalledTimes(catalogCalls.followed)
    expect(bridge.catalog.followedChannels).toHaveBeenCalledTimes(catalogCalls.followedChannels)
    expect(bridge.catalog.live).toHaveBeenCalledTimes(catalogCalls.live)
    expect(bridge.catalog.search).toHaveBeenCalledTimes(catalogCalls.search)
    expect(bridge.catalog.topCategories).toHaveBeenCalledTimes(catalogCalls.topCategories)
    expect(bridge.catalog.videos).toHaveBeenCalledTimes(catalogCalls.videos)
  })

  it("does not overlap an automatic refresh for the same surface", async () => {
    const secondRequest = deferred<Page<StreamCard>>()
    const bridge = await mount((api) =>
      api.catalog.live
        .mockResolvedValueOnce(streamPage())
        .mockReturnValueOnce(secondRequest.promise),
    )

    await advanceCatalogRefresh()
    expect(bridge.catalog.live).toHaveBeenCalledTimes(2)
    await advanceCatalogRefresh()
    expect(bridge.catalog.live).toHaveBeenCalledTimes(2)

    await act(async () => secondRequest.resolve(streamPage()))
    await advanceCatalogRefresh()
    expect(bridge.catalog.live).toHaveBeenCalledTimes(3)
  })

  it("pauses automatic refresh in the player and refreshes Home when it closes", async () => {
    const bridge = await mount()
    const focus = button("catalog-focus")
    focus.focus()
    await act(async () => controller().openStream(stream))
    const liveCallsWhilePlaying = bridge.catalog.live.mock.calls.length
    const categoryCallsWhilePlaying = bridge.catalog.topCategories.mock.calls.length

    await advanceCatalogRefresh()
    expect(bridge.catalog.live).toHaveBeenCalledTimes(liveCallsWhilePlaying)
    expect(bridge.catalog.topCategories).toHaveBeenCalledTimes(categoryCallsWhilePlaying)

    await act(async () => controller().navigateHome())
    expect(bridge.catalog.live).toHaveBeenCalledTimes(liveCallsWhilePlaying + 1)
    expect(bridge.catalog.topCategories).toHaveBeenCalledTimes(categoryCallsWhilePlaying + 1)
    expect(document.activeElement).toBe(focus)
  })

  it("keeps manual Refresh focused while automatic work leaves the current focus alone", async () => {
    const bridge = await mount()
    const refresh = button("home-refresh")
    const focus = button("catalog-focus")

    refresh.focus()
    await act(async () => refresh.click())
    expect(document.activeElement).toBe(refresh)
    focus.focus()
    await advanceCatalogRefresh()
    expect(bridge.catalog.live).toHaveBeenCalledTimes(3)
    expect(document.activeElement).toBe(focus)
  })

  it("keeps automatic refresh focus within the StreamShelf when a card is replaced", async () => {
    const replacement = { ...stream, id: "replacement" }
    await mount((api) =>
      api.catalog.live
        .mockResolvedValueOnce(streamPage())
        .mockResolvedValueOnce(streamPage([replacement])),
    )
    const card = button("stream-stream")
    card.focus()

    await advanceCatalogRefresh()

    expect(card.isConnected).toBe(false)
    expect(document.activeElement).toBe(button("stream-replacement"))
  })
})
