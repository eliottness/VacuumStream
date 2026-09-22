// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { PlaybackBookmark } from "../../../shared/contracts"
import { dispatchControllerKey, useControllerNavigation } from "../focus-navigation"
import type { ContinueWatchingState } from "../useContinueWatching"
import { ContinueWatchingShelf } from "./ContinueWatchingShelf"

const items: readonly PlaybackBookmark[] = [
  {
    details: { title: "Evening stream", userId: "1" },
    duration: 10_800,
    position: 3900,
    updatedAt: 2,
    videoId: "a",
  },
  { duration: 3600, position: 65, updatedAt: 1, videoId: "legacy" },
]
const ready: ContinueWatchingState = {
  error: "",
  items,
  removalError: undefined,
  removingId: undefined,
  status: "ready",
}
let root: Root
let container: HTMLDivElement
const onForget = vi.fn<(videoId: string) => void>()
const onRetry = vi.fn<() => void>()
const onSelect = vi.fn<(bookmark: PlaybackBookmark) => void>()
const Surface = ({ state }: { readonly state: ContinueWatchingState }) => {
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
              ? "continue-retry"
              : "home-control"
            : `continue-${first.videoId}-open`
        }
        data-focusable="true"
        type="button"
      >
        Home
      </button>
      <ContinueWatchingShelf
        {...state}
        fallbackFocusId="home-control"
        lowerFocusId="home-control"
        onForget={onForget}
        onRetry={onRetry}
        onSelect={onSelect}
        upperFocusId="nav-home"
      />
      <button
        data-focus-id="home-control"
        data-focus-up={
          state.status === "error"
            ? "continue-retry"
            : last === undefined
              ? "nav-home"
              : `continue-${last.videoId}-forget`
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
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
const render = async (state: ContinueWatchingState = ready) => {
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

describe("ContinueWatchingShelf", () => {
  it("renders text-only cards with saved elapsed and total times, preserving a legacy entry", async () => {
    await render()
    expect(container.querySelectorAll(".continue-card")).toHaveLength(2)
    expect(container.querySelectorAll("img, iframe")).toHaveLength(0)
    expect(button("continue-a-open").querySelector("span")?.textContent).toBe("1:05:00 / 3:00:00")
    expect(button("continue-legacy-open").querySelector("span")?.textContent).toBe(
      "0:01:05 / 1:00:00",
    )
    expect(button("continue-legacy-open").querySelector("strong")?.textContent).toContain("legacy")
    await act(async () => button("continue-legacy-open").click())
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(items[1])
    expect(onForget).not.toHaveBeenCalled()
  })

  it("provides explicit bidirectional controller links and restores the live control edge on empty", async () => {
    await render()
    button("nav-home").focus()
    await key("ArrowRight")
    expect(document.activeElement).toBe(button("continue-a-open"))
    await key("ArrowRight")
    expect(document.activeElement).toBe(button("continue-legacy-open"))
    await key("ArrowDown")
    expect(document.activeElement).toBe(button("continue-legacy-forget"))
    await key("ArrowDown")
    expect(document.activeElement).toBe(button("home-control"))
    await key("ArrowUp")
    expect(document.activeElement).toBe(button("continue-legacy-forget"))
    await key("ArrowLeft")
    expect(document.activeElement).toBe(button("continue-a-forget"))
    await key("ArrowUp")
    await key("ArrowLeft")
    expect(document.activeElement).toBe(button("nav-home"))
    await render({ ...ready, items: [] })
    expect(container.querySelector(".continue-watching")).toBeNull()
    button("home-control").focus()
    await key("ArrowUp")
    expect(document.activeElement).toBe(button("nav-home"))
  })

  it("rescues removed card focus without stealing focus that already moved elsewhere", async () => {
    await render()
    button("continue-a-forget").focus()
    await render({ ...ready, items: items.slice(1) })
    expect(document.activeElement).toBe(button("continue-legacy-open"))
    expect(button("continue-legacy-open").getAttribute("data-controller-focused")).toBe("true")
    button("nav-home").focus()
    await render({ ...ready, items: [] })
    expect(document.activeElement).toBe(button("nav-home"))
    await render()
    button("continue-legacy-open").focus()
    await render({ ...ready, items: [] })
    expect(document.activeElement).toBe(button("home-control"))
  })

  it("keeps pending removal focusable and exposes the failed action for retry", async () => {
    await render({ ...ready, removingId: "a" })
    button("continue-a-forget").focus()
    await key("Enter")
    expect(onForget).not.toHaveBeenCalled()
    expect(button("continue-a-forget").disabled).toBe(false)
    await render({ ...ready, removalError: { message: "Disk full", videoId: "a" } })
    expect(container.querySelector('.continue-card [role="alert"]')).not.toBeNull()
    expect(document.activeElement).toBe(button("continue-a-forget"))
    await key("Enter")
    expect(onForget).toHaveBeenCalledExactlyOnceWith("a")
    expect(container.querySelectorAll(".continue-card")).toHaveLength(2)
  })

  it("keeps loading and read-error states outside an empty row and rescues retry focus", async () => {
    await render({ ...ready, items: [], status: "loading" })
    expect(container.querySelector("section.continue-watching")).toBeNull()
    expect(container.querySelector('[role="status"]')).not.toBeNull()
    await render({ ...ready, error: "File unavailable", items: [], status: "error" })
    button("nav-home").focus()
    await key("ArrowRight")
    expect(document.activeElement).toBe(button("continue-retry"))
    await key("Enter")
    expect(onRetry).toHaveBeenCalledTimes(1)
    await render({ ...ready, items: [], status: "loading" })
    expect(document.activeElement).toBe(button("home-control"))
    await render({ ...ready, items: [] })
    expect(container.querySelector(".continue-watching-status")).toBeNull()
  })
})
