// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PREVIEW_STREAMS } from "../demo-data"
import { dispatchControllerKey, useControllerNavigation } from "../focus-navigation"
import { StreamShelf } from "./StreamShelf"

let root: Root
let container: HTMLDivElement
let columns: number
const loadMore = vi.fn()
const streams = [
  ...PREVIEW_STREAMS,
  ...PREVIEW_STREAMS.slice(0, 1).map((stream) => ({
    ...stream,
    id: "fifth",
    startedAt: "2026-09-22T12:00:00Z",
  })),
]

const Shelf = ({ cursor }: { cursor?: string }) => {
  useControllerNavigation()
  return (
    <>
      <button data-focus-id="nav-home" data-focusable="true" type="button">
        Home
      </button>
      <StreamShelf
        cursor={cursor}
        emptyMessage="Empty"
        focusPrefix="home"
        onLoadMore={loadMore}
        onRefresh={() => undefined}
        onSelect={() => undefined}
        streams={streams}
        title="Streams"
        wrap
      />
    </>
  )
}
const target = (id: string): HTMLButtonElement => {
  const element = container.querySelector<HTMLButtonElement>(`[data-focus-id="${id}"]`)
  if (element === null) throw new Error(`Missing ${id}`)
  return element
}
const press = async (key: string, destination: string) => {
  await act(async () => dispatchControllerKey(key))
  expect(document.activeElement).toBe(target(destination))
}

beforeEach(() => {
  columns = 3
  loadMore.mockClear()
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.stubGlobal("requestAnimationFrame", () => 1)
  vi.stubGlobal("cancelAnimationFrame", vi.fn())
  vi.stubGlobal("matchMedia", () => ({ matches: false }))
  vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockReturnValue(document.body)
  vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    if (!this.parentElement?.classList.contains("shelf__reel--wrapped")) return 0
    return Math.floor([...this.parentElement.children].indexOf(this) / columns) * 200
  })
  HTMLElement.prototype.scrollIntoView = vi.fn()
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  document.body.replaceChildren()
  Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView")
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("wrapped stream shelf", () => {
  it("uses rendered rows for both arrow axes, boundary controls and viewport resizing", async () => {
    await act(async () => root.render(<Shelf cursor="next" />))
    target("home-refresh").focus()
    await press("ArrowDown", "stream-preview-twitch")
    await press("ArrowRight", "stream-preview-riotgames")
    await press("ArrowDown", "stream-fifth")
    await press("ArrowRight", "home-more")
    await press("ArrowRight", "home-more")
    await press("ArrowUp", "stream-preview-eslcs")
    await press("ArrowUp", "home-refresh")
    target("stream-preview-lck").focus()
    await press("ArrowLeft", "nav-home")

    columns = 2
    window.dispatchEvent(new Event("resize"))
    target("stream-preview-twitch").focus()
    await press("ArrowDown", "stream-preview-eslcs")
    await press("ArrowDown", "stream-fifth")
    await press("ArrowRight", "home-more")
    await press("ArrowUp", "stream-preview-lck")
  })

  it("keeps the same focused trailing element when the final cursor is exhausted", async () => {
    await act(async () => root.render(<Shelf cursor="next" />))
    const trailing = target("home-more")
    trailing.focus()
    await press("Enter", "home-more")
    expect(loadMore).toHaveBeenCalledOnce()
    await act(async () => root.render(<Shelf />))
    expect(target("home-end")).toBe(trailing)
    expect(document.activeElement).toBe(trailing)
    expect(trailing.getAttribute("aria-disabled")).toBe("true")
    expect(trailing.parentElement?.classList.contains("shelf__reel--wrapped")).toBe(true)
    await press("Enter", "home-end")
    expect(loadMore).toHaveBeenCalledOnce()
    await press("ArrowLeft", "stream-fifth")
  })

  it("badges only cards with live stream data, not static guest previews", async () => {
    await act(async () => root.render(<Shelf />))
    for (const stream of PREVIEW_STREAMS) {
      expect(target(`stream-${stream.id}`).querySelector(".live-badge")).toBeNull()
    }
    expect(target("stream-fifth").querySelector(".live-badge")).not.toBeNull()
  })
})
