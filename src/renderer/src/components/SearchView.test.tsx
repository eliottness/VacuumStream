import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { SearchView } from "./SearchView"

describe("search guidance", () => {
  it("does not describe an authenticated account as signed out", () => {
    // Given an authenticated account on Search
    // When the search view renders
    const markup = renderToStaticMarkup(
      <SearchView
        authenticated
        busy={false}
        onOpen={() => undefined}
        onSearch={() => undefined}
        results={[]}
      />,
    )

    // Then its guidance reflects full Twitch discovery
    expect(markup).toContain("Search channels and categories across Twitch.")
    expect(markup).not.toContain("Signed-out")
  })
})
