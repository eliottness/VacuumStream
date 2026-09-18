import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("./focus-navigation", () => ({ useControllerNavigation: () => undefined }))
vi.mock("./useAppController", () => ({
  useAppController: () => ({
    auth: { displayName: "streamer", kind: "authenticated", login: "streamer" },
    busy: false,
    categories: [],
    followed: [],
    live: [],
    navigate: () => undefined,
    navigateHome: () => undefined,
    notice: "",
    openChannel: () => undefined,
    openStream: () => undefined,
    screen: { kind: "browse", route: "following" },
    search: async () => undefined,
    searchResults: [],
    setAuth: () => undefined,
    settings: { clientId: "abcdefghijklmnopqrstuvwxyz1234", secureStorage: false },
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
})
