import { readFile } from "node:fs/promises"
import { join } from "node:path"
import type { Controller } from "../support/fixtures"
import { expect, test } from "../support/fixtures"
import { flowTest } from "../support/ledger-test"

const FAVOURITES_LIMIT_MESSAGE =
  "You can save up to 50 favourite channels. Remove one on Home before saving another. Escape returns to Home."
const FAVOURITES_READ_ERROR =
  "Error invoking remote method 'favourites:list': SyntaxError: Expected property name or '}' in JSON at position 1 (line 1 column 2)"

const fiftyFavourites = Array.from({ length: 50 }, (_, index) => ({
  login: `seed${String(index).padStart(2, "0")}`,
}))

// Home -> Search: ArrowDown from nav-home crosses nav-following before reaching nav-search.
const openSearch = async (controller: Controller): Promise<void> => {
  await controller.waitForFocus("nav-home")
  await controller.press("ArrowDown", 2)
  await controller.waitForFocus("nav-search")
  await controller.press("Enter")
  await controller.waitForFocus("search-input")
}

// On-screen keyboard entry of the single character "q", then submit through the Search button.
const searchForQ = async (controller: Controller): Promise<void> => {
  await controller.press("ArrowDown")
  await controller.waitForFocus("search-key-q")
  await controller.press("Enter")
  await controller.press("ArrowUp")
  await controller.waitForFocus("search-input")
  await controller.press("ArrowRight")
  await controller.waitForFocus("search-submit")
  await controller.press("Enter")
}

test.describe("cycle-16 guest save favourite then open from Home", () => {
  flowTest("F-cycle-16-1", async ({ controller, window }) => {
    await openSearch(controller)
    await searchForQ(controller)
    await window.waitForSelector('[data-focus-id="channel-direct-q"]')

    await controller.press("ArrowDown")
    await controller.waitForFocus("channel-direct-q")
    await controller.press("ArrowRight")
    await controller.waitForFocus("channel-direct-q-save")
    await controller.press("Enter")

    await expect(window.locator('[data-focus-id="channel-direct-q-save"]')).toHaveText(
      "Saved favourite",
    )

    await controller.press("Escape")
    await controller.waitForFocus("nav-home")
    await window.waitForSelector('[data-focus-id="favourite-q-open"]')
    await expect(window.locator("#favourite-heading")).toHaveText("Favourite channels")

    await controller.press("ArrowRight")
    await controller.waitForFocus("favourite-q-open")
    await controller.press("Enter")

    await controller.waitForFocus("player-back")
    await expect(window.locator(".player-view")).toBeVisible()
    await expect(window.locator('[data-focus-id="player-back"]')).toBeVisible()
    await expect(window.locator('[data-focus-id="home-sign-in"]')).toHaveCount(0)
    await expect(window.locator('[data-focus-id="search-input"]')).toHaveCount(0)
  })
})

test.describe("cycle-16 remove middle and last favourite with focus rescue", () => {
  test.use({
    seed: { favourites: [{ login: "alpha" }, { login: "bravo" }, { login: "charlie" }] },
  })

  flowTest("F-cycle-16-2", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.waitForFocus("favourite-alpha-open")
    await controller.press("ArrowRight")
    await controller.waitForFocus("favourite-bravo-open")

    await controller.press("ArrowDown")
    await controller.waitForFocus("favourite-bravo-remove")
    await controller.press("Enter")
    await controller.waitForFocus("favourite-charlie-open")

    await controller.press("ArrowDown")
    await controller.waitForFocus("favourite-charlie-remove")
    await controller.press("Enter")
    await controller.waitForFocus("favourite-alpha-open")

    await controller.press("ArrowDown")
    await controller.waitForFocus("favourite-alpha-remove")
    await controller.press("Enter")
    await controller.waitForFocus("home-sign-in")

    expect(await controller.focusId()).toBe("home-sign-in")
    await expect(window.locator("#favourite-heading")).toHaveCount(0)
    await expect(window.locator('[data-focus-id^="favourite-"]')).toHaveCount(0)
  })
})

test.describe("cycle-16 limit reached message and no silent eviction", () => {
  test.use({ seed: { favourites: fiftyFavourites } })

  flowTest("F-cycle-16-3", async ({ controller, profileDirectory, window }) => {
    await controller.waitForFocus("nav-home")
    await expect(
      window.locator('[data-focus-id^="favourite-"][data-focus-id$="-open"]'),
    ).toHaveCount(50)

    await openSearch(controller)
    await searchForQ(controller)
    await window.waitForSelector('[data-focus-id="channel-direct-q"]')

    await controller.press("ArrowDown")
    await controller.waitForFocus("channel-direct-q")
    await controller.press("ArrowRight")
    await controller.waitForFocus("channel-direct-q-save")
    await controller.press("Enter")

    await expect(window.locator('[data-focus-id="channel-direct-q-save"]')).toHaveText(
      "Retry save favourite",
    )
    await expect(window.locator(".channel-result-actions [role='alert']")).toHaveText(
      FAVOURITES_LIMIT_MESSAGE,
    )

    await controller.press("Escape")
    await controller.waitForFocus("nav-home")

    await expect(
      window.locator('[data-focus-id^="favourite-"][data-focus-id$="-open"]'),
    ).toHaveCount(50)
    await expect(window.locator('[data-focus-id="favourite-q-open"]')).toHaveCount(0)

    const stored = JSON.parse(
      await readFile(join(profileDirectory, "favourites.json"), "utf8"),
    ) as {
      favourites: readonly { login: string }[]
    }
    expect(stored.favourites).toHaveLength(50)
    expect(stored.favourites.some((entry) => entry.login === "q")).toBe(false)
  })
})

test.describe("cycle-16 search retry focus rescue on favourites read error", () => {
  test.use({ seed: { rawFiles: { "favourites.json": "{bad json" } } })

  flowTest("F-cycle-16-4", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await window.waitForSelector(".favourites__error [role='alert']")
    await expect(window.locator(".favourites__error [role='alert']")).toHaveText(
      FAVOURITES_READ_ERROR,
    )

    await openSearch(controller)
    await searchForQ(controller)
    await expect(window.locator('[data-focus-id="channel-direct-q"]')).toHaveCount(1)

    await controller.press("ArrowDown")
    await controller.waitForFocus("search-favourites-retry")
    await controller.press("Enter")

    await controller.waitForFocus("search-submit")
    await expect(window.locator(".favourites__error [role='alert']")).toHaveText(
      FAVOURITES_READ_ERROR,
    )

    await controller.press("ArrowDown")
    await controller.waitForFocus("search-favourites-retry")
    await controller.press("ArrowDown")
    await controller.waitForFocus("channel-direct-q")
  })
})
