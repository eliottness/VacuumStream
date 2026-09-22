import { describe, expect, it } from "vitest"
import { z } from "zod"
import {
  CategoryCardSchema,
  FollowedChannelCardSchema,
  PageSchema,
  VideoCardSchema,
} from "../shared/contracts"
import {
  mergeStreamProfiles,
  parseCategoriesResponse,
  parseFollowedChannelsResponse,
  parseStreamsResponse,
  parseUsersResponse,
  parseVideosResponse,
} from "./twitch-schemas"

const wireFollowedChannel = {
  broadcaster_id: "456",
  broadcaster_login: "streamer",
  broadcaster_name: "Streamer",
}

describe("Twitch followed channels parsing", () => {
  it("maps Helix broadcaster fields and the exact cursor into the real followed card contract", () => {
    const page = parseFollowedChannelsResponse({
      data: [
        { ...wireFollowedChannel, followed_at: "2026-09-05T12:00:00Z" },
        {
          broadcaster_id: "789",
          broadcaster_login: "another",
          broadcaster_name: "Another",
        },
      ],
      pagination: { cursor: "opaque+/=cursor" },
      total: 42,
    })

    expect(PageSchema(FollowedChannelCardSchema).parse(page)).toEqual({
      cursor: "opaque+/=cursor",
      items: [
        { displayName: "Streamer", id: "456", isLive: false, login: "streamer" },
        { displayName: "Another", id: "789", isLive: false, login: "another" },
      ],
    })
  })

  it("parses an empty followed channels page without a cursor", () => {
    expect(
      PageSchema(FollowedChannelCardSchema).parse(
        parseFollowedChannelsResponse({ data: [], pagination: {} }),
      ),
    ).toEqual({ cursor: undefined, items: [] })
  })

  it.each([
    null,
    { data: {}, pagination: {} },
    { data: [wireFollowedChannel] },
    { data: [wireFollowedChannel], pagination: { cursor: 123 } },
    { data: [{ ...wireFollowedChannel, broadcaster_id: 456 }], pagination: {} },
    { data: [{ ...wireFollowedChannel, broadcaster_login: undefined }], pagination: {} },
    { data: [{ ...wireFollowedChannel, broadcaster_name: null }], pagination: {} },
  ])("rejects malformed followed channels payload %j", (payload) => {
    expect(() => parseFollowedChannelsResponse(payload)).toThrow(z.ZodError)
  })
})

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

  it("rejects a non-empty malformed video thumbnail URL", () => {
    // Given a Helix video whose non-empty thumbnail is not a URL
    const response = {
      data: [
        {
          created_at: "2026-09-05T12:00:00Z",
          duration: "30m",
          id: "791",
          published_at: "2026-09-05T12:05:00Z",
          thumbnail_url: "not-a-url",
          title: "A malformed broadcast",
          user_id: "456",
          user_login: "streamer",
          user_name: "Streamer",
          view_count: 12,
        },
      ],
      pagination: {},
    }

    // When the page crosses the renderer contract
    const parse = (): unknown => PageSchema(VideoCardSchema).parse(parseVideosResponse(response))

    // Then a malformed non-empty URL remains rejected
    expect(parse).toThrow(z.ZodError)
  })

  it.each([
    {
      created_at: "2026-09-05T12:00:00Z",
      duration: "30m",
      id: "791",
      published_at: "2026-09-05T12:05:00Z",
      thumbnail_url: null,
      title: "A malformed broadcast",
      user_id: "456",
      user_login: "streamer",
      user_name: "Streamer",
      view_count: 12,
    },
    {
      created_at: "2026-09-05T12:00:00Z",
      duration: "30m",
      id: "791",
      published_at: "2026-09-05T12:05:00Z",
      thumbnail_url: "https://example.com/thumb.jpg",
      title: "A malformed broadcast",
      user_id: "456",
      user_login: "streamer",
      user_name: "Streamer",
      view_count: "12",
    },
    {
      created_at: "2026-09-05T12:00:00Z",
      duration: "30m",
      id: "791",
      published_at: "2026-09-05T12:05:00Z",
      thumbnail_url: "https://example.com/thumb.jpg",
      title: "A malformed broadcast",
      user_id: "456",
      user_login: "streamer",
      user_name: "Streamer",
      view_count: -1,
    },
    {
      created_at: "2026-09-05T12:00:00Z",
      duration: "30m",
      id: "791",
      published_at: "2026-09-05T12:05:00Z",
      thumbnail_url: "https://example.com/thumb.jpg",
      title: "A malformed broadcast",
      user_id: "456",
      user_login: "streamer",
      user_name: "Streamer",
      view_count: 3.5,
    },
  ])("D-cycle-09-1: rejects malformed video field types %j", (malformedVideo) => {
    // Given a Helix videos response with invalid field type
    const response = {
      data: [malformedVideo],
      pagination: {},
    }

    // When the untrusted payload crosses the parser boundary
    const parse = (): unknown => parseVideosResponse(response)

    // Then malformed field types are rejected with a ZodError
    expect(parse).toThrow(z.ZodError)
  })
  it("preserves a mixed videos page when one recording has no thumbnail", () => {
    // Given a Helix page containing templated, resolved, and empty artwork values
    const response = {
      data: [
        {
          created_at: "2026-09-05T12:00:00Z",
          duration: "1h2m3s",
          id: "791",
          published_at: "2026-09-05T12:05:00Z",
          thumbnail_url: "https://static-cdn.jtvnw.net/cf_vods/video-791-%{width}x%{height}.jpg",
          title: "A templated broadcast",
          user_id: "456",
          user_login: "streamer",
          user_name: "Streamer",
          view_count: 9876,
        },
        {
          created_at: "2026-09-06T12:00:00Z",
          duration: "30m",
          id: "792",
          published_at: "2026-09-06T12:05:00Z",
          thumbnail_url: "https://static-cdn.jtvnw.net/cf_vods/video-792-320x180.jpg",
          title: "A resolved broadcast",
          user_id: "456",
          user_login: "streamer",
          user_name: "Streamer",
          view_count: 12,
        },
        {
          created_at: "2026-09-07T12:00:00Z",
          duration: "15m",
          id: "793",
          published_at: "2026-09-07T12:05:00Z",
          thumbnail_url: "",
          title: "A broadcast without artwork",
          user_id: "456",
          user_login: "streamer",
          user_name: "Streamer",
          view_count: 3,
        },
      ],
      pagination: { cursor: "mixed-videos" },
    }

    // When the page crosses both the Helix parser and the real preload contract
    const page = PageSchema(VideoCardSchema).parse(parseVideosResponse(response))

    // Then all recordings retain their metadata and order, with only empty artwork absent
    expect(page).toEqual({
      cursor: "mixed-videos",
      items: [
        {
          createdAt: "2026-09-05T12:00:00Z",
          duration: "1h2m3s",
          id: "791",
          publishedAt: "2026-09-05T12:05:00Z",
          thumbnailUrl: "https://static-cdn.jtvnw.net/cf_vods/video-791-320x180.jpg",
          title: "A templated broadcast",
          userId: "456",
          userLogin: "streamer",
          userName: "Streamer",
          viewCount: 9876,
        },
        {
          createdAt: "2026-09-06T12:00:00Z",
          duration: "30m",
          id: "792",
          publishedAt: "2026-09-06T12:05:00Z",
          thumbnailUrl: "https://static-cdn.jtvnw.net/cf_vods/video-792-320x180.jpg",
          title: "A resolved broadcast",
          userId: "456",
          userLogin: "streamer",
          userName: "Streamer",
          viewCount: 12,
        },
        {
          createdAt: "2026-09-07T12:00:00Z",
          duration: "15m",
          id: "793",
          publishedAt: "2026-09-07T12:05:00Z",
          title: "A broadcast without artwork",
          userId: "456",
          userLogin: "streamer",
          userName: "Streamer",
          viewCount: 3,
        },
      ],
    })
    expect(page.items.map(({ id }) => id)).toEqual(["791", "792", "793"])
    expect(page.items[2]).not.toHaveProperty("thumbnailUrl")
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
