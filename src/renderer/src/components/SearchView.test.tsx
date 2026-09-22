// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ChannelCard } from "../../../shared/contracts"
import { dispatchControllerKey, useControllerNavigation } from "../focus-navigation"
import type { FavouritesState } from "../useFavourites"
import { SearchView } from "./SearchView"

const emptyFavourites: FavouritesState = {
  error: "",
  items: [],
  mutationError: undefined,
  pending: undefined,
  status: "ready",
}

const searchView = () => (
  <SearchView
    authenticated
    busy={false}
    favourites={emptyFavourites}
    onOpen={() => undefined}
    onRetryFavourites={() => undefined}
    onSave={() => undefined}
    onSearch={() => undefined}
    results={[]}
  />
)

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe("search guidance", () => {
  it("does not describe an authenticated account as signed out", () => {
    // Given an authenticated account on Search
    // When the search view renders
    const markup = renderToStaticMarkup(searchView())

    // Then its guidance reflects full Twitch discovery
    expect(markup).toContain("Search channels and categories across Twitch.")
    expect(markup).not.toContain("Signed-out")
  })

  it("declares deterministic controller exits from the search input", () => {
    // Given the controller-first Search screen
    // When its focus graph is rendered
    const markup = renderToStaticMarkup(searchView())

    // Then every direction can leave the text field without geometry heuristics
    expect(markup).toContain('data-focus-left="nav-search"')
    expect(markup).toContain('data-focus-up="nav-search"')
    expect(markup).toContain('data-focus-right="search-submit"')
    expect(markup).toContain('data-focus-down="search-key-q"')
  })

  it("shows a controller keyboard as soon as Search opens", () => {
    // Given the Search view
    // When it is rendered
    const markup = renderToStaticMarkup(searchView())

    // Then text entry is available without a separate Steam overlay action
    expect(markup).toContain('aria-label="On-screen keyboard"')
    expect(markup).toContain('data-focus-id="search-key-q"')
    expect(markup).toContain('data-focus-up="search-input"')
  })

  it("enters and removes search text from controller keyboard buttons", async () => {
    // Given Search with its input focused
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
      configurable: true,
      value: true,
    })
    const container = document.createElement("div")
    document.body.append(container)
    const root = createRoot(container)
    await act(async () => root.render(searchView()))
    const input = container.querySelector<HTMLInputElement>("#channel-search")

    // When controller keyboard keys are activated
    await act(async () =>
      container.querySelector<HTMLButtonElement>("[aria-label='Type q']")?.click(),
    )
    await act(async () =>
      container.querySelector<HTMLButtonElement>("[aria-label='Type space']")?.click(),
    )
    await act(async () =>
      container.querySelector<HTMLButtonElement>("[aria-label='Backspace']")?.click(),
    )

    // Then the search field receives the edited value
    expect(input?.value).toBe("q")

    await act(async () => root.unmount())
  })
})

const channel: ChannelCard = {
  category: "Games",
  displayName: "Broadcaster",
  id: "123",
  isLive: false,
  login: "broadcaster",
  thumbnailUrl: "https://example.com/channel.png",
  title: "A channel",
}

