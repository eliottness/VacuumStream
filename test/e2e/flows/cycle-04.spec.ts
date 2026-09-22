import { expect, test } from "../support/fixtures"
import { flowTest } from "../support/ledger-test"

test.describe("cycle-04 guest Home", () => {
  test.use({ seed: {}, windowSize: { height: 1080, width: 1920 } })

  flowTest("F-cycle-04-1", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    const visited = await controller.trace(["ArrowRight", "ArrowDown"])

    expect(visited).toEqual(["home-sign-in", "stream-preview-twitch"])
    await expect(window.getByRole("button", { name: "Refresh" })).toHaveCount(0)
  })
})

test.describe("cycle-04 Home catalog", () => {
  test.use({ seed: {}, windowSize: { height: 1080, width: 1920 } })

  flowTest("F-cycle-04-2", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.press("Enter")
    await controller.waitForFocus("settings-sign-in")
    await controller.press("ArrowRight")
    await controller.press("Enter")

    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.waitForFocus("home-refresh")
    const before = await window
      .locator(".shelf .stream-card")
      .evaluateAll((cards) => cards.map((card) => card.getAttribute("data-focus-id")))
    await controller.press("Enter")
    await window.waitForFunction(() => !document.querySelector('.shelf[aria-busy="true"]'))
    await controller.press("ArrowDown")
    await controller.waitForFocus("home-more")
    await controller.press("Enter")
    await window.waitForFunction(() => !document.querySelector('.shelf[aria-busy="true"]'))

    const after = await window
      .locator(".shelf .stream-card")
      .evaluateAll((cards) => cards.map((card) => card.getAttribute("data-focus-id")))
    expect(new Set(after).size).toBe(after.length)
    expect(after.length).toBeGreaterThanOrEqual(before.length)
    expect(await window.locator('[data-focus-id="home-sign-in"]').count()).toBe(0)
  })
})

test.describe("cycle-04 Following catalog", () => {
  test.use({ seed: {}, windowSize: { height: 1080, width: 1920 } })

  flowTest("F-cycle-04-3", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.press("Enter")
    await controller.waitForFocus("settings-sign-in")
    await controller.press("ArrowRight")
    await controller.press("Enter")

    await controller.waitForFocus("nav-home")
    await controller.press("ArrowDown")
    await controller.press("Enter")
    await controller.waitForFocus("nav-following")
    await controller.press("ArrowRight")
    await controller.waitForFocus("following-refresh")
    await controller.press("Enter")
    await window.waitForFunction(() => !document.querySelector('.shelf[aria-busy="true"]'))
    await controller.press("ArrowDown")
    await window.waitForFunction(() =>
      document.activeElement?.getAttribute("data-focus-id")?.startsWith("stream-"),
    )
    expect(await controller.focusId()).toMatch(/^stream-/)
    await controller.press("ArrowDown")
    await controller.waitForFocus("following-more")
    await controller.press("Enter")
    await window.waitForFunction(() => !document.querySelector('.shelf[aria-busy="true"]'))

    expect(await controller.focusId()).not.toBe("BODY")
    expect(await window.locator(".browse-view h1").textContent()).toBe("Following")
  })
})

test.describe("cycle-04 Home retry", () => {
  test.use({ seed: {}, windowSize: { height: 1080, width: 1920 } })

  flowTest("F-cycle-04-4", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.press("Enter")
    await controller.waitForFocus("settings-sign-in")
    await controller.press("ArrowRight")
    await controller.press("Enter")

    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.waitForFocus("home-refresh")
    const cardsBeforeFailure = await window.locator(".shelf .stream-card").count()
    await controller.press("Enter")
    await window.waitForSelector('.shelf [role="alert"]')
    expect(await window.locator(".shelf .stream-card").count()).toBe(cardsBeforeFailure)
    await controller.press("ArrowRight")
    await controller.waitForFocus("home-retry")
    await controller.press("Enter")
    await window.waitForFunction(() => !document.querySelector('.shelf[aria-busy="true"]'))

    await expect(window.locator('.shelf [role="alert"]')).toHaveCount(0)
    expect(await window.locator('[data-focus-id="home-sign-in"]').count()).toBe(0)
  })
})

test.describe("cycle-04 exhausted Home page", () => {
  test.use({ seed: {}, windowSize: { height: 1080, width: 1920 } })

  flowTest("F-cycle-04-5", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.press("Enter")
    await controller.waitForFocus("settings-sign-in")
    await controller.press("ArrowRight")
    await controller.press("Enter")

    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.waitForFocus("home-refresh")
    await controller.press("ArrowDown")
    await window.waitForFunction(() =>
      document.activeElement?.getAttribute("data-focus-id")?.startsWith("stream-"),
    )
    expect(await controller.focusId()).toMatch(/^stream-/)
    await controller.press("ArrowDown")
    await controller.waitForFocus("home-more")
    await controller.press("Enter")
    await window.waitForFunction(() => !document.querySelector('.shelf[aria-busy="true"]'))

    await expect(window.locator('[data-focus-id="home-more"]')).toHaveCount(0)
    expect(await controller.focusId()).toBe("home-refresh")
  })
})
