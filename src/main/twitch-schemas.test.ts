import { describe, expect, it } from "vitest"
import { CategoryCardSchema, PageSchema, VideoCardSchema } from "../shared/contracts"
import {
  mergeStreamProfiles,
  parseCategoriesResponse,
  parseStreamsResponse,
  parseUsersResponse,
  parseVideosResponse,
} from "./twitch-schemas"

describe("Twitch response parsing", () => {
  it("maps a Helix stream response into renderer-safe cards", () => {
    // Given a valid Helix response with a replaceable thumbnail template
    const response = {
      data: [
        {
          game_id: "509658",
          game_name: "Just Chatting",
          id: "123",
          is_mature: false,
          language: "en",
          started_at: "2026-09-05T12:00:00Z",
          tags: ["English"],
          thumbnail_url:
            "https://static-cdn.jtvnw.net/previews-ttv/live_user_name-{width}x{height}.jpg",
          title: "A live stream",
          type: "live",
          user_id: "456",
          user_login: "streamer",
          user_name: "Streamer",
          viewer_count: 4200,
        },
      ],
      pagination: { cursor: "next-page" },
    }

    // When the untrusted payload crosses the parser boundary
    const page = parseStreamsResponse(response)

    // Then renderer data is camel-cased and receives a concrete 16:9 image URL
    expect(page).toEqual({
      cursor: "next-page",
      items: [
        {
          category: "Just Chatting",
          id: "123",
          startedAt: "2026-09-05T12:00:00Z",
          tags: ["English"],
          thumbnailUrl: "https://static-cdn.jtvnw.net/previews-ttv/live_user_name-640x360.jpg",
          title: "A live stream",
          userId: "456",
          userLogin: "streamer",
          userName: "Streamer",
          viewerCount: 4200,
        },
      ],
    })
  })

  it("accepts streams whose tags Twitch reports as null", () => {
    // Given a live page where Twitch sends null tags, as observed on a second category page
    const stream = {
      game_name: "Just Chatting",
      id: "123",
      started_at: "2026-09-05T12:00:00Z",
      tags: null,
      thumbnail_url:
        "https://static-cdn.jtvnw.net/previews-ttv/live_user_name-{width}x{height}.jpg",
      title: "A live stream",
      user_id: "456",
      user_login: "streamer",
      user_name: "Streamer",
      viewer_count: 4200,
    }

    // When the payload crosses the parser boundary, with and without the field present
    const nullTags = parseStreamsResponse({ data: [stream], pagination: {} })
    const { tags: _omitted, ...withoutTags } = stream
    const missingTags = parseStreamsResponse({ data: [withoutTags], pagination: {} })

    // Then the page parses and the renderer receives an empty tag list either way
    expect(nullTags.items[0]?.tags).toEqual([])
    expect(missingTags.items[0]?.tags).toEqual([])
  })

  it("maps a Helix videos response into renderer-safe cards with 320x180 thumbnails", () => {
    // Given a valid Helix videos response with a replaceable thumbnail template
    const response = {
      data: [
        {
          created_at: "2026-09-05T12:00:00Z",
          duration: "1h2m3s",
          id: "789",
          published_at: "2026-09-05T12:05:00Z",
          thumbnail_url:
            "https://static-cdn.jtvnw.net/cf_vods/d2c5f3e6/video-789-%{width}x%{height}.jpg",
          title: "A past broadcast",
          user_id: "456",
          user_login: "streamer",
          user_name: "Streamer",
          view_count: 9876,
        },
      ],
      pagination: { cursor: "next-videos" },
    }

    // When the untrusted payload crosses the parser boundary
    const page = PageSchema(VideoCardSchema).parse(parseVideosResponse(response))

    // Then renderer data is camel-cased and receives Twitch's documented VOD image size
    expect(page).toEqual({
      cursor: "next-videos",
      items: [
        {
          createdAt: "2026-09-05T12:00:00Z",
          duration: "1h2m3s",
          id: "789",
          publishedAt: "2026-09-05T12:05:00Z",
          thumbnailUrl: "https://static-cdn.jtvnw.net/cf_vods/d2c5f3e6/video-789-320x180.jpg",
          title: "A past broadcast",
          userId: "456",
          userLogin: "streamer",
          userName: "Streamer",
          viewCount: 9876,
        },
      ],
    })
    expect(page.items[0]?.thumbnailUrl).toContain("320x180")
    expect(page.items[0]?.thumbnailUrl).not.toContain("%{")
  })

  it("preserves an already-resolved video thumbnail URL", () => {
    // Given a valid Helix videos response with a concrete thumbnail URL
    const response = {
      data: [
        {
          created_at: "2026-09-05T12:00:00Z",
          duration: "30m",
          id: "790",
          published_at: "2026-09-05T12:05:00Z",
          thumbnail_url: "https://static-cdn.jtvnw.net/cf_vods/video-790-320x180.jpg",
          title: "An already resolved broadcast",
          user_id: "456",
          user_login: "streamer",
          user_name: "Streamer",
          view_count: 12,
        },
      ],
      pagination: { cursor: "next-resolved" },
    }

    // When the untrusted payload crosses the parser boundary
    const page = PageSchema(VideoCardSchema).parse(parseVideosResponse(response))

    // Then the concrete URL passes through unchanged
    expect(page).toEqual({
      cursor: "next-resolved",
      items: [
        {
          createdAt: "2026-09-05T12:00:00Z",
          duration: "30m",
          id: "790",
          publishedAt: "2026-09-05T12:05:00Z",
          thumbnailUrl: "https://static-cdn.jtvnw.net/cf_vods/video-790-320x180.jpg",
          title: "An already resolved broadcast",
          userId: "456",
          userLogin: "streamer",
          userName: "Streamer",
          viewCount: 12,
        },
      ],
    })
  })

  it("parses an empty Helix videos page", () => {
    // Given an empty videos page from Helix
    const response = { data: [], pagination: {} }

    // When the untrusted payload crosses the parser boundary
    const page = PageSchema(VideoCardSchema).parse(parseVideosResponse(response))

    // Then the renderer receives an empty page
    expect(page).toEqual({ cursor: undefined, items: [] })
  })

  it("keeps category box-art thumbnails at 384x512", () => {
    // Given a valid Helix category response with a replaceable box-art template
    const response = {
      data: [
        {
          box_art_url: "https://static-cdn.jtvnw.net/ttv-boxart/509658-{width}x{height}.jpg",
          id: "509658",
          name: "Just Chatting",
        },
      ],
      pagination: { cursor: "next-categories" },
    }

    // When the untrusted payload crosses the parser boundary
    const page = PageSchema(CategoryCardSchema).parse(parseCategoriesResponse(response))

    // Then category cards retain their documented box-art dimensions
    expect(page.items[0]?.boxArtUrl).toBe(
      "https://static-cdn.jtvnw.net/ttv-boxart/509658-384x512.jpg",
    )
  })

  it("rejects malformed Helix response data", () => {
    // Given an untrusted payload with an invalid viewer count
    const response = { data: [{ viewer_count: -1 }], pagination: {} }

    // When the payload crosses the parser boundary
    const parse = (): unknown => parseStreamsResponse(response)

    // Then malformed data cannot enter the application
    expect(parse).toThrow()
  })

  it("adds broadcaster profile images to live stream cards", () => {
    // Given independently parsed stream and user payloads from Helix
    const streams = parseStreamsResponse({
      data: [
        {
          game_name: "Just Chatting",
          id: "123",
          started_at: "2026-09-05T12:00:00Z",
          tags: [],
          thumbnail_url: "https://static-cdn.jtvnw.net/previews/{width}x{height}.jpg",
          title: "A live stream",
          user_id: "456",
          user_login: "streamer",
          user_name: "Streamer",
          viewer_count: 4200,
        },
      ],
      pagination: {},
    })
    const profiles = parseUsersResponse({
      data: [
        {
          id: "456",
          profile_image_url: "https://static-cdn.jtvnw.net/jtv_user_pictures/streamer.png",
        },
      ],
    })

    // When profile data is joined to the stream page
    const enriched = mergeStreamProfiles(streams, profiles)

    // Then the home card receives the broadcaster's actual profile image
    expect(enriched.items[0]?.profileImageUrl).toBe(
      "https://static-cdn.jtvnw.net/jtv_user_pictures/streamer.png",
    )
  })
})
