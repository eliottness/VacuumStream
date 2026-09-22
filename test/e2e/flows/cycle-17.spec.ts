import { expect, test } from "../support/fixtures"
import { flowTest } from "../support/ledger-test"

test.describe("cycle-17 empty local shelves preserve guest entry and return", () => {
  test.use({ seed: { bookmarks: [], favourites: [] } })

  flowTest("F-cycle-17-1", async ({ controller }) => {
    await controller.waitForFocus("nav-home")
    const visited = await controller.trace(["ArrowRight", "ArrowDown", "ArrowUp"])

    expect(visited).toEqual(["home-sign-in", "stream-preview-twitch", "home-sign-in"])
  })
})

test.describe("cycle-17 last favourite removal recomputes the live return edge", () => {
  test.use({
    seed: {
      bookmarks: [{ duration: 3600, position: 120, updatedAt: 1, videoId: "2000000001" }],
      favourites: [{ login: "alpha" }],
    },
  })

  flowTest("F-cycle-17-3", async ({ controller }) => {
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.waitForFocus("continue-2000000001-open")
    await controller.press("ArrowDown")
    await controller.waitForFocus("continue-2000000001-forget")
    await controller.press("ArrowDown")
    await controller.waitForFocus("favourite-alpha-open")
    await controller.press("ArrowDown")
    await controller.waitForFocus("favourite-alpha-remove")
    await controller.press("Enter")

    // The removed favourite leaves the shelf; focus recovers to the surviving Continue Open card.
    await controller.waitForFocus("continue-2000000001-open")
    await controller.press("ArrowDown")
    await controller.waitForFocus("continue-2000000001-forget")
    await controller.press("ArrowDown")
    await controller.waitForFocus("stream-preview-twitch")
    await controller.press("ArrowUp")

    await controller.waitForFocus("continue-2000000001-forget")
    expect(await controller.focusId()).toBe("continue-2000000001-forget")
  })
})

test.describe("cycle-17 last bookmark removal recomputes the remaining shelf's upper boundary", () => {
  test.use({
    seed: {
      bookmarks: [{ duration: 3600, position: 120, updatedAt: 1, videoId: "2000000001" }],
      favourites: [{ login: "alpha" }],
    },
  })

  flowTest("F-cycle-17-4", async ({ controller }) => {
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.waitForFocus("continue-2000000001-open")
    await controller.press("ArrowDown")
    await controller.waitForFocus("continue-2000000001-forget")
    await controller.press("Enter")

    // The removed bookmark leaves Continue Watching empty; focus recovers to Favourite Open.
    await controller.waitForFocus("favourite-alpha-open")
    await controller.press("ArrowUp")

    await controller.waitForFocus("nav-home")
    expect(await controller.focusId()).toBe("nav-home")
  })
})

test.describe("cycle-17 both local shelves cross the Quick watch boundary in both directions", () => {
  test.use({
    seed: {
      bookmarks: [{ duration: 3600, position: 120, updatedAt: 1, videoId: "2000000001" }],
      favourites: [{ login: "alpha" }],
    },
    windowSize: { height: 720, width: 1280 },
  })

  // NEEDS-HARDWARE: a real gamepad (or the HTPC) drives this row, mapped to the same named keys
  // exercised elsewhere through `controller`. Desktop CDP keyboard input cannot stand in for it,
  // so this body is the closest reachable approximation and only runs under E2E_GAMEPAD=1.
  flowTest("F-cycle-17-2", async ({ controller, window }) => {
    const crossBoundaryBothWays = async () => {
      await controller.waitForFocus("nav-home")
      const visited = await controller.trace([
        "ArrowRight",
        "ArrowDown",
        "ArrowDown",
        "ArrowDown",
        "ArrowDown",
        "ArrowUp",
        "ArrowUp",
        "ArrowUp",
        "ArrowUp",
      ])

      expect(visited).toEqual([
        "continue-2000000001-open",
        "continue-2000000001-forget",
        "favourite-alpha-open",
        "favourite-alpha-remove",
        "stream-preview-twitch",
        "favourite-alpha-remove",
        "favourite-alpha-open",
        "continue-2000000001-forget",
        "continue-2000000001-open",
      ])
      for (const id of visited) {
        expect(id).not.toBe("BODY")
        expect(id).not.toBe("IFRAME")
      }
      expect(await window.locator("#twitch-player-root iframe").count()).toBe(0)
    }

    // Repeat at 1280x720...
    await crossBoundaryBothWays()

    // ...and at 1920x1080.
    test.use({ windowSize: { height: 1080, width: 1920 } })
    await crossBoundaryBothWays()
  })
})
