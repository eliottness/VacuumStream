import { tmpdir } from "node:os"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"
import {
  ClientIdSchema,
  FollowedChannelCardSchema,
  type Page,
  PageSchema,
  type StreamCard,
} from "../shared/contracts"
import { SettingsStore } from "./settings-store"
import { TokenVault } from "./token-vault"
import { TwitchAuth } from "./twitch-auth"
import { ConfigurationError } from "./twitch-errors"
import { enrichStreamProfiles, TwitchService } from "./twitch-service"

const makeService = (): TwitchService =>
  new TwitchService(
    new SettingsStore(tmpdir()),
    new TokenVault(tmpdir(), {
      backend: () => "gnome_libsecret",
      decrypt: (value) => value.toString("utf8"),
      encrypt: (value) => Buffer.from(value),
      isAvailable: () => true,
    }),
  )

const wireStream = {
  game_name: "Fortnite",
  id: "stream-1",
  started_at: "2026-09-21T12:00:00Z",
  tags: [],
  thumbnail_url: "https://static-cdn.jtvnw.net/previews/{width}x{height}.jpg",
  title: "Live match",
  user_id: "user-1",
  user_login: "player1",
  user_name: "Player1",
  viewer_count: 42,
}

const wireFollows = [
  { broadcaster_id: "user-2", broadcaster_login: "player2", broadcaster_name: "Player2" },
  { broadcaster_id: "user-1", broadcaster_login: "player1", broadcaster_name: "Player1" },
  { broadcaster_id: "user-3", broadcaster_login: "player3", broadcaster_name: "Player3" },
]

const requests = vi.fn<typeof fetch>()

