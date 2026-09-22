// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { VideoCard } from "../../../shared/contracts"
import { dispatchControllerKey, useControllerNavigation } from "../focus-navigation"
import { VideoShelf } from "./VideoShelf"

const video: VideoCard = {
  createdAt: "2026-09-21T12:00:00Z",
  duration: "1h",
  id: "recording",
  publishedAt: "2026-09-21T12:00:00Z",
  thumbnailUrl: "https://example.com/recording.jpg",
  title: "An archived stream",
  userId: "offline",
  userLogin: "channeloffline",
  userName: "Channel offline",
  viewCount: 42,
}
const onBack = vi.fn()
const onRetry = vi.fn()
const onSelect = vi.fn<(video: VideoCard) => void>()
const Harness = ({
  error = "",
  loading = false,
  videos = [],
}: {
  readonly error?: string
  readonly loading?: boolean
  readonly videos?: readonly VideoCard[]
}) => {
  useControllerNavigation()
  return (
    <VideoShelf
      error={error}
      loading={loading}
      onBack={onBack}
      onRetry={onRetry}
      onSelect={onSelect}
      videos={videos}
    />
  )
}

let root: Root | undefined
let container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1),
  )
  vi.stubGlobal("cancelAnimationFrame", vi.fn())
  vi.stubGlobal("matchMedia", () => ({ matches: true }))
  vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockReturnValue(document.body)
  onBack.mockClear()
  onRetry.mockClear()
  onSelect.mockClear()
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root?.unmount())
  root = undefined
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
const button = (id: string): HTMLButtonElement => {
  const element = container.querySelector<HTMLButtonElement>(`[data-focus-id="${id}"]`)
  if (element === null) throw new Error(`Missing focus target ${id}`)
  element.scrollIntoView = vi.fn()
  return element
}

describe("VideoShelf", () => {
  it("renders an empty archive as a status instead of an empty grid and keeps Back usable", async () => {
    await act(async () => root?.render(<Harness />))
    expect(container.querySelector('.empty-state[role="status"]')).not.toBeNull()
    expect(container.querySelector('[role="status"]')?.textContent?.trim()).not.toBe("")
    expect(container.querySelector(".video-grid")).toBeNull()
    const back = button("videos-back")
    expect(back.getAttribute("data-focusable")).toBe("true")
    back.focus()
    await act(async () => dispatchControllerKey("Enter"))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it("hides stale recordings during loading and failure and routes arrows between Back and Retry", async () => {
    await act(async () => root?.render(<Harness videos={[video]} />))
    button("video-recording")
    await act(async () => root?.render(<Harness loading videos={[video]} />))
    expect(container.querySelector('.videos-view[aria-busy="true"]')).not.toBeNull()
    expect(container.querySelector('[role="status"]')).not.toBeNull()
    expect(container.querySelector(".video-card")).toBeNull()
    expect(container.querySelector(".empty-state")).toBeNull()
    await act(async () => root?.render(<Harness error="Archive unavailable" videos={[video]} />))
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
    expect(container.querySelector(".video-card")).toBeNull()
    const back = button("videos-back")
    const retry = button("videos-retry")
    back.focus()
    await act(async () => dispatchControllerKey("ArrowDown"))
    expect(document.activeElement).toBe(retry)
    await act(async () => dispatchControllerKey("ArrowUp"))
    expect(document.activeElement).toBe(back)
    await act(async () => dispatchControllerKey("ArrowDown"))
    await act(async () => dispatchControllerKey("Enter"))
    expect(onRetry).toHaveBeenCalledTimes(1)
    await act(async () => root?.render(<Harness loading />))
    expect(document.activeElement).toBe(back)
  })

  it("selects a recording through the controller and leaves Back reachable", async () => {
    await act(async () => root?.render(<Harness videos={[video]} />))
    const back = button("videos-back")
    const recording = button("video-recording")
    back.focus()
    await act(async () => dispatchControllerKey("ArrowDown"))
    expect(document.activeElement).toBe(recording)
    await act(async () => dispatchControllerKey("Enter"))
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(video)
    await act(async () => dispatchControllerKey("ArrowUp"))
    expect(document.activeElement).toBe(back)
  })
})
