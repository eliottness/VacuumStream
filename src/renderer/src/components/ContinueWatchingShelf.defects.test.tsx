// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ContinueWatchingState } from "../useContinueWatching"
import type { FavouritesState } from "../useFavourites"
import { ContinueWatchingShelf } from "./ContinueWatchingShelf"
import { FavouritesShelf } from "./FavouritesShelf"

const continueError: ContinueWatchingState = {
  error: "Progress unavailable",
  items: [],
  removalError: undefined,
  removingId: undefined,
  status: "error",
}
const continueLoading: ContinueWatchingState = { ...continueError, status: "loading" }
const favouriteError: FavouritesState = {
  error: "Favourites unavailable",
  items: [],
  mutationError: undefined,
  pending: undefined,
  status: "error",
}
const favouriteLoading: FavouritesState = { ...favouriteError, status: "loading" }

const noop = () => undefined
const Surface = ({
  continueWatching,
  favourites,
}: {
  readonly continueWatching: ContinueWatchingState
  readonly favourites: FavouritesState
}) => {
  const continueFallback = favourites.status === "error" ? "favourite-retry" : "home-sign-in"
  const favouriteFallback = continueWatching.status === "error" ? "continue-retry" : "home-sign-in"

  return (
    <>
      <button data-focus-id="home-sign-in" data-focusable="true" type="button">
        Connect Twitch
      </button>
      <ContinueWatchingShelf
        {...continueWatching}
        fallbackFocusId={continueFallback}
        lowerFocusId="home-sign-in"
        onForget={noop}
        onRetry={noop}
        onSelect={noop}
        upperFocusId="nav-home"
      />
      <FavouritesShelf
        {...favourites}
        fallbackFocusId={favouriteFallback}
        lowerFocusId="home-sign-in"
        onOpen={noop}
        onRemove={noop}
        onRetry={noop}
        upperFocusId="nav-home"
      />
    </>
  )
}

let container: HTMLDivElement
let root: Root

const button = (id: string): HTMLButtonElement => {
  const result = container.querySelector<HTMLButtonElement>(`[data-focus-id="${id}"]`)
  if (result === null) throw new Error(`Missing ${id}`)
  return result
}

const render = async (
  continueWatching: ContinueWatchingState,
  favourites: FavouritesState,
): Promise<void> => {
  await act(async () =>
    root.render(<Surface continueWatching={continueWatching} favourites={favourites} />),
  )
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("ContinueWatchingShelf defect regressions", () => {
  it.fails("D-cycle-17-1 keeps the focused Retry controller marker through either sibling shelf completion order", async () => {
    await render(continueError, favouriteLoading)
    button("continue-retry").focus()
    button("continue-retry").setAttribute("data-controller-focused", "true")
    await render(continueError, favouriteError)
    expect.soft(document.activeElement).toBe(button("continue-retry"))
    expect.soft(button("continue-retry").getAttribute("data-controller-focused")).toBe("true")
    expect.soft(button("home-sign-in").hasAttribute("data-controller-focused")).toBe(false)

    await render(continueLoading, favouriteError)
    button("favourite-retry").focus()
    button("favourite-retry").setAttribute("data-controller-focused", "true")
    await render(continueError, favouriteError)
    expect.soft(document.activeElement).toBe(button("favourite-retry"))
    expect.soft(button("favourite-retry").getAttribute("data-controller-focused")).toBe("true")
    expect.soft(button("home-sign-in").hasAttribute("data-controller-focused")).toBe(false)
  })
})