describe("search favourites controls", () => {
  let root: Root
  let container: HTMLDivElement
  const onOpen = vi.fn<(entry: ChannelCard) => void>()
  const onRetry = vi.fn<() => void>()
  const onSave = vi.fn<(entry: ChannelCard) => void>()
  const scrollFeedback = vi.fn()
  const Surface = ({ state }: { readonly state: FavouritesState }) => {
    useControllerNavigation()
    return (
      <>
        <button
          data-focus-id="nav-search"
          data-focus-right="search-input"
          data-focusable="true"
          type="button"
        >
          Search navigation
        </button>
        <SearchView
          authenticated
          busy={false}
          favourites={state}
          onOpen={onOpen}
          onRetryFavourites={onRetry}
          onSave={onSave}
          onSearch={() => undefined}
          results={[channel]}
        />
      </>
    )
  }
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
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView")
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })
  const render = async (state = emptyFavourites) => {
    await act(async () => root.render(<Surface state={state} />))
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

  it("reaches separate Save and Open actions from Search through the real controller dispatch path", async () => {
    await render()
    button("search-submit").focus()
    await key("ArrowDown")
    expect(document.activeElement).toBe(button("channel-123"))
    await key("ArrowRight")
    expect(document.activeElement).toBe(button("channel-123-save"))
    await key("Enter")
    expect(onSave).toHaveBeenCalledExactlyOnceWith(channel)
    expect(onOpen).not.toHaveBeenCalled()
    expect(container.querySelectorAll("button button")).toHaveLength(0)
    await key("ArrowLeft")
    await key("Enter")
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(channel)
    await key("ArrowUp")
    expect(document.activeElement).toBe(button("search-submit"))
  })

  it("keeps pending and saved actions focusable without submitting another save", async () => {
    await render({ ...emptyFavourites, pending: { login: "broadcaster", operation: "add" } })
    button("channel-123-save").focus()
    await key("Enter")
    expect(onSave).not.toHaveBeenCalled()
    expect(button("channel-123-save").disabled).toBe(false)
    expect(button("channel-123-save").getAttribute("aria-pressed")).toBe("false")
    await render({ ...emptyFavourites, items: [{ login: "broadcaster", userId: "123" }] })
    expect(button("channel-123-save").getAttribute("aria-pressed")).toBe("true")
    await key("Enter")
    expect(onSave).not.toHaveBeenCalled()
    await key("ArrowLeft")
    expect(document.activeElement).toBe(button("channel-123"))
  })

  it("keeps save failure visible with controller retry and exits back to navigation", async () => {
    await render({
      ...emptyFavourites,
      mutationError: { login: "broadcaster", message: "Disk full", operation: "add" },
    })
    expect(container.querySelector('.channel-result-actions [role="alert"]')).not.toBeNull()
    expect(scrollFeedback).toHaveBeenCalledWith({ behavior: "instant", block: "nearest" })
    button("channel-123-save").focus()
    expect(button("channel-123-save").getAttribute("aria-pressed")).toBe("false")
    await key("Enter")
    expect(onSave).toHaveBeenCalledExactlyOnceWith(channel)
    await key("ArrowLeft")
    await key("ArrowLeft")
    expect(document.activeElement).toBe(button("nav-search"))
  })

  it("reaches a failed-read retry before results and rescues focus when retry begins", async () => {
    await render({ ...emptyFavourites, error: "Unreadable favourites", status: "error" })
    button("search-submit").focus()
    await key("ArrowDown")
    expect(document.activeElement).toBe(button("search-favourites-retry"))
    await key("Enter")
    expect(onRetry).toHaveBeenCalledTimes(1)
    await render({ ...emptyFavourites, status: "loading" })
    expect(document.activeElement).toBe(button("search-submit"))
    await key("ArrowDown")
    expect(document.activeElement).toBe(button("channel-123"))
  })
})