beforeEach(() => {
  // Ky's bounded request timeout is not the behavior under test.
  vi.useFakeTimers()
  requests.mockReset()
  vi.stubGlobal("fetch", requests)
  vi.spyOn(TwitchAuth.prototype, "credentials").mockResolvedValue({
    clientId: ClientIdSchema.parse("abcdefghijklmnopqrstuvwxyz1234"),
    identity: {
      client_id: "abcdefghijklmnopqrstuvwxyz1234",
      expires_in: 3600,
      login: "viewer",
      scopes: ["user:read:follows"],
      user_id: "viewer-id",
    },
    token: {
      accessToken: "existing-user-token",
      expiresAt: "2099-01-01T00:00:00Z",
      refreshToken: "refresh",
    },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const sentRequests = (): Request[] =>
  requests.mock.calls.map(([request]) => {
    if (!(request instanceof Request)) throw new TypeError("Expected a wire Request")
    return request
  })

describe("Twitch category streams", () => {
  it("gets category 33214 from streams and retains batched profile enrichment", async () => {
    requests
      .mockResolvedValueOnce(
        Response.json({
          data: [wireStream, { ...wireStream, id: "stream-2" }],
          pagination: { cursor: "next+/=" },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: [{ id: "user-1", profile_image_url: "https://example.com/avatar.png" }],
        }),
      )
    const page = await makeService().live({ gameId: "33214" })

    const wire = sentRequests()
    expect(wire.map((request) => [request.method, request.url])).toEqual([
      ["GET", "https://api.twitch.tv/helix/streams?first=20&game_id=33214"],
      ["GET", "https://api.twitch.tv/helix/users?id=user-1"],
    ])
    expect(wire.every((request) => !new URL(request.url).searchParams.has("gameId"))).toBe(true)
    expect(wire[0]?.headers.get("Authorization")).toBe("Bearer existing-user-token")
    expect(page.cursor).toBe("next+/=")
    expect(page.items.map((stream) => stream.profileImageUrl)).toEqual([
      "https://example.com/avatar.png",
      "https://example.com/avatar.png",
    ])
    expect(page.items[0]?.thumbnailUrl).toBe("https://static-cdn.jtvnw.net/previews/640x360.jpg")
  })

  it("repeats the category filter with the exact returned cursor", async () => {
    requests.mockResolvedValueOnce(Response.json({ data: [], pagination: {} }))
    await makeService().live({ after: "next+/=", first: 20, gameId: "33214" })
    expect(sentRequests().map((request) => request.url)).toEqual([
      "https://api.twitch.tv/helix/streams?after=next%2B%2F%3D&first=20&game_id=33214",
    ])
  })

  it("keeps the unfiltered Home request byte-identical", async () => {
    requests.mockResolvedValueOnce(Response.json({ data: [], pagination: {} }))
    await makeService().live({ first: 20 })
    expect(sentRequests().map((request) => [request.method, request.url])).toEqual([
      ["GET", "https://api.twitch.tv/helix/streams?first=20"],
    ])
  })

  it("rejects an invalid category before requesting Twitch", async () => {
    await expect(makeService().live({ gameId: "" })).rejects.toBeInstanceOf(z.ZodError)
    expect(requests).not.toHaveBeenCalled()
  })
})

describe.each(["live", "followed"] as const)("Twitch %s shelf pages", (endpoint) => {
  it("keeps first-page wire parameters, forwards the opaque cursor and batches broadcaster profiles", async () => {
    requests
      .mockResolvedValueOnce(
        Response.json({
          data: [
            wireStream,
            { ...wireStream, id: "stream-2", user_id: "user-2" },
            { ...wireStream, id: "stream-3" },
          ],
          pagination: { cursor: "opaque+/=cursor" },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: [
            { id: "user-1", profile_image_url: "https://example.com/one.png" },
            { id: "user-2", profile_image_url: "https://example.com/two.png" },
          ],
        }),
      )
      .mockResolvedValueOnce(Response.json({ data: [], pagination: {} }))
    const service = makeService()
    const first = await service[endpoint]({ first: 20 })
    const second = await service[endpoint]({ after: first.cursor, first: 20 })
    const path = endpoint === "live" ? "streams" : "streams/followed"
    const identity = endpoint === "live" ? "" : "&user_id=viewer-id"
    expect(sentRequests().map((request) => [request.method, request.url])).toEqual([
      ["GET", `https://api.twitch.tv/helix/${path}?first=20${identity}`],
      ["GET", "https://api.twitch.tv/helix/users?id=user-1&id=user-2"],
      [
        "GET",
        `https://api.twitch.tv/helix/${path}?after=opaque%2B%2F%3Dcursor&first=20${identity}`,
      ],
    ])
    expect(first.cursor).toBe("opaque+/=cursor")
    expect(first.items.map((stream) => stream.profileImageUrl)).toEqual([
      "https://example.com/one.png",
      "https://example.com/two.png",
      "https://example.com/one.png",
    ])
    expect(second).toEqual({ cursor: undefined, items: [] })
    expect(
      sentRequests().every(
        (request) => request.headers.get("Authorization") === "Bearer existing-user-token",
      ),
    ).toBe(true)
  })
})

describe("Twitch followed channels directory", () => {
  it("preserves mixed live and offline follows with exactly one follows, streams and users request", async () => {
    requests
      .mockResolvedValueOnce(
        Response.json({ data: wireFollows, pagination: { cursor: "opaque+/=cursor" } }),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: [{ ...wireStream, id: "stream-3", user_id: "user-3" }, wireStream],
          pagination: {},
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: [
            { id: "user-1", profile_image_url: "https://example.com/one.png" },
            { id: "user-3", profile_image_url: "https://example.com/three.png" },
            { id: "user-2", profile_image_url: "https://example.com/two.png" },
          ],
        }),
      )

    const page = await makeService().followedChannels({})

    expect(requests).toHaveBeenCalledTimes(3)
    expect(sentRequests().map((request) => [request.method, request.url])).toEqual([
      ["GET", "https://api.twitch.tv/helix/channels/followed?first=20&user_id=viewer-id"],
      [
        "GET",
        "https://api.twitch.tv/helix/streams?first=100&user_id=user-2&user_id=user-1&user_id=user-3",
      ],
      ["GET", "https://api.twitch.tv/helix/users?id=user-2&id=user-1&id=user-3"],
    ])
    expect(
      sentRequests().every(
        (request) =>
          request.headers.get("Authorization") === "Bearer existing-user-token" &&
          request.headers.get("Client-Id") === "abcdefghijklmnopqrstuvwxyz1234",
      ),
    ).toBe(true)
    expect(PageSchema(FollowedChannelCardSchema).parse(page)).toEqual({
      cursor: "opaque+/=cursor",
      items: [
        {
          displayName: "Player2",
          id: "user-2",
          isLive: false,
          login: "player2",
          profileImageUrl: "https://example.com/two.png",
        },
        {
          displayName: "Player1",
          id: "user-1",
          isLive: true,
          login: "player1",
          profileImageUrl: "https://example.com/one.png",
        },
        {
          displayName: "Player3",
          id: "user-3",
          isLive: true,
          login: "player3",
          profileImageUrl: "https://example.com/three.png",
        },
      ],
    })
  })

  it("forwards the exact returned cursor with the authenticated user on later pages", async () => {
    requests
      .mockResolvedValueOnce(
        Response.json({ data: wireFollows, pagination: { cursor: "opaque+/=cursor" } }),
      )
      .mockResolvedValueOnce(Response.json({ data: [], pagination: {} }))
      .mockResolvedValueOnce(Response.json({ data: [] }))
      .mockResolvedValueOnce(Response.json({ data: [], pagination: {} }))
    const service = makeService()
    const first = await service.followedChannels({ first: 20 })
    const second = await service.followedChannels({ after: first.cursor, first: 20 })

    expect(requests).toHaveBeenCalledTimes(4)
    expect(first.cursor).toBe("opaque+/=cursor")
    expect(first.items.map((channel) => channel.isLive)).toEqual([false, false, false])
    expect(sentRequests()[3]?.url).toBe(
      "https://api.twitch.tv/helix/channels/followed?after=opaque%2B%2F%3Dcursor&first=20&user_id=viewer-id",
    )
    expect(second).toEqual({ cursor: undefined, items: [] })
  })

  it("does not enrich an empty followed channels page", async () => {
    requests.mockResolvedValueOnce(Response.json({ data: [], pagination: {} }))

    await expect(makeService().followedChannels({ first: 20 })).resolves.toEqual({
      cursor: undefined,
      items: [],
    })
    expect(requests).toHaveBeenCalledTimes(1)
    expect(sentRequests()[0]?.url).toBe(
      "https://api.twitch.tv/helix/channels/followed?first=20&user_id=viewer-id",
    )
  })

  it("rejects the page when the batched streams lookup rejects", async () => {
    const failure = new Error("Streams unavailable")
    requests
      .mockResolvedValueOnce(Response.json({ data: wireFollows, pagination: {} }))
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(Response.json({ data: [] }))

    await expect(makeService().followedChannels({})).rejects.toBe(failure)
    expect(requests).toHaveBeenCalledTimes(3)
  })

  it("rejects the page when Twitch returns an unsuccessful streams status", async () => {
    requests
      .mockResolvedValueOnce(Response.json({ data: wireFollows, pagination: {} }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ data: [] }))

    await expect(makeService().followedChannels({})).rejects.toBeInstanceOf(ConfigurationError)
    expect(requests).toHaveBeenCalledTimes(3)
  })

  it("rejects malformed streams data instead of publishing offline false negatives", async () => {
    requests
      .mockResolvedValueOnce(Response.json({ data: wireFollows, pagination: {} }))
      .mockResolvedValueOnce(Response.json({ data: [{ user_id: "user-1" }], pagination: {} }))
      .mockResolvedValueOnce(Response.json({ data: [] }))

    await expect(makeService().followedChannels({})).rejects.toBeInstanceOf(z.ZodError)
    expect(requests).toHaveBeenCalledTimes(3)
  })

  it.each(["rejected", "incomplete"] as const)(
    "retains every broadcaster and live status when the users lookup is %s",
    async (lookup) => {
      requests
        .mockResolvedValueOnce(Response.json({ data: wireFollows, pagination: {} }))
        .mockResolvedValueOnce(Response.json({ data: [wireStream], pagination: {} }))
      if (lookup === "rejected") {
        requests.mockRejectedValueOnce(new Error("Profiles unavailable"))
      } else {
        requests.mockResolvedValueOnce(
          Response.json({
            data: [{ id: "user-1", profile_image_url: "https://example.com/one.png" }],
          }),
        )
      }

      const page = PageSchema(FollowedChannelCardSchema).parse(
        await makeService().followedChannels({}),
      )

      expect(requests).toHaveBeenCalledTimes(3)
      expect(page.items.map((channel) => [channel.id, channel.isLive])).toEqual([
        ["user-2", false],
        ["user-1", true],
        ["user-3", false],
      ])
      expect(page.items.map((channel) => channel.profileImageUrl)).toEqual([
        undefined,
        lookup === "incomplete" ? "https://example.com/one.png" : undefined,
        undefined,
      ])
    },
  )

  it("rejects invalid directory pagination before requesting Twitch", async () => {
    await expect(makeService().followedChannels({ first: 101 })).rejects.toBeInstanceOf(z.ZodError)
    expect(requests).not.toHaveBeenCalled()
  })
})

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
