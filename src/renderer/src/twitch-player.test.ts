import { describe, expect, it } from "vitest"
import { createTwitchPlayerOptions, normalizeTwitchQualities } from "./twitch-player"

describe("Twitch quality normalization", () => {
  it("preserves exact string quality ids without inventing a resolution ladder", () => {
    expect(normalizeTwitchQualities(["auto", "experimental:517p59", "audio_only"])).toEqual([
      { id: "auto", label: "auto" },
      { id: "experimental:517p59", label: "experimental:517p59" },
      { id: "audio_only", label: "audio_only" },
    ])
    expect(normalizeTwitchQualities([])).toEqual([])
  })

  it("normalizes group/name objects alongside strings without rewriting ids or labels", () => {
    expect(
      normalizeTwitchQualities([
        { group: "chunked", name: "Source", size: 999 },
        "auto",
        { group: " unusual-id ", name: "Custom quality" },
      ]),
    ).toEqual([
      { id: "chunked", label: "Source" },
      { id: "auto", label: "auto" },
      { id: " unusual-id ", label: "Custom quality" },
    ])
  })

  it("discards malformed entries and non-array responses", () => {
    expect(
      normalizeTwitchQualities([
        null,
        undefined,
        1080,
        false,
        [],
        "",
        "  ",
        {},
        { group: "chunked" },
        { name: "Source" },
        { group: 1, name: "Source" },
        { group: "chunked", name: 1 },
        { group: " ", name: "Source" },
        { group: "chunked", name: "" },
        { id: "invented", label: "Unsupported shape" },
        "only-valid-entry",
      ]),
    ).toEqual([{ id: "only-valid-entry", label: "only-valid-entry" }])
    for (const invalid of [undefined, null, "auto", {}, { group: "chunked", name: "Source" }]) {
      expect(normalizeTwitchQualities(invalid)).toEqual([])
    }
  })
})

describe("interactive Twitch player options", () => {
  it("configures a live channel for the local HTTPS parent", () => {
    // Given a live Twitch source
    const source = { channel: "twitch", kind: "live", title: "Live", userId: "1" } as const

    // When interactive player options are created
    const options = createTwitchPlayerOptions(source)

    // Then the official API receives a responsive local-parent configuration
    expect(options).toEqual({
      autoplay: true,
      channel: "twitch",
      height: "100%",
      muted: true,
      parent: ["localhost"],
      width: "100%",
    })
  })

  it.each([
    [3900, "1h5m0s"],
    [65.9, "0h1m5s"],
    [7322, "2h2m2s"],
  ])("formats the VOD starting position %s as %s", (position, time) => {
    const source = { kind: "video", title: "VOD", userId: "1", videoId: "42" } as const
    expect(createTwitchPlayerOptions(source, position)).toMatchObject({ time, video: "42" })
  })

  it("omits time for live sources and recordings starting from the beginning", () => {
    const live = { channel: "twitch", kind: "live", title: "Live", userId: "1" } as const
    const video = { kind: "video", title: "VOD", userId: "1", videoId: "42" } as const
    expect(createTwitchPlayerOptions(live, 3900)).not.toHaveProperty("time")
    expect(createTwitchPlayerOptions(video)).not.toHaveProperty("time")
    expect(createTwitchPlayerOptions(video, 0)).not.toHaveProperty("time")
  })

  it("configures a VOD without sending a competing channel", () => {
    // Given a past-broadcast source
    const source = { kind: "video", title: "VOD", userId: "1", videoId: "42" } as const

    // When interactive player options are created
    const options = createTwitchPlayerOptions(source)

    // Then only the documented video selector is included
    expect(options.video).toBe("42")
    expect("channel" in options).toBe(false)
  })
})
