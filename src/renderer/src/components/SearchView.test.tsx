// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SearchView } from "./SearchView"

const searchView = () => (
  <SearchView
    authenticated
    busy={false}
    onOpen={() => undefined}
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