describe("native gamepad Search editing", () => {
  let root: Root
  let container: HTMLDivElement
  let nextFrame: FrameRequestCallback | undefined
  let pressedButtons: readonly number[] = []
  const onOpen = vi.fn<(entry: ChannelCard) => void>()
  const onSearch = vi.fn<(query: string) => void>()
  const keys: string[] = []
  const recordKey = (event: KeyboardEvent) => keys.push(event.key)
  const Surface = ({ busy }: { readonly busy: boolean }) => {
    useControllerNavigation()
    return (
      <>
        <button data-focus-id="nav-search" type="button">
          Search navigation
        </button>
        <SearchView
          authenticated
          busy={busy}
          favourites={{ ...emptyFavourites, error: "Read failed", status: "error" }}
          onOpen={onOpen}
          onRetryFavourites={() => undefined}
          onSave={() => undefined}
          onSearch={onSearch}
          results={[channel]}
        />
      </>
    )
  }
  beforeEach(() => {
    keys.length = 0
    pressedButtons = []
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
    vi.stubGlobal("navigator", {
      getGamepads: () => [
        {
          axes: [0, 0],
          buttons: Array.from({ length: 16 }, (_, index) => ({
            pressed: pressedButtons.includes(index),
          })),
          connected: true,
        },
      ],
    })
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      nextFrame = callback
      return 1
    })
    vi.stubGlobal("cancelAnimationFrame", vi.fn())
    container = document.createElement("div")
    document.body.append(container)
    document.addEventListener("keydown", recordKey)
    root = createRoot(container)
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    document.removeEventListener("keydown", recordKey)
    onOpen.mockClear()
    onSearch.mockClear()
    vi.unstubAllGlobals()
  })
  const render = async (busy = false) => {
    await act(async () => root.render(<Surface busy={busy} />))
  }
  const target = (id: string): HTMLElement => {
    const element = container.querySelector<HTMLElement>(`[data-focus-id="${id}"]`)
    if (element === null) throw new Error(`Missing ${id}`)
    return element
  }
  const input = (): HTMLInputElement => {
    const element = container.querySelector<HTMLInputElement>("#channel-search")
    if (element === null) throw new Error("Missing Search input")
    return element
  }
  const typeQuery = async (query: string) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
    if (setter === undefined) throw new Error("Missing native input setter")
    await act(async () => {
      setter.call(input(), query)
      input().dispatchEvent(new Event("input", { bubbles: true }))
    })
  }
  const frame = async (now: number, button?: number) => {
    pressedButtons = button === undefined ? [] : [button]
    const callback = nextFrame
    if (callback === undefined) throw new Error("No scheduled gamepad frame")
    nextFrame = undefined
    await act(async () => callback(now))
  }
  const editingTargets = [
    "search-input",
    "search-submit",
    "search-key-q",
    "search-key-space",
    "search-key-backspace",
    "search-key-clear",
    "search-key-submit",
  ]

  it.each(editingTargets)(
    "deletes one trailing code point per west press at %s without moving focus or navigating",
    async (id) => {
      await render()
      await typeQuery("a\u{1f600}")
      const focused = target(id)
      focused.focus()
      await frame(1, 2)
      expect(input().value).toBe("a")
      expect(document.activeElement).toBe(focused)
      for (const now of [501, 601, 1601]) await frame(now, 2)
      expect(input().value).toBe("a")
      await frame(1602)
      await frame(1603, 2)
      expect(input().value).toBe("")
      await frame(1604)
      await frame(1605, 2)
      expect(input().value).toBe("")
      expect(document.activeElement).toBe(focused)
      expect(keys).toEqual([])
      expect(onSearch).not.toHaveBeenCalled()
      expect(onOpen).not.toHaveBeenCalled()
    },
  )

  it.each(editingTargets)(
    "submits a trimmed query once per north press at %s without opening a result or moving focus",
    async (id) => {
      await render()
      await typeQuery("  twitch  ")
      const focused = target(id)
      focused.focus()
      await frame(1, 3)
      expect(onSearch).toHaveBeenCalledExactlyOnceWith("twitch")
      for (const now of [501, 601, 1601]) await frame(now, 3)
      expect(onSearch).toHaveBeenCalledTimes(1)
      await frame(1602)
      await frame(1603, 3)
      expect(onSearch.mock.calls).toEqual([["twitch"], ["twitch"]])
      expect(input().value).toBe("  twitch  ")
      expect(document.activeElement).toBe(focused)
      expect(keys).toEqual([])
      expect(onOpen).not.toHaveBeenCalled()
    },
  )

  it.each([
    { busy: false, query: "" },
    { busy: false, query: "   " },
    { busy: true, query: "twitch" },
  ])("consumes empty or busy north presses as no-ops: $busy, '$query'", async ({ busy, query }) => {
    await render(busy)
    await typeQuery(query)
    for (const [index, id] of ["search-input", "search-key-q", "search-key-clear"].entries()) {
      const focused = target(id)
      focused.focus()
      await frame(index * 1000)
      await frame(index * 1000 + 1, 3)
      await frame(index * 1000 + 501, 3)
      await frame(index * 1000 + 601, 3)
      expect(document.activeElement).toBe(focused)
    }
    expect(input().value).toBe(query)
    expect(keys).toEqual([])
    expect(onSearch).not.toHaveBeenCalled()
    expect(onOpen).not.toHaveBeenCalled()
  })

  it.each(["nav-search", "channel-123", "channel-123-save", "search-favourites-retry"])(
    "leaves both face buttons on the slash route outside editing at %s",
    async (id) => {
      await render()
      await typeQuery("twitch")
      const focused = target(id)
      focused.focus()
      await frame(1, 2)
      await frame(2, 3)
      expect(keys).toEqual(["/", "/"])
      expect(input().value).toBe("twitch")
      expect(document.activeElement).toBe(focused)
      expect(onSearch).not.toHaveBeenCalled()
      expect(onOpen).not.toHaveBeenCalled()
    },
  )

  it("shares code-point deletion and guarded submission with both visible Search buttons", async () => {
    await render()
    await typeQuery(" twitch\u{1f600}")
    await act(async () => target("search-key-backspace").click())
    expect(input().value).toBe(" twitch")
    await act(async () => target("search-submit").click())
    await act(async () => target("search-key-submit").click())
    expect(onSearch.mock.calls).toEqual([["twitch"], ["twitch"]])
    await render(true)
    await act(async () => target("search-submit").click())
    await act(async () => target("search-key-submit").click())
    await render(false)
    await typeQuery(" ")
    await act(async () => target("search-submit").click())
    await act(async () => target("search-key-submit").click())
    expect(onSearch).toHaveBeenCalledTimes(2)
  })

  it("keeps physical and Steam Input keyboard events on their existing text and form routes", async () => {
    await render()
    await typeQuery("typed/")
    for (const key of ["/", "Backspace", "Enter"]) {
      await act(async () => {
        input().dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key }))
      })
    }
    expect(input().value).toBe("typed/")
    expect(keys).toEqual(["/", "Backspace", "Enter"])
    expect(onSearch).not.toHaveBeenCalled()
    // The browser's normal text change and form submit still reach React's existing handlers.
    await typeQuery(" typed ")
    const form = input().form
    if (form === null) throw new Error("Missing Search form")
    await act(async () => form.requestSubmit())
    expect(onSearch).toHaveBeenCalledExactlyOnceWith("typed")
    expect(document.activeElement).toBe(input())
    expect(onOpen).not.toHaveBeenCalled()
  })
})
