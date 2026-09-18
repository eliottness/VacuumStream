import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
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
})
