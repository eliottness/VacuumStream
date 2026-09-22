import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("./focus-navigation", () => ({ useControllerNavigation: () => undefined }))
vi.mock("./useAppController", () => ({
  useAppController: () => ({
    auth: { displayName: "streamer", kind: "authenticated", login: "streamer" },
    busy: false,
    categories: [],
    followed: { cursor: undefined, error: "", items: [], operation: "refresh", status: "ready" },
    live: { cursor: undefined, error: "", items: [], operation: "refresh", status: "ready" },
    loadMoreShelf: async () => undefined,
    navigate: () => undefined,
    navigateHome: () => undefined,
    notice: "",
    openChannel: () => undefined,
    openStream: () => undefined,
    refreshShelf: async () => undefined,
    retryShelf: async () => undefined,
    screen: { kind: "browse", route: "following" },
    search: async () => undefined,
    searchResults: [],
    setAuth: () => undefined,
    settings: { clientId: "abcdefghijklmnopqrstuvwxyz1234", secureStorage: false },
    showAllChannels: () => undefined,
    showPastBroadcasts: async () => undefined,
    updateSettings: () => undefined,
    videos: [],
    viewVideo: () => undefined,
  }),
}))

import { App } from "./App"

describe("authenticated app shell", () => {
  it("does not ask a signed-in user to connect Twitch on an empty Following page", () => {
    // Given an authenticated account with no followed channels currently live
    // When the Following page renders
    const markup = renderToStaticMarkup(<App />)

    // Then the empty state reflects channel availability rather than authentication failure
    expect(markup).toContain("No followed channels are live right now.")
    expect(markup).not.toContain("Connect Twitch")
  })

  it("links signed-in Following navigation to Refresh even when the shelf is empty", () => {
    const markup = renderToStaticMarkup(<App />)
    expect(markup).toContain('data-focus-id="following-refresh"')
    expect(markup).toContain('data-focus-down="following-refresh"')
    expect(markup).toContain('data-focus-right="following-refresh"')
    expect(markup).not.toContain('data-focus-id="following-more"')
    expect(markup).not.toContain('data-focus-id="following-retry"')
  })
})
