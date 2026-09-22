// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { type VideoCard, VideoCardSchema } from "../../../shared/contracts"
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
const missingArtworkVideo = VideoCardSchema.parse({
  createdAt: "2026-09-20T12:00:00Z",
  duration: "30m",
  id: "recording-without-artwork",
  publishedAt: "2026-09-20T12:00:00Z",
  title: "A recording without artwork",
  userId: "offline",
  userLogin: "channeloffline",
  userName: "Channel offline",
  viewCount: 12,
})
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

  it("falls back to the artwork placeholder when a thumbnail fails to load", async () => {
    await act(async () => root?.render(<Harness videos={[video]} />))
    const image = container.querySelector<HTMLImageElement>(
      'img[src="https://example.com/recording.jpg"]',
    )
    if (image === null) throw new Error("Missing recording thumbnail")
    await act(async () => image.dispatchEvent(new Event("error")))
    expect(
      container.querySelector(".image-fallback.video-card__artwork-placeholder"),
    ).not.toBeNull()
  })

  it("keeps a sibling recording image visible when another thumbnail fails", async () => {
    const sibling = { ...video, id: "sibling", thumbnailUrl: "https://example.com/sibling.jpg" }
    await act(async () => root?.render(<Harness videos={[video, sibling]} />))
    const failedImage = button("video-recording").querySelector<HTMLImageElement>("img")
    const siblingImage = button("video-sibling").querySelector<HTMLImageElement>("img")
    if (failedImage === null || siblingImage === null)
      throw new Error("Missing recording thumbnail")
    await act(async () => failedImage.dispatchEvent(new Event("error")))
    expect(
      button("video-recording").querySelector(".video-card__artwork-placeholder"),
    ).not.toBeNull()
    expect(button("video-sibling").querySelector("img")).toBe(siblingImage)
  })

  it("retries a changed thumbnail without remounting its focusable card", async () => {
    await act(async () => root?.render(<Harness videos={[video]} />))
    const recording = button("video-recording")
    const failedImage = recording.querySelector<HTMLImageElement>("img")
    if (failedImage === null) throw new Error("Missing recording thumbnail")
    await act(async () => failedImage.dispatchEvent(new Event("error")))

    const changedVideo = { ...video, thumbnailUrl: "https://example.com/updated-recording.jpg" }
    await act(async () => root?.render(<Harness videos={[changedVideo]} />))
    const updatedImage = button("video-recording").querySelector<HTMLImageElement>("img")
    expect(button("video-recording")).toBe(recording)
    expect(recording.isConnected).toBe(true)
    expect(recording.getAttribute("data-focusable")).toBe("true")
    recording.focus()
    expect(document.activeElement).toBe(recording)
    expect(updatedImage).not.toBeNull()
    expect(updatedImage).not.toBe(failedImage)
    expect(updatedImage?.getAttribute("src")).toBe(changedVideo.thumbnailUrl)
  })

  it("keeps a validated recording without artwork selectable", async () => {
    await act(async () => root?.render(<Harness videos={[missingArtworkVideo]} />))
    const back = button("videos-back")
    const recording = button("video-recording-without-artwork")
    expect(recording.querySelector('img[src=""]')).toBeNull()
    expect(recording.querySelector(".video-card__artwork-placeholder")).not.toBeNull()
    back.focus()
    await act(async () => dispatchControllerKey("ArrowDown"))
    expect(document.activeElement).toBe(recording)
    await act(async () => dispatchControllerKey("Enter"))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(missingArtworkVideo)
    await act(async () => dispatchControllerKey("ArrowUp"))
    expect(document.activeElement).toBe(back)
  })
})
