import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { PREVIEW_STREAMS } from "../demo-data"
import { StreamShelf } from "./StreamShelf"

describe("stream shelf", () => {
  describe.each(["error", "loading", "ready"] as const)("%s entry boundary", (state) => {
    it.each([false, true])(
      "overrides only the entry's Up link and preserves omitted-prop defaults (Refresh: %s)",
      (withRefresh) => {
        const render = (withBoundary: boolean) =>
          renderToStaticMarkup(
            <>
              <button data-focus-id="shelf-upper" data-focusable="true" type="button">
                Previous shelf
              </button>
              <StreamShelf
                {...(withRefresh
                  ? {
                      cursor: "next",
                      focusPrefix: "following",
                      onLoadMore: () => undefined,
                      onRefresh: () => undefined,
                      onRetry: () => undefined,
                    }
                  : {})}
                {...(withBoundary ? { entryUpperFocusId: "shelf-upper" } : {})}
                emptyMessage="Empty"
                onSelect={() => undefined}
                state={state}
                streams={PREVIEW_STREAMS}
                title="Live"
              />
            </>,
          )
        const defaults = render(false)
        const composed = render(true)
        const entryId = withRefresh ? "following-refresh" : "stream-preview-twitch"
        const entryTag = composed.match(
          new RegExp(`<button[^>]*data-focus-id="${entryId}"[^>]*>`),
        )?.[0]
        expect(entryTag).toContain('data-focus-up="shelf-upper"')
        expect(composed.match(/data-focus-up="shelf-upper"/g)).toHaveLength(1)
        const edges = (markup: string) =>
          markup.match(/data-focus-(?:down|id|left|right|up)="[^"]*"/g)
        expect(
          edges(
            composed.replace(
              ' data-focus-up="shelf-upper"',
              withRefresh ? ' data-focus-up="nav-following"' : "",
            ),
          ),
        ).toEqual(edges(defaults))
      },
    )
  })

  it("D-cycle-17-2: preserves the independently specified default card edges", () => {
    const markup = renderToStaticMarkup(
      <>
        <button data-focus-id="shelf-upper" data-focusable="true" type="button">
          Previous shelf
        </button>
        <StreamShelf
          emptyMessage="Empty"
          entryUpperFocusId="shelf-upper"
          onSelect={() => undefined}
          streams={PREVIEW_STREAMS}
          title="Live"
        />
      </>,
    )
    const card = (id: string) =>
      markup.match(new RegExp(`<button[^>]*data-focus-id="stream-${id}"[^>]*>`))?.[0]

    expect(card("preview-twitch")).toContain('data-focus-up="shelf-upper"')
    for (const stream of PREVIEW_STREAMS.slice(1)) {
      expect(card(stream.id)).not.toMatch(/data-focus-(?:down|left|right|up)=/)
    }
    expect(markup).not.toContain('data-focus-id="shelf-upper-refresh"')
    expect(markup).not.toContain('class="shelf__action"')
  })

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
