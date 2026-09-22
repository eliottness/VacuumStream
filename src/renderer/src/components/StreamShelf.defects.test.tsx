import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { StreamCard } from "../../../shared/contracts"
import { StreamShelf } from "./StreamShelf"

const streams: readonly StreamCard[] = [
  {
    category: "Games",
    id: "first",
    startedAt: "2026-01-01T00:00:00Z",
    tags: [],
    thumbnailUrl: "https://example.com/first.jpg",
    title: "First live stream",
    userId: "1",
    userLogin: "first",
    userName: "First",
    viewerCount: 1200,
  },
  {
    category: "Games",
    id: "second",
    startedAt: "2026-01-01T00:00:00Z",
    tags: [],
    thumbnailUrl: "https://example.com/second.jpg",
    title: "Second live stream",
    userId: "2",
    userLogin: "second",
    userName: "Second",
    viewerCount: 3400,
  },
]

afterEach(() => vi.restoreAllMocks())

describe("StreamShelf defect regressions", () => {
  it.fails("D-xc-performance-4 reuses one compact viewer formatter for all populated cards", () => {
    const numberFormat = vi.spyOn(Intl, "NumberFormat")

    const markup = renderToStaticMarkup(
      <StreamShelf
        emptyMessage="No live streams"
        onSelect={() => undefined}
        streams={streams}
        title="Live now"
      />,
    )

    expect(markup).toContain("1.2K viewers")
    expect(markup).toContain("3.4K viewers")
    expect(numberFormat).toHaveBeenCalledOnce()
  })
})
