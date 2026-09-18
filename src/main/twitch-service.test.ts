import { describe, expect, it } from "vitest"
import type { Page, StreamCard } from "../shared/contracts"
import { enrichStreamProfiles } from "./twitch-service"

describe("Twitch stream enrichment", () => {
  it("preserves streams when optional profile enrichment fails", async () => {
    // Given a valid stream page and an unavailable secondary profile request
    const streams: Page<StreamCard> = {
      cursor: "next",
      items: [
        {
          category: "Just Chatting",
          id: "123",
          startedAt: "2026-09-05T12:00:00Z",
          tags: [],
          thumbnailUrl: "https://static-cdn.jtvnw.net/previews/streamer.jpg",
          title: "A live stream",
          userId: "456",
          userLogin: "streamer",
          userName: "Streamer",
          viewerCount: 4200,
        },
      ],
    }

    // When the optional profile request is rejected
    const enriched = await enrichStreamProfiles(streams, async () => {
      throw new TypeError("Profile service unavailable")
    })

    // Then the primary stream result remains available without an avatar
    expect(enriched).toEqual(streams)
  })
})
