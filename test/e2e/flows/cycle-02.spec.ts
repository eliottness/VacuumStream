import { expect, test } from "../support/fixtures"
import { flowTest } from "../support/ledger-test"

test.describe("cycle-02 guest category sign-in route", () => {
  flowTest("F-cycle-02-1", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.waitForFocus("home-sign-in")
    await controller.press("ArrowDown")
    await controller.waitForFocus("stream-preview-twitch")
    await controller.press("ArrowDown")
    await controller.waitForFocus("home-end")
    await controller.press("ArrowDown")
    await window.waitForSelector(".category-card:focus")

    await controller.press("Enter")
    await controller.waitForFocus("nav-settings")

    await expect(window.locator(".settings-panel h1")).toHaveText("Settings")
    await expect(window.locator(".notice")).toHaveText("Sign in to browse live streams by category")

    await controller.press("ArrowRight")
    await controller.waitForFocus("settings-sign-in")
    await expect(window.locator("[data-focus-id='settings-sign-in']")).toBeVisible()
  })
})

test.describe("cycle-02 category stream opens the official player", () => {
  flowTest("F-cycle-02-2", async ({ controller, window }) => {
    await controller.press("F10")
    await controller.press("ArrowRight")
    await controller.waitForFocus("settings-sign-in")
    await controller.press("Enter")
    await window.waitForSelector("[data-focus-id='settings-logout']")

    await controller.press("Escape")
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.waitForFocus("home-refresh")
    await controller.press("ArrowDown", 2)
    await window.waitForSelector(
      "[data-focus-id='home-more']:focus, [data-focus-id='home-end']:focus",
    )
    await controller.press("ArrowDown")
    await window.waitForSelector(".category-card:focus")
    await controller.press("Enter")

    const heading = window.locator(".category-view h1")
    await expect(heading).toBeVisible()
    await controller.press("ArrowDown")
    await window.waitForSelector(".category-view .stream-card:focus")
    await controller.press("Enter")

    await expect(window.locator("#twitch-player-root iframe")).toBeVisible()
    const back = window.locator("[data-focus-id='player-back']")
    await expect(back).toBeVisible()
    await expect(back).toBeInViewport()
  })
})

test.describe("cycle-02 category pagination and filter retention", () => {
  flowTest("F-cycle-02-3", async ({ controller, window }) => {
    await controller.press("F10")
    await controller.press("ArrowRight")
    await controller.waitForFocus("settings-sign-in")
    await controller.press("Enter")
    await window.waitForSelector("[data-focus-id='settings-logout']")

    await controller.press("Escape")
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.waitForFocus("home-refresh")
    await controller.press("ArrowDown", 2)
    await window.waitForSelector(
      "[data-focus-id='home-more']:focus, [data-focus-id='home-end']:focus",
    )
    await controller.press("ArrowDown")
    await window.waitForSelector(".category-card:focus")
    await controller.press("Enter")

    const firstHeading = window.locator(".category-view h1")
    await expect(firstHeading).toBeVisible()
    const firstCategory = await firstHeading.textContent()
    await controller.travelTo("category-more", "ArrowDown", 50)
    if ((await controller.focusId()) === "category-more") {
      await controller.press("Enter")
      await expect(window.locator(".category-view [aria-busy='true']")).toHaveCount(0)
    }
    await expect(firstHeading).toHaveText(firstCategory ?? "")

    const firstStreams = await window
      .locator(".category-view .stream-card")
      .evaluateAll((cards) => cards.map((card) => card.getAttribute("data-focus-id")))
    expect(new Set(firstStreams).size).toBe(firstStreams.length)

    await controller.press("Escape")
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.waitForFocus("home-refresh")
    await controller.press("ArrowDown", 2)
    await window.waitForSelector(
      "[data-focus-id='home-more']:focus, [data-focus-id='home-end']:focus",
    )
    await controller.press("ArrowDown")
    await window.waitForSelector(".category-card:focus")
    await controller.press("ArrowRight")
    await window.waitForSelector(".category-card:focus")
    await controller.press("Enter")

    const secondHeading = window.locator(".category-view h1")
    await expect(secondHeading).toBeVisible()
    const secondCategory = await secondHeading.textContent()
    await controller.travelTo("category-more", "ArrowDown", 50)
    if ((await controller.focusId()) === "category-more") {
      await controller.press("Enter")
      await expect(window.locator(".category-view [aria-busy='true']")).toHaveCount(0)
    }
    await expect(secondHeading).toHaveText(secondCategory ?? "")

    const secondStreams = await window
      .locator(".category-view .stream-card")
      .evaluateAll((cards) => cards.map((card) => card.getAttribute("data-focus-id")))
    expect(new Set(secondStreams).size).toBe(secondStreams.length)
  })
})
