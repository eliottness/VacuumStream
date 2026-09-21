import { tmpdir } from "node:os"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { ClientIdSchema, type Page, type StreamCard } from "../shared/contracts"
import { SettingsStore } from "./settings-store"
import { TokenVault } from "./token-vault"
import { TwitchAuth } from "./twitch-auth"
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
