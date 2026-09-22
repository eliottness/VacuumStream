import { describe, expect, it } from "vitest"
import { screenEntryFocusId, shouldNavigateHomeOnBack } from "./screen"

describe("controller back navigation", () => {
  it("returns from Search to Home within the browse shell", () => {
    // Given the Search browse route is active
    const screen = { kind: "browse", route: "search" } as const

    // When the controller emits Back
    const navigatesHome = shouldNavigateHomeOnBack(screen)

    // Then the shell returns to Home instead of retaining a stale route
    expect(navigatesHome).toBe(true)
  })

  it("returns from a category to Home", () => {
    expect(shouldNavigateHomeOnBack({ id: "33214", kind: "category", name: "Fortnite" })).toBe(true)
  })

  it("assigns deterministic focus targets when screens change", () => {
    // Given browse, category, player, and VOD screens
    const screens = [
      { kind: "browse", route: "home" },
      { kind: "browse", route: "search" },
      { followingMode: "all", kind: "browse", route: "following" },
      { id: "33214", kind: "category", name: "Fortnite" },
      { kind: "player", source: { channel: "twitch", kind: "live", title: "Live", userId: "1" } },
      { kind: "videos", userId: "1" },
    ] as const

    // When their entry targets are selected
    const targets = screens.map(screenEntryFocusId)

    // Then each screen has a six-key starting point
    expect(targets).toEqual([
      "nav-home",
      "search-input",
      "following-all",
      "category-back",
      "player-back",
      "videos-back",
    ])
  })
})
