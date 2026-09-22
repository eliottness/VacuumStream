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
