// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Favourite } from "../../../shared/contracts"
import { dispatchControllerKey, useControllerNavigation } from "../focus-navigation"
import type { FavouritesState } from "../useFavourites"
import { FavouritesShelf } from "./FavouritesShelf"

const items: readonly Favourite[] = [
  { login: "alpha" },
  { login: "bravo", userId: "123" },
  { login: "charlie" },
]
const ready: FavouritesState = {
  error: "",
  items,
  mutationError: undefined,
  pending: undefined,
  status: "ready",
}
let root: Root
let container: HTMLDivElement
const onOpen = vi.fn<(entry: Favourite) => void>()
const onRemove = vi.fn<(login: string) => void>()
const onRetry = vi.fn<() => void>()
const scrollFeedback = vi.fn()
const Surface = ({ state }: { readonly state: FavouritesState }) => {
  useControllerNavigation()
  const first = state.items[0]
  const last = state.items.at(-1)
  return (
    <>
      <button
        data-focus-id="nav-home"
        data-focus-right={
          first === undefined
            ? state.status === "error"
              ? "favourite-retry"
              : "home-control"
            : `favourite-${first.login}-open`
        }
        data-focusable="true"
        type="button"
      >
        Home
      </button>
      <FavouritesShelf
        {...state}
        fallbackFocusId="home-control"
        lowerFocusId="home-control"
        onOpen={onOpen}
        onRemove={onRemove}
        onRetry={onRetry}
        upperFocusId="nav-home"
      />
      <button
        data-focus-id="home-control"
        data-focus-up={
          state.status === "error"
            ? "favourite-retry"
            : last === undefined
              ? "nav-home"
              : `favourite-${last.login}-remove`
        }
        data-focusable="true"
        type="button"
      >
        Live control
      </button>
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
  document.body.replaceChildren()
  Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView")
  vi.restoreAllMocks()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
const render = async (state: FavouritesState = ready) => {
  await act(async () => root.render(<Surface state={state} />))
}
const button = (id: string): HTMLButtonElement => {
  const result = container.querySelector<HTMLButtonElement>(`[data-focus-id="${id}"]`)
  if (result === null) throw new Error(`Missing ${id}`)
  return result
}
const key = async (value: string) => {
  for (const element of container.querySelectorAll("button")) element.scrollIntoView = vi.fn()
  await act(async () => dispatchControllerKey(value))
}

describe("FavouritesShelf", () => {
  it("renders text-first logins and separate open and remove actions without live artwork", async () => {
    await render()
    expect(container.querySelectorAll(".favourite-card")).toHaveLength(3)
    expect(
      [...container.querySelectorAll(".favourite-card strong")].map((node) => node.textContent),
    ).toEqual(items.map((entry) => entry.login))
    expect(container.querySelectorAll("img, iframe, .live-badge, button button")).toHaveLength(0)
    button("favourite-bravo-open").focus()
    await key("Enter")
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(items[1])
    expect(onRemove).not.toHaveBeenCalled()
    await key("ArrowDown")
    await key("Enter")
    expect(onRemove).toHaveBeenCalledExactlyOnceWith("bravo")
  })

  it("provides explicit bidirectional controller links and restores the live edge when empty", async () => {
    await render()
    button("nav-home").focus()
    await key("ArrowRight")
    expect(document.activeElement).toBe(button("favourite-alpha-open"))
    await key("ArrowRight")
    await key("ArrowRight")
    expect(document.activeElement).toBe(button("favourite-charlie-open"))
    await key("ArrowDown")
    await key("ArrowDown")
    expect(document.activeElement).toBe(button("home-control"))
    await key("ArrowUp")
    expect(document.activeElement).toBe(button("favourite-charlie-remove"))
    await key("ArrowLeft")
    expect(document.activeElement).toBe(button("favourite-bravo-remove"))
    await key("ArrowUp")
    await key("ArrowUp")
    expect(document.activeElement).toBe(button("nav-home"))
    await render({ ...ready, items: [] })
    expect(container.querySelector(".favourites")).toBeNull()
    button("home-control").focus()
    await key("ArrowUp")
    expect(document.activeElement).toBe(button("nav-home"))
  })

  it("rescues middle and last entry focus without stealing focus that already moved", async () => {
    await render()
    button("favourite-bravo-remove").focus()
    await render({ ...ready, items: items.filter((entry) => entry.login !== "bravo") })
    expect(document.activeElement).toBe(button("favourite-charlie-open"))
    expect(button("favourite-charlie-open").getAttribute("data-controller-focused")).toBe("true")
    button("nav-home").focus()
    await render({ ...ready, items: [] })
    expect(document.activeElement).toBe(button("nav-home"))
    await render({ ...ready, items: items.slice(0, 1) })
    button("favourite-alpha-remove").focus()
    await render({ ...ready, items: [] })
    expect(document.activeElement).toBe(button("home-control"))
  })

  it("keeps pending removal focusable and failed removal reachable for controller retry", async () => {
    await render({ ...ready, pending: { login: "alpha", operation: "remove" } })
    button("favourite-alpha-remove").focus()
    await key("Enter")
    expect(onRemove).not.toHaveBeenCalled()
    expect(button("favourite-alpha-remove").disabled).toBe(false)
    await render({
      ...ready,
      mutationError: { login: "alpha", message: "Read-only filesystem", operation: "remove" },
    })
    expect(container.querySelector('.favourite-card [role="alert"]')).not.toBeNull()
    expect(scrollFeedback).toHaveBeenCalledWith({ behavior: "instant", block: "nearest" })
    expect(document.activeElement).toBe(button("favourite-alpha-remove"))
    await key("Enter")
    expect(onRemove).toHaveBeenCalledExactlyOnceWith("alpha")
    expect(container.querySelectorAll(".favourite-card")).toHaveLength(3)
  })

  it("shows loading and read errors outside an empty shelf and rescues retry focus", async () => {
    await render({ ...ready, items: [], status: "loading" })
    expect(container.querySelector("section.favourites")).toBeNull()
    expect(container.querySelector('[role="status"]')).not.toBeNull()
    await render({ ...ready, error: "Unreadable file", items: [], status: "error" })
    button("nav-home").focus()
    await key("ArrowRight")
    expect(document.activeElement).toBe(button("favourite-retry"))
    await key("Enter")
    expect(onRetry).toHaveBeenCalledTimes(1)
    await render({ ...ready, items: [], status: "loading" })
    expect(document.activeElement).toBe(button("home-control"))
    await render({ ...ready, items: [] })
    expect(container.querySelector(".favourites-status")).toBeNull()
  })
})
