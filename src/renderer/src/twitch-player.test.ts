import { describe, expect, it } from "vitest"
import { createTwitchPlayerOptions } from "./twitch-player"

describe("interactive Twitch player options", () => {
  it("configures a live channel for the local HTTPS parent", () => {
    // Given a live Twitch source
    const source = { channel: "twitch", kind: "live", title: "Live", userId: "1" } as const

    // When interactive player options are created
    const options = createTwitchPlayerOptions(source)

    // Then the official API receives a responsive local-parent configuration
    expect(options).toEqual({
      autoplay: false,
      channel: "twitch",
      height: "100%",
      muted: true,
      parent: ["localhost"],
      width: "100%",
    })
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
