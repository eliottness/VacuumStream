import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { PREVIEW_STREAMS } from "../demo-data"
import { StreamShelf } from "./StreamShelf"

describe("stream shelf", () => {
  it("renders broadcaster profile images on stream cards", () => {
    // Given a live stream enriched with its broadcaster profile image
    const stream = {
      category: "Just Chatting",
      id: "123",
      profileImageUrl: "https://static-cdn.jtvnw.net/jtv_user_pictures/streamer.png",
      startedAt: "2026-09-05T12:00:00Z",
      tags: [],
      thumbnailUrl: "https://static-cdn.jtvnw.net/previews/streamer.jpg",
      title: "A live stream",
      userId: "456",
      userLogin: "streamer",
      userName: "Streamer",
      viewerCount: 4200,
    }

    // When the home shelf renders the stream
    const markup = renderToStaticMarkup(
      <StreamShelf
        emptyMessage="No streams"
        onSelect={() => undefined}
        streams={[stream]}
        title="Live"
      />,
    )

    // Then the visible avatar uses the profile image instead of only an initial
    expect(markup).toContain(`src="${stream.profileImageUrl}"`)
  })

  it.each(["error", "loading", "ready"] as const)(
    "keeps populated cards visible in the %s state",
    (state) => {
      const markup = renderToStaticMarkup(
        <StreamShelf
          cursor="next"
          emptyMessage="Empty"
          error="Network failure"
          focusPrefix="home"
          onLoadMore={() => undefined}
          onRefresh={() => undefined}
          onRetry={() => undefined}
          onSelect={() => undefined}
          state={state}
          streams={PREVIEW_STREAMS}
          title="Live"
        />,
      )
      expect(markup.match(/class="stream-card"/g)).toHaveLength(PREVIEW_STREAMS.length)
      expect(markup).not.toContain('class="empty-state"')
      expect(markup).not.toContain('class="stream-skeleton"')
      expect(markup).toContain('data-focus-id="home-refresh"')
      expect(markup).toContain(`data-focus-id="home-${state === "error" ? "retry" : "more"}"`)
      expect(markup).toContain('data-focus-up="home-refresh"')
      expect(markup.includes('role="alert"')).toBe(state === "error")
      expect(markup.includes('role="status"')).toBe(state === "loading")
    },
  )

  it.each(["error", "loading", "ready"] as const)(
    "distinguishes the empty %s state without hiding Refresh",
    (state) => {
      const markup = renderToStaticMarkup(
        <StreamShelf
          emptyMessage="Empty"
          focusPrefix="following"
          onRefresh={() => undefined}
          onRetry={() => undefined}
          onSelect={() => undefined}
          refreshing={state === "loading"}
          state={state}
          streams={[]}
          title="Following"
        />,
      )
      expect(markup).toContain('data-focus-id="following-refresh"')
      expect(markup).not.toContain('data-focus-id="following-more"')
      expect(markup.includes('class="empty-state"')).toBe(state === "ready")
      expect(markup.includes('role="status"')).toBe(state === "loading")
      expect(markup.includes('role="alert"')).toBe(state === "error")
      expect(markup.includes('data-focus-id="following-retry"')).toBe(state === "error")
    },
  )
})
